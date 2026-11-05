// P2 — approve stages/preconditions (§E.5), lock IO, pre-commit hook block editing, forged status check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planApproval, defaultStage, readLock, writeLock, emptyLock, stableStringify, referencesTo, isSuperCall, doneBodyHash, intentLines, appendIntentLog } from "../../scripts/lib/lock.mjs";
import { applyRuns, emptyState, recordRuns, readState, recordReview } from "../../scripts/lib/state.mjs";
import { buildRunRecords } from "../../scripts/lib/runner.mjs";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { editHook, hookBlock, BEGIN } from "../../scripts/cmd/install-git-hook.mjs";
import { forgedStatuses } from "../../scripts/cmd/precommit.mjs";
import { fixtureIndex, TASKS, IDS } from "./status.test.mjs";
import { makeProject, REPO, SVC, TASKS as PTASKS, TESTS as PTESTS } from "./_project.mjs";
import { loadConfig } from "../../scripts/lib/config.mjs";
import { updateIndex, readIndex } from "../../scripts/lib/indexer.mjs";
import { readTasks } from "../../scripts/lib/tasksmd.mjs";
import { strip } from "../../scripts/lib/strip.mjs";
import { computeDrift } from "../../scripts/lib/drift.mjs";
import { run as approveCmd } from "../../scripts/cmd/approve.mjs";

const { CU, FE, T1, T2 } = IDS;
const NOW = "2026-10-25T00:00:00.000Z";
const base = (o) => ({ taskId: "QT-T1", index: fixtureIndex(), lock: emptyLock(), state: emptyState(), config: {}, task: TASKS[0], tasks: TASKS, now: NOW, ...o });
const runs = (index, outcome, message = "") => applyRuns(emptyState(), buildRunRecords(index, [T1, T2].map((testId) => ({ testId, outcome, message }))));

test("skeleton: locks tagged symbols + test stubs; dry-run style change lists", () => {
  const r = planApproval(base({ by: "human" }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.stage, "skeleton");
  assert.deepEqual(Object.keys(r.lock.symbols).sort(), [FE, CU].sort());
  assert.equal(r.lock.symbols[CU].sigHash, "sigCU");
  assert.equal(r.lock.symbols[FE].impl, "manual");
  assert.equal(r.lock.tests[T1].stage, "stub");
  assert.equal(r.lock.tasks["QT-T1"].skeletonAt, NOW);
  assert.deepEqual(r.changes.symbols.new.sort(), [FE, CU].sort());
  assert.deepEqual(r.changes.acCoverage["QT-T1.AC1"], [T1]);
  // re-approval after sig drift reports "changed"
  const idx = fixtureIndex(); idx.symbols[CU].sigHash = "sigCU-new";
  const r2 = planApproval(base({ index: idx, lock: r.lock, stage: "skeleton" }));
  assert.deepEqual(r2.changes.symbols.changed, [{ id: CU, what: ["sig"] }]);
  assert.equal(r2.lock.symbols[CU].sigHash, "sigCU-new");
});

test("skeleton preconditions: missing @task tag, AC without stub, unknown symbol, parse errors", () => {
  const idx = fixtureIndex();
  idx.symbols[FE].tags.task = [];
  delete idx.symbols[T2];
  const task = { ...TASKS[0], parseErrors: [{ message: "bad meta" }], symbols: [...TASKS[0].symbols, { order: 3, ref: "Nope.fn", file: "src/x.ts" }] };
  const r = planApproval(base({ index: idx, task }));
  assert.equal(r.ok, false);
  const all = r.reasons.join("\n");
  assert.match(all, /UserRepo\.findByEmail has no @task QT-T1/);
  assert.match(all, /QT-T1\.AC2 has no test stub/);
  assert.match(all, /Nope\.fn not found/);
  assert.match(all, /parse errors: bad meta/);
  assert.equal(planApproval(base({ index: idx, task, force: true })).ok, true, "--force overrides");
});

test("--by auto refused for high risk, allowed for low risk", () => {
  const r = planApproval(base({ by: "auto" }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.reasons, ["auto approval only for low-risk tasks"]);
  const low = planApproval(base({ by: "auto", task: { ...TASKS[0], risk: "low" } }));
  assert.equal(low.ok, true);
  assert.equal(low.lock.symbols[CU].approvedBy, "auto");
});

test("--symbols limits the symbols written", () => {
  const r = planApproval(base({ symbols: ["UserService.createUser"] }));
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.lock.symbols), [CU]);
});

test("tests stage: requires fresh red (fail, or error with sentinel); vacuous/stale/bad errors refused", () => {
  const sk = planApproval(base()).lock;
  const idx = fixtureIndex({ mode: "active" });
  assert.equal(defaultStage(sk, "QT-T1"), "tests");
  let r = planApproval(base({ index: idx, lock: sk, state: runs(idx, "fail", "expected throw") }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.lock.tests[T1].stage, "locked");
  assert.equal(r.lock.tests[T1].bodyHash, idx.symbols[T1].bodyHash);
  assert.equal(r.lock.tests[T1].lockedBy, "human");
  assert.equal(r.lock.tasks["QT-T1"].testsAt, NOW);
  assert.equal(planApproval(base({ index: idx, lock: sk, state: runs(idx, "error", "TODO(impl): UserService.createUser") })).ok, true);
  r = planApproval(base({ index: idx, lock: sk, state: runs(idx, "error", "SyntaxError: x") }));
  assert.equal(r.ok, false); assert.match(r.reasons[0], /without the TODO\(impl\) sentinel/);
  r = planApproval(base({ index: idx, lock: sk, state: runs(idx, "pass") }));
  assert.equal(r.ok, false); assert.match(r.reasons[0], /vacuous/);
  const st = runs(idx, "fail"); const idx2 = fixtureIndex({ mode: "active" }); idx2.symbols[T1].bodyHash = "edited";
  r = planApproval(base({ index: idx2, lock: sk, state: st }));
  assert.equal(r.ok, false); assert.match(r.reasons.join(), /stale/);
  r = planApproval(base({ index: idx, lock: sk, state: emptyState() }));
  assert.match(r.reasons.join(), /no recorded run/);
  r = planApproval(base({ index: fixtureIndex(), lock: sk, stage: "tests" }));
  assert.match(r.reasons.join(), /no active tests/);
  r = planApproval(base({ index: idx, lock: emptyLock(), stage: "tests", state: runs(idx, "fail") }));
  assert.match(r.reasons.join(), /skeleton of QT-T1 not approved/);
});

test("tests stage re-lock: green tests allowed once tests were locked before (mutation killers / fix-loop tests)", () => {
  const idx = fixtureIndex({ mode: "active" });
  const locked = planApproval(base({ index: idx, lock: planApproval(base()).lock, state: runs(idx, "fail") })).lock;
  const idx2 = fixtureIndex({ mode: "active", implemented: true });
  idx2.symbols[T2].bodyHash = "new-killer-test";
  const r = planApproval(base({ index: idx2, lock: locked, stage: "tests", state: runs(idx2, "pass") }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.changes.tests.changed, [{ id: T2, what: ["body"] }]);
  assert.equal(r.lock.tests[T2].bodyHash, "new-killer-test");
});

test("done stage: requires verified symbols; auto requires review PASS; records doneBodyHashes", () => {
  const idx = fixtureIndex({ mode: "active", implemented: true });
  const sk = planApproval(base()).lock;
  const lock = planApproval(base({ index: fixtureIndex({ mode: "active" }), lock: sk, state: runs(fixtureIndex({ mode: "active" }), "fail") })).lock;
  const st = runs(idx, "pass");
  let statuses = computeStatuses(idx, lock, st, {}, TASKS);
  let r = planApproval(base({ index: idx, lock, state: st, statuses, stage: "done" }));
  assert.equal(r.ok, false); assert.match(r.reasons.join(), /status green \(needs verified\)/);
  st.reviews["QT-T1"] = { verdict: "PASS", bodyHashes: { [CU]: "bodyCU2", [FE]: "bodyFE2" } };
  statuses = computeStatuses(idx, lock, st, {}, TASKS);
  r = planApproval(base({ index: idx, lock, state: st, statuses, stage: "done" }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.lock.tasks["QT-T1"].doneBodyHashes, { [CU]: "bodyCU2", [FE]: "bodyFE2" });
  assert.equal(computeStatuses(idx, r.lock, st, {}, TASKS).tasks["QT-T1"].status, "done");
  const lowTask = { ...TASKS[0], risk: "low" };
  st.reviews["QT-T1"].verdict = "WITH FIXES";
  r = planApproval(base({ index: idx, lock, state: st, statuses, stage: "done", by: "auto", task: lowTask }));
  assert.equal(r.ok, false); assert.match(r.reasons[0], /requires review verdict PASS/);
});

test("lock/state IO: sorted keys, 2-space JSON, trailing newline, atomic writes under index lock", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-lock-"));
  try {
    const lock = planApproval(base()).lock;
    await writeLock(root, lock);
    const text = readFileSync(join(root, ".hitl/index/skeleton.lock.json"), "utf8");
    assert.equal(text, stableStringify(lock));
    assert.ok(text.endsWith("}\n"));
    assert.ok(text.indexOf('"schema"') < text.indexOf('"symbols"') && text.indexOf('"symbols"') < text.indexOf('"tasks"') && text.indexOf('"tasks"') < text.indexOf('"tests"'));
    assert.deepEqual(await readLock(root), JSON.parse(text));
    await Promise.all([recordRuns(root, [{ testId: "a", outcome: "pass", message: "x".repeat(300) }]), recordRuns(root, [{ testId: "b", outcome: "fail" }]), recordReview(root, "QT-T1", { verdict: "PASS" })]);
    const st = await readState(root);
    assert.deepEqual(Object.keys(st.runs).sort(), ["a", "b"]);
    assert.equal(st.runs.a.message.length, 200);
    assert.equal(st.reviews["QT-T1"].verdict, "PASS");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("install-git-hook block: create, idempotent replace, before trailing exit 0, uninstall", () => {
  const b = hookBlock(".");
  assert.match(b, /node "\$\{HITL_HOME:-\$HOME\/\.config\/nvim\/claude\/hitl\}\/scripts\/hitl-index\.mjs" precommit \|\| exit 1/);
  const created = editHook(null, b);
  assert.ok(created.startsWith("#!/bin/sh\n"));
  assert.equal(editHook(created, b), created, "idempotent");
  const withExit = editHook("#!/bin/sh\nnpm test\nexit 0\n", b);
  assert.ok(withExit.indexOf(BEGIN) < withExit.indexOf("exit 0\n"));
  const removed = editHook(withExit, "", true);
  assert.ok(!removed.includes(BEGIN));
  assert.match(removed, /npm test\nexit 0/);
  assert.match(hookBlock("apps/web"), /^\(cd "apps\/web" && node /m);
});

test("forged status: source says verified but computed lower → block item", () => {
  const idx = fixtureIndex({ mode: "active", implemented: true });
  idx.symbols[CU].tags.status = "verified";
  const statuses = computeStatuses(idx, null, runs(idx, "pass"), {}, TASKS);
  const items = forgedStatuses(idx, statuses);
  assert.equal(items.length, 1);
  assert.equal(items[0].code, "STATUS_FORGED");
  assert.equal(items[0].level, "block");
  assert.equal(items[0].symbol, CU);
});

test("B8: recorded done/verified tag after a body-only edit is not forged; a hand-raised tag still is", async () => {
  const { wasRecorded } = await import("../../scripts/lib/drift.mjs");
  const idx = fixtureIndex({ mode: "active", implemented: true });
  const T = (idx.symbols[CU].tags.task || [])[0] || "QT-T1";
  idx.symbols[CU].tags.task = [T];
  idx.symbols[CU].tags.status = "done";
  const statuses = computeStatuses(idx, null, runs(idx, "pass"), {}, TASKS);
  // hand-raised: no done record in the lock → block
  assert.equal(forgedStatuses(idx, statuses, { tasks: {} }, {}).length, 1);
  // done was approved (doneAt + doneBodyHashes), then the human edited the body → not forged
  const lock = { tasks: { [T]: { doneAt: "2026-01-01T00:00:00Z", doneBodyHashes: { [CU]: "old" } } } };
  assert.equal(wasRecorded(lock, {}, idx.symbols[CU], CU, "done"), true);
  assert.deepEqual(forgedStatuses(idx, statuses, lock, {}), []);
  // doneAt without this symbol's body hash does not count
  assert.equal(wasRecorded({ tasks: { [T]: { doneAt: "x", doneBodyHashes: {} } } }, {}, idx.symbols[CU], CU, "done"), false);
  // verified needs a recorded review body hash
  idx.symbols[CU].tags.status = "verified";
  assert.equal(forgedStatuses(idx, statuses, lock, {}).length, 1);
  assert.deepEqual(forgedStatuses(idx, statuses, lock, { reviews: { [T]: { bodyHashes: { [CU]: "old" } } } }), []);
});

// ---------------------------------------------------------------- pruning locked items gone from the code
const OLD = "src/old.ts#Old.gone";
const dropFE = (idx) => { delete idx.symbols[FE]; idx.symbols[CU].tags.calls = ["UserRepo.save"]; return idx; };
const taskNoFE = { ...TASKS[0], symbols: TASKS[0].symbols.filter((s) => s.ref !== "UserRepo.findByEmail") };

test("prune tests: re-locking QT-T1 tests drops a renamed locked test of QT-T1, keeps other tasks' entries; drift clears", async () => {
  const { computeDriftFrom } = await import("../../scripts/lib/drift.mjs");
  const idx = fixtureIndex({ mode: "active" });
  const locked = planApproval(base({ index: idx, lock: planApproval(base()).lock, state: runs(idx, "fail") })).lock;
  locked.tests["tests/other.test.ts#gone of QT-T9"] = { ...locked.tests[T1], task: "QT-T9" };
  const idx2 = fixtureIndex({ mode: "active" });
  const T2b = T2.replace("returns user", "returns the new user");
  idx2.symbols[T2b] = { ...idx2.symbols[T2], id: T2b, name: "QT-T1.AC2 returns the new user" };
  delete idx2.symbols[T2];
  const st = applyRuns(emptyState(), buildRunRecords(idx2, [T1, T2b].map((testId) => ({ testId, outcome: "fail" }))));
  const r = planApproval(base({ index: idx2, lock: locked, stage: "tests", state: st }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.changes.tests.removed, [T2]);
  assert.deepEqual(r.changes.tests.new, [T2b]);
  assert.deepEqual(r.changes.symbols.removed, []);
  assert.equal(r.lock.tests[T2], undefined);
  assert.ok(r.lock.tests["tests/other.test.ts#gone of QT-T9"], "QT-T9's entry is not QT-T1's to prune");
  const root = mkdtempSync(join(tmpdir(), "hitl-prune-"));
  try {
    const before = await computeDriftFrom(root, idx2, { lock: locked, state: st, config: {}, task: "QT-T1" });
    assert.ok(before.items.some((i) => i.code === "TEST_DELETED" && i.symbol === T2));
    const after = await computeDriftFrom(root, idx2, { lock: r.lock, state: st, config: {}, task: "QT-T1" });
    assert.ok(!after.items.some((i) => i.code === "TEST_DELETED"), JSON.stringify(after.items.map((i) => i.code)));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("prune skeleton: deleted, unreferenced locked symbols of QT-T1 are removed; done stage never prunes", () => {
  const lock = planApproval(base()).lock;
  lock.symbols[OLD] = { ...lock.symbols[CU], sigHash: "sigOLD", intentHash: "intOLD" };
  lock.symbols["src/old.ts#Other.gone"] = { ...lock.symbols[CU], task: "QT-T9", sigHash: "x", intentHash: "y" };
  const r = planApproval(base({ index: dropFE(fixtureIndex()), lock, task: taskNoFE, stage: "skeleton" }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.changes.symbols.removed.sort(), [FE, OLD].sort());
  assert.deepEqual(Object.keys(r.lock.symbols).sort(), [CU, "src/old.ts#Other.gone"].sort());
  assert.deepEqual(r.changes.tests.removed, [], "skeleton stage does not prune tests");
  const done = planApproval(base({ index: dropFE(fixtureIndex()), lock, task: taskNoFE, stage: "done", force: true }));
  assert.deepEqual(done.changes.symbols.removed, []);
  assert.ok(done.lock.symbols[OLD]);
});

test("prune skeleton: a deleted symbol still referenced (@calls) is refused, not pruned", () => {
  const lock = planApproval(base()).lock;
  const idx = fixtureIndex(); delete idx.symbols[FE]; // CU still has @calls UserRepo.findByEmail
  const r = planApproval(base({ index: idx, lock, task: taskNoFE, stage: "skeleton" }));
  assert.equal(r.ok, false);
  assert.match(r.reasons.join("\n"), /UserRepo\.findByEmail was removed but is still referenced by UserService\.createUser/);
  const scoped = planApproval(base({ index: idx, lock, task: taskNoFE, stage: "skeleton", symbols: ["UserRepo.findByEmail"] }));
  assert.equal(scoped.ok, false);
  assert.match(scoped.reasons.join("\n"), /still referenced/);
});

test("prune skeleton with --symbols: only the listed missing refs are removed", () => {
  const lock = planApproval(base()).lock;
  lock.symbols[OLD] = { ...lock.symbols[CU], sigHash: "sigOLD", intentHash: "intOLD" };
  const idx = dropFE(fixtureIndex());
  let r = planApproval(base({ index: idx, lock, task: taskNoFE, stage: "skeleton", symbols: ["UserRepo.findByEmail"] }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.changes.symbols.removed, [FE]);
  assert.ok(r.lock.symbols[OLD], "unlisted missing symbol stays");
  r = planApproval(base({ index: idx, lock, task: taskNoFE, stage: "skeleton", symbols: ["UserService.createUser"] }));
  assert.deepEqual(r.changes.symbols.removed, []);
  assert.ok(r.lock.symbols[FE] && r.lock.symbols[OLD]);
  r = planApproval(base({ index: idx, lock, task: taskNoFE, stage: "skeleton", symbols: ["Nope.fn"] }));
  assert.equal(r.ok, false); assert.match(r.reasons[0], /--symbols: Nope\.fn not resolvable/);
});

test("referencesTo: calls through super never reference a deleted method (any language)", () => {
  const index = { symbols: {
    "a.py#ErrResp.__init__": { file: "a.py", unresolvedCalls: ["super", "super().__init__", "super(Exception, self).__init__"] },
    "b.ts#View.render": { file: "b.ts", unresolvedCalls: ["super", "super.render"] },
    "c.py#Use.run": { file: "c.py", unresolvedCalls: ["enc.__init__", "widget.render"] },
  } };
  const none = () => null;
  assert.deepEqual(referencesTo(index, "gone.py#Encoder.__init__", none), ["c.py#Use.run"]);
  assert.deepEqual(referencesTo(index, "gone.ts#Widget.render", none), ["c.py#Use.run"]);
  assert.ok(isSuperCall("super") && isSuperCall("super()") && isSuperCall("super().x") && isSuperCall("super(A.B, self).x") && isSuperCall("super.x"));
  assert.ok(!isSuperCall("superUser.x") && !isSuperCall("self.super") && !isSuperCall("obj.__init__"));
});

// ---------------------------------------------------------------- intent stage (approve --change <id> --stage intent)
const NOW2 = "2026-11-01T00:00:00.000Z";
const TCH = TASKS.map((t) => ({ ...t, change: "feat-u" }));
/** QT-T1 done (skeleton → tests → done), then CU's intent rewritten in a stripped index (no @task tags). */
function doneThenTidied({ edit = (s) => s } = {}) {
  const sk = planApproval(base()).lock;
  const red = planApproval(base({ index: fixtureIndex({ mode: "active" }), lock: sk, state: runs(fixtureIndex({ mode: "active" }), "fail") })).lock;
  const impl = fixtureIndex({ mode: "active", implemented: true });
  const st = runs(impl, "pass");
  st.reviews["QT-T1"] = { verdict: "PASS", bodyHashes: { [CU]: "bodyCU2", [FE]: "bodyFE2" } };
  const done = planApproval(base({ index: impl, lock: red, state: st, statuses: computeStatuses(impl, red, st, {}, TASKS), stage: "done" }));
  assert.equal(done.ok, true, done.reasons.join("; "));
  const idx = fixtureIndex({ mode: "active", implemented: true });
  for (const s of Object.values(idx.symbols)) if (s.tags?.task) s.tags.task = []; // after `hitl-index strip`
  Object.assign(idx.symbols[CU], { intent: "Registers a user.\nA duplicate email is refused.", intentHash: "intCU2" });
  edit(idx.symbols[CU]);
  const statuses = computeStatuses(idx, done.lock, st, {}, TCH);
  const ib = (o) => ({ changeId: "feat-u", stage: "intent", by: "human", index: idx, lock: done.lock, state: st, config: {}, tasks: TCH, statuses, now: NOW2, ...o });
  return { lock: done.lock, idx, st, statuses, ib };
}

test("intent stage: re-locks only the changed intents of a done change; history, other fields and task records kept", () => {
  const { lock, ib, statuses } = doneThenTidied();
  assert.equal(statuses.tasks["QT-T1"].status, "done", "the docstring edit leaves QT-T1 done");
  const before = JSON.parse(JSON.stringify(lock));
  const r = planApproval(ib());
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.stage, "intent"); assert.equal(r.change, "feat-u");
  assert.deepEqual(r.changes.symbols.changed, [{ id: CU, what: ["intent"] }]);
  const e = r.lock.symbols[CU];
  assert.equal(e.intent, "Registers a user.\nA duplicate email is refused.");
  assert.equal(e.intentHash, "intCU2");
  assert.equal(e.intentApprovedAt, NOW2); assert.equal(e.intentApprovedBy, "human");
  for (const k of ["task", "sigHash", "todoHash", "signature", "approvedAt", "approvedBy", "impl", "prio"]) assert.deepEqual(e[k], before.symbols[CU][k], k);
  assert.deepEqual(e.intentLog, [{ task: "QT-T1", stage: "skeleton", lines: 1, at: NOW }, { task: "QT-T1", change: "feat-u", stage: "intent", lines: 2, at: NOW2 }]);
  assert.deepEqual(r.lock.symbols[FE], before.symbols[FE], "unchanged intent: entry untouched");
  assert.deepEqual(r.lock.tasks, before.tasks, "task records (done hashes) untouched");
  assert.deepEqual(r.lock.tests, before.tests);
  assert.deepEqual(lock, before, "pure: the input lock is not mutated");
  // multi-task history (tasks) survives; --symbols picks explicitly
  const hist = JSON.parse(JSON.stringify(lock)); hist.symbols[CU].tasks = ["QT-T0", "QT-T1"];
  hist.tasks["QT-T0"] = { doneAt: "2026-10-01T00:00:00.000Z", doneBodyHashes: { [CU]: "bodyCU-old" } };
  const r2 = planApproval(ib({ lock: hist, symbols: ["UserService.createUser"], statuses: { tasks: { "QT-T0": { status: "done" }, "QT-T1": { status: "done" } } } }));
  assert.equal(r2.ok, true, r2.reasons.join("; "));
  assert.deepEqual(r2.lock.symbols[CU].tasks, ["QT-T0", "QT-T1"]);
  assert.equal(doneBodyHash(hist, CU, ["QT-T0", "QT-T1"]).task, "QT-T1", "latest done record wins");
});

test("intent stage: refusals (sig, todo, body, open task, human only, nothing changed, bad --symbols); nothing planned on refusal", () => {
  const cases = [
    [(s) => { s.sigHash = "sigCU-x"; }, /createUser: signature changed/],
    [(s) => { s.todoHash = "todo-x"; s.todos = ["1. new step"]; }, /createUser: TODO\(impl\) steps changed/],
    [(s) => { s.bodyHash = "bodyCU3"; }, /createUser: body changed since QT-T1 was done/],
  ];
  for (const [edit, re] of cases) {
    const { ib, lock } = doneThenTidied({ edit });
    const r = planApproval(ib({ statuses: { tasks: { "QT-T1": { status: "done" } } } }));
    assert.equal(r.ok, false); assert.match(r.reasons.join("\n"), re);
    assert.deepEqual(r.lock, lock, "refused plan carries the unchanged lock");
  }
  const { ib } = doneThenTidied();
  let r = planApproval(ib({ statuses: { tasks: { "QT-T1": { status: "green" } } } }));
  assert.equal(r.ok, false); assert.match(r.reasons[0], /owning task QT-T1 is green/);
  for (const by of ["auto", "human-override"]) {
    r = planApproval(ib({ by })); assert.equal(r.ok, false); assert.match(r.reasons[0], /human-only/);
  }
  r = planApproval(ib({ changeId: "feat-nope" })); assert.match(r.reasons[0], /no tasks/);
  r = planApproval(ib({ symbols: ["Nope.x"] })); assert.match(r.reasons[0], /not resolvable/);
  r = planApproval(ib({ symbols: ["register"] })); assert.match(r.reasons[0], /not a symbol of change feat-u/);
  r = planApproval(ib({ taskId: "QT-T1" })); assert.match(r.reasons[0], /not a task id/);
  r = planApproval(ib({ stage: "done" })); assert.match(r.reasons[0], /only the intent, accept or reopen stage/);
  // implemented TODO lines turned into `n.` comments (no open todos): todoHash moved, not a refusal (as in drift)
  const impl = doneThenTidied({ edit: (s) => { s.todoHash = "todo-impl"; s.todos = []; } });
  assert.equal(planApproval(impl.ib()).ok, true);
  // a class has no done body record (done approvals record functions only): allowed, with a warning
  const cls = doneThenTidied();
  const UR = `${cls.idx.symbols[FE].parent}`;
  cls.lock.symbols[UR] = { task: "QT-T1", impl: "agent", signature: "class UserRepo", intent: "A repo.", sigHash: "c", intentHash: "intUR", todoHash: "t0", todos: [] };
  Object.assign(cls.idx.symbols[UR], { intent: "Stores users.", intentHash: "intUR2", sigHash: "c", todoHash: "t1", todos: [] });
  r = planApproval(cls.ib({ symbols: ["UserRepo"] }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.match(r.warnings.join(), /UserRepo: class has no done body record/);
  const { ib: ib2, idx } = doneThenTidied();
  idx.symbols[CU].intentHash = "intCU"; // back to the locked intent
  r = planApproval(ib2()); assert.equal(r.ok, false); assert.match(r.reasons[0], /no locked symbol of change feat-u has an intent that differs/);
});

test("skeleton approvals append intentLog only when the intent is new or changed; old entries are seeded", () => {
  const r1 = planApproval(base());
  assert.deepEqual(r1.lock.symbols[CU].intentLog, [{ task: "QT-T1", stage: "skeleton", lines: 1, at: NOW }]);
  const same = planApproval(base({ lock: r1.lock, now: NOW2, stage: "skeleton" }));
  assert.equal(same.lock.symbols[CU].intentLog.length, 1, "re-approval without an intent change adds nothing");
  const legacy = JSON.parse(JSON.stringify(r1.lock)); delete legacy.symbols[CU].intentLog; // locked before intentLog existed
  const idx = fixtureIndex(); Object.assign(idx.symbols[CU], { intent: "Registers a user.\nRefuses duplicates.", intentHash: "intCU2" });
  const r2 = planApproval(base({ index: idx, lock: legacy, now: NOW2, stage: "skeleton" }));
  assert.deepEqual(r2.lock.symbols[CU].intentLog, [{ task: "QT-T1", stage: "skeleton", lines: 1, at: NOW }, { task: "QT-T1", stage: "skeleton", lines: 2, at: NOW2 }]);
  assert.equal(intentLines("A.\n\n@param x y\nB."), 2);
  assert.deepEqual(appendIntentLog(null, { intent: "x", intentHash: "h" }, { task: "QT-T9", stage: "skeleton", at: "t" }), [{ task: "QT-T9", stage: "skeleton", lines: 1, at: "t" }]);
});

test("approve --change CLI: works after strip (no @task tags), dry-run and refusals write nothing", async () => {
  const repo = REPO.replace('throw new Error("TODO(impl): UserRepo.findByEmail");', "return this.users.find((u) => u.email === email);");
  const svc = SVC.replace('throw new Error("TODO(impl): UserService.createUser");', 'if (this.repo.findByEmail(email)) throw new Error("duplicate");\n    return this.repo.save({ id: email, email });');
  const root = makeProject({ "src/repo/userRepo.ts": repo, "src/services/userService.ts": svc, ".hitl/changes/feat-users/tasks.md": PTASKS.replace("← Planning: .hitl/planning/feat-users.md", "← Change: feat-users"),
    "tests/userService.test.ts": PTESTS.replace('it.todo("QT-T1.AC1 rejects duplicate email");', 'it("QT-T1.AC1 rejects duplicate email", () => {});') });
  rmSync(join(root, ".hitl/tasks/feat-users.md"));
  const config = await loadConfig(root);
  await updateIndex(root, null, { config });
  let index = await readIndex(root); const tasks = await readTasks(root);
  assert.equal(tasks[0].change, "feat-users");
  const plan = planApproval({ taskId: "QT-T1", by: "human", force: true, index, lock: emptyLock(), state: emptyState(), config, task: tasks[0], tasks });
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  const syms = Object.values(index.symbols).filter((s) => (s.tags?.task || []).includes("QT-T1") && s.kind !== "test");
  plan.lock.tasks["QT-T1"] = { ...plan.lock.tasks["QT-T1"], testsAt: "x", doneAt: "x", doneBodyHashes: Object.fromEntries(syms.map((s) => [s.id, s.bodyHash])) };
  await writeLock(root, plan.lock);
  const testId = Object.values(index.symbols).find((s) => s.kind === "test").id;
  await recordRuns(root, buildRunRecords(index, [{ testId, outcome: "pass", message: "" }]));
  const st = await strip(root, { target: "feat-users", config });
  assert.equal(st.ok, true, st.error); assert.ok(st.verified);
  const svcFile = join(root, "src/services/userService.ts");
  assert.doesNotMatch(readFileSync(svcFile, "utf8"), /@task/);
  writeFileSync(svcFile, readFileSync(svcFile, "utf8").replace("Registers a user.", "Registers a user; a duplicate email is refused."));
  const lockFile = join(root, ".hitl/index/skeleton.lock.json");
  const cli = async (args) => {
    const log = console.log, err = console.error; const out = [];
    console.log = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" "));
    try { return { code: await approveCmd(args, { root, config, json: true }), out: out.join("\n") }; } finally { console.log = log; console.error = err; }
  };
  const before = readFileSync(lockFile, "utf8");
  await updateIndex(root, null, { config });
  const ic = (await computeDrift(root, { config })).items.find((i) => i.code === "INTENT_CHANGED");
  assert.match(ic.message, /\/hitl:approve feat-users intent/, "done owners: drift points at the change-level re-approval");
  let r = await cli(["--change", "feat-users", "--stage", "intent", "--by", "human", "--dry-run"]);
  assert.equal(r.code, 0, r.out); assert.equal(readFileSync(lockFile, "utf8"), before, "dry run writes nothing");
  assert.deepEqual(JSON.parse(r.out).changes.symbols.changed.map((x) => x.id.split("#")[1]), ["UserService.createUser"]);
  assert.equal((await cli(["--change", "feat-users", "--by", "auto"])).code, 2);
  assert.equal((await cli(["QT-T1", "--stage", "intent"])).code, 2);
  assert.equal((await cli(["--change", "feat-users", "--force"])).code, 2);
  // a body edit is refused (QT-T1 is no longer done: its run is stale), and nothing is written
  const good = readFileSync(svcFile, "utf8");
  writeFileSync(svcFile, good.replace('throw new Error("duplicate")', 'throw new Error("dup")'));
  r = await cli(["--change", "feat-users", "--stage", "intent", "--by", "human"]);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /owning task QT-T1 is wip/); assert.equal(readFileSync(lockFile, "utf8"), before);
  writeFileSync(svcFile, good);
  r = await cli(["--change", "feat-users", "--stage", "intent", "--by", "human"]);
  assert.equal(r.code, 0, r.out);
  const L = await readLock(root);
  const id = Object.keys(L.symbols).find((k) => k.endsWith("#UserService.createUser"));
  assert.match(L.symbols[id].intent, /a duplicate email is refused/);
  assert.equal(L.symbols[id].intentApprovedBy, "human");
  assert.equal(L.symbols[id].task, "QT-T1");
  assert.deepEqual(L.tasks, JSON.parse(before).tasks);
  const drift = (await computeDrift(root, { config })).items.filter((i) => i.code === "INTENT_CHANGED");
  assert.deepEqual(drift, [], "re-approved: no INTENT_CHANGED left");
  // accept: human-only, no --force, an active change is refused (accept is for archived changes); nothing written
  const after = readFileSync(lockFile, "utf8");
  assert.equal((await cli(["--change", "feat-users", "--stage", "accept", "--by", "auto"])).code, 2);
  assert.equal((await cli(["--change", "feat-users", "--stage", "accept", "--force"])).code, 2);
  assert.equal((await cli(["QT-T1", "--stage", "accept"])).code, 2);
  r = await cli(["--change", "feat-users", "--stage", "accept", "--by", "human"]);
  assert.equal(r.code, 1, r.out); assert.match(r.out, /is not archived/); assert.equal(readFileSync(lockFile, "utf8"), after);
});
