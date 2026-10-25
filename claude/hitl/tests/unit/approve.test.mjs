// P2 — approve stages/preconditions (§E.5), lock IO, pre-commit hook block editing, forged status check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { planApproval, defaultStage, readLock, writeLock, emptyLock, stableStringify } from "../../scripts/lib/lock.mjs";
import { applyRuns, emptyState, recordRuns, readState, recordReview } from "../../scripts/lib/state.mjs";
import { buildRunRecords } from "../../scripts/lib/runner.mjs";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { editHook, hookBlock, BEGIN } from "../../scripts/cmd/install-git-hook.mjs";
import { forgedStatuses } from "../../scripts/cmd/precommit.mjs";
import { fixtureIndex, TASKS, IDS } from "./status.test.mjs";

const { CU, FE, T1, T2 } = IDS;
const NOW = "2026-10-25T00:00:00.000Z";
const base = (o) => ({ taskId: "T-1", index: fixtureIndex(), lock: emptyLock(), state: emptyState(), config: {}, task: TASKS[0], tasks: TASKS, now: NOW, ...o });
const runs = (index, outcome, message = "") => applyRuns(emptyState(), buildRunRecords(index, [T1, T2].map((testId) => ({ testId, outcome, message }))));

test("skeleton: locks tagged symbols + test stubs; dry-run style change lists", () => {
  const r = planApproval(base({ by: "human" }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.stage, "skeleton");
  assert.deepEqual(Object.keys(r.lock.symbols).sort(), [FE, CU].sort());
  assert.equal(r.lock.symbols[CU].sigHash, "sigCU");
  assert.equal(r.lock.symbols[FE].impl, "manual");
  assert.equal(r.lock.tests[T1].stage, "stub");
  assert.equal(r.lock.tasks["T-1"].skeletonAt, NOW);
  assert.deepEqual(r.changes.symbols.new.sort(), [FE, CU].sort());
  assert.deepEqual(r.changes.acCoverage["T-1.AC1"], [T1]);
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
  assert.match(all, /UserRepo\.findByEmail has no @task T-1/);
  assert.match(all, /T-1\.AC2 has no test stub/);
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
  assert.equal(defaultStage(sk, "T-1"), "tests");
  let r = planApproval(base({ index: idx, lock: sk, state: runs(idx, "fail", "expected throw") }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.lock.tests[T1].stage, "locked");
  assert.equal(r.lock.tests[T1].bodyHash, idx.symbols[T1].bodyHash);
  assert.equal(r.lock.tests[T1].lockedBy, "human");
  assert.equal(r.lock.tasks["T-1"].testsAt, NOW);
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
  assert.match(r.reasons.join(), /skeleton of T-1 not approved/);
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
  st.reviews["T-1"] = { verdict: "PASS", bodyHashes: { [CU]: "bodyCU2", [FE]: "bodyFE2" } };
  statuses = computeStatuses(idx, lock, st, {}, TASKS);
  r = planApproval(base({ index: idx, lock, state: st, statuses, stage: "done" }));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.lock.tasks["T-1"].doneBodyHashes, { [CU]: "bodyCU2", [FE]: "bodyFE2" });
  assert.equal(computeStatuses(idx, r.lock, st, {}, TASKS).tasks["T-1"].status, "done");
  const lowTask = { ...TASKS[0], risk: "low" };
  st.reviews["T-1"].verdict = "WITH FIXES";
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
    await Promise.all([recordRuns(root, [{ testId: "a", outcome: "pass", message: "x".repeat(300) }]), recordRuns(root, [{ testId: "b", outcome: "fail" }]), recordReview(root, "T-1", { verdict: "PASS" })]);
    const st = await readState(root);
    assert.deepEqual(Object.keys(st.runs).sort(), ["a", "b"]);
    assert.equal(st.runs.a.message.length, 200);
    assert.equal(st.reviews["T-1"].verdict, "PASS");
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
  const T = (idx.symbols[CU].tags.task || [])[0] || "T-1";
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
