// 0.21 tasks brief: the review gate of /hitl:tasks lives in a brief file (one per task set), not in chat.
// A change: `.hitl/changes/<id>/tasks-brief.md` + the round snapshot `.tasks-round.json`. A quick file
// `.hitl/tasks/quick-<slug>.md`: `quick-<slug>-brief.md` + `.quick-<slug>-round.json` next to it.
// 0.21.1: the brief is a short list, rewritten each round: the header, `_Changed since Round n:_` / `_Warn:_` lines,
// `## Tasks (N) — in build order` (generated here from tasks.md), `## Needs your eye` (only when there is something;
// `- Override: <AC> …` bullets need their own Y), `## Notes`, `## Approve? (needs its own Y)`.
// The snapshot holds the set as it was when the round was written (per task: a hash and a view); it serves
// `_Changed since Round n:_` (tasks diff), the human's direct edits of tasks.md (read as answers), and the approval:
// `tasks approve` sets `> status: approved` only when the brief's approve question has its own Y and the set equals
// the snapshot. Its `approved` part (per-task hashes of the last approved set) drives the update hold. On an approved
// set, prio, risk and blocked-by (and the task order) are cheap late edits: left out of the hold and of the approval
// comparison (the `loose` hash); the pre-tool hook refuses Claude's own edit that lowers a risk.
import { join } from "node:path";
import { paths } from "./project.mjs";
import { h } from "./hash.mjs";
import { readJson, readText, writeJsonAtomic, writeTextAtomic } from "./fsutil.mjs";
import { HITL_PREFIX } from "./paths.mjs";
import { parseBrief } from "./brief.mjs";
import { DROPPED, hasLockedTaskWork, isTasksDocName, parseTasksMd } from "./tasksmd.mjs";

export const SNAP_SCHEMA = "hitl.tasks-round/1";
/** The code of every refusal of work on a task whose set is not approved (draft header, or held by an open update). */
export const NOT_APPROVED = "TASKS_NOT_APPROVED";
/** Info code: a `none!`/`manual!` row without an override answered Y in a tasks brief. */
export const OVERRIDE_UNRECORDED = "TEST_OVERRIDE_UNRECORDED";
// `- Override: <AC> …` (0.21.1 bullet) or `### Q<n> _Override:_ <AC> …` (0.21.0 question)
const OVERRIDE_Q = /(?:_Override:_|Override:)\s*`?([A-Z]{2,5}-T\d+\.AC\d+)`?/;
const today = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------- targets
/** Target of one quick file name (`quick-<slug>.md` or another `.hitl/tasks/<name>.md`). */
function quickTarget(name, key) {
  const base = name.replace(/\.md$/, "");
  return { kind: "quick", id: key || base, key: key || null, change: null, slug: base.replace(/^quick-/, ""), base,
    tasksFile: `${HITL_PREFIX}tasks/${base}.md`, briefFile: `${HITL_PREFIX}tasks/${base}-brief.md`, snapFile: `${HITL_PREFIX}tasks/.${base}-round.json` };
}
function changeTarget(change, dir, key) {
  return { kind: "change", id: change, key: key || null, change, slug: null, base: null,
    tasksFile: `${dir}/tasks.md`, briefFile: `${dir}/tasks-brief.md`, snapFile: `${dir}/.tasks-round.json` };
}

/**
 * Resolves `/hitl:tasks <arg>`, `hitl-index brief|tasks gate|diff|approve <arg>`: an active change id first, then a
 * quick key (the key registry), then a quick file name (`quick-<slug>`, with or without `.md`). Returns a target
 * {kind: "change"|"quick", id, key, change, slug, tasksFile, briefFile, snapFile} or null.
 */
export async function resolveTasksTarget(root, arg) {
  const a = String(arg || "").trim();
  if (!a) return null;
  const { findChange } = await import("./changes.mjs");
  const { readKeyRegistry } = await import("./keys.mjs");
  const reg = await readKeyRegistry(root);
  const entry = /^[a-z]+-[a-z0-9-]+$/.test(a) && !a.startsWith("quick-") ? await findChange(root, a) : null;
  if (entry && !entry.archived) return changeTarget(entry.id, entry.dir, reg.byChange.get(entry.id));
  if (/^[A-Z]{2,5}$/.test(a)) {
    const q = (reg.byKey.get(a) || []).find((o) => o.quick && /^tasks\//.test(o.source || ""));
    if (q) return quickTarget(q.source.slice("tasks/".length), a);
  }
  const name = a.split("/").pop().replace(/-brief\.md$/, ".md").replace(/\.md$/, "") + ".md";
  if (isTasksDocName(name)) {
    const text = await readText(join(paths(root).tasks, name), null);
    if (text !== null) {
      const doc = parseTasksMd(text, `${HITL_PREFIX}tasks/${name}`);
      if (doc.quick) return quickTarget(name, doc.key);
    }
  }
  return null;
}

/** Every target that has a tasks file: active changes with tasks.md, then quick files. */
export async function tasksTargets(root) {
  const { listChanges } = await import("./changes.mjs");
  const { readKeyRegistry } = await import("./keys.mjs");
  const reg = await readKeyRegistry(root);
  const out = [];
  for (const e of await listChanges(root, { archived: false }).catch(() => [])) {
    if ((await readText(join(root, e.dir, "tasks.md"), null)) !== null) out.push(changeTarget(e.id, e.dir, reg.byChange.get(e.id)));
  }
  const { promises: fs } = await import("node:fs");
  for (const n of (await fs.readdir(paths(root).tasks).catch(() => [])).filter(isTasksDocName).sort()) {
    const text = await readText(join(paths(root).tasks, n), null);
    const doc = text === null ? null : parseTasksMd(text, `${HITL_PREFIX}tasks/${n}`);
    if (doc?.quick && doc.tasks.length) out.push(quickTarget(n, doc.key));
  }
  return out;
}

/** The parsed tasks brief of a target, or null. */
export async function readTasksBrief(root, target) {
  const text = await readText(join(root, target.briefFile), null);
  return text === null ? null : parseBrief(text, target.briefFile);
}

/** The tasks file of a target: {text, doc} or null. */
export async function readTarget(root, target) {
  const text = await readText(join(root, target.tasksFile), null);
  return text === null ? null : { text, doc: parseTasksMd(text, target.tasksFile) };
}

// ---------------------------------------------------------------- the set: per-task hash and view
/** Lines of each `## <id> …` section of a tasks file (Map id → lines). */
export function taskSections(text) {
  const out = new Map(); let cur = null;
  for (const raw of String(text ?? "").replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").split("\n")) {
    const m = /^## ([A-Z]{2,5}-T\d+|T-\d+) /.exec(raw);
    if (m) { cur = []; out.set(m[1], cur); cur.push(raw); continue; }
    if (/^## /.test(raw)) { cur = null; continue; }
    if (cur) cur.push(raw);
  }
  return out;
}

/**
 * Canonical lines of one task: what the human reviews. Tooling-owned parts are left out (the meta `status:` value,
 * `[ ]`/`[x]` boxes, the `**Dropped**:` line `tasks drop` writes) and so is formatting (blank lines, spaces, table
 * padding and separator rows), so a formatter on save or a drop after the Y never counts as a change.
 * `mask`: AC ids whose test-plan rows are left out (an override answered Y in the round being approved).
 */
export function canonTask(lines, taskId, mask = new Set()) {
  const out = [];
  let section = null;
  for (const raw of lines) {
    let l = raw.replace(/\s+$/, "").replace(/\s+/g, " ").trim();
    if (!l) continue;
    if (/^### /.test(l)) section = l.slice(4).toLowerCase();
    if (/^\*\*Dropped\*\*:/.test(l)) continue;
    l = l.replace(/^- \[[ xX]\] /, "- [ ] ").replace(/^(\d+)\. \[[ xX]\] /, "$1. [ ] ").replace(/(^- prio: .*\| status: )[a-z-]+$/, "$1*");
    if (/^\|/.test(l)) {
      const cells = l.replace(/^\||\|$/g, "").split(/(?<!\\)\|/).map((c) => c.trim());
      if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
      if (section === "test plan" && mask.size) {
        const ac = /^AC\d+$/.test(cells[0]) ? `${taskId}.${cells[0]}` : cells[0];
        if (mask.has(ac)) continue;
      }
      l = `| ${cells.join(" | ")} |`;
    }
    out.push(l);
  }
  return out;
}

/** Canonical lines without the cheap late edits of an approved set (prio, risk, blocked-by of the meta line). */
export const looseLines = (lines) => lines.map((l) => (/^- prio: /.test(l) ? l.replace(/^- prio: [^|]*\|/, "- prio: * |").replace(/\| risk: [^|]*\|/, "| risk: * |").replace(/\| blocked-by: [^|]*\|/, "| blocked-by: * |") : l));

const testCell = (r) => (r.legacy ? "new" : `${r.test}${r.override ? "!" : ""}:${r.detail ? ` ${r.detail}` : ""}${r.override && r.test === "manual" && r.reason ? ` — ${r.reason}` : ""}`);

/** View of a parsed task for `_Changed since …_` lines. */
export function taskView(t) {
  return {
    title: t.title, prio: t.prio, risk: `${t.risk}${t.riskReasons?.length ? ` (${t.riskReasons.join(", ")})` : ""}`, impl: t.impl,
    blockedBy: [...(t.blockedBy || [])], dropped: t.status === DROPPED, why: t.why || "",
    acs: Object.fromEntries(t.acs.map((a) => [a.id, `${a.reqs?.length ? `(${a.reqs.join(", ")}) ` : ""}${a.text}`])),
    tests: Object.fromEntries(t.testPlan.map((r) => [/^AC\d+$/.test(r.ac) ? `${t.id}.${r.ac}` : r.ac, testCell(r)])),
    symbols: Object.fromEntries(t.symbols.map((s) => [s.ref, `${s.change} ${s.file} ${s.impl}`])),
  };
}

/** The set of a tasks file: {set (hash), tasks: {T: {hash, loose (hash without prio/risk/blocked-by), view, lines (canonical)}}}. */
export function setOf(text, doc = null, mask = new Set()) {
  const d = doc || parseTasksMd(text, "tasks.md");
  const sec = taskSections(text);
  const tasks = {};
  for (const t of d.tasks) {
    const lines = canonTask(sec.get(t.id) || [], t.id);
    const m = mask.size ? canonTask(lines, t.id, mask) : lines;
    tasks[t.id] = { hash: h(m.join("\n")), loose: h(looseLines(m).join("\n")), view: taskView(t), lines };
  }
  return { set: setHash(tasks), tasks };
}
export const setHash = (tasks) => h(Object.keys(tasks).sort().map((id) => `${id}:${tasks[id].hash ?? tasks[id]}`).join("\n")).slice(0, 12);

const short = (s, n = 50) => (String(s).length > n ? `${String(s).slice(0, n - 1)}…` : String(s));
/** `_Changed since …_` lines between two sets ({T: {hash, view}}): `+ T new` · `- T removed` · `~ T <what>`. */
export function diffSets(before, after) {
  const out = [];
  const A = before || {}, B = after || {};
  for (const id of Object.keys(B).filter((x) => !A[x])) out.push(`+ ${id} new (${short(B[id].view?.title ?? "")})`);
  for (const id of Object.keys(A).filter((x) => !B[x])) out.push(`- ${id} removed`);
  for (const id of Object.keys(B).filter((x) => A[x] && A[x].hash !== B[x].hash)) {
    const a = A[id].view || {}, b = B[id].view || {}, w = [];
    for (const k of ["title", "prio", "risk", "impl"]) if (a[k] !== b[k]) w.push(`${k} ${short(a[k] ?? "—", 30)} → ${short(b[k] ?? "—", 30)}`);
    if (String(a.blockedBy) !== String(b.blockedBy)) w.push(`blocked-by ${a.blockedBy?.join(", ") || "none"} → ${b.blockedBy?.join(", ") || "none"}`);
    if (a.why !== b.why) w.push("why");
    const keyed = (x = {}, y = {}, label) => {
      for (const k of Object.keys(y).filter((k) => !(k in x))) w.push(`+${label(k)}`);
      for (const k of Object.keys(x).filter((k) => !(k in y))) w.push(`-${label(k)}`);
      return Object.keys(y).filter((k) => k in x && x[k] !== y[k]);
    };
    const acName = (k) => k.replace(/^[A-Z]{2,5}-T\d+\./, "");
    for (const k of keyed(a.acs, b.acs, acName)) w.push(`${acName(k)} text`);
    for (const k of Object.keys(b.tests || {}).filter((k) => k in (a.tests || {}) && a.tests[k] !== b.tests[k])) w.push(`${acName(k)} test: ${short(a.tests[k], 30)} → ${short(b.tests[k], 30)}`);
    for (const k of keyed(a.symbols, b.symbols, (s) => `symbol ${s}`)) w.push(`symbol ${k} (${b.symbols[k]})`);
    if (!a.dropped && b.dropped) w.push("dropped");
    out.push(`~ ${id} ${w.length ? w.join("; ") : "text"}`);
  }
  return out;
}

// ---------------------------------------------------------------- snapshot
export const readSnapshot = (root, target) => readJson(join(root, target.snapFile), null);

/** Writes the round snapshot of the target's current set (keeps the `approved` part). */
export async function writeSnapshot(root, target, round, { text = null } = {}) {
  const src = text ?? (await readText(join(root, target.tasksFile), null));
  if (src === null) throw Object.assign(new Error(`${target.tasksFile} not found`), { code: 1 });
  const prev = await readSnapshot(root, target);
  const s = setOf(src, parseTasksMd(src, target.tasksFile));
  const snap = { schema: SNAP_SCHEMA, target: target.id, round, at: today(), set: s.set, tasks: s.tasks, approved: prev?.approved ?? null };
  await writeJsonAtomic(join(root, target.snapFile), snap);
  return snap;
}

// ---------------------------------------------------------------- the generated list (## Tasks (N) — in build order)
/** Dependency depth per task over `blocked-by` inside the set (1 = no open blocker in the set); done tasks: null. */
export function waves(tasks, isDone = () => false) {
  const by = new Map(tasks.map((t) => [t.id, t]));
  const memo = new Map();
  const wave = (id, seen = new Set()) => {
    if (memo.has(id)) return memo.get(id);
    if (seen.has(id)) return 1; // a cycle: tasks --check reports it
    seen.add(id);
    const t = by.get(id);
    const ws = (t?.blockedBy || []).filter((b) => by.has(b) && !isDone(b) && by.get(b).status !== DROPPED).map((b) => wave(b, seen));
    const w = 1 + (ws.length ? Math.max(...ws) : 0);
    memo.set(id, w);
    return w;
  };
  return Object.fromEntries(tasks.map((t) => [t.id, isDone(t.id) ? null : wave(t.id)]));
}

const keyOf = (id) => /^([A-Z]{2,5})-T\d+$/.exec(id)?.[1] ?? null;
const prioN = (t) => Number(/^P(\d)$/.exec(t.prio ?? "")?.[1] ?? 9);
/** Who writes the task: agent · you · you write `a`, `b` (mixed; more than 2 symbols: a count). */
export function ownerText(t) {
  const syms = t.symbols || [];
  if (!syms.length) return t.impl === "manual" ? "you" : t.impl === "mixed" ? "mixed" : "agent";
  const man = syms.filter((s) => s.impl === "manual").map((s) => s.ref);
  if (!man.length) return "agent";
  if (man.length === syms.length) return "you";
  return man.length > 2 ? `you write ${man.length} symbols` : `you write ${man.map((r) => `\`${r}\``).join(", ")}`;
}
const TEST_ORDER = ["new", "covered", "rewrite", "manual", "manual!", "none", "none!"];
/** The test plan in a few words: `2 new tests` (shared rows ride on them) · `manual` / `none` (every row) · `1 new, 2 covered`. */
export function testsText(t) {
  const kinds = (t.testPlan || []).map((r) => (r.legacy ? "new" : `${r.test}${r.override ? "!" : ""}`));
  if (!kinds.length) return "no test plan";
  const c = {};
  for (const k of kinds) c[k] = (c[k] || 0) + 1;
  if (c.new && kinds.every((k) => k === "new" || k === "shared")) return `${c.new} new test${c.new > 1 ? "s" : ""}`;
  if (kinds.every((k) => k === kinds[0])) return kinds[0];
  return [...TEST_ORDER, ...Object.keys(c).filter((k) => !TEST_ORDER.includes(k))].filter((k) => c[k] && k !== "shared").map((k) => `${c[k]} ${k}`).join(", ");
}

/**
 * `## Tasks (N) — in build order` of a tasks brief (`hitl-index tasks gate <id|KEY> --md`), generated from tasks.md and
 * replaced every round: two lines per task, ordered by wave (dependency depth), then prio, then file order; done
 * tasks first, dropped last, each with its marker. Line 1: id, title, `— after T1, T2` (blocked-by; another change's
 * task by its full id). Line 2: prio · risk (bold when high, with reasons) → lane · owner · ACs and tests.
 */
export function renderList(target, doc, { isDone = () => false } = {}) {
  const done = (t) => t.status === "done" || isDone(t.id);
  const live = doc.tasks.filter((t) => t.status !== DROPPED);
  const w = waves(live, (id) => done(live.find((t) => t.id === id) || { id }));
  const rank = (t) => (t.status === DROPPED ? 1e9 : done(t) ? 0 : w[t.id] ?? 1);
  const order = doc.tasks.map((t, i) => ({ t, i })).sort((a, b) => rank(a.t) - rank(b.t) || prioN(a.t) - prioN(b.t) || a.i - b.i).map((x) => x.t);
  const dropped = doc.tasks.length - live.length;
  const L = [`## Tasks (${live.length}${dropped ? ` + ${dropped} dropped` : ""}) — in build order`, ""];
  order.forEach((t, i) => {
    const k = keyOf(t.id);
    const after = (t.blockedBy || []).map((b) => (k && b.startsWith(`${k}-T`) ? b.slice(k.length + 1) : b));
    const mark = t.status === DROPPED ? " · dropped" : done(t) ? " · ✅ done" : "";
    const reasons = t.riskReasons?.length ? ` (${t.riskReasons.join(", ")})` : "";
    const risk = t.risk === "high" ? `risk **high${reasons}**` : t.risk === "low" ? "risk low" : "risk ?";
    const lane = mark ? "" : t.risk === "high" ? " → skeleton review" : t.risk === "low" ? " → fast lane" : "";
    L.push(`${i + 1}. **${t.id}** ${t.title}${after.length ? ` — after ${after.join(", ")}` : ""}${mark}`);
    L.push(`   ${t.prio ?? "P?"} · ${risk}${lane} · ${ownerText(t)} · ${t.acs.length} AC, ${testsText(t)}`);
  });
  return L.join("\n");
}

/** The brief text with its `## Tasks …` section (a 0.21.0 brief: `## Current set`) replaced, or inserted before the
 *  first `## ` after the header, and the `set:` meta updated. */
export function putTasksList(briefText, view, set) {
  const lines = String(briefText).replace(/\r\n?/g, "\n").split("\n");
  // the meta line: `> change: …` / `> quick: …` — set: after kind:
  const mi = lines.findIndex((l) => /^>\s*(?:change|quick)\s*:/.test(l));
  if (mi >= 0) {
    if (/\|\s*set:\s*[^|]*/.test(lines[mi])) lines[mi] = lines[mi].replace(/\|\s*set:\s*[^|]*?(\s*\||\s*$)/, `| set: ${set}$1`);
    else if (/\|\s*kind:\s*tasks\b/.test(lines[mi])) lines[mi] = lines[mi].replace(/(\|\s*kind:\s*tasks)\b/, `$1 | set: ${set}`);
  }
  const start = lines.findIndex((l) => /^## (?:Tasks\b|Current set\b)/.test(l));
  const block = [...view.split("\n"), ""];
  if (start >= 0) {
    let end = start + 1; while (end < lines.length && !/^## /.test(lines[end])) end++;
    lines.splice(start, end - start, ...block);
  } else {
    const first = lines.findIndex((l, i) => i > 0 && /^## /.test(l));
    if (first < 0) lines.push("", ...block); else lines.splice(first, 0, ...block);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}

// ---------------------------------------------------------------- approval
/** The approve question of the brief's last round, or null: `## Approve? (needs its own Y)` (0.21.0: `### Q<n> Approve the task set? …`). */
export function approveQuestion(brief) {
  const last = Math.max(0, ...(brief?.rounds || []).map((r) => r.n));
  const qs = (brief?.questions || []).filter((q) => q.ownY === "approve" && q.round === last);
  return qs.at(-1) || null;
}

/** AC ids of the override questions of a round answered Y (their `!` rows may change after the snapshot). */
export function overridesAnswered(brief, round) {
  return new Set((brief?.questions || []).filter((q) => q.ownY === "override" && q.round === round && q.kind === "accept")
    .map((q) => OVERRIDE_Q.exec(q.title)?.[1]).filter(Boolean));
}

/**
 * Can the set be approved now? {ok, code, message, diff[]}. Needs: the brief's approve question (of its last round),
 * answered Y under itself and not marked; the snapshot of that round; the set equal to it (the `!` rows of the round's
 * overrides answered Y excepted; an approved set, i.e. an update round: prio, risk and blocked-by excepted too).
 */
export async function approvalCheck(root, target) {
  const brief = await readTasksBrief(root, target);
  if (!brief) return { ok: false, code: "TASKS_BRIEF_MISSING", message: `no ${target.briefFile}: /hitl:tasks ${target.id} writes it` };
  const q = approveQuestion(brief);
  if (!q) return { ok: false, code: "TASKS_APPROVE_NO_Y", message: `${target.briefFile} has no "Approve?" question` };
  if (q.settled) return { ok: false, code: "TASKS_APPROVE_NO_Y", message: `${q.id} (round ${q.round}) is already marked (${q.recorded.join(", ") || "settled"})` };
  if (q.kind !== "accept") return { ok: false, code: "TASKS_APPROVE_NO_Y", message: `${q.id} (round ${q.round}) has no Y under it (${q.kind === "empty" ? "empty" : `answer: ${q.answer.split("\n")[0].slice(0, 60)}`}); only a Y under "Approve?" itself approves the set` };
  const snap = await readSnapshot(root, target);
  if (!snap || snap.round !== q.round) return { ok: false, code: "TASKS_SNAPSHOT_MISSING", message: `no snapshot of round ${q.round} (${target.snapFile}${snap ? ` is of round ${snap.round}` : " missing"}): run hitl-index tasks gate ${target.id} --write and write a new round` };
  const cur = await readTarget(root, target);
  if (!cur) return { ok: false, code: "TASKS_FILE_MISSING", message: `${target.tasksFile} not found` };
  const mask = overridesAnswered(brief, q.round);
  const loose = cur.doc.status === "approved";
  const key = (lines, id) => { const c = canonTask(lines, id, mask); return h((loose ? looseLines(c) : c).join("\n")); };
  const now = Object.fromEntries(Object.entries(setOf(cur.text, cur.doc).tasks).map(([id, x]) => [id, { ...x, hash: key(x.lines, id) }]));
  // the snapshot keeps each task's canonical lines: re-hash them the same way
  const before = Object.fromEntries(Object.entries(snap.tasks || {}).map(([id, x]) => [id, { ...x, hash: x.lines ? key(x.lines, id) : x.hash }]));
  const diff = diffSets(before, now);
  if (diff.length) return { ok: false, code: "TASKS_SET_CHANGED", message: `${target.tasksFile} differs from what round ${q.round} showed: mark ${q.id} → superseded and write a new round with the changes`, diff, brief, q };
  return { ok: true, brief, q, snap, cur, set: setOf(cur.text, cur.doc).set };
}

/** Sets the tasks file header to `> status: approved` (inserted after `← Change:` when missing). */
export function setHeaderApproved(text) {
  const lines = String(text).split("\n");
  const end = lines.findIndex((l) => /^## /.test(l));
  const head = end < 0 ? lines.length : end;
  const i = lines.slice(0, head).findIndex((l) => /^> status: (?:draft|approved)\b/.test(l));
  if (i >= 0) { lines[i] = lines[i].replace(/^> status: (?:draft|approved)/, "> status: approved"); return lines.join("\n"); }
  const c = lines.slice(0, head).findIndex((l) => /^← (?:Change|Planning):/.test(l));
  lines.splice(c >= 0 ? c + 1 : Math.min(1, lines.length), 0, "", "> status: approved");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n");
}
/** True when the head of a tasks file (before the first `## `) says `> status: approved`. */
export const headerApproved = (text) => { const head = String(text ?? "").split(/^## /m)[0]; return /^> status: approved\b/m.test(head); };

/** The brief after approval: `→ approved <date>` under the approve question, ✅ on its round, header status done. */
export function markApproved(briefText, q, date = today()) {
  const lines = String(briefText).replace(/\r\n?/g, "\n").split("\n");
  const at = q.line - 1;
  let end = at + 1;
  while (end < lines.length && !/^#{2,3}\s/.test(lines[end])) end++;
  let ins = end; while (ins > at + 1 && !lines[ins - 1].trim()) ins--;
  lines.splice(ins, 0, "", `→ approved ${date}`);
  for (let i = at; i >= 0; i--) {
    const m = /^## Round (\d+)\b(.*)$/.exec(lines[i]);
    if (m) { if (Number(m[1]) === q.round && !/^\s*✅/.test(m[2])) lines[i] = `## Round ${m[1]} ✅${m[2]}`; break; }
  }
  const mi = lines.findIndex((l) => /^>\s*(?:change|quick)\s*:/.test(l));
  if (mi >= 0) lines[mi] = lines[mi].replace(/\|\s*status:\s*[a-z]+/, "| status: done").replace(/\|\s*updated:\s*[^|]*$/, `| updated: ${date}`);
  return lines.join("\n");
}

/**
 * `hitl-index tasks approve <id|KEY>`: approvalCheck, `tasks --check` errors of the file, then the header, the brief
 * marks and the snapshot's `approved` part. Returns {ok, code?, message?, …}.
 */
export async function approveSet(root, target, { checkErrors = [] } = {}) {
  const c = await approvalCheck(root, target);
  if (!c.ok) return c;
  const errs = checkErrors.filter((e) => e.file === target.tasksFile);
  if (errs.length) return { ok: false, code: "TASKS_CHECK_ERRORS", message: `${errs.length} tasks --check error(s) in ${target.tasksFile}: ${errs.slice(0, 3).map((e) => `${e.task ?? ""} ${e.message}`).join("; ")}` };
  const date = today();
  const was = c.cur.doc.status;
  await writeTextAtomic(join(root, target.tasksFile), setHeaderApproved(c.cur.text));
  const briefText = await readText(join(root, target.briefFile), "");
  await writeTextAtomic(join(root, target.briefFile), markApproved(briefText, c.q, date));
  const after = await readText(join(root, target.tasksFile), "");
  const s = setOf(after, parseTasksMd(after, target.tasksFile));
  const snap = await readSnapshot(root, target);
  await writeJsonAtomic(join(root, target.snapFile), { ...snap, approved: approvedPart(date, c.q.round, s) });
  return { ok: true, target: target.id, file: target.tasksFile, brief: target.briefFile, round: c.q.round, question: c.q.id, set: s.set, was: was || "draft" };
}

/** The snapshot's `approved` part: per-task `loose` hashes (prio, risk and blocked-by edits are not held). */
const approvedPart = (at, round, s) => ({ at, round, set: s.set, mode: "loose", tasks: Object.fromEntries(Object.entries(s.tasks).map(([k, v]) => [k, v.loose])) });

/** `hitl-index tasks baseline <id|KEY>`: the approved set's per-task hashes from the current file (an update starts
 *  from it; an amend Close Y re-approves the set). Refused while the header is draft or a tasks brief round is open. */
export async function baselineSet(root, target) {
  const cur = await readTarget(root, target);
  if (!cur) return { ok: false, code: "TASKS_FILE_MISSING", message: `${target.tasksFile} not found` };
  if (cur.doc.status !== "approved") return { ok: false, code: NOT_APPROVED, message: `${target.tasksFile} is ${cur.doc.status || "draft"}: only hitl-index tasks approve approves a set` };
  const brief = await readTasksBrief(root, target);
  if (brief && brief.status !== "done") return { ok: false, code: "TASKS_BRIEF_OPEN", message: `${target.briefFile} has an open round (${brief.status}): the baseline stays the one its update started from` };
  const s = setOf(cur.text, cur.doc);
  const snap = (await readSnapshot(root, target)) || { schema: SNAP_SCHEMA, target: target.id, round: brief?.round ?? 0, at: today(), set: s.set, tasks: s.tasks };
  const date = today();
  await writeJsonAtomic(join(root, target.snapFile), { ...snap, approved: approvedPart(date, snap.round ?? null, s) });
  return { ok: true, target: target.id, file: target.tasksFile, set: s.set };
}

// ---------------------------------------------------------------- holds (TASKS_NOT_APPROVED)
const nextFor = (target, brief) => {
  const cmd = `/hitl:tasks ${target.id}`;
  return brief && brief.status !== "done" && brief.counts.unanswered > 0 ? `answer ${target.briefFile}, then ${cmd}` : cmd;
};

/**
 * Tasks that may not be built yet: {T: {code: TASKS_NOT_APPROVED, reason: "draft"|"update", target, file, brief, apply}}.
 * draft: the file header is not approved (every task of the set). update: the header is approved but a tasks brief
 * round is open and the task is new or edited since the approved set (no baseline: every task without locked work);
 * an edit of only prio, risk or blocked-by is no edit here (0.21.1, the `loose` hash).
 * Archived and v0.5 planning-linked files, dropped and done tasks are never held.
 */
export async function tasksHolds(root, tasks, lock = null) {
  const out = {};
  const files = new Map();
  for (const t of tasks || []) {
    if (t.archived || t.status === DROPPED || (!t.change && !t.quick)) continue;
    if (!files.has(t.file)) files.set(t.file, []);
    files.get(t.file).push(t);
  }
  if (!files.size) return out;
  const targets = await tasksTargets(root);
  for (const [file, ts] of files) {
    const target = targets.find((x) => x.tasksFile === file);
    if (!target) continue;
    const brief = await readTasksBrief(root, target).catch(() => null);
    const base = { code: NOT_APPROVED, target: target.id, file, brief: brief ? target.briefFile : null, apply: nextFor(target, brief) };
    if (ts[0].docStatus !== "approved") { for (const t of ts) out[t.id] = { ...base, reason: "draft" }; continue; }
    if (!brief || brief.status === "done") continue;
    const snap = await readSnapshot(root, target);
    const text = await readText(join(root, file), null);
    if (text === null) continue;
    const cur = setOf(text, parseTasksMd(text, file)).tasks;
    for (const t of ts) {
      if (lock?.tasks?.[t.id]?.doneAt) continue;
      const mine = snap?.approved?.mode === "loose" ? cur[t.id]?.loose : cur[t.id]?.hash; // a 0.21.0 snapshot: full hashes
      const held = snap?.approved ? snap.approved.tasks?.[t.id] !== mine : !hasLockedTaskWork(lock, t.id);
      if (held) out[t.id] = { ...base, reason: "update" };
    }
  }
  return out;
}

/** One-line refusal text of a hold. */
export const holdMessage = (T, x) => `${NOT_APPROVED}: ${T} ${x.reason === "draft" ? `is in a draft task set (${x.file})` : `is new or edited in the open tasks brief update (${x.brief})`}: nothing is built before the human's Y under "Approve?" in the tasks brief → ${x.apply}`;

// ---------------------------------------------------------------- override records (TEST_OVERRIDE_UNRECORDED)
/** AC id → {file, q, round} for every override (`- Override: <AC> …`, 0.21.0 `_Override:_`) answered Y (or recorded) in a tasks brief. */
export async function overrideRecords(root) {
  const out = new Map();
  for (const target of await tasksTargets(root).catch(() => [])) {
    const b = await readTasksBrief(root, target).catch(() => null);
    for (const q of b?.questions || []) {
      if (q.ownY !== "override") continue;
      const ac = OVERRIDE_Q.exec(q.title)?.[1];
      const declined = q.recorded.some((r) => /^declined\b|^superseded\b/.test(r));
      if (ac && !declined && (q.kind === "accept" || q.recorded.length)) out.set(ac, { file: target.briefFile, q: q.id, round: q.round });
    }
  }
  return out;
}
/** `tasks-brief.md Override PWR-T2.AC1` (0.21.0 briefs: `tasks-brief.md Q6`), or null. */
export const recordText = (r) => (r ? `${r.file.split("/").pop()} ${r.q}` : null);
