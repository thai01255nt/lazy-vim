// design v3 Phase 2 — the existing CLI consumes changes: tasksmd (spec refs, change/archive scan), trace (hitl.trace/2 codes,
// scopes, specLinksFor, markdown), context AC lines, feature by change id, next step by change phase, Linear change = project.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTasksMd, readTaskDocs, readTasks, checkTasks } from "../../scripts/lib/tasksmd.mjs";
import { buildTrace, loadTraceInputs, renderTraceMd, specLinksFor } from "../../scripts/lib/trace.mjs";
import { resolveFeature } from "../../scripts/lib/feature.mjs";
import { computeNext } from "../../scripts/lib/nextstep.mjs";
import { applyRecord, buildPlan, emptyMap, linearCfg, loadChangeInfo, normalizeMap } from "../../scripts/lib/linear.mjs";
import { updateIndex, buildContext } from "../../scripts/lib/api.mjs";
import { makeProject, write } from "./_project.mjs";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const APP = path.join(PLUGIN, "tests/fixtures/spec-app");
const CH = ".hitl/changes/feat-password-reset";
const AR = ".hitl/archive/2026-10-20-feat-2fa";
const copyApp = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-spec-int-")); fs.cpSync(APP, d, { recursive: true }); return d; };
const codes = (tr) => tr.items.map((i) => `${i.level}:${i.code}:${i.ref}`);
const only = (tr, code) => codes(tr).filter((c) => c.split(":")[1] === code);
const byId = (tasks, id) => tasks.find((t) => t.id === id);

test("tasksmd: changes/*/tasks.md, archive/*/tasks.md, then tasks/*.md; spec refs; legacy refs; change from header or folder", async () => {
  const docs = await readTaskDocs(APP);
  assert.deepEqual(docs.map((d) => [d.file, d.change, d.archived]), [[`${CH}/tasks.md`, "feat-password-reset", false], [`${AR}/tasks.md`, "feat-2fa", true]]);
  const t12 = docs[0].tasks[0];
  assert.deepEqual([t12.change, t12.archived, t12.changeDir, t12.planning], ["feat-password-reset", false, CH, null]);
  assert.deepEqual(t12.acs.map((a) => a.reqs), [["ACC-R5.S1"], ["ACC-R5.S2"]]);
  const md = (head, ac) => `# X Tasks\n${head}\n> status: draft\n\n## T-1 A\n- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo\n\n### Acceptance criteria\n${ac}\n`;
  let d = parseTasksMd(md("← Change: feat-x", "- [ ] T-1.AC1 (ACC-R5.S1, ACC-BR1, ACC-UC2, ACC-R3) Given a When b Then c"), ".hitl/tasks/feat-x.md");
  assert.deepEqual([d.change, d.tasks[0].change, d.tasks[0].acs[0].reqs], ["feat-x", "feat-x", ["ACC-R5.S1", "ACC-BR1", "ACC-UC2", "ACC-R3"]]);
  d = parseTasksMd(md("← Planning: .hitl/planning/feat-x.md", "- [ ] T-1.AC1 (R-1, R-2) Given a When b Then c"), ".hitl/tasks/feat-x.md");
  assert.deepEqual([d.change, d.planning, d.tasks[0].acs[0].reqs], [null, ".hitl/planning/feat-x.md", ["R-1", "R-2"]]);
  d = parseTasksMd(md("← Change: none", "- [ ] T-1.AC1 Given a When b Then c"), ".hitl/tasks/quick-x.md");
  assert.equal(d.change, null);
  d = parseTasksMd(md("", "- [ ] T-1.AC1 Given a When b Then c"), `${CH}/tasks.md`);
  assert.equal(d.change, "feat-password-reset", "folder implies the change");
  d = parseTasksMd(md("← Change: feat-x", "- [ ] T-1.AC1 (acc-r1) Given a When b Then c"), ".hitl/tasks/feat-x.md");
  assert.match(d.tasks[0].parseErrors.join(), /malformed AC ref \(acc-r1\)/);
});

test("checkTasks resolves change task refs through the effective view and design.md", async () => {
  const root = copyApp();
  assert.deepEqual(await checkTasks(root, await readTasks(root), null), []);
  const f = path.join(root, CH, "tasks.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8")
    .replace("T-13.AC1 (ACC-R6.S1)", "T-13.AC1 (ACC-R2.S1, ACC-R9.S1, R-1)")
    .replace("**Why**: single-use hashed token (D-1)", "**Why**: single-use hashed token (D-1, D-9)"));
  const msgs = (await checkTasks(root, await readTasks(root), null)).map((e) => e.message).join("\n");
  assert.match(msgs, /T-13\.AC1 references ACC-R2\.S1 which feat-password-reset removes/);
  assert.match(msgs, /T-13\.AC1 references unknown ACC-R9\.S1/);
  assert.match(msgs, /T-13\.AC1 references legacy R-1/);
  assert.match(msgs, /\*\*Why\*\* references unknown D-9 \(not in \.hitl\/changes\/feat-password-reset\/design\.md\)/);
});

test("trace hitl.trace/2 on a change: coverage of ADDED/MODIFIED scenarios, decisions, rows, changes", async () => {
  const inputs = await loadTraceInputs(APP, {});
  const tr = buildTrace(inputs, { kind: "all" });
  assert.equal(tr.schema, "hitl.trace/2");
  assert.deepEqual(only(tr, "SCN_NO_AC"), ["warn:SCN_NO_AC:ACC-R1.S1", "warn:SCN_NO_AC:ACC-R1.S2", "warn:SCN_NO_AC:ACC-R1.S3"]);
  assert.deepEqual(only(tr, "REQ_NO_AC"), ["warn:REQ_NO_AC:ACC-R1"]);
  assert.deepEqual(only(tr, "REQ_NO_DEC"), ["info:REQ_NO_DEC:ACC-R6"]);
  assert.deepEqual(only(tr, "DEC_UNUSED"), ["info:DEC_UNUSED:D-2"]);
  assert.equal(tr.counts.block, 0);
  const it = tr.items.find((i) => i.code === "SCN_NO_AC");
  assert.deepEqual([it.change, it.planning, it.capability], ["feat-password-reset", "feat-password-reset", "accounts"]);
  assert.deepEqual(tr.changes.map((c) => [c.id, c.archived, c.requirements]), [["feat-2fa", true, 1], ["feat-password-reset", false, 3]]);
  const r5 = tr.rows.find((r) => r.req?.id === "ACC-R5");
  assert.deepEqual([r5.change, r5.capability, r5.req.origin, r5.req.priority, r5.req.title], ["feat-password-reset", "accounts", "added", "must", "Reset password by email"]);
  assert.deepEqual(r5.scenarios.map((s) => [s.id, s.acs.map((a) => a.id)]), [["ACC-R5.S1", ["T-12.AC1"]], ["ACC-R5.S2", ["T-12.AC2"]]]);
  assert.deepEqual(tr.summary.scenarios, { total: 7, withAc: 4, tested: 0, proven: 0 });
  assert.deepEqual(tr.decisions.map((d) => [d.change, d.id, d.tasks]), [["feat-password-reset", "D-1", ["T-12"]], ["feat-password-reset", "D-2", []]]);
  const md = renderTraceMd(tr);
  assert.match(md, /# Trace — feat-password-reset \(change active · proposal approved · R 3 · S 6 · D 2\)/);
  assert.match(md, /\| ACC-R5 must \(added\) \| ACC-R5\.S1 \| T-12\.AC1 \| — \| — \|/);
  assert.match(md, /# Trace — feat-2fa \(change archived/);
});

test("trace codes: AC_REQ_LEVEL, REQ_INACTIVE, SCN_UNKNOWN, RULE_UNKNOWN, SPEC_STALE, CHANGE_MISSING, legacy R-n in a change", async () => {
  const base = await loadTraceInputs(APP, {});
  const mut = (fn) => { const b = { ...base, tasks: structuredClone(base.tasks) }; fn(b.tasks); return buildTrace(b, { kind: "all" }); };
  const setRefs = (id, refs) => (tasks) => { byId(tasks, id).acs[0].reqs = refs; };
  assert.deepEqual(only(mut(setRefs("T-13", ["ACC-R6"])), "AC_REQ_LEVEL"), ["info:AC_REQ_LEVEL:T-13.AC1"]);
  assert.deepEqual(only(mut(setRefs("T-13", ["ACC-R2.S1"])), "REQ_INACTIVE"), ["block:REQ_INACTIVE:ACC-R2.S1"], "removed by its own change");
  assert.deepEqual(only(mut(setRefs("T-13", ["ACC-R4"])), "REQ_INACTIVE"), ["block:REQ_INACTIVE:ACC-R4"], "retired earlier");
  assert.deepEqual(only(mut(setRefs("T-13", ["ACC-R6.S9"])), "SCN_UNKNOWN"), ["block:SCN_UNKNOWN:ACC-R6.S9"]);
  assert.deepEqual(only(mut(setRefs("T-13", ["ACC-BR7"])), "RULE_UNKNOWN"), ["block:RULE_UNKNOWN:ACC-BR7"]);
  assert.deepEqual(only(mut(setRefs("T-13", ["R-1"])), "REQ_UNKNOWN"), ["block:REQ_UNKNOWN:R-1"]);
  // archived T-10 (done in the lock) refs an id a later change retired → SPEC_STALE warn; not done → block
  assert.deepEqual(only(mut(setRefs("T-10", ["ACC-R4"])), "SPEC_STALE"), ["warn:SPEC_STALE:ACC-R4"]);
  const nd = { ...base, tasks: structuredClone(base.tasks), statuses: structuredClone(base.statuses) };
  byId(nd.tasks, "T-10").acs[0].reqs = ["ACC-R4"]; nd.statuses.tasks["T-10"].status = "wip";
  assert.deepEqual(only(buildTrace(nd, { kind: "all" }), "SPEC_STALE"), ["block:SPEC_STALE:ACC-R4"]);
  const gone = mut((ts) => { const t = byId(ts, "T-13"); t.change = "feat-gone"; t.changeDir = null; });
  assert.deepEqual(only(gone, "CHANGE_MISSING"), ["block:CHANGE_MISSING:feat-gone"]);
  assert.ok(gone.changes.some((c) => c.id === "feat-gone" && !c.exists));
});

test("trace scopes: change id, task, capability RTM", async () => {
  const inputs = await loadTraceInputs(APP, {});
  const tc = buildTrace(inputs, { kind: "change", id: "feat-password-reset" });
  assert.deepEqual(tc.scope, { kind: "change", id: "feat-password-reset" });
  assert.equal(tc.summary.tasks, 2);
  assert.ok(!tc.items.some((i) => i.task === "T-10"));
  const tt = buildTrace(inputs, { kind: "task", id: "T-12" });
  assert.deepEqual(tt.rows.map((r) => r.req?.id), ["ACC-R5"]);
  assert.deepEqual(only(tt, "SCN_NO_AC"), [], "task scope has no change-level checks");
  const cap = buildTrace(inputs, { kind: "capability", id: "accounts" });
  assert.deepEqual(cap.rows.map((r) => `${r.req.id}:${r.change ?? "living"}`),
    ["ACC-R1:living", "ACC-R2:living", "ACC-R3:living", "ACC-R1:feat-password-reset", "ACC-R5:feat-password-reset", "ACC-R6:feat-password-reset"]);
  assert.deepEqual(cap.rows.find((r) => r.req.id === "ACC-R3").scenarios[0].acs.map((a) => a.id), ["T-10.AC1"], "archived tasks feed the living rows");
  assert.match(renderTraceMd(cap), /^# Trace — capability accounts \(R 6 · scenarios 10\)/);
});

test("specLinksFor a change task: spec block with change, capability, design, scenario-level requirements", async () => {
  const S = "src/reset.ts#ResetService.request", T = "tests/reset.test.ts#reset > T-12.AC1 sends";
  const index = { symbols: {
    [S]: { id: S, name: "ResetService.request", file: "src/reset.ts", kind: "method", callers: [], callees: [], bodyHash: "b", tags: { task: ["T-12"], dec: ["D-1"] } },
    [T]: { id: T, name: "reset > T-12.AC1 sends", file: "tests/reset.test.ts", kind: "test", callers: [], callees: [], bodyHash: "t",
      tags: { ac: ["T-12.AC1"], covers: ["ResetService.request"], task: [], dec: [] }, test: { titlePath: ["reset", "T-12.AC1 sends"], mode: "active", coversResolved: [S] } },
  }, warnings: [] };
  const inputs = await loadTraceInputs(APP, {}, { index });
  const sp = specLinksFor(inputs, S);
  assert.deepEqual(sp, { planning: "feat-password-reset", change: "feat-password-reset", archived: false, capability: "accounts", design: `${CH}/design.md`,
    decisions: [{ id: "D-1", text: "Store a hash of the reset token, never the token", status: "accepted", via: "@dec" }],
    requirements: [{ id: "ACC-R5", scenario: "ACC-R5.S1", title: "Reset password by email",
      text: "When a registered user asks to reset their password, the system SHALL send a single-use reset link to the account's email address.", via: "T-12.AC1" }] });
  assert.deepEqual(specLinksFor(inputs, T).requirements.map((r) => r.scenario), ["ACC-R5.S1"]);
});

test("resolveFeature by change id (active first), change folder, tasks path; legacy names still work", async () => {
  const tasks = await readTasks(APP);
  const f = resolveFeature(tasks, "feat-password-reset");
  assert.deepEqual([f.name, f.file, f.change, f.tasks.map((t) => t.id)], ["feat-password-reset", `${CH}/tasks.md`, "feat-password-reset", ["T-12", "T-13"]]);
  assert.equal(resolveFeature(tasks, `${CH}/tasks.md`).name, "feat-password-reset");
  assert.equal(resolveFeature(tasks, CH).name, "feat-password-reset");
  assert.deepEqual(resolveFeature(tasks, "feat-2fa").tasks.map((t) => t.id), ["T-10"]);
  assert.match(resolveFeature(tasks, "feat-nope").error, /no tasks file/);
});

test("computeNext: tasks first, then the active change waiting for its next phase", () => {
  const changes = [{ id: "feat-b", phase: "design" }, { id: "feat-a", phase: "archive-ready" }, { id: "feat-c", phase: "spec" }, { id: "feat-d", phase: "tasks" }];
  assert.deepEqual(computeNext({ tasks: [], statuses: { tasks: {} }, changes }), { task: null, command: "/hitl:archive feat-a", reason: "change feat-a: all tasks done; merge its spec deltas", change: "feat-a" });
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} }, changes: changes.slice(2) }).command, "/hitl:tasks feat-d");
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} }, changes: [changes[0]] }).command, "/hitl:design feat-b");
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} }, changes: [changes[2]] }).command, "/hitl:plan feat-c");
  const t = [{ id: "T-1", prio: "P1", blockedBy: [], risk: "high" }];
  assert.equal(computeNext({ tasks: t, statuses: { tasks: { "T-1": { status: "todo", next: "/hitl:skeleton T-1" } } }, changes }).command, "/hitl:skeleton T-1");
  assert.equal(computeNext({ tasks: t, statuses: { tasks: { "T-1": { status: "done" } } }, changes: [] }).command, "/hitl:plan");
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} }, planning: [{ file: "feat-x.md", status: "approved", hasTasks: false }] }).command, "/hitl:tasks feat-x.md");
});

test("context: AC lines carry the scenario, decisions come from design.md, header names the change", async () => {
  const root = makeProject({
    ".hitl/tasks/feat-users.md": "",
    ".hitl/changes/feat-users/proposal.md": "# Users\n> change: feat-users | status: approved | created: 2026-10-27 | updated: 2026-10-27\n\n## Why\nx\n\n## What changes\n- x\n\n## Capabilities\n| capability | key | change | requirements |\n|---|---|---|---|\n| users | USR | new | +USR-R1 |\n\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| design | included | x |\n",
    ".hitl/changes/feat-users/specs/users/spec.md": "# Delta: Users\n> capability: users | key: USR | change: feat-users\n\n## Purpose\nWho can register.\n\n## ADDED Requirements\n### Requirement: USR-R1 Unique email\nWhen a user registers with an existing email, the system SHALL reject it.\n\n#### Scenario: USR-R1.S1 Duplicate email rejected\n- GIVEN an account with \"a@x.io\"\n- WHEN someone registers \"A@x.io\"\n- THEN the registration is rejected\n",
    ".hitl/changes/feat-users/design.md": "# Design: Users\n> change: feat-users | status: approved | updated: 2026-10-27\n\n## Decisions\n| id | decision | why | alternatives | cost if wrong | serves | status |\n|---|---|---|---|---|---|---|\n| D-1 | Check duplicates in the service | one entry | db unique index | dupes | USR-R1 | accepted |\n",
    ".hitl/changes/feat-users/tasks.md": "# Users Tasks\n← Change: feat-users\n> status: approved\n\n## T-1 Register user\n- prio: P1 | risk: high (security) | impl: mixed | blocked-by: none | status: todo\n**Why**: dup check (D-1)\n\n### Acceptance criteria\n- [ ] T-1.AC1 (USR-R1.S1) Given an existing email When createUser Then throws\n\n### Symbols\n1. [ ] `UserService.createUser` | modify | `src/services/userService.ts` | impl: agent | registers\n\n### Test plan\n| ac | kind | oracle | seam | author |\n|----|------|--------|------|--------|\n| AC1 | example | spec | UserService.createUser | test-author |\n",
  });
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "T-1", {});
  assert.match(c.markdown, /task file: \.hitl\/changes\/feat-users\/tasks\.md · change: feat-users/);
  assert.match(c.markdown, /- T-1\.AC1 \(USR-R1\.S1 Duplicate email rejected: GIVEN an account with "a@x\.io" WHEN someone registers "A@x\.io" THEN the registration is rejected\) Given an existing email/);
  assert.match(c.markdown, /## Decisions\n- D-1 \(accepted\): Check duplicates in the service/);
});

test("Linear: change = project (proposal Why/What changes/requirements), change key in issues; legacy map keys read as change ids", async () => {
  const info = await loadChangeInfo(APP, "feat-password-reset");
  assert.deepEqual([info.kind, info.title, info.file, info.requirements.map((r) => r.id)], ["change", "Password reset by email", CH, ["ACC-R5", "ACC-R6", "ACC-R1"]]);
  const map = applyRecord({ map: emptyMap(), plan: null, queue: null, now: "2026-10-27T00:00:00.000Z",
    input: JSON.parse(fs.readFileSync(path.join(PLUGIN, "tests/fixtures/linear/init.json"), "utf8")) }).map;
  const tasks = (await readTaskDocs(APP))[0].tasks;
  const docs = [{ file: `${CH}/tasks.md`, status: "approved", change: "feat-password-reset", planning: null, tasks }];
  const p = buildPlan({ config: { linear: { enabled: true, team: "ENG" } }, map, statuses: { tasks: {} }, docs, reviews: {}, changes: { "feat-password-reset": info }, scope: { kind: "all" } });
  const ens = p.ops.find((o) => o.op === "ensureProject");
  assert.equal(ens.change, "feat-password-reset");
  assert.equal(ens.payload.name, "Password reset by email");
  assert.match(ens.payload.content, /### What changes\n/);
  assert.match(ens.payload.content, /### Requirements\n- ACC-R5 Reset password by email\n- ACC-R6 Set a new password\n- ACC-R1 Sign in/);
  assert.match(ens.payload.content, /Repo: \.hitl\/changes\/feat-password-reset$/);
  const cr = p.ops.find((o) => o.op === "createIssue" && o.task === "T-12");
  assert.match(cr.payload.description, /· change: feat-password-reset\n/);
  assert.match(cr.payload.description, /- \[x\] T-12\.AC1 \(ACC-R5\.S1\)/);
  const m = normalizeMap({ planning: { "feat-x.md": { kind: "project", id: "p1" } }, tasks: { "T-1": { issue: "ENG-1", id: "i1", planning: "feat-x.md" } } });
  assert.deepEqual([m.changes, m.tasks["T-1"].change, "planning" in m, "planning" in m.tasks["T-1"]], [{ "feat-x": { kind: "project", id: "p1" } }, "feat-x", false, false]);
  assert.equal(linearCfg({ linear: { planningAs: "parent-issue" } }).changeAs, "parent-issue");
  assert.equal(linearCfg({ linear: { changeAs: "none", planningAs: "parent-issue" } }).changeAs, "none");
  assert.equal(linearCfg({}).changeAs, "project");
});

test("trace CLI: change id, --capability, legacy planning path", async () => {
  const { spawnSync } = await import("node:child_process");
  const cli = (...a) => spawnSync(process.execPath, [path.join(PLUGIN, "scripts/hitl-index.mjs"), ...a], { cwd: APP, encoding: "utf8" });
  let r = cli("trace", "feat-password-reset", "--json");
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).scope, { kind: "change", id: "feat-password-reset" });
  r = cli("trace", "--capability", "accounts", "--json");
  assert.equal(JSON.parse(r.stdout).scope.kind, "capability");
  assert.equal(cli("trace", "--capability", "nope").status, 1);
  assert.equal(cli("trace", "feat-nope").status, 1);
  assert.equal(cli("trace", "--check", "--json").status, 0, "fixture has no block items");
});
