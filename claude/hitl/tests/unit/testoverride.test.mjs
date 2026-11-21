// 0.20 human override of TEST_PLAN_NONE_RISK: `none!: <reason>` / `manual!: <check> — <reason>` on a task with risk
// security, concurrency or data → a warning instead of the error; the reason is required; status, review report and
// the done approval show it.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseTasksMd } from "../../scripts/lib/tasksmd.mjs";
import { acPlan, checkTestPlan, parseTestCell, testOverrides } from "../../scripts/lib/testplan.mjs";
import { buildReport } from "../../scripts/lib/report.mjs";
import { planApproval, emptyLock } from "../../scripts/lib/lock.mjs";
import { fixtureIndex } from "./status.test.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "../../scripts/hitl-index.mjs");
const cli = (cwd, ...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 }); return { code: r.status, out: r.stdout, json: () => JSON.parse(r.stdout) }; };
const specProject = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-tov-")); fs.cpSync(path.resolve(HERE, "../fixtures/spec-app"), root, { recursive: true }); return root; };

const doc = (rows, { risk = "high (security)", acs = 2 } = {}) => `# Users Tasks

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
const check = (t) => { const warnings = []; return { errors: checkTestPlan(t, warnings), warnings }; };

test("parseTestCell: none!/manual! carry the override and its reason; ! on other decisions is bad", () => {
  assert.deepEqual(parseTestCell("none!: vendor SDK does the signing"), { test: "none", detail: "vendor SDK does the signing", bad: false, override: true, reason: "vendor SDK does the signing" });
  assert.deepEqual(parseTestCell("manual!: log in with a revoked key — no test double for the HSM"), { test: "manual", detail: "log in with a revoked key", bad: false, override: true, reason: "no test double for the HSM" });
  assert.deepEqual(parseTestCell("manual!: log in with a revoked key"), { test: "manual", detail: "log in with a revoked key", bad: false, override: true, reason: null });
  assert.deepEqual(parseTestCell("none!:"), { test: "none", detail: null, bad: false, override: true, reason: null });
  assert.equal(parseTestCell("new!: x").bad, true);
  assert.equal(parseTestCell("covered!: x").bad, true);
  assert.deepEqual(parseTestCell("none: wiring"), { test: "none", detail: "wiring", bad: false }, "plain none unchanged");
});

test("without ! the refusal is unchanged (security, concurrency, data); no warning", () => {
  for (const r of ["security", "concurrency", "data"]) {
    const { errors, warnings } = check(parse(doc(["| AC1 | none: wiring | — | — | — | — |", "| AC2 | manual: by hand | — | — | — | — |"], { risk: `high (${r})` })));
    assert.match(errors.join("\n"), /TEST_PLAN_NONE_RISK: QFLT-T1\.AC1 "none:" is not allowed/);
    assert.match(errors.join("\n"), /TEST_PLAN_NONE_RISK: QFLT-T1\.AC2 "manual:" is not allowed/);
    assert.deepEqual(warnings, []);
  }
  assert.match(checkTestPlan(parse(doc(["| AC1 | none: wiring | — | — | — | —|", "| AC2 | new: x | e | spec | X | test-author |"]))).join(), /TEST_PLAN_NONE_RISK/, "no warnings array: same errors");
});

test("none!/manual! with a reason on a risky task → warning TEST_PLAN_NONE_RISK_OVERRIDE, no error", () => {
  const t = parse(doc(["| AC1 | none!: the vendor SDK signs; no seam to observe | — | — | — | — |", "| AC2 | manual!: log in with a revoked key — no test double for the HSM | — | — | — | — |"], { risk: "high (security, public-api)" }));
  const { errors, warnings } = check(t);
  assert.deepEqual(errors, []);
  assert.equal(warnings.length, 2);
  assert.match(warnings[0], /^TEST_PLAN_NONE_RISK_OVERRIDE: QFLT-T1\.AC1 "none!:" over risk security of QFLT-T1 \(human override: the vendor SDK signs; no seam to observe\)$/);
  assert.match(warnings[1], /^TEST_PLAN_NONE_RISK_OVERRIDE: QFLT-T1\.AC2 "manual!:" over risk security of QFLT-T1 \(human override: no test double for the HSM\)$/);
  assert.deepEqual(testOverrides(t).map((x) => [x.ac, x.test]), [["QFLT-T1.AC1", "none"], ["QFLT-T1.AC2", "manual"]]);
  assert.deepEqual(acPlan(t, "QFLT-T1.AC2").manual, ["log in with a revoked key"], "the check, without the reason");
});

test("! without a reason → error TEST_PLAN_OVERRIDE_NO_REASON; ! on a task without those risks reads as plain none/manual", () => {
  const { errors, warnings } = check(parse(doc(["| AC1 | none!: | — | — | — | — |", "| AC2 | manual!: try it by hand | — | — | — | — |"])));
  assert.match(errors.join("\n"), /TEST_PLAN_OVERRIDE_NO_REASON: QFLT-T1\.AC1 "none!:" needs the human's reason/);
  assert.match(errors.join("\n"), /TEST_PLAN_OVERRIDE_NO_REASON: QFLT-T1\.AC2 "manual!:" needs the human's reason \(write "manual!: <check> — <reason>"\)/);
  assert.equal(errors.length, 2, errors.join("\n"));
  assert.deepEqual(warnings, []);
  const low = parse(doc(["| AC1 | none!: config only | — | — | — | — |", "| AC2 | manual!: looks right — no oracle | — | — | — | — |"], { risk: "high (public-api)" }));
  assert.deepEqual(check(low), { errors: [], warnings: [] });
  assert.deepEqual(testOverrides(low), [], "no override in effect");
});

test("review report lists every overridden AC; done approval lists manual! checks with the reason", () => {
  const l0 = { gates: [{ name: "trace", result: "pass", detail: "" }], tests: { pass: 1 }, drift: { summary: {} },
    trace: { counts: {}, items: [], acs: [{ id: "QT-T1.AC1", reqs: [], proven: true, tests: 1, test: "new" },
      { id: "QT-T1.AC2", reqs: [], proven: false, tests: 0, test: "none", testDetail: "SDK signs", override: "SDK signs" }] } };
  const md = buildReport({ taskId: "QT-T1", l0, findings: { findings: [] }, config: {} }).markdown;
  assert.match(md, /⚠️ test override QT-T1\.AC2 — none! on a security\/concurrency\/data task: SDK signs/);
  const t = parseTasksMd(doc(["| AC1 | new: dup saved | example | spec | X.y | test-author |", "| AC2 | manual!: revoked key refused — no HSM double | — | — | — | — |"]).replace(/QFLT/g, "QT"), ".hitl/tasks/quick-users.md").tasks[0];
  const r = planApproval({ index: fixtureIndex(), lock: emptyLock(), state: {}, config: {}, taskId: "QT-T1", task: t, stage: "done", now: "2026-11-21T00:00:00.000Z", by: "human", force: true });
  assert.deepEqual(r.manual, [{ ac: "QT-T1.AC2", check: "revoked key refused", override: "no HSM double" }]);
});

test("tasks --check: override is a warning (exit 0); status shows ⚠️ test override; trace marks the AC", () => {
  const root = specProject();
  const f = path.join(root, ".hitl/changes/feat-password-reset/tasks.md");
  const text = fs.readFileSync(f, "utf8");
  const head = "### Test plan\n| ac | kind | oracle | seam | author |\n|----|------|--------|------|--------|\n| AC1 | example | spec | reset endpoint | test-author |";
  const at = text.lastIndexOf(head);
  fs.writeFileSync(f, text.slice(0, at) + "### Test plan\n| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | none!: identity provider sets the password — no sandbox | — | — | — | — |" + text.slice(at + head.length));
  const c = cli(root, "tasks", "--check", "--json");
  const j = c.json();
  assert.deepEqual(j.errors, [], JSON.stringify(j.errors));
  assert.equal(c.code, 0);
  assert.match(j.warnings.map((w) => w.message).join(), /TEST_PLAN_NONE_RISK_OVERRIDE: PWR-T2\.AC1 "none!:" over risk security/);
  assert.match(cli(root, "tasks", "--check").out, /⚠️ PWR-T2 TEST_PLAN_NONE_RISK_OVERRIDE/);
  const s = cli(root, "status", "--json").json();
  assert.deepEqual(s.tasks["PWR-T2"].testOverride, ["PWR-T2.AC1"]);
  assert.equal(s.tasks["PWR-T1"].testOverride, undefined);
  // 0.21: no "_Override:_ PWR-T2.AC1 …" question answered Y in a tasks brief → info TEST_OVERRIDE_UNRECORDED, source shown
  assert.match(cli(root, "status").out, /\| PWR-T2 \| [^\n]*\| high ⚠️ test override \(no brief record\) \|/);
  assert.deepEqual(s.tasks["PWR-T2"].testOverrideSource, { "PWR-T2.AC1": null });
  assert.deepEqual(j.info.map((i) => i.code), ["TEST_OVERRIDE_UNRECORDED"]);
  assert.match(cli(root, "tasks", "--check").out, /_Info:_ PWR-T2 TEST_OVERRIDE_UNRECORDED: PWR-T2\.AC1 "none!:" has no/);
  const tr = cli(root, "trace", "feat-password-reset", "--json").json();
  assert.ok(JSON.stringify(tr).includes("AC_TEST_OVERRIDE"), "trace info item");
  assert.ok(tr.items.some((i) => i.code === "TEST_OVERRIDE_UNRECORDED" && i.ref === "PWR-T2.AC1"), "trace info TEST_OVERRIDE_UNRECORDED");
  // the brief record: an `_Override:_` question answered Y in tasks-brief.md → recorded, the source is shown
  fs.writeFileSync(path.join(root, ".hitl/changes/feat-password-reset/tasks-brief.md"), "# Tasks brief — feat-password-reset\n\n> change: feat-password-reset | key: PWR | kind: tasks | status: done | round: 1 | updated: 2026-11-21\n\n## Round 1 ✅\n\n### Q5 _Override:_ PWR-T2.AC1 none!: identity provider sets the password — no sandbox? (needs its own Y)\n\n> Y\n\n→ recorded: PWR-T2.AC1 none!\n");
  assert.deepEqual(cli(root, "status", "--json").json().tasks["PWR-T2"].testOverrideSource, { "PWR-T2.AC1": "tasks-brief.md Q5" });
  assert.deepEqual(cli(root, "tasks", "--check", "--json").json().info, []);
  assert.match(cli(root, "status").out, /\| PWR-T2 \| [^\n]*\| high ⚠️ test override \|/);
  const tr2 = cli(root, "trace", "feat-password-reset", "--json").json();
  assert.ok(!tr2.items.some((i) => i.code === "TEST_OVERRIDE_UNRECORDED"));
  assert.ok(JSON.stringify(tr2).includes('"overrideSource":"tasks-brief.md Q5"'), "the AC row carries its source");
  // 0.21.1: the override bullet under Needs your eye is the record; its source names the bullet
  fs.writeFileSync(path.join(root, ".hitl/changes/feat-password-reset/tasks-brief.md"), "# Tasks brief — feat-password-reset\n\n> change: feat-password-reset | key: PWR | kind: tasks | status: open | round: 2 | updated: 2026-11-21\n\n## Needs your eye\n\n- Override: PWR-T2.AC1 `none!: identity provider sets the password — no sandbox`? (needs its own Y)\n  >\n\n## Notes — change risk, order, prio, add/drop/merge tasks\n\n>\n\n## Approve? (needs its own Y)\n\n>\n");
  assert.deepEqual(cli(root, "status", "--json").json().tasks["PWR-T2"].testOverrideSource, { "PWR-T2.AC1": null }, "no Y yet");
  const bf = path.join(root, ".hitl/changes/feat-password-reset/tasks-brief.md");
  fs.writeFileSync(bf, fs.readFileSync(bf, "utf8").replace("(needs its own Y)\n  >", "(needs its own Y)\n  > Y"));
  assert.deepEqual(cli(root, "status", "--json").json().tasks["PWR-T2"].testOverrideSource, { "PWR-T2.AC1": "tasks-brief.md Override PWR-T2.AC1" });
  assert.deepEqual(cli(root, "tasks", "--check", "--json").json().info, []);
});

test("review report: a test override shows its source, or (no brief record)", () => {
  const l0 = (src) => ({ gates: [], tests: { pass: 1 }, drift: { summary: {} }, trace: { counts: {}, items: [], acs: [{ id: "QT-T1.AC2", reqs: [], proven: false, tests: 0, test: "none", testDetail: "SDK signs", override: "SDK signs", overrideSource: src }] } });
  assert.match(buildReport({ taskId: "QT-T1", l0: l0(null), findings: { findings: [] }, config: {} }).markdown, /⚠️ test override QT-T1\.AC2 — none! on a security\/concurrency\/data task: SDK signs \(no brief record\)/);
  assert.match(buildReport({ taskId: "QT-T1", l0: l0("quick-users-brief.md Q4"), findings: { findings: [] }, config: {} }).markdown, /SDK signs \(quick-users-brief\.md Q4\)/);
});
