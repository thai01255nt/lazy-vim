// SDD trace (design v3 §5.2, hitl.trace/2): requirement → scenario —(AC ref)→ AC —(test @ac)→ test —(coversResolved)→
// symbol, plus D —(Why | @dec | serves)→. Change tasks resolve refs against their change's effective spec view and
// design.md; v0.5 tasks (`← Planning:`) still resolve R-n/D-n against their planning file (compat, unchanged codes).
// buildTrace / specLinksFor / renderTraceMd are pure; loadTraceInputs does the IO (never reindexes, never runs tests).
import { CODE_KINDS, isTest, readLock, taskSymbolIds } from "./lock.mjs";
import { readState } from "./state.mjs";
import { computeStatuses, directCoverage, isFresh, testsFor } from "./status.mjs";
import { readTasks } from "./tasksmd.mjs";
import { planningRel, readPlanning, statusText } from "./planningmd.mjs";
import { parseId, compareIds } from "./specids.mjs";
import { changeForTask, findInView, loadSpecContext, resolveSpecRef, unknownCode } from "./changes.mjs";

export const SCHEMA = "hitl.trace/2";
const LEVEL = { block: 0, warn: 1, info: 2 };
const LATE = new Set(["green", "review", "verified", "done"]);
const num = (id) => Number(String(id).replace(/^\D+/, "").split(".")[0]) || 0;
const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const byNum = (a, b) => (parseId(a) && parseId(b) ? compareIds(a, b) : num(a) - num(b) || cmp(a, b));
const acTask = (acId) => String(acId).split(".")[0];
const canon = (p) => (!p || p === "none" ? null : planningRel(p));
const isChangeTask = (t) => !!(t && (t.change || t.changeDir));
const EMPTY_SPEC = () => ({ living: { specs: new Map(), glossary: null }, entries: [] });

/** Loads everything buildTrace needs; any input passed in is reused as-is. */
export async function loadTraceInputs(root, config, given = {}) {
  let index = given.index;
  if (!index) { const { readIndex } = await import("./indexer.mjs"); index = (await readIndex(root)) || { symbols: {}, files: {} }; }
  const lock = given.lock || (await readLock(root));
  const state = given.state || (await readState(root));
  const tasks = given.tasks || (await readTasks(root).catch(() => []));
  const statuses = given.statuses || computeStatuses(index, lock, state, config, tasks);
  const plannings = new Map();
  for (const t of tasks) {
    if (isChangeTask(t)) continue;
    const p = canon(t.planning);
    if (p && !plannings.has(p)) plannings.set(p, await readPlanning(root, p));
  }
  const spec = given.spec || (await loadSpecContext(root).catch(EMPTY_SPEC));
  return { index, lock, state, tasks, statuses, plannings, spec };
}

function ctxOf(inputs) {
  const index = inputs.index || { symbols: {} };
  const S = index.symbols || {};
  const lock = { symbols: {}, tests: {}, tasks: {}, ...(inputs.lock || {}) };
  const state = { runs: {}, ...(inputs.state || {}) };
  const tasks = inputs.tasks || [];
  const statuses = inputs.statuses || { symbols: {}, tasks: {} };
  const plannings = inputs.plannings instanceof Map ? inputs.plannings : new Map(Object.entries(inputs.plannings || {}));
  const spec = inputs.spec || EMPTY_SPEC();
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const planOf = (t) => { if (!t || isChangeTask(t)) return null; const p = canon(t.planning); return p ? plannings.get(p) ?? null : null; };
  const chOf = (t) => (isChangeTask(t) ? changeForTask(spec, t) : null);
  const tests = Object.values(S).filter(isTest).sort((a, b) => (a.id < b.id ? -1 : 1));
  const symsOf = new Map();
  const taskSyms = (T) => {
    if (!symsOf.has(T)) symsOf.set(T, taskSymbolIds(index, T, taskById.get(T)).filter((id) => CODE_KINDS.has(S[id]?.kind)));
    return symsOf.get(T);
  };
  return { index, S, lock, state, tasks, statuses, plannings, spec, taskById, planOf, chOf, tests, taskSyms };
}

const testFresh = (c, t) => {
  const r = c.state.runs?.[t.id];
  if (!r || r.testBodyHash !== t.bodyHash) return false;
  return (t.test?.coversResolved || []).every((s) => !c.S[s] || isFresh(c.index, c.state, t.id, s));
};
const testProves = (c, t) => t.test?.mode === "active" && c.state.runs?.[t.id]?.outcome === "pass" && testFresh(c, t);

/** Group of a task: {key, change, planning, cx} — key "change:<dir>" | planning file | null (quick). */
function groupOf(c, t) {
  if (isChangeTask(t)) {
    const x = c.chOf(t);
    const id = x?.change.id ?? t.change ?? null;
    return { key: `change:${x?.entry.dir ?? t.changeDir ?? id}`, change: id, planning: id, cx: x };
  }
  const p = canon(t?.planning);
  return { key: p, change: null, planning: p, cx: null };
}

/**
 * buildTrace(inputs, scope) -> hitl.trace/2.
 * scope: {kind:"all"} | {kind:"task", id} | {kind:"planning", file} | {kind:"change", id} | {kind:"capability", id}.
 * Items: {level, code, ref, task, change, capability, planning (deprecated: the change id, or the legacy planning file), message}.
 */
export function buildTrace(inputs, scope = { kind: "all" }) {
  const c = ctxOf(inputs);
  const { S, lock, state, statuses, taskById, planOf } = c;
  const kind = scope?.kind || "all";
  const scopeFile = kind === "planning" ? canon(scope.file) : null;
  const scopeChange = kind === "change" ? (c.spec.entries.find((x) => !x.entry.archived && x.entry.id === scope.id)
    || c.spec.entries.filter((x) => x.entry.archived && (x.entry.id === scope.id || x.entry.dir.endsWith(`/${scope.id}`))).at(-1) || null) : null;
  const capKey = kind === "capability" ? (c.spec.living.specs.get(scope.id)?.doc.key
    || c.spec.entries.flatMap((x) => x.change.deltas).find((d) => (d.capability || d.folder) === scope.id && d.key)?.key || null) : null;
  const refsCap = (t) => t.acs.some((a) => (a.reqs || []).some((r) => parseId(r)?.key === capKey));
  let tasks;
  if (kind === "task") tasks = c.tasks.filter((t) => t.id === scope.id);
  else if (kind === "planning") tasks = c.tasks.filter((t) => !isChangeTask(t) && canon(t.planning) === scopeFile);
  else if (kind === "change") tasks = c.tasks.filter((t) => scopeChange && c.chOf(t) === scopeChange);
  else if (kind === "capability") tasks = c.tasks.filter((t) => capKey && isChangeTask(t) && refsCap(t));
  else tasks = [...c.tasks];
  tasks.sort((a, b) => byNum(a.id, b.id));
  const inTask = new Set(tasks.map((t) => t.id));
  const groupLevel = kind !== "task" && kind !== "capability";

  // plannings and changes in scope
  const pfiles = new Set();
  const cset = new Set();
  for (const t of tasks) {
    if (isChangeTask(t)) { const x = c.chOf(t); if (x) cset.add(x); }
    else { const p = canon(t.planning); if (p) pfiles.add(p); }
  }
  if (scopeFile) pfiles.add(scopeFile);
  if (scopeChange) cset.add(scopeChange);
  const pList = [...pfiles].sort();
  const cList = [...cset].sort((a, b) => cmp(a.entry.dir, b.entry.dir));

  const items = [];
  const add = (level, code, ref, task, g, message, capability = null) =>
    items.push({ level, code, ref, task: task ?? null, change: g?.change ?? null, capability: capability ?? null, planning: g?.planning ?? null, message });
  const gOfChange = (x) => ({ change: x.change.id, planning: x.change.id });
  const gOfPlanning = (p) => ({ change: null, planning: p });

  // symbols / tests in scope
  const symTasks = new Map(); // symbol id -> in-scope task ids
  for (const t of tasks) for (const id of c.taskSyms(t.id)) { if (!symTasks.has(id)) symTasks.set(id, []); symTasks.get(id).push(t.id); }
  const scopeTests = c.tests.filter((t) => kind === "all"
    || (t.tags?.ac || []).some((a) => inTask.has(acTask(a)))
    || (t.test?.coversResolved || []).some((s) => symTasks.has(s)));
  const testsOfAc = new Map();
  for (const t of c.tests) for (const a of t.tags?.ac || []) { if (!testsOfAc.has(a)) testsOfAc.set(a, []); testsOfAc.get(a).push(t); }
  const cov = directCoverage(c.index);
  const graphWarn = new Set((c.index.warnings || []).filter((w) => w.code === "UNRESOLVED_COVERS_TAG").map((w) => w.symbol));

  // decision references: D id -> {tasks:Set, symbols:Set} per group key
  const decRefs = new Map();
  const decRef = (k, d) => { const key = `${k}\0${d}`; if (!decRefs.has(key)) decRefs.set(key, { tasks: new Set(), symbols: new Set() }); return decRefs.get(key); };
  for (const t of c.tasks) { const g = groupOf(c, t); if (g.key) for (const d of t.decisions || []) decRef(g.key, d).tasks.add(t.id); }
  for (const s of Object.values(S)) {
    if (isTest(s) || !(s.tags?.dec || []).length) continue;
    for (const T of s.tags?.task || []) { const t = taskById.get(T); const g = t ? groupOf(c, t) : null; if (g?.key) for (const d of s.tags.dec) decRef(g.key, d).symbols.add(s.id); }
  }

  // ---- task-level checks
  const acRows = new Map(); // ac id -> ac row
  for (const t of tasks) {
    const g = groupOf(c, t);
    const cx = g.cx;
    const isCh = isChangeTask(t);
    const pfile = isCh ? null : g.planning;
    const doc = planOf(t);
    const R = new Map((doc?.requirements || []).map((r) => [r.id, r]));
    const D = new Map((cx ? cx.change.design?.decisions || [] : doc?.decisions || []).map((d) => [d.id, d]));
    const where = cx ? `${cx.change.dir}/design.md` : pfile;
    const syms = c.taskSyms(t.id);
    const decSyms = syms.filter((id) => (S[id]?.tags?.dec || []).length);
    const hasRefs = t.acs.some((a) => (a.reqs || []).length) || (t.decisions || []).length > 0 || decSyms.length > 0;
    const skeletonApproved = !!lock.tasks?.[t.id]?.skeletonAt;
    const testsLocked = !!statuses.tasks?.[t.id]?.testsLocked;
    const tstatus = statuses.tasks?.[t.id]?.status;
    const late = LATE.has(tstatus);
    if (isCh) {
      if (!cx) {
        if (hasRefs) add("block", "CHANGE_MISSING", g.change || "none", t.id, g, `${t.id} has spec/D- references but its change ${g.change || "none"} is not found`);
        else add("info", "CHANGE_MISSING", g.change, t.id, g, `change ${g.change} not found`);
      }
    } else if (!doc && (pfile || hasRefs)) {
      if (hasRefs) add("block", "PLANNING_MISSING", pfile || "none", t.id, g, `${t.id} has R-/D- references but its planning file ${pfile || "none"} is ${pfile ? "not found" : "not set"}`);
      else add("info", "PLANNING_MISSING", pfile, t.id, g, `planning file ${pfile} not found`);
    }
    if (doc || cx) {
      const missing = cx && !cx.change.design ? ` (${cx.change.id} has no design.md)` : "";
      for (const d of t.decisions || []) {
        const x = D.get(d);
        if (!x) add("block", "DEC_UNKNOWN", d, t.id, g, `${t.id} **Why** references unknown ${d} (not in ${where})${missing}`);
        else if (x.status !== "accepted") add("warn", "DEC_SUPERSEDED_REF", d, t.id, g, `${t.id} **Why** references ${d} which is ${statusText(x)}`);
      }
      for (const id of decSyms) for (const d of S[id].tags.dec) {
        const x = D.get(d);
        if (!x) add("block", "DEC_UNKNOWN", d, t.id, g, `${S[id].name} @dec ${d} is not in ${where}${missing}`);
        else if (x.status !== "accepted") add("warn", "DEC_SUPERSEDED_REF", d, t.id, g, `${S[id].name} @dec ${d} which is ${statusText(x)}`);
      }
    }
    for (const ac of t.acs) {
      const ts = testsOfAc.get(ac.id) || [];
      if (cx) for (const r of ac.reqs || []) {
        if (!parseId(r)) { add("block", "REQ_UNKNOWN", r, t.id, g, `${ac.id} references legacy ${r} (change tasks ref spec ids)`); continue; }
        const x = resolveSpecRef(cx.view, r, cx.change);
        if (x.status === "ok") { if (x.kind === "R") add("info", "AC_REQ_LEVEL", ac.id, t.id, g, `${ac.id} references requirement ${r}; prefer a scenario id`, x.capability); }
        else if (cx.change.archived && (x.status === "retired" || x.status === "unknown"))
          add(tstatus === "done" ? "warn" : "block", "SPEC_STALE", r, t.id, g, `${ac.id} references ${r}, which the living specs no longer have (removed or changed after ${cx.change.id} was archived)`, x.capability);
        else if (x.status === "removed") add("block", "REQ_INACTIVE", r, t.id, g, `${ac.id} references ${r} which ${cx.change.id} removes`, x.capability);
        else if (x.status === "retired") add("block", "REQ_INACTIVE", r, t.id, g, `${ac.id} references ${r} which is retired`, x.capability);
        else add("block", unknownCode(x.kind), r, t.id, g, `${ac.id} references unknown ${r} (not in the spec view of ${cx.change.id})`);
      } else if (doc) for (const r of ac.reqs || []) {
        const x = R.get(r);
        if (!x) add("block", "REQ_UNKNOWN", r, t.id, g, `${ac.id} references unknown ${r} (not in ${pfile})`);
        else if (x.status === "dropped" || x.status === "superseded") add("block", "REQ_INACTIVE", r, t.id, g, `${ac.id} references ${r} which is ${statusText(x)}`);
      }
      if ((cx || doc?.hasRequirements) && !(ac.reqs || []).length) add("info", "AC_NO_REQ", ac.id, t.id, g, `${ac.id} has no ${cx ? "spec" : "(R-n) requirement"} reference`);
      if (!ts.length) add(skeletonApproved ? "warn" : "info", "AC_NO_TEST", ac.id, t.id, g, `${ac.id} has no test with @ac ${ac.id}`);
      else if (ts.every((x) => x.test?.mode !== "active")) add(testsLocked ? "warn" : "info", "AC_ONLY_STUB", ac.id, t.id, g, `${ac.id} has only todo/skip tests`);
      const proven = ts.some((x) => testProves(c, x));
      if (late && !proven) add("warn", "AC_NOT_PROVEN", ac.id, t.id, g, `${ac.id} has no fresh passing test (task is ${statuses.tasks[t.id].status})`);
      const symIds = [...new Set(ts.flatMap((x) => x.test?.coversResolved || []))].sort();
      acRows.set(ac.id, { id: ac.id, task: t.id, text: ac.text, reqs: ac.reqs || [], proven,
        tests: ts.map((x) => ({ id: x.id, title: x.test?.titlePath?.at(-1) ?? x.name, mode: x.test?.mode ?? null, outcome: state.runs?.[x.id]?.outcome ?? null,
          fresh: testFresh(c, x), locked: lock.tests?.[x.id]?.stage === "locked" })),
        symbols: symIds.map((id) => ({ id, name: S[id]?.name || id.split("#").pop(), status: statuses.symbols?.[id]?.status ?? null })) });
    }
    for (const id of syms) {
      if (S[id]?.kind === "class") continue;
      if (!testsFor(c.index, id, cov).tests.length) add(skeletonApproved ? "warn" : "info", "SYMBOL_NO_TEST", id, t.id, g, `${S[id]?.name || id} has no test (direct or via callers)`);
    }
  }

  // ---- test checks
  for (const t of scopeTests) {
    const acs = t.tags?.ac || [];
    const owner = acs.map(acTask).find((T) => inTask.has(T)) || (t.test?.coversResolved || []).flatMap((s) => symTasks.get(s) || [])[0] || null;
    const gOwner = taskById.get(owner) ? groupOf(c, taskById.get(owner)) : null;
    const name = t.test?.titlePath?.at(-1) ?? t.name;
    for (const a of acs) {
      const T = acTask(a); const task = taskById.get(T);
      if (!task || !task.acs.some((x) => x.id === a)) add("block", "AC_UNKNOWN", a, task ? T : owner, task ? groupOf(c, task) : gOwner, `${name}: @ac ${a} — ${task ? `${T} has no ${a.split(".")[1]}` : `task ${T} is unknown`}`);
    }
    const unresolved = (t.tags?.covers || []).length > (t.test?.coversResolved || []).length || graphWarn.has(t.id);
    if (unresolved) add("block", "COVERS_UNRESOLVED", t.id, owner, gOwner, `${name}: @covers ${(t.tags?.covers || []).join(", ")} does not fully resolve`);
    if (acs.some((a) => inTask.has(acTask(a))) && !(t.tags?.covers || []).length && !(t.test?.coversResolved || []).length)
      add("warn", "TEST_NO_COVERS", t.id, owner, gOwner, `${name} has @ac but no @covers`);
    if (!acs.length && (t.test?.coversResolved || []).some((s) => symTasks.has(s)))
      add("info", "TEST_NO_AC", t.id, owner, gOwner, `${name} covers task code but has no @ac`);
  }

  // ---- planning-level checks (v0.5 legacy, unchanged)
  if (groupLevel) for (const p of pList) {
    const doc = c.plannings.get(p);
    if (!doc) continue;
    const g = gOfPlanning(p);
    for (const e of doc.parseErrors || []) add("warn", "PLANNING_PARSE", p, null, g, `${e.section}: ${e.message}: ${e.line}`);
    const pTasks = c.tasks.filter((t) => !isChangeTask(t) && canon(t.planning) === p);
    const R = new Set(doc.requirements.map((r) => r.id));
    const referenced = new Set(pTasks.flatMap((t) => t.acs.flatMap((a) => a.reqs || [])));
    for (const d of doc.decisions) for (const r of d.serves || []) if (!R.has(r)) add("block", "REQ_UNKNOWN", r, null, g, `${d.id} serves unknown ${r}`);
    for (const r of doc.requirements) {
      if (r.status !== "active") continue;
      if (!referenced.has(r.id)) add(r.priority === "could" ? "info" : "warn", "REQ_NO_AC", r.id, null, g, `no AC references ${r.id}`);
      if (!doc.decisions.some((d) => d.status === "accepted" && (d.serves || []).includes(r.id))) add("info", "REQ_NO_DEC", r.id, null, g, `no accepted decision serves ${r.id}`);
    }
    for (const d of doc.decisions) {
      const ref = decRefs.get(`${p}\0${d.id}`);
      if (d.status === "accepted" && !(ref && (ref.tasks.size || ref.symbols.size))) add("info", "DEC_UNUSED", d.id, null, g, `${d.id} is referenced by no task **Why** and no @dec`);
    }
  }

  // ---- change-level checks: only ADDED/MODIFIED blocks of an active change produce coverage items
  const tasksOfChange = (x) => c.tasks.filter((t) => c.chOf(t) === x);
  if (groupLevel) for (const x of cList) {
    const g = gOfChange(x);
    const ch = x.change;
    const design = ch.design;
    const decisions = design?.decisions || [];
    if (!ch.archived) {
      const refs = new Set(tasksOfChange(x).flatMap((t) => t.acs.flatMap((a) => a.reqs || [])));
      for (const d of ch.deltas) for (const b of d.blocks) {
        if (b.kind !== "requirement" || (b.op !== "ADDED" && b.op !== "MODIFIED")) continue;
        const cap = d.capability || d.folder;
        const may = b.priority === "could";
        const scn = b.scenarios || [];
        for (const s of scn) if (!refs.has(s.id)) add(may ? "info" : "warn", "SCN_NO_AC", s.id, null, g, `no AC references ${s.id}${s.title ? ` ${s.title}` : ""}`, cap);
        if (!refs.has(b.id) && !scn.some((s) => refs.has(s.id))) add(may ? "info" : "warn", "REQ_NO_AC", b.id, null, g, `no AC references ${b.id} or its scenarios`, cap);
        if (design && !decisions.some((dd) => dd.status === "accepted" && (dd.serves || []).includes(b.id))) add("info", "REQ_NO_DEC", b.id, null, g, `no accepted decision serves ${b.id}`, cap);
      }
      for (const dd of decisions) for (const r of dd.serves || []) {
        const res = parseId(r) ? resolveSpecRef(x.view, r, ch) : { status: "unknown", kind: "R" };
        if (res.status !== "ok") add("block", unknownCode(res.kind), r, null, g, `${dd.id} serves ${r}, which is not in the spec view of ${ch.id}`);
      }
    }
    for (const dd of decisions) {
      const ref = decRefs.get(`change:${x.entry.dir}\0${dd.id}`);
      if (dd.status === "accepted" && !(ref && (ref.tasks.size || ref.symbols.size))) add("info", "DEC_UNUSED", dd.id, null, g, `${dd.id} is referenced by no task **Why** and no @dec`);
    }
  }
  items.sort((a, b) => LEVEL[a.level] - LEVEL[b.level] || cmp(a.code, b.code) || byNum(a.ref, b.ref) || cmp(a.task, b.task));
  const counts = { block: 0, warn: 0, info: 0 };
  for (const i of items) counts[i.level]++;

  // ---- rows
  const rows = [];
  const acsOfTasks = (ts) => ts.flatMap((t) => t.acs.map((a) => acRows.get(a.id)).filter(Boolean));
  for (const p of pList) {
    const doc = c.plannings.get(p);
    const pAcs = acsOfTasks(tasks.filter((t) => !isChangeTask(t) && canon(t.planning) === p));
    for (const r of [...(doc?.requirements || [])].sort((a, b) => byNum(a.id, b.id))) {
      const acs = pAcs.filter((a) => a.reqs.includes(r.id));
      if (kind === "task" && !acs.length) continue;
      rows.push({ planning: p, change: null, capability: null, req: { id: r.id, priority: r.priority, status: r.status, text: r.text }, scenarios: [], acs });
    }
    const R = new Set((doc?.requirements || []).map((r) => r.id));
    const loose = pAcs.filter((a) => !a.reqs.some((r) => R.has(r)));
    if (loose.length) rows.push({ planning: p, change: null, capability: null, req: null, scenarios: [], acs: loose });
  }
  const reqRow = (block, capability, cAcs, changeId) => ({ planning: changeId, change: changeId, capability,
    req: { id: block.id, priority: block.priority ?? "must", status: "active", origin: block.origin, title: block.title, text: block.statement ?? null, quality: block.quality ?? null },
    scenarios: (block.scenarios || []).map((s) => ({ id: s.id, title: s.title, acs: cAcs.filter((a) => a.reqs.includes(s.id)) })),
    acs: cAcs.filter((a) => a.reqs.includes(block.id)) });
  const hasAcs = (r) => r.acs.length > 0 || r.scenarios.some((s) => s.acs.length);
  if (kind === "capability") {
    // RTM of one capability: living requirements, then each active change's ADDED/MODIFIED ones for it
    const actives = c.spec.entries.filter((x) => !x.entry.archived);
    const own = new Map(actives.map((x) => [x, new Set((x.view.capabilities.get(scope.id)?.blocks || []).filter((b) => b.kind === "requirement" && b.origin !== "living").map((b) => b.id))]));
    for (const b of (c.spec.living.specs.get(scope.id)?.doc.blocks || []).filter((b) => b.kind === "requirement")) {
      const lAcs = acsOfTasks(tasks.filter((t) => { const x = c.chOf(t); return !(x && own.get(x)?.has(b.id)); }));
      rows.push(reqRow({ ...b, origin: "living" }, scope.id, lAcs, null));
    }
    for (const x of actives) for (const b of x.view.capabilities.get(scope.id)?.blocks || []) {
      if (b.kind !== "requirement" || b.origin === "living") continue;
      rows.push(reqRow(b, scope.id, acsOfTasks(tasks.filter((t) => c.chOf(t) === x)), x.change.id));
    }
  } else for (const x of cList) {
    const cAcs = acsOfTasks(tasks.filter((t) => c.chOf(t) === x));
    const want = [];
    if (!x.change.archived) for (const d of x.change.deltas) for (const b of d.blocks) if (b.kind === "requirement" && b.op !== "REMOVED") want.push(b.id);
    for (const a of cAcs) for (const r of a.reqs) { const p = parseId(r); if (p?.req) want.push(p.req); }
    const mine = [];
    for (const id of [...new Set(want)].sort(compareIds)) {
      const hit = findInView(x.view, id);
      if (!hit) continue;
      const row = reqRow(hit.block, hit.capability, cAcs, x.change.id);
      if (kind === "task" && !hasAcs(row)) continue;
      mine.push(row);
    }
    rows.push(...mine);
    const placed = new Set(mine.flatMap((r) => [...r.acs, ...r.scenarios.flatMap((s) => s.acs)].map((a) => a.id)));
    const loose = cAcs.filter((a) => !placed.has(a.id));
    if (loose.length) rows.push({ planning: x.change.id, change: x.change.id, capability: null, req: null, scenarios: [], acs: loose });
  }
  if (kind !== "capability") {
    for (const t of tasks.filter((t) => isChangeTask(t) && !c.chOf(t))) {
      const acs = acsOfTasks([t]);
      if (acs.length) rows.push({ planning: t.change, change: t.change, capability: null, req: null, scenarios: [], acs });
    }
    const quick = acsOfTasks(tasks.filter((t) => !isChangeTask(t) && !canon(t.planning)));
    if (quick.length) rows.push({ planning: null, change: null, capability: null, req: null, scenarios: [], acs: quick });
  }

  // ---- decisions
  const decisions = [];
  const pushDecs = (key, g, list) => {
    for (const d of list) {
      const ref = decRefs.get(`${key}\0${d.id}`) || { tasks: new Set(), symbols: new Set() };
      const dTasks = [...ref.tasks].filter((T) => kind !== "task" || inTask.has(T)).sort(byNum);
      const dSyms = [...ref.symbols].filter((id) => kind !== "task" || symTasks.has(id)).sort();
      if (kind === "task" && !dTasks.length && !dSyms.length) continue;
      decisions.push({ planning: g.planning, change: g.change, id: d.id, status: d.status, text: d.decision, serves: d.serves || [], tasks: dTasks, symbols: dSyms });
    }
  };
  for (const p of pList) pushDecs(p, gOfPlanning(p), c.plannings.get(p)?.decisions || []);
  if (kind !== "capability") for (const x of cList) pushDecs(`change:${x.entry.dir}`, gOfChange(x), x.change.design?.decisions || []);

  // ---- summary
  const reqs = rows.filter((r) => r.req);
  const allAcs = [...new Map(rows.flatMap((r) => [...r.acs, ...r.scenarios.flatMap((s) => s.acs)]).map((a) => [a.id, a])).values()];
  const scn = [...new Map(rows.flatMap((r) => r.scenarios.map((s) => [`${r.change}\0${s.id}`, s]))).values()];
  const tested = (a) => a.tests.some((x) => x.mode === "active");
  const summary = {
    reqs: { total: reqs.length, active: reqs.filter((r) => r.req.status === "active").length, covered: reqs.filter((r) => r.req.status === "active" && hasAcs(r)).length },
    scenarios: { total: scn.length, withAc: scn.filter((s) => s.acs.length).length, tested: scn.filter((s) => s.acs.some(tested)).length, proven: scn.filter((s) => s.acs.some((a) => a.proven)).length },
    acs: { total: allAcs.length, tested: allAcs.filter(tested).length, proven: allAcs.filter((a) => a.proven).length },
    tasks: tasks.length,
  };
  const plannings = pList.map((p) => {
    const d = c.plannings.get(p);
    return d ? { file: p, status: d.status, hasRequirements: !!d.hasRequirements, requirements: d.requirements.length, decisions: d.decisions.length, exists: true }
      : { file: p, status: null, hasRequirements: false, requirements: 0, decisions: 0, exists: false };
  });
  const changes = cList.map((x) => {
    const cr = rows.filter((r) => r.req && r.change === x.change.id);
    return { id: x.change.id, dir: x.entry.dir, archived: x.entry.archived, proposal: x.change.proposal?.status ?? null,
      design: x.change.design ? x.change.design.status || "draft" : null, requirements: cr.length,
      scenarios: cr.reduce((n, r) => n + r.scenarios.length, 0), decisions: (x.change.design?.decisions || []).length, exists: true };
  });
  for (const t of tasks) if (isChangeTask(t) && !c.chOf(t) && !changes.some((x) => x.id === t.change))
    changes.push({ id: t.change, dir: null, archived: false, proposal: null, design: null, requirements: 0, scenarios: 0, decisions: 0, exists: false });
  const scopeId = kind === "task" ? scope.id : kind === "planning" ? scopeFile : kind === "change" ? scopeChange?.change.id ?? scope.id : kind === "capability" ? scope.id : null;
  return { schema: SCHEMA, scope: { kind, id: scopeId }, plannings, changes, rows, decisions, items, counts, summary };
}

/**
 * Spec links of one symbol (design v3 §5.5 spec block). Change tasks:
 * {planning (= change id, deprecated), change, archived, capability, design, decisions:[{id,text,status,via}],
 *  requirements:[{id, scenario, title, text, via}]}. Legacy tasks: {planning, decisions, requirements:[{id,text,via}]}.
 * null when the symbol's task has neither a change nor a planning doc.
 */
export function specLinksFor(inputs, symbolId) {
  const c = ctxOf(inputs);
  const s = c.S[symbolId];
  const linked = (t) => (isChangeTask(t) ? c.chOf(t) : c.planOf(t));
  const reqOf = (acId) => {
    const t = c.taskById.get(acTask(acId)); const ac = t?.acs.find((a) => a.id === acId);
    const x = c.chOf(t);
    if (x) return (ac?.reqs || []).map((r) => {
      const p = parseId(r);
      const hit = p ? findInView(x.view, r) : null;
      const isReq = p && (p.kind === "R" || p.kind === "S");
      return { id: isReq ? p.req : r, scenario: p?.kind === "S" ? r : null, title: hit?.block.title ?? null, text: hit?.block.statement ?? null, via: acId };
    });
    const doc = c.planOf(t);
    return (ac?.reqs || []).map((r) => ({ id: r, text: doc?.requirements.find((y) => y.id === r)?.text ?? null, via: acId }));
  };
  const collect = (list) => {
    const m = new Map(); for (const r of list) { const k = r.scenario || r.id; if (!m.has(k)) m.set(k, r); }
    return [...m.values()].sort((a, b) => byNum(a.scenario || a.id, b.scenario || b.id));
  };
  const block = (t, decisions, requirements) => {
    const x = c.chOf(t);
    if (!x) return { planning: canon(t.planning), decisions, requirements };
    const caps = [...new Set(requirements.map((r) => findInView(x.view, r.scenario || r.id)?.capability).filter(Boolean))];
    return { planning: x.change.id, change: x.change.id, archived: x.entry.archived, capability: caps.length === 1 ? caps[0] : caps.length ? caps : null,
      design: x.change.design ? x.change.design.file : null, decisions, requirements };
  };
  if (s && isTest(s)) {
    const acs = s.tags?.ac || [];
    const t = acs.map((a) => c.taskById.get(acTask(a))).find((x) => linked(x));
    if (!t) return null;
    const key = groupOf(c, t).key;
    return block(t, [], collect(acs.filter((a) => { const u = c.taskById.get(acTask(a)); return u && groupOf(c, u).key === key; }).flatMap(reqOf)));
  }
  const taskIds = s ? s.tags?.task || [] : [c.lock.symbols?.[symbolId]?.task].filter(Boolean);
  const withDoc = taskIds.map((T) => c.taskById.get(T)).filter((t) => linked(t));
  if (!withDoc.length) return null;
  const decsOf = (t) => (isChangeTask(t) ? c.chOf(t)?.change.design?.decisions || [] : c.planOf(t)?.decisions || []);
  const decisions = [];
  if (s) for (const d of s.tags?.dec || []) {
    for (const t of withDoc) {
      const x = decsOf(t).find((y) => y.id === d);
      if (x && !decisions.some((y) => y.id === d)) decisions.push({ id: d, text: x.decision, status: statusText(x), via: "@dec" });
    }
  }
  const covering = c.tests.filter((t) => (t.test?.coversResolved || []).includes(symbolId));
  return block(withDoc[0], decisions, collect(covering.flatMap((t) => (t.tags?.ac || []).flatMap(reqOf))));
}

const ICON = { block: "⛔", warn: "⚠️", info: "ℹ️" };
const clip = (s, n) => (String(s).length > n ? String(s).slice(0, n - 1) + "…" : String(s));
function marker(t) {
  if (t.mode !== "active") return "📝";
  if (!t.fresh || !t.outcome) return "⏳";
  if (t.outcome === "pass") return "✅";
  if (t.outcome === "fail" || t.outcome === "error") return "❌";
  return "📝";
}
const testsCell = (a) => (a.tests.length ? a.tests.map((t) => `"${clip(t.title, 40)}" ${marker(t)}`).join(" · ") : "—").replace(/\|/g, "\\|");
const symsCell = (a) => (a.symbols.length ? a.symbols.map((s) => `${s.name} (${s.status || "?"})`).join(" · ") : "—");
const itemLine = (i) => `${ICON[i.level]} ${i.code} ${i.ref} — ${i.message}`;

function changeTable(L, rows) {
  L.push("| requirement | scenario | AC | tests (fresh) | symbols (status) |", "|---|---|---|---|---|");
  for (const r of rows) {
    const rc = r.req ? `${r.req.id} ${r.req.priority}${r.change && r.req.origin && r.req.origin !== "living" ? ` (${r.req.origin})` : ""}` : "—";
    const lines = [];
    for (const s of r.scenarios) {
      if (!s.acs.length) lines.push(`| ${rc} | ${s.id} | — | — | — |`);
      for (const a of s.acs) lines.push(`| ${rc} | ${s.id} | ${a.id} | ${testsCell(a)} | ${symsCell(a)} |`);
    }
    for (const a of r.acs) lines.push(`| ${rc} | — | ${a.id} | ${testsCell(a)} | ${symsCell(a)} |`);
    if (!lines.length) lines.push(`| ${rc} | — | — | — | — |`);
    L.push(...lines);
  }
}

function decisionsLine(L, ds) {
  if (!ds.length) return;
  L.push("Decisions: " + ds.map((d) => {
    const st = d.status !== "accepted" ? ` (${d.status})` : "";
    const refs = [...d.tasks, ...d.symbols.map((id) => `${id.split("#").pop()} (@dec)`)];
    return `${d.id}${st} → ${refs.join(", ") || "—"}`;
  }).join(" · "));
}

/** Markdown matrix (no percentages): legacy plannings, then changes, then quick tasks; or one capability RTM. */
export function renderTraceMd(trace) {
  const L = [];
  const sum = `summary: ${trace.counts.block} block · ${trace.counts.warn} warn · ${trace.counts.info} info`;
  if (trace.scope?.kind === "capability") {
    L.push(`# Trace — capability ${trace.scope.id} (R ${trace.summary.reqs.total} · scenarios ${trace.summary.scenarios.total})`);
    changeTable(L, trace.rows);
    L.push(...trace.items.map(itemLine), "", sum);
    return L.join("\n") + "\n";
  }
  const name = (p) => String(p).split("/").pop();
  const pGroups = [...new Set(trace.rows.filter((r) => !r.change && r.planning).map((r) => r.planning)
    .concat(trace.plannings.map((p) => p.file), trace.items.filter((i) => !i.change && i.planning).map((i) => i.planning)))].sort();
  for (const p of pGroups) {
    const meta = trace.plannings.find((x) => x.file === p);
    if (!meta?.exists) L.push(`# Trace — ${name(p)} (planning missing)`);
    else L.push(`# Trace — ${name(p)} (planning ${meta.status || "?"} · R ${meta.requirements} · D ${meta.decisions})`);
    L.push("| R | AC | tests (fresh) | symbols (status) |", "|---|----|---------------|------------------|");
    for (const r of trace.rows.filter((x) => !x.change && x.planning === p)) {
      const rc = r.req ? `${r.req.id} ${r.req.priority}${r.req.status !== "active" ? ` (${r.req.status})` : ""}` : "—";
      if (!r.acs.length) { L.push(`| ${rc} | — | — | — |`); continue; }
      for (const a of r.acs) L.push(`| ${rc} | ${a.id} | ${testsCell(a)} | ${symsCell(a)} |`);
    }
    decisionsLine(L, trace.decisions.filter((d) => !d.change && d.planning === p));
    L.push(...trace.items.filter((x) => !x.change && x.planning === p).map(itemLine), "");
  }
  const cGroups = [...new Set((trace.changes || []).map((x) => x.id)
    .concat(trace.rows.filter((r) => r.change).map((r) => r.change), trace.items.filter((i) => i.change).map((i) => i.change)))].sort();
  for (const id of cGroups) {
    const meta = (trace.changes || []).find((x) => x.id === id);
    if (!meta?.exists) L.push(`# Trace — ${id} (change missing)`);
    else L.push(`# Trace — ${id} (change ${meta.archived ? "archived" : "active"} · proposal ${meta.proposal || "?"} · R ${meta.requirements} · S ${meta.scenarios} · D ${meta.decisions})`);
    changeTable(L, trace.rows.filter((r) => r.change === id));
    decisionsLine(L, trace.decisions.filter((d) => d.change === id));
    L.push(...trace.items.filter((x) => x.change === id).map(itemLine), "");
  }
  const quickRows = trace.rows.filter((r) => !r.change && !r.planning);
  const quickItems = trace.items.filter((i) => !i.change && !i.planning);
  if (quickRows.length || quickItems.length) {
    L.push("# Trace — quick tasks (no change)", "| R | AC | tests (fresh) | symbols (status) |", "|---|----|---------------|------------------|");
    for (const r of quickRows) for (const a of r.acs) L.push(`| — | ${a.id} | ${testsCell(a)} | ${symsCell(a)} |`);
    L.push(...quickItems.map(itemLine), "");
  }
  L.push(sum);
  return L.join("\n") + "\n";
}
