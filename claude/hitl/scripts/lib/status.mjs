// P2 — status machine (§E.6). Pure: computeStatuses(index, lock, state, config, tasks).
import { CODE_KINDS, isTest, coversOf, taskSymbolIds, taskRisk, isOverride, lockedTasks } from "./lock.mjs";
import { nextForTask } from "./nextstep.mjs";
import { archivedChangeOf } from "./tasksmd.mjs";

export const ORDER = ["skeleton", "red", "wip", "green", "verified", "done"];
export const rank = (s) => { const i = ORDER.indexOf(s); return i < 0 ? -1 : i; };
const minStatus = (arr) => arr.reduce((a, b) => (rank(b) < rank(a) ? b : a));

const MAX_DEPTH = 3;
const REV = new WeakMap();

/** Map symbolId -> test ids covering it directly. */
export function directCoverage(index) {
  const m = new Map();
  for (const [id, s] of Object.entries(index?.symbols || {})) {
    if (!isTest(s)) continue;
    for (const c of coversOf(index, s)) { if (!m.has(c)) m.set(c, []); m.get(c).push(id); }
  }
  return m;
}

/** Callers of id (from index.callers, else reverse of callees), transitive up to depth. */
function callerClosure(index, id, depth = MAX_DEPTH) {
  let rev = REV.get(index); if (!rev) { rev = buildReverse(index); REV.set(index, rev); }
  const seen = new Set([id]); let frontier = [id];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const x of frontier) for (const c of rev.get(x) || []) if (!seen.has(c)) { seen.add(c); next.push(c); }
    frontier = next;
  }
  seen.delete(id);
  return [...seen];
}
function buildReverse(index) {
  const rev = new Map();
  const add = (callee, caller) => { if (!rev.has(callee)) rev.set(callee, new Set()); rev.get(callee).add(caller); };
  for (const [id, s] of Object.entries(index.symbols || {})) {
    for (const c of s.callers || []) add(id, c);
    for (const c of s.callees || []) add(c, id);
  }
  return rev;
}

/** Transitive callees (depth-limited) — used to record coveredBodyHashes for a test run. */
export function calleeClosure(index, ids, depth = MAX_DEPTH) {
  const seen = new Set(ids); let frontier = [...ids];
  for (let d = 0; d < depth && frontier.length; d++) {
    const next = [];
    for (const x of frontier) for (const c of index.symbols?.[x]?.callees || []) if (!seen.has(c) && index.symbols[c]) { seen.add(c); next.push(c); }
    frontier = next;
  }
  return [...seen];
}

/**
 * Tests that exercise S. Direct `@covers` first; if none, tests covering a (transitive) caller of S
 * (P2 decision: a test of createUser also exercises findByEmail). Returns {tests, indirect}.
 */
export function testsFor(index, id, cov = directCoverage(index)) {
  const direct = cov.get(id) || [];
  if (direct.length) return { tests: direct, indirect: false };
  const set = new Set();
  for (const c of callerClosure(index, id)) for (const t of cov.get(c) || []) set.add(t);
  return { tests: [...set].sort(), indirect: set.size > 0 };
}

export function isFresh(index, state, testId, symId) {
  const r = state?.runs?.[testId]; const t = index.symbols[testId]; const s = index.symbols[symId];
  return !!(r && t && s && r.testBodyHash === t.bodyHash && r.coveredBodyHashes?.[symId] === s.bodyHash);
}

function tracked(index, lock, extra) {
  const out = new Set(extra);
  for (const [id, s] of Object.entries(index.symbols || {})) {
    if (isTest(s) || s.kind === "suite" || s.kind === "type") continue;
    if ((s.tags?.task || []).length || lock.symbols?.[id]) out.add(id);
  }
  return out;
}

const isDone = (lock, T) => !!lock.tasks?.[T]?.doneAt;

/** Tasks that have started work on symbol id: its `@task` tags, lock approvals, done records and scoped TODO lines. */
export function tasksOfSymbol(index, lock, id) {
  const S = index.symbols?.[id];
  const out = new Set([...(S?.tags?.task || []), ...lockedTasks(lock.symbols?.[id]), ...(S?.todoTasks || []).filter(Boolean)]);
  for (const [T, lt] of Object.entries(lock.tasks || {})) if (lt?.doneBodyHashes?.[id]) out.add(T);
  return [...out].sort();
}

/**
 * Open `TODO(impl)` steps of S that belong to task T. A scoped line (`TODO(impl T-3): …`) belongs to its task; a plain
 * line belongs to every not-done task working on S (conservative: with two open tasks on one symbol, both wait for it).
 * A done task has none.
 */
export function openStepsFor(index, lock, id, T) {
  const S = index.symbols?.[id];
  if (!T || isDone(lock, T) || !(S?.todos || []).length) return 0;
  const scope = S.todoTasks || [];
  return S.todos.filter((_, i) => (scope[i] ? scope[i] === T : true)).length;
}

/**
 * Test state of one symbol for messages and the accept gate: "fresh pass" (every active covering test ran fresh and
 * passed), "failing" (a fresh run failed or errored), "stale" (a run is missing or older than the code/test), or
 * "no tests" (no active covering test).
 */
export function testState(index, state, id, cov = directCoverage(index)) {
  const f = testFacts(index, state || {}, id, cov);
  const state_ = !f.A.length ? "no tests" : f.failing.length ? "failing" : f.allPass ? "fresh pass" : "stale";
  return { state: state_, tests: f.A, failing: f.failing };
}

/** Test facts of one symbol, independent of the task. */
function testFacts(index, state, id, cov) {
  const reasons = [];
  const { tests: T, indirect } = testsFor(index, id, cov);
  const A = T.filter((t) => index.symbols[t]?.test?.mode === "active");
  if (indirect) reasons.push("covered indirectly via callers' tests");
  const fresh = (t) => isFresh(index, state, t, id);
  const stale = A.some((t) => state.runs?.[t] && !fresh(t));
  if (stale) reasons.push("stale test runs (code or test changed since last run)");
  const failing = A.filter((t) => fresh(t) && ["fail", "error"].includes(state.runs?.[t]?.outcome));
  const allPass = A.length > 0 && A.every((t) => fresh(t) && state.runs[t].outcome === "pass");
  return { A, stale, failing, allPass, reasons };
}

/**
 * Status of symbol id for task T (T null: a tracked symbol no task works on). Rules, in order:
 * - T only lists it in `### Symbols` (no tag, approval, done record): skeleton, flagged `untouched`.
 * - T is done and archived (frozen history): done, whatever the code or test runs do now; drift reports the changes.
 * - T is done and a later task has started on it (open, or done after T): done; that task now owns its changes.
 * - a fresh failing test → red; the sentinel, or open TODO(impl) steps of T → skeleton;
 * - all tests fresh and passing → done (T's done record matches the body) / verified (T's review PASS) / green; else wip.
 */
function statusFor(index, lock, state, config, id, T, facts, owners, archivedOf = () => null) {
  const S = index.symbols[id];
  const reasons = [...facts.reasons];
  const { stale } = facts;
  const lt = T ? lock.tasks?.[T] : null;
  if (T && !owners.includes(T)) return { status: "skeleton", stale: false, untouched: true, reasons: [`not started for ${T} (### Symbols row only, no @task ${T})`] };
  if (T && lt?.doneAt) {
    const arch = archivedOf(T);
    if (arch) return { status: "done", stale: false, reasons: [`archived in ${arch}`] };
  }
  if (T && lt?.doneAt && lt.doneBodyHashes?.[id]) {
    const later = owners.filter((u) => u !== T && (!isDone(lock, u) || lock.tasks[u].doneAt > lt.doneAt));
    if (later.length) return { status: "done", stale: false, reasons: [`done in ${T}; later changes belong to ${later.join(", ")}`] };
  }
  if (facts.failing.length) { reasons.push(`${facts.failing.length} failing test(s)`); return { status: "red", stale, reasons }; }
  if (S.stub) { reasons.push("stub (TODO(impl) sentinel present)"); return { status: "skeleton", stale, reasons }; }
  const steps = openStepsFor(index, lock, id, T);
  if (steps) { reasons.push(`${steps} open TODO(impl) step(s) for ${T}`); return { status: "skeleton", stale, reasons }; }
  if (facts.allPass) {
    const task = T || lock.symbols?.[id]?.task;
    const rv = state.reviews?.[task]; const mut = state.mutation?.[id];
    const impl = S.tags?.impl || lock.symbols?.[id]?.impl;
    const thr = config?.mutationThreshold ?? 0.8;
    const mutOk = !config?.mutationRequired || impl === "manual" || (mut && mut.bodyHash === S.bodyHash && mut.score >= thr);
    if (lock.tasks?.[task]?.doneBodyHashes?.[id] && lock.tasks[task].doneBodyHashes[id] === S.bodyHash) return { status: "done", stale, reasons };
    if (rv && rv.verdict === "PASS" && rv.bodyHashes?.[id] === S.bodyHash && mutOk) return { status: "verified", stale, reasons };
    if (rv && rv.verdict === "PASS" && !mutOk) reasons.push("mutation score below threshold or missing");
    reasons.push(`${facts.A.length} test(s) pass`);
    return { status: "green", stale, reasons };
  }
  if (!facts.A.length) reasons.push("no active tests"); else reasons.push("tests not run fresh or not all passing");
  return { status: "wip", stale, reasons };
}

/** Per-task statuses of one symbol + their minimum (the symbol's overall status, e.g. for its source @status tag). */
function symbolStatuses(index, lock, state, config, id, cov, archivedOf) {
  const facts = testFacts(index, state, id, cov);
  const owners = tasksOfSymbol(index, lock, id);
  if (!owners.length) return { overall: statusFor(index, lock, state, config, id, null, facts, owners, archivedOf), byTask: {} };
  const byTask = Object.fromEntries(owners.map((T) => [T, statusFor(index, lock, state, config, id, T, facts, owners, archivedOf)]));
  if (owners.length === 1) return { overall: byTask[owners[0]], byTask };
  const low = owners.reduce((a, b) => (rank(byTask[b].status) < rank(byTask[a].status) ? b : a));
  const overall = { ...byTask[low], reasons: [`${low}: ${byTask[low].reasons.join("; ") || byTask[low].status}`],
    byTask: Object.fromEntries(owners.map((T) => [T, byTask[T].status])) };
  return { overall, byTask };
}

/**
 * A symbol several tasks work on has one status per task (`tasks[T].symbolStatus`); `symbols[id]` is the lowest of them
 * (plus `byTask` when there are several). Task status, work lists and approvals use the per-task one.
 * @returns {{symbols:{[id]:{status,stale,reasons,byTask?}}, tasks:{[T]:{status,next,symbols:[ids],targets:[ids],symbolStatus:{[id]:{status,stale,reasons,untouched?}},testsLocked:boolean,risk,override:boolean}}}}
 */
export function computeStatuses(index, lock, state, config, tasks) {
  index = index || { symbols: {} };
  lock = { symbols: {}, tests: {}, tasks: {}, ...(lock || {}) };
  state = { runs: {}, mutation: {}, reviews: {}, ...(state || {}) };
  config = config || {};
  tasks = tasks || [];
  const cov = directCoverage(index);
  const archMemo = new Map();
  const archivedOf = (T) => { if (!archMemo.has(T)) archMemo.set(T, archivedChangeOf(lock, tasks, T)); return archMemo.get(T); };
  const taskIds = new Set(tasks.map((t) => t.id));
  for (const s of Object.values(index.symbols || {})) for (const t of s.tags?.task || []) taskIds.add(t);
  for (const t of Object.keys(lock.tasks || {})) taskIds.add(t);
  const perTaskSyms = {};
  const extra = [];
  for (const T of taskIds) {
    const task = tasks.find((t) => t.id === T);
    perTaskSyms[T] = taskSymbolIds(index, T, task);
    extra.push(...perTaskSyms[T]);
  }
  const symbols = {}, perTask = {};
  const tr = tracked(index, lock, extra);
  for (const id of [...tr]) { const p = index.symbols[id]?.parent; if (p && index.symbols[p]?.kind === "class") tr.add(p); }
  const ids = [...tr].filter((id) => index.symbols[id]);
  const facts = (id) => testFacts(index, state, id, cov);
  for (const id of ids) {
    const S = index.symbols[id];
    if (!CODE_KINDS.has(S.kind)) continue;
    const r = symbolStatuses(index, lock, state, config, id, cov, archivedOf);
    symbols[id] = r.overall; perTask[id] = r.byTask;
  }
  // status of id for task T: computed per task (owners), or for a ### Symbols row T has not started on
  const forTask = (id, T) => perTask[id]?.[T]
    || (CODE_KINDS.has(index.symbols[id]?.kind) ? statusFor(index, lock, state, config, id, T, facts(id), tasksOfSymbol(index, lock, id), archivedOf) : symbols[id]);
  for (const id of ids) { // classes: min of their members
    const S = index.symbols[id];
    if (S.kind !== "class") continue;
    const mem = Object.values(index.symbols).filter((m) => m.parent === id && CODE_KINDS.has(m.kind))
      .filter((m) => symbols[m.id]).map((m) => symbols[m.id]); // tracked members only
    if (mem.length) symbols[id] = { status: minStatus(mem.map((m) => m.status)), stale: mem.some((m) => m.stale), reasons: ["min of members"] };
  }
  // a task target that is a class without tracked members (e.g. an enum row): its own status, shown in `targets` only
  for (const T of taskIds) for (const id of perTaskSyms[T]) {
    if (!symbols[id] && index.symbols[id]?.kind === "class") symbols[id] = statusFor(index, lock, state, config, id, null, facts(id), []);
  }

  const out = {};
  for (const T of [...taskIds].sort()) {
    const task = tasks.find((t) => t.id === T);
    const syms = perTaskSyms[T].filter((id) => symbols[id] && CODE_KINDS.has(index.symbols[id].kind));
    const lt = lock.tasks?.[T];
    const testsLocked = !!lt?.testsAt || Object.values(lock.tests || {}).some((t) => t.task === T && t.stage === "locked");
    const symbolStatus = {};
    for (const id of perTaskSyms[T]) if (symbols[id]) symbolStatus[id] = forTask(id, T);
    let status;
    if (lt?.doneAt && archivedOf(T)) status = "done"; // archived: frozen history
    else if (!syms.length || syms.every((id) => symbolStatus[id].untouched)) status = lt?.doneAt ? "done" : "todo";
    else {
      const sts = syms.map((id) => symbolStatus[id].status);
      const anyStub = sts.includes("skeleton"); // sentinel, open TODO(impl) steps of T, or a row T has not started
      const m = minStatus(sts);
      if (!lt?.skeletonAt && anyStub && m !== "red") status = "skeleton";
      else if (lt?.skeletonAt && !testsLocked && m === "skeleton") status = "approved";
      else if (m === "skeleton" || m === "red") status = "red";
      else if (m === "green") {
        const rv = state.reviews?.[T];
        status = rv && rv.verdict !== "PASS" ? "review" : "green";
      } else status = m;
    }
    const risk = taskRisk(task, lock, T);
    // targets: every task symbol with a status, classes included (display); `symbols` (code kinds) drives the task status
    const targets = perTaskSyms[T].filter((id) => symbols[id]);
    out[T] = { status, next: nextForTask(T, status, { risk, testsLocked }), symbols: syms, targets, symbolStatus, testsLocked, risk, override: isOverride(lock, T) };
  }
  return { symbols, tasks: out };
}
