// One symbol worked on by several tasks (T-2 builds it, T-3 modifies it later): statuses per (symbol, task), lock approval
// history, test ownership at approve, drift wording. Hand-built index/lock/state, modelled on a real T-2 → T-3 `modify` row.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeStatuses, openStepsFor } from "../../scripts/lib/status.mjs";
import { planApproval, lockedTasks, currentTask, testOwner } from "../../scripts/lib/lock.mjs";
import { computeDriftFrom } from "../../scripts/lib/drift.mjs";
import { toIndexSymbols } from "../../scripts/lib/indexer.mjs";
import { tasksInfo } from "../../scripts/lib/synctags.mjs";
import { forgedStatuses } from "../../scripts/cmd/precommit.mjs";

const F = "src/settle.ts", TF = "tests/settle.test.ts";
const APPLY = `${F}#applySettlement`, PARSE = `${F}#parseSettleArgs`, PLAN = `${F}#planExtraCharge`, OTHER = `${F}#untouchedHelper`;
const TT2 = `${TF}#T-2.AC1 refunds`, TT3 = `${TF}#T-3.AC1 charges extra`;
const DONE2 = "2026-11-02T06:54:04.786Z", SK3 = "2026-11-02T07:18:59.016Z";

const sym = (id, o) => ({ id, name: id.split("#")[1], file: id.split("#")[0], kind: "function", exported: true, async: false, features: [], callers: [], callees: [],
  stub: false, todos: [], flowSteps: [], sigHash: `sig-${id}`, intentHash: `int-${id}`, todoHash: "t", span: { start: 1, end: 9 }, docSpan: { start: 1, end: 1 }, ...o });
const tags = (task, status, extra = {}) => ({ task, impl: "agent", status, prio: 1, calls: [], covers: [], ac: [], ...extra });

/** T-2 done (APPLY, PARSE); T-3 skeleton drafted: APPLY/PARSE get T-3 TODO steps (modify rows), PLAN is new with a sentinel. */
function index({ t3Steps = true, plan = true, t3Mode = "todo", applyBody = "bodyA", parseSteps = t3Steps } = {}) {
  const symbols = {
    [APPLY]: sym(APPLY, { tags: tags(["T-2", "T-3"], "done"), bodyHash: applyBody, todos: t3Steps ? ["2. plan extra charge", "6. take the extra"] : [], callees: plan ? [PLAN] : [] }),
    [PARSE]: sym(PARSE, { tags: tags(["T-2", "T-3"], "done"), bodyHash: "bodyP", todos: parseSteps ? ["3. check the extra args"] : [], callers: [APPLY] }),
    [OTHER]: sym(OTHER, { tags: tags([], null), bodyHash: "bodyO" }),
    [TT2]: sym(TT2, { kind: "test", tags: { covers: ["applySettlement"], ac: ["T-2.AC1"] }, bodyHash: "tb2", test: { titlePath: ["T-2.AC1 refunds"], mode: "active", coversResolved: [APPLY] } }),
    [TT3]: sym(TT3, { kind: "test", tags: { covers: ["applySettlement"], ac: ["T-3.AC1"] }, bodyHash: `tb3-${t3Mode}`, test: { titlePath: ["T-3.AC1 charges extra"], mode: t3Mode, coversResolved: [APPLY] } }),
  };
  if (plan) symbols[PLAN] = sym(PLAN, { tags: tags(["T-3"], "skeleton"), stub: true, todos: ["1. read lease total"], bodyHash: "bodyPlan", callers: [APPLY] });
  return { schema: "hitl.index/1", files: {}, symbols };
}
const TASKS = [
  { id: "T-2", title: "Refund", file: "tasks.md", prio: "P0", risk: "high", blockedBy: [], acs: [{ id: "T-2.AC1" }],
    symbols: [{ order: 1, ref: "applySettlement", change: "new", file: F }, { order: 2, ref: "parseSettleArgs", change: "new", file: F }] },
  { id: "T-3", title: "Extra charge", file: "tasks.md", prio: "P1", risk: "high", blockedBy: ["T-2"], acs: [{ id: "T-3.AC1" }],
    symbols: [{ order: 1, ref: "planExtraCharge", change: "new", file: F }, { order: 2, ref: "parseSettleArgs", change: "modify", file: F }, { order: 3, ref: "applySettlement", change: "modify", file: F }] },
];
/** Lock as the old plugin left it: approving T-3 overwrote `task` of the shared symbols (no history). */
function lock({ t3 = { skeletonAt: SK3, testsAt: null, doneAt: null } } = {}) {
  return { schema: "hitl.lock/1",
    symbols: { [APPLY]: { task: "T-3", impl: "agent" }, [PARSE]: { task: "T-3", impl: "agent" }, ...(t3 ? { [PLAN]: { task: "T-3", impl: "agent" } } : {}) },
    tests: { [TT2]: { task: "T-2", stage: "locked", bodyHash: "tb2" } },
    tasks: { "T-2": { risk: "high", skeletonAt: "2026-11-02T04:00:00Z", testsAt: "2026-11-02T05:00:00Z", doneAt: DONE2, doneBodyHashes: { [APPLY]: "bodyA", [PARSE]: "bodyP" } },
      ...(t3 ? { "T-3": { risk: "high", doneBodyHashes: {}, ...t3 } } : {}) } };
}
const pass = (idx, ...ids) => ({ runs: Object.fromEntries(ids.map(([t, outcome]) => [t, { outcome, testBodyHash: idx.symbols[t].bodyHash,
  coveredBodyHashes: { [APPLY]: idx.symbols[APPLY].bodyHash, [PARSE]: idx.symbols[PARSE].bodyHash } }])), mutation: {}, reviews: {} });
const workList = (r, T) => Object.entries(r.tasks[T].symbolStatus).filter(([, s]) => ["skeleton", "red", "wip"].includes(s.status)).map(([id]) => id).sort();

test("T-3 modify rows with open T-3 TODO steps are skeleton for T-3 while T-2 stays done (the reported bug)", () => {
  const idx = index();
  const r = computeStatuses(idx, lock(), pass(idx, [TT2, "pass"]), {}, TASKS);
  assert.equal(r.tasks["T-2"].status, "done");
  assert.equal(r.tasks["T-2"].symbolStatus[APPLY].status, "done");
  assert.match(r.tasks["T-2"].symbolStatus[APPLY].reasons.join(), /later changes belong to T-3/);
  assert.equal(r.tasks["T-3"].symbolStatus[APPLY].status, "skeleton");
  assert.match(r.tasks["T-3"].symbolStatus[APPLY].reasons.join(), /2 open TODO\(impl\) step\(s\) for T-3/);
  assert.equal(r.tasks["T-3"].symbolStatus[PARSE].status, "skeleton");
  assert.equal(r.tasks["T-3"].status, "approved");
  assert.deepEqual(workList(r, "T-3"), [APPLY, PARSE, PLAN].sort(), "implement work list holds the modify symbols");
  // overall symbol status (source @status, sync-tags) = the lowest task status
  assert.equal(r.symbols[APPLY].status, "skeleton");
  assert.deepEqual(r.symbols[APPLY].byTask, { "T-2": "done", "T-3": "skeleton" });
});

test("a task made only of modify rows is not done after its skeleton (was: inherited done)", () => {
  const idx = index({ plan: false });
  const tasks = [TASKS[0], { ...TASKS[1], symbols: TASKS[1].symbols.slice(1) }];
  let r = computeStatuses(idx, lock({ t3: null }), pass(idx, [TT2, "pass"]), {}, tasks);
  assert.equal(r.tasks["T-3"].status, "skeleton", "drafted, not approved");
  assert.equal(r.tasks["T-3"].next, "/hitl:approve T-3");
  r = computeStatuses(idx, lock({ t3: { skeletonAt: SK3, testsAt: null, doneAt: null } }), pass(idx, [TT2, "pass"]), {}, tasks);
  assert.equal(r.tasks["T-3"].status, "approved");
  assert.equal(r.tasks["T-2"].status, "done");
});

test("a ### Symbols row the task has not started on (no tag, no lock) is not inherited: task todo", () => {
  const idx = index({ t3Steps: false, plan: false });
  idx.symbols[APPLY].tags.task = ["T-2"]; idx.symbols[PARSE].tags.task = ["T-2"];
  const tasks = [TASKS[0], { ...TASKS[1], symbols: TASKS[1].symbols.slice(1) }];
  const l = lock({ t3: null }); l.symbols[APPLY].task = "T-2"; l.symbols[PARSE].task = "T-2";
  const r = computeStatuses(idx, l, pass(idx, [TT2, "pass"]), {}, tasks);
  assert.equal(r.tasks["T-3"].status, "todo");
  assert.equal(r.tasks["T-3"].next, "/hitl:skeleton T-3");
  assert.equal(r.tasks["T-3"].symbolStatus[APPLY].untouched, true);
  assert.equal(r.tasks["T-2"].status, "done");
  assert.equal(r.symbols[APPLY].status, "done");
});

test("T-3 tests red, then implemented green/verified/done; T-2 stays done throughout", () => {
  let idx = index({ t3Mode: "active", applyBody: "bodyA2" });
  const l = lock({ t3: { skeletonAt: SK3, testsAt: "2026-11-02T08:00:00Z", doneAt: null } });
  let r = computeStatuses(idx, l, pass(idx, [TT2, "pass"], [TT3, "fail"]), {}, TASKS);
  assert.equal(r.tasks["T-3"].symbolStatus[APPLY].status, "red");
  assert.equal(r.tasks["T-3"].status, "red");
  assert.equal(r.tasks["T-2"].status, "done", "T-2's body moved on under T-3: still done");

  idx = index({ t3Mode: "active", applyBody: "bodyA3", t3Steps: false, plan: false });
  const tasks = [TASKS[0], { ...TASKS[1], symbols: TASKS[1].symbols.slice(1) }];
  const st = pass(idx, [TT2, "pass"], [TT3, "pass"]);
  r = computeStatuses(idx, l, st, {}, tasks);
  assert.equal(r.tasks["T-3"].status, "green");
  st.reviews["T-3"] = { verdict: "PASS", bodyHashes: { [APPLY]: "bodyA3", [PARSE]: "bodyP" } };
  r = computeStatuses(idx, l, st, {}, tasks);
  assert.equal(r.tasks["T-3"].symbolStatus[APPLY].status, "verified", "T-3's review, not T-2's (first @task)");
  const done = planApproval({ taskId: "T-3", stage: "done", by: "human", index: idx, lock: l, state: st, config: {}, task: tasks[1], tasks, statuses: r, now: "2026-11-02T09:00:00Z" });
  assert.equal(done.ok, true, done.reasons.join("; "));
  r = computeStatuses(idx, done.lock, st, {}, tasks);
  assert.equal(r.tasks["T-3"].status, "done");
  assert.equal(r.tasks["T-2"].status, "done");
  assert.equal(r.symbols[APPLY].status, "done");
});

test("a done task's symbol edited with no later task drops out of done (unchanged rule)", () => {
  const idx = index({ t3Steps: false, plan: false, applyBody: "edited" });
  idx.symbols[APPLY].tags.task = ["T-2"]; idx.symbols[PARSE].tags.task = ["T-2"];
  const l = lock({ t3: null }); l.symbols[APPLY].task = "T-2"; l.symbols[PARSE].task = "T-2";
  const r = computeStatuses(idx, l, pass(idx, [TT2, "pass"]), {}, [TASKS[0]]);
  assert.equal(r.tasks["T-2"].symbolStatus[APPLY].status, "green");
  assert.notEqual(r.tasks["T-2"].status, "done");
});

test("TODO(impl T-n) scopes a step to one task; plain steps go to every open task; done tasks ignore them", () => {
  const idx = index();
  idx.symbols[APPLY].todos = ["2. plan extra", "1. close leases"]; idx.symbols[APPLY].todoTasks = ["T-3", "T-4"];
  const l = lock();
  assert.equal(openStepsFor(idx, l, APPLY, "T-3"), 1);
  assert.equal(openStepsFor(idx, l, APPLY, "T-4"), 1);
  assert.equal(openStepsFor(idx, l, APPLY, "T-2"), 0, "done task");
  idx.symbols[APPLY].todoTasks = ["T-4", "T-4"];
  assert.equal(openStepsFor(idx, l, APPLY, "T-3"), 0);
  const r = computeStatuses(idx, l, pass(idx, [TT2, "pass"]), {}, TASKS);
  assert.notEqual(r.tasks["T-3"].symbolStatus[APPLY].status, "skeleton");
  assert.equal(r.symbols[APPLY].byTask["T-4"], "skeleton", "a scoped TODO line makes T-4 an owner");
  idx.symbols[APPLY].todoTasks = undefined; // plain lines, two open tasks: both wait
  idx.symbols[APPLY].tags.task = ["T-2", "T-3", "T-4"];
  assert.equal(openStepsFor(idx, l, APPLY, "T-3"), 2);
  assert.equal(openStepsFor(idx, l, APPLY, "T-4"), 2);
});

test("indexer: scoped TODO lines keep the step text, todoTasks only when a line is scoped", () => {
  const mk = (lines) => toIndexSymbols({ path: F, symbols: [{ name: "f", kind: "function", doc: "", sigText: "f()", bodyText: "{}", commentLines: lines.map((text) => ({ text })) }] }, "ts").symbols[0];
  const a = mk(["TODO(impl): 1. a", "2. done step"]);
  assert.deepEqual(a.todos, ["1. a"]); assert.equal(a.todoTasks, undefined); assert.deepEqual(a.flowSteps, ["2. done step"]);
  const b = mk(["TODO(impl T-3): 3. b", "TODO(impl): 4. c"]);
  assert.deepEqual(b.todos, ["3. b", "4. c"]); assert.deepEqual(b.todoTasks, ["T-3", null]); assert.deepEqual(b.flowSteps, []);
});

test("lock: approval history kept (old entries without history read as [task]); currentTask picks the open task", () => {
  assert.deepEqual(lockedTasks({ task: "T-3" }), ["T-3"]);
  assert.deepEqual(lockedTasks({ task: "T-3", tasks: ["T-2", "T-3"] }), ["T-2", "T-3"]);
  const idx = index();
  const l = lock({ t3: null }); l.symbols[APPLY].task = "T-2"; l.symbols[PARSE].task = "T-2";
  const r = planApproval({ taskId: "T-3", stage: "skeleton", by: "human", index: idx, lock: l, state: { runs: {} }, config: {}, task: TASKS[1], tasks: TASKS, now: SK3 });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.lock.symbols[APPLY].task, "T-3");
  assert.deepEqual(r.lock.symbols[APPLY].tasks, ["T-2", "T-3"]);
  assert.equal(r.lock.symbols[PLAN].tasks, undefined, "single-task entries unchanged");
  assert.equal(r.lock.tests[TT2].task, "T-2", "T-2's locked test is not re-owned by T-3");
  assert.equal(r.lock.tests[TT3].task, "T-3");
  assert.equal(currentTask(idx.symbols[APPLY], r.lock, APPLY), "T-3");
  assert.equal(currentTask(idx.symbols[APPLY], { ...r.lock, tasks: { ...r.lock.tasks, "T-3": { doneAt: "x" }, "T-2": { doneAt: "y" } } }, APPLY), "T-3", "all done: newest");
  assert.equal(testOwner(idx, r.lock, TT2), "T-2");
});

test("approve T-3 tests: T-2's passing tests covering the shared symbol are not 'vacuous' and stay T-2's", () => {
  const idx = index({ t3Mode: "active" });
  const st = pass(idx, [TT2, "pass"], [TT3, "fail"]);
  const r = planApproval({ taskId: "T-3", stage: "tests", by: "human", index: idx, lock: lock(), state: st, config: {}, task: TASKS[1], tasks: TASKS, now: "2026-11-02T08:00:00Z" });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.lock.tests[TT3].stage, "locked");
  assert.equal(r.lock.tests[TT3].task, "T-3");
  assert.equal(r.lock.tests[TT2].task, "T-2");
});

test("tasks md boxes: T-3's modify rows are not ticked while T-3 works on them", () => {
  const idx = index();
  const r = computeStatuses(idx, lock(), pass(idx, [TT2, "pass"]), {}, TASKS);
  const info = tasksInfo(idx, { runs: {} }, r, TASKS, (ref) => `${F}#${ref}`);
  assert.deepEqual(info["T-2"].symDone, { 1: true, 2: true });
  assert.deepEqual(info["T-3"].symDone, { 1: false, 2: false, 3: false });
});

test("drift/precommit: '@status done' of T-2 with T-3 open is an info hand-off, not forged; intent re-approval names T-3", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-mt-"));
  try {
    const idx = index();
    const l = lock({ t3: null }); l.symbols[APPLY] = { task: "T-2", impl: "agent", intentHash: "old", sigHash: `sig-${APPLY}` };
    const st = pass(idx, [TT2, "pass"]);
    const d = await computeDriftFrom(root, idx, { lock: l, state: st, config: {} });
    const tagItem = d.items.find((i) => i.code === "STATUS_TAG_STALE" && i.symbol === APPLY);
    assert.equal(tagItem?.level, "info", JSON.stringify(d.items.filter((i) => i.symbol === APPLY)));
    assert.match(tagItem.message, /T-2's; T-3 now works on it/);
    assert.ok(!d.items.some((i) => i.code === "STATUS_FORGED"));
    const intent = d.items.find((i) => i.code === "INTENT_CHANGED" && i.symbol === APPLY);
    assert.match(intent.message, /\/hitl:approve T-3/);
    assert.equal(intent.task, "T-3");
    assert.ok(!d.items.some((i) => i.code === "BODY_CHANGED" && i.symbol === APPLY));
    const statuses = computeStatuses(idx, l, st, {}, TASKS);
    assert.deepEqual(forgedStatuses(idx, statuses, l, st), []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
