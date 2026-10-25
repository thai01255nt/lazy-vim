// Fast-lane human override (lock/approve/risk/report/status) + feature-level run (resolve, order, lanes, summary report).
import { test } from "node:test";
import assert from "node:assert/strict";
import { planApproval, emptyLock, isOverride } from "../../scripts/lib/lock.mjs";
import { emptyState } from "../../scripts/lib/state.mjs";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { computeRisk } from "../../scripts/lib/risk.mjs";
import { buildReport } from "../../scripts/lib/report.mjs";
import { resolveFeature, orderTasks, laneOf, actionFor, planFeature, buildFeatureReport, pendingFindings } from "../../scripts/lib/feature.mjs";
import { fixtureIndex, TASKS, IDS } from "./status.test.mjs";

const { CU, FE, T1 } = IDS;
const NOW = "2026-10-25T00:00:00.000Z";
const base = (o) => ({ taskId: "T-1", index: fixtureIndex(), lock: emptyLock(), state: emptyState(), config: {}, task: TASKS[0], tasks: TASKS, now: NOW, ...o });

test("--by human-override: high risk allowed for skeleton/tests, recorded in the lock; never for done; bogus --by refused", () => {
  const sk = planApproval(base({ by: "human-override" }));
  assert.equal(sk.ok, true, sk.reasons.join("; "));
  assert.equal(sk.lock.symbols[CU].approvedBy, "human-override");
  assert.equal(sk.lock.tasks["T-1"].override, true);
  assert.equal(sk.lock.tasks["T-1"].overrideAt, NOW);
  assert.equal(isOverride(sk.lock, "T-1"), true);
  assert.equal(isOverride(sk.lock, "T-2"), false);
  const done = planApproval(base({ by: "human-override", lock: sk.lock, stage: "done" }));
  assert.equal(done.ok, false);
  assert.match(done.reasons[0], /human-override covers skeleton and tests only/);
  assert.equal(planApproval(base({ by: "robot" })).ok, false);
  // a plain human skeleton approval is not an override
  assert.equal(isOverride(planApproval(base({ by: "human" })).lock, "T-1"), false);
  // detection from entries alone (older lock without the task flag)
  assert.equal(isOverride({ symbols: {}, tests: { [T1]: { task: "T-1", lockedBy: "human-override" } }, tasks: {} }, "T-1"), true);
});

test("status exposes override per task; risk forces HUMAN on every symbol; report flags it", () => {
  const sk = planApproval(base({ by: "human-override" }));
  const st = computeStatuses(fixtureIndex(), sk.lock, null, {}, TASKS);
  assert.equal(st.tasks["T-1"].override, true);
  assert.equal(computeStatuses(fixtureIndex(), emptyLock(), null, {}, TASKS).tasks["T-1"].override, false);
  const index = fixtureIndex({ implemented: true });
  const plain = computeRisk({ taskId: "T-1", symbolIds: [FE], index, lock: emptyLock(), state: {}, config: {}, taskRisk: "low" });
  assert.equal(plain.symbols[FE].route, "AUTO");
  assert.equal(plain.override, false);
  const r = computeRisk({ taskId: "T-1", symbolIds: [CU, FE], index, lock: sk.lock, state: {}, config: {}, taskRisk: "low" });
  assert.equal(r.override, true);
  for (const id of [CU, FE]) { assert.equal(r.symbols[id].route, "HUMAN"); assert.ok(r.symbols[id].reasons.includes("human-override (fast lane forced)")); }
  const rep = buildReport({ taskId: "T-1", title: "x", l0: { gates: [], tests: { pass: 1 } }, findings: null, decisions: null, risk: r, statuses: st, lock: sk.lock, index, config: {}, head: "h", now: NOW });
  assert.match(rep.markdown.split("\n")[3], /^⚠️ human-override: the user forced the fast lane/);
  assert.ok(rep.humanRequired >= 2);
  const repPlain = buildReport({ taskId: "T-1", title: "x", l0: { gates: [], tests: { pass: 1 } }, findings: null, decisions: null, risk: plain, statuses: st, lock: emptyLock(), index, config: {}, head: "h", now: NOW });
  assert.ok(!repPlain.markdown.includes("human-override"));
});

const T = (id, o = {}) => ({ id, title: `task ${id}`, file: ".hitl/tasks/feat-x.md", planning: ".hitl/planning/feat-x.md", prio: "P2", risk: "low", riskReasons: [], blockedBy: [], ...o });

test("resolveFeature: tasks path, planning path, bare name; errors list candidates", () => {
  const tasks = [T("T-1"), T("T-2"), T("T-9", { file: ".hitl/tasks/other.md", planning: null })];
  for (const arg of [".hitl/tasks/feat-x.md", ".hitl/planning/feat-x.md", "/abs/x/.hitl/planning/feat-x.md", "feat-x", "feat-x.md"]) {
    const r = resolveFeature(tasks, arg);
    assert.equal(r.name, "feat-x", arg);
    assert.deepEqual(r.tasks.map((t) => t.id), ["T-1", "T-2"]);
  }
  // planning with a differently named tasks file
  const r = resolveFeature([T("T-1", { file: ".hitl/tasks/feat-y.md", planning: ".hitl/planning/feat-z.md" })], "planning/feat-z.md");
  assert.equal(r.name, "feat-y");
  const bad = resolveFeature(tasks, "nope.md");
  assert.match(bad.error, /no tasks file/);
  assert.deepEqual(bad.candidates, [".hitl/tasks/feat-x.md", ".hitl/tasks/other.md"]);
  assert.match(resolveFeature(tasks, "").error, /missing/);
});

test("orderTasks: topological by blocked-by, then prio, then id; external edges ignored; cycles appended", () => {
  const ts = [T("T-1", { prio: "P2" }), T("T-2", { prio: "P0", blockedBy: ["T-3"] }), T("T-3", { prio: "P3" }), T("T-4", { prio: "P1", blockedBy: ["T-99"] })];
  assert.deepEqual(orderTasks(ts).order.map((t) => t.id), ["T-4", "T-1", "T-3", "T-2"]);
  const cyc = orderTasks([T("T-1", { blockedBy: ["T-2"] }), T("T-2", { blockedBy: ["T-1"] }), T("T-3")]);
  assert.deepEqual(cyc.order.map((t) => t.id), ["T-3", "T-1", "T-2"]);
  assert.deepEqual(cyc.cycle, ["T-1", "T-2"]);
});

test("lanes and actions", () => {
  assert.equal(laneOf("low", false), "fast");
  assert.equal(laneOf("high", false), "normal");
  assert.equal(laneOf("high", true), "override");
  assert.equal(laneOf("low", true), "fast", "low risk never needs the override");
  assert.equal(actionFor("todo", "fast"), "implement");
  assert.equal(actionFor("todo", "override"), "implement");
  assert.equal(actionFor("todo", "normal"), "skeleton");
  assert.equal(actionFor("skeleton", "normal"), "approve");
  assert.equal(actionFor("approved", "normal"), "test");
  assert.equal(actionFor("red", "normal", false), "approve-tests");
  assert.equal(actionFor("red", "normal", true), "implement");
  for (const s of ["green", "review", "verified", "done"]) assert.equal(actionFor(s, "normal"), "skip");
});

test("planFeature: skips implemented tasks, stops on block drift, human approvals and external blockers", () => {
  const tasks = [T("T-1", { prio: "P1" }), T("T-2", { risk: "high", riskReasons: ["security"], blockedBy: ["T-1"] }), T("T-3", { blockedBy: ["T-2"] })];
  const feature = { name: "feat-x", file: ".hitl/tasks/feat-x.md", tasks };
  const statuses = { tasks: { "T-1": { status: "green", testsLocked: true }, "T-2": { status: "todo" }, "T-3": { status: "todo" } } };
  const p = planFeature({ feature, statuses });
  assert.deepEqual(p.items.map((i) => [i.id, i.lane, i.action]), [["T-1", "fast", "skip"], ["T-2", "normal", "skeleton"], ["T-3", "fast", "implement"]]);
  assert.equal(p.current.id, "T-2");
  assert.equal(p.phase, "implement");
  assert.equal(p.stop, null);
  const pf = planFeature({ feature, statuses, laneFast: true });
  assert.equal(pf.items[1].lane, "override");
  assert.equal(pf.items[1].action, "implement");
  assert.deepEqual(pf.overrideTasks, ["T-2"]);
  const ap = planFeature({ feature, statuses: { tasks: { ...statuses.tasks, "T-2": { status: "skeleton" } } } });
  assert.equal(ap.phase, "blocked");
  assert.match(ap.stop, /T-2 skeleton waits for the human: \/hitl:approve T-2/);
  const dr = planFeature({ feature, statuses, drift: { items: [{ task: "T-1", level: "block", code: "SIG_CHANGED", symbol: "x" }] } });
  assert.match(dr.stop, /T-1 has 1 block-level drift/);
  const ext = planFeature({ feature: { ...feature, tasks: [T("T-5", { blockedBy: ["T-9"] })] }, statuses: { tasks: { "T-9": { status: "wip" } } } });
  assert.equal(ext.items[0].action, "blocked");
  assert.match(ext.stop, /T-5 waits for T-9/);
  const all = planFeature({ feature, statuses: { tasks: { "T-1": { status: "done" }, "T-2": { status: "verified", override: true }, "T-3": { status: "review" } } } });
  assert.equal(all.phase, "review");
  assert.equal(all.current, null);
  assert.equal(all.items[1].override, true);
});

test("feature summary report: per-task verdict, risk, override, trace, pending findings; worst verdict wins", () => {
  const tasks = [T("T-1"), T("T-2", { risk: "high", riskReasons: ["security"] }), T("T-3")];
  const plan = planFeature({ feature: { name: "feat-x", file: ".hitl/tasks/feat-x.md", tasks },
    statuses: { tasks: { "T-1": { status: "done" }, "T-2": { status: "review", override: true }, "T-3": { status: "green" } } } });
  const F = (key, severity, conf) => ({ key, severity, confidence: conf, verifiedConfidence: conf, keep: conf >= 80, title: key, file: "src/a.ts", line: 3, symbol: "x" });
  const perTask = {
    "T-1": { verdict: "PASS", report: ".hitl/reviews/T-1.review.md", l0: { trace: { counts: { block: 0, warn: 1 } } } },
    "T-2": { verdict: "WITH FIXES", l0: { trace: { counts: { block: 0, warn: 0 } } },
      findings: { findings: [F("a", "critical", 95), F("b", "important", 90), F("c", "minor", 99), F("d", "important", 50)] },
      decisions: { items: { "F-2": { key: "b", decision: "reject" } }, keys: { b: "F-2" } } },
  };
  const r = buildFeatureReport({ plan, perTask, config: {}, now: NOW });
  const L = r.markdown.split("\n");
  assert.equal(L[0], "# Feature feat-x: 3 tasks");
  assert.equal(L[1], "verdict: not reviewed | PASS 1 · WITH FIXES 1 · FAIL 0 · not reviewed 1 | override: 1 | human required: 2");
  assert.match(r.markdown, /\| T-1 \| task T-1 \| low \| — \| done \| PASS \| ⛔ 0 · ⚠️ 1 \| — \|/);
  assert.match(r.markdown, /\| T-2 \| task T-2 \| high \(security\) \| ⚠️ yes \| review \| WITH FIXES \| ⛔ 0 · ⚠️ 0 \| 1 \|/);
  assert.match(r.markdown, /\| T-3 \| task T-3 \| low \| — \| green \| not reviewed \| — \| — \|/);
  assert.match(r.markdown, /- T-2 F-3 \[critical · conf 95\] a — src\/a\.ts:3 → `\/hitl:review T-2 fix F-3`/);
  assert.ok(!/F-2\]|\bb — /.test(r.markdown), "decided finding not pending");
  assert.match(r.markdown, /- T-2: ⚠️ human-override \(fast lane forced; risk: security\)/);
  assert.equal(r.verdict, "not reviewed");
  assert.ok(L.length <= 25, "one screen");
  const fail = buildFeatureReport({ plan, perTask: { ...perTask, "T-3": { verdict: "FAIL" } }, config: {} });
  assert.equal(fail.verdict, "FAIL");
  assert.deepEqual(pendingFindings(perTask["T-2"].findings, perTask["T-2"].decisions, 80).map((x) => x.F), ["F-3"]);
});

test("feature report: security lens suggestion, recorded full audit link, needs_validation card", () => {
  const tasks = [T("T-1"), T("T-2", { risk: "high", riskReasons: ["security"] })];
  const plan = planFeature({ feature: { name: "feat-x", file: ".hitl/tasks/feat-x.md", tasks },
    statuses: { tasks: { "T-1": { status: "green" }, "T-2": { status: "review" } } } });
  const nv = { key: "security-1", lens: "security", severity: "important", verdict: "needs_validation", blocker: "proxy strips X-Forwarded-For?", confidence: 85, verifiedConfidence: 85, keep: true, title: "spoofable client ip", file: "src/a.ts", line: 9, symbol: "x", fixOwner: "human" };
  const perTask = { "T-1": { verdict: "PASS" }, "T-2": { verdict: "WITH FIXES", securityLens: true, findings: { findings: [nv] } } };
  const none = buildFeatureReport({ plan, perTask: { "T-1": { verdict: "PASS" } }, config: {}, now: NOW });
  assert.ok(!none.markdown.includes("## Security audit"), "no section without a security signal");
  const sug = buildFeatureReport({ plan, perTask, config: {}, now: NOW });
  assert.deepEqual(sug.securityLensTasks, ["T-2"]);
  assert.match(sug.markdown, /## Security audit\n- security lens ran: T-2\n- 💡 full six-phase audit \(suggestion, not run\): `\/hitl:review --security-audit \.hitl\/tasks\/feat-x\.md`/);
  assert.match(sug.markdown, /- T-2 F-1 \[needs_validation · conf 85\] spoofable client ip/);
  const done = buildFeatureReport({ plan, perTask, config: {}, now: NOW, securityAudit: { report: "/home/u/security-audit-skill/app/run-1/REPORT.md", at: "2026-10-25T00:00:00Z" } });
  assert.match(done.markdown, /- full audit: \/home\/u\/security-audit-skill\/app\/run-1\/REPORT\.md \(2026-10-25T00:00:00Z\)/);
  assert.ok(!done.markdown.includes("suggestion, not run"));
});
