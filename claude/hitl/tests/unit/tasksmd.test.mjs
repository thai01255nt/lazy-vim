import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTasksMd, checkTasks, nextTaskId, readTasks } from "../../scripts/lib/tasksmd.mjs";

const MD = `# Register Tasks
← Planning: .hitl/planning/feat-x.md
> status: draft

## T-12 Register user with unique email
- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: T-11 | status: todo
**Why**: x

### Acceptance criteria
- [ ] T-12.AC1 Given dup When createUser Then throws
- [x] T-12.AC2 Given new When createUser Then returns user

### Symbols
1. [ ] \`UserService.createUser\` | new | \`src/services/userService.ts\` | impl: agent | validates, persists
2. [x] \`UserRepo.findByEmail\` | modify | \`src/repo/userRepo.ts\` | impl: manual | lookup

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | UserService.createUser | test-author |

## T-11 Prefactor
- prio: P0 | risk: low | impl: agent | blocked-by: none | status: done

## T-13 Broken
- prio: P9 | risk: low | impl: agent | blocked-by: none | status: todo
`;

test("parseTasksMd extracts tasks, meta, ACs, symbols, test plan", () => {
  const d = parseTasksMd(MD, ".hitl/tasks/feat-x.md");
  assert.equal(d.planning, ".hitl/planning/feat-x.md");
  assert.equal(d.status, "draft");
  const [t12, t11, t13] = d.tasks;
  assert.equal(t12.id, "T-12");
  assert.equal(t12.title, "Register user with unique email");
  assert.deepEqual([t12.prio, t12.risk, t12.impl, t12.status], ["P1", "high", "mixed", "todo"]);
  assert.deepEqual(t12.riskReasons, ["security", "public-api"]);
  assert.deepEqual(t12.blockedBy, ["T-11"]);
  assert.deepEqual(t12.acs.map((a) => [a.id, a.done]), [["T-12.AC1", false], ["T-12.AC2", true]]);
  assert.deepEqual(t12.symbols[1], { order: 2, ref: "UserRepo.findByEmail", change: "modify", file: "src/repo/userRepo.ts", impl: "manual", purpose: "lookup", done: true });
  assert.deepEqual(t12.testPlan, [{ ac: "AC1", kind: "example", oracle: "spec", seam: "UserService.createUser", author: "test-author" }]);
  assert.deepEqual(t11.blockedBy, []);
  assert.equal(t13.parseErrors.length, 1);
});

test("checkTasks reports missing files, collisions, AC rows, duplicates", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-tasks-"));
  mkdirSync(join(root, ".hitl/tasks"), { recursive: true });
  writeFileSync(join(root, ".hitl/tasks/feat-x.md"), MD);
  writeFileSync(join(root, ".hitl/tasks/feat-y.md"), "## T-11 Dup\n- prio: P0 | risk: low | impl: agent | blocked-by: T-99 | status: todo\n");
  const tasks = await readTasks(root);
  const index = { symbols: { "src/services/userService.ts#UserService.createUser": { tags: { task: [] } } } };
  const msgs = (await checkTasks(root, tasks, index)).map((e) => e.message).join("\n");
  assert.match(msgs, /duplicate task id T-11/);
  assert.match(msgs, /blocked-by T-99/);
  assert.match(msgs, /modify target file src\/repo\/userRepo.ts does not exist/);
  assert.match(msgs, /new symbol UserService.createUser already exists/);
  assert.match(msgs, /T-12.AC2 has no test-plan row/);
  assert.match(msgs, /malformed meta/);
  writeFileSync(join(root, ".hitl/index_dummy"), "");
  assert.equal(await nextTaskId(root), "T-14");
});

const SPEC_MD = `# Users Tasks
← Planning: .hitl/planning/feat-u.md
> status: approved

## T-1 Register
- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo
**Why**: implements (D-1, D-2) and again D-1

### Acceptance criteria
- [ ] T-1.AC1 (R-1, R-2) Given dup When createUser Then throws
- [x] T-1.AC2 (edge) Given new When createUser Then returns
- [ ] T-1.AC3 (R-9) Given x Then y
- [ ] T-1.AC4 (R-3) Given x Then y
- [ ] T-1.AC5 (R-4) Given x Then y

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | x | test-author |
| AC2 | example | spec | x | test-author |
| AC3 | example | spec | x | test-author |
| AC4 | example | spec | x | test-author |
| AC5 | example | spec | x | test-author |
`;
const SPEC_PLAN = `# U - Planning
> status: approved

## Requirements
- R-1 [must] a.
- R-2 [must] b.
- R-3 [must] c. (status: dropped)
- R-4 [must] d. (status: superseded by R-1)

## Decisions
| id | decision | why | cost if wrong | serves | status |
|---|---|---|---|---|---|
| D-1 | x | y | z | R-1 | accepted |
`;

test("AC (R-n) groups, (edge) stays text, **Why** D refs", () => {
  const t = parseTasksMd(SPEC_MD, "t.md").tasks[0];
  assert.deepEqual(t.acs[0], { id: "T-1.AC1", reqs: ["R-1", "R-2"], text: "Given dup When createUser Then throws", done: false });
  assert.deepEqual(t.acs[1], { id: "T-1.AC2", reqs: [], text: "(edge) Given new When createUser Then returns", done: true });
  assert.equal(t.why, "implements (D-1, D-2) and again D-1");
  assert.deepEqual(t.decisions, ["D-1", "D-2"]);
  const legacy = parseTasksMd(MD, "x.md").tasks;
  assert.deepEqual([legacy[0].why, legacy[0].decisions, legacy[1].why], ["x", [], null]);
});

test("checkTasks: unknown/inactive R, unknown D, missing planning; legacy D refs with planning → no error", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-tasks-"));
  mkdirSync(join(root, ".hitl/tasks"), { recursive: true });
  writeFileSync(join(root, ".hitl/tasks/feat-u.md"), SPEC_MD);
  let msgs = (await checkTasks(root, await readTasks(root), { symbols: {} })).map((e) => e.message);
  assert.deepEqual(msgs, ["planning file .hitl/planning/feat-u.md not found (needed for R-/D- refs)"]);
  mkdirSync(join(root, ".hitl/planning"), { recursive: true });
  writeFileSync(join(root, ".hitl/planning/feat-u.md"), SPEC_PLAN);
  msgs = (await checkTasks(root, await readTasks(root), { symbols: {} })).map((e) => e.message);
  assert.deepEqual(msgs, [
    "T-1.AC3 references unknown R-9 (not in .hitl/planning/feat-u.md)",
    "T-1.AC4 references R-3 which is dropped",
    "T-1.AC5 references R-4 which is superseded by R-1",
    "**Why** references unknown D-2 (not in .hitl/planning/feat-u.md)",
  ]);
  // legacy task (no Requirements in planning) citing an existing D → clean
  writeFileSync(join(root, ".hitl/planning/feat-u.md"), "> status: approved\n\n## Decisions\n| id | decision | why | cost if wrong | status |\n|---|---|---|---|---|\n| D-1 | x | y | z | accepted |\n");
  writeFileSync(join(root, ".hitl/tasks/feat-u.md"), SPEC_MD.replace(/ \(R-[^)]*\)/g, "").replace("(D-1, D-2)", "(D-1)"));
  assert.deepEqual(await checkTasks(root, await readTasks(root), { symbols: {} }), []);
});
