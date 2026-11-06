import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTasksMd, checkTasks, nextTaskId, readTasks } from "../../scripts/lib/tasksmd.mjs";

const MD = `# Register Tasks
← Planning: .hitl/planning/feat-x.md
> status: draft

## QT-T12 Register user with unique email
- prio: P1 | risk: high (security, public-api) | impl: mixed | blocked-by: QT-T11 | status: todo
**Why**: x

### Acceptance criteria
- [ ] QT-T12.AC1 Given dup When createUser Then throws
- [x] QT-T12.AC2 Given new When createUser Then returns user

### Symbols
1. [ ] \`UserService.createUser\` | new | \`src/services/userService.ts\` | impl: agent | validates, persists
2. [x] \`UserRepo.findByEmail\` | modify | \`src/repo/userRepo.ts\` | impl: manual | lookup

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | UserService.createUser | test-author |

## QT-T11 Prefactor
- prio: P0 | risk: low | impl: agent | blocked-by: none | status: done

## QT-T13 Broken
- prio: P9 | risk: low | impl: agent | blocked-by: none | status: todo
`;

test("parseTasksMd extracts tasks, meta, ACs, symbols, test plan", () => {
  const d = parseTasksMd(MD, ".hitl/tasks/feat-x.md");
  assert.equal(d.planning, ".hitl/planning/feat-x.md");
  assert.equal(d.status, "draft");
  const [t12, t11, t13] = d.tasks;
  assert.equal(t12.id, "QT-T12");
  assert.equal(t12.title, "Register user with unique email");
  assert.deepEqual([t12.prio, t12.risk, t12.impl, t12.status], ["P1", "high", "mixed", "todo"]);
  assert.deepEqual(t12.riskReasons, ["security", "public-api"]);
  assert.deepEqual(t12.blockedBy, ["QT-T11"]);
  assert.deepEqual(t12.acs.map((a) => [a.id, a.done]), [["QT-T12.AC1", false], ["QT-T12.AC2", true]]);
  assert.deepEqual(t12.symbols[1], { order: 2, ref: "UserRepo.findByEmail", change: "modify", file: "src/repo/userRepo.ts", impl: "manual", purpose: "lookup", done: true });
  assert.deepEqual(t12.testPlan, [{ ac: "AC1", kind: "example", oracle: "spec", seam: "UserService.createUser", author: "test-author" }]);
  assert.deepEqual(t11.blockedBy, []);
  assert.equal(t13.parseErrors.length, 1);
});

test("checkTasks reports missing files, collisions, AC rows, duplicates", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-tasks-"));
  mkdirSync(join(root, ".hitl/tasks"), { recursive: true });
  writeFileSync(join(root, ".hitl/tasks/feat-x.md"), MD);
  writeFileSync(join(root, ".hitl/tasks/feat-y.md"), "## QT-T11 Dup\n- prio: P0 | risk: low | impl: agent | blocked-by: QT-T99 | status: todo\n");
  const tasks = await readTasks(root);
  const index = { symbols: { "src/services/userService.ts#UserService.createUser": { tags: { task: [] } } } };
  const msgs = (await checkTasks(root, tasks, index)).map((e) => e.message).join("\n");
  assert.match(msgs, /duplicate task id QT-T11/);
  assert.match(msgs, /blocked-by QT-T99/);
  assert.match(msgs, /modify target file src\/repo\/userRepo.ts does not exist/);
  assert.match(msgs, /new symbol UserService.createUser already exists/);
  assert.match(msgs, /QT-T12.AC2 has no test-plan row/);
  assert.match(msgs, /malformed meta/);
  writeFileSync(join(root, ".hitl/index_dummy"), "");
  // 0.13.2: a new quick file gets its own key (not QT max+1); `slug` gives its readable letters
  assert.match(await nextTaskId(root), /^Q[A-Z]{1,4}-T1$/);
  assert.equal(await nextTaskId(root, "quick", { slug: "fix-label-typo" }), "QFLT-T1");
});

const SPEC_MD = `# Users Tasks
← Planning: .hitl/planning/feat-u.md
> status: approved

## QT-T1 Register
- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo
**Why**: implements (D-1, D-2) and again D-1

### Acceptance criteria
- [ ] QT-T1.AC1 (R-1, R-2) Given dup When createUser Then throws
- [x] QT-T1.AC2 (edge) Given new When createUser Then returns
- [ ] QT-T1.AC3 (R-9) Given x Then y
- [ ] QT-T1.AC4 (R-3) Given x Then y
- [ ] QT-T1.AC5 (R-4) Given x Then y

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
  assert.deepEqual(t.acs[0], { id: "QT-T1.AC1", reqs: ["R-1", "R-2"], text: "Given dup When createUser Then throws", done: false });
  assert.deepEqual(t.acs[1], { id: "QT-T1.AC2", reqs: [], text: "(edge) Given new When createUser Then returns", done: true });
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
    "QT-T1.AC3 references unknown R-9 (not in .hitl/planning/feat-u.md)",
    "QT-T1.AC4 references R-3 which is dropped",
    "QT-T1.AC5 references R-4 which is superseded by R-1",
    "**Why** references unknown D-2 (not in .hitl/planning/feat-u.md)",
  ]);
  // legacy task (no Requirements in planning) citing an existing D → clean
  writeFileSync(join(root, ".hitl/planning/feat-u.md"), "> status: approved\n\n## Decisions\n| id | decision | why | cost if wrong | status |\n|---|---|---|---|---|\n| D-1 | x | y | z | accepted |\n");
  writeFileSync(join(root, ".hitl/tasks/feat-u.md"), SPEC_MD.replace(/ \(R-[^)]*\)/g, "").replace("(D-1, D-2)", "(D-1)"));
  assert.deepEqual(await checkTasks(root, await readTasks(root), { symbols: {} }), []);
});

// 0.13.2 — a key per quick file (`← Change: none | key: QFLT`)
const quickMd = (key, id) => `# Q Tasks\n← Change: none${key ? ` | key: ${key}` : ""}\n> status: approved\n\n## ${id} Fix it\n- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo\n`;
const qroot = (files) => {
  const root = mkdtempSync(join(tmpdir(), "hitl-qkey-"));
  for (const [rel, text] of Object.entries(files)) { mkdirSync(join(root, rel, ".."), { recursive: true }); writeFileSync(join(root, rel), text); }
  return root;
};
const keyedProposal = (id, key) => `# P\n> change: ${id} | key: ${key} | status: approved\n`;

test("parseTasksMd: a quick file's header key; a bad key is a parse error; a key on a change line is ignored", () => {
  const d = parseTasksMd(quickMd("QFLT", "QFLT-T1"), ".hitl/tasks/quick-fix-label.md");
  assert.deepEqual([d.quick, d.key, d.change, d.tasks[0].quick, d.tasks[0].quickKey, d.tasks[0].parseErrors], [true, "QFLT", null, true, "QFLT", []]);
  assert.deepEqual([parseTasksMd(quickMd(null, "QT-T3"), ".hitl/tasks/quick-a.md").key, parseTasksMd(MD, ".hitl/tasks/feat-x.md").quick], [null, false]);
  assert.match(parseTasksMd(quickMd("qx1", "QX-T1"), ".hitl/tasks/quick-a.md").tasks[0].parseErrors[0], /quick-file key "qx1" must be 2–5 upper-case letters/);
  // a quick file moved into a change keeps a stale key on its change line: ignored (migrate --ids renumbers and drops it)
  const c = parseTasksMd("# T\n← Change: feat-x | key: QFLT\n\n## QFLT-T1 A\n- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo\n", ".hitl/tasks/quick-a.md");
  assert.deepEqual([c.change, c.quick, c.key, c.staleKey, c.tasks[0].parseErrors], ["feat-x", false, null, "QFLT", []]);
});

test("checkTasks (0.13.2): quick key mismatch, quick key collisions, legacy QT only in a keyed project", async () => {
  const msgs = async (root) => (await checkTasks(root, await readTasks(root), { symbols: {} })).map((e) => e.message).join("\n");
  // keyed quick files: their own key; a task under another key is TASK_KEY_MISMATCH
  let root = qroot({ ".hitl/tasks/quick-a.md": quickMd("QABCD", "QABCD-T1"), ".hitl/tasks/quick-b.md": quickMd("QBXYZ", "QXXXX-T1") });
  let m = await msgs(root);
  assert.doesNotMatch(m, /QABCD-T1/);
  assert.match(m, /TASK_KEY_MISMATCH: QXXXX-T1 does not use the key QBXYZ of its quick file/);
  // two quick files with one key, and a quick file holding a change's key
  root = qroot({ ".hitl/tasks/quick-a.md": quickMd("QSAME", "QSAME-T1"), ".hitl/tasks/quick-b.md": quickMd("QSAME", "QSAME-T2"),
    ".hitl/tasks/quick-c.md": quickMd("PWR", "PWR-T1"), ".hitl/changes/feat-x/proposal.md": keyedProposal("feat-x", "PWR") });
  m = await msgs(root);
  assert.match(m, /QUICK_KEY_TAKEN: key QSAME of tasks\/quick-a\.md is also used by the quick file tasks\/quick-b\.md/);
  assert.match(m, /QUICK_KEY_TAKEN: key PWR of tasks\/quick-c\.md is also used by change feat-x/);
  // a keyless quick file: QT is current while the project has no key at all (keyless fixtures) …
  root = qroot({ ".hitl/tasks/quick-a.md": quickMd(null, "QT-T7"), ".hitl/changes/feat-x/proposal.md": "# P\n> change: feat-x | status: draft\n" });
  assert.equal(await msgs(root), "");
  // … and IDS_LEGACY once a proposal (or another quick file, or the id map) has a key
  writeFileSync(join(root, ".hitl/changes/feat-x/proposal.md"), keyedProposal("feat-x", "PWR"));
  assert.match(await msgs(root), /IDS_LEGACY: QT-T7 uses the legacy shared quick key QT .*run \/hitl:migrate/);
  // a keyless quick file under another key: it needs a header key
  root = qroot({ ".hitl/tasks/quick-a.md": quickMd(null, "QABCD-T1") });
  assert.match(await msgs(root), /TASK_KEY_MISMATCH: QABCD-T1: its quick file has no key/);
  // the next quick key is free of every quick file's and change's key
  root = qroot({ ".hitl/tasks/quick-a.md": quickMd("QABCD", "QABCD-T1") });
  const { readKeyRegistry } = await import("../../scripts/lib/keys.mjs");
  const reg = await readKeyRegistry(root);
  assert.deepEqual(reg.byKey.get("QABCD"), [{ change: null, archived: false, source: "tasks/quick-a.md", quick: true }]);
});
