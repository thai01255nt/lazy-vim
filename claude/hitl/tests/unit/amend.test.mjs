// 0.17 — amend brief + amend task set: tasks.md fields (amend, kind, remove, dropped, superseded), their checks,
// the route (brief | chat), amendment ids, `amend start` facts, the hold on touched tasks, the per-state rules (keep
// done tasks, take over their tests), remove rows in status/approve, `tasks drop`, and the removal of overwrite.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTasksMd, checkTaskChanges } from "../../scripts/lib/tasksmd.mjs";
import { routeAmend, checkAmendOrder, checkAmendCoverage, amendAffected, amendHolds, touchedTasks, nextAmendId, normTransition, stateRule, renderAmendBriefHead, whereTasksStand } from "../../scripts/lib/amend.mjs";
import { parseBrief, briefNext, pickBrief } from "../../scripts/lib/brief.mjs";
import { computeImpact } from "../../scripts/lib/impact.mjs";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { computeNext } from "../../scripts/lib/nextstep.mjs";
import { planApproval, emptyLock } from "../../scripts/lib/lock.mjs";
import { acPlan, parseTestCell, checkTestPlan, rewriteTargets } from "../../scripts/lib/testplan.mjs";
import { blocksForNext } from "../../scripts/cmd/status.mjs";
import { planFeature, actionFor } from "../../scripts/lib/feature.mjs";
import { cli, specProject } from "./notes.test.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const FILE = ".hitl/changes/feat-x/tasks.md";

const TASKS_MD = `# X Tasks

← Change: feat-x

> status: approved

## PWR-T1 Request a reset link

- prio: P1 | risk: high (security) | impl: agent | blocked-by: none | status: done

### Acceptance criteria

- [x] PWR-T1.AC1 (PWR-R1.S1) Given a known email When a reset is requested Then a link valid for 1 hour is sent
- superseded: PWR-T1.AC1 → PWR-T4.AC1 (PWR-A1)

## PWR-T2 Reset with a valid link

- prio: P1 | risk: high | impl: agent | blocked-by: PWR-T1 | amend: PWR-A1 | kind: switch | status: red

### Acceptance criteria

- [ ] PWR-T2.AC1 (PWR-R1.S2) Given a link When it is used Then the password changes

## PWR-T3 Lock out after failures

- prio: P2 | risk: low | impl: agent | blocked-by: none | status: dropped

**Dropped**: the amendment removes lock-out (PWR-A1)

### Acceptance criteria

- [ ] PWR-T3.AC1 (PWR-R9.S1) Given 5 failures When signing in Then the account locks

## PWR-T4 Expire reset links after 15 minutes

- prio: P1 | risk: high (security) | impl: agent | blocked-by: PWR-T1 | amend: PWR-A1 | kind: switch | status: todo

### Acceptance criteria

- [ ] PWR-T4.AC1 (PWR-R1.S1) Given a known email When a reset is requested Then a link valid for 15 minutes is sent

### Symbols

1. [ ] \`ResetService.request\` | modify | \`src/reset.ts\` | impl: agent | issues the link
2. [ ] \`ResetJob.sweep\` | remove | \`src/job.ts\` | impl: agent | dead after expiry on read

### Test plan

| ac  | test                     | kind | oracle | seam                 | author      |
| --- | ------------------------ | ---- | ------ | -------------------- | ----------- |
| AC1 | rewrite: PWR-T1.AC1      | —    | —      | ResetService.request | test-author |

## PWR-T5 Remove the sweep job

- prio: P2 | risk: low | impl: agent | blocked-by: none | amend: PWR-A1 | kind: contract | status: todo

### Acceptance criteria

- [ ] PWR-T5.AC1 Given the switch When the job list is read Then the sweep job is gone
`;
const doc = () => parseTasksMd(TASKS_MD, FILE);
const byId = (ts) => Object.fromEntries(ts.map((t) => [t.id, t]));

test("parser: amend/kind meta, remove rows, dropped with reason, superseded lines; old meta lines read as before", () => {
  const t = byId(doc().tasks);
  assert.deepEqual([t["PWR-T2"].amend, t["PWR-T2"].kind, t["PWR-T2"].status], ["PWR-A1", "switch", "red"]);
  assert.deepEqual([t["PWR-T3"].status, t["PWR-T3"].dropped], ["dropped", "the amendment removes lock-out (PWR-A1)"]);
  assert.deepEqual(t["PWR-T1"].superseded, [{ ac: "PWR-T1.AC1", by: "PWR-T4.AC1", amend: "PWR-A1" }]);
  assert.deepEqual(t["PWR-T1"].acs[0].superseded, { by: "PWR-T4.AC1", amend: "PWR-A1" });
  assert.deepEqual(t["PWR-T4"].symbols.map((s) => s.change), ["modify", "remove"]);
  assert.equal(t["PWR-T4"].testPlan[0].test, "rewrite");
  for (const x of Object.values(t)) assert.deepEqual(x.parseErrors, [], x.id);
  const old = parseTasksMd("# T\n\n← Change: feat-x\n\n## PWR-T9 A\n\n- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo\n", FILE).tasks[0];
  assert.deepEqual([old.amend, old.kind, old.dropped, old.superseded, old.status], [null, null, null, [], "todo"]);
  const bad = parseTasksMd("# T\n\n## PWR-T9 A\n\n- prio: P1 | risk: low | impl: agent | blocked-by: none | kind: switch | amend: PWR-A1 | status: todo\n\n### Acceptance criteria\n\n- superseded: AC1 → x\n", FILE).tasks[0];
  assert.match(bad.parseErrors.join(";"), /malformed meta line/); assert.match(bad.parseErrors.join(";"), /malformed superseded line/);
});

test("checks: TASK_KIND_BAD, AMEND_KEY_MISMATCH, TASK_DROPPED_*, SUPERSEDED_UNKNOWN, REMOVE_STILL_PRESENT", () => {
  const ts = doc().tasks; const t = byId(ts);
  const ids = new Map(ts.map((x) => [x.id, 1])); const allAcIds = new Set(ts.flatMap((x) => x.acs.map((a) => a.id)));
  for (const x of ts) assert.deepEqual(checkTaskChanges(x, { ids, allAcIds, lock: emptyLock() }), [], x.id);
  assert.match(checkTaskChanges({ ...t["PWR-T2"], kind: "shuffle" }, {}).join(), /TASK_KIND_BAD: PWR-T2 kind: shuffle/);
  assert.match(checkTaskChanges({ ...t["PWR-T2"], amend: null }, {}).join(), /TASK_KIND_BAD: .*needs amend:/);
  assert.match(checkTaskChanges({ ...t["PWR-T2"], amend: "FEE-A1" }, {}).join(), /AMEND_KEY_MISMATCH/);
  assert.match(checkTaskChanges({ ...t["PWR-T3"], dropped: null }, {}).join(), /TASK_DROPPED_NO_REASON/);
  const locked = { ...emptyLock(), tasks: { "PWR-T3": { skeletonAt: "x" } } };
  assert.match(checkTaskChanges(t["PWR-T3"], { lock: locked }).join(), /TASK_DROPPED_LOCKED/);
  assert.match(checkTaskChanges({ ...t["PWR-T1"], superseded: [{ ac: "PWR-T1.AC9", by: "none" }] }, { ids, allAcIds }).join(), /SUPERSEDED_UNKNOWN: PWR-T1 superseded: PWR-T1.AC9/);
  assert.match(checkTaskChanges({ ...t["PWR-T1"], superseded: [{ ac: "PWR-T1.AC1", by: "PWR-T7.AC1" }] }, { ids, allAcIds }).join(), /SUPERSEDED_UNKNOWN: .*PWR-T7.AC1/);
  const index = { symbols: { "src/job.ts#ResetJob.sweep": { name: "ResetJob.sweep" } } };
  const done = { ...emptyLock(), tasks: { "PWR-T4": { doneAt: "2026-11-20" } } };
  assert.match(checkTaskChanges(t["PWR-T4"], { lock: done, index }).join(), /REMOVE_STILL_PRESENT: PWR-T4 is done but its remove row ResetJob.sweep still exists in src\/job.ts/);
  assert.deepEqual(checkTaskChanges(t["PWR-T4"], { lock: done, index: { symbols: {} } }), []);
});

test("test plan: rewrite: is a decision of its own (strength after new, counts as a test of the task)", () => {
  assert.deepEqual(parseTestCell("rewrite: PWR-T1.AC1"), { test: "rewrite", detail: "PWR-T1.AC1", bad: false });
  const t4 = byId(doc().tasks)["PWR-T4"];
  assert.deepEqual([acPlan(t4, "PWR-T4.AC1").test, acPlan(t4, "PWR-T4.AC1").rewrite], ["rewrite", ["PWR-T1.AC1"]]);
  assert.deepEqual(checkTestPlan(t4), []);
  assert.match(checkTestPlan({ ...t4, testPlan: [{ ...t4.testPlan[0], detail: null }] }).join(), /TEST_PLAN_EMPTY: PWR-T4.AC1 "rewrite:" needs the locked test it takes over/);
  const index = { symbols: { "tests/r.test.ts#issues a 1 hour link": { id: "tests/r.test.ts#issues a 1 hour link", kind: "test", name: "issues a 1 hour link", tags: { ac: ["PWR-T1.AC1"] }, test: { titlePath: ["issues a 1 hour link"] } } } };
  assert.deepEqual(rewriteTargets(index, emptyLock(), t4), [{ ac: "PWR-T4.AC1", ref: "PWR-T1.AC1", ids: ["tests/r.test.ts#issues a 1 hour link"] }]);
});

test("route: wording only and task-level only stay in chat; meaning changes, spec gaps, no ids and an open brief go to the brief", () => {
  assert.deepEqual(routeAmend({ refs: ["PWR-R1.S1"], impact: [{ ref: "PWR-R1.S1", class: "wording" }] }).chat, "gate");
  assert.equal(routeAmend({ refs: ["PWR-R1.S1", "PWR-D2"], impact: [{ ref: "PWR-R1.S1", class: "wording" }, { ref: "PWR-D2", class: "wording" }] }).route, "chat");
  assert.deepEqual(routeAmend({ refs: ["PWR-T2", "PWR-T2.AC1", "ResetService.request"] }), { route: "chat", chat: "tasks-update", reason: "only tasks, ACs, symbols or tests change: /hitl:tasks <id> update (no spec or design meaning changes)" });
  assert.equal(routeAmend({ refs: ["PWR-R1.S1"], impact: [{ ref: "PWR-R1.S1", class: "behaviour" }] }).route, "brief");
  assert.equal(routeAmend({ refs: ["PWR-R1.S1"] }).route, "brief", "a spec id without a class");
  assert.match(routeAmend({ refs: ["PWR-T2.AC1"], impact: [{ ref: "PWR-T2.AC1", class: "behaviour" }] }).reason, /spec gap/);
  assert.match(routeAmend({ refs: [] }).reason, /no ids yet/);
  assert.equal(routeAmend({ refs: ["PWR-T2"], open: { amend: "PWR-A1" } }).route, "brief");
  assert.deepEqual(routeAmend({ archived: true }).chat, "mini-change");
});

test("amendment ids, transition words, per-state rule", () => {
  assert.equal(nextAmendId("PWR", [{ amend: "PWR-A1" }], [{ amend: "PWR-A3" }, { superseded: [{ amend: "PWR-A2" }] }, { amend: "FEE-A9" }]), "PWR-A4");
  assert.equal(nextAmendId("PWR"), "PWR-A1");
  assert.deepEqual(["only in this branch", "in-branch", "merged, not released", "released", "—", null].map(normTransition), ["branch", "branch", "merged", "released", null, null]);
  const row = (status, locked, lockedWork = false) => ({ status, locked: { skeleton: false, tests: false, done: false, ...locked }, lockedWork });
  assert.deepEqual([row("todo", {}), row("red", { tests: true }, true), row("done", { done: true }, true), row("dropped", {})].map(stateRule), ["edit", "reopen", "keep-done", "dropped"]);
});

test("AMEND_ORDER: blocked-by follows the kind order; the transition answer limits the kinds; expand needs a contract", () => {
  const T = (id, kind, blockedBy = [], amend = "PWR-A1") => ({ id, kind, blockedBy, amend, status: "todo" });
  assert.deepEqual(checkAmendOrder([T("PWR-T4", "switch"), T("PWR-T5", "contract", ["PWR-T4"])], { "PWR-A1": "branch" }), []);
  assert.match(checkAmendOrder([T("PWR-T4", "switch"), T("PWR-T5", "contract")], {})[0].message, /AMEND_ORDER: PWR-T5 \(contract\) must come after PWR-T4 \(switch\) in PWR-A1: add blocked-by PWR-T4/);
  const viaChain = [T("PWR-T6", "prep"), T("PWR-T4", "switch", ["PWR-T6"]), T("PWR-T5", "contract", ["PWR-T4"])];
  assert.deepEqual(checkAmendOrder(viaChain, {}), [], "transitive blocked-by counts");
  const e = checkAmendOrder([T("PWR-T7", "expand"), T("PWR-T4", "switch", ["PWR-T7"])], { "PWR-A1": "branch" }).map((x) => x.message);
  assert.ok(e.some((m) => /kind expand is for old behaviour that is merged or released; PWR-A1 says it is only in this branch/.test(m)), e.join("\n"));
  assert.ok(e.some((m) => /expands \(PWR-T7\) without a contract task/.test(m)), e.join("\n"));
  assert.deepEqual(checkAmendOrder([T("PWR-T7", "expand"), T("PWR-T8", "migrate", ["PWR-T7"]), T("PWR-T4", "switch", ["PWR-T8"]), T("PWR-T5", "contract", ["PWR-T4"])], { "PWR-A1": "released" }), []);
  assert.deepEqual(checkAmendOrder([T("PWR-T5", "contract"), { ...T("PWR-T4", "switch"), status: "dropped" }], {}), [], "a dropped task is not ordered");
  assert.deepEqual(checkAmendOrder([T("PWR-T5", "contract"), T("PWR-T9", "revert")], {}), [], "revert is not ordered");
});

// one change with a done, an in-progress and a todo task (the e2e covers the same through the CLI)
const LOCK = () => ({ ...emptyLock(),
  symbols: { "src/reset.ts#ResetService.request": { task: "PWR-T1", sigHash: "s", intentHash: "i" } },
  tests: {
    "tests/r.test.ts#issues a 1 hour link": { task: "PWR-T1", ac: ["PWR-T1.AC1"], covers: ["src/reset.ts#ResetService.request"], stage: "locked", bodyHash: "b1" },
    "tests/r.test.ts#uses the link": { task: "PWR-T2", ac: ["PWR-T2.AC1"], covers: ["src/reset.ts#ResetService.verify"], stage: "locked", bodyHash: "b2" },
    "tests/old.test.ts#2fa link valid 1 hour": { task: "TFA-T1", ac: ["TFA-T1.AC1"], covers: ["src/reset.ts#ResetService.request"], stage: "locked", bodyHash: "b3" },
  },
  tasks: { "PWR-T1": { doneAt: "2026-11-01", skeletonAt: "x", testsAt: "x" }, "PWR-T2": { skeletonAt: "x", testsAt: "x" }, "TFA-T1": { doneAt: "2026-10-01", archivedAt: "2026-10-02", change: "feat-2fa" } } });
const INDEX = () => ({ symbols: {
  "src/reset.ts#ResetService.request": { id: "src/reset.ts#ResetService.request", name: "ResetService.request", kind: "method", tags: { task: ["PWR-T1"], dec: ["PWR-D2"] } },
  "src/reset.ts#ResetService.verify": { id: "src/reset.ts#ResetService.verify", name: "ResetService.verify", kind: "method", tags: { task: ["PWR-T2"] } },
  "src/job.ts#ResetJob.sweep": { id: "src/job.ts#ResetJob.sweep", name: "ResetJob.sweep", kind: "method", tags: {} },
  "tests/r.test.ts#issues a 1 hour link": { id: "tests/r.test.ts#issues a 1 hour link", kind: "test", name: "issues a 1 hour link", tags: { ac: ["PWR-T1.AC1"] }, test: { titlePath: ["issues a 1 hour link"] } },
  "tests/old.test.ts#2fa link valid 1 hour": { id: "tests/old.test.ts#2fa link valid 1 hour", kind: "test", name: "2fa link valid 1 hour", tags: { ac: ["TFA-T1.AC1"] }, test: { titlePath: ["2fa link valid 1 hour"] } },
} });
const plain = () => doc().tasks.map((t) => ({ ...t, change: "feat-x" }));

test("amend start facts: where the tasks stand, what the refs reach (ACs, @dec symbols, locked tests incl. an archived change's)", () => {
  const tasks = plain().map((t) => (t.id === "PWR-T1" ? { ...t, superseded: [], acs: t.acs.map((a) => ({ ...a, superseded: undefined })) } : t));
  const lock = LOCK(), index = INDEX();
  const statusOf = (T) => ({ "PWR-T1": "done", "PWR-T2": "red", "PWR-T4": "todo", "PWR-T5": "todo", "PWR-T3": "dropped" })[T];
  const stands = byId(whereTasksStand(tasks, "feat-x", { index, lock, refs: ["PWR-R1.S1", "PWR-D2"], statusOf }));
  assert.deepEqual([stateRule(stands["PWR-T1"]), stateRule(stands["PWR-T2"]), stateRule(stands["PWR-T5"])], ["keep-done", "reopen", "edit"]);
  assert.deepEqual(stands["PWR-T1"].touched, ["PWR-R1.S1", "PWR-D2"]);
  const a = amendAffected({ refs: ["PWR-R1.S1", "PWR-D2"], tasks, change: "feat-x", index, lock, design: { decisions: [{ id: "PWR-D2", decision: "Token valid 1 hour", status: "accepted" }] } });
  assert.deepEqual(a.acs.map((x) => x.id), ["PWR-T1.AC1", "PWR-T4.AC1"]);
  assert.deepEqual(a.decisions, [{ id: "PWR-D2", decision: "Token valid 1 hour", status: "accepted" }]);
  assert.deepEqual(a.symbols.map((x) => [x.name, x.via]), [["ResetService.request", ["@dec PWR-D2", "tested by PWR-T1.AC1"]]]);
  assert.deepEqual(a.tests.map((x) => [x.title, x.owner, x.archived, x.done]), [["2fa link valid 1 hour", "TFA-T1", true, true], ["issues a 1 hour link", "PWR-T1", false, true]]);
  const md = renderAmendBriefHead({ change: "feat-x", key: "PWR", amend: "PWR-A1", from: ["N-4"], refs: ["PWR-R1.S1", "PWR-D2"], today: "2026-11-20", description: "Links last 15 minutes.", stands: Object.values(stands), affected: a });
  const b = parseBrief(md, ".hitl/changes/feat-x/amend-PWR-A1-brief.md");
  assert.deepEqual([b.kind, b.amend, b.change, b.from, b.refs, b.transition, b.skill, b.status], ["amend", "PWR-A1", "feat-x", ["N-4"], ["PWR-R1.S1", "PWR-D2"], null, "plan", "open"]);
  assert.match(md, /^\| PWR-T1 \| Request a reset link +\| done +\| skeleton, tests, done \| PWR-R1\.S1, PWR-D2 \| done: never reopened; a new task takes over +\|$/m);
  assert.match(md, /^- Test: 2fa link valid 1 hour — locked by TFA-T1 \(archived change feat-2fa\); covers ResetService\.request$/m);
});

test("AMEND_UNCOVERED: every touched item is handled by the set, superseded, dropped, or listed under ## Unchanged", () => {
  const tasks = plain(), lock = LOCK(), index = INDEX();
  const view = {}, resolveSpecRef = (v, r) => ({ status: r === "PWR-R9.S1" ? "removed" : "ok" }); // the amendment removes lock-out
  const affected = amendAffected({ refs: ["PWR-R1.S1", "PWR-D2", "PWR-R9.S1"], tasks, change: "feat-x", index, lock, view, resolveSpecRef });
  const brief = { file: "amend-PWR-A1-brief.md", unchanged: [] };
  let e = checkAmendCoverage({ amend: "PWR-A1", brief, affected, tasks, index, lock, change: "feat-x" });
  // PWR-T1.AC1 superseded, PWR-T4 carries PWR-A1 + rewrite: PWR-T1.AC1, PWR-T3 dropped; the archived change's test is not handled
  assert.deepEqual(e.map((x) => x.ref), ["2fa link valid 1 hour"], e.map((x) => x.message).join("\n"));
  assert.match(e[0].message, /AMEND_UNCOVERED: 2fa link valid 1 hour \(locked by TFA-T1 of archived feat-2fa; covers ResetService.request\) — no task of PWR-A1 handles it: .*## Unchanged in amend-PWR-A1-brief.md/);
  e = checkAmendCoverage({ amend: "PWR-A1", brief: { ...brief, unchanged: [{ id: "2fa link valid 1 hour", reason: "asserts the 2FA link, not the reset link" }] }, affected, tasks, index, lock, change: "feat-x" });
  assert.deepEqual(e, []);
  // without the superseded line and without the rewrite row, the done task's AC and its test are uncovered
  const bare = tasks.map((t) => (t.id === "PWR-T1" ? { ...t, superseded: [], acs: t.acs.map(({ superseded, ...a }) => a) } : t.id === "PWR-T4" ? { ...t, testPlan: [] } : t));
  const a2 = amendAffected({ refs: ["PWR-R1.S1"], tasks: bare, change: "feat-x", index, lock });
  e = checkAmendCoverage({ amend: "PWR-A1", brief, affected: a2, tasks: bare, index, lock, change: "feat-x" });
  assert.deepEqual(e.map((x) => x.kind).sort(), ["ac", "test", "test"], e.map((x) => x.message).join("\n"));
  // a spec id still in the view with no live AC
  e = checkAmendCoverage({ amend: "PWR-A1", brief, affected: { specs: [{ id: "PWR-R7.S1", title: "Audit log", state: "ok" }], acs: [], tasks: [], symbols: [], tests: [] }, tasks, index, lock, change: "feat-x" });
  assert.match(e[0].message, /PWR-R7.S1 \(Audit log: no AC of a live task references it\)/);
});

test("hold: an open amend brief holds the not-done tasks its refs touch; done tasks and other changes go on; next skips held tasks", () => {
  const tasks = plain(), lock = LOCK(), index = INDEX();
  assert.deepEqual(Object.keys(touchedTasks(["PWR-R1.S2"], tasks, index, lock)), ["PWR-T2"]);
  const brief = { amend: "PWR-A2", refs: ["PWR-R1.S1", "PWR-R1.S2"], status: "open", file: "f.md", skill: "plan" };
  const holds = amendHolds([{ change: "feat-x", brief }], tasks, index, lock);
  assert.deepEqual(Object.keys(holds).sort(), ["PWR-T2", "PWR-T4"], "PWR-T1 is done; PWR-T3 dropped; PWR-T5 untouched");
  assert.deepEqual(holds["PWR-T2"], { amend: "PWR-A2", change: "feat-x", file: "f.md", via: ["PWR-R1.S2"], apply: "/hitl:plan feat-x amend" });
  assert.deepEqual(amendHolds([{ change: "feat-x", brief: { ...brief, status: "done" } }], tasks, index, lock), {});
  const statuses = { tasks: { "PWR-T2": { status: "red", next: "/hitl:implement PWR-T2" }, "PWR-T4": { status: "todo", next: "/hitl:skeleton PWR-T4" }, "PWR-T5": { status: "todo", next: "/hitl:implement PWR-T5" }, "PWR-T1": { status: "done" }, "PWR-T3": { status: "dropped" } } };
  const ts = tasks.map((t) => ({ ...t, blockedBy: [] }));
  let r = computeNext({ tasks: ts, statuses, notes: blocksForNext({ holds }) });
  assert.equal(r.command, "/hitl:implement PWR-T5"); assert.match(r.reason, /skipped PWR-T2 \(PWR-A2\), PWR-T4 \(PWR-A2\)/);
  r = computeNext({ tasks: ts.filter((t) => t.id !== "PWR-T5"), statuses, notes: blocksForNext({ holds }) });
  assert.deepEqual([r.task, r.command], ["PWR-T2", "/hitl:plan feat-x amend"]);
});

test("brief: amend kind, Unchanged section, the open amend brief wins pickBrief and gives the next step in any phase", () => {
  const md = read("shared/templates/amend-brief.md").replace(/\{KEY\}-A\{n\}/g, "PWR-A1").replace(/\{change-id\}/g, "feat-x") + "\n## Unchanged\n\n- PWR-R1.S3 — the used-link rule stays\n- `2fa link valid 1 hour` — 2FA, not reset\n";
  const b = parseBrief(md, ".hitl/changes/feat-x/amend-PWR-A1-brief.md");
  assert.deepEqual(b.unchanged, [{ id: "PWR-R1.S3", reason: "the used-link rule stays" }, { id: "2fa link valid 1 hour", reason: "2FA, not reset" }]);
  assert.deepEqual(b.questions.map((q) => [q.id, q.tag]), [["Q1", "R"], ["Q2", "D"]]);
  const plan = { kind: "plan", status: "done" }, amend = { ...b, open: true };
  assert.equal(pickBrief("implement", { plan, design: null, amend: b }), b);
  assert.equal(pickBrief("implement", { plan, design: null, amend: null }), plan);
  assert.equal(briefNext("feat-x", "implement", { kind: "amend", open: true, unanswered: 2, file: "f.md", skill: "plan" }), "answer f.md, then /hitl:plan feat-x amend");
  assert.equal(briefNext("feat-x", "implement", { kind: "amend", open: true, unanswered: 0, file: "f.md", skill: "design" }), "/hitl:design feat-x amend");
  assert.equal(amend.amend, "PWR-A1");
});

test("impact keepDone: a done task is kept (never reopened); an in-progress task still reopens", () => {
  const tasks = plain(), lock = LOCK(), index = INDEX();
  const entries = [{ ref: "PWR-R1.S1", class: "behaviour" }, { ref: "PWR-R1.S2", class: "behaviour" }];
  const today = computeImpact({ entries, tasks, index, lock });
  assert.equal(today.tasks.find((x) => x.task === "PWR-T1").reopen, "tests", "before 0.17: the done task reopens");
  const imp = computeImpact({ entries, tasks, index, lock, keepDone: true });
  const t1 = imp.tasks.find((x) => x.task === "PWR-T1"), t2 = imp.tasks.find((x) => x.task === "PWR-T2");
  assert.deepEqual([t1.kept, t1.reopen, t1.tests], ["done", null, []]);
  assert.deepEqual([t2.reopen, t2.tests], ["tests", ["tests/r.test.ts#uses the link"]]);
  assert.equal(imp.recheck, true);
});

test("reopen take-over: a locked test of a done task (and of an archived change) moves to the new task; the new task's tests stage needs it rewritten", () => {
  const index = INDEX(), lock = LOCK();
  const t4 = { ...byId(plain())["PWR-T4"], testPlan: [{ ac: "AC1", test: "rewrite", detail: "PWR-T1.AC1" }, { ac: "AC1", test: "rewrite", detail: "2fa link valid 1 hour" }] };
  const tasks = [t4];
  const notes = [{ id: "N-5", kind: "recheck", title: "Recheck after PWR-A1", status: "reopen pending", refs: [], acks: [],
    meta: { amend: "PWR-A1", reopen: [{ task: "PWR-T4", stage: "takeover", tests: ["tests/r.test.ts#issues a 1 hour link", "tests/old.test.ts#2fa link valid 1 hour"],
      refs: { "tests/r.test.ts#issues a 1 hour link": "PWR-T1.AC1", "tests/old.test.ts#2fa link valid 1 hour": "2fa link valid 1 hour" }, from: ["PWR-T1", "TFA-T1"] }] } }];
  // the new task's tests stage is refused while the tests are still locked by their old tasks
  const before = planApproval({ taskId: "PWR-T4", stage: "tests", by: "human", index, lock: { ...lock, tasks: { ...lock.tasks, "PWR-T4": { skeletonAt: "x" } } }, state: {}, task: t4, tasks, force: false });
  assert.match(before.reasons.join("\n"), /PWR-T4.AC1 rewrite: issues a 1 hour link is still locked by PWR-T1: it is taken over first/);
  const r = planApproval({ changeId: "feat-x", stage: "reopen", by: "human", tasks, notes, lock, index, now: "2026-11-21T00:00:00Z" });
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.reopened, [{ task: "PWR-T4", stage: "takeover", acs: [], tests: ["tests/old.test.ts#2fa link valid 1 hour", "tests/r.test.ts#issues a 1 hour link"], symbols: [], from: ["PWR-T1", "TFA-T1"] }]);
  const moved = r.lock.tests["tests/r.test.ts#issues a 1 hour link"];
  assert.deepEqual([moved.task, moved.stage, moved.takenFrom.task, moved.takenFrom.ref, moved.takenFrom.amend], ["PWR-T4", "reopened", "PWR-T1", "PWR-T1.AC1", "PWR-A1"]);
  assert.equal(r.lock.tasks["PWR-T1"].doneAt, "2026-11-01", "the done task keeps its done record");
  assert.deepEqual(r.lock.tasks["PWR-T1"].takenOver.map((x) => x.to), ["PWR-T4"]);
  assert.equal(r.lock.tests["tests/old.test.ts#2fa link valid 1 hour"].takenFrom.task, "TFA-T1", "an archived change's test is taken over, never reopened");
  // taken over but still carrying the old @ac → refused; rewritten to @ac PWR-T4.AC1 → that reason is gone
  const lt = { ...r.lock, tasks: { ...r.lock.tasks, "PWR-T4": { skeletonAt: "x" } } };
  let t = planApproval({ taskId: "PWR-T4", stage: "tests", by: "human", index, lock: lt, state: {}, task: t4, tasks });
  assert.match(t.reasons.join("\n"), /PWR-T4.AC1 rewrite: the taken-over test\(s\) still carry the old @ac/);
  const idx2 = INDEX();
  for (const id of ["tests/r.test.ts#issues a 1 hour link", "tests/old.test.ts#2fa link valid 1 hour"]) idx2.symbols[id].tags.ac = ["PWR-T4.AC1"];
  t = planApproval({ taskId: "PWR-T4", stage: "tests", by: "human", index: idx2, lock: lt, state: {}, task: t4, tasks });
  assert.doesNotMatch(t.reasons.join("\n"), /rewrite:/);
});

test("status: dropped tasks and remove rows; approve done refuses REMOVE_STILL_PRESENT; next and counts skip dropped", () => {
  const index = INDEX();
  const t5 = { ...byId(plain())["PWR-T5"], symbols: [{ order: 1, ref: "ResetJob.sweep", change: "remove", file: "src/job.ts", impl: "agent" }] };
  const t3 = byId(plain())["PWR-T3"];
  let st = computeStatuses(index, emptyLock(), {}, {}, [t5, t3]).tasks;
  assert.deepEqual([st["PWR-T5"].status, st["PWR-T5"].removePending, st["PWR-T3"].status, st["PWR-T3"].next], ["todo", ["src/job.ts#ResetJob.sweep"], "dropped", null]);
  const gone = { symbols: Object.fromEntries(Object.entries(index.symbols).filter(([id]) => !id.startsWith("src/job.ts"))) };
  st = computeStatuses(gone, emptyLock(), {}, {}, [t5]).tasks;
  assert.deepEqual([st["PWR-T5"].status, st["PWR-T5"].next], ["green", "/hitl:review PWR-T5"]);
  const ok = planApproval({ taskId: "PWR-T5", stage: "done", by: "human", index: gone, lock: { ...emptyLock(), tasks: { "PWR-T5": { skeletonAt: "x", testsAt: "x" } } }, state: {}, task: t5, tasks: [t5] });
  assert.equal(ok.ok, true, ok.reasons.join("; "));
  const no = planApproval({ taskId: "PWR-T5", stage: "done", by: "human", index, lock: { ...emptyLock(), tasks: { "PWR-T5": { skeletonAt: "x", testsAt: "x" } } }, state: {}, task: t5, tasks: [t5] });
  assert.match(no.reasons.join(), /REMOVE_STILL_PRESENT: ResetJob.sweep \(a remove row of PWR-T5\) still exists in src\/job.ts/);
  const r = computeNext({ tasks: [{ id: "PWR-T3", prio: "P0", blockedBy: [] }, { id: "PWR-T5", prio: "P1", blockedBy: ["PWR-T3"] }], statuses: { tasks: { "PWR-T3": { status: "dropped" }, "PWR-T5": { status: "todo", next: "/hitl:implement PWR-T5" } } } });
  assert.equal(r.command, "/hitl:implement PWR-T5", "a dropped task neither runs nor blocks");
});

test("feature run: a held task stops the run with the amend brief's next step; dropped tasks are skipped", () => {
  const tasks = [{ id: "PWR-T2", prio: "P1", risk: "high", blockedBy: [] }, { id: "PWR-T3", prio: "P2", risk: "low", blockedBy: [] }];
  const statuses = { tasks: { "PWR-T2": { status: "red", testsLocked: true, risk: "high" }, "PWR-T3": { status: "dropped", risk: "low" } } };
  const holds = { "PWR-T2": { amend: "PWR-A1", apply: "/hitl:plan feat-x amend" } };
  const p = planFeature({ feature: { name: "feat-x", file: FILE, tasks }, statuses, holds });
  assert.deepEqual(p.items.map((i) => i.action), ["held", "skip"]);
  assert.equal(p.stop, "PWR-T2 waits for the open amend brief PWR-A1: /hitl:plan feat-x amend");
  assert.equal(actionFor("dropped", "normal", false), "skip");
});

// ---------------------------------------------------------------- CLI on the spec-app fixture (PWR-T1 done, PWR-T2 todo)
test("CLI: spec next-id --kind A, amend start (route + facts + --write), brief --kind amend, status amendHold, implement stop", () => {
  const root = specProject();
  assert.equal(cli(root, "spec", "next-id", "feat-password-reset", "--kind", "A").out.trim(), "PWR-A1");
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "PWR-R2.S1", "--text", "The new password must differ from the old one.").code, 0);
  let r = cli(root, "amend", "start", "feat-password-reset", "--from", "N-1", "--json").json();
  assert.deepEqual([r.route, r.amend, r.refs, r.file], ["brief", "PWR-A1", ["PWR-R2.S1"], ".hitl/changes/feat-password-reset/amend-PWR-A1-brief.md"]);
  assert.deepEqual(r.tasks.map((t) => [t.id, t.rule, t.touched]), [["PWR-T1", "keep-done", []], ["PWR-T2", "edit", ["PWR-R2.S1"]]]);
  assert.deepEqual(r.affected.acs.map((a) => a.id), ["PWR-T2.AC1"]);
  r = cli(root, "amend", "start", "feat-password-reset", "--refs", "PWR-R2.S1", "--impact", "PWR-R2.S1=wording", "--json").json();
  assert.deepEqual([r.route, r.chat], ["chat", "gate"]);
  assert.equal(cli(root, "amend", "start", "feat-password-reset", "--refs", "PWR-T2.AC1", "--json").json().chat, "tasks-update");
  const w = cli(root, "amend", "start", "feat-password-reset", "--from", "N-1", "--write", "--json");
  assert.equal(w.code, 0, w.out + w.err); assert.equal(w.json().written, true);
  const file = path.join(root, ".hitl/changes/feat-password-reset/amend-PWR-A1-brief.md");
  assert.match(fs.readFileSync(file, "utf8"), /^> change: feat-password-reset \| key: PWR \| kind: amend \| amend: PWR-A1 \| from: N-1 \| refs: PWR-R2.S1 \| transition: — \| skill: plan \| status: open/m);
  // a second start continues the open brief (one per change); spec next-id skips the used id
  r = cli(root, "amend", "start", "feat-password-reset", "--refs", "PWR-R1.S1", "--json").json();
  assert.deepEqual([r.route, r.amend, r.open?.amend], ["brief", "PWR-A1", "PWR-A1"]);
  assert.equal(cli(root, "spec", "next-id", "feat-password-reset", "--kind", "A").out.trim(), "PWR-A2");
  const b = cli(root, "brief", "feat-password-reset", "--kind", "amend", "--json").json();
  assert.deepEqual([b.kind, b.amend, b.from, b.status], ["amend", "PWR-A1", ["N-1"], "open"]);
  const s = cli(root, "status", "--json").json();
  assert.deepEqual([s.tasks["PWR-T2"].amendHold?.amend, s.tasks["PWR-T2"].amendHold?.apply], ["PWR-A1", "/hitl:plan feat-password-reset amend"]);
  assert.equal(s.changes[0].brief.kind, "amend");
  assert.match(cli(root, "status", "--brief").out, /_Brief:_ feat-password-reset — amend brief PWR-A1 round 1 \(open\)/);
  assert.equal(cli(root, "change", "feat-password-reset", "--json").json().changes[0].next, "/hitl:plan feat-password-reset amend");
  // archive waits for the open amend brief, even with --force
  const ar = cli(root, "spec", "archive", "feat-password-reset", "--dry-run", "--force", "--json").json();
  assert.ok(ar.preconditions.notes.open.some((n) => n.kind === "amend" && n.id === "PWR-A1"), JSON.stringify(ar.preconditions));
  // the brief approved → no hold
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("| status: open |", "| status: done |"));
  assert.equal(cli(root, "status", "--json").json().tasks["PWR-T2"].amendHold, undefined);
});

test("CLI: tasks drop (todo only, reason line, prettier-stable), tasks --check with amend checks, amend check", () => {
  const root = specProject();
  const tf = path.join(root, ".hitl/changes/feat-password-reset/tasks.md");
  assert.equal(cli(root, "tasks", "drop", "PWR-T1", "--reason", "x", "--json").code, 1, "a done task is never dropped");
  assert.match(cli(root, "tasks", "drop", "PWR-T1", "--reason", "x").out, /locked work/);
  assert.equal(cli(root, "tasks", "drop", "PWR-T2").code, 2, "--reason is required");
  const d = cli(root, "tasks", "drop", "PWR-T2", "--reason", "replaced by PWR-T3", "--amend", "PWR-A1", "--json");
  assert.equal(d.code, 0, d.out + d.err);
  const text = fs.readFileSync(tf, "utf8");
  assert.match(text, /blocked-by: PWR-T1 \| status: dropped\n\n\*\*Dropped\*\*: replaced by PWR-T3 \(PWR-A1\)\n/);
  assert.equal(cli(root, "tasks", "drop", "PWR-T2", "--reason", "again").code, 1, "dropped already");
  const st = cli(root, "status", "--json").json();
  assert.equal(st.tasks["PWR-T2"].status, "dropped");
  // an amend set written out of order → AMEND_ORDER from tasks --check and amend check
  fs.appendFileSync(tf, "\n## PWR-T3 New password differs\n- prio: P1 | risk: low | impl: agent | blocked-by: none | amend: PWR-A1 | kind: contract | status: todo\n\n### Acceptance criteria\n- [ ] PWR-T3.AC1 (PWR-R2.S1) Given x When y Then z\n\n### Test plan\n| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | none: wiring | — | — | — | — |\n\n## PWR-T4 Differ check\n- prio: P1 | risk: low | impl: agent | blocked-by: none | amend: PWR-A1 | kind: switch | status: todo\n\n### Acceptance criteria\n- [ ] PWR-T4.AC1 (PWR-R2.S1) Given x When y Then z\n\n### Test plan\n| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | none: wiring | — | — | — | — |\n");
  const c = cli(root, "tasks", "--check", "--json");
  assert.equal(c.code, 1);
  assert.match(c.json().errors.map((e) => e.message).join("\n"), /AMEND_ORDER: PWR-T3 \(contract\) must come after PWR-T4 \(switch\) in PWR-A1/);
  const a = cli(root, "amend", "check", "feat-password-reset", "--json");
  assert.equal(a.code, 1); assert.equal(a.json().errors[0].code, "AMEND_ORDER");
  fs.writeFileSync(tf, fs.readFileSync(tf, "utf8").replace("blocked-by: none | amend: PWR-A1 | kind: contract", "blocked-by: PWR-T4 | amend: PWR-A1 | kind: contract"));
  assert.equal(cli(root, "amend", "check", "feat-password-reset", "--json").code, 0);
});

test("CLI: note apply --amend applies the brief's notes, keeps done tasks and lists take-overs as a recheck", () => {
  const root = specProject();
  cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "PWR-R1.S1", "--text", "Links last 15 minutes.");
  assert.equal(cli(root, "amend", "start", "feat-password-reset", "--from", "N-1", "--write").code, 0);
  const delta = path.join(root, ".hitl/changes/feat-password-reset/specs/accounts/spec.md");
  fs.writeFileSync(delta, fs.readFileSync(delta, "utf8").replace('THEN one reset link is sent to "ana@example.com"', 'THEN one reset link valid for 15 minutes is sent to "ana@example.com"'));
  const dry = cli(root, "note", "apply", "--change", "feat-password-reset", "--amend", "PWR-A1", "--impact", "PWR-R1.S1=behaviour", "--dry-run", "--json").json();
  assert.equal(dry.tasks.find((x) => x.task === "PWR-T1").kept, "done", dry.line);
  assert.match(dry.line, /PWR-T1 done: kept \(a new task takes over\)/);
  const r = cli(root, "note", "apply", "--change", "feat-password-reset", "--amend", "PWR-A1", "--impact", "PWR-R1.S1=behaviour", "--json").json();
  assert.deepEqual([r.notes, r.amend, r.recheck], [["N-1"], "PWR-A1", null], "no in-progress task, no take-over: no recheck");
  assert.match(fs.readFileSync(path.join(root, ".hitl/changes/feat-password-reset/notes.md"), "utf8"), /- status: applied\n- from: .*\n- resolved: applied \d{4}-\d{2}-\d{2} in PWR-A1: PWR-R1.S1 behaviour/);
});

test("overwrite is gone; docs: task-changes.md is the one per-state rule set, amend-spec owns the one status rule", () => {
  const tasks = read("skills/tasks/SKILL.md");
  assert.doesNotMatch(tasks, /update\/overwrite/); assert.match(tasks, /there is no overwrite/); assert.match(tasks, /shared\/task-changes\.md/);
  assert.doesNotMatch(read("shared/conventions-spec.md"), /update\/overwrite/);
  const tc = read("shared/task-changes.md");
  for (const w of ["edit in place", "reopen in place", "never reopened", "superseded:", "rewrite:", "remove", "AMEND_ORDER", "AMEND_UNCOVERED", "REMOVE_STILL_PRESENT", "Tests of an archived change"]) assert.ok(tc.includes(w), `task-changes.md: ${w}`);
  const am = read("shared/amend-spec.md");
  assert.match(am, /## 6\. Status of the proposal and the design \(the one rule\)/);
  assert.match(am, /that Y is the re-approval/); assert.match(am, /only while the change has no task/); assert.match(am, /its own change key \(`hitl-index spec key fix-<slug>`/);
  assert.match(am, /the delta preview, \*\*then\*\* the Impact block, \*\*then\*\*\s+the question/);
  for (const f of ["skills/plan/SKILL.md", "skills/design/SKILL.md", "shared/amend-spec.md"]) {
    assert.doesNotMatch(read(f), /proposal back to draft only for|Unchanged by the brief file|proposal `status: draft` and `_Next:_ \/hitl:tasks/, f);
  }
  assert.match(read("skills/plan/SKILL.md"), /reopening an approved spec is allowed only before the first task/);
  assert.match(read("skills/design/SKILL.md"), /reopening an approved design is allowed only before the first task/);
  assert.match(read("skills/implement/SKILL.md"), /`tasks\[T\]\.amendHold` set/);
  for (const f of ["shared/tag-grammar.md", "skills/skeleton/SKILL.md", "skills/tidy/SKILL.md", "agents/implementer.md", "skills/implement/SKILL.md"]) assert.match(read(f), /history\s+words/, `${f}: intent-only rule`);
  const help = read("skills/flow/references/help.md");
  for (const l of ["_Held:_", "_Amend set:_"]) assert.ok(help.includes(`| \`${l}\` |`), `legend ${l}`);
  const readme = read("README.md");
  assert.match(readme, /^### Nâng cấp từ 0\.16\.0/m);
  const note = readme.slice(readme.indexOf("### Nâng cấp từ 0.16.0"), readme.indexOf("### Nâng cấp từ 0.15.0"));
  for (const w of ["amend brief", "PWR-A1", "superseded:", "tasks drop", "/hitl:approve", "overwrite"]) assert.ok(note.includes(w), `README 0.17 note: ${w}`);
  assert.match(read("HUONG-DAN.md"), /amend brief/);
  assert.equal(JSON.parse(read(".claude-plugin/plugin.json")).version, "0.17.0");
});
