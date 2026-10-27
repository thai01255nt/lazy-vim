// Tasks markdown parser + checker (§E.4; design v3 §2.9, §5.3).
// Task docs live in `.hitl/changes/<id>/tasks.md` (active change), `.hitl/archive/<date>-<id>/tasks.md` (archived)
// and `.hitl/tasks/*.md` (quick tasks + v0.5 legacy files linked with `← Planning:`).
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { paths } from "./project.mjs";
import { exists, readJson } from "./fsutil.mjs";
import { readPlanning, statusText } from "./planningmd.mjs";
import { HITL_PREFIX } from "./paths.mjs";
import { ARCHIVE_DIR_RE, SPECREF_SRC, isChangeId, parseId } from "./specids.mjs";

const REF = `(?:${SPECREF_SRC}|R-\\d+)`;
const CHANGE_FILE_RE = new RegExp(`^${HITL_PREFIX.replace(".", "\\.")}changes/([^/]+)/tasks\\.md$`);
const ARCHIVE_FILE_RE = new RegExp(`^${HITL_PREFIX.replace(".", "\\.")}archive/([^/]+)/tasks\\.md$`);

const RX = {
  heading: /^## (T-\d+) (.+)$/,
  meta: /^- prio: (P[0-3]) \| risk: (low|high)(?: \(([^)]*)\))? \| impl: (agent|manual|mixed) \| blocked-by: (none|T-\d+(?:, ?T-\d+)*) \| status: ([a-z-]+)$/,
  ac: new RegExp(`^- \\[( |x)\\] (T-\\d+\\.AC\\d+)(?: \\((${REF}(?:, ?${REF})*)\\))? (.+)$`),
  why: /^\*\*Why\*\*: ?(.*)$/,
  symbol: /^(\d+)\. \[( |x)\] `([^`]+)` \| (new|modify) \| `([^`]+)` \| impl: (agent|manual) \| (.+)$/,
  planning: /^← Planning: (\S+)$/,
  change: /^← Change: (\S+)$/,
  status: /^> status: (draft|approved)/,
};
const SYMREF = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)?$/;

/** Change id and archived flag implied by a tasks file location; {change:null} for `.hitl/tasks/*.md`. */
export function changeOfFile(file) {
  const f = String(file || "");
  let m;
  if ((m = CHANGE_FILE_RE.exec(f))) return { change: m[1], archived: false, dir: `${HITL_PREFIX}changes/${m[1]}` };
  if ((m = ARCHIVE_FILE_RE.exec(f))) return { change: ARCHIVE_DIR_RE.exec(m[1])?.[2] ?? m[1], archived: true, dir: `${HITL_PREFIX}archive/${m[1]}` };
  return { change: null, archived: false, dir: null };
}

/**
 * parseTasksMd(text, file) -> {file, planning, change, archived, changeDir, status, tasks: Task[]}
 * `change` comes from `← Change: <id>` (else from the file location); `planning` only from the legacy `← Planning:`.
 * AC refs: `(ACC-R5.S1, ACC-BR1)` spec refs and legacy `(R-1)`; `ac.reqs` holds all of them.
 */
export function parseTasksMd(text, file) {
  const loc = changeOfFile(file);
  const doc = { file, planning: null, change: null, archived: loc.archived, changeDir: loc.dir, status: null, tasks: [] };
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
      task.decisions = [...new Set(task.why.match(/\bD-\d+\b/g) || [])];
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
      if (bad) task.parseErrors.push(`malformed AC ref (${bad[1]}) in ${m[2]}: use spec ids like ACC-R1.S1 (or legacy R-n)`);
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

const acKey = (taskId, ac) => (/^T-\d+\.AC\d+$/.test(ac) ? ac : `${taskId}.${ac.replace(/^\./, "")}`);

/** checkTasks(root, tasks, index) -> errors [{task, file, message}] */
export async function checkTasks(root, tasks, index) {
  const errors = [];
  const err = (t, message) => errors.push({ task: t?.id ?? null, file: t?.file ?? null, message });
  const ids = new Map();
  const plannings = new Map();
  let specCtx = null;
  for (const t of tasks) ids.set(t.id, (ids.get(t.id) || 0) + 1);
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
        if (!isSpecRef(r)) { err(t, `${ac.id} references legacy ${r} (a change task refs spec ids such as ACC-R1.S1)`); continue; }
        const x = m.resolveSpecRef(c.view, r, c.change);
        if (x.status === "removed") err(t, `${ac.id} references ${r} which ${id} removes`);
        else if (x.status === "retired" && !c.change.archived) err(t, `${ac.id} references ${r} which is retired`);
        else if (x.status === "unknown") err(t, `${ac.id} references unknown ${r} (not in the spec view of ${id})`);
      }
      const D = new Set((c.change.design?.decisions || []).map((d) => d.id));
      for (const d of t.decisions || []) if (!D.has(d)) err(t, `**Why** references unknown ${d} (not in ${c.change.dir}/design.md)`);
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

/** Highest T-number across tasks files and the lock, +1. */
export async function nextTaskId(root) {
  let max = 0;
  const bump = (id) => { const m = /^T-(\d+)/.exec(id || ""); if (m) max = Math.max(max, Number(m[1])); };
  for (const t of await readTasks(root)) bump(t.id);
  const lock = await readJson(paths(root).lock, null);
  for (const id of Object.keys(lock?.tasks || {})) bump(id);
  for (const s of Object.values(lock?.symbols || {})) bump(s.task);
  for (const s of Object.values(lock?.tests || {})) bump(s.task);
  return `T-${max + 1}`;
}
