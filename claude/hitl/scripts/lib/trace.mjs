// SDD trace (v2 §A.3.1): R —(ac.reqs)→ AC —(test @ac)→ test —(coversResolved)→ symbol, plus D —(Why | @dec | serves)→.
// buildTrace / specLinksFor / renderTraceMd are pure; loadTraceInputs does the IO (never reindexes, never runs tests).
import { CODE_KINDS, isTest, readLock, taskSymbolIds } from "./lock.mjs";
import { readState } from "./state.mjs";
import { computeStatuses, directCoverage, isFresh, testsFor } from "./status.mjs";
import { readTasks } from "./tasksmd.mjs";
import { planningRel, readPlanning, statusText } from "./planningmd.mjs";

export const SCHEMA = "hitl.trace/1";
const LEVEL = { block: 0, warn: 1, info: 2 };
const LATE = new Set(["green", "review", "verified", "done"]);
const num = (id) => Number(String(id).replace(/^\D+/, "").split(".")[0]) || 0;
const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const byNum = (a, b) => num(a) - num(b) || cmp(a, b);
const acTask = (acId) => String(acId).split(".")[0];
const canon = (p) => (!p || p === "none" ? null : planningRel(p));

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
    const p = canon(t.planning);
    if (p && !plannings.has(p)) plannings.set(p, await readPlanning(root, p));
  }
  return { index, lock, state, tasks, statuses, plannings };
}

function ctxOf(inputs) {
  const index = inputs.index || { symbols: {} };
  const S = index.symbols || {};
  const lock = { symbols: {}, tests: {}, tasks: {}, ...(inputs.lock || {}) };
  const state = { runs: {}, ...(inputs.state || {}) };
  const tasks = inputs.tasks || [];
  const statuses = inputs.statuses || { symbols: {}, tasks: {} };
  const plannings = inputs.plannings instanceof Map ? inputs.plannings : new Map(Object.entries(inputs.plannings || {}));
  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const planOf = (t) => { const p = canon(t?.planning); return p ? plannings.get(p) ?? null : null; };
  const tests = Object.values(S).filter(isTest).sort((a, b) => (a.id < b.id ? -1 : 1));
  const symsOf = new Map();
  const taskSyms = (T) => {
    if (!symsOf.has(T)) symsOf.set(T, taskSymbolIds(index, T, taskById.get(T)).filter((id) => CODE_KINDS.has(S[id]?.kind)));
    return symsOf.get(T);
  };
  return { index, S, lock, state, tasks, statuses, plannings, taskById, planOf, tests, taskSyms };
}

const testFresh = (c, t) => {
  const r = c.state.runs?.[t.id];
  if (!r || r.testBodyHash !== t.bodyHash) return false;
  return (t.test?.coversResolved || []).every((s) => !c.S[s] || isFresh(c.index, c.state, t.id, s));
};
const testProves = (c, t) => t.test?.mode === "active" && c.state.runs?.[t.id]?.outcome === "pass" && testFresh(c, t);

/** buildTrace(inputs, scope) -> hitl.trace/1. scope: {kind:"all"} | {kind:"task", id} | {kind:"planning", file}. */
export function buildTrace(inputs, scope = { kind: "all" }) {
  const c = ctxOf(inputs);
  const { S, lock, state, statuses, taskById, planOf } = c;
  const kind = scope?.kind || "all";
  const scopeFile = kind === "planning" ? canon(scope.file) : null;
  let tasks;
  if (kind === "task") tasks = c.tasks.filter((t) => t.id === scope.id);
  else if (kind === "planning") tasks = c.tasks.filter((t) => canon(t.planning) === scopeFile);
  else tasks = [...c.tasks];
  tasks.sort((a, b) => byNum(a.id, b.id));
  const inTask = new Set(tasks.map((t) => t.id));
  const planningLevel = kind !== "task";

  // plannings in scope
  const pfiles = new Set();
  for (const t of tasks) { const p = canon(t.planning); if (p) pfiles.add(p); }
  if (scopeFile) pfiles.add(scopeFile);
  const pList = [...pfiles].sort();

  const items = [];
  const add = (level, code, ref, task, planning, message) => items.push({ level, code, ref, task: task ?? null, planning: planning ?? null, message });

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

  // decision references: D id -> {tasks:Set, symbols:Set} per planning
  const decRefs = new Map();
  const decRef = (p, d) => { const k = `${p}\0${d}`; if (!decRefs.has(k)) decRefs.set(k, { tasks: new Set(), symbols: new Set() }); return decRefs.get(k); };
  for (const t of c.tasks) { const p = canon(t.planning); if (p) for (const d of t.decisions || []) decRef(p, d).tasks.add(t.id); }
  for (const s of Object.values(S)) {
    if (isTest(s) || !(s.tags?.dec || []).length) continue;
    for (const T of s.tags?.task || []) { const p = canon(taskById.get(T)?.planning); if (p) for (const d of s.tags.dec) decRef(p, d).symbols.add(s.id); }
  }

  // ---- task-level checks
  const acRows = new Map(); // ac id -> ac row
  for (const t of tasks) {
    const pfile = canon(t.planning);
    const doc = planOf(t);
    const R = new Map((doc?.requirements || []).map((r) => [r.id, r]));
    const D = new Map((doc?.decisions || []).map((d) => [d.id, d]));
    const syms = c.taskSyms(t.id);
    const decSyms = syms.filter((id) => (S[id]?.tags?.dec || []).length);
    const hasRefs = t.acs.some((a) => (a.reqs || []).length) || (t.decisions || []).length > 0 || decSyms.length > 0;
    const lt = lock.tasks?.[t.id];
    const skeletonApproved = !!lt?.skeletonAt;
    const testsLocked = !!statuses.tasks?.[t.id]?.testsLocked;
    const late = LATE.has(statuses.tasks?.[t.id]?.status);
    if (!doc && (pfile || hasRefs)) {
      if (hasRefs) add("block", "PLANNING_MISSING", pfile || "none", t.id, pfile, `${t.id} has R-/D- references but its planning file ${pfile || "none"} is ${pfile ? "not found" : "not set"}`);
      else add("info", "PLANNING_MISSING", pfile, t.id, pfile, `planning file ${pfile} not found`);
    }
    if (doc) {
      for (const d of t.decisions || []) {
        const x = D.get(d);
        if (!x) add("block", "DEC_UNKNOWN", d, t.id, pfile, `${t.id} **Why** references unknown ${d} (not in ${pfile})`);
        else if (x.status !== "accepted") add("warn", "DEC_SUPERSEDED_REF", d, t.id, pfile, `${t.id} **Why** references ${d} which is ${statusText(x)}`);
      }
      for (const id of decSyms) for (const d of S[id].tags.dec) {
        const x = D.get(d);
        if (!x) add("block", "DEC_UNKNOWN", d, t.id, pfile, `${S[id].name} @dec ${d} is not in ${pfile}`);
        else if (x.status !== "accepted") add("warn", "DEC_SUPERSEDED_REF", d, t.id, pfile, `${S[id].name} @dec ${d} which is ${statusText(x)}`);
      }
    }
    for (const ac of t.acs) {
      const ts = testsOfAc.get(ac.id) || [];
      if (doc) for (const r of ac.reqs || []) {
        const x = R.get(r);
        if (!x) add("block", "REQ_UNKNOWN", r, t.id, pfile, `${ac.id} references unknown ${r} (not in ${pfile})`);
        else if (x.status === "dropped" || x.status === "superseded") add("block", "REQ_INACTIVE", r, t.id, pfile, `${ac.id} references ${r} which is ${statusText(x)}`);
      }
      if (doc?.hasRequirements && !(ac.reqs || []).length) add("info", "AC_NO_REQ", ac.id, t.id, pfile, `${ac.id} has no (R-n) requirement`);
      if (!ts.length) add(skeletonApproved ? "warn" : "info", "AC_NO_TEST", ac.id, t.id, pfile, `${ac.id} has no test with @ac ${ac.id}`);
      else if (ts.every((x) => x.test?.mode !== "active")) add(testsLocked ? "warn" : "info", "AC_ONLY_STUB", ac.id, t.id, pfile, `${ac.id} has only todo/skip tests`);
      const proven = ts.some((x) => testProves(c, x));
      if (late && !proven) add("warn", "AC_NOT_PROVEN", ac.id, t.id, pfile, `${ac.id} has no fresh passing test (task is ${statuses.tasks[t.id].status})`);
      const symIds = [...new Set(ts.flatMap((x) => x.test?.coversResolved || []))].sort();
      acRows.set(ac.id, { id: ac.id, task: t.id, text: ac.text, reqs: ac.reqs || [], proven,
        tests: ts.map((x) => ({ id: x.id, title: x.test?.titlePath?.at(-1) ?? x.name, mode: x.test?.mode ?? null, outcome: state.runs?.[x.id]?.outcome ?? null,
          fresh: testFresh(c, x), locked: lock.tests?.[x.id]?.stage === "locked" })),
        symbols: symIds.map((id) => ({ id, name: S[id]?.name || id.split("#").pop(), status: statuses.symbols?.[id]?.status ?? null })) });
    }
    for (const id of syms) {
      if (S[id]?.kind === "class") continue;
      if (!testsFor(c.index, id, cov).tests.length) add(skeletonApproved ? "warn" : "info", "SYMBOL_NO_TEST", id, t.id, pfile, `${S[id]?.name || id} has no test (direct or via callers)`);
    }
  }

  // ---- test checks
  for (const t of scopeTests) {
    const acs = t.tags?.ac || [];
    const owner = acs.map(acTask).find((T) => inTask.has(T)) || (t.test?.coversResolved || []).flatMap((s) => symTasks.get(s) || [])[0] || null;
    const pOwner = canon(taskById.get(owner)?.planning);
    for (const a of acs) {
      const T = acTask(a); const task = taskById.get(T);
      if (!task || !task.acs.some((x) => x.id === a)) add("block", "AC_UNKNOWN", a, task ? T : owner, canon(task?.planning) ?? pOwner, `${t.test?.titlePath?.at(-1) ?? t.name}: @ac ${a} — ${task ? `${T} has no ${a.split(".")[1]}` : `task ${T} is unknown`}`);
    }
    const unresolved = (t.tags?.covers || []).length > (t.test?.coversResolved || []).length || graphWarn.has(t.id);
    if (unresolved) add("block", "COVERS_UNRESOLVED", t.id, owner, pOwner, `${t.test?.titlePath?.at(-1) ?? t.name}: @covers ${(t.tags?.covers || []).join(", ")} does not fully resolve`);
    if (acs.some((a) => inTask.has(acTask(a))) && !(t.tags?.covers || []).length && !(t.test?.coversResolved || []).length)
      add("warn", "TEST_NO_COVERS", t.id, owner, pOwner, `${t.test?.titlePath?.at(-1) ?? t.name} has @ac but no @covers`);
    if (!acs.length && (t.test?.coversResolved || []).some((s) => symTasks.has(s)))
      add("info", "TEST_NO_AC", t.id, owner, pOwner, `${t.test?.titlePath?.at(-1) ?? t.name} covers task code but has no @ac`);
  }

  // ---- planning-level checks
  if (planningLevel) for (const p of pList) {
    const doc = c.plannings.get(p);
    if (!doc) continue;
    for (const e of doc.parseErrors || []) add("warn", "PLANNING_PARSE", p, null, p, `${e.section}: ${e.message}: ${e.line}`);
    const pTasks = c.tasks.filter((t) => canon(t.planning) === p);
    const R = new Set(doc.requirements.map((r) => r.id));
    const referenced = new Set(pTasks.flatMap((t) => t.acs.flatMap((a) => a.reqs || [])));
    for (const d of doc.decisions) for (const r of d.serves || []) if (!R.has(r)) add("block", "REQ_UNKNOWN", r, null, p, `${d.id} serves unknown ${r}`);
    for (const r of doc.requirements) {
      if (r.status !== "active") continue;
      if (!referenced.has(r.id)) add(r.priority === "could" ? "info" : "warn", "REQ_NO_AC", r.id, null, p, `no AC references ${r.id}`);
      if (!doc.decisions.some((d) => d.status === "accepted" && (d.serves || []).includes(r.id))) add("info", "REQ_NO_DEC", r.id, null, p, `no accepted decision serves ${r.id}`);
    }
    for (const d of doc.decisions) {
      const ref = decRefs.get(`${p}\0${d.id}`);
      if (d.status === "accepted" && !(ref && (ref.tasks.size || ref.symbols.size))) add("info", "DEC_UNUSED", d.id, null, p, `${d.id} is referenced by no task **Why** and no @dec`);
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
    const pAcs = acsOfTasks(tasks.filter((t) => canon(t.planning) === p));
    for (const r of [...(doc?.requirements || [])].sort((a, b) => byNum(a.id, b.id))) {
      const acs = pAcs.filter((a) => a.reqs.includes(r.id));
      if (kind === "task" && !acs.length) continue;
      rows.push({ planning: p, req: { id: r.id, priority: r.priority, status: r.status, text: r.text }, acs });
    }
    const R = new Set((doc?.requirements || []).map((r) => r.id));
    const loose = pAcs.filter((a) => !a.reqs.some((r) => R.has(r)));
    if (loose.length) rows.push({ planning: p, req: null, acs: loose });
  }
  const quick = acsOfTasks(tasks.filter((t) => !canon(t.planning)));
  if (quick.length) rows.push({ planning: null, req: null, acs: quick });

  // ---- decisions
  const decisions = [];
  for (const p of pList) for (const d of c.plannings.get(p)?.decisions || []) {
    const ref = decRefs.get(`${p}\0${d.id}`) || { tasks: new Set(), symbols: new Set() };
    const dTasks = [...ref.tasks].filter((T) => kind !== "task" || inTask.has(T)).sort(byNum);
    const dSyms = [...ref.symbols].filter((id) => kind !== "task" || symTasks.has(id)).sort();
    if (kind === "task" && !dTasks.length && !dSyms.length) continue;
    decisions.push({ planning: p, id: d.id, status: d.status, text: d.decision, serves: d.serves || [], tasks: dTasks, symbols: dSyms });
  }

  // ---- summary
  const reqs = rows.filter((r) => r.req);
  const allAcs = [...new Map(rows.flatMap((r) => r.acs).map((a) => [a.id, a])).values()];
  const summary = {
    reqs: { total: reqs.length, active: reqs.filter((r) => r.req.status === "active").length, covered: reqs.filter((r) => r.req.status === "active" && r.acs.length).length },
    acs: { total: allAcs.length, tested: allAcs.filter((a) => a.tests.some((x) => x.mode === "active")).length, proven: allAcs.filter((a) => a.proven).length },
    tasks: tasks.length,
  };
  const plannings = pList.map((p) => {
    const d = c.plannings.get(p);
    return d ? { file: p, status: d.status, hasRequirements: !!d.hasRequirements, requirements: d.requirements.length, decisions: d.decisions.length, exists: true }
      : { file: p, status: null, hasRequirements: false, requirements: 0, decisions: 0, exists: false };
  });
  return { schema: SCHEMA, scope: { kind, id: kind === "task" ? scope.id : kind === "planning" ? scopeFile : null },
    plannings, rows, decisions, items, counts, summary };
}

/**
 * Spec links of one symbol: {planning, decisions:[{id,text,status,via:"@dec"}], requirements:[{id,text,via}]}, or null when
 * the symbol's task has no planning doc.
 */
export function specLinksFor(inputs, symbolId) {
  const c = ctxOf(inputs);
  const s = c.S[symbolId];
  const reqOf = (acId) => {
    const t = c.taskById.get(acTask(acId)); const ac = t?.acs.find((a) => a.id === acId); const doc = c.planOf(t);
    return (ac?.reqs || []).map((r) => ({ id: r, text: doc?.requirements.find((x) => x.id === r)?.text ?? null, via: acId }));
  };
  const collect = (list) => { const m = new Map(); for (const r of list) if (!m.has(r.id)) m.set(r.id, r); return [...m.values()].sort((a, b) => byNum(a.id, b.id)); };
  if (s && isTest(s)) {
    const acs = s.tags?.ac || [];
    const t = acs.map((a) => c.taskById.get(acTask(a))).find((x) => c.planOf(x));
    if (!t) return null;
    return { planning: canon(t.planning), decisions: [], requirements: collect(acs.flatMap(reqOf)) };
  }
  const taskIds = s ? s.tags?.task || [] : [c.lock.symbols?.[symbolId]?.task].filter(Boolean);
  const withDoc = taskIds.map((T) => c.taskById.get(T)).filter((t) => c.planOf(t));
  if (!withDoc.length) return null;
  const decisions = [];
  if (s) for (const d of s.tags?.dec || []) {
    for (const t of withDoc) {
      const x = c.planOf(t).decisions.find((y) => y.id === d);
      if (x && !decisions.some((y) => y.id === d)) decisions.push({ id: d, text: x.decision, status: statusText(x), via: "@dec" });
    }
  }
  const covering = c.tests.filter((t) => (t.test?.coversResolved || []).includes(symbolId));
  return { planning: canon(withDoc[0].planning), decisions, requirements: collect(covering.flatMap((t) => (t.tags?.ac || []).flatMap(reqOf))) };
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

/** Markdown matrix (no percentages). */
export function renderTraceMd(trace) {
  const L = [];
  const groups = [...new Set(trace.rows.map((r) => r.planning).concat(trace.plannings.map((p) => p.file), trace.items.map((i) => i.planning)))];
  const sorted = groups.filter((g) => g !== null).sort().concat(groups.includes(null) ? [null] : []);
  const name = (p) => String(p).split("/").pop();
  for (const p of sorted) {
    const meta = trace.plannings.find((x) => x.file === p);
    if (p === null) L.push("# Trace — quick tasks (no planning)");
    else if (!meta?.exists) L.push(`# Trace — ${name(p)} (planning missing)`);
    else L.push(`# Trace — ${name(p)} (planning ${meta.status || "?"} · R ${meta.requirements} · D ${meta.decisions})`);
    L.push("| R | AC | tests (fresh) | symbols (status) |", "|---|----|---------------|------------------|");
    for (const r of trace.rows.filter((x) => x.planning === p)) {
      const rc = r.req ? `${r.req.id} ${r.req.priority}${r.req.status !== "active" ? ` (${r.req.status})` : ""}` : "—";
      if (!r.acs.length) { L.push(`| ${rc} | — | — | — |`); continue; }
      for (const a of r.acs) {
        const tc = a.tests.length ? a.tests.map((t) => `"${clip(t.title, 40)}" ${marker(t)}`).join(" · ") : "—";
        const sc = a.symbols.length ? a.symbols.map((s) => `${s.name} (${s.status || "?"})`).join(" · ") : "—";
        L.push(`| ${rc} | ${a.id} | ${tc.replace(/\|/g, "\\|")} | ${sc} |`);
      }
    }
    const ds = trace.decisions.filter((d) => d.planning === p);
    if (ds.length) {
      L.push("Decisions: " + ds.map((d) => {
        const st = d.status !== "accepted" ? ` (${d.status})` : "";
        const refs = [...d.tasks, ...d.symbols.map((id) => `${id.split("#").pop()} (@dec)`)];
        return `${d.id}${st} → ${refs.join(", ") || "—"}`;
      }).join(" · "));
    }
    for (const i of trace.items.filter((x) => x.planning === p)) L.push(`${ICON[i.level]} ${i.code} ${i.ref} — ${i.message}`);
    L.push("");
  }
  L.push(`summary: ${trace.counts.block} block · ${trace.counts.warn} warn · ${trace.counts.info} info`);
  return L.join("\n") + "\n";
}
