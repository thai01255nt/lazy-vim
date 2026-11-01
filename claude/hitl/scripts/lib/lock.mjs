// P2 — skeleton.lock.json (hitl.lock/1) IO + approve planning (§E.5).
// Also hosts the small shared helpers used by the other P2 modules (paths, sorted atomic JSON, index lock,
// lazy P1 api loader) so that P2 code is testable without P1 being present.
import { promises as fsp } from "node:fs";
import { join, dirname, basename } from "node:path";
import { HITL_DIR } from "./paths.mjs";

export const LOCK_SCHEMA = "hitl.lock/1";

// ---------------------------------------------------------------- shared helpers
/** Fixed per-project layout (§A). Mirrors P1 api.paths for the files P2 owns/reads. */
export function p2paths(root) {
  const custom = join(root, HITL_DIR);
  const index = join(custom, "index");
  return {
    custom, index,
    indexJson: join(index, "index.json"),
    lock: join(index, "skeleton.lock.json"),
    state: join(index, "state.json"),
    idxLock: join(index, ".lock"),
    tasks: join(custom, "tasks"),
    planning: join(custom, "planning"),
    specs: join(custom, "specs"),
    changes: join(custom, "changes"),
    archive: join(custom, "archive"),
    reviews: join(custom, "reviews"),
    config: join(custom, "hitl.config.json"),
  };
}

let apiPromise = null;
/** Lazily import P1's api.mjs; resolves to null when it is not available (unit tests). */
export function loadApi() {
  if (!apiPromise) apiPromise = import("./api.mjs").catch(() => null);
  return apiPromise;
}

export function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = sortKeys(v[k]);
    return o;
  }
  return v;
}
export function stableStringify(obj) { return JSON.stringify(sortKeys(obj), null, 2) + "\n"; }

export async function readJsonFile(file, fallback) {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); } catch { return fallback; }
}

export async function writeFileAtomic(file, text) {
  await fsp.mkdir(dirname(file), { recursive: true });
  const tmp = join(dirname(file), `.${basename(file)}.${process.pid}.${Date.now()}.tmp`);
  await fsp.writeFile(tmp, text);
  await fsp.rename(tmp, file);
}
export async function writeJsonSorted(file, obj) { await writeFileAtomic(file, stableStringify(obj)); }

/** Same protocol as P1 fsutil.withIndexLock (§E.10): index/.lock with wx, retry 100ms up to 3s, steal if >15s old. */
export async function withLock(root, fn) {
  const lockFile = p2paths(root).idxLock;
  await fsp.mkdir(dirname(lockFile), { recursive: true });
  const start = Date.now();
  let fh = null;
  while (!fh) {
    try { fh = await fsp.open(lockFile, "wx"); }
    catch (e) {
      if (e.code !== "EEXIST") throw e;
      try {
        const st = await fsp.stat(lockFile);
        if (Date.now() - st.mtimeMs > 15000) { await fsp.rm(lockFile, { force: true }); continue; }
      } catch { continue; }
      if (Date.now() - start > 3000) throw new Error("hitl: index lock busy (" + lockFile + ")");
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  try { await fh.writeFile(String(process.pid)); await fh.close(); return await fn(); }
  finally { await fsp.rm(lockFile, { force: true }); }
}

export const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------- lock IO
export function emptyLock() { return { schema: LOCK_SCHEMA, symbols: {}, tests: {}, tasks: {} }; }

export function normalizeLock(l) {
  const lock = l && typeof l === "object" ? l : {};
  if (lock.schema && lock.schema !== LOCK_SCHEMA) {
    const major = String(lock.schema).split("/")[1];
    if (Number(major) > 1) throw new Error(`skeleton.lock.json has newer schema ${lock.schema}; update the hitl plugin`);
  }
  return { schema: LOCK_SCHEMA, symbols: lock.symbols || {}, tests: lock.tests || {}, tasks: lock.tasks || {} };
}

export async function readLock(root) { return normalizeLock(await readJsonFile(p2paths(root).lock, null)); }
export async function writeLock(root, lock) {
  await withLock(root, () => writeJsonSorted(p2paths(root).lock, normalizeLock(lock)));
}

// ---------------------------------------------------------------- task/symbol helpers (pure)
export const CODE_KINDS = new Set(["function", "method", "const"]);
export const isTest = (s) => s && s.kind === "test";

export function resolveRefLocal(index, ref, fromFile) {
  if (!ref || !index?.symbols) return null;
  if (index.symbols[ref]) return { id: ref };
  const ids = Object.keys(index.symbols).filter((id) => id.endsWith("#" + ref) || index.symbols[id].name === ref);
  if (ids.length === 1) return { id: ids[0] };
  if (ids.length > 1) {
    if (fromFile) { const same = ids.filter((i) => index.symbols[i].file === fromFile); if (same.length === 1) return { id: same[0] }; }
    return { ambiguous: ids };
  }
  return null;
}

/** Resolve a ref via P1 api.resolveRef when given, else the local fallback. */
export function resolveWith(api, index, ref, fromFile) {
  try { if (api?.resolveRef) return api.resolveRef(index, ref, fromFile); } catch { /* fall through */ }
  return resolveRefLocal(index, ref, fromFile);
}

export function coversOf(index, t) {
  if (Array.isArray(t?.test?.coversResolved)) return t.test.coversResolved;
  const out = [];
  for (const r of t?.tags?.covers || []) { const x = resolveRefLocal(index, r, t.file); if (x?.id) out.push(x.id); }
  return out;
}

/** Code symbols belonging to task T: tagged @task T, plus resolved `### Symbols` refs of the task. */
export function taskSymbolIds(index, taskId, task, api) {
  const ids = new Set();
  for (const [id, s] of Object.entries(index?.symbols || {})) {
    if (!isTest(s) && s.kind !== "suite" && (s.tags?.task || []).includes(taskId) && (CODE_KINDS.has(s.kind) || s.kind === "class")) ids.add(id);
  }
  for (const sym of task?.symbols || []) {
    const r = resolveWith(api, index, sym.ref, sym.file);
    if (r?.id && !isTest(index.symbols[r.id])) ids.add(r.id);
  }
  // classes are tracked only through their members unless tagged; keep only code kinds + tagged classes
  return [...ids].sort();
}

/** Test symbols of task T: @ac of the task, @task T, or covering one of its symbols. */
export function taskTestIds(index, taskId, symIds) {
  const symSet = new Set(symIds);
  const pre = taskId + ".AC";
  const out = [];
  for (const [id, s] of Object.entries(index?.symbols || {})) {
    if (!isTest(s)) continue;
    const acs = s.tags?.ac || [];
    if (acs.some((a) => a.startsWith(pre)) || (s.tags?.task || []).includes(taskId) || coversOf(index, s).some((c) => symSet.has(c))) out.push(id);
  }
  return out.sort();
}

/** An unresolved call made through `super`: the call itself (`super`, `super(...)`) or a member of it (`super.m`, `super().m`). */
export function isSuperCall(u) {
  const dot = u.lastIndexOf("."), qual = dot < 0 ? u : u.slice(0, dot);
  return /^super(\(.*\))?$/.test(qual);
}

/**
 * Index symbols that still point at removed symbol id `r` (an unresolved @calls/@covers tag naming it, or an unresolved
 * call to its last name segment). Drift reports these as DELETED_REFERENCED; approve refuses to prune such a symbol.
 * Calls through `super` (Python `super().m` / `super(C, self).m`, TS/JS/Java `super.m` / `super(...)`) are skipped:
 * they target the caller's own base class, and matching them by last segment made every `super().__init__()` a
 * reference to any deleted `X.__init__`.
 * `resolve(ref, fromFile)` defaults to the local resolver; drift passes P1 graph.resolveRef.
 */
export function referencesTo(index, r, resolve = (ref, file) => resolveRefLocal(index, ref, file)) {
  const name = r.slice(r.indexOf("#") + 1), last = name.split(".").at(-1);
  const refs = [];
  for (const [id, s] of Object.entries(index?.symbols || {})) {
    const tagRefs = [...(s.tags?.calls || []), ...(s.tags?.covers || [])];
    const hitTag = tagRefs.some((t) => !resolve(t, s.file) && (t === r || t === name || name.endsWith("." + t)));
    const hitCall = (s.unresolvedCalls || []).some((u) => !isSuperCall(u) && u.split(".").at(-1) === last);
    if (hitTag || hitCall) refs.push(id);
  }
  return refs.sort();
}

/**
 * Tag-based rename detection: a locked symbol L missing from the index and an unlocked index symbol N form a pair when
 * N is in L's file, tagged `@task <L.task>`, and its `@prio` equals L's locked `prio` (entries locked without prio never
 * match). One-to-one only: L with 0 or >1 candidates, or N matching >1 L, yields no pair (delete + add instead).
 * Returns [{from, to, task}] sorted by `from`.
 */
export function renamePairs(index, lock) {
  const S = index?.symbols || {}, L = lock?.symbols || {};
  const cand = new Map(), back = new Map();
  for (const [old, l] of Object.entries(L)) {
    if (S[old] || l.prio == null) continue;
    const file = old.slice(0, old.indexOf("#"));
    const ns = Object.values(S).filter((s) => s.file === file && !L[s.id] && !isTest(s) && s.kind !== "suite"
      && (s.tags?.task || []).includes(l.task) && s.tags?.prio === l.prio).map((s) => s.id);
    cand.set(old, ns);
    for (const n of ns) back.set(n, (back.get(n) || 0) + 1);
  }
  const out = [];
  for (const [from, ns] of cand) if (ns.length === 1 && back.get(ns[0]) === 1) out.push({ from, to: ns[0], task: L[from].task });
  return out.sort((a, b) => a.from.localeCompare(b.from));
}

export function taskRisk(task, lock, taskId) { return task?.risk || lock?.tasks?.[taskId]?.risk || "high"; }

/** `--by` values. "human-override" = the user forced the fast lane (`/hitl:implement <T> --lane fast`, hook token). */
export const APPROVERS = ["human", "auto", "human-override"];
export const OVERRIDE = "human-override";

/** True when any part of task T was approved through a human fast-lane override (sticky: never cleared by tooling). */
export function isOverride(lock, taskId) {
  if (!lock || !taskId) return false;
  if (lock.tasks?.[taskId]?.override) return true;
  if (Object.values(lock.symbols || {}).some((s) => s.task === taskId && s.approvedBy === OVERRIDE)) return true;
  return Object.values(lock.tests || {}).some((t) => t.task === taskId && t.lockedBy === OVERRIDE);
}

// ---------------------------------------------------------------- approve planning (pure)
const STAGES = ["skeleton", "tests", "done"];

export function defaultStage(lock, taskId) {
  const t = lock.tasks[taskId];
  if (!t || !t.skeletonAt) return "skeleton";
  if (!t.testsAt) return "tests";
  return "done";
}

const SENTINEL = "TODO(impl)";

/**
 * Plan an approval. Pure: returns {ok, stage, reasons[], changes, lock(new)}.
 * opts: {taskId, stage?, symbols?:[refs], by:"human"|"auto"|"human-override", force?, index, lock, state, config, task, tasks, statuses, api?, now?}
 */
export function planApproval(opts) {
  const { taskId, index, state = {}, config = {}, task, statuses, api } = opts;
  const by = opts.by || "human";
  const now = opts.now || nowIso();
  const lock = normalizeLock(JSON.parse(JSON.stringify(opts.lock || emptyLock())));
  const stage = opts.stage || defaultStage(lock, taskId);
  const reasons = [];
  const changes = { symbols: { new: [], changed: [], unchanged: [], removed: [], renamed: [] }, tests: { new: [], changed: [], unchanged: [], removed: [] }, acCoverage: {} };
  const res = (ok) => ({ ok, stage, task: taskId, by, reasons, changes, lock });

  if (!STAGES.includes(stage)) { reasons.push(`unknown stage "${stage}" (skeleton|tests|done)`); return res(false); }
  if (!index?.symbols) { reasons.push("index missing: run hitl-index index --all"); return res(false); }
  if (!task && !lock.tasks[taskId]) { reasons.push(`task ${taskId} not found in tasks/*.md`); return res(false); }

  const risk = taskRisk(task, lock, taskId);
  if (!APPROVERS.includes(by)) { reasons.push(`--by must be one of ${APPROVERS.join("|")}`); return res(false); }
  if (by === "auto" && risk === "high") { reasons.push("auto approval only for low-risk tasks"); return res(false); }
  if (by === OVERRIDE && stage === "done") { reasons.push("human-override covers skeleton and tests only; done needs /hitl:approve " + taskId + " done after the review"); return res(false); }

  const allIds = taskSymbolIds(index, taskId, task, api); // incl. tagged classes (locked for sig/intent drift)
  const symIds = allIds.filter((id) => CODE_KINDS.has(index.symbols[id].kind));
  const testIds = taskTestIds(index, taskId, symIds);
  const lt = lock.tasks[taskId] || { file: task?.file || null, risk, skeletonAt: null, testsAt: null, doneAt: null, doneBodyHashes: {} };
  lt.file = task?.file || lt.file || null;
  lt.risk = risk;

  if (stage === "skeleton") {
    const nm = (id) => id.slice(id.indexOf("#") + 1);
    const pairs = renamePairs(index, lock).filter((p) => p.task === taskId);
    const pairOf = (ref) => pairs.find((p) => p.from === ref || nm(p.from) === ref);
    if (task?.parseErrors?.length) reasons.push(`tasks file parse errors: ${task.parseErrors.map((e) => e.message || e).join("; ")}`);
    for (const sym of task?.symbols || []) {
      const r = resolveWith(api, index, sym.ref, sym.file);
      const rn = !r && pairOf(sym.ref);
      if (rn) reasons.push(`symbol ${sym.ref} was renamed to ${nm(rn.to)}: update its ### Symbols row in ${task.file || "the tasks md"} (and any @covers/@calls naming it)`);
      else if (!r) reasons.push(`symbol ${sym.ref} not found in index (expected in ${sym.file})`);
      else if (r.ambiguous) reasons.push(`symbol ${sym.ref} is ambiguous: ${r.ambiguous.join(", ")}`);
      else if (!(index.symbols[r.id].tags?.task || []).includes(taskId)) reasons.push(`symbol ${sym.ref} has no @task ${taskId} tag`);
    }
    for (const ac of task?.acs || []) {
      const cov = testIds.filter((t) => (index.symbols[t].tags?.ac || []).includes(ac.id));
      changes.acCoverage[ac.id] = cov;
      if (!cov.length) reasons.push(`${ac.id} has no test stub with @ac ${ac.id}`);
    }
    if (!symIds.length) reasons.push(`no indexed symbols tagged @task ${taskId}`);
    if (reasons.length && !opts.force) return res(false);

    // Locked symbols of T gone from the index are pruned (all of them, or only the listed ones with --symbols).
    // Rename pairs (renamePairs) move their entry to the new id instead; in scope when either old or new ref is listed.
    const renamedFrom = new Set(pairs.map((p) => p.from));
    const gone = Object.keys(lock.symbols).filter((id) => lock.symbols[id].task === taskId && !index.symbols[id] && !renamedFrom.has(id));
    let pick = allIds, prune = gone, renames = pairs;
    if (opts.symbols?.length) {
      pick = []; prune = []; renames = [];
      for (const ref of opts.symbols) {
        const r = resolveWith(api, index, ref);
        if (r?.id) { pick.push(r.id); const p = pairs.find((x) => x.to === r.id); if (p) renames.push(p); continue; }
        const p = pairOf(ref);
        if (p) { renames.push(p); pick.push(p.to); continue; }
        const g = gone.filter((id) => id === ref || id.endsWith("#" + ref));
        if (g.length === 1) prune.push(g[0]);
        else reasons.push(`--symbols: ${ref} not resolvable`);
      }
      if (reasons.length) return res(false);
      pick = [...new Set(pick)]; renames = [...new Set(renames)];
    }
    const before = reasons.length;
    for (const p of renames) {
      const refs = referencesTo(index, p.from, (t, f) => resolveWith(api, index, t, f));
      if (refs.length) reasons.push(`${nm(p.from)} was renamed to ${nm(p.to)} but the old name is still referenced by ${refs.map((x) => index.symbols[x]?.name || x).join(", ")}: update those callers/@calls/@covers (and the tasks md ### Symbols row) first`);
    }
    if (reasons.length > before) return res(false); // old name still referenced: refused even with --force
    const renameTo = new Map(renames.map((p) => [p.to, p.from]));
    const referenced = new Set();
    for (const id of prune) {
      const refs = referencesTo(index, id, (t, f) => resolveWith(api, index, t, f));
      if (!refs.length) continue;
      referenced.add(id);
      reasons.push(`${id.slice(id.indexOf("#") + 1)} was removed but is still referenced by ${refs.map((x) => index.symbols[x]?.name || x).join(", ")}: restore it or update those callers/@calls/@covers before pruning it from the lock`);
    }
    if (reasons.length && !opts.force) return res(false);
    for (const id of prune) {
      if (referenced.has(id)) continue;
      delete lock.symbols[id];
      if (lt.doneBodyHashes) delete lt.doneBodyHashes[id];
      changes.symbols.removed.push(id);
    }
    for (const id of pick) {
      const s = index.symbols[id];
      const from = renameTo.get(id);
      const prev = lock.symbols[id] || (from && lock.symbols[from]);
      let entry = { task: taskId, impl: s.tags?.impl || "agent", signature: s.signature, intent: s.intent, todos: s.todos || [],
        sigHash: s.sigHash, intentHash: s.intentHash, todoHash: s.todoHash, prio: s.tags?.prio ?? undefined, approvedAt: now, approvedBy: by };
      if (from) {
        entry = { ...prev, ...entry, renamedFrom: from };
        delete lock.symbols[from];
        if (lt.doneBodyHashes?.[from]) { lt.doneBodyHashes[id] = lt.doneBodyHashes[from]; delete lt.doneBodyHashes[from]; }
        changes.symbols.renamed.push({ from, to: id });
      } else if (!prev) changes.symbols.new.push(id);
      else {
        const what = [];
        if (prev.sigHash !== s.sigHash) what.push("sig");
        if (prev.intentHash !== s.intentHash) what.push("intent");
        if (prev.todoHash !== s.todoHash) what.push("todo");
        if (prev.impl !== entry.impl) what.push("impl");
        if (what.length) changes.symbols.changed.push({ id, what }); else changes.symbols.unchanged.push(id);
      }
      lock.symbols[id] = entry;
    }
    if (!opts.symbols?.length) {
      for (const id of testIds) {
        const t = index.symbols[id];
        const prev = lock.tests[id];
        if (prev && prev.stage === "locked") { changes.tests.unchanged.push(id); continue; } // never downgrade locked tests
        const entry = testEntry(index, t, taskId, "stub", now, by);
        if (!prev) changes.tests.new.push(id);
        else if (prev.bodyHash !== entry.bodyHash || prev.intentHash !== entry.intentHash) changes.tests.changed.push({ id, what: ["body"] });
        else changes.tests.unchanged.push(id);
        lock.tests[id] = entry;
      }
    }
    lt.skeletonAt = now;
  } else if (stage === "tests") {
    if (!lt.skeletonAt && !opts.force) { reasons.push(`skeleton of ${taskId} not approved yet: /hitl:approve ${taskId}`); return res(false); }
    const runs = state.runs || {};
    // Re-lock (tests already locked once): red is required only for the first lock. Tests added later
    // (mutation killers, fix-loop regressions) may already be green; they still need a fresh run.
    const relock = !!lt.testsAt;
    const active = testIds.filter((id) => index.symbols[id].test?.mode === "active");
    if (!active.length) reasons.push("no active tests cover the task (fill the stubs with /hitl:test first)");
    for (const id of active) {
      const t = index.symbols[id];
      const r = runs[id];
      const name = t.name || id;
      if (!r) reasons.push(`${name}: no recorded run (hitl-index test --task ${taskId})`);
      else if (r.testBodyHash !== t.bodyHash) reasons.push(`${name}: run is stale (test changed since last run)`);
      else if (r.outcome === "pass" && !relock) reasons.push(`${name}: passes against the stub (vacuous test)`);
      else if (r.outcome === "error" && !String(r.message || "").includes(SENTINEL)) reasons.push(`${name}: errors without the TODO(impl) sentinel: ${r.message || ""}`);
      else if (r.outcome === "skip") reasons.push(`${name}: skipped`);
    }
    if (reasons.length && !opts.force) return res(false);
    for (const id of Object.keys(lock.tests)) {
      if (lock.tests[id].task === taskId && !index.symbols[id]) { delete lock.tests[id]; changes.tests.removed.push(id); }
    }
    for (const id of testIds) {
      const t = index.symbols[id];
      const prev = lock.tests[id];
      const entry = testEntry(index, t, taskId, "locked", now, by);
      if (!prev) changes.tests.new.push(id);
      else if (prev.stage !== "locked" || prev.bodyHash !== entry.bodyHash) changes.tests.changed.push({ id, what: prev.stage !== "locked" ? ["stage"] : ["body"] });
      else changes.tests.unchanged.push(id);
      lock.tests[id] = entry;
    }
    lt.testsAt = now;
  } else if (stage === "done") {
    const rv = state.reviews?.[taskId];
    if (by === "auto" && rv?.verdict !== "PASS") { reasons.push("auto done-approval requires review verdict PASS"); return res(false); }
    const st = statuses?.symbols || {};
    for (const id of symIds) {
      const s = st[id]?.status;
      const okGreen = s === "green" && rv?.verdict === "PASS" && !config.mutationRequired;
      if (!(s === "verified" || s === "done" || okGreen)) reasons.push(`${index.symbols[id].name}: status ${s || "unknown"} (needs verified)`);
    }
    if (!symIds.length) reasons.push("task has no symbols");
    if (reasons.length && !opts.force) return res(false);
    lt.doneAt = now;
    lt.doneBodyHashes = {};
    for (const id of symIds) { lt.doneBodyHashes[id] = index.symbols[id].bodyHash; changes.symbols.unchanged.push(id); }
  }
  if (by === OVERRIDE) { lt.override = true; lt.overrideAt = now; }
  lock.tasks[taskId] = lt;
  return res(true);
}

function testEntry(index, t, taskId, stage, now, by) {
  const origin = ["skeleton", "test-author", "human"].includes(t.tags?.origin) ? t.tags.origin : (t.tags?.origin ? "human" : "skeleton");
  const e = { task: taskId, covers: coversOf(index, t), ac: t.tags?.ac || [], kind: t.tags?.kind || "example", stage,
    bodyHash: t.bodyHash, intentHash: t.intentHash, origin };
  if (stage === "locked") { e.lockedAt = now; e.lockedBy = by; }
  return e;
}
