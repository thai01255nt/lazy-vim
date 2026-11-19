// 0.16 test policy: per-AC test decision (new · shared · covered · none · manual), its parser and checks, trace
// counting, lock rules (stubs, covered resolution, regression may pass, RED table, budget, extras, duplicate names),
// test names without ids (@ac lists), tests audit, mutation requirement and kill data, router rule, reports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseTasksMd } from "../../scripts/lib/tasksmd.mjs";
import { acPlan, auditTests, checkCoveredAcRefs, checkTestPlan, duplicateTestNames, parseTestCell, resolveCovered, testBudget } from "../../scripts/lib/testplan.mjs";
import { parseDoc } from "../../scripts/lib/tags.mjs";
import { buildTrace, renderTraceMd } from "../../scripts/lib/trace.mjs";
import { planApproval, emptyLock, testOwner } from "../../scripts/lib/lock.mjs";
import { applyRuns, emptyState } from "../../scripts/lib/state.mjs";
import { buildRunRecords, selectTests } from "../../scripts/lib/runner.mjs";
import { mutationRequiredFor, DEFAULTS } from "../../scripts/lib/config.mjs";
import { parseStryker } from "../../scripts/cmd/mutate.mjs";
import { resolveRoute } from "../../scripts/lib/route.mjs";
import { buildReport } from "../../scripts/lib/report.mjs";
import { buildFeatureReport } from "../../scripts/lib/feature.mjs";
import { fixtureIndex, TASKS, IDS } from "./status.test.mjs";

const { CU, FE, T1, T2 } = IDS;
const NOW = "2026-11-20T00:00:00.000Z";

const doc = (rows, { risk = "high (security)", acs = 3 } = {}) => `# Users Tasks

← Change: none | key: QFLT

> status: draft

## QFLT-T1 Register user

- prio: P1 | risk: ${risk} | impl: agent | blocked-by: none | status: todo

### Acceptance criteria

${Array.from({ length: acs }, (_, i) => `- [ ] QFLT-T1.AC${i + 1} Given a When b Then c${i + 1}`).join("\n")}

### Test plan

| ac  | test | kind | oracle | seam | author |
| --- | ---- | ---- | ------ | ---- | ------ |
${rows.join("\n")}
`;
const parse = (text) => parseTasksMd(text, ".hitl/tasks/quick-users.md").tasks[0];

test("parseTestCell: the five decisions, spaces optional, unknown and empty", () => {
  assert.deepEqual(parseTestCell("new: duplicate saved"), { test: "new", detail: "duplicate saved", bad: false });
  assert.deepEqual(parseTestCell("shared:AC1"), { test: "shared", detail: "AC1", bad: false });
  assert.deepEqual(parseTestCell("Covered: PWR-T3.AC1"), { test: "covered", detail: "PWR-T3.AC1", bad: false });
  assert.deepEqual(parseTestCell("none"), { test: "none", detail: null, bad: false });
  assert.equal(parseTestCell("maybe: later").bad, true);
  assert.equal(parseTestCell("").test, null);
});

test("parser: header-mapped columns with the test cell; escaped pipes; legacy 5-column tables read as new", () => {
  const t = parse(doc([
    "| AC1 | new: a duplicate in another case is saved \\| twice | example | spec | UserService.createUser | test-author |",
    "| AC2 | shared: AC1 | — | — | — | — |",
    "| AC3 | none: type-checked by the compiler | — | — | — | — |",
  ], { risk: "low" }));
  assert.deepEqual(t.testPlan.map((r) => [r.ac, r.test, r.detail]), [["AC1", "new", "a duplicate in another case is saved | twice"], ["AC2", "shared", "AC1"], ["AC3", "none", "type-checked by the compiler"]]);
  assert.equal(t.testPlan[0].seam, "UserService.createUser");
  // columns follow the header names, in any order
  const re = parse(doc([]).replace("| ac  | test | kind | oracle | seam | author |", "| ac | kind | oracle | seam | author | test |") + "| AC1 | example | spec | X.y | test-author | new: lost update |\n");
  assert.deepEqual([re.testPlan[0].kind, re.testPlan[0].test, re.testPlan[0].detail], ["example", "new", "lost update"]);
  const legacy = parse(doc([]).replace("| ac  | test | kind | oracle | seam | author |\n| --- | ---- | ---- | ------ | ---- | ------ |", "| ac | kind | oracle | seam | author |\n|----|------|--------|------|--------|") + "| AC1 | example | spec | X.y | test-author |\n");
  assert.deepEqual(legacy.testPlan[0], { ac: "AC1", kind: "example", oracle: "spec", seam: "X.y", author: "test-author", test: "new", detail: null, legacy: true });
  assert.deepEqual(checkTestPlan(legacy), [], "old projects keep working without migration");
});

test("checkTestPlan: defect named, details present, shared target, none forbidden on security/concurrency/data tasks", () => {
  const bad = parse(doc([
    "| AC1 | new | example | spec | X.y | test-author |",
    "| AC2 | shared: AC2 | — | — | — | — |",
    "| AC3 | none: wiring | — | — | — | — |",
    "| AC3 | manual: | — | — | — | — |",
    "| AC1 | maybe: x | — | — | — | — |",
  ]));
  const e = checkTestPlan(bad).join("\n");
  assert.match(e, /TEST_PLAN_NO_DEFECT: QFLT-T1\.AC1 new test names no defect/);
  assert.match(e, /TEST_PLAN_SHARED: QFLT-T1\.AC2 shares its own test/);
  assert.match(e, /TEST_PLAN_NONE_RISK: QFLT-T1\.AC3 "none:" is not allowed: QFLT-T1 has risk security/);
  assert.match(e, /TEST_PLAN_EMPTY: QFLT-T1\.AC3 "manual:" needs the check/);
  assert.match(e, /TEST_PLAN_BAD: QFLT-T1\.AC1 test "maybe: x"/);
  for (const r of ["concurrency", "data"]) assert.match(checkTestPlan(parse(doc(["| AC1 | none: wiring | — | — | — | — |"], { risk: `high (${r})`, acs: 1 }))).join(), /TEST_PLAN_NONE_RISK/);
  assert.deepEqual(checkTestPlan(parse(doc(["| AC1 | none: wiring | — | — | — | — |"], { risk: "high (public-api)", acs: 1 }))), [], "other risk reasons allow none");
  assert.match(checkTestPlan(parse(doc(["| AC1 | manual: try it by hand | — | — | — | — |"], { risk: "high (security)", acs: 1 }))).join(), /TEST_PLAN_NONE_RISK: QFLT-T1\.AC1 "manual:" is not allowed/, "security task refuses manual too");
  const noNew = parse(doc(["| AC1 | none: x | — | — | — | — |", "| AC2 | shared: AC1 | — | — | — | — |", "| AC3 | shared: AC9 | — | — | — | — |"], { risk: "low" }));
  assert.match(checkTestPlan(noNew).join("\n"), /AC2 shared: AC1 has no new row/);
  assert.match(checkTestPlan(noNew).join("\n"), /AC3 shared: AC9 is not an AC of QFLT-T1/);
  const cov = parse(doc(["| AC1 | covered: PWR-T9.AC1 | — | — | — | — |", "| AC2 | covered: rejects duplicate email | — | — | — | — |"], { acs: 2 }));
  assert.deepEqual(checkTestPlan(cov), []);
  assert.deepEqual(checkCoveredAcRefs(cov, new Set(["QFLT-T1.AC1"])), ["TEST_PLAN_COVERED: QFLT-T1.AC1 covered: PWR-T9.AC1 is not a known AC"], "a test title is checked at lock, an AC id here");
});

test("acPlan: no row → new; several rows → strongest wins, manual checks kept", () => {
  const t = parse(doc(["| AC1 | covered: x | — | — | — | — |", "| AC1 | manual: looks right | — | — | — | — |", "| AC2 | none: config | — | — | — | — |"], { risk: "low" }));
  assert.equal(acPlan(t, "QFLT-T1.AC1").test, "covered");
  assert.deepEqual(acPlan(t, "QFLT-T1.AC1").manual, ["looks right"]);
  assert.equal(acPlan(t, "QFLT-T1.AC2").test, "none");
  assert.equal(acPlan(t, "QFLT-T1.AC3").test, "new", "no row → new (pre-0.16 meaning)");
});

test("tags: @catches free text, @kind regression, @ac ids separated by spaces and/or commas", () => {
  const { tags, errors } = parseDoc("@covers UserService.createUser @ac PWR-T12.AC1 FEC-T1.AC4, FEC-T1.AC5 @kind regression\n@catches a duplicate in another case is saved");
  assert.deepEqual(errors, []);
  assert.deepEqual(tags.ac, ["PWR-T12.AC1", "FEC-T1.AC4", "FEC-T1.AC5"]);
  assert.equal(tags.kind, "regression");
  assert.equal(tags.catches, "a duplicate in another case is saved");
});

// ---------------------------------------------------------------- trace
const SVC = "src/services/userService.ts", TF = "tests/userService.test.ts";
const sym = (id, o) => ({ id, name: id.split("#")[1], file: id.split("#")[0], callers: [], callees: [], ...o });
const tst = (id, ac, o = {}) => sym(id, { kind: "test", bodyHash: `tb-${id}`, tags: { ac, covers: ["UserService.createUser"], task: [] },
  test: { titlePath: ["UserService.createUser", id.split("> ")[1]], mode: "active", coversResolved: [CU] }, ...o });
const A = `${TF}#UserService.createUser > rejects duplicate email ignoring case`;
const B = `${TF}#UserService.createUser > keeps the original email`;
function traceBase(rows) {
  const index = { symbols: { [CU]: sym(CU, { kind: "method", bodyHash: "bCU", tags: { task: ["QFLT-T1"] } }), [A]: tst(A, ["QFLT-T1.AC1", "QFLT-T1.AC2"]), [B]: tst(B, ["QFLT-T9.AC1"]) }, warnings: [] };
  const run = (t) => ({ outcome: "pass", testBodyHash: index.symbols[t].bodyHash, coveredBodyHashes: { [CU]: "bCU" } });
  const t = parse(doc(rows, { risk: "low", acs: 5 }));
  const t9 = { id: "QFLT-T9", title: "x", acs: [{ id: "QFLT-T9.AC1", reqs: [], text: "x" }], symbols: [], testPlan: [], parseErrors: [], blockedBy: [], decisions: [] };
  return { index, state: { runs: { [A]: run(A), [B]: run(B) } }, lock: { symbols: {}, tests: {}, tasks: { "QFLT-T1": { skeletonAt: "x", testsAt: "y" } } },
    tasks: [t, t9], statuses: { symbols: {}, tasks: { "QFLT-T1": { status: "green", testsLocked: true }, "QFLT-T9": { status: "green", testsLocked: true } } }, plannings: new Map() };
}

test("trace: shared and covered prove through the named tests; none/manual are info, never AC_NO_TEST or AC_NOT_PROVEN", () => {
  const b = traceBase([
    "| AC1 | new: duplicate saved | example | spec | UserService.createUser | test-author |",
    "| AC2 | shared: AC1 | — | — | — | — |",
    "| AC3 | covered: QFLT-T9.AC1 | — | — | — | — |",
    "| AC4 | none: type-checked | — | — | — | — |",
    "| AC5 | manual: the mail reads well | — | — | — | — |",
  ]);
  const tr = buildTrace(b, { kind: "task", id: "QFLT-T1" });
  const codes = tr.items.map((i) => `${i.level}:${i.code}:${i.ref}`);
  assert.deepEqual(codes, ["info:AC_MANUAL_CHECK:QFLT-T1.AC5", "info:AC_NO_TEST_BY_DECISION:QFLT-T1.AC4"]);
  const acs = new Map(tr.rows.flatMap((r) => r.acs).map((a) => [a.id, a]));
  assert.equal(acs.get("QFLT-T1.AC2").proven, true, "the shared test carries both @ac");
  assert.equal(acs.get("QFLT-T1.AC3").proven, true, "covered by QFLT-T9.AC1's test");
  assert.deepEqual(acs.get("QFLT-T1.AC3").tests.map((x) => x.id), [B]);
  assert.equal(acs.get("QFLT-T1.AC4").exempt, "none");
  assert.deepEqual(tr.summary.acs, { total: 5, tested: 3, proven: 3, exempt: 2, byTest: { new: 1, shared: 1, covered: 1, none: 1, manual: 1 } });
  assert.match(renderTraceMd(tr), /none: type-checked/);
  // covered by a test title; unresolved covered ref
  const c = traceBase(["| AC1 | covered: keeps the original email | — | — | — | — |", "| AC3 | covered: nothing like this | — | — | — | — |"]);
  const t2 = buildTrace(c, { kind: "task", id: "QFLT-T1" });
  assert.equal(t2.rows.flatMap((r) => r.acs).find((a) => a.id === "QFLT-T1.AC1").proven, true);
  assert.ok(t2.items.some((i) => i.code === "AC_COVERED_UNRESOLVED" && i.level === "warn" && i.ref === "QFLT-T1.AC3"));
});

// ---------------------------------------------------------------- lock
const runs = (index, list) => applyRuns(emptyState(), buildRunRecords(index, list.map(([testId, outcome, message = ""]) => ({ testId, outcome, message }))));
const task = (rows) => ({ ...TASKS[0], riskReasons: ["public-api"], testPlan: rows.map(([ac, t, detail, o = {}]) => ({ ac, test: t, detail, kind: "example", oracle: "spec", seam: "UserService.createUser", author: "test-author", ...o })) });
const plan = (o) => planApproval({ taskId: "QT-T1", index: fixtureIndex(), lock: emptyLock(), state: emptyState(), config: {}, task: TASKS[0], tasks: TASKS, now: NOW, by: "human", ...o });

test("skeleton lock: none/manual need no stub; shared needs one stub with both @ac; covered must resolve", () => {
  const idx = fixtureIndex(); delete idx.symbols[T2];
  assert.match(plan({ index: idx }).reasons.join("\n"), /QT-T1\.AC2 has no test stub/, "pre-0.16: every AC needs a stub");
  assert.equal(plan({ index: idx, task: task([["AC1", "new", "dup"], ["AC2", "none", "type-checked"]]) }).ok, true);
  assert.equal(plan({ index: idx, task: task([["AC1", "new", "dup"], ["AC2", "manual", "looks right"]]) }).ok, true);
  const sh = plan({ index: idx, task: task([["AC1", "new", "dup"], ["AC2", "shared", "AC1"]]) });
  assert.match(sh.reasons.join("\n"), /QT-T1\.AC2 shares the test of QT-T1\.AC1: no test stub carries both @ac QT-T1\.AC1 QT-T1\.AC2/);
  const idx2 = fixtureIndex(); delete idx2.symbols[T2]; idx2.symbols[T1].tags.ac = ["QT-T1.AC1", "QT-T1.AC2"];
  assert.equal(plan({ index: idx2, task: task([["AC1", "new", "dup"], ["AC2", "shared", "AC1"]]) }).ok, true);
  const cov = plan({ index: idx, task: task([["AC1", "new", "dup"], ["AC2", "covered", "no such test"]]) });
  assert.match(cov.reasons.join("\n"), /QT-T1\.AC2 covered: no such test resolves to no indexed test/);
  assert.equal(plan({ index: idx, task: task([["AC1", "new", "dup"], ["AC2", "covered", "QT-T1.AC1 rejects duplicate"]]) }).ok, true, "covered by a title");
});

function lockedSkeleton(index, t) {
  const r = plan({ index, task: t });
  assert.equal(r.ok, true, r.reasons.join("; "));
  return r.lock;
}

test("tests lock: @kind regression may pass at the first lock and is listed apart; RED table tells reached-stub from assertion-failed", () => {
  const idx = fixtureIndex({ mode: "active" });
  const t = task([["AC1", "new", "dup"], ["AC2", "new", "user lost"]]);
  const lock = lockedSkeleton(fixtureIndex(), t);
  let r = plan({ index: idx, lock, task: t, stage: "tests", state: runs(idx, [[T1, "fail", "expected throw"], [T2, "pass"]]) });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join("\n"), /passes against the stub \(vacuous test; a test of unchanged behaviour is @kind regression\)/);
  idx.symbols[T2].tags.kind = "regression";
  r = plan({ index: idx, lock, task: t, stage: "tests", state: runs(idx, [[T1, "error", "Error: TODO(impl): UserService.createUser"], [T2, "pass"]]) });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.red.map((x) => [x.ac.join(), x.result]), [["QT-T1.AC1", "reached-stub"], ["QT-T1.AC2", "passes (regression)"]]);
  r = plan({ index: idx, lock, task: t, stage: "tests", state: runs(idx, [[T1, "fail", "expected throw"], [T2, "pass"]]) });
  assert.equal(r.red[0].result, "assertion-failed");
});

test("tests lock: extras need @catches (0.16 plans), only a warning for a pre-0.16 plan; budget warns, never blocks", () => {
  const idx = fixtureIndex({ mode: "active" });
  const X = "tests/userService.test.ts#UserService.createUser > keeps unicode email";
  const Y = "tests/userService.test.ts#UserService.createUser > trims spaces";
  const Z = "tests/userService.test.ts#UserService.createUser > rejects empty email";
  for (const id of [X, Y, Z]) idx.symbols[id] = { ...idx.symbols[T1], id, name: id.split("#")[1], bodyHash: `tb-${id}`, tags: { ...idx.symbols[T1].tags, ac: ["QT-T1.AC1"] },
    test: { ...idx.symbols[T1].test, titlePath: ["UserService.createUser", id.split("> ")[1]] } };
  const t = task([["AC1", "new", "dup"], ["AC2", "shared", "AC1"]]);
  const idxSk = fixtureIndex(); idxSk.symbols[T1].tags.ac = ["QT-T1.AC1", "QT-T1.AC2"]; delete idxSk.symbols[T2];
  const lock = lockedSkeleton(idxSk, t);
  idx.symbols[T1].tags.ac = ["QT-T1.AC1", "QT-T1.AC2"]; delete idx.symbols[T2];
  const st = runs(idx, [T1, X, Y, Z].map((id) => [id, "fail", "expected"]));
  let r = plan({ index: idx, lock, task: t, stage: "tests", state: st });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join("\n"), /keeps unicode email: a test added after the skeleton needs @catches/);
  for (const id of [X, Y, Z]) idx.symbols[id].tags.catches = "a defect";
  r = plan({ index: idx, lock, task: t, stage: "tests", state: st });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual([r.budget.newRows, r.budget.limit, r.budget.tests, r.budget.over, r.budget.extras.length], [1, 3, 4, true, 3]);
  assert.ok(r.warnings.some((w) => /^test budget: 4 active tests > 3 \(1 new rows \+ 2\)/.test(w)));
  // a pre-0.16 plan (no test column): extras without @catches are listed, not refused
  for (const id of [X, Y, Z]) delete idx.symbols[id].tags.catches;
  const legacy = { ...TASKS[0], testPlan: [{ ac: "AC1", test: "new", detail: null, legacy: true }, { ac: "AC2", test: "new", detail: null, legacy: true }] };
  r = plan({ index: idx, lock, task: legacy, stage: "tests", state: st });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.ok(r.warnings.some((w) => /needs @catches/.test(w)));
});

test("tests lock: covered must name an active test; duplicate test names block with a rename suggestion", () => {
  const idx = fixtureIndex({ mode: "active" });
  const t = task([["AC1", "new", "dup"], ["AC2", "new", "lost"]]);
  const lock = lockedSkeleton(fixtureIndex(), t);
  const P = "tests/test_users.py#UsersTest.test_rejects_duplicate";
  idx.symbols[P] = { ...idx.symbols[T1], id: P, name: "UsersTest.test_rejects_duplicate", file: "tests/test_users.py", tags: { ...idx.symbols[T1].tags, ac: ["QT-T1.AC1"], catches: "dup" } };
  idx.symbols[`${P}~2`] = { ...idx.symbols[P], id: `${P}~2`, name: "UsersTest.test_rejects_duplicate~2" };
  const st = runs(idx, [T1, T2, P, `${P}~2`].map((id) => [id, "fail", "x"]));
  const r = plan({ index: idx, lock, task: t, stage: "tests", state: st });
  assert.match(r.reasons.join("\n"), /duplicate test name UsersTest\.test_rejects_duplicate in tests\/test_users\.py \(2×\): rename all but one/);
  assert.deepEqual(duplicateTestNames(idx).map((d) => d.ids.length), [2]);
  const idx2 = fixtureIndex({ mode: "active" }); idx2.symbols[T2].test.mode = "todo";
  const t2 = task([["AC1", "new", "dup"], ["AC2", "covered", "QT-T1.AC2 returns user"]]);
  const r2 = plan({ index: idx2, lock, task: t2, stage: "tests", state: runs(idx2, [[T1, "fail", "x"]]) });
  assert.match(r2.reasons.join("\n"), /QT-T1\.AC2 covered: QT-T1\.AC2 returns user is not an active test/);
});

test("done: manual checks are listed for the human; mutation required per risk", () => {
  const t = task([["AC1", "new", "dup"], ["AC2", "manual", "the mail reads well"]]);
  const r = plan({ task: t, stage: "done", force: true });
  assert.deepEqual(r.manual, [{ ac: "QT-T1.AC2", check: "the mail reads well" }]);
  const mut = { commands: { mutation: { ts: "npx stryker run" } } };
  assert.equal(DEFAULTS.mutationRequired, "high");
  assert.equal(mutationRequiredFor({ ...mut, mutationRequired: "high" }, "high"), true);
  assert.equal(mutationRequiredFor({ ...mut, mutationRequired: "high" }, "low"), false);
  assert.equal(mutationRequiredFor({ mutationRequired: "high", commands: { mutation: { ts: null } } }, "high"), false, "no mutation tool configured");
  assert.equal(mutationRequiredFor({ mutationRequired: true }, "low"), true);
  assert.equal(mutationRequiredFor({ mutationRequired: false, ...mut }, "high"), false);
});

test("@ac with several ids: owner is the task that locked it, else the first id; covered resolves an AC id of another task", () => {
  const idx = fixtureIndex();
  idx.symbols[T1].tags.ac = ["FEC-T1.AC4", "QT-T1.AC1"];
  assert.equal(testOwner(idx, { tests: {} }, T1), "FEC-T1");
  assert.equal(testOwner(idx, { tests: { [T1]: { task: "QT-T1" } } }, T1), "QT-T1");
  assert.deepEqual(resolveCovered(idx, "FEC-T1.AC4"), [T1]);
  assert.deepEqual(resolveCovered(idx, T2), [T2]);
  assert.deepEqual(resolveCovered(idx, "UserService.createUser > QT-T1.AC2 returns user"), [T2]);
  const sel = selectTests(idx, { task: "QT-T1" }, { tasks: [{ ...TASKS[0], testPlan: [{ ac: "AC2", test: "covered", detail: "FEC-T1.AC4" }] }] });
  assert.ok(sel.testIds.includes(T1));
});

test("testBudget: new rows + 2; a pre-0.16 empty plan counts the ACs", () => {
  const idx = fixtureIndex({ mode: "active" });
  assert.deepEqual(testBudget(idx, { tests: { [T1]: {} } }, task([["AC1", "new", "a"], ["AC2", "none", "b"]]), [T1, T2]).extras.map((x) => x.id), [T2]);
  assert.equal(testBudget(idx, { tests: {} }, TASKS[0], [T1]).limit, 4, "no plan: 2 ACs + 2");
});

test("tests audit: no defect, duplicate coverage, overlapping tracers, no kill, duplicate name, id in name; budget per task", () => {
  const F = "tests/a.test.ts";
  const mk = (title, ac, o = {}) => ({ id: `${F}#S > ${title}`, name: `S > ${title}`, file: F, kind: "test", tags: { ac, covers: ["f"], ...o.tags }, test: { titlePath: ["S", title], mode: "active", coversResolved: ["src/a.ts#f"] }, bodyHash: title });
  const tests = [mk("PWR-T1.AC1 saves", ["PWR-T1.AC1"]), mk("saves again", ["PWR-T1.AC1"], { tags: { catches: "x" } }), mk("tracer two", ["PWR-T2.AC1"], { tags: { catches: "y" } })];
  const index = { symbols: { "src/a.ts#f": { id: "src/a.ts#f", name: "f", file: "src/a.ts", kind: "function", tags: { task: ["PWR-T1", "PWR-T2"] }, bodyHash: "bf" }, ...Object.fromEntries(tests.map((t) => [t.id, t])) } };
  index.symbols[`${F}#S > saves again~2`] = { ...tests[1], id: `${F}#S > saves again~2`, name: "S > saves again~2" };
  const t1 = { id: "PWR-T1", change: "feat-a", acs: [{ id: "PWR-T1.AC1" }], symbols: [], testPlan: [{ ac: "AC1", test: "new", detail: null, legacy: true, seam: "f" }] };
  const t2 = { id: "PWR-T2", change: "feat-a", acs: [{ id: "PWR-T2.AC1" }], symbols: [], testPlan: [{ ac: "AC1", test: "new", detail: "lost", seam: "f" }] };
  const state = { mutation: { "src/a.ts#f": { bodyHash: "bf", kills: { complete: true, byTest: { [tests[1].id]: { killed: 2, unique: 2 }, [tests[2].id]: { killed: 0, unique: 0 } } } } } };
  const out = auditTests({ index, lock: {}, state, tasks: [t1, t2] }, { tasks: ["PWR-T1", "PWR-T2"], label: "feat-a" });
  const by = (code) => out.candidates.filter((c) => c.code === code).map((c) => c.title).sort();
  assert.deepEqual(by("NO_DEFECT"), ["PWR-T1.AC1 saves"]);
  assert.deepEqual(by("DUPLICATE"), ["PWR-T1.AC1 saves", "saves again", "saves again"]);
  assert.ok(by("OVERLAP_TRACER").includes("tracer two"));
  assert.ok(by("NO_KILL").includes("tracer two") && by("NO_KILL").includes("PWR-T1.AC1 saves"));
  assert.deepEqual(by("DUP_NAME"), ["saves again", "saves again"]);
  assert.equal(out.candidates.find((c) => c.code === "DUP_NAME").level, "block");
  assert.deepEqual(by("NAME_HAS_ID"), ["PWR-T1.AC1 saves"]);
  assert.deepEqual(out.budget.map((b) => [b.task, b.newRows, b.tests, b.limit]), [["PWR-T1", 1, 3, 3], ["PWR-T2", 1, 1, 3]]);
});

test("parseStryker: killedBy per test → kills.byTest with unique kills; bail makes it incomplete", () => {
  const idx = fixtureIndex({ mode: "active" });
  const report = { files: { [IDS.CU.split("#")[0]]: { mutants: [
    { status: "Killed", location: { start: { line: 14 } }, killedBy: ["1"], coveredBy: ["1", "2"] },
    { status: "Killed", location: { start: { line: 15 } }, killedBy: ["1", "2"], coveredBy: ["1", "2"] },
    { status: "Survived", location: { start: { line: 16 } }, killedBy: [], coveredBy: ["2"] },
  ] } }, testFiles: { t: { tests: [{ id: "1", name: "UserService.createUser QT-T1.AC1 rejects duplicate" }, { id: "2", name: "UserService.createUser QT-T1.AC2 returns user" }] } } };
  const r = parseStryker(report, idx, [CU]);
  assert.deepEqual(r.perSymbol[CU].kills.byTest[T1], { killed: 2, unique: 1 });
  assert.deepEqual(r.perSymbol[CU].kills.byTest[T2], { killed: 1, unique: 0 });
  assert.equal(r.perSymbol[CU].kills.complete, false, "a single killer among several covering tests: bail");
});

test("router: quick with a reproducer goes to tdd; risk tags still raise to plan; tdd over 2 functions → plan", () => {
  const v = (route, signals) => resolveRoute({ route, summary: "fix the total", reason: "r", signals }, []);
  let r = v("quick", ["bug-repro: total off by one cent", "functions: 1"]);
  assert.equal(r.route, "tdd"); assert.equal(r.skill, "hitl:tdd"); assert.match(r.hints[0], /moved from quick to tdd/);
  assert.equal(v("quick", ["bug-repro: x", "data: migration"]).route, "plan");
  assert.equal(v("quick", ["functions: 1"]).route, "quick");
  assert.equal(v("tdd", ["bug-repro: x", "functions: 3"]).route, "plan");
  assert.equal(v("tdd", ["bug-repro: x", "functions: 2"]).route, "tdd");
});

test("reports: review trace lines per decision + budget line; feature report Tests section", () => {
  const l0 = { gates: [{ name: "trace", result: "pass", detail: "" }], tests: { pass: 1 }, drift: { summary: {} },
    trace: { counts: {}, items: [], budget: { newRows: 1, limit: 3, tests: 4, over: true },
      acs: [{ id: "QT-T1.AC1", reqs: [], proven: true, tests: 1, test: "new" }, { id: "QT-T1.AC2", reqs: [], proven: false, tests: 0, test: "none", testDetail: "type-checked" }] } };
  const md = buildReport({ taskId: "QT-T1", l0, findings: { findings: [] }, config: {} }).markdown;
  assert.match(md, /\| trace \| AC 1\/1 proven · 1 by decision \(none\/manual\) · 0 block · 0 warn pass \|/);
  assert.match(md, /- QT-T1\.AC2 — no test by decision \(none: type-checked\)/);
  assert.match(md, /⚠️ tests: 4 active · budget 3 \(1 new rows \+ 2\) — over budget/);
  const plan = { name: "feat-a", file: "x", items: [{ id: "QT-T1", title: "t", risk: "low", riskReasons: [], status: "green", override: false }], cycle: [], stop: null };
  const f = buildFeatureReport({ plan, perTask: { "QT-T1": { l0 } }, config: {} }).markdown;
  assert.match(f, /## Tests \(budget: new rows \+ 2 per task\)\n\n\| task \| new rows \| tests \| budget \|/);
  assert.match(f, /total: 4 tests for 1 new rows \(budget 3\)/);
});

test("checkTasks (tasks --check) reports the test-plan codes for a quick file", async () => {
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readTasks, checkTasks } = await import("../../scripts/lib/tasksmd.mjs");
  const root = mkdtempSync(join(tmpdir(), "hitl-tp-"));
  mkdirSync(join(root, ".hitl/tasks"), { recursive: true });
  writeFileSync(join(root, ".hitl/tasks/quick-users.md"), doc(["| AC1 | new | example | spec | X.y | test-author |", "| AC2 | none: wiring | — | — | — | — |", "| AC3 | covered: QFLT-T7.AC1 | — | — | — | — |"]));
  const msgs = (await checkTasks(root, await readTasks(root), { symbols: {} })).map((e) => e.message).join("\n");
  assert.match(msgs, /TEST_PLAN_NO_DEFECT: QFLT-T1\.AC1/);
  assert.match(msgs, /TEST_PLAN_NONE_RISK: QFLT-T1\.AC2/);
  assert.match(msgs, /TEST_PLAN_COVERED: QFLT-T1\.AC3 covered: QFLT-T7\.AC1 is not a known AC/);
});

test("a task whose plan has no new row: tests lock needs no own test; its symbols reach green without tests", async () => {
  const { computeStatuses } = await import("../../scripts/lib/status.mjs");
  const idx = fixtureIndex({ implemented: true }); delete idx.symbols[T1]; delete idx.symbols[T2];
  const t = task([["AC1", "none", "constant text"], ["AC2", "manual", "reads well"]]);
  const lock = lockedSkeleton(idx, t);
  const r = plan({ index: idx, lock, task: t, stage: "tests", state: emptyState() });
  assert.equal(r.ok, true, r.reasons.join("; "));
  const st = computeStatuses(idx, r.lock, emptyState(), {}, [t]);
  assert.equal(st.tasks["QT-T1"].symbolStatus[CU].status, "green");
  assert.match(st.tasks["QT-T1"].symbolStatus[CU].reasons.join(), /no test of its own by the test plan/);
  const legacy = computeStatuses(idx, r.lock, emptyState(), {}, [TASKS[0]]);
  assert.equal(legacy.tasks["QT-T1"].symbolStatus[CU].status, "wip", "pre-0.16 plans keep needing tests");
});
