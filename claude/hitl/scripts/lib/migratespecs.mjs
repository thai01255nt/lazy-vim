// v0.5 → v3 spec migration (design v3 §8): `.hitl/planning/<name>.md` (+ `.hitl/tasks/<name>.md`) → change folder
// `.hitl/changes/<name>/` with proposal.md, specs/<cap>/spec.md (delta), design.md, tasks.md and .legacy/planning.md.
// planChange is pure; planMigrateSpecs reads; applyMigrateSpecs writes (never runs git).
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { paths } from "./project.mjs";
import { readJson, readText, writeTextAtomic } from "./fsutil.mjs";
import { HITL_PREFIX } from "./paths.mjs";
import { parsePlanningMd, planningRel } from "./planningmd.mjs";
import { parseTasksMd } from "./tasksmd.mjs";
import { CAP_RE, KEY_RE, allocate, isChangeId, today as todayOf } from "./specids.mjs";

export const SCHEMA = "hitl.migrate-specs/1";
const PLANNING_REL = `${HITL_PREFIX}planning`;
const KW = { must: "SHALL", should: "SHOULD", could: "MAY" };
const LEGACY_SECTIONS_RE = /^(Level \d|Other Components)/;

// ---------------------------------------------------------------- naming (§8.1)
/** Capability derived from a change id: the slug after the type prefix (`feat-user-register` → `user-register`). */
export const deriveCapability = (name) => String(name).split("-").slice(1).join("-");

/** Key derived from a capability: initials of up to 4 words (`user-register` → `UR`); one word → its first 4 letters. */
export function deriveKey(capability) {
  const words = String(capability).split("-").filter(Boolean);
  let k = words.length > 1 ? words.slice(0, 4).map((w) => w[0]).join("") : (words[0] || "").slice(0, 4);
  k = k.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!/^[A-Z]/.test(k)) k = "C" + k;
  if (k.length < 2) k = (k + "X").slice(0, 2);
  return k.slice(0, 5);
}

/** First free variant of `base` (base, base2, base3, …) not in `taken`. */
function freeName(base, taken, sep = "") {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}${sep}${i}`)) return `${base}${sep}${i}`;
}

// ---------------------------------------------------------------- text helpers
/** `## <name>` sections of a markdown text: Map name -> body lines (HTML comment lines dropped). */
export function sectionsOf(text) {
  const out = new Map(); let cur = null; let fenced = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(raw)) fenced = !fenced;
    const m = !fenced && raw.match(/^## (.+?)\s*$/);
    if (m) { cur = m[1]; out.set(cur, []); continue; }
    if (cur !== null && !(!fenced && /^\s*<!--.*-->\s*$/.test(raw))) out.get(cur).push(raw.replace(/\s+$/, ""));
  }
  for (const [k, v] of out) { while (v.length && !v[0].trim()) v.shift(); while (v.length && !v.at(-1).trim()) v.pop(); out.set(k, v); }
  return out;
}

/** Short title: ≤ max chars at a word boundary, trailing punctuation removed. */
export function shortTitle(text, max = 60) {
  const t = String(text || "").replace(/\s+/g, " ").trim().replace(/[.;:,]+$/, "");
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1).replace(/\s+\S*$/, "");
  return (cut || t.slice(0, max - 1)) + "…";
}

/** Requirement statement: `shall` → SHALL/SHOULD/MAY by priority; a statement with no RFC 2119 keyword gets "(KW)". */
export function statementOf(text, priority) {
  const kw = KW[priority] || "SHALL";
  let s = String(text || "").trim();
  if (/\bshall\b/i.test(s)) s = s.replace(/\bshall\b/i, kw);
  return { text: /\b(SHALL|MUST|SHOULD|MAY)\b/.test(s) ? s : `${s.replace(/\.$/, "")} (${kw}).`, keywordAdded: !/\b(SHALL|MUST|SHOULD|MAY)\b/.test(s) };
}

// Given/When/Then split case-insensitively; "And" only when capitalized (a lowercase "and" is prose).
const STEP_RE = /\b([Gg][Ii][Vv][Ee][Nn]|[Ww][Hh][Ee][Nn]|[Tt][Hh][Ee][Nn]|And|AND)\b/g;
/** AC text → GIVEN/WHEN/THEN/AND steps; {steps:[{kw,text}], filled:[kw…]} (filled = WHEN/THEN the AC did not state). */
export function stepsOf(text) {
  const s = String(text || "").trim();
  const parts = []; let last = 0; let kw = null; let m;
  STEP_RE.lastIndex = 0;
  while ((m = STEP_RE.exec(s))) {
    const before = s.slice(last, m.index).trim();
    if (kw) parts.push({ kw, text: before });
    else if (before) parts.push({ kw: null, text: before });
    kw = m[1].toUpperCase();
    last = m.index + m[0].length;
  }
  const tail = s.slice(last).trim();
  if (kw) parts.push({ kw, text: tail }); else if (tail) parts.push({ kw: null, text: tail });
  const steps = [];
  for (const p of parts) {
    if (!p.text) continue;
    if (!p.kw) { if (steps.length) steps.at(-1).text += ` ${p.text}`; else steps.push({ kw: "GIVEN", text: p.text }); continue; }
    steps.push({ kw: p.kw, text: p.text });
  }
  const filled = [];
  if (!steps.some((x) => x.kw === "WHEN")) { const i = steps.findIndex((x) => x.kw === "THEN"); steps.splice(i < 0 ? steps.length : i, 0, { kw: "WHEN", text: "(not stated in the v0.5 acceptance criterion)" }); filled.push("WHEN"); }
  if (!steps.some((x) => x.kw === "THEN")) { steps.push({ kw: "THEN", text: "(not stated in the v0.5 acceptance criterion)" }); filled.push("THEN"); }
  return { steps, filled };
}

const cell = (s) => String(s ?? "").replace(/\|/g, "\\|").trim();
const capTitle = (cap) => { const t = cap.replace(/-/g, " "); return t.charAt(0).toUpperCase() + t.slice(1); };
const demote = (lines) => lines.map((l) => (/^#{2,4} /.test(l) ? "##" + l : l));
const AC_LINE = /^(- \[(?: |x)\] )(T-\d+\.AC\d+)(?: \(([^)]*)\))?( .+)$/;

// ---------------------------------------------------------------- one planning file (pure)
/**
 * planChange(o) -> {files:{rel:text}, ids, scenarios, warnings, capability, key, status, hasTasks}
 * o: {name, planningText, tasksText|null, tasksFile|null, capability, key, newCapability, used:{R:Set}, date}
 */
export function planChange(o) {
  const { name, capability: cap, key, date } = o;
  const dir = `${HITL_PREFIX}changes/${name}`;
  const doc = parsePlanningMd(o.planningText, `${PLANNING_REL}/${name}.md`);
  const secs = sectionsOf(o.planningText);
  const warnings = [];
  const status = doc.status || "draft";
  const tasksDoc = o.tasksText !== null && o.tasksText !== undefined ? parseTasksMd(o.tasksText, o.tasksFile) : null;

  // requirements: R-n → <KEY>-R<n> (n kept unless taken in an existing capability)
  const used = new Set(o.used?.R || []);
  const ids = {};
  for (const r of doc.requirements) {
    const n = Number(r.id.slice(2));
    const nn = used.has(n) ? allocate(used)[0] : n;
    if (nn !== n) warnings.push(`${r.id} → ${key}-R${nn} (${key}-R${n} is taken in ${cap})`);
    used.add(nn);
    ids[r.id] = `${key}-R${nn}`;
  }
  const active = doc.requirements.filter((r) => r.status === "active");
  const activeIds = new Set(active.map((r) => r.id));

  // scenarios from the ACs of the tasks file
  const scenarios = {}; // T-i.ACk -> [scenario ids]
  const scnOf = new Map(active.map((r) => [r.id, []])); // R-n -> [{id, title, steps}]
  const acRefs = {}; // ac id -> new ref list
  for (const t of tasksDoc?.tasks || []) for (const ac of t.acs) {
    if (!(ac.reqs || []).length) continue;
    const refs = [];
    for (const r of ac.reqs) {
      if (!ids[r]) { warnings.push(`${ac.id} references ${r}, which ${name} does not define (kept as is)`); refs.push(r); continue; }
      if (!activeIds.has(r)) { warnings.push(`${ac.id} references ${r} (${doc.requirements.find((x) => x.id === r).status}) → ${ids[r]}, not in the delta`); refs.push(ids[r]); continue; }
      const list = scnOf.get(r);
      const sid = `${ids[r]}.S${list.length + 1}`;
      const st = stepsOf(ac.text);
      if (st.filled.length) warnings.push(`${sid}: ${ac.id} states no ${st.filled.join("/")} — placeholder step added`);
      list.push({ id: sid, title: shortTitle(ac.text), steps: st.steps });
      (scenarios[ac.id] ||= []).push(sid);
      refs.push(sid);
    }
    acRefs[ac.id] = refs;
  }
  for (const r of active) if (!scnOf.get(r.id).length) warnings.push(`${ids[r.id]} has no AC → no scenario (migrated warn)`);

  // delta
  const files = {};
  const goal = (secs.get("Goal") || []).join("\n").trim();
  const retiredReqs = doc.requirements.filter((r) => r.status === "dropped" || r.status === "superseded");
  const hasDelta = active.length > 0;
  if (hasDelta) {
    const L = ["<!-- audience: business -->", `# Delta: ${capTitle(cap)}`, `> capability: ${cap} | key: ${key} | change: ${name}`, ""];
    if (o.newCapability) L.push("## Purpose", goal.split(/\n\s*\n/)[0] || `Behaviour migrated from the v0.5 planning file ${name}.`, "");
    L.push("## ADDED Requirements");
    for (const r of active) {
      const st = statementOf(r.text, r.priority);
      if (st.keywordAdded) warnings.push(`${ids[r.id]}: the statement had no "shall"; added (${KW[r.priority] || "SHALL"}) — reword it`);
      L.push(`### Requirement: ${ids[r.id]} ${shortTitle(r.text)} <!-- migrated -->`, st.text, "");
      for (const s of scnOf.get(r.id)) L.push(`#### Scenario: ${s.id} ${s.title}`, ...s.steps.map((x) => `- ${x.kw} ${x.text}`), "");
    }
    if (retiredReqs.length) {
      L.push("## Retired IDs <!-- migrated -->");
      for (const r of retiredReqs) L.push(`- ${ids[r.id]} ${shortTitle(r.text)} — ${r.status === "superseded" && r.supersededBy ? `superseded by ${ids[r.supersededBy] || r.supersededBy}` : r.status} (migrated from ${PLANNING_REL}/${name}.md)`);
      L.push("");
    }
    files[`${dir}/specs/${cap}/spec.md`] = L.join("\n").replace(/\n+$/, "\n");
  } else warnings.push(`${name} has no active requirement: no spec delta was written; the proposal is draft (write the delta with /hitl:plan ${name})`);

  // proposal
  const title = doc.title || name;
  const reqList = active.map((r) => `+${ids[r.id]}`).join(" ");
  const deferred = doc.requirements.filter((r) => r.status === "deferred");
  const P = ["<!-- audience: business -->", `# ${title}`, `> change: ${name} | status: ${hasDelta ? status : "draft"} | created: ${doc.updated || date} | updated: ${date}`, "",
    "## Why", goal || `Migrated from the v0.5 planning file ${name}.`, "",
    "## What changes", ...(active.length ? active.map((r) => `- ${shortTitle(r.text, 100)}`) : ["- [NEEDS CLARIFICATION: no requirement was recorded in the v0.5 planning file]"]), "",
    "## Capabilities", "| capability | key | change | requirements |", "|---|---|---|---|",
    hasDelta ? `| ${cap} | ${key} | ${o.newCapability ? "new" : "modified"} | ${reqList} |` : "<!-- none yet: write the spec delta -->", ""];
  const oos = secs.get("Out of scope") || [];
  if (oos.length) P.push("## Out of scope", ...oos, "");
  P.push("## Artifacts", "| artifact | decision | why |", "|---|---|---|", "| spec delta | " + (hasDelta ? "included" : "missing") + " | migrated from v0.5 planning |",
    "| design | included | migrated |", `| tasks | ${tasksDoc ? "included" : "missing"} | migrated |`, "");
  if (deferred.length) P.push("## Deferred", ...deferred.map((r) => `- ${r.id} ${r.text}`), "");
  const oq = (secs.get("Open questions") || []).filter((l) => l.trim());
  if (oq.length) P.push("## Open questions", ...oq, "");
  files[`${dir}/proposal.md`] = P.join("\n").replace(/\n+$/, "\n");

  // design
  const D = ["<!-- audience: dev -->", `# Design: ${title}`, `> change: ${name} | status: ${status} | updated: ${date}`, ""];
  const ctx = secs.get("Context & Constraints") || secs.get("Context") || [];
  D.push("## Context", ...(ctx.length ? ctx : ["- (none recorded in v0.5)"]), "");
  D.push("## Decisions", "| id | decision | why | alternatives | cost if wrong | serves | status |", "|----|----------|-----|--------------|---------------|--------|--------|");
  for (const d of doc.decisions) {
    const serves = [];
    for (const r of d.serves || []) {
      if (activeIds.has(r)) serves.push(ids[r]);
      else warnings.push(`${d.id} serves ${r}, which is not active → dropped from serves`);
    }
    const st = d.status === "superseded" && d.supersededBy ? `superseded by ${d.supersededBy}` : d.status;
    D.push(`| ${d.id} | ${cell(d.decision)} | ${cell(d.why)} |  | ${cell(d.cost)} | ${serves.join(", ") || "—"} | ${st} |`);
  }
  D.push("");
  const tree = [...secs.keys()].filter((k) => LEGACY_SECTIONS_RE.test(k));
  D.push("## Components");
  if (tree.length) {
    D.push("### Legacy design tree (v0.5)");
    for (const k of tree) D.push(`#### ${k}`, ...demote(secs.get(k)), "");
  } else D.push("");
  const seams = secs.get("Test seams") || [];
  if (seams.length) D.push("## Test strategy", ...seams, "");
  const risks = secs.get("Risks") || [];
  if (risks.length) D.push("## Risks", ...risks, "");
  D.push("## Changelog", ...doc.changelog.map((c) => `- ${c.date} ${c.text}`), `- ${date} migrated from ${PLANNING_REL}/${name}.md (hitl-index migrate --specs)`, "");
  files[`${dir}/design.md`] = D.join("\n").replace(/\n+$/, "\n");

  // tasks: header `← Change: <id>`, AC refs rewritten
  if (tasksDoc) {
    const lines = o.tasksText.split(/\r?\n/);
    let header = false;
    const out = lines.map((l) => {
      if (/^← Planning: /.test(l)) { header = true; return `← Change: ${name}`; }
      const m = l.match(AC_LINE);
      if (m && acRefs[m[2]]) return `${m[1]}${m[2]} (${acRefs[m[2]].join(", ")})${m[4]}`;
      return l;
    });
    if (!header) { const i = out.findIndex((l) => /^# /.test(l)); out.splice(i < 0 ? 0 : i + 1, 0, `← Change: ${name}`); }
    files[`${dir}/tasks.md`] = out.join("\n");
  }
  files[`${dir}/.legacy/planning.md`] = o.planningText;
  return { files, ids, scenarios, warnings, capability: cap, key, status, hasTasks: !!tasksDoc, tasksDoc };
}

// ---------------------------------------------------------------- whole run (read only)
/** Parse --map: inline JSON or a JSON file path. {name: {capability, key}}. */
export async function readMapArg(root, arg) {
  if (!arg) return {};
  const s = String(arg).trim();
  let text = s.startsWith("{") ? s : await readText(join(root, s), null) ?? await readText(s, null);
  if (text === null) throw Object.assign(new Error(`--map ${arg}: not JSON and no such file`), { usage: true });
  try { const o = JSON.parse(text); if (!o || typeof o !== "object" || Array.isArray(o)) throw new Error("not an object"); return o; }
  catch (e) { throw Object.assign(new Error(`--map: invalid JSON (${e.message})`), { usage: true }); }
}

/**
 * planMigrateSpecs(root, config, {names, map, archiveDone, date}) -> {schema, dryRun, plan[], conflicts[], warnings[], items(private)}.
 * Conflicts (anything → refuse, nothing written): target change dir exists, invalid change id, key/capability collisions with
 * living specs or other changes when given by --map, invalid --map values, a named planning file that does not exist.
 */
export async function planMigrateSpecs(root, config, { names = [], map = {}, archiveDone = false, date = todayOf() } = {}) {
  const P = paths(root);
  const ch = await import("./changes.mjs");
  const living = await ch.readLiving(root);
  const active = await ch.readActiveChanges(root);
  const all = (await fs.readdir(P.planning).catch(() => [])).filter((n) => n.endsWith(".md")).map((n) => n.slice(0, -3)).sort();
  const want = names.length ? names.map((n) => String(n).replace(/^.*\//, "").replace(/\.md$/, "")) : all;
  const out = { schema: SCHEMA, dryRun: true, plan: [], conflicts: [], warnings: [] };
  const conflict = (code, ref, message) => out.conflicts.push({ code, ref, message });
  // keys/capabilities already taken: living + active deltas
  const keyOwner = new Map();
  for (const [cap, l] of living.specs) if (l.doc.key) keyOwner.set(l.doc.key, cap);
  for (const c of active) for (const d of c.deltas) if (d.key && !keyOwner.has(d.key)) keyOwner.set(d.key, d.capability || d.folder);
  const capsTaken = new Set([...living.specs.keys(), ...active.flatMap((c) => c.deltas.map((d) => d.capability || d.folder))]);
  const items = [];
  for (const name of want) {
    if (!all.includes(name)) { conflict("PLANNING_MISSING", name, `${PLANNING_REL}/${name}.md not found`); continue; }
    if (!isChangeId(name)) { conflict("ID_BAD_FORMAT", name, `"${name}" is not a valid change id (<type>-<slug>, ≤ 48 chars); rename the planning file first`); continue; }
    if (await fs.stat(join(P.changes, name)).catch(() => null)) { conflict("CHANGE_EXISTS", name, `${HITL_PREFIX}changes/${name} already exists`); continue; }
    const planningText = await fs.readFile(join(P.planning, `${name}.md`), "utf8");
    const pdoc = parsePlanningMd(planningText, `${PLANNING_REL}/${name}.md`);
    let tasksFile = pdoc.tasksPath ? planningRel(pdoc.tasksPath) : null;
    if (!tasksFile || !(await readText(join(root, tasksFile), null))) tasksFile = `${HITL_PREFIX}tasks/${name}.md`;
    const tasksText = await readText(join(root, tasksFile), null);
    if (tasksText === null) tasksFile = null;
    let cap, key; const m = map[name] || map[`${name}.md`];
    if (m) {
      cap = m.capability; key = m.key;
      if (!CAP_RE.test(String(cap || ""))) { conflict("CAP_BAD_FORMAT", name, `--map ${name}.capability "${cap}" must match ${CAP_RE}`); continue; }
      if (!key && living.specs.get(cap)) key = living.specs.get(cap).doc.key;
      if (!KEY_RE.test(String(key || ""))) { conflict("ID_BAD_FORMAT", name, `--map ${name}.key "${key}" must match ${KEY_RE}`); continue; }
      const owner = keyOwner.get(key);
      if (owner && owner !== cap) { conflict("CAP_KEY_DUP", key, `key ${key} is already used by capability ${owner}`); continue; }
      const lk = living.specs.get(cap)?.doc.key;
      if (lk && lk !== key) { conflict("CAP_KEY_CHANGED", cap, `capability ${cap} has key ${lk}, --map says ${key}`); continue; }
    } else {
      cap = freeName(deriveCapability(name), capsTaken, "-");
      key = freeName(deriveKey(cap), new Set(keyOwner.keys()));
      if (!CAP_RE.test(cap)) { conflict("CAP_BAD_FORMAT", name, `derived capability "${cap}" is invalid; give --map`); continue; }
    }
    keyOwner.set(key, cap); capsTaken.add(cap);
    const newCapability = !living.specs.has(cap);
    const used = { R: new Set() };
    if (!newCapability || active.some((c) => c.deltas.some((d) => (d.capability || d.folder) === cap))) used.R = ch.usedForCapability(living, active, cap).R;
    for (const it of items) if (it.capability === cap) for (const v of Object.values(it.res.ids)) used.R.add(Number(v.split("-R")[1]));
    const res = planChange({ name, planningText, tasksText, tasksFile, capability: cap, key, newCapability, used, date });
    let target = "changes";
    if (archiveDone && res.tasksDoc?.tasks.length) {
      const tc = await ch.taskCounts(root, config, res.tasksDoc);
      if (tc.total && !tc.notDone.length) target = "archive";
      else out.warnings.push(`${name}: not archived (--archive-done) — tasks not done: ${tc.notDone.join(", ")}`);
    }
    const dir = `${HITL_PREFIX}changes/${name}`;
    const moves = [];
    if (tasksFile) moves.push([tasksFile, `${dir}/tasks.md`]);
    moves.push([`${PLANNING_REL}/${name}.md`, `${dir}/.legacy/planning.md`]);
    const creates = Object.keys(res.files).filter((f) => !f.endsWith("/tasks.md") && !f.endsWith("/.legacy/planning.md")).sort();
    out.plan.push({ planning: `${PLANNING_REL}/${name}.md`, change: name, capability: cap, key, target, ids: res.ids, scenarios: res.scenarios, moves, creates });
    out.warnings.push(...res.warnings.map((w) => `${name}: ${w}`));
    items.push({ name, capability: cap, res, tasksFile, target });
  }
  Object.defineProperty(out, "items", { value: items, enumerable: false });
  return out;
}

/** Write the planned change folders, remove the moved v0.5 files, migrate linear.map.json, archive done changes. */
export async function applyMigrateSpecs(root, config, planned, { date = todayOf() } = {}) {
  const P = paths(root);
  const written = []; const archived = [];
  for (const it of planned.items) {
    for (const [rel, text] of Object.entries(it.res.files)) { await writeTextAtomic(join(root, rel), text); written.push(rel); }
    if (it.tasksFile) await fs.rm(join(root, it.tasksFile), { force: true });
    await fs.rm(join(P.planning, `${it.name}.md`), { force: true });
  }
  if (planned.items.length && !((await fs.readdir(P.planning).catch(() => [null])).length)) await fs.rmdir(P.planning).catch(() => {});
  // linear.map.json: planning["<name>.md"] → changes["<name>"] (normalizeMap does the rename on read; write it back)
  const mapFile = join(P.custom, "linear.map.json");
  if (await readJson(mapFile, null)) {
    const { readMap, writeMap } = await import("./linear.mjs");
    await writeMap(root, await readMap(root));
    written.push(`${HITL_PREFIX}linear.map.json`);
  }
  const ch = await import("./changes.mjs");
  ch.resetStatusCache();
  for (const it of planned.items.filter((x) => x.target === "archive")) {
    try {
      const r = await ch.runMerge(root, config, it.name, { archive: true, date });
      archived.push({ change: it.name, ok: r.ok, to: r.archive?.to ?? null, ...(r.ok ? {} : { conflicts: r.conflicts, errors: r.errors || [], preconditions: r.preconditions }) });
    } catch (e) { archived.push({ change: it.name, ok: false, error: String(e.message || e) }); }
  }
  return { written, archived };
}
