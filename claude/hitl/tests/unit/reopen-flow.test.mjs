// 0.9 — after a reopen: status `reopened` + next, stale review, tests re-lock rules, skeleton markers, done closes it,
// AC boxes unchecked, ticket state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { planApproval } from "../../scripts/lib/lock.mjs";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { nextForTask } from "../../scripts/lib/nextstep.mjs";
import { tasksInfo } from "../../scripts/lib/synctags.mjs";
import { stateTypeFor } from "../../scripts/lib/tickets.mjs";
import { actionFor } from "../../scripts/lib/feature.mjs";
import { buildRunRecords } from "../../scripts/lib/runner.mjs";
import { applyRuns, emptyState } from "../../scripts/lib/state.mjs";
import { fixtureIndex, TASKS, IDS } from "./status.test.mjs";

const { CU, FE, T1, T2 } = IDS;
const REOPEN_AT = "2026-11-05T10:00:00.000Z", LATER = "2026-11-06T10:00:00.000Z";
const TASK = { ...TASKS[0], change: "feat-x" };
const doneLock = (index) => ({ schema: "hitl.lock/1",
  symbols: { [CU]: { task: "T-1", impl: "agent", sigHash: "sigCU", intentHash: "intCU", todoHash: "todoCU" }, [FE]: { task: "T-1", impl: "manual", sigHash: "sigFE", intentHash: "intFE", todoHash: "todoFE" } },
  tests: Object.fromEntries([[T1, "T-1.AC1"], [T2, "T-1.AC2"]].map(([id, ac]) => [id, { task: "T-1", ac: [ac], covers: [CU], stage: "locked", bodyHash: index.symbols[id].bodyHash, intentHash: "x" }])),
  tasks: { "T-1": { file: "x", risk: "high", skeletonAt: "2026-10-01T00:00:00Z", testsAt: "2026-10-02T00:00:00Z", doneAt: "2026-10-03T00:00:00Z",
    doneBodyHashes: { [CU]: "bodyCU2", [FE]: "bodyFE2" } } } });
const stateWith = (index, outcomes, reviewAt = "2026-10-03T00:00:00Z") => {
  const st = applyRuns(emptyState(), buildRunRecords(index, Object.entries(outcomes).map(([testId, outcome]) => ({ testId, outcome, message: "" }))));
  st.reviews["T-1"] = { verdict: "PASS", at: reviewAt, bodyHashes: { [CU]: "bodyCU2", [FE]: "bodyFE2" } };
  return st;
};
const recheck = (reopen) => [{ id: "N-2", kind: "recheck", title: "Recheck", status: "reopen pending", refs: [], acks: [], meta: { reopen } }];
const reopen = (index, lock, entry) => planApproval({ changeId: "feat-x", stage: "reopen", by: "human", tasks: [TASK], notes: recheck([entry]), lock, index, now: REOPEN_AT });

test("tests reopen: status reopened → /hitl:test; re-lock needs a rewritten test to fail; only reopened tests may change; then the normal path to done", () => {
  const idx = fixtureIndex({ implemented: true, mode: "active" });
  const st0 = stateWith(idx, { [T1]: "pass", [T2]: "pass" });
  assert.equal(computeStatuses(idx, doneLock(idx), st0, {}, [TASK]).tasks["T-1"].status, "done");
  const r = reopen(idx, doneLock(idx), { task: "T-1", stage: "tests", acs: ["T-1.AC2"], symbols: [] });
  assert.equal(r.ok, true, r.reasons.join("; "));
  let s = computeStatuses(idx, r.lock, st0, {}, [TASK]).tasks["T-1"];
  assert.deepEqual([s.status, s.next, s.reopen.stage, s.reopen.acs, s.reopen.tests], ["reopened", "/hitl:test T-1", "tests", ["T-1.AC2"], [T2]]);
  // done is refused while the reopen is pending
  assert.match(planApproval({ taskId: "T-1", stage: "done", by: "human", index: idx, lock: r.lock, state: st0, task: TASK, tasks: [TASK] }).reasons[0], /T-1 is reopened \(N-2, tests pending\): \/hitl:test T-1 first/);
  // rewritten AC2 test that passes against the current code → refused; --force skips the rule
  const idx2 = fixtureIndex({ implemented: true, mode: "active" }); idx2.symbols[T2].bodyHash = "tb-new";
  const tests = (index, state, o = {}) => planApproval({ taskId: "T-1", stage: "tests", by: "human", index, lock: r.lock, state, task: TASK, tasks: [TASK], now: LATER, ...o });
  let t = tests(idx2, stateWith(idx2, { [T1]: "pass", [T2]: "pass" }));
  assert.equal(t.ok, false); assert.match(t.reasons.join(";"), /rewritten after the reopen but passes against the current code/);
  assert.equal(tests(idx2, stateWith(idx2, { [T1]: "pass", [T2]: "pass" }), { force: true }).ok, true);
  // AC1's test (not reopened) changed too → refused
  const idx3 = fixtureIndex({ implemented: true, mode: "active" }); idx3.symbols[T2].bodyHash = "tb-new"; idx3.symbols[T1].bodyHash = "tb-other";
  assert.match(tests(idx3, stateWith(idx3, { [T1]: "pass", [T2]: "fail" })).reasons.join(";"), /locked test changed but was not reopened by N-2/);
  // rewritten and red → re-locked; pending cleared; status red → implement
  const st2 = stateWith(idx2, { [T1]: "pass", [T2]: "fail" });
  t = tests(idx2, st2);
  assert.equal(t.ok, true, t.reasons.join("; "));
  assert.equal(t.lock.tests[T2].stage, "locked"); assert.equal(t.lock.tests[T2].bodyHash, "tb-new");
  assert.deepEqual(t.lock.tasks["T-1"].reopened[0].pending, []);
  s = computeStatuses(idx2, t.lock, st2, {}, [TASK]).tasks["T-1"];
  assert.deepEqual([s.status, s.next], ["red", "/hitl:implement T-1"]);
  // implemented: green; the review from before the reopen is stale → review again (not verified)
  const idx4 = fixtureIndex({ implemented: true, mode: "active" }); idx4.symbols[T2].bodyHash = "tb-new"; idx4.symbols[CU].bodyHash = "bodyCU3";
  const st4 = stateWith(idx4, { [T1]: "pass", [T2]: "pass" });
  s = computeStatuses(idx4, t.lock, st4, {}, [TASK]).tasks["T-1"];
  assert.deepEqual([s.status, s.next], ["green", "/hitl:review T-1"]);
  assert.equal(planApproval({ taskId: "T-1", stage: "done", by: "auto", index: idx4, lock: t.lock, state: st4, task: { ...TASK, risk: "low" }, tasks: [TASK] }).reasons[0], "auto done-approval requires review verdict PASS");
  // a fresh review → verified → done closes the reopen item
  const st5 = { ...st4, reviews: { "T-1": { verdict: "PASS", at: LATER, bodyHashes: { [CU]: "bodyCU3", [FE]: "bodyFE2" } } } };
  const ss = computeStatuses(idx4, t.lock, st5, {}, [TASK]);
  assert.equal(ss.tasks["T-1"].status, "verified");
  const d = planApproval({ taskId: "T-1", stage: "done", by: "human", index: idx4, lock: t.lock, state: st5, task: TASK, tasks: [TASK], statuses: ss, now: LATER });
  assert.equal(d.ok, true, d.reasons.join("; "));
  assert.equal(d.lock.tasks["T-1"].doneAt, LATER); assert.equal(d.lock.tasks["T-1"].reopened[0].closedAt, LATER);
  assert.equal(computeStatuses(idx4, d.lock, st5, {}, [TASK]).tasks["T-1"].reopen, undefined, "closed: no open reopen");
});

test("skeleton reopen: /hitl:skeleton first, tests refused until the skeleton is re-approved; markers cleared, reopened tests kept", () => {
  const idx = fixtureIndex({ implemented: true, mode: "active" });
  const st0 = stateWith(idx, { [T1]: "pass", [T2]: "pass" });
  const r = reopen(idx, doneLock(idx), { task: "T-1", stage: "skeleton", acs: [], symbols: [CU] });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(Object.values(r.lock.tests).map((x) => x.stage), ["reopened", "reopened"], "both tests cover the reopened symbol");
  let s = computeStatuses(idx, r.lock, st0, {}, [TASK]).tasks["T-1"];
  assert.deepEqual([s.status, s.next], ["reopened", "/hitl:skeleton T-1"]);
  assert.match(planApproval({ taskId: "T-1", stage: "tests", by: "human", index: idx, lock: r.lock, state: st0, task: TASK, tasks: [TASK] }).reasons[0], /skeleton is reopened \(N-2\): \/hitl:skeleton T-1/);
  const idx2 = fixtureIndex({ implemented: true, mode: "active" }); idx2.symbols[CU].sigHash = "sigCU-new";
  const k = planApproval({ taskId: "T-1", stage: "skeleton", by: "human", index: idx2, lock: r.lock, state: st0, task: TASK, tasks: [TASK], now: LATER });
  assert.equal(k.ok, true, k.reasons.join("; "));
  assert.equal(k.lock.symbols[CU].reopen, undefined); assert.equal(k.lock.symbols[CU].sigHash, "sigCU-new");
  assert.deepEqual(Object.values(k.lock.tests).map((x) => x.stage), ["reopened", "reopened"], "skeleton approval never re-stubs reopened tests");
  assert.deepEqual(k.lock.tasks["T-1"].reopened[0].pending, ["tests"]);
  s = computeStatuses(idx2, k.lock, st0, {}, [TASK]).tasks["T-1"];
  assert.deepEqual([s.status, s.next], ["reopened", "/hitl:test T-1"]);
});

test("nextForTask, AC boxes, ticket state for reopened", () => {
  assert.equal(nextForTask("T-3", "reopened", { reopenStage: "skeleton" }), "/hitl:skeleton T-3");
  assert.equal(nextForTask("T-3", "reopened", { reopenStage: "tests" }), "/hitl:test T-3");
  assert.equal(stateTypeFor("reopened", {}, { states: {} }), "started");
  assert.equal(actionFor("reopened", "fast", true, "skeleton"), "skeleton", "a feature run never fast-lanes a reopened task");
  assert.equal(actionFor("reopened", "normal", true, "tests"), "test");
  const idx = fixtureIndex({ implemented: true, mode: "active" });
  const st0 = stateWith(idx, { [T1]: "pass", [T2]: "pass" });
  const r = reopen(idx, doneLock(idx), { task: "T-1", stage: "tests", acs: ["T-1.AC2"], symbols: [] });
  const statuses = computeStatuses(idx, r.lock, st0, {}, [TASK]);
  const info = tasksInfo(idx, st0, statuses, [TASK], (ref) => (ref === "UserService.createUser" ? CU : FE));
  assert.deepEqual([info["T-1"].status, info["T-1"].acDone], ["reopened", { "T-1.AC1": true, "T-1.AC2": false }]);
});
