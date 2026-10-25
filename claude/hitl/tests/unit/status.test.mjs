// P2 — status machine + next-step rules, with hand-built index/lock/state fixtures (§E.6).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeStatuses, testsFor } from "../../scripts/lib/status.mjs";
import { computeNext, nextForTask } from "../../scripts/lib/nextstep.mjs";
import { buildRunRecords } from "../../scripts/lib/runner.mjs";
import { applyRuns, emptyState } from "../../scripts/lib/state.mjs";

const SVC = "src/services/userService.ts", REPO = "src/repo/userRepo.ts", TF = "tests/userService.test.ts";
const CU = `${SVC}#UserService.createUser`, FE = `${REPO}#UserRepo.findByEmail`, SAVE = `${REPO}#UserRepo.save`, REG = "src/http/authController.ts#register";
const T1 = `${TF}#UserService.createUser > T-1.AC1 rejects duplicate`, T2 = `${TF}#UserService.createUser > T-1.AC2 returns user`;

export function fixtureIndex({ implemented = false, mode = "todo" } = {}) {
  const sym = (id, o) => ({ id, name: id.split("#")[1], file: id.split("#")[0], exported: true, async: false, features: [], callers: [], callees: [], ...o });
  const symbols = {
    [CU]: sym(CU, { kind: "method", parent: `${SVC}#UserService`, stub: !implemented, signature: "createUser(email: string, passwordHash: string): User", intent: "Registers a user",
      tags: { task: ["T-1"], impl: "agent", status: "skeleton", prio: 1, calls: ["UserRepo.findByEmail", "UserRepo.save"], concurrency: "none", covers: [], ac: [] },
      todos: implemented ? [] : ["1. reject duplicate", "2. save and return"], flowSteps: implemented ? ["1. reject duplicate", "2. save and return"] : [],
      callees: [FE, SAVE], callers: [REG], sigHash: "sigCU", intentHash: "intCU", todoHash: "todoCU", bodyHash: implemented ? "bodyCU2" : "bodyCU1", bodyLines: 3,
      span: { start: 12, end: 20 }, docSpan: { start: 4, end: 11 } }),
    [FE]: sym(FE, { kind: "method", parent: `${REPO}#UserRepo`, stub: !implemented, signature: "findByEmail(email: string): User | undefined", intent: "Finds by email",
      tags: { task: ["T-1"], impl: "manual", status: "skeleton", prio: 2, calls: [], concurrency: "none", covers: [], ac: [] },
      todos: implemented ? [] : ["1. lower", "2. find"], flowSteps: [], callers: [CU], sigHash: "sigFE", intentHash: "intFE", todoHash: "todoFE", bodyHash: implemented ? "bodyFE2" : "bodyFE1",
      span: { start: 8, end: 12 }, docSpan: { start: 3, end: 7 } }),
    [SAVE]: sym(SAVE, { kind: "method", parent: `${REPO}#UserRepo`, stub: false, tags: { task: [] }, callers: [CU], bodyHash: "bodySAVE", sigHash: "s", intentHash: "i" }),
    [`${REPO}#UserRepo`]: sym(`${REPO}#UserRepo`, { kind: "class", tags: {}, bodyHash: "c" }),
    [REG]: sym(REG, { kind: "function", stub: false, tags: {}, callees: [CU], bodyHash: "bodyREG" }),
  };
  for (const [id, ac, title] of [[T1, "T-1.AC1", "T-1.AC1 rejects duplicate"], [T2, "T-1.AC2", "T-1.AC2 returns user"]]) {
    symbols[id] = sym(id, { kind: "test", file: TF, name: title, tags: { covers: ["UserService.createUser"], ac: [ac], kind: "example", origin: mode === "todo" ? "skeleton" : "test-author" },
      bodyHash: `tb-${ac}-${mode}`, intentHash: `ti-${ac}`, test: { titlePath: ["UserService.createUser", title], mode, coversResolved: [CU] } });
  }
  return { schema: "hitl.index/1", files: {}, symbols };
}
export const TASKS = [{ id: "T-1", title: "Register user", file: ".hitl/tasks/feat-user-register.md", prio: "P1", risk: "high", riskReasons: ["security"], impl: "mixed", blockedBy: [], status: "todo",
  acs: [{ id: "T-1.AC1", text: "dup", done: false }, { id: "T-1.AC2", text: "ok", done: false }],
  symbols: [{ order: 1, ref: "UserService.createUser", change: "new", file: SVC, impl: "agent" }, { order: 2, ref: "UserRepo.findByEmail", change: "modify", file: REPO, impl: "manual" }],
  testPlan: [], parseErrors: [] }];
export const IDS = { CU, FE, SAVE, REG, T1, T2 };

const lockWith = (t = {}) => ({ schema: "hitl.lock/1", symbols: { [CU]: { task: "T-1", impl: "agent" }, [FE]: { task: "T-1", impl: "manual" } }, tests: {},
  tasks: { "T-1": { file: "x", risk: "high", skeletonAt: "2026-01-01T00:00:00Z", testsAt: null, doneAt: null, doneBodyHashes: {}, ...t } } });
const runAll = (index, outcome) => applyRuns(emptyState(), buildRunRecords(index, [T1, T2].map((testId) => ({ testId, outcome, message: outcome === "pass" ? "" : "TODO(impl): x" }))));

test("all stubs, no lock → skeleton; next approve", () => {
  const idx = fixtureIndex();
  const r = computeStatuses(idx, null, null, {}, TASKS);
  assert.equal(r.symbols[CU].status, "skeleton");
  assert.equal(r.symbols[FE].status, "skeleton");
  assert.equal(r.symbols[SAVE], undefined, "untracked legacy symbol not reported");
  assert.equal(r.tasks["T-1"].status, "skeleton");
  assert.equal(r.tasks["T-1"].next, "/hitl:approve T-1");
});

test("skeleton approved, tests still stubs → approved; next /hitl:test", () => {
  const r = computeStatuses(fixtureIndex(), lockWith(), null, {}, TASKS);
  assert.equal(r.tasks["T-1"].status, "approved");
  assert.equal(r.tasks["T-1"].next, "/hitl:test T-1");
});

test("active failing tests → red (direct and indirect via caller); high risk unlocked → approve tests", () => {
  const idx = fixtureIndex({ mode: "active" });
  const st = runAll(idx, "fail");
  const r = computeStatuses(idx, lockWith(), st, {}, TASKS);
  assert.equal(r.symbols[CU].status, "red");
  assert.equal(r.symbols[FE].status, "red");
  assert.ok(r.symbols[FE].reasons.some((x) => /indirect/.test(x)));
  assert.equal(r.tasks["T-1"].status, "red");
  assert.equal(r.tasks["T-1"].next, "/hitl:approve T-1 tests");
  const locked = computeStatuses(idx, lockWith({ testsAt: "2026-01-02T00:00:00Z" }), st, {}, TASKS);
  assert.equal(locked.tasks["T-1"].next, "/hitl:implement T-1");
});

test("implemented + fresh passing → green; next review", () => {
  const idx = fixtureIndex({ mode: "active", implemented: true });
  const r = computeStatuses(idx, lockWith({ testsAt: "t" }), runAll(idx, "pass"), {}, TASKS);
  assert.equal(r.symbols[CU].status, "green");
  assert.equal(r.symbols[FE].status, "green");
  assert.equal(r.symbols[`${REPO}#UserRepo`].status, "green", "class = min of members");
  assert.equal(r.tasks["T-1"].status, "green");
  assert.equal(r.tasks["T-1"].next, "/hitl:review T-1");
});

test("body changed after run → stale → wip", () => {
  const idx = fixtureIndex({ mode: "active", implemented: true });
  const st = runAll(idx, "pass");
  idx.symbols[CU].bodyHash = "bodyCU3";
  const r = computeStatuses(idx, lockWith({ testsAt: "t" }), st, {}, TASKS);
  assert.equal(r.symbols[CU].status, "wip");
  assert.equal(r.symbols[CU].stale, true);
  assert.equal(r.symbols[FE].status, "green", "callee body unchanged");
  assert.equal(r.tasks["T-1"].status, "wip");
});

test("stale failing run does not count as red", () => {
  const idx = fixtureIndex({ mode: "active", implemented: true });
  const st = runAll(idx, "fail");
  idx.symbols[T1].bodyHash = "changed"; idx.symbols[T2].bodyHash = "changed";
  assert.equal(computeStatuses(idx, lockWith(), st, {}, TASKS).symbols[CU].status, "wip");
});

test("review PASS → verified; mutationRequired gates agent symbols only; done via doneBodyHashes; review FAIL → review", () => {
  const idx = fixtureIndex({ mode: "active", implemented: true });
  const st = runAll(idx, "pass");
  st.reviews["T-1"] = { verdict: "PASS", bodyHashes: { [CU]: "bodyCU2", [FE]: "bodyFE2" } };
  let r = computeStatuses(idx, lockWith({ testsAt: "t" }), st, {}, TASKS);
  assert.equal(r.symbols[CU].status, "verified");
  assert.equal(r.tasks["T-1"].status, "verified");
  assert.equal(r.tasks["T-1"].next, "/hitl:approve T-1 done");
  r = computeStatuses(idx, lockWith({ testsAt: "t" }), st, { mutationRequired: true, mutationThreshold: 0.8 }, TASKS);
  assert.equal(r.symbols[CU].status, "green");
  assert.equal(r.symbols[FE].status, "verified", "manual impl exempt from mutation");
  st.mutation[CU] = { score: 0.9, survivors: 0, bodyHash: "bodyCU2" };
  r = computeStatuses(idx, lockWith({ testsAt: "t" }), st, { mutationRequired: true, mutationThreshold: 0.8 }, TASKS);
  assert.equal(r.symbols[CU].status, "verified");
  r = computeStatuses(idx, lockWith({ testsAt: "t", doneAt: "d", doneBodyHashes: { [CU]: "bodyCU2", [FE]: "bodyFE2" } }), st, {}, TASKS);
  assert.equal(r.tasks["T-1"].status, "done");
  assert.equal(r.tasks["T-1"].next, null);
  st.reviews["T-1"].verdict = "WITH FIXES";
  r = computeStatuses(idx, lockWith({ testsAt: "t" }), st, {}, TASKS);
  assert.equal(r.tasks["T-1"].status, "review");
});

test("task with no symbols → todo; next by risk", () => {
  const r = computeStatuses({ symbols: {} }, null, null, {}, [{ ...TASKS[0], id: "T-9", symbols: [] }, { ...TASKS[0], id: "T-8", risk: "low", symbols: [] }]);
  assert.equal(r.tasks["T-9"].status, "todo");
  assert.equal(r.tasks["T-9"].next, "/hitl:skeleton T-9");
  assert.equal(r.tasks["T-8"].next, "/hitl:implement T-8");
});

test("testsFor prefers direct coverage", () => {
  const idx = fixtureIndex();
  assert.deepEqual(testsFor(idx, CU), { tests: [T1, T2].sort(), indirect: false });
  assert.equal(testsFor(idx, FE).indirect, true);
  assert.deepEqual(testsFor(idx, SAVE).tests, [T1, T2].sort());
});

test("computeNext: drift override, frontier by prio/id and blocked-by, empty states", () => {
  const tasks = [{ id: "T-3", prio: "P2", blockedBy: [] }, { id: "T-2", prio: "P0", blockedBy: ["T-1"] }, { id: "T-1", prio: "P1", blockedBy: [] }, { id: "T-4", prio: "P1", blockedBy: [] }];
  const statuses = { tasks: { "T-1": { status: "green", next: "/hitl:review T-1" }, "T-2": { status: "todo", next: "/hitl:skeleton T-2" }, "T-3": { status: "wip", next: "/hitl:implement T-3" }, "T-4": { status: "todo", next: "x" } } };
  assert.equal(computeNext({ tasks, statuses }).command, "/hitl:review T-1");
  statuses.tasks["T-1"].status = "done";
  assert.equal(computeNext({ tasks, statuses }).command, "/hitl:skeleton T-2", "unblocked P0 goes first");
  const drift = { items: [{ level: "warn", code: "SIG_CHANGED", symbol: CU, task: "T-1" }] };
  assert.equal(computeNext({ tasks, statuses, drift, lock: { symbols: { [CU]: {} } } }).command, "/hitl:sync");
  assert.equal(computeNext({ tasks, statuses, drift: { items: [{ level: "info", code: "BODY_CHANGED", symbol: CU }] } }).command, "/hitl:skeleton T-2");
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} } }).command, "/hitl:plan");
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} }, planning: [{ file: "feat-x.md", status: "approved", hasTasks: false }] }).command, "/hitl:tasks feat-x.md");
  assert.equal(nextForTask("T-1", "review"), "/hitl:review T-1 fix …");
});

test("status --brief: trace and Linear hints go on line 2, never a new line", async () => {
  const { briefSuffix, run } = await import("../../scripts/cmd/status.mjs");
  const trace = { counts: { block: 1, warn: 2, info: 0 }, summary: { acs: { total: 2, proven: 1 } } };
  assert.equal(briefSuffix(trace, null), " · trace: AC 1/2 proven, ⛔ 1, ⚠️ 2");
  assert.equal(briefSuffix({ counts: { block: 0, warn: 0 }, summary: { acs: { total: 0, proven: 0 } } }, null), "");
  assert.equal(briefSuffix(null, { enabled: true, configured: true, outOfSync: 2, queued: 1 }), " · linear: 2 out of sync, 1 queued");
  assert.equal(briefSuffix(null, { enabled: true, configured: false, outOfSync: 2, queued: 1 }), "");
  const { makeProject, write } = await import("./_project.mjs");
  const { loadConfig } = await import("../../scripts/lib/config.mjs");
  const root = makeProject();
  write(root, ".hitl/planning/feat-users.md", "# Users - Planning\n> status: approved\n\n## Requirements\n- R-1 [must] The system shall reject duplicates.\n");
  write(root, ".hitl/tasks/feat-users.md", (await import("node:fs")).readFileSync(`${root}/.hitl/tasks/feat-users.md`, "utf8").replace("T-1.AC1 Given", "T-1.AC1 (R-1) Given"));
  const out = []; const log = console.log; console.log = (s) => out.push(...String(s).split("\n"));
  try { await run(["--brief"], { root, config: await loadConfig(root), json: false }); } finally { console.log = log; }
  assert.ok(out.length <= 3, out.join("\n"));
  assert.match(out[1], /^tasks: 1 \(done 0\).* · trace: AC 0\/1 proven/);
});
