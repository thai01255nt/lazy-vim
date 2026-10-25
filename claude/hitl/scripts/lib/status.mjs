// P2 — status machine (§E.6). Pure: computeStatuses(index, lock, state, config, tasks).
import { CODE_KINDS, isTest, coversOf, taskSymbolIds, taskRisk, isOverride } from "./lock.mjs";
import { nextForTask } from "./nextstep.mjs";

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

function symbolStatus(index, lock, state, config, id, cov) {
  const S = index.symbols[id];
  const reasons = [];
  const { tests: T, indirect } = testsFor(index, id, cov);
  const A = T.filter((t) => index.symbols[t]?.test?.mode === "active");
  if (indirect) reasons.push("covered indirectly via callers' tests");
  const fresh = (t) => isFresh(index, state, t, id);
  const stale = A.some((t) => state.runs?.[t] && !fresh(t));
  if (stale) reasons.push("stale test runs (code or test changed since last run)");
  const failing = A.filter((t) => fresh(t) && ["fail", "error"].includes(state.runs[t].outcome));
  if (failing.length) { reasons.push(`${failing.length} failing test(s)`); return { status: "red", stale, reasons }; }
  if (S.stub) { reasons.push("stub (TODO(impl) sentinel present)"); return { status: "skeleton", stale, reasons }; }
  if (A.length && A.every((t) => fresh(t) && state.runs[t].outcome === "pass")) {
    const task = (S.tags?.task || [])[0] || lock.symbols?.[id]?.task;
    const rv = state.reviews?.[task]; const mut = state.mutation?.[id];
    const impl = S.tags?.impl || lock.symbols?.[id]?.impl;
    const thr = config?.mutationThreshold ?? 0.8;
    const mutOk = !config?.mutationRequired || impl === "manual" || (mut && mut.bodyHash === S.bodyHash && mut.score >= thr);
    if (lock.tasks?.[task]?.doneBodyHashes?.[id] && lock.tasks[task].doneBodyHashes[id] === S.bodyHash) return { status: "done", stale, reasons };
    if (rv && rv.verdict === "PASS" && rv.bodyHashes?.[id] === S.bodyHash && mutOk) return { status: "verified", stale, reasons };
    if (rv && rv.verdict === "PASS" && !mutOk) reasons.push("mutation score below threshold or missing");
    reasons.push(`${A.length} test(s) pass`);
    return { status: "green", stale, reasons };
  }
  if (!A.length) reasons.push("no active tests"); else reasons.push("tests not run fresh or not all passing");
  return { status: "wip", stale, reasons };
}

/**
 * @returns {{symbols:{[id]:{status,stale,reasons}}, tasks:{[T]:{status,next,symbols:[ids],testsLocked:boolean,risk,override:boolean}}}}
 */
export function computeStatuses(index, lock, state, config, tasks) {
  index = index || { symbols: {} };
  lock = { symbols: {}, tests: {}, tasks: {}, ...(lock || {}) };
  state = { runs: {}, mutation: {}, reviews: {}, ...(state || {}) };
  config = config || {};
  tasks = tasks || [];
  const cov = directCoverage(index);
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
  const symbols = {};
  const tr = tracked(index, lock, extra);
  for (const id of [...tr]) { const p = index.symbols[id]?.parent; if (p && index.symbols[p]?.kind === "class") tr.add(p); }
  const ids = [...tr].filter((id) => index.symbols[id]);
  for (const id of ids) {
    const S = index.symbols[id];
    if (CODE_KINDS.has(S.kind)) symbols[id] = symbolStatus(index, lock, state, config, id, cov);
  }
  for (const id of ids) { // classes: min of their members
    const S = index.symbols[id];
    if (S.kind !== "class") continue;
    const mem = Object.values(index.symbols).filter((m) => m.parent === id && CODE_KINDS.has(m.kind))
      .filter((m) => symbols[m.id]).map((m) => symbols[m.id]); // tracked members only
    if (mem.length) symbols[id] = { status: minStatus(mem.map((m) => m.status)), stale: mem.some((m) => m.stale), reasons: ["min of members"] };
  }

  const out = {};
  for (const T of [...taskIds].sort()) {
    const task = tasks.find((t) => t.id === T);
    const syms = perTaskSyms[T].filter((id) => symbols[id] && CODE_KINDS.has(index.symbols[id].kind));
    const lt = lock.tasks?.[T];
    const testsLocked = !!lt?.testsAt || Object.values(lock.tests || {}).some((t) => t.task === T && t.stage === "locked");
    let status;
    if (!syms.length) status = lt?.doneAt ? "done" : "todo";
    else {
      const sts = syms.map((id) => symbols[id].status);
      const anyStub = syms.some((id) => index.symbols[id].stub);
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
    out[T] = { status, next: nextForTask(T, status, { risk, testsLocked }), symbols: syms, testsLocked, risk, override: isOverride(lock, T) };
  }
  return { symbols, tasks: out };
}
