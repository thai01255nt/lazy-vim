// P2 — @status tag rewriting and tasks md status/checkbox rewriting (§E.6 --sync-tags, §B.5).
import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteStatusTag, rewriteTasksMd, tasksInfo } from "../../scripts/lib/synctags.mjs";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { applyRuns, emptyState } from "../../scripts/lib/state.mjs";
import { buildRunRecords } from "../../scripts/lib/runner.mjs";
import { fixtureIndex, TASKS, IDS } from "./status.test.mjs";

const TS = `export class UserService {
  /**
   * Registers a user; rejects duplicate emails.
   * @task T-12 @impl agent @status skeleton @prio 1
   * @calls UserRepo.findByEmail
   */
  createUser(email: string): User {
    // @status skeleton  <- not in the doc span, must not be touched
    throw new Error("TODO(impl): UserService.createUser");
  }
}
`;

test("rewrites only the @status value inside the doc span (TS)", () => {
  const out = rewriteStatusTag(TS, { start: 2, end: 6 }, "red");
  assert.match(out, / \* @task T-12 @impl agent @status red @prio 1\n/);
  assert.match(out, /\/\/ @status skeleton {2}<- not in the doc span/);
  assert.equal(out.length, TS.length - "skeleton".length + "red".length);
});

test("python docstring + CRLF preserved; missing tag → null", () => {
  const py = 'def apply_discount(order, pct):\r\n    """Apply pct% discount once.\r\n\r\n    @task T-2 @impl manual @status skeleton @prio 2\r\n    """\r\n    raise NotImplementedError("TODO(impl): apply_discount")\r\n';
  const out = rewriteStatusTag(py, { start: 2, end: 5 }, "green");
  assert.equal(out, py.replace("@status skeleton", "@status green"));
  assert.ok(out.includes("\r\n") && !/[^\r]\n/.test(out));
  assert.equal(rewriteStatusTag("def f():\n    pass\n", { start: 1, end: 2 }, "red"), null);
  assert.equal(rewriteStatusTag(TS, null, "red"), null);
});

const MD = `# User Tasks
← Planning: .hitl/planning/feat-user-register.md
> status: approved

## T-1 Register user
- prio: P1 | risk: high (security) | impl: mixed | blocked-by: none | status: todo
**Why**: x

### Acceptance criteria
- [ ] T-1.AC1 Given dup When createUser Then throws
- [ ] T-1.AC2 Given new When createUser Then returns user

### Symbols
1. [ ] \`UserService.createUser\` | new | \`src/services/userService.ts\` | impl: agent | validates
2. [ ] \`UserRepo.findByEmail\` | modify | \`src/repo/userRepo.ts\` | impl: manual | lookup

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | UserService.createUser | test-author |

## T-2 Other
- prio: P2 | risk: low | impl: agent | blocked-by: T-1 | status: todo
- [ ] T-2.AC1 untouched
`;

test("tasks md: meta status and checkboxes rewritten, other tasks untouched", () => {
  const out = rewriteTasksMd(MD, { "T-1": { status: "verified", acDone: { "T-1.AC1": true, "T-1.AC2": false }, symDone: { 1: true, 2: false } } });
  assert.match(out, /\| blocked-by: none \| status: verified\n/);
  assert.match(out, /- \[x\] T-1\.AC1 Given dup/);
  assert.match(out, /- \[ \] T-1\.AC2 Given new/);
  assert.match(out, /1\. \[x\] `UserService\.createUser`/);
  assert.match(out, /2\. \[ \] `UserRepo\.findByEmail`/);
  assert.match(out, /blocked-by: T-1 \| status: todo\n- \[ \] T-2\.AC1 untouched/);
  assert.equal(out.split("\n").length, MD.split("\n").length);
});

test("tasksInfo: AC done when all its tests pass fresh; symbol done when verified/done", () => {
  const idx = fixtureIndex({ mode: "active", implemented: true });
  const st = applyRuns(emptyState(), buildRunRecords(idx, [{ testId: IDS.T1, outcome: "pass" }, { testId: IDS.T2, outcome: "fail" }]));
  const statuses = computeStatuses(idx, null, st, {}, TASKS);
  const resolve = (ref) => Object.keys(idx.symbols).find((id) => id.endsWith("#" + ref)) || null;
  const info = tasksInfo(idx, st, statuses, TASKS, resolve);
  assert.deepEqual(info["T-1"].acDone, { "T-1.AC1": true, "T-1.AC2": false });
  assert.deepEqual(info["T-1"].symDone, { 1: false, 2: false });
  assert.equal(info["T-1"].status, "red");
  st.runs[IDS.T2].outcome = "pass";
  st.reviews["T-1"] = { verdict: "PASS", bodyHashes: { [IDS.CU]: "bodyCU2", [IDS.FE]: "bodyFE2" } };
  const s2 = computeStatuses(idx, null, st, {}, TASKS);
  const i2 = tasksInfo(idx, st, s2, TASKS, resolve);
  assert.deepEqual(i2["T-1"].symDone, { 1: true, 2: true });
  assert.equal(i2["T-1"].status, "verified");
});
