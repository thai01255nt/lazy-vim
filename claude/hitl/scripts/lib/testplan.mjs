// 0.16 test policy: the per-AC test decision of a task's `### Test plan` (the `test` cell), its checks, the test
// budget, `covered:` resolution and the read-only prune-candidate audit (`hitl-index tests audit`). Pure.
//
// A test-plan row's `test` cell is one of (an AC may have several rows):
//   new: <the defect it catches>    a new test at the row's seam (the skeleton writes its stub)
//   shared: <ACk>                   the test of ACk (a `new` row of the same task) proves this AC too (one test, both @ac)
//   covered: <test id|title|AC id>  an existing test already proves it (index id `file#title`, a test title, or an AC id
//                                   whose tests prove it)
//   none: <reason>                  no automated test (type-checked, pure wiring, config); never for a task with risk
//                                   reason security, concurrency or data
//   manual: <check>                 a human check, listed at /hitl:approve <T> done; never for a task with risk reason
//                                   security, concurrency or data (such a task keeps an automated test per AC)
// A row without a `test` cell (tables written before 0.16, 5 columns) reads as `new` with no defect named.
import { AC_ID_RE } from "./specids.mjs";

export const TEST_DECISIONS = ["new", "shared", "covered", "none", "manual"];
/** Risk reasons whose tasks may not use `none:` (decision 5): the task meta line's reasons. */
export const NONE_BLOCK = ["security", "concurrency", "data"];
/** Soft budget per task: active own tests ≤ `new` rows + BUDGET_EXTRA (a warning at the tests lock, never a block). */
export const BUDGET_EXTRA = 2;
const STRENGTH = { new: 0, shared: 1, covered: 2, manual: 3, none: 4 };
const DASH = /^(?:—|-+|–|n\/a)?$/i;

/** `"new: dup email saved"` → {test:"new", detail:"dup email saved"}; "" → {test:null}; unknown → {test:null, bad:true}. */
export function parseTestCell(cell) {
  const raw = String(cell ?? "").trim();
  if (!raw) return { test: null, detail: null, bad: false };
  const m = /^([a-z]+)\s*(?::\s*(.*))?$/i.exec(raw);
  const kw = m?.[1]?.toLowerCase();
  if (!m || !TEST_DECISIONS.includes(kw)) return { test: null, detail: null, bad: true, raw };
  const detail = (m[2] ?? "").trim();
  return { test: kw, detail: detail || null, bad: false };
}

/** Normalised cell: "—"/"-"/"" → null. */
export const cellValue = (c) => (DASH.test(String(c ?? "").trim()) ? null : String(c).trim());

/** Full AC id of a row's `ac` cell (`AC1` → `PWR-T12.AC1`). */
export const acKey = (taskId, ac) => (AC_ID_RE.test(ac) ? ac : `${taskId}.${String(ac).replace(/^\./, "")}`);

/** Rows of one AC of task t. */
export const rowsOf = (t, acId) => (t?.testPlan || []).filter((r) => acKey(t.id, r.ac) === acId);

/**
 * The test decision of one AC: {test, rows, detail, sharedWith, covered:[refs], manual:[checks], none:[reasons]}.
 * No row (or no plan) → `new` (the pre-0.16 meaning). Several rows: the strongest decision wins (new > shared >
 * covered > manual > none); the manual checks and none reasons of every row are kept.
 */
export function acPlan(t, acId) {
  const rows = rowsOf(t, acId);
  const out = { test: "new", rows, detail: null, sharedWith: null, covered: [], manual: [], none: [] };
  if (!rows.length) return out;
  let best = null;
  for (const r of rows) {
    const d = r.test || "new";
    if (best === null || STRENGTH[d] < STRENGTH[best]) best = d;
    if (d === "shared" && r.detail && !out.sharedWith) out.sharedWith = acKey(t.id, r.detail);
    if (d === "covered" && r.detail) out.covered.push(r.detail);
    if (d === "manual" && r.detail) out.manual.push(r.detail);
    if (d === "none" && r.detail) out.none.push(r.detail);
    if (d === "new" && r.detail && !out.detail) out.detail = r.detail;
  }
  out.test = best;
  if (best === "none") out.detail = out.none.join("; ") || null;
  if (best === "manual") out.detail = out.manual.join("; ") || null;
  if (best === "covered") out.detail = out.covered.join("; ") || null;
  if (best === "shared") out.detail = out.sharedWith;
  return out;
}

/** Number of `new` rows of a task (rows without a test cell count as new). */
export const newRowCount = (t) => (t?.testPlan || []).filter((r) => (r.test || "new") === "new").length;
/** True when the task's risk reasons forbid `none:`; returns the hit reasons. */
export const noneBlockedBy = (t) => (t?.riskReasons || []).filter((r) => NONE_BLOCK.includes(String(r).toLowerCase()));

/** Validation errors of a task's test plan (strings with a code prefix; `tasks --check`). */
export function checkTestPlan(t) {
  const errors = [];
  const acs = new Set((t.acs || []).map((a) => a.id));
  const blocked = noneBlockedBy(t);
  for (const r of t.testPlan || []) {
    const ac = acKey(t.id, r.ac);
    if (r.bad) { errors.push(`TEST_PLAN_BAD: ${ac} test "${r.raw}" (want new: <defect it catches> | shared: <ACk> | covered: <test or AC id> | none: <reason> | manual: <check>)`); continue; }
    if (r.legacy) continue;
    const d = r.test;
    if (!d) { errors.push(`TEST_PLAN_BAD: ${ac} has an empty test cell (want new: <defect it catches> | shared: <ACk> | covered: <test or AC id> | none: <reason> | manual: <check>)`); continue; }
    if (d === "new" && !r.detail) errors.push(`TEST_PLAN_NO_DEFECT: ${ac} new test names no defect (write "new: <the defect it catches>")`);
    if (d !== "new" && !r.detail) errors.push(`TEST_PLAN_EMPTY: ${ac} "${d}:" needs ${{ shared: "the AC whose test it shares", covered: "the test (id, title or AC id)", none: "a reason", manual: "the check" }[d]}`);
    if (d === "shared" && r.detail) {
      const k = acKey(t.id, r.detail);
      if (k === ac) errors.push(`TEST_PLAN_SHARED: ${ac} shares its own test`);
      else if (!acs.has(k)) errors.push(`TEST_PLAN_SHARED: ${ac} shared: ${r.detail} is not an AC of ${t.id}`);
      else if (!rowsOf(t, k).some((x) => (x.test || "new") === "new")) errors.push(`TEST_PLAN_SHARED: ${ac} shared: ${r.detail} has no new row (share a planned new test)`);
    }
    if ((d === "none" || d === "manual") && blocked.length) errors.push(`TEST_PLAN_NONE_RISK: ${ac} "${d}:" is not allowed: ${t.id} has risk ${blocked.join(", ")} (keep an automated test: new, shared or covered)`);
  }
  return errors;
}

/** Cross-task `covered: <AC id>` refs that name no known AC: errors. */
export function checkCoveredAcRefs(t, allAcIds) {
  const errors = [];
  for (const r of t.testPlan || []) {
    if (r.test !== "covered" || !r.detail) continue;
    if (AC_ID_RE.test(r.detail) && !allAcIds.has(r.detail)) errors.push(`TEST_PLAN_COVERED: ${acKey(t.id, r.ac)} covered: ${r.detail} is not a known AC`);
  }
  return errors;
}

const isTestSym = (s) => !!s && (s.kind === "test" || !!s.test);
const titleOf = (s) => s?.test?.titlePath?.at(-1) ?? s?.name ?? "";

/**
 * Index test ids a `covered:` ref resolves to: an AC id → the tests carrying that `@ac`; an index id (`file#title`)
 * → that test; else a title (last title, the full title path joined with " > ", or the symbol name). [] = unresolved.
 */
export function resolveCovered(index, ref) {
  const S = index?.symbols || {};
  const x = String(ref || "").trim();
  if (!x) return [];
  if (AC_ID_RE.test(x)) return Object.values(S).filter((s) => isTestSym(s) && (s.tags?.ac || []).includes(x)).map((s) => s.id).sort();
  if (isTestSym(S[x])) return [x];
  const strip = x.replace(/^["'`]|["'`]$/g, "");
  return Object.values(S).filter((s) => isTestSym(s) && (titleOf(s) === strip || (s.test?.titlePath || []).join(" > ") === strip || s.name === strip)).map((s) => s.id).sort();
}

/** Every test id the `covered:` rows of task t resolve to (for `hitl-index test --task`). */
export function coveredTestIds(index, t) {
  const out = new Set();
  for (const r of t?.testPlan || []) if (r.test === "covered" && r.detail) for (const id of resolveCovered(index, r.detail)) out.add(id);
  return [...out].sort();
}

/** Ids in a test name (`PWR-T12`, `PWR-T12.AC1`, `T12_AC1`): names carry behaviour, ids live in `@ac` (0.16). */
export const ID_IN_NAME = /\b[A-Z]{2,5}-T\d+(?:\.AC\d+)?\b|(?:^|_)T\d+_AC\d+(?:_|$)/;

/**
 * Duplicate test names in one test file: the indexer renames a repeated symbol to `<name>~<n>` (DUP_ID). In Python
 * the later definition silently replaces the earlier one; elsewhere results cannot be told apart.
 * @returns [{file, name, ids:[...], suggestion}]
 */
export function duplicateTestNames(index, files = null) {
  const S = index?.symbols || {};
  const want = files ? new Set(files) : null;
  const groups = new Map();
  for (const s of Object.values(S)) {
    if (!isTestSym(s) || (want && !want.has(s.file))) continue;
    const base = String(s.name).replace(/~\d+$/, "");
    const k = `${s.file}\0${base}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s.id);
  }
  const out = [];
  for (const [k, ids] of groups) {
    if (ids.length < 2) continue;
    const [file, name] = k.split("\0");
    const last = name.split(/\.| > /).at(-1);
    out.push({ file, name, ids: ids.sort(), suggestion: `rename all but one, each after the behaviour it checks (e.g. ${last}_<what differs>)` });
  }
  return out.sort((a, b) => (a.file + a.name < b.file + b.name ? -1 : 1));
}

/**
 * Test budget of one task: {newRows, limit, tests, over, extras:[{id, name, catches}]}. `tests` = the task's own active
 * tests (one per test symbol: a table test counts once); extras = own active tests that were not in the lock before
 * (not a skeleton stub), e.g. edge-case extras, mutation killers, fix-loop tests.
 */
export function testBudget(index, lock, t, ownActiveIds) {
  const S = index?.symbols || {};
  const newRows = t?.testPlan?.length ? newRowCount(t) : (t?.acs || []).length;
  const limit = newRows + BUDGET_EXTRA;
  const extras = ownActiveIds.filter((id) => !lock?.tests?.[id]).map((id) => ({ id, name: titleOf(S[id]) || id, catches: S[id]?.tags?.catches ?? null }));
  return { newRows, limit, tests: ownActiveIds.length, over: ownActiveIds.length > limit, extras };
}

/**
 * Read-only prune candidates (`hitl-index tests audit`). inputs: {index, lock, state, tasks}; scope: {tasks:[ids]|null}.
 * Codes: NO_DEFECT (no `@catches` and no `new: <defect>` row behind its ACs), NO_AC (covers task code, no `@ac`),
 * DUPLICATE (same `@ac` set at the same seam, one task), OVERLAP_TRACER (AC1 tests of several tasks of one change at the
 * same seam), NO_KILL / NO_UNIQUE_KILL (mutation kill data exists for its symbols: kills nothing / nothing another test
 * does not also kill), OFF_SEAM (the row's seam symbol is not among its covers), DUP_NAME (block at lock), NAME_HAS_ID (info).
 * @returns {schema, scope, tests, candidates:[{code, level, test, title, file, task, acs, message, related}], counts, budget:[…]}
 */
export function auditTests({ index, lock = {}, state = {}, tasks = [] }, scope = {}) {
  const S = index?.symbols || {};
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const inScope = scope.tasks ? new Set(scope.tasks) : null;
  const taskOfAc = (a) => String(a).split(".")[0];
  const symTask = new Map();
  for (const s of Object.values(S)) if (!isTestSym(s)) for (const T of s.tags?.task || []) { if (!symTask.has(s.id)) symTask.set(s.id, []); symTask.get(s.id).push(T); }
  for (const t of tasks) for (const row of t.symbols || []) {
    const hit = Object.values(S).find((s) => !isTestSym(s) && s.file === row.file && (s.name === row.ref || s.name.endsWith(`.${row.ref}`)));
    if (hit) { if (!symTask.has(hit.id)) symTask.set(hit.id, []); if (!symTask.get(hit.id).includes(t.id)) symTask.get(hit.id).push(t.id); }
  }
  const ownerOf = (s) => {
    const acs = s.tags?.ac || [];
    const lt = lock?.tests?.[s.id]?.task;
    if (lt && acs.some((a) => taskOfAc(a) === lt)) return lt;
    if (acs.length) return taskOfAc(acs[0]);
    return (s.tags?.task || [])[0] || lt || (s.test?.coversResolved || []).flatMap((c) => symTask.get(c) || [])[0] || null;
  };
  const tests = Object.values(S).filter(isTestSym).filter((s) => {
    const o = ownerOf(s);
    const tasksOf = new Set([o, ...(s.tags?.ac || []).map(taskOfAc), ...(s.test?.coversResolved || []).flatMap((c) => symTask.get(c) || [])].filter(Boolean));
    if (!tasksOf.size) return false;
    return !inScope || [...tasksOf].some((x) => inScope.has(x));
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  const candidates = [];
  const add = (code, level, s, message, related = []) => candidates.push({ code, level, test: s.id, title: titleOf(s), file: s.file, task: ownerOf(s), acs: s.tags?.ac || [], message, related });
  const seamOf = (s) => [...(s.test?.coversResolved || [])].sort().join(",");

  for (const s of tests) {
    const acs = s.tags?.ac || [];
    const named = !!s.tags?.catches || acs.some((a) => { const t = taskById.get(taskOfAc(a)); return t && rowsOf(t, a).some((r) => r.test === "new" && r.detail); });
    if (!named) add("NO_DEFECT", "warn", s, "names no defect it catches (no @catches, no `new: <defect>` row behind its @ac): delete it, or name the defect");
    if (!acs.length && (s.test?.coversResolved || []).some((c) => symTask.has(c))) add("NO_AC", "warn", s, "covers task code but proves no AC (@ac): delete it, or tag the AC it proves");
    if (ID_IN_NAME.test(titleOf(s)) || ID_IN_NAME.test(String(s.name))) add("NAME_HAS_ID", "info", s, "its name carries a planning id (ids live in @ac since 0.16); no rename required");
    for (const a of acs) {
      const t = taskById.get(taskOfAc(a));
      const row = t && rowsOf(t, a).find((r) => (r.test || "new") === "new" && r.seam && cellValue(r.seam));
      if (!row) continue;
      const seam = cellValue(row.seam).replace(/\s*\(.*$/, "").trim();
      const covers = (s.test?.coversResolved || []).map((c) => S[c]?.name || c.split("#").pop());
      if (seam && covers.length && !covers.some((n) => n === seam || n.endsWith(`.${seam}`) || seam.endsWith(`.${n}`))) add("OFF_SEAM", "info", s, `enters at ${covers.join(", ")}, not at the row's seam ${seam}`);
    }
  }
  // duplicate coverage: same AC set at the same seam
  const groups = new Map();
  for (const s of tests) {
    const acs = [...(s.tags?.ac || [])].sort();
    if (!acs.length) continue;
    const k = `${acs.join(",")}\0${seamOf(s)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  for (const g of groups.values()) if (g.length > 1) for (const s of g) add("DUPLICATE", "warn", s, `proves the same ACs (${(s.tags.ac || []).join(", ")}) at the same seam as ${g.length - 1} other test(s): merge into one table test, or keep one`, g.filter((x) => x !== s).map((x) => x.id));
  // overlapping tracers: AC1 tests of several tasks of one change at the same seam
  const tracer = new Map();
  for (const s of tests) for (const a of s.tags?.ac || []) {
    if (!/\.AC1$/.test(a)) continue;
    const t = taskById.get(taskOfAc(a));
    const ch = t?.change || null;
    if (!ch || !seamOf(s)) continue;
    const k = `${ch}\0${seamOf(s)}`;
    if (!tracer.has(k)) tracer.set(k, new Map());
    tracer.get(k).set(s.id, { s, task: t.id });
  }
  for (const m of tracer.values()) {
    const tasksIn = new Set([...m.values()].map((x) => x.task));
    if (tasksIn.size < 2) continue;
    for (const { s } of m.values()) add("OVERLAP_TRACER", "warn", s, `tracer test at the same seam as the tracer of ${[...tasksIn].filter((x) => x !== ownerOf(s)).join(", ")}: keep one (covered:), or extend the other's table`, [...m.keys()].filter((x) => x !== s.id));
  }
  // mutation kill data
  for (const s of tests) {
    // kill data counts only for the current body and when its test names map to indexed tests
    const syms = (s.test?.coversResolved || []).filter((c) => { const m = state?.mutation?.[c]; return m?.kills && m.bodyHash === S[c]?.bodyHash && Object.keys(m.kills.byTest || {}).some((k) => S[k]); });
    if (!syms.length) continue;
    let killed = 0, unique = 0;
    for (const c of syms) { const k = state.mutation[c].kills.byTest?.[s.id]; if (k) { killed += k.killed || 0; unique += k.unique || 0; } }
    if (!killed) add("NO_KILL", "warn", s, `kills no mutant of ${syms.map((c) => S[c]?.name || c).join(", ")} (mutation kill data)`);
    else if (!unique && syms.every((c) => state.mutation[c].kills.complete)) add("NO_UNIQUE_KILL", "info", s, "every mutant it kills is also killed by another test");
  }
  // duplicate names (a block at the tests lock)
  const files = new Set(tests.map((s) => s.file));
  for (const d of duplicateTestNames(index, [...files])) for (const id of d.ids) add("DUP_NAME", "block", S[id], `test name ${d.name} appears ${d.ids.length}× in ${d.file} (Python keeps only the last definition): ${d.suggestion}`, d.ids.filter((x) => x !== id));
  const order = { block: 0, warn: 1, info: 2 };
  candidates.sort((a, b) => order[a.level] - order[b.level] || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || (a.test < b.test ? -1 : 1));
  const counts = {};
  for (const c of candidates) counts[c.code] = (counts[c.code] || 0) + 1;
  // per-task budget (active own tests vs new rows + 2)
  const budget = [];
  for (const t of tasks.filter((x) => !inScope || inScope.has(x.id)).sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const own = tests.filter((s) => ownerOf(s) === t.id && s.test?.mode === "active").map((s) => s.id);
    const b = testBudget(index, { tests: Object.fromEntries(own.map((id) => [id, true])) }, t, own);
    budget.push({ task: t.id, change: t.change || null, newRows: b.newRows, limit: b.limit, tests: b.tests, over: b.over });
  }
  return { schema: "hitl.tests-audit/1", scope: scope.label ?? null, tests: tests.length, candidates, counts, budget };
}
