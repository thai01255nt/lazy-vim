// Tasks markdown parser + checker (§E.4; design v3 §2.9, §5.3).
// Task docs live in `.hitl/changes/<id>/tasks.md` (active change), `.hitl/archive/<date>-<id>/tasks.md` (archived)
// and `.hitl/tasks/*.md` (quick tasks + v0.5 legacy files linked with `← Planning:`).
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { paths } from "./project.mjs";
import { exists, readJson } from "./fsutil.mjs";
import { readPlanning, statusText } from "./planningmd.mjs";
import { HITL_PREFIX } from "./paths.mjs";
import { AC_ID_RE, AC_ID_SRC, ARCHIVE_DIR_RE, DEC_ID_RE, LEGACY_DEC_RE, QUICK_KEY, SPECREF_SRC, TASK_ID_SRC, formatTaskId, isChangeId, parseId, parseTaskId } from "./specids.mjs";

const REF = `(?:${SPECREF_SRC}|R-\\d+)`;
const CHANGE_FILE_RE = new RegExp(`^${HITL_PREFIX.replace(".", "\\.")}changes/([^/]+)/tasks\\.md$`);
const ARCHIVE_FILE_RE = new RegExp(`^${HITL_PREFIX.replace(".", "\\.")}archive/([^/]+)/tasks\\.md$`);

const RXN = {
  heading: new RegExp(`^## (${TASK_ID_SRC}) (.+)$`),
  legacyHeading: /^## (T-\d+) (.+)$/,
  meta: new RegExp(`^- prio: (P[0-3]) \\| risk: (low|high)(?: \\(([^)]*)\\))? \\| impl: (agent|manual|mixed) \\| blocked-by: (none|${TASK_ID_SRC}(?:, ?${TASK_ID_SRC})*) \\| status: ([a-z-]+)$`),
  ac: new RegExp(`^- \\[( |x)\\] (${AC_ID_SRC})(?: \\((${REF}(?:, ?${REF})*)\\))? (.+)$`),
  why: /^\*\*Why\*\*: ?(.*)$/,
  symbol: /^(\d+)\. \[( |x)\] `([^`]+)` \| (new|modify) \| `([^`]+)` \| impl: (agent|manual) \| (.+)$/,
  planning: /^← Planning: (\S+)$/,
  change: /^← Change: (\S+)$/,
  status: /^> status: (draft|approved)/,
};
const SYMREF = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?$/;
// `migrate --specs` reads v0.5 task files whose ids are still pre-0.13 `T-n` (migrate --ids renumbers them later)
const LT = `(?:${TASK_ID_SRC}|T-\\d+)`;
const RX_LEGACY = { ...RXN,
  heading: new RegExp(`^## (${LT}) (.+)$`), legacyHeading: /^\0$/,
  meta: new RegExp(`^- prio: (P[0-3]) \\| risk: (low|high)(?: \\(([^)]*)\\))? \\| impl: (agent|manual|mixed) \\| blocked-by: (none|${LT}(?:, ?${LT})*) \\| status: ([a-z-]+)$`),
  ac: new RegExp(`^- \\[( |x)\\] (${LT}\\.AC\\d+)(?: \\((${REF}(?:, ?${REF})*)\\))? (.+)$`) };

/** Change id and archived flag implied by a tasks file location; {change:null} for `.hitl/tasks/*.md`. */
export function changeOfFile(file) {
  const f = String(file || "");
  let m;
  if ((m = CHANGE_FILE_RE.exec(f))) return { change: m[1], archived: false, dir: `${HITL_PREFIX}changes/${m[1]}` };
  if ((m = ARCHIVE_FILE_RE.exec(f))) return { change: ARCHIVE_DIR_RE.exec(m[1])?.[2] ?? m[1], archived: true, dir: `${HITL_PREFIX}archive/${m[1]}` };
  return { change: null, archived: false, dir: null };
}

/**
 * Archived change of task T, or null. The tasks docs decide first (an active doc holding T wins over an archived one);
 * a task in no doc falls back to the lock: `lock.tasks[T].change` with `archivedAt` (written by archive), else the
 * archive path of `lock.tasks[T].file`. A lock file still pointing at `.hitl/changes/<id>/` resolves through the docs.
 */
export function archivedChangeOf(lock, tasks, T) {
  if (!T) return null;
  const docs = (tasks || []).filter((t) => t.id === T);
  if (docs.length) {
    if (docs.some((t) => !t.archived)) return null;
    return docs[0].change || changeOfFile(docs[0].file).change || null;
  }
  const lt = lock?.tasks?.[T];
  if (!lt) return null;
  if (lt.archivedAt && lt.change) return lt.change;
  const loc = changeOfFile(lt.file || "");
  return loc.archived ? loc.change : null;
}
/** True when task T belongs to an archived change (frozen history). */
export const isArchivedTask = (lock, tasks, T) => !!archivedChangeOf(lock, tasks, T);

/**
 * parseTasksMd(text, file) -> {file, planning, change, archived, changeDir, status, tasks: Task[]}
 * `change` comes from `← Change: <id>` (else from the file location); `planning` only from the legacy `← Planning:`.
 * AC refs: `(ACC-R5.S1, ACC-BR1)` spec refs and legacy `(R-1)`; `ac.reqs` holds all of them.
 */
export function parseTasksMd(text, file, { legacy = false } = {}) {
  const RX = legacy ? RX_LEGACY : RXN;
  const loc = changeOfFile(file);
  const doc = { file, planning: null, change: null, archived: loc.archived, changeDir: loc.dir, status: null, tasks: [], legacyIds: [] };
  let task = null, section = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if ((m = line.match(RX.heading))) {
      task = { id: m[1], title: m[2].trim(), file, planning: doc.planning, prio: null, risk: null, riskReasons: [], impl: null, blockedBy: [], status: null,
        why: null, decisions: [], acs: [], symbols: [], testPlan: [], parseErrors: [], _meta: false };
      doc.tasks.push(task);
      section = null;
      continue;
    }
    if ((m = line.match(RX.legacyHeading))) { doc.legacyIds.push(m[1]); task = null; section = null; continue; }
    if (/^## /.test(line)) { task = null; section = null; continue; }
    if (!task) {
      if ((m = line.match(RX.planning))) doc.planning = m[1];
      else if ((m = line.match(RX.change))) doc.change = m[1] === "none" ? "none" : m[1];
      else if ((m = line.match(RX.status)) && !doc.status) doc.status = m[1];
      continue;
    }
    if ((m = line.match(/^### (.+)$/))) { section = m[1].trim().toLowerCase(); continue; }
    if (!section && task.why === null && (m = line.match(RX.why))) {
      task.why = m[1].trim();
      task.decisions = [...new Set(task.why.match(/\b(?:[A-Z]{2,5}-D\d+|D-\d+)\b/g) || [])];
      continue;
    }
    if (!section && /^- prio:/.test(line)) {
      if ((m = line.match(RX.meta))) {
        Object.assign(task, { prio: m[1], risk: m[2], riskReasons: m[3] ? m[3].split(",").map((s) => s.trim()).filter(Boolean) : [], impl: m[4],
          blockedBy: m[5] === "none" ? [] : m[5].split(",").map((s) => s.trim()), status: m[6], _meta: true });
      } else task.parseErrors.push(`malformed meta line: ${line}`);
      continue;
    }
    if (section === "acceptance criteria" && (m = line.match(RX.ac))) {
      const bad = !m[3] && /^\(([A-Za-z]\w*-[A-Za-z]*\d[\w.]*(?:, ?[A-Za-z]\w*-[A-Za-z]*\d[\w.]*)*)\) /.exec(m[4]);
      if (bad) task.parseErrors.push(`malformed AC ref (${bad[1]}) in ${m[2]}: use spec ids like PWR-R1.S1 (or legacy R-n)`);
      task.acs.push({ id: m[2], reqs: m[3] ? m[3].split(/, ?/) : [], text: m[4].trim(), done: m[1] === "x" });
    }
    else if (section === "acceptance criteria" && /^- \[/.test(line)) task.parseErrors.push(`malformed AC line: ${line}`);
    else if (section === "symbols" && (m = line.match(RX.symbol)))
      task.symbols.push({ order: Number(m[1]), ref: m[3], change: m[4], file: m[5], impl: m[6], purpose: m[7].trim(), done: m[2] === "x" });
    else if (section === "symbols" && /^\d+\. /.test(line)) task.parseErrors.push(`malformed symbol line: ${line}`);
    else if (section === "test plan" && /^\|/.test(line)) {
      const cells = line.split("|").slice(1, -1).map((c) => c.trim());
      if (cells.length < 5 || /^-+$/.test(cells[0]) || cells[0].toLowerCase() === "ac") continue;
      task.testPlan.push({ ac: cells[0], kind: cells[1], oracle: cells[2], seam: cells[3], author: cells[4] });
    }
  }
  if (doc.change === "none") doc.change = null;
  else if (!doc.change && loc.change && !doc.planning) doc.change = loc.change;
  for (const t of doc.tasks) {
    t.planning = doc.planning;
    t.change = doc.change;
    t.archived = doc.archived;
    t.changeDir = doc.changeDir;
    if (!t._meta && !t.parseErrors.some((e) => e.startsWith("malformed meta"))) t.parseErrors.push("meta line missing");
    delete t._meta;
  }
  return doc;
}

const dirNames = async (dir) => (await fs.readdir(dir, { withFileTypes: true }).catch(() => []))
  .filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => e.name).sort();

// Every tasks doc: changes/<id>/tasks.md, then archive/<dir>/tasks.md, then tasks/*.md (quick + legacy).
export async function readTaskDocs(root) {
  const P = paths(root);
  const docs = [];
  const add = async (abs, rel) => { const t = await fs.readFile(abs, "utf8").catch(() => null); if (t !== null) docs.push(parseTasksMd(t, rel)); };
  for (const d of await dirNames(P.changes)) await add(join(P.changes, d, "tasks.md"), `${HITL_PREFIX}changes/${d}/tasks.md`);
  for (const d of await dirNames(P.archive)) await add(join(P.archive, d, "tasks.md"), `${HITL_PREFIX}archive/${d}/tasks.md`);
  const names = (await fs.readdir(P.tasks).catch(() => [])).filter((n) => n.endsWith(".md")).sort();
  for (const n of names) await add(join(P.tasks, n), `${HITL_PREFIX}tasks/${n}`);
  return docs;
}

/** True when a ref is a v3 spec id (not a legacy R-n). */
export const isSpecRef = (r) => !!parseId(r);

export async function readTasks(root) {
  return (await readTaskDocs(root)).flatMap((d) => d.tasks);
}

const acKey = (taskId, ac) => (AC_ID_RE.test(ac) ? ac : `${taskId}.${ac.replace(/^\./, "")}`);

/** checkTasks(root, tasks, index) -> errors [{task, file, message}] */
export async function checkTasks(root, tasks, index) {
  const errors = [];
  const err = (t, message) => errors.push({ task: t?.id ?? null, file: t?.file ?? null, message });
  const ids = new Map();
  const plannings = new Map();
  let specCtx = null;
  for (const t of tasks) ids.set(t.id, (ids.get(t.id) || 0) + 1);
  // 0.13: a task id carries its change's key (proposal meta); quick tasks use the reserved key QT
  let keys = null;
  const keyFor = async (t) => {
    if (!keys) { const { readKeyRegistry } = await import("./keys.mjs"); keys = (await readKeyRegistry(root)).byChange; }
    if (t.change && (t.changeDir || !t.planning)) return keys.get(t.change) ?? null;
    return t.changeDir ? null : QUICK_KEY;
  };
  for (const t of tasks) {
    const want = await keyFor(t);
    const k = parseTaskId(t.id)?.key;
    if (want && k && k !== want) err(t, `TASK_KEY_MISMATCH: ${t.id} does not use ${t.change ? `the key ${want} of ${t.change}` : `the quick-task key ${want}`}`);
  }
  for (const [id, n] of ids) if (n > 1) err(tasks.find((t) => t.id === id), `duplicate task id ${id} (${n}×)`);
  for (const t of tasks) {
    for (const e of t.parseErrors) err(t, e);
    for (const b of t.blockedBy) if (!ids.has(b)) err(t, `blocked-by ${b} is not a known task`);
    for (const s of t.symbols) {
      if (!SYMREF.test(s.ref)) err(t, `symbol ref \`${s.ref}\` must be Name or Class.method`);
      if (s.change === "modify" && !(await exists(join(root, s.file)))) err(t, `modify target file ${s.file} does not exist`);
      const existing = index?.symbols?.[`${s.file}#${s.ref}`];
      if (s.change === "new" && existing && !(existing.tags?.task || []).includes(t.id)) err(t, `new symbol ${s.ref} already exists in ${s.file}`);
    }
    const planned = new Set(t.testPlan.map((r) => acKey(t.id, r.ac)));
    for (const ac of t.acs) if (!planned.has(ac.id)) err(t, `${ac.id} has no test-plan row`);
    // spec references (refs on ACs, D-n in **Why**) must resolve against the task's change (effective spec view +
    // design.md) or, for a v0.5 task file, against its planning file
    const hasReqs = t.acs.some((a) => (a.reqs || []).length);
    if (!hasReqs && !(t.decisions || []).length) continue;
    if (t.change || t.changeDir) {
      if (!specCtx) { const m = await import("./changes.mjs"); specCtx = { m, ctx: await m.loadSpecContext(root) }; }
      const { m, ctx } = specCtx;
      const c = m.changeForTask(ctx, t);
      if (!c) { err(t, `change ${t.change ?? "?"} not found (needed for spec/D- refs)`); continue; }
      const id = c.change.id;
      for (const ac of t.acs) for (const r of ac.reqs || []) {
        if (!isSpecRef(r)) { err(t, `${ac.id} references legacy ${r} (a change task refs spec ids such as PWR-R1.S1)`); continue; }
        const x = m.resolveSpecRef(c.view, r, c.change);
        if (x.status === "removed") err(t, `${ac.id} references ${r} which ${id} removes`);
        else if (x.status === "retired" && !c.change.archived) err(t, `${ac.id} references ${r} which is retired`);
        else if (x.status === "unknown") err(t, `${ac.id} references unknown ${r} (not in the spec view of ${id})`);
      }
      const D = new Set((c.change.design?.decisions || []).map((d) => d.id));
      for (const d of t.decisions || []) {
        if (LEGACY_DEC_RE.test(d)) err(t, `IDS_LEGACY: **Why** references ${d} (pre-0.13 decision id: run /hitl:migrate)`);
        else if (!D.has(d)) err(t, `**Why** references unknown ${d} (not in ${c.change.dir}/design.md)`);
      }
      continue;
    }
    const p = t.planning;
    if (!plannings.has(p)) plannings.set(p, p && p !== "none" ? await readPlanning(root, p) : null);
    const doc = plannings.get(p);
    if (!doc) { err(t, `planning file ${p ?? "none"} not found (needed for R-/D- refs)`); continue; }
    const R = new Map(doc.requirements.map((r) => [r.id, r]));
    const D = new Set(doc.decisions.map((d) => d.id));
    for (const ac of t.acs) for (const r of ac.reqs || []) {
      if (!R.has(r)) err(t, `${ac.id} references unknown ${r} (not in ${p})`);
      else if (["dropped", "superseded"].includes(R.get(r).status)) err(t, `${ac.id} references ${r} which is ${statusText(R.get(r))}`);
    }
    for (const d of t.decisions || []) if (!D.has(d)) err(t, `**Why** references unknown ${d} (not in ${p})`);
  }
  return errors;
}

/**
 * Next task id of a change (or of the quick tasks): `<KEY>-T<max+1>` over that key's tasks in every tasks doc and the
 * lock. A number is never reused within a key. `target`: a change id, or "quick" / null for `.hitl/tasks/*.md` (key QT).
 */
export async function nextTaskId(root, target = null) {
  let key = QUICK_KEY;
  if (target && target !== "quick") {
    const { readKeyRegistry } = await import("./keys.mjs");
    key = (await readKeyRegistry(root)).byChange.get(target);
    if (!key) throw Object.assign(new Error(`change ${target} has no key yet (proposal meta "| key: <KEY>"; a pre-0.13 project: run /hitl:migrate)`), { code: 1 });
  }
  let max = 0;
  const bump = (id) => { const p = parseTaskId(id || ""); if (p && p.key === key) max = Math.max(max, p.n); };
  for (const t of await readTasks(root)) bump(t.id);
  const lock = await readJson(paths(root).lock, null);
  for (const id of Object.keys(lock?.tasks || {})) bump(id);
  for (const s of Object.values(lock?.symbols || {})) { bump(s.task); for (const x of s.tasks || []) bump(x); }
  for (const s of Object.values(lock?.tests || {})) bump(s.task);
  return formatTaskId(key, max + 1);
}

/** Pre-0.13 ids in the tasks docs: [{file, ids}] (empty when current). */
export async function legacyTaskDocs(root) {
  return (await readTaskDocs(root)).filter((d) => d.legacyIds.length).map((d) => ({ file: d.file, ids: d.legacyIds }));
}
