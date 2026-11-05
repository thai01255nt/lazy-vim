// An archived change is frozen history: its done tasks stay done whatever later edits do to their symbols; drift reports
// the edits with task:null + change + fix (claim into an open task, or accept); approve offers both (skeleton --symbols
// claim, `--change <id> --stage accept`). Hand-built index/lock/state, modelled on refactor-lua-const-mirror (QT-T13).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { planApproval, bodyBaseline } from "../../scripts/lib/lock.mjs";
import { computeDriftFrom } from "../../scripts/lib/drift.mjs";
import { computeNext } from "../../scripts/lib/nextstep.mjs";
import { archivedChangeOf, isArchivedTask } from "../../scripts/lib/tasksmd.mjs";
import { approveBinding, formatDriftItem } from "../../scripts/hooks/common.mjs";

const F = "src/wallet.lua", TF = "tests/wallet_test.py";
const BEGIN = `${F}#beginGranting`, EXEC = `${F}#execLeaseDeduction`, PLAN = `${F}#planNew`;
const TT = `${TF}#QT-T13.AC1 grants`;
const DONE = "2026-10-31T18:38:38.695Z", LATER = "2026-11-03T00:00:00.000Z";
const ARCH_FILE = ".hitl/archive/2026-11-01-refactor-old/tasks.md", STALE_FILE = ".hitl/changes/refactor-old/tasks.md";

const sym = (id, o) => ({ id, name: id.split("#")[1], file: id.split("#")[0], kind: "function", exported: true, async: false, features: [], callers: [], callees: [],
  stub: false, todos: [], flowSteps: [], sigHash: `sig-${id}`, intentHash: `int-${id}`, todoHash: "t", span: { start: 1, end: 9 }, docSpan: { start: 1, end: 1 },
  intent: "Grants.", tags: { task: [], calls: [], covers: [], ac: [] }, ...o });

/** QT-T13 (refactor-old, archived, tags stripped) built BEGIN + EXEC; BEGIN's body (and maybe intent) changed later. QT-T20 is open in feat-new. */
function index({ beginBody = "bodyB2", beginIntent = null, beginSig = null, beginTags = [], testBody = "tb", plan = true } = {}) {
  const symbols = {
    [BEGIN]: sym(BEGIN, { bodyHash: beginBody, ...(beginIntent ? { intentHash: beginIntent, intent: "Grants, newer." } : {}), ...(beginSig ? { sigHash: beginSig } : {}),
      tags: { task: beginTags, calls: [], covers: [], ac: [] } }),
    [EXEC]: sym(EXEC, { bodyHash: "bodyE", callees: [BEGIN] }),
    [TT]: sym(TT, { kind: "test", bodyHash: testBody, tags: { covers: ["beginGranting"], ac: ["QT-T13.AC1"] }, test: { titlePath: ["QT-T13.AC1 grants"], mode: "active", coversResolved: [BEGIN, EXEC] } }),
  };
  if (plan) symbols[PLAN] = sym(PLAN, { bodyHash: "bodyPlan", stub: true, todos: ["1. plan"], tags: { task: ["QT-T20"], calls: [], covers: [], ac: [] } });
  return { schema: "hitl.index/1", files: {}, symbols };
}
const T13 = { id: "QT-T13", title: "Mirror", file: ARCH_FILE, change: "refactor-old", archived: true, prio: "P1", risk: "high", blockedBy: [], acs: [{ id: "QT-T13.AC1" }],
  symbols: [{ order: 1, ref: "beginGranting", change: "modify", file: F }, { order: 2, ref: "execLeaseDeduction", change: "modify", file: F }] };
const T20 = { id: "QT-T20", title: "Settle", file: ".hitl/changes/feat-new/tasks.md", change: "feat-new", archived: false, prio: "P1", risk: "high", blockedBy: [], acs: [],
  symbols: [{ order: 1, ref: "planNew", change: "new", file: F }] };
const TASKS = [T13, T20];
function lock({ doneAt = DONE, file = STALE_FILE, accepted = null } = {}) {
  return { schema: "hitl.lock/2",
    symbols: { [BEGIN]: { task: "QT-T13", impl: "agent", intent: "Grants.", sigHash: `sig-${BEGIN}`, intentHash: `int-${BEGIN}`, todoHash: "t", todos: [], approvedAt: "a", approvedBy: "human",
      ...(accepted ? { acceptedBodyHash: accepted, acceptedAt: LATER, acceptedBy: "human", acceptedChange: "refactor-old" } : {}) },
      [EXEC]: { task: "QT-T13", impl: "agent", intent: "Grants.", sigHash: `sig-${EXEC}`, intentHash: `int-${EXEC}`, todoHash: "t", todos: [] } },
    tests: { [TT]: { task: "QT-T13", stage: "locked", bodyHash: "tb", intentHash: `int-${TT}`, ac: ["QT-T13.AC1"], covers: [BEGIN, EXEC] } },
    tasks: { "QT-T13": { risk: "high", file, skeletonAt: "s", testsAt: "t", doneAt, doneBodyHashes: { [BEGIN]: "bodyB", [EXEC]: "bodyE" } } } };
}
/** Test runs: fresh against the given index (outcome), or recorded against the old body ("stale"). */
function runs(idx, outcome) {
  const b = outcome === "stale" ? "bodyB" : idx.symbols[BEGIN].bodyHash;
  return { runs: { [TT]: { outcome: outcome === "stale" ? "pass" : outcome, testBodyHash: idx.symbols[TT].bodyHash, coveredBodyHashes: { [BEGIN]: b, [EXEC]: "bodyE" } } }, mutation: {}, reviews: {} };
}
async function drift(idx, l, st, tasks = TASKS) {
  const root = mkdtempSync(join(tmpdir(), "hitl-arch-"));
  try { return (await computeDriftFrom(root, idx, { lock: l, state: st, config: {}, tasks })).items; } finally { rmSync(root, { recursive: true, force: true }); }
}
const of = (items, code, id = BEGIN) => items.find((i) => i.code === code && i.symbol === id);

// ---------------------------------------------------------------- archived detection + status
test("isArchivedTask: tasks docs first (a stale lock path still resolves), then the lock's archive path / archivedAt", () => {
  assert.equal(archivedChangeOf(lock(), TASKS, "QT-T13"), "refactor-old", "doc archived, lock file still .hitl/changes/");
  assert.equal(isArchivedTask(lock(), TASKS, "QT-T20"), false);
  assert.equal(archivedChangeOf(lock({ file: ARCH_FILE }), [], "QT-T13"), "refactor-old", "no docs: the lock's archive path");
  assert.equal(archivedChangeOf(lock(), [], "QT-T13"), null, "no docs, stale path: unknown");
  const l = lock(); Object.assign(l.tasks["QT-T13"], { archivedAt: LATER, change: "refactor-old" });
  assert.equal(archivedChangeOf(l, [], "QT-T13"), "refactor-old");
  assert.equal(archivedChangeOf(lock({ file: ARCH_FILE }), [{ ...T13, archived: false, file: STALE_FILE }], "QT-T13"), null, "an active doc wins");
});

test("status: an archived, done task stays done after a body edit with stale or failing tests", () => {
  for (const outcome of ["stale", "fail"]) {
    const idx = index();
    const r = computeStatuses(idx, lock(), runs(idx, outcome), {}, TASKS);
    assert.equal(r.tasks["QT-T13"].status, "done", outcome);
    assert.equal(r.tasks["QT-T13"].next, null);
    assert.match(r.tasks["QT-T13"].symbolStatus[BEGIN].reasons.join(), /archived in refactor-old/);
  }
  const idx = index();
  const r = computeStatuses(idx, lock({ file: ARCH_FILE }), runs(idx, "fail"), {}, []);
  assert.equal(r.tasks["QT-T13"].status, "done", "no tasks docs: the lock's archive path");
});

test("status: the active-change rule is unchanged; a force-archived task without doneAt is computed normally", () => {
  const idx = index();
  const active = [{ ...T13, archived: false, file: STALE_FILE }];
  let r = computeStatuses(idx, lock(), runs(idx, "pass"), {}, active);
  assert.notEqual(r.tasks["QT-T13"].status, "done", "active change: a done task's edited symbol drops out of done");
  assert.equal(r.tasks["QT-T13"].symbolStatus[BEGIN].status, "green");
  r = computeStatuses(idx, lock({ doneAt: null }), runs(idx, "fail"), {}, TASKS);
  assert.equal(r.tasks["QT-T13"].status, "red", "archived with --force while not done: computed normally");
});

// ---------------------------------------------------------------- drift
test("drift: an archived-only body edit is ARCHIVED_BODY_CHANGED (warn, task null, change, fix, test state); next is /hitl:sync", async () => {
  const idx = index();
  const l = lock(), st = runs(idx, "stale");
  const items = await drift(idx, l, st);
  const b = of(items, "ARCHIVED_BODY_CHANGED");
  assert.equal(b?.level, "warn", JSON.stringify(items.filter((i) => i.symbol === BEGIN)));
  assert.equal(b.task, null); assert.equal(b.change, "refactor-old");
  assert.match(b.fix, /^claim: add a modify row \+ @task <T> to an open task, then \/hitl:approve <T> skeleton beginGranting · accept: \/hitl:approve refactor-old accept$/);
  assert.match(b.message, /test runs stale/);
  assert.ok(!of(items, "BODY_CHANGED"), "replaces BODY_CHANGED");
  assert.match(of(await drift(idx, l, runs(idx, "fail")), "ARCHIVED_BODY_CHANGED").message, /tests failing/);
  assert.match(of(await drift(idx, l, runs(idx, "pass")), "ARCHIVED_BODY_CHANGED").message, /tests pass fresh/);
  const statuses = computeStatuses(idx, l, st, {}, TASKS);
  const next = computeNext({ tasks: TASKS, statuses, drift: { items }, lock: l });
  assert.equal(next.command, "/hitl:sync"); assert.equal(next.task, null);
});

test("drift: archived intent / signature changes are warn with task null; a signature change offers claim only", async () => {
  const idx = index({ beginIntent: "int2", beginSig: "sig2" });
  const items = await drift(idx, lock(), runs(idx, "pass"));
  const ic = of(items, "INTENT_CHANGED"), sc = of(items, "SIG_CHANGED");
  assert.equal(ic.level, "warn"); assert.equal(ic.task, null); assert.equal(ic.change, "refactor-old"); assert.match(ic.fix, /accept: \/hitl:approve refactor-old accept/);
  assert.equal(sc.level, "warn"); assert.equal(sc.task, null); assert.doesNotMatch(sc.fix, /accept/);
});

test("drift: an open task claiming it gives no body item; acceptedBodyHash clears it", async () => {
  const claimed = index({ beginTags: ["QT-T20"] });
  let items = await drift(claimed, lock(), runs(claimed, "pass"));
  assert.ok(!items.some((i) => i.symbol === BEGIN && /BODY_CHANGED/.test(i.code)), JSON.stringify(items.filter((i) => i.symbol === BEGIN)));
  const idx = index();
  items = await drift(idx, lock({ accepted: "bodyB2" }), runs(idx, "pass"));
  assert.ok(!items.some((i) => i.symbol === BEGIN && i.level !== "info"), JSON.stringify(items.filter((i) => i.symbol === BEGIN)));
  assert.equal(bodyBaseline(lock({ accepted: "bodyB2" }), BEGIN, ["QT-T13"]).accepted, true, "newer than the done record");
  const older = lock({ accepted: "bodyB2" }); older.symbols[BEGIN].acceptedAt = "2026-01-01T00:00:00Z";
  assert.equal(bodyBaseline(older, BEGIN, ["QT-T13"]).hash, "bodyB", "an older accept loses to a newer done record");
});

test("drift: a stale lock file path still resolves to archived; archived TEST_CHANGED gets task null + fix", async () => {
  const idx = index({ beginBody: "bodyB", testBody: "tb2" });
  const items = await drift(idx, lock({ file: STALE_FILE }), runs(idx, "pass"));
  const t = of(items, "TEST_CHANGED", TT);
  assert.equal(t.level, "warn"); assert.equal(t.task, null); assert.equal(t.change, "refactor-old");
  assert.match(t.fix, /claim: tag the test @ac <T>\.ACn \(or @task <T>\) of an open task, then \/hitl:approve <T> tests · accept: \/hitl:approve refactor-old accept/);
  const next = computeNext({ tasks: TASKS, statuses: computeStatuses(idx, lock(), runs(idx, "pass"), {}, TASKS), drift: { items }, lock: lock() });
  assert.deepEqual([next.command, next.task], ["/hitl:sync", null]);
});

// ---------------------------------------------------------------- claim (skeleton --symbols)
test("claim: skeleton --symbols X checks only X's row/tag (an untagged row of another symbol is ignored); the old task stays done", () => {
  const idx = index({ beginTags: ["QT-T20"] });
  idx.symbols[PLAN].tags.task = []; // QT-T20's own row, not tagged yet
  const t20 = { ...T20, symbols: [...T20.symbols, { order: 2, ref: "beginGranting", change: "modify", file: F }] };
  const tasks = [T13, t20];
  const st = runs(idx, "pass");
  const statuses = computeStatuses(idx, lock(), st, {}, tasks);
  const o = { taskId: "QT-T20", stage: "skeleton", by: "human", index: idx, lock: lock(), state: st, config: {}, task: t20, tasks, statuses, now: LATER };
  const all = planApproval(o);
  assert.equal(all.ok, false); assert.match(all.reasons.join(), /planNew has no @task QT-T20 tag/);
  const r = planApproval({ ...o, symbols: ["beginGranting"] });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.lock.symbols[BEGIN].task, "QT-T20");
  assert.deepEqual(r.lock.symbols[BEGIN].tasks, ["QT-T13", "QT-T20"]);
  assert.deepEqual(r.lock.tasks["QT-T13"], lock().tasks["QT-T13"], "the done record stays");
  const after = computeStatuses(idx, r.lock, st, {}, tasks);
  assert.equal(after.tasks["QT-T13"].status, "done");
  // a tag-stripped done task can claim one symbol too (its other rows have no tags)
  const idx2 = index({ beginTags: ["QT-T13"] });
  const r2 = planApproval({ ...o, taskId: "QT-T13", task: T13, tasks: TASKS, index: idx2, statuses: computeStatuses(idx2, lock(), runs(idx2, "pass"), {}, TASKS), symbols: ["beginGranting"] });
  assert.equal(r2.ok, true, r2.reasons.join("; "));
  assert.equal(r2.lock.tasks["QT-T13"].doneAt, DONE, "claiming into a done task keeps doneAt");
});

// ---------------------------------------------------------------- accept
const ab = (idx, l, st, o = {}) => ({ changeId: "refactor-old", stage: "accept", by: "human", index: idx, lock: l, state: st, config: {}, tasks: TASKS,
  statuses: computeStatuses(idx, l, st, {}, o.tasks || TASKS), now: LATER, ...o });

test("accept: records intent + body of an archived change's drifted symbols; nothing else in the lock moves", async () => {
  const idx = index({ beginIntent: "int2" });
  const l = lock(), st = runs(idx, "pass");
  const before = JSON.parse(JSON.stringify(l));
  const r = planApproval(ab(idx, l, st));
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.equal(r.stage, "accept"); assert.equal(r.change, "refactor-old");
  assert.deepEqual(r.changes.symbols.changed, [{ id: BEGIN, what: ["intent", "body"] }]);
  const e = r.lock.symbols[BEGIN], p = before.symbols[BEGIN];
  const moved = Object.keys({ ...e, ...p }).filter((k) => JSON.stringify(e[k]) !== JSON.stringify(p[k])).sort();
  assert.deepEqual(moved, ["acceptedAt", "acceptedBodyHash", "acceptedBy", "acceptedChange", "intent", "intentHash", "intentLog"]);
  assert.deepEqual([e.acceptedBodyHash, e.acceptedAt, e.acceptedBy, e.acceptedChange, e.intentHash], ["bodyB2", LATER, "human", "refactor-old", "int2"]);
  assert.deepEqual(e.intentLog.at(-1), { task: "QT-T13", change: "refactor-old", stage: "accept", lines: 1, at: LATER });
  assert.deepEqual(r.lock.symbols[EXEC], before.symbols[EXEC]);
  assert.deepEqual(r.lock.tasks, before.tasks); assert.deepEqual(r.lock.tests, before.tests);
  assert.deepEqual(l, before, "pure");
  const items = await drift(idx, r.lock, st);
  assert.ok(!items.some((i) => i.symbol === BEGIN && i.level === "warn"), JSON.stringify(items.filter((i) => i.symbol === BEGIN)));
  // a changed locked test is accepted too (named in --symbols); its hashes are re-recorded
  const ti = index({ beginBody: "bodyB", testBody: "tb2" });
  const rt = planApproval(ab(ti, lock(), runs(ti, "pass"), { symbols: ["QT-T13.AC1 grants"] }));
  assert.equal(rt.ok, true, rt.reasons.join("; "));
  assert.equal(rt.lock.tests[TT].bodyHash, "tb2"); assert.equal(rt.lock.tests[TT].acceptedChange, "refactor-old"); assert.equal(rt.lock.tests[TT].task, "QT-T13");
});

test("accept: refusals write nothing (not archived, open owner, not human, tests stale/failing, signature, nothing, unknown, not drifted)", () => {
  const idx = index();
  const l = lock();
  const refuse = (o, re, i = idx, st = runs(idx, "pass")) => {
    const r = planApproval(ab(i, l, st, o));
    assert.equal(r.ok, false, `expected refusal ${re}`); assert.match(r.reasons.join("\n"), re);
    assert.deepEqual(r.lock, lock(), "nothing planned");
  };
  refuse({ tasks: [{ ...T13, archived: false, file: STALE_FILE }, T20] }, /change refactor-old is not archived/);
  refuse({ symbols: ["beginGranting"] }, /owned by open task QT-T20/, index({ beginTags: ["QT-T20"] }), runs(index({ beginTags: ["QT-T20"] }), "pass"));
  for (const by of ["auto", "human-override"]) refuse({ by }, /human-only/);
  refuse({}, /covering tests are stale.*run hitl-index test/, idx, runs(idx, "stale"));
  refuse({}, /covering tests are failing/, idx, runs(idx, "fail"));
  const sig = index({ beginSig: "sig2" });
  refuse({}, /signature changed: claim it into a task/, sig, runs(sig, "pass"));
  const clean = index({ beginBody: "bodyB" });
  refuse({}, /nothing to accept/, clean, runs(clean, "pass"));
  refuse({ symbols: ["nope"] }, /nope not resolvable/);
  refuse({ symbols: ["execLeaseDeduction"] }, /execLeaseDeduction has no intent, TODO or body drift/);
  refuse({ symbols: ["planNew"] }, /not a symbol of change refactor-old/);
  refuse({ taskId: "QT-T13" }, /takes --change/);
});

test("intent stage: compares the body with acceptedBodyHash when it is the newer baseline", () => {
  const idx = index({ beginIntent: "int2" });
  const st = runs(idx, "pass");
  const io = (l) => ({ changeId: "refactor-old", stage: "intent", by: "human", index: idx, lock: l, state: st, config: {}, tasks: TASKS, statuses: computeStatuses(idx, l, st, {}, TASKS), now: LATER });
  const no = planApproval(io(lock()));
  assert.equal(no.ok, false); assert.match(no.reasons.join(), /body changed since QT-T13 was done \(archived change: \/hitl:approve refactor-old accept/);
  const yes = planApproval(io(lock({ accepted: "bodyB2" })));
  assert.equal(yes.ok, true, yes.reasons.join("; "));
});

// ---------------------------------------------------------------- hooks
test("hooks: /hitl:approve <change> accept binds (change, accept); intent and task tokens stay distinct; post-edit uses fix", () => {
  assert.deepEqual(approveBinding("refactor-old accept"), { kind: "change", change: "refactor-old", stage: "accept" });
  assert.deepEqual(approveBinding("refactor-old accept beginGranting,execLeaseDeduction"), { kind: "change", change: "refactor-old", stage: "accept" });
  assert.deepEqual(approveBinding("refactor-old intent"), { kind: "change", change: "refactor-old", stage: "intent" });
  assert.deepEqual(approveBinding("QT-T13 accept"), { kind: "task", task: "QT-T13" });
  assert.deepEqual(approveBinding("accept intent"), { kind: "any" }, "a stage word is never a change id");
  const it = { level: "warn", code: "ARCHIVED_BODY_CHANGED", symbol: BEGIN, task: null, change: "refactor-old", affected: [], message: "m",
    fix: "claim: add a modify row + @task <T> to an open task, then /hitl:approve <T> skeleton beginGranting · accept: /hitl:approve refactor-old accept" };
  const line = formatDriftItem(it);
  assert.match(line, /ARCHIVED_BODY_CHANGED beginGranting \(archived refactor-old\)/);
  assert.match(line, /accept: \/hitl:approve refactor-old accept/);
  assert.doesNotMatch(line, /\/hitl:approve null|locked/);
  assert.match(formatDriftItem({ ...it, code: "INTENT_CHANGED" }), /claim: .* · accept: \/hitl:approve refactor-old accept/);
  assert.match(formatDriftItem({ ...it, code: "INTENT_CHANGED", fix: undefined, task: "QT-T2" }), /\/hitl:approve QT-T2\)/, "an open task's item: unchanged hint");
});
