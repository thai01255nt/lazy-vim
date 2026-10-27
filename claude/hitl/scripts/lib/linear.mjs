// Linear mirror (design v2 §A.5): desired state per task, plan / record / diff / status. Pure core + small IO loaders.
// No network here, ever: the tickets skill executes the plan through the Linear MCP and hands results back as JSON.
// Optional for every other command: status imports this module dynamically and treats any failure as "no Linear".
import { promises as fsp, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, basename } from "node:path";
import { h } from "./hash.mjs";
import { stableJson, readJson, readText, writeJsonAtomic } from "./fsutil.mjs";
import { deepMerge } from "./config.mjs";
import { HITL_DIR, HITL_PREFIX, HITL_RE } from "./paths.mjs";

export const MAP_SCHEMA = "hitl.linear-map/1";
export const PLAN_SCHEMA = "hitl.tickets-plan/1";
export const QUEUE_SCHEMA = "hitl.linear-queue/1";
export const REMOTE_SCHEMA = "hitl.linear-remote/1";
export const IDENTITY_SCHEMA = "hitl.tickets-identity/1";
export const VERIFY_SCHEMA = "hitl.tickets-verify/1";
export const SERVER_SCHEMA = "hitl.tickets-server/1";
export const LINEAR_MCP_URL = "https://mcp.linear.app/mcp";
export const MAP_REL = `${HITL_PREFIX}linear.map.json`;

/** Must deep-equal config.mjs DEFAULTS.linear (design A.7, interface I3). */
export const LINEAR_DEFAULTS = {
  enabled: false,
  server: null,
  team: null,
  project: null,
  changeAs: null,
  pushTodoAs: "unstarted",
  pushQuick: true,
  titlePrefix: false,
  labels: { risk: true, impl: true, phase: false },
  stateNames: {},
  autoPush: { onTasksApproved: false, onApprove: false, onReview: false },
  reviewComment: true,
  maxCreatePerPush: 50,
};

/** Effective Linear config. `changeAs` (design v3 §5.7) falls back to the legacy alias `planningAs`, then "project";
 *  `planningAs` is kept equal to it for older readers. */
export const linearCfg = (config) => {
  const c = deepMerge(LINEAR_DEFAULTS, (config && config.linear) || {});
  c.changeAs = c.changeAs || c.planningAs || "project";
  c.planningAs = c.changeAs;
  return c;
};

export function linearPaths(root) {
  const custom = join(root, HITL_DIR);
  const index = join(custom, "index");
  return {
    custom, index, inbox: join(custom, ".inbox"),
    map: join(custom, "linear.map.json"), plan: join(index, "linear.plan.json"),
    queue: join(index, "linear.queue.json"), remote: join(index, "linear.remote.json"),
  };
}

const PRIO = { P0: 1, P1: 2, P2: 3, P3: 4 };
const HITL_LABEL = /^(risk|impl|hitl):/;
const taskNum = (id) => Number(/\d+/.exec(id || "")?.[0] ?? 0);
const byTaskId = (a, b) => taskNum(a) - taskNum(b) || String(a).localeCompare(String(b));
const shortFile = (f) => String(f || "").replace(new RegExp(`^${HITL_RE}`), "");

/** Change key of a legacy planning reference: `.hitl/planning/feat-x.md` / `feat-x.md` → `feat-x`. */
export const changeKeyOf = (p) => (!p || p === "none" ? null : basename(String(p)).replace(/\.md$/, ""));

export function emptyMap() {
  return { schema: MAP_SCHEMA, repo: null, workspace: null, team: null, project: null, states: {}, labels: {}, changes: {}, tasks: {}, updatedAt: null };
}
/** Normalized map. v0.5 `planning["feat-x.md"]` entries are read as `changes["feat-x"]` (an existing `changes` entry wins);
 *  the next write stores `changes` only, so no duplicate project is created. */
export function normalizeMap(m) {
  const o = m && typeof m === "object" && !Array.isArray(m) ? m : {};
  const changes = {};
  for (const [k, v] of Object.entries(o.planning || {})) changes[changeKeyOf(k)] = v;
  Object.assign(changes, o.changes || {});
  const tasks = {};
  for (const [T, e] of Object.entries(o.tasks || {})) {
    if (!e || typeof e !== "object" || !("planning" in e)) { tasks[T] = e; continue; }
    const { planning, ...rest } = e;
    tasks[T] = { ...rest, change: rest.change ?? changeKeyOf(planning) };
  }
  const { planning: _legacy, ...base } = o;
  return { ...emptyMap(), ...base, schema: MAP_SCHEMA, states: o.states || {}, labels: o.labels || {}, changes, tasks };
}
export const isConfigured = (map) => !!(map && map.team && map.team.id && map.states && map.states.started && map.states.started.id);

// ---------------------------------------------------------------- identity: server pin, workspace/team check, repo key
/** "owner/name" from a git remote URL (https, ssh, scp-like); null when it does not look like one. Pure. */
export function repoKeyFromRemote(url) {
  const u = String(url || "").trim().replace(/\/+$/, "").replace(/\.git$/, "");
  if (!u) return null;
  const path = /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]+\/?/i, "") : u.replace(/^[^@/]+@[^:/]+:/, "");
  const parts = path.split(/[/:]/).filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join("/").toLowerCase() : parts.length === 1 ? parts[0].toLowerCase() : null;
}
/** Stable repo identity for the issue marker: git origin "owner/name", else the directory name. */
export function repoKey(root) {
  try {
    const r = spawnSync("git", ["remote", "get-url", "origin"], { cwd: root, encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
    const k = r.status === 0 ? repoKeyFromRemote(r.stdout) : null;
    if (k) return k;
  } catch { /* no git */ }
  return slugify(basename(root), 60) || null;
}
/** Linear workspace urlKey from any linear.app URL (https://linear.app/<urlKey>/…). Pure. */
export function urlKeyFromUrl(url) {
  return /^https?:\/\/linear\.app\/([^/?#]+)/i.exec(String(url || ""))?.[1]?.toLowerCase() || null;
}
/** Server name from an MCP tool name `mcp__<server>__<tool>` (server may contain single underscores). Pure. */
export function serverOfTool(name) {
  const m = /^mcp__(.+?)__[^_].*$/.exec(String(name || ""));
  return m ? m[1] : null;
}
const addHint = (s) => `claude mcp add --transport http ${s} ${LINEAR_MCP_URL}, then /mcp to authenticate`;

/**
 * Which Linear MCP server prefix to use. visible: server names (or full tool names) that look like Linear.
 * mode "init" | "run". Pure. action: use | missing | save | pick | legacy | none.
 */
export function pickServer(config, visible, mode = "run") {
  const cfg = linearCfg(config);
  const names = [...new Set((visible || []).map((v) => (String(v).startsWith("mcp__") ? serverOfTool(v) : String(v))).filter(Boolean))].sort();
  const pinned = typeof cfg.server === "string" && cfg.server ? cfg.server : null;
  const base = { schema: SERVER_SCHEMA, mode, pinned, visible: names, server: null, candidates: [], action: "none", message: "" };
  if (pinned) {
    if (names.includes(pinned)) return { ...base, server: pinned, action: "use", message: `using pinned Linear server ${pinned}` };
    return { ...base, server: pinned, action: "missing",
      message: `pinned Linear MCP server "${pinned}" is not available${names.length ? ` (visible: ${names.join(", ")})` : ""} — add it: ${addHint(pinned)}; or re-pin: /hitl:tickets init` };
  }
  if (!names.length) return { ...base, action: "none", message: `Linear MCP not found — ${addHint("linear-server")}` };
  if (mode === "init") {
    if (names.length === 1) return { ...base, server: names[0], action: "save", message: `only one Linear server (${names[0]}): pin it with hitl-index init --set linear.server=${names[0]}` };
    return { ...base, candidates: names, action: "pick", message: `${names.length} Linear servers visible: pick one (one OAuth per workspace)` };
  }
  return { ...base, candidates: names, server: names.length === 1 ? names[0] : null, action: "legacy",
    message: `linear.server is not pinned: use the server whose teams contain the mapped team id · 💡 pin it: /hitl:tickets init (or hitl-index init --set linear.server=<name>)` };
}

/**
 * Compare the identity the skill observed through the MCP with linear.map.json (+ config.linear.server/project). Pure.
 * observed: {schema:"hitl.tickets-identity/1", server, workspace:{urlKey|url}|null, team:{id,key}, project?:{id}|null}
 * Returns {result, map}: map is a changed copy when something was learned (legacy null workspace, renamed team key), else null.
 */
export function verifyIdentity({ config, map: map0, observed }) {
  if (!observed || typeof observed !== "object" || observed.schema !== IDENTITY_SCHEMA) throw err1(`input schema must be ${IDENTITY_SCHEMA}`);
  const cfg = linearCfg(config);
  const map = normalizeMap(structuredClone(map0 || emptyMap()));
  const result = { schema: VERIFY_SCHEMA, ok: true, status: "match", expected: {}, observed: {}, mismatches: [], warnings: [], learned: [], fix: [] };
  if (!isConfigured(map)) { result.status = "unconfigured"; result.warnings.push("run /hitl:tickets init"); return { result, map: null }; }
  const oWs = observed.workspace ? (observed.workspace.urlKey ? String(observed.workspace.urlKey).toLowerCase() : urlKeyFromUrl(observed.workspace.url)) : null;
  const eWs = map.workspace?.urlKey ? String(map.workspace.urlKey).toLowerCase() : null;
  const oTeam = observed.team || {};
  result.expected = { server: cfg.server || null, workspace: eWs, team: { id: map.team.id, key: map.team.key }, project: projectRef(cfg)?.id || null };
  result.observed = { server: observed.server || null, workspace: oWs, team: { id: oTeam.id || null, key: oTeam.key || null }, project: observed.project?.id || null };
  const mis = (field, expected, obs) => result.mismatches.push({ field, expected, observed: obs });
  if (cfg.server && observed.server && observed.server !== cfg.server) mis("server", cfg.server, observed.server);
  if (eWs && oWs && eWs !== oWs) mis("workspace", eWs, oWs);
  if (!oTeam.id) mis("team.id", map.team.id, null);
  else if (oTeam.id !== map.team.id) mis("team.id", map.team.id, oTeam.id);
  const pid = projectRef(cfg)?.id;
  if (pid && observed.project !== undefined && observed.project !== null && observed.project.id !== pid) mis("project", pid, observed.project.id || null);
  if (pid && observed.project === null) mis("project", pid, null);
  let changed = false;
  if (result.mismatches.length) {
    result.ok = false; result.status = "mismatch";
    result.fix.push("wrong MCP server/workspace? pin the right one: hitl-index init --set linear.server=<name> (or /hitl:tickets init)");
    result.fix.push("the repo really moved to another workspace/team? /hitl:tickets init --relink");
    return { result, map: null };
  }
  if (!eWs && oWs) { map.workspace = { ...(map.workspace || {}), urlKey: oWs }; result.learned.push(`workspace ${oWs}`); changed = true; result.status = "learned"; }
  else if (!oWs) result.warnings.push(eWs ? `workspace not observed (expected ${eWs}); team id matched` : "workspace unknown (map and MCP); team id matched");
  if (oTeam.key && oTeam.key !== map.team.key) { result.warnings.push(`team key renamed in Linear: ${map.team.key} → ${oTeam.key}`); map.team = { ...map.team, key: oTeam.key }; result.learned.push(`team key ${oTeam.key}`); changed = true; }
  return { result, map: changed ? map : null };
}

/** config.linear.project → {id, name} when resolved, {unresolved: <string>} when only a name/URL, else null. Pure. */
export function projectRef(cfg) {
  const p = cfg && cfg.project;
  if (!p) return null;
  if (typeof p === "object" && p.id) return { id: String(p.id), name: p.name || null, url: p.url || null };
  return { id: null, unresolved: typeof p === "string" ? p : JSON.stringify(p) };
}

export function slugify(s, max = 40) {
  return String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, max).replace(/-+$/, "");
}
export function fallbackBranch(teamKey, issue, title) {
  const n = /-(\d+)$/.exec(issue || "")?.[1] || "";
  return [String(teamKey || "").toLowerCase(), n, slugify(title)].filter(Boolean).join("-");
}

// ---------------------------------------------------------------- desired state (A.5.4)
export function stateTypeFor(status, cfg, map) {
  const st = (map && map.states) || {};
  let t;
  if (status === "done") t = "completed";
  else if (["green", "review", "verified"].includes(status)) t = "review";
  else if (["skeleton", "approved", "red", "wip"].includes(status)) t = "started";
  else t = cfg.pushTodoAs === "backlog" ? "backlog" : "unstarted";
  if (t === "backlog" && !st.backlog) t = "unstarted";
  if (t === "review" && !st.review) t = "started";
  return t;
}

export function describeTask(task, changeKey, repo = null) {
  const acs = (task.acs || []).map((a) => {
    const reqs = Array.isArray(a.reqs) && a.reqs.length ? ` (${a.reqs.join(", ")})` : "";
    return `- [${a.done ? "x" : " "}] ${a.id}${reqs} ${a.text}`;
  });
  const risk = task.risk ? `${task.risk}${(task.riskReasons || []).length ? ` (${task.riskReasons.join(", ")})` : ""}` : "?";
  return [
    `<!-- hitl:task=${task.id}${repo ? ` repo=${repo}` : ""} file=${task.file} -->`,
    `**Why**: ${task.why || "—"}`,
    "",
    "### Acceptance criteria",
    ...(acs.length ? acs : ["- (none)"]),
    "",
    `risk: ${risk} · impl: ${task.impl || "?"} · prio: ${task.prio || "?"} · change: ${changeKey || "none"}`,
    "_Managed by hitl. Edit the tasks file in the repo, not this description._",
  ].join("\n");
}

/** Desired Linear fields for one task. extras: {changeKey (alias planningKey), warnings:Set}. Pure. */
export function desiredForTask(task, statusOfTask, cfg, map, extras = {}) {
  const status = statusOfTask || "todo";
  const title = cfg.titlePrefix ? `${task.id} · ${task.title}` : task.title;
  const description = describeTask(task, extras.changeKey || changeKeyOf(extras.planningKey) || null, extras.repo || map?.repo || null);
  const priority = PRIO[task.prio] ?? 0;
  const stateType = stateTypeFor(status, cfg, map);
  const stateId = map?.states?.[stateType]?.id || null;
  const names = [];
  if (cfg.labels?.risk && task.risk === "high") names.push("risk:high");
  if (cfg.labels?.impl && task.impl) names.push(`impl:${task.impl}`);
  if (cfg.labels?.phase && !["todo", "done"].includes(status)) names.push(`hitl:${status}`);
  const labels = [];
  for (const n of names.sort()) {
    if (map?.labels?.[n]) labels.push(n);
    else if (extras.warnings) extras.warnings.add(`label ${n} has no id (run /hitl:tickets init)`);
  }
  const labelIds = labels.map((n) => map.labels[n]);
  const mapped = (id) => { const e = map?.tasks?.[id]; return !!(e && e.id && !e.removed); };
  const relations = (task.blockedBy || []).filter(mapped).sort(byTaskId);
  const contentHash = h(stableJson({ title, description, priority }));
  return { task: task.id, status, title, description, priority, stateType, stateId, labels, labelIds, relations, contentHash };
}

// ---------------------------------------------------------------- change (or v0.5 planning) → project / parent issue
export function goalOf(text) {
  const lines = String(text || "").split(/\r?\n/);
  const i = lines.findIndex((l) => /^## Goal\s*$/.test(l));
  if (i < 0) return "";
  const out = [];
  for (const l of lines.slice(i + 1)) { if (/^## /.test(l)) break; out.push(l); }
  return out.join("\n").replace(/<!--[\s\S]*?-->/g, "").trim();
}
export function planningTitleOf(text, file) {
  const m = /^# (.+?)(?: - Planning)?\s*$/m.exec(String(text || ""));
  return m ? m[1].trim() : basename(String(file || ""), ".md");
}

/**
 * Desired project / parent issue of a change (design v3 §5.7): title = proposal title; content = `## Why` + `## What changes`
 * + `### Requirements` (ADDED/MODIFIED ids and titles) + `Repo: .hitl/changes/<id>` — all business-readable.
 * info (change): {kind:"change", file, title, why, whatChanges, requirements:[{id,title}]}
 * info (v0.5 planning): {file, title, goal, requirements?:[{id,priority,text,status}], decisions?:[{id,decision,status}]}
 */
export function desiredChange(info, cfg) {
  const as = cfg.changeAs || cfg.planningAs || "project";
  if (!info || as === "none") return null;
  if (info.kind !== "change") return desiredPlanning(info, { ...cfg, planningAs: as });
  const why = String(info.why || "").trim();
  const first = (why.split(/(?<=[.!?])\s+/)[0] || why).replace(/\s+/g, " ").trim();
  const summary = first.length > 255 ? first.slice(0, 254) + "…" : first;
  const parts = [why || "—"];
  if (String(info.whatChanges || "").trim()) parts.push("### What changes\n" + info.whatChanges.trim());
  if ((info.requirements || []).length) parts.push("### Requirements\n" + info.requirements.map((r) => `- ${r.id} ${r.title || ""}`.trimEnd()).join("\n"));
  parts.push(`Repo: ${info.file}`);
  const content = parts.join("\n\n");
  const obj = as === "parent-issue" ? { title: info.title, description: content } : { name: info.title, summary, content };
  return { kind: as, obj, pushedHash: h(stableJson(obj)) };
}

/** v0.5 planning file → project content (Goal, active R-n, accepted D-n). */
export function desiredPlanning(info, cfg) {
  if (!info || cfg.planningAs === "none") return null;
  const goal = info.goal || "";
  const first = (goal.split(/(?<=[.!?])\s+/)[0] || goal).replace(/\s+/g, " ").trim();
  const summary = first.length > 255 ? first.slice(0, 254) + "…" : first;
  const parts = [goal || "—"];
  const reqs = (info.requirements || []).filter((r) => r.status === "active");
  if (reqs.length) parts.push("### Requirements\n" + reqs.map((r) => `- ${r.id} [${r.priority || "must"}] ${r.text}`).join("\n"));
  const decs = (info.decisions || []).filter((d) => d.status === "accepted");
  if (decs.length) parts.push("### Decisions\n" + decs.map((d) => `- ${d.id} ${d.decision}`).join("\n"));
  parts.push(`Repo: ${info.file}`);
  const content = parts.join("\n\n");
  const obj = cfg.planningAs === "parent-issue" ? { title: info.title, description: content } : { name: info.title, summary, content };
  return { kind: cfg.planningAs, obj, pushedHash: h(stableJson(obj)) };
}

// ---------------------------------------------------------------- review comment
export function parseReviewLine(md) {
  const line = String(md || "").split(/\r?\n/).find((l) => /^verdict: /.test(l)) || "";
  const v = /^verdict: (.+?) \|/.exec(line)?.[1] || null;
  const hr = /\| human required: ([^|]+?)\s*(?:\||$)/.exec(line)?.[1] || null;
  const head = /\| head: (\S+)/.exec(line)?.[1] || null;
  return { verdict: v, humanRequired: hr, head };
}
export function reviewBody(T, review) {
  const r = review || {};
  const report = r.report || `${HITL_PREFIX}reviews/${T}.review.md`;
  return `hitl review: ${r.verdict || "?"} · human required: ${r.humanRequired ?? "?"} · head: ${r.head || "?"} · report: ${shortFile(report)}`;
}

// ---------------------------------------------------------------- shared per-task evaluation
function taskRows(I, cfg) {
  const rows = [];
  for (const doc of I.docs || []) {
    const changeKey = doc.change || changeKeyOf(doc.planning);
    const quick = !changeKey;
    for (const t of doc.tasks || []) {
      let skip = null;
      if (doc.status !== "approved") skip = "tasks file draft";
      else if (quick && !cfg.pushQuick) skip = "quick task (pushQuick off)";
      rows.push({ task: { ...t, file: t.file || doc.file }, doc, changeKey, quick, skip, status: I.statuses?.tasks?.[t.id]?.status || "todo" });
    }
  }
  return rows;
}

/** What differs between desired and pushed (for status/summary). Returns [] when synced. */
function diffReasons(d, entry, map) {
  const p = entry.pushed || {};
  const r = [];
  if (p.contentHash !== d.contentHash) r.push("content");
  if (p.priority !== d.priority) r.push(`priority ${p.priority ?? "—"}→${d.priority}`);
  const conflictKept = p.stateConflict && p.stateConflict === d.stateType;
  if (!conflictKept && (p.stateType !== d.stateType || (d.stateId && p.stateId !== d.stateId))) r.push(`state ${p.stateType || "—"}→${d.stateType}`);
  const pl = [...(p.labels || [])].sort().join(","), dl = [...d.labels].sort().join(",");
  if (pl !== dl) r.push("labels");
  return r;
}

// ---------------------------------------------------------------- plan (A.5.5)
/**
 * I: {config, map, docs:[{file,status,change,planning,tasks}], statuses:{tasks}, reviews:{[T]:{verdict,humanRequired,head,report}},
 *     changes:{[change id]: info|null}, plannings (legacy alias, keyed "feat-x.md" or "feat-x"),
 *     scope:{kind:"all"}|{kind:"tasks",ids}|{kind:"file",file}}
 */
export function buildPlan(I) {
  const cfg = linearCfg(I.config);
  const map = normalizeMap(I.map);
  const pref = projectRef(cfg);
  const base = { schema: PLAN_SCHEMA, planId: null, enabled: cfg.enabled === true, configured: isConfigured(map),
    team: map.team ? { key: map.team.key || null, id: map.team.id || null } : null,
    server: cfg.server || null, workspace: map.workspace?.urlKey || null, repo: map.repo || null,
    project: pref && pref.id ? { id: pref.id, name: pref.name } : null, ops: [], skipped: [], warnings: [], counts: {} };
  if (!base.enabled) return base;
  if (!base.configured) { base.warnings.push("run /hitl:tickets init"); return base; }
  if (pref && !pref.id) { base.configured = false; base.warnings.push(`linear.project "${pref.unresolved}" is not resolved to an id — run /hitl:tickets init`); return base; }
  const warnings = new Set();
  if (!cfg.server) warnings.add("linear.server not pinned — 💡 /hitl:tickets init (hitl-index init --set linear.server=<name>)");
  const scope = I.scope || { kind: "all" };
  const all = taskRows(I, cfg);
  const inScope = all.filter((r) => scope.kind === "all" || (scope.kind === "tasks" && scope.ids.includes(r.task.id)) || (scope.kind === "file" && r.doc.file === scope.file));
  const skipped = [];
  const live = [];
  for (const r of inScope) { if (r.skip) skipped.push({ task: r.task.id, reason: r.skip }); else live.push(r); }
  for (const r of live) r.d = desiredForTask(r.task, r.status, cfg, map, { changeKey: r.changeKey, warnings });
  // linear.project pinned: every issue goes into that existing project; changes never become projects
  const changeAs = pref && cfg.changeAs === "project" ? "none" : cfg.changeAs;
  const infoOf = (key) => I.changes?.[key] ?? I.plannings?.[key] ?? I.plannings?.[`${key}.md`] ?? null;

  const ensure = [], creates = [], updates = [], rels = [], notes = [], comments = [], cancels = [];
  // changes (and v0.5 plannings)
  const pkeys = [...new Set(live.map((r) => r.changeKey).filter(Boolean))].sort();
  const ensured = new Set();
  for (const key of pkeys) {
    if (changeAs === "none") break;
    const info = infoOf(key);
    if (!info) { warnings.add(`change ${key} not found; its issues get no ${changeAs}`); continue; }
    const dp = desiredChange(info, { ...cfg, changeAs });
    const entry = map.changes[key];
    if (entry && entry.pushedHash === dp.pushedHash) continue;
    const kind = entry?.kind || dp.kind;
    const op = kind === "parent-issue" ? "ensureParent" : "ensureProject";
    ensured.add(key);
    ensure.push({ op, change: key, payload: { ...dp.obj, teamId: map.team.id, id: entry?.id || null, ...(op === "ensureParent" && pref ? { projectId: pref.id } : {}) }, needsGate: false,
      reason: entry ? `${kind === "parent-issue" ? "parent issue" : "project"} content changed` : `new ${kind === "parent-issue" ? "parent issue" : "project"}`,
      meta: { kind, pushedHash: dp.pushedHash } });
  }
  const anchorOf = (key) => {
    const e = key ? map.changes[key] : null;
    return { projectId: pref ? pref.id : e && e.kind === "project" ? e.id : null, parentId: e && e.kind === "parent-issue" ? e.id : null };
  };

  // creates (unmapped), topological by blocked-by among the created set
  const unmapped = live.filter((r) => !map.tasks[r.task.id]);
  const order = topoOrder(unmapped.map((r) => r.task));
  const byId = new Map(unmapped.map((r) => [r.task.id, r]));
  const firstPush = new Set();
  for (const r of unmapped) if (!Object.values(map.tasks).some((e) => e.tasksFile === r.doc.file)) firstPush.add(r.doc.file);
  const tooMany = unmapped.length > (Number(cfg.maxCreatePerPush) || 50);
  if (tooMany) warnings.add(`${unmapped.length} issues to create > maxCreatePerPush ${cfg.maxCreatePerPush}; every create needs a gate`);
  let deferred = 0;
  for (const id of order) {
    const r = byId.get(id);
    const a = anchorOf(r.changeKey);
    const first = firstPush.has(r.doc.file);
    creates.push({ op: "createIssue", task: id, ...(r.changeKey ? { change: r.changeKey } : {}),
      payload: { title: r.d.title, description: r.d.description, teamId: map.team.id, priority: r.d.priority, stateId: r.d.stateId,
        stateType: r.d.stateType, labelIds: r.d.labelIds, projectId: a.projectId, parentId: a.parentId },
      needsGate: first || tooMany, reason: first ? `first push of ${shortFile(r.doc.file)}` : "new task",
      meta: metaOf(r, ensured.has(r.changeKey) ? r.changeKey : null) });
    if ((r.task.blockedBy || []).length) deferred += r.task.blockedBy.length;
    if (cfg.reviewComment && I.reviews?.[id]) deferred++;
  }

  // updates for mapped tasks
  for (const r of live) {
    const e = map.tasks[r.task.id];
    if (!e) continue;
    const d = r.d, p = e.pushed || {};
    const a = anchorOf(r.changeKey);
    if (e.removed) {
      updates.push({ op: "updateIssue", task: r.task.id, issue: e.issue, id: e.id,
        payload: { fields: { title: d.title, description: d.description, priority: d.priority, stateId: d.stateId, ...(a.projectId ? { projectId: a.projectId } : {}), ...(a.parentId ? { parentId: a.parentId } : {}) },
          labels: { add: d.labelIds, remove: [] }, expect: { stateType: "canceled" } },
        needsGate: true, reason: "re-added after cancel (un-cancel)", meta: { ...metaOf(r, null), uncancel: true } });
      continue;
    }
    const fields = {}, why = [];
    if (p.contentHash !== d.contentHash) { fields.title = d.title; fields.description = d.description; why.push("content"); }
    if (p.priority !== d.priority) { fields.priority = d.priority; why.push(`priority ${p.priority ?? "—"}→${d.priority}`); }
    const conflictKept = p.stateConflict && p.stateConflict === d.stateType;
    const stateChange = !conflictKept && (p.stateType !== d.stateType || (d.stateId && p.stateId !== d.stateId));
    let reopen = null;
    if (stateChange) {
      if (p.stateType === "completed" && d.stateType !== "completed") {
        reopen = { op: "updateIssue", task: r.task.id, issue: e.issue, id: e.id,
          payload: { fields: { stateId: d.stateId }, labels: { add: [], remove: [] }, expect: { stateType: "completed" } },
          needsGate: true, reason: `reopen: Linear completed, hitl ${d.status}`, meta: { ...metaOf(r, null), reopen: true } };
      } else { fields.stateId = d.stateId; why.push(`state ${p.stateType || "—"}→${d.stateType}`); }
    }
    const pushedIds = (p.labels || []).map((n) => map.labels[n]).filter(Boolean);
    const add = d.labelIds.filter((x) => !pushedIds.includes(x)).sort();
    const remove = pushedIds.filter((x) => !d.labelIds.includes(x)).sort();
    if (add.length || remove.length) why.push("labels");
    if (a.projectId && p.projectId !== a.projectId) { fields.projectId = a.projectId; why.push("project"); }
    if (a.parentId && p.parentId !== a.parentId) { fields.parentId = a.parentId; why.push("parent"); }
    if (Object.keys(fields).length || add.length || remove.length) {
      updates.push({ op: "updateIssue", task: r.task.id, issue: e.issue, id: e.id,
        payload: { fields, labels: { add, remove }, expect: { stateType: p.stateType ?? null } }, needsGate: false, reason: why.join(", "), meta: metaOf(r, null) });
    }
    if (reopen) updates.push(reopen);

    // relations
    const want = (r.task.blockedBy || []);
    const have = p.relations || [];
    const addRel = d.relations.filter((b) => !have.includes(b));
    deferred += want.filter((b) => !d.relations.includes(b) && !have.includes(b) && byId.has(b)).length;
    if (addRel.length) rels.push({ op: "addRelations", task: r.task.id, issue: e.issue, id: e.id,
      payload: { blockedBy: addRel.map((b) => ({ task: b, id: map.tasks[b].id, issue: map.tasks[b].issue })) },
      needsGate: false, reason: `blocked-by ${addRel.join(", ")}`, meta: { relations: addRel } });
    const gone = have.filter((b) => !want.includes(b)).sort(byTaskId);
    if (gone.length) {
      const issues = gone.map((b) => map.tasks[b]?.issue || b).join(", ");
      notes.push({ op: "manualNote", task: r.task.id, issue: e.issue,
        payload: { message: `remove relation ${e.issue} blocked by ${issues} by hand (MCP cannot delete relations)` },
        needsGate: false, reason: "relation removed locally", meta: { relations: gone } });
    }
    // review comment
    if (cfg.reviewComment && I.reviews?.[r.task.id]) {
      const body = reviewBody(r.task.id, I.reviews[r.task.id]);
      const prev = e.comments?.review;
      if (!prev || prev.hash !== h(body)) comments.push({ op: "upsertComment", task: r.task.id, issue: e.issue, id: e.id,
        payload: { commentId: prev?.id || null, body, kind: "review" }, needsGate: false, reason: prev ? "review verdict changed" : "review verdict", meta: { hash: h(body) } });
    }
  }

  // cancels: mapped, not in any tasks md (scope all only)
  if (scope.kind === "all") {
    const local = new Set(all.map((r) => r.task.id));
    for (const T of Object.keys(map.tasks).sort(byTaskId)) {
      const e = map.tasks[T];
      if (e.removed || local.has(T)) continue;
      const cid = map.states.canceled?.id;
      if (!cid) { warnings.add(`no canceled state mapped; cannot cancel ${e.issue}`); continue; }
      cancels.push({ op: "cancelIssue", task: T, issue: e.issue, id: e.id, payload: { stateId: cid }, needsGate: true, reason: "task removed from tasks md", meta: {} });
    }
  }

  const ops = [...ensure, ...creates, ...updates, ...rels, ...notes, ...comments, ...cancels].map((o) => {
    const opId = h(o.op + (o.task || o.change || "") + stableJson(o.payload));
    return { opId, ...o };
  });
  const counts = {};
  for (const o of ops) counts[o.op] = (counts[o.op] || 0) + 1;
  return { ...base, planId: h(ops.map((o) => o.opId).join(",")), ops, skipped, warnings: [...warnings].sort(), counts, deferred,
    scope: scope.kind === "all" ? "all" : scope.kind === "file" ? scope.file : scope.ids.join(",") };
}

function metaOf(r, changeRef) {
  return { contentHash: r.d.contentHash, labels: r.d.labels, status: r.d.status, stateType: r.d.stateType, stateId: r.d.stateId,
    title: r.d.title, priority: r.d.priority, tasksFile: r.doc.file, change: r.changeKey, ...(changeRef ? { changeRef } : {}) };
}

/** Blockers first; ties by prio then id. Blockers outside the set are ignored. */
export function topoOrder(tasks) {
  const ids = new Set(tasks.map((t) => t.id));
  const prio = new Map(tasks.map((t) => [t.id, PRIO[t.prio] ?? 9]));
  const deps = new Map(tasks.map((t) => [t.id, new Set((t.blockedBy || []).filter((b) => ids.has(b) && b !== t.id))]));
  const cmp = (a, b) => prio.get(a) - prio.get(b) || byTaskId(a, b);
  const out = [];
  const left = new Set(ids);
  while (left.size) {
    let ready = [...left].filter((id) => [...deps.get(id)].every((b) => !left.has(b))).sort(cmp);
    if (!ready.length) ready = [...left].sort(cmp).slice(0, 1); // cycle: break deterministically
    const id = ready[0];
    out.push(id);
    left.delete(id);
  }
  return out;
}

// ---------------------------------------------------------------- record (A.5.5)
const err1 = (message) => Object.assign(new Error(message), { code: 1 });

/**
 * Pure: returns {map, queue, out}. Throws Error{code:1} on invalid input, Error{code:4, verify} on an identity mismatch
 * (input.identity, or init into another workspace/team without input.relink): nothing is applied or queued then.
 * repo: this repo's key (stored once at init for the issue marker); config: for the identity check.
 */
export function applyRecord({ map: map0, plan, queue: q0, input, now, repo = null, config = null }) {
  if (!input || typeof input !== "object" || input.schema !== "hitl.tickets-results/1") throw err1("input schema must be hitl.tickets-results/1");
  const map = normalizeMap(structuredClone(map0 || emptyMap()));
  const queue = { schema: QUEUE_SCHEMA, items: [...((q0 && Array.isArray(q0.items)) ? q0.items : [])] };
  const out = { schema: "hitl.tickets-record/1", kind: input.kind, applied: 0, failed: 0, queued: 0, replan: false, map: MAP_REL };
  if (input.kind === "init") {
    const it = input.init;
    if (!it || !it.team || !it.team.id || !it.team.key) throw err1("init.team {key,id,name} is required");
    if (!it.states || !it.states.started || !it.states.started.id) throw err1("init.states.started {id,name} is required");
    const ws = it.workspace ? { urlKey: (it.workspace.urlKey || urlKeyFromUrl(it.workspace.url) || null) } : null;
    const oldWs = map.workspace?.urlKey || null, newWs = ws?.urlKey || null;
    const moved = (map.team?.id && map.team.id !== it.team.id) || (oldWs && newWs && oldWs.toLowerCase() !== newWs.toLowerCase());
    if (moved && !input.relink) {
      throw Object.assign(new Error(`map is linked to ${oldWs || "?"}/${map.team.key} (${map.team.id}); init observed ${newWs || "?"}/${it.team.key} (${it.team.id}) — wrong linear.server? To really move this repo: /hitl:tickets init --relink`),
        { code: 4, verify: { expected: { workspace: oldWs, team: { id: map.team.id, key: map.team.key } }, observed: { workspace: newWs, team: { id: it.team.id, key: it.team.key } } } });
    }
    if (moved) { // relink to another workspace/team: old issue/project ids are meaningless there
      out.reset = Object.keys(map.tasks).length;
      map.tasks = {}; map.changes = {}; map.labels = {};
    }
    map.workspace = ws && ws.urlKey ? ws : (moved ? null : map.workspace || null);
    map.repo = map.repo || it.repo || repo || null;
    if ("project" in it) map.project = it.project && it.project.id ? { id: it.project.id, name: it.project.name || null, url: it.project.url || null } : null;
    map.team = { key: it.team.key, id: it.team.id, name: it.team.name || it.team.key };
    const states = {};
    for (const k of ["backlog", "unstarted", "started", "review", "completed", "canceled"]) {
      const s = it.states[k];
      states[k] = s && s.id ? { id: s.id, name: s.name || k } : null;
    }
    map.states = states;
    map.labels = { ...(map.labels || {}), ...(it.labels || {}) };
    map.updatedAt = now;
    out.applied = 1;
    out.queued = queue.items.length;
    return { map, queue, out };
  }
  if (input.kind !== "push") throw err1(`unknown kind ${input.kind}`);
  if (!plan || !plan.planId) throw err1("no plan found; run tickets plan first");
  if (input.planId !== plan.planId) throw err1("plan changed; run tickets plan again");
  out.learned = [];
  if (input.identity) {
    const v = verifyIdentity({ config, map, observed: input.identity });
    if (!v.result.ok) throw Object.assign(new Error(identityMessage(v.result)), { code: 4, verify: v.result });
    if (v.map) { Object.assign(map, { workspace: v.map.workspace, team: v.map.team }); out.learned = v.result.learned; }
  }
  if (plan.project) map.project = { ...(map.project || {}), id: plan.project.id, name: plan.project.name ?? map.project?.name ?? null };
  const ops = new Map((plan.ops || []).map((o) => [o.opId, o]));
  const key = (o) => `${o.op}|${o.task || o.change || changeKeyOf(o.planning) || ""}`;
  const enqueue = (o, error) => {
    const k = key(o);
    const i = queue.items.findIndex((x) => key(x) === k);
    const item = { opId: o.opId, op: o.op, task: o.task || null, change: o.change || null, error: String(error || "unknown").slice(0, 300), queuedAt: now };
    if (i >= 0) queue.items[i] = item; else queue.items.push(item);
  };
  const dequeue = (o) => { queue.items = queue.items.filter((x) => key(x) !== key(o)); };
  if (input.unreachable) {
    for (const o of plan.ops || []) { if (o.op !== "manualNote") { enqueue(o, `unreachable: ${input.unreachable.reason || "unknown"}`); out.failed++; } }
  } else {
    const results = Array.isArray(input.results) ? input.results : [];
    const ensuredIds = {};
    // ensure ops first so createIssue in the same batch can pick up the new project/parent id
    const sorted = [...results].sort((a, b) => rank(ops.get(a.opId)) - rank(ops.get(b.opId)));
    let created = 0;
    for (const res of sorted) {
      const o = ops.get(res && res.opId);
      if (!o) continue; // unknown op id: ignore (stale result)
      if (!res.ok) { enqueue(o, res.error); out.failed++; continue; }
      applyOk(map, o, res, now, ensuredIds);
      dequeue(o);
      out.applied++;
      if (o.op === "createIssue") created++;
    }
    if (plan.scope === "all") { // queue items no longer needed by the current plan are resolved
      const live = new Set((plan.ops || []).map(key));
      queue.items = queue.items.filter((x) => live.has(key(x)));
    }
    out.replan = created > 0 && (plan.deferred || 0) > 0;
  }
  map.updatedAt = now;
  out.queued = queue.items.length;
  return { map, queue, out };
}

const RANK = { ensureProject: 0, ensureParent: 0, createIssue: 1, updateIssue: 2, addRelations: 3, manualNote: 4, upsertComment: 5, cancelIssue: 6 };
const rank = (o) => (o ? RANK[o.op] ?? 9 : 99);

function applyOk(map, o, res, now, ensuredIds) {
  const skipped = new Set(res.skippedFields || []);
  const m = o.meta || {};
  if (o.op === "ensureProject" || o.op === "ensureParent") {
    const ck = o.change || changeKeyOf(o.planning);
    const prev = map.changes[ck] || {};
    const id = res.id || o.payload.id || prev.id;
    map.changes[ck] = { kind: m.kind || (o.op === "ensureParent" ? "parent-issue" : "project"), id, key: res.issue || prev.key || null,
      url: res.url || prev.url || null, pushedHash: m.pushedHash, at: now };
    ensuredIds[ck] = { kind: map.changes[ck].kind, id };
    return;
  }
  if (o.op === "createIssue") {
    const p = o.payload;
    let projectId = res.projectId ?? p.projectId ?? null, parentId = res.parentId ?? p.parentId ?? null;
    const refKey = m.changeRef || changeKeyOf(m.planningRef);
    const ref = refKey && ensuredIds[refKey];
    if (ref && ref.kind === "project" && !projectId) projectId = ref.id;
    if (ref && ref.kind === "parent-issue" && !parentId) parentId = ref.id;
    const stateKept = skipped.has("stateId");
    map.tasks[o.task] = {
      issue: res.issue || null, id: res.id || null, url: res.url || null,
      branch: res.branch || fallbackBranch(map.team?.key, res.issue, m.title || p.title),
      tasksFile: m.tasksFile || null, change: m.change || changeKeyOf(m.planning) || null, removed: false,
      pushed: { contentHash: m.contentHash, descHash: h(res.description ?? p.description), title: p.title, priority: p.priority,
        stateType: stateKept ? null : m.stateType, stateId: stateKept ? null : p.stateId, status: m.status,
        labels: skipped.has("labelIds") ? [] : m.labels || [], relations: [], projectId, parentId, at: now },
      comments: {},
    };
    return;
  }
  const e = map.tasks[o.task];
  if (!e) return;
  e.pushed = e.pushed || {};
  const P = e.pushed;
  if (o.op === "updateIssue") {
    const f = o.payload.fields || {};
    const content = ("title" in f || "description" in f);
    if (content && !skipped.has("title") && !skipped.has("description")) {
      P.contentHash = m.contentHash; P.title = f.title; P.descHash = h(res.description ?? f.description);
    }
    if ("priority" in f && !skipped.has("priority")) P.priority = f.priority;
    if ("stateId" in f) {
      if (skipped.has("stateId")) P.stateConflict = m.stateType;
      else { P.stateType = m.stateType; P.stateId = f.stateId; P.status = m.status; delete P.stateConflict; }
    } else if (P.stateConflict && P.stateConflict !== m.stateType) delete P.stateConflict;
    if (!skipped.has("labelIds") && !skipped.has("labels")) P.labels = m.labels || P.labels || [];
    if ("projectId" in f && !skipped.has("projectId")) P.projectId = f.projectId;
    if ("parentId" in f && !skipped.has("parentId")) P.parentId = f.parentId;
    if (m.uncancel) { e.removed = false; P.relations = P.relations || []; }
    if (res.url) e.url = res.url;
    if (res.branch) e.branch = res.branch;
    P.at = now;
  } else if (o.op === "addRelations") {
    P.relations = [...new Set([...(P.relations || []), ...(m.relations || [])])].sort(byTaskId);
  } else if (o.op === "manualNote") {
    P.relations = (P.relations || []).filter((b) => !(m.relations || []).includes(b));
  } else if (o.op === "upsertComment") {
    e.comments = e.comments || {};
    e.comments.review = { id: res.commentId || o.payload.commentId || null, hash: m.hash };
  } else if (o.op === "cancelIssue") {
    e.removed = true; P.stateType = "canceled"; P.stateId = o.payload.stateId; P.at = now;
  }
}

/** One-line human message for a failed identity check (also used by the CLI). */
export function identityMessage(r) {
  const parts = (r.mismatches || []).map((m) => `${m.field}: expected ${m.expected ?? "—"}, observed ${m.observed ?? "—"}`);
  return `Linear identity mismatch (${parts.join("; ")}) — nothing applied. ${(r.fix || []).join(" · ")}`;
}

// ---------------------------------------------------------------- diff (A.5.5)
const MARKER = /<!-- hitl:task=(T-\d+)\b(?:\s+repo=(\S+))?(?:\s+file=(\S+))?/;
/** {task, repo|null, file|null} from an issue description marker, or null. Pure. */
export function parseMarker(desc) {
  const m = MARKER.exec(String(desc || ""));
  return m ? { task: m[1], repo: m[2] || null, file: m[3] || null } : null;
}

/**
 * Pure. I: {config, map, remote (hitl.tickets-remote/1), statuses, localTasks:[{id,file,change,planning,title}], relink:boolean, repo}
 * Repos sharing a team/project: a marker with another repo= is foreign and ignored; a legacy marker (no repo=) only
 * relinks when its file= equals the local task's file. Mapped issues are always matched by id, never by marker.
 */
export function buildDiff(I) {
  const cfg = linearCfg(I.config);
  const map = normalizeMap(structuredClone(I.map || emptyMap()));
  const R = I.remote;
  if (!R || R.schema !== "hitl.tickets-remote/1" || !Array.isArray(R.issues)) throw err1("input schema must be hitl.tickets-remote/1 with issues[]");
  let learned = [];
  if (R.identity) { // checked before anything is compared or relinked
    const v = verifyIdentity({ config: I.config, map, observed: R.identity });
    if (!v.result.ok) throw Object.assign(new Error(identityMessage(v.result)), { code: 4, verify: v.result });
    if (v.map) { map.workspace = v.map.workspace; map.team = v.map.team; learned = v.result.learned; }
  }
  const items = [], relink = [], remote = {};
  const ours = map.repo || I.repo || null;
  let foreign = 0;
  const byId = new Map(), byIdent = new Map();
  for (const i of R.issues) { if (i && i.id) byId.set(i.id, i); if (i && i.identifier) byIdent.set(i.identifier, i); }
  const local = new Map((I.localTasks || []).map((t) => [t.id, t]));
  const mappedIds = new Set();
  for (const T of Object.keys(map.tasks).sort(byTaskId)) {
    const e = map.tasks[T];
    if (e.id) mappedIds.add(e.id);
    if (e.removed) continue;
    const r = byId.get(e.id) || byIdent.get(e.issue);
    if (!r) {
      if (R.complete === true) items.push({ level: "warn", code: "LINEAR_MISSING", task: T, issue: e.issue, field: null, local: null, remote: null, message: `${e.issue} not found in Linear (deleted or moved team?)` });
      continue;
    }
    remote[T] = { assignee: r.assignee ?? null, cycle: r.cycle ?? null, state: r.state?.name ?? null };
    const p = e.pushed || {};
    if (!p.contentHash) continue; // relinked, not pushed yet
    const drift = (field, l, rv, message) => items.push({ level: "warn", code: "LINEAR_DRIFT", task: T, issue: e.issue, field, local: l, remote: rv, message });
    if (p.title !== undefined && r.title !== undefined && r.title !== p.title) drift("title", p.title, r.title, `title edited in Linear`);
    if (p.descHash && typeof r.description === "string" && h(r.description) !== p.descHash) drift("description", p.descHash, h(r.description), "description edited in Linear (hitl overwrites it on the next content change)");
    if (p.priority !== undefined && r.priority !== undefined && r.priority !== p.priority) drift("priority", p.priority, r.priority, `priority ${p.priority} locally, ${r.priority} in Linear`);
    const status = I.statuses?.tasks?.[T]?.status || p.status || null;
    const rType = r.state?.type || null;
    if (rType === "completed" && status !== "done") {
      items.push({ level: "warn", code: "LINEAR_DONE_EARLY", task: T, issue: e.issue, field: "state", local: status, remote: r.state?.name || rType,
        message: `${e.issue} is completed in Linear but ${T} is ${status} — run /hitl:review ${T}, or reopen in Linear` });
    } else if (p.stateId && r.state?.id && r.state.id !== p.stateId && !(p.stateConflict)) {
      drift("state", p.stateType, r.state.name || rType, `state moved in Linear (${r.state.name || rType})`);
    }
    if (Array.isArray(r.labels)) {
      const rl = r.labels.map((x) => x && x.name).filter((n) => n && HITL_LABEL.test(n)).sort();
      const pl = [...(p.labels || [])].sort();
      if (rl.join(",") !== pl.join(",")) drift("labels", pl, rl, "hitl labels changed in Linear");
    }
  }
  for (const r of R.issues) {
    if (!r || mappedIds.has(r.id)) continue;
    const mk = parseMarker(r.description);
    let T = mk?.task || null;
    if (!T && cfg.titlePrefix) T = /^(T-\d+)\b/.exec(r.title || "")?.[1] || null;
    if (!T) continue;
    if (mk && mk.repo && ours && mk.repo.toLowerCase() !== String(ours).toLowerCase()) { foreign++; continue; } // another repo's T-n
    const e = map.tasks[T];
    if (e && !e.removed && e.id) continue; // mapped to another issue already
    const lt = local.get(T);
    const sameFile = !mk || mk.repo || !mk.file || !lt || !lt.file || mk.file === lt.file;
    items.push({ level: "info", code: "LINEAR_UNMAPPED", task: T, issue: r.identifier, field: null, local: null, remote: null,
      message: sameFile ? `${r.identifier} carries the hitl marker for ${T} but is not mapped (tickets pull --relink)`
        : `${r.identifier} carries a legacy hitl marker for ${T} from ${mk.file} (another repo?) — not relinked` });
    if (lt && sameFile) relink.push({ task: T, issue: r.identifier, id: r.id, url: r.url || null, branch: r.branchName || fallbackBranch(map.team?.key, r.identifier, r.title) });
  }
  const order = { warn: 0, info: 1 };
  // two candidates for one T-n (e.g. two pre-0.5 repos with the same tasks file name): ambiguous → never relink either
  const per = new Map();
  for (const x of relink) per.set(x.task, [...(per.get(x.task) || []), x]);
  const rl = [];
  for (const [T, xs] of per) {
    if (xs.length === 1) { rl.push(xs[0]); continue; }
    items.push({ level: "warn", code: "LINEAR_AMBIGUOUS", task: T, issue: xs.map((x) => x.issue).join(", "), field: null, local: null, remote: null,
      message: `${xs.length} issues carry the hitl marker for ${T} (${xs.map((x) => x.issue).join(", ")}) — not relinked; map it by hand or re-push` });
  }
  rl.sort((a, b) => byTaskId(a.task, b.task));
  items.sort((a, b) => order[a.level] - order[b.level] || a.code.localeCompare(b.code) || byTaskId(a.task, b.task) || String(a.field).localeCompare(String(b.field)));
  const out = { schema: "hitl.tickets-diff/1", items, relink: rl, remote,
    counts: { warn: items.filter((i) => i.level === "warn").length, info: items.filter((i) => i.level === "info").length }, foreign, learned };
  if (I.relink) {
    for (const x of rl) {
      const t = local.get(x.task);
      map.tasks[x.task] = { issue: x.issue, id: x.id, url: x.url, branch: x.branch, tasksFile: t?.file || null,
        change: t?.change || changeKeyOf(t?.planning), removed: false, pushed: {}, comments: {} };
    }
  }
  return { out, map };
}

// ---------------------------------------------------------------- status (A.5.5)
/** Pure. I: {config, map, docs, statuses, queue, branch} */
export function buildStatus(I) {
  const cfg = linearCfg(I.config);
  const map = normalizeMap(I.map);
  const rows = taskRows(I, cfg);
  const tasks = [];
  let mapped = 0, unmapped = 0, outOfSync = 0;
  for (const r of rows) {
    const e = map.tasks[r.task.id];
    const live = e && !e.removed && e.id ? e : null;
    let synced = false, reason = null;
    if (r.skip) reason = r.skip;
    else if (!live) { reason = "not pushed"; unmapped++; }
    else {
      mapped++;
      const d = desiredForTask(r.task, r.status, cfg, map, { changeKey: r.changeKey });
      const why = diffReasons(d, live, map);
      synced = why.length === 0;
      if (!synced) { reason = why.join(", "); outOfSync++; }
    }
    if (r.skip && live) mapped++;
    const prLine = live ? (["verified", "done"].includes(r.status) ? `Fixes ${live.issue}` : `Part of ${live.issue}`) : null;
    const onBranch = live && I.branch ? I.branch.toLowerCase().includes(String(live.issue || "").toLowerCase()) : false;
    tasks.push({ task: r.task.id, title: r.task.title, status: r.status, issue: live?.issue || null, url: live?.url || null, branch: live?.branch || null,
      synced, reason, prLine, onBranch });
  }
  tasks.sort((a, b) => byTaskId(a.task, b.task));
  const pref = projectRef(cfg);
  return { schema: "hitl.tickets-status/1", enabled: cfg.enabled === true, configured: isConfigured(map), team: map.team?.key || cfg.team || null,
    teamId: map.team?.id || null, server: cfg.server || null, workspace: map.workspace?.urlKey || null, repo: map.repo || null,
    project: pref ? (pref.id ? { id: pref.id, name: pref.name } : { id: null, unresolved: pref.unresolved }) : null,
    changeAs: cfg.changeAs, planningAs: cfg.changeAs, autoPush: { ...cfg.autoPush }, tasks, mapped, unmapped, outOfSync,
    queued: Array.isArray(I.queue?.items) ? I.queue.items.length : 0, mapFile: MAP_REL };
}

// ---------------------------------------------------------------- IO
export async function readMap(root) { return normalizeMap(await readJson(linearPaths(root).map, null)); }
export async function readQueue(root) {
  const q = await readJson(linearPaths(root).queue, null);
  return { schema: QUEUE_SCHEMA, items: q && Array.isArray(q.items) ? q.items : [] };
}
export const writeMap = (root, map) => writeJsonAtomic(linearPaths(root).map, normalizeMap(map));

export function currentBranch(root) {
  try {
    const r = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: root, encoding: "utf8", timeout: 2000, stdio: ["ignore", "pipe", "ignore"] });
    return r.status === 0 ? r.stdout.trim() || null : null;
  } catch { return null; }
}

/** Change info for desiredChange (design v3 §5.7): proposal title, Why, What changes, ADDED/MODIFIED requirements.
 *  null when the change is not found. */
export async function loadChangeInfo(root, id) {
  try {
    const ch = await import("./changes.mjs");
    const e = await ch.findChange(root, id);
    if (!e) return null;
    const c = await ch.readChange(root, e);
    const reqs = [];
    for (const d of c.deltas) for (const b of d.blocks) if (b.kind === "requirement" && (b.op === "ADDED" || b.op === "MODIFIED")) reqs.push({ id: b.id, title: b.title });
    return { kind: "change", file: c.dir, title: c.proposal?.title || id, why: c.proposal?.sections?.["Why"] || "",
      whatChanges: c.proposal?.sections?.["What changes"] || "", requirements: reqs };
  } catch { return null; }
}

/** Planning info for desiredPlanning: planningmd.mjs when present (I2), else a local Goal/title fallback. */
export async function loadPlanningInfo(root, rel) {
  const file = rel.includes("/") ? rel : `${HITL_PREFIX}planning/${rel.endsWith(".md") ? rel : rel + ".md"}`;
  const text = await readText(join(root, file), null);
  if (text === null) return null;
  const info = { file, title: planningTitleOf(text, file), goal: goalOf(text), requirements: [], decisions: [] };
  try {
    const m = await import("./planningmd.mjs");
    const doc = m.parsePlanningMd(text, file);
    if (doc) {
      if (doc.title) info.title = doc.title;
      info.requirements = (doc.requirements || []).map((r) => ({ id: r.id, priority: r.priority, text: r.text, status: r.status }));
      info.decisions = (doc.decisions || []).map((d) => ({ id: d.id, decision: d.decision, status: d.status }));
    }
  } catch { /* planningmd not available: Goal text only */ }
  return info;
}

export async function loadReviews(root, state) {
  const out = {};
  for (const [T, rv] of Object.entries(state?.reviews || {}).sort()) {
    const report = rv.report || `${HITL_PREFIX}reviews/${T}.review.md`;
    const md = await readText(join(root, report), "");
    const p = parseReviewLine(md);
    out[T] = { verdict: p.verdict || rv.verdict || null, humanRequired: p.humanRequired, head: p.head, report };
  }
  return out;
}

/** Local inputs for plan/status/diff (no network). reindex: changed files only, like status. */
export async function loadLocal(root, config, { reindex = true } = {}) {
  const { loadApi, readLock } = await import("./lock.mjs");
  const { readState } = await import("./state.mjs");
  const { computeStatuses } = await import("./status.mjs");
  const { readTaskDocs } = await import("./tasksmd.mjs");
  const api = await loadApi();
  if (api && reindex) {
    try {
      const idx = await api.readIndex(root);
      await api.updateIndex(root, null, idx ? { changedOnly: true, budgetMs: 4000 } : { full: true, budgetMs: 10000 });
    } catch { /* stale index is still usable */ }
  }
  const index = (api && (await api.readIndex(root).catch(() => null))) || { symbols: {}, files: {} };
  const lock = await readLock(root);
  const state = await readState(root);
  const docs = await readTaskDocs(root);
  const tasks = docs.flatMap((d) => d.tasks);
  const statuses = computeStatuses(index, lock, state, config, tasks);
  return { docs, tasks, statuses, state };
}

/** Header status per tasks file, read synchronously (cheap; used by ticketsSummary). */
function docsFromTasks(root, tasks) {
  const files = new Map();
  for (const t of tasks || []) {
    if (!t || !t.file) continue;
    if (!files.has(t.file)) {
      let text = "";
      try { text = readFileSync(join(root, t.file), "utf8"); } catch { /* missing */ }
      files.set(t.file, { file: t.file, status: /^> status: (draft|approved)/m.exec(text)?.[1] || null, change: t.change || null, planning: t.planning || null, tasks: [] });
    }
    files.get(t.file).tasks.push(t);
  }
  return [...files.values()];
}

/** Interface I1 (status --json): null when disabled or on any error. */
export async function ticketsSummary(root, config, tasks, statuses) {
  try {
    const cfg = linearCfg(config);
    if (cfg.enabled !== true) return null;
    const map = await readMap(root);
    const queue = await readQueue(root);
    const docs = docsFromTasks(root, tasks);
    const anyMapped = Object.values(map.tasks).some((e) => e && e.id && !e.removed);
    const branch = anyMapped ? currentBranch(root) : null;
    const st = buildStatus({ config, map, docs, statuses, queue, branch });
    const perTask = {};
    for (const t of st.tasks) if (t.issue) perTask[t.task] = { issue: t.issue, url: t.url, branch: t.branch, synced: t.synced, onBranch: t.onBranch };
    return { enabled: st.enabled, configured: st.configured, team: st.team, mapped: st.mapped, unmapped: st.unmapped, outOfSync: st.outOfSync, queued: st.queued, perTask };
  } catch { return null; }
}

export async function removeInboxFile(root, file) {
  const inbox = linearPaths(root).inbox;
  if (file && (file === inbox || file.startsWith(inbox + "/") || file.startsWith(inbox + "\\"))) await fsp.rm(file, { force: true }).catch(() => {});
}
