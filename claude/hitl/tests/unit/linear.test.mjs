// Unit tests for the Linear mirror (package C): pure plan/record/diff/status + record IO. No network.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LINEAR_DEFAULTS, linearCfg, stateTypeFor, desiredForTask, describeTask, buildPlan, applyRecord, buildDiff, buildStatus,
  ticketsSummary, topoOrder, emptyMap, reviewBody, parseReviewLine, fallbackBranch,
} from "../../scripts/lib/linear.mjs";
import { DEFAULTS } from "../../scripts/lib/config.mjs";
import { h } from "../../scripts/lib/hash.mjs";
import { run as ticketsRun } from "../../scripts/cmd/tickets.mjs";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXI = JSON.parse(fs.readFileSync(path.join(PLUGIN, "tests/fixtures/linear/init.json"), "utf8"));
const FIXR = JSON.parse(fs.readFileSync(path.join(PLUGIN, "tests/fixtures/linear/remote.json"), "utf8"));
const NOW = "2026-10-25T00:00:00.000Z";
const ON = { linear: { enabled: true, team: "ENG" } };
const TF = ".hitl/tasks/feat-x.md";

const initMap = () => applyRecord({ map: emptyMap(), plan: null, queue: null, input: FIXI, now: NOW }).map;
function mkTask(id, o = {}) {
  return { id, title: `Task ${id}`, file: TF, planning: ".hitl/planning/feat-x.md", prio: "P1", risk: "high", riskReasons: ["security"],
    impl: "mixed", blockedBy: [], status: "todo", why: "because (D-1)", decisions: ["D-1"],
    acs: [{ id: `${id}.AC1`, reqs: ["R-1"], text: "Given a When b Then c", done: false }], symbols: [], testPlan: [], parseErrors: [], ...o };
}
function inputs(tasks, statusOf = {}, o = {}) {
  return {
    config: ON, map: initMap(), statuses: { tasks: Object.fromEntries(tasks.map((t) => [t.id, { status: statusOf[t.id] || "skeleton" }])) },
    docs: [{ file: TF, status: "approved", planning: ".hitl/planning/feat-x.md", tasks }],
    reviews: {}, plannings: { "feat-x.md": { file: ".hitl/planning/feat-x.md", title: "Feat X", goal: "Ship X. Then more.", requirements: [{ id: "R-1", priority: "must", text: "When a, b.", status: "active" }], decisions: [{ id: "D-1", decision: "Use Y", status: "accepted" }] } },
    scope: { kind: "all" }, ...o,
  };
}
/** Execute every op of a plan successfully (like the skill would) and record it. */
function pushAll(I, plan, extra = () => ({})) {
  let n = Object.keys(I.map.tasks).length;
  const results = plan.ops.map((o) => {
    if (o.op === "createIssue") { n++; return { opId: o.opId, ok: true, id: `iss-${o.task}`, issue: `ENG-${n}`, url: `https://linear.app/acme/issue/ENG-${n}/x`, ...extra(o) }; }
    if (o.op === "ensureProject") return { opId: o.opId, ok: true, id: "proj-1", url: "https://linear.app/acme/project/x" };
    if (o.op === "upsertComment") return { opId: o.opId, ok: true, commentId: "c-1" };
    return { opId: o.opId, ok: true, ...extra(o) };
  });
  return applyRecord({ map: I.map, plan, queue: null, input: { schema: "hitl.tickets-results/1", kind: "push", planId: plan.planId, results }, now: NOW });
}

describe("linear: defaults and desired state", () => {
  test("LINEAR_DEFAULTS deep-equals config DEFAULTS.linear", (t) => {
    if (!DEFAULTS.linear) { t.skip("DEFAULTS.linear not defined yet (package A)"); return; }
    assert.deepEqual(JSON.parse(JSON.stringify(DEFAULTS.linear)), JSON.parse(JSON.stringify(LINEAR_DEFAULTS)));
  });

  test("status → state type, incl. review/backlog fallbacks", () => {
    const cfg = linearCfg(ON);
    const full = initMap();
    const thin = { ...full, states: { ...full.states, review: null, backlog: null } };
    const exp = { todo: "unstarted", skeleton: "started", approved: "started", red: "started", wip: "started", green: "review", review: "review", verified: "review", done: "completed" };
    for (const [s, t] of Object.entries(exp)) assert.equal(stateTypeFor(s, cfg, full), t, s);
    assert.equal(stateTypeFor("green", cfg, thin), "started");
    const bl = linearCfg({ linear: { enabled: true, pushTodoAs: "backlog" } });
    assert.equal(stateTypeFor("todo", bl, full), "backlog");
    assert.equal(stateTypeFor("todo", bl, thin), "unstarted");
  });

  test("priority, labels per config, marker, byte-stable description and contentHash", () => {
    const map = initMap();
    const task = mkTask("T-1");
    const d1 = desiredForTask(task, "red", linearCfg(ON), map, { planningKey: "feat-x.md" });
    assert.equal(d1.priority, 2);
    assert.equal(desiredForTask({ ...task, prio: "P0" }, "red", linearCfg(ON), map).priority, 1);
    assert.equal(desiredForTask({ ...task, prio: "P3" }, "red", linearCfg(ON), map).priority, 4);
    assert.deepEqual(d1.labels, ["impl:mixed", "risk:high"]);
    assert.deepEqual(d1.labelIds, ["lb-impl-mixed", "lb-risk-high"]);
    assert.equal(d1.stateId, "st-progress");
    // v4 ticket format: Why + risk reasons, ACs as plain bullets, marker + footer last; no prio/impl/change text line
    assert.ok(d1.description.startsWith("**Why**: because (D-1)\nRisk reasons: security\n\n### Acceptance criteria\n"));
    assert.ok(d1.description.includes("\n- T-1.AC1 (R-1) Given a When b Then c\n"));
    assert.ok(!d1.description.includes("- [ ]"));
    assert.ok(!/prio: |impl: |change: /.test(d1.description));
    assert.ok(d1.description.includes(`\n<!-- hitl:task=T-1 file=${TF} -->\n_Managed by hitl — edit ${TF} in the repo, not this issue._`));
    assert.ok(!/src\//.test(d1.description));
    const d2 = desiredForTask(structuredClone(task), "red", linearCfg(ON), map, { planningKey: "feat-x.md" });
    assert.equal(d1.description, d2.description);
    assert.equal(d1.contentHash, d2.contentHash);
    // phase labels: only when enabled and an id exists; missing id → warning
    const warnings = new Set();
    const ph = desiredForTask(task, "red", linearCfg({ linear: { enabled: true, labels: { risk: false, impl: false, phase: true } } }), map, { warnings });
    assert.deepEqual(ph.labels, []);
    assert.ok([...warnings][0].includes("hitl:red"));
    const pre = desiredForTask(task, "red", linearCfg({ linear: { enabled: true, titlePrefix: true } }), map);
    assert.equal(pre.title, "T-1 · Task T-1");
    assert.equal(describeTask({ ...task, why: null, acs: [] }, null).split("\n")[0], "**Why**: —");
    assert.ok(!describeTask({ ...task, risk: "low" }, null).includes("Risk reasons"));
  });

  test("topological order: blockers first, ties by prio then id", () => {
    const ts = [mkTask("T-3", { blockedBy: ["T-2"] }), mkTask("T-2", { prio: "P2" }), mkTask("T-10", { prio: "P0" }), mkTask("T-4", { prio: "P2" })];
    assert.deepEqual(topoOrder(ts), ["T-10", "T-2", "T-3", "T-4"]);
  });
});

describe("linear: plan", () => {
  test("disabled → no ops; unconfigured → warning", () => {
    const I = inputs([mkTask("T-1")]);
    const off = buildPlan({ ...I, config: {} });
    assert.equal(off.enabled, false); assert.deepEqual(off.ops, []);
    const unc = buildPlan({ ...I, map: emptyMap() });
    assert.equal(unc.configured, false); assert.deepEqual(unc.ops, []);
    assert.deepEqual(unc.warnings, ["run /hitl:tickets init"]);
  });

  test("draft tasks file skipped; quick tasks only with pushQuick", () => {
    const I = inputs([mkTask("T-1")]);
    I.docs[0].status = "draft";
    const p = buildPlan(I);
    assert.equal(p.ops.length, 0);
    assert.deepEqual(p.skipped, [{ task: "T-1", reason: "tasks file draft" }]);
    const Q = inputs([mkTask("T-2", { planning: "none" })], {}, { config: { linear: { enabled: true, pushQuick: false } } });
    Q.docs[0] = { file: ".hitl/tasks/quick-a.md", status: "approved", planning: "none", tasks: Q.docs[0].tasks };
    assert.equal(buildPlan(Q).skipped[0].reason, "quick task (pushQuick off)");
  });

  test("first push: project + gated creates in topological order; idempotent after record", () => {
    const I = inputs([mkTask("T-2", { blockedBy: ["T-1"], prio: "P0" }), mkTask("T-1")]);
    const p = buildPlan(I);
    assert.deepEqual(p.ops.map((o) => o.op), ["ensureProject", "createIssue", "createIssue"]);
    assert.deepEqual(p.ops.slice(1).map((o) => o.task), ["T-1", "T-2"]);
    assert.ok(p.ops.slice(1).every((o) => o.needsGate && o.reason === "first push of tasks/feat-x.md"));
    assert.equal(p.ops[0].payload.summary, "Ship X.");
    assert.ok(p.ops[0].payload.content.includes("- R-1 [must] When a, b.") && p.ops[0].payload.content.includes("- D-1 Use Y"));
    assert.deepEqual(buildPlan(I), p, "deterministic");
    const r1 = pushAll(I, p);
    assert.equal(r1.out.applied, 3);
    assert.equal(r1.out.replan, true, "T-2's relation was deferred");
    assert.equal(r1.map.tasks["T-1"].pushed.projectId, "proj-1", "project id picked up from ensureProject in the same batch");
    assert.equal(r1.map.tasks["T-1"].branch, "eng-1-task-t-1");
    const I2 = { ...I, map: r1.map };
    const p2 = buildPlan(I2);
    assert.deepEqual(p2.ops.map((o) => [o.op, o.task]), [["addRelations", "T-2"]]);
    assert.deepEqual(p2.ops[0].payload.blockedBy, [{ task: "T-1", id: "iss-T-1", issue: "ENG-1" }]);
    const r2 = pushAll(I2, p2);
    assert.equal(r2.out.replan, false);
    assert.deepEqual(buildPlan({ ...I, map: r2.map }).ops, []);
  });

  test("content change → one updateIssue with only changed fields; state + labels", () => {
    const I = inputs([mkTask("T-1")]);
    I.map = pushAll(I, buildPlan(I)).map;
    const t2 = mkTask("T-1", { acs: [{ id: "T-1.AC1", reqs: ["R-1"], text: "Given a When b Then d", done: false }] });
    const p = buildPlan({ ...I, docs: [{ ...I.docs[0], tasks: [t2] }] });
    assert.equal(p.ops.length, 1);
    assert.equal(p.ops[0].op, "updateIssue");
    assert.deepEqual(Object.keys(p.ops[0].payload.fields).sort(), ["description", "title"]);
    assert.equal(p.ops[0].needsGate, false);
    const p2 = buildPlan({ ...I, statuses: { tasks: { "T-1": { status: "green" } } } });
    assert.deepEqual(p2.ops[0].payload.fields, { stateId: "st-review" });
    assert.equal(p2.ops[0].payload.expect.stateType, "started");
    assert.match(p2.ops[0].reason, /state started→review/);
    const p3 = buildPlan({ ...I, docs: [{ ...I.docs[0], tasks: [mkTask("T-1", { impl: "agent", prio: "P2" })] }] });
    const u = p3.ops[0];
    assert.equal(u.payload.fields.priority, 3);
    assert.deepEqual(u.payload.labels, { add: ["lb-impl-agent"], remove: ["lb-impl-mixed"] });
    // conflict: skill kept the remote state → no state op again until desired changes
    const r = pushAll({ ...I }, p2, () => ({ skippedFields: ["stateId"] }));
    assert.deepEqual(buildPlan({ ...I, map: r.map, statuses: { tasks: { "T-1": { status: "green" } } } }).ops, []);
  });

  test("completed → not done gives a separate gated reopen op", () => {
    const I = inputs([mkTask("T-1")], { "T-1": "done" });
    I.map = pushAll(I, buildPlan(I)).map;
    assert.equal(I.map.tasks["T-1"].pushed.stateType, "completed");
    const p = buildPlan({ ...I, statuses: { tasks: { "T-1": { status: "red" } } } });
    const reopen = p.ops.filter((o) => o.needsGate);
    assert.equal(reopen.length, 1);
    assert.match(reopen[0].reason, /^reopen: Linear completed, hitl red/);
    assert.deepEqual(reopen[0].payload.fields, { stateId: "st-progress" });
  });

  test("removed task → gated cancel; re-added → gated un-cancel", () => {
    const I = inputs([mkTask("T-1"), mkTask("T-2")]);
    I.map = pushAll(I, buildPlan(I)).map;
    const gone = { ...I, docs: [{ ...I.docs[0], tasks: [mkTask("T-1")] }] };
    const p = buildPlan(gone);
    assert.deepEqual(p.ops.map((o) => [o.op, o.task, o.needsGate]), [["cancelIssue", "T-2", true]]);
    assert.equal(p.ops[0].payload.stateId, "st-canceled");
    assert.equal(buildPlan({ ...gone, scope: { kind: "tasks", ids: ["T-1"] } }).ops.length, 0, "cancel only in scope all");
    const r = pushAll(gone, p);
    assert.equal(r.map.tasks["T-2"].removed, true);
    const back = buildPlan({ ...I, map: r.map });
    assert.equal(back.ops[0].op, "updateIssue");
    assert.equal(back.ops[0].needsGate, true);
    assert.match(back.ops[0].reason, /un-cancel/);
    const r2 = pushAll({ ...I, map: r.map }, back);
    assert.equal(r2.map.tasks["T-2"].removed, false);
    assert.deepEqual(buildPlan({ ...I, map: r2.map }).ops, []);
  });

  test("relation removed locally → manualNote; recorded note drops it", () => {
    const I = inputs([mkTask("T-1"), mkTask("T-2", { blockedBy: ["T-1"] })]);
    let m = pushAll(I, buildPlan(I)).map;
    m = pushAll({ ...I, map: m }, buildPlan({ ...I, map: m })).map;
    assert.deepEqual(m.tasks["T-2"].pushed.relations, ["T-1"]);
    const J = { ...I, map: m, docs: [{ ...I.docs[0], tasks: [mkTask("T-1"), mkTask("T-2")] }] };
    const p = buildPlan(J);
    assert.deepEqual(p.ops.map((o) => o.op), ["manualNote"]);
    assert.equal(p.ops[0].payload.message, "remove relation ENG-2 blocked by ENG-1 by hand (MCP cannot delete relations)");
    assert.deepEqual(buildPlan({ ...J, map: pushAll(J, p).map }).ops, []);
  });

  test("review comment only when the body hash changes", () => {
    const I = inputs([mkTask("T-1")]);
    I.map = pushAll(I, buildPlan(I)).map;
    const md = "# Review T-1\nverdict: PASS | risk: 0.40 (medium) | human required: 0 | head: abc123\n";
    const rv = { "T-1": { ...parseReviewLine(md), report: ".hitl/reviews/T-1.review.md" } };
    assert.equal(reviewBody("T-1", rv["T-1"]), "hitl review: PASS · human required: 0 · head: abc123 · report: reviews/T-1.review.md");
    const p = buildPlan({ ...I, reviews: rv });
    assert.deepEqual(p.ops.map((o) => o.op), ["upsertComment"]);
    assert.equal(p.ops[0].payload.commentId, null);
    const m = pushAll(I, p).map;
    assert.deepEqual(m.tasks["T-1"].comments.review, { id: "c-1", hash: h(p.ops[0].payload.body) });
    assert.deepEqual(buildPlan({ ...I, map: m, reviews: rv }).ops, []);
    const rv2 = { "T-1": { ...rv["T-1"], verdict: "FAIL" } };
    const p2 = buildPlan({ ...I, map: m, reviews: rv2 });
    assert.equal(p2.ops[0].payload.commentId, "c-1");
    assert.equal(p2.ops[0].reason, "review verdict changed");
    assert.deepEqual(buildPlan({ ...I, map: m, reviews: rv2, config: { linear: { enabled: true, reviewComment: false } } }).ops, []);
  });

  test("maxCreatePerPush gates every create (also on a non-first push)", () => {
    const I = inputs([mkTask("T-1")]);
    I.map = pushAll(I, buildPlan(I)).map;
    const more = { ...I, config: { linear: { enabled: true, maxCreatePerPush: 1 } }, docs: [{ ...I.docs[0], tasks: [mkTask("T-1"), mkTask("T-2"), mkTask("T-3")] }] };
    const p = buildPlan(more);
    const creates = p.ops.filter((o) => o.op === "createIssue");
    assert.equal(creates.length, 2);
    assert.ok(creates.every((o) => o.needsGate));
    assert.ok(p.warnings.some((w) => /maxCreatePerPush/.test(w)));
    assert.ok(buildPlan({ ...more, config: ON }).ops.every((o) => !o.needsGate), "not first push, under the cap → no gate");
  });
});

describe("linear: record", () => {
  test("init writes header and keeps entries; invalid input throws code 1", () => {
    const m = initMap();
    assert.equal(m.team.key, "ENG");
    m.tasks["T-1"] = { issue: "ENG-1", id: "x" };
    const again = applyRecord({ map: m, plan: null, queue: null, input: FIXI, now: NOW }).map;
    assert.equal(again.tasks["T-1"].issue, "ENG-1");
    assert.throws(() => applyRecord({ map: m, input: { schema: "nope" } }), (e) => e.code === 1);
    assert.throws(() => applyRecord({ map: m, input: { schema: "hitl.tickets-results/1", kind: "init", init: { team: { key: "ENG" } } } }), (e) => e.code === 1);
  });

  test("planId mismatch → error; failures and unreachable → queue; success clears it", () => {
    const I = inputs([mkTask("T-1")]);
    const p = buildPlan(I);
    const base = { schema: "hitl.tickets-results/1", kind: "push" };
    assert.throws(() => applyRecord({ map: I.map, plan: p, input: { ...base, planId: "other", results: [] }, now: NOW }), /plan changed/);
    const un = applyRecord({ map: I.map, plan: p, queue: null, input: { ...base, planId: p.planId, unreachable: { reason: "MCP not connected" } }, now: NOW });
    assert.equal(un.queue.items.length, 2);
    assert.equal(un.out.queued, 2);
    assert.match(un.queue.items[0].error, /^unreachable: MCP not connected/);
    const again = applyRecord({ map: I.map, plan: p, queue: un.queue, input: { ...base, planId: p.planId, unreachable: { reason: "x" } }, now: NOW });
    assert.equal(again.queue.items.length, 2, "dedup by op+task");
    const part = applyRecord({ map: I.map, plan: p, queue: un.queue, now: NOW, input: { ...base, planId: p.planId, results: [
      { opId: p.ops[0].opId, ok: true, id: "proj-1" }, { opId: p.ops[1].opId, ok: false, error: "rate limited" }] } });
    assert.equal(part.out.applied, 1); assert.equal(part.out.failed, 1);
    assert.deepEqual(part.queue.items.map((x) => [x.op, x.error]), [["createIssue", "rate limited"]]);
    const ok = pushAll({ ...I }, p);
    assert.equal(ok.queue.items.length, 0);
    assert.equal(ok.map.tasks["T-1"].pushed.descHash, h(p.ops[1].payload.description));
  });

  test("descHash uses the description Linear returns", () => {
    const I = inputs([mkTask("T-1")]);
    const p = buildPlan(I);
    const r = pushAll(I, p, (o) => (o.op === "createIssue" ? { description: "normalized by linear" } : {}));
    assert.equal(r.map.tasks["T-1"].pushed.descHash, h("normalized by linear"));
  });

  test("CLI record: exit 1 on planId mismatch (inbox file kept), queue file written, inbox deleted on success", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-linear-"));
    const P = (r) => path.join(root, ".hitl", r);
    fs.mkdirSync(P("index"), { recursive: true }); fs.mkdirSync(P(".inbox"), { recursive: true });
    fs.writeFileSync(P("hitl.config.json"), JSON.stringify({ schema: "hitl.config/1", ...ON }));
    const I = inputs([mkTask("T-1")]);
    const plan = buildPlan(I);
    fs.writeFileSync(P("linear.map.json"), JSON.stringify(I.map));
    fs.writeFileSync(P("index/linear.plan.json"), JSON.stringify(plan));
    const ctx = { root, config: ON, json: true };
    const log = console.log; const out = []; console.log = (s) => out.push(String(s));
    try {
      fs.writeFileSync(P(".inbox/tickets-push.json"), JSON.stringify({ schema: "hitl.tickets-results/1", kind: "push", planId: "bad", results: [] }));
      await assert.rejects(ticketsRun(["record", "--in", ".hitl/.inbox/tickets-push.json"], ctx), (e) => e.code === 1 && /plan changed/.test(e.message));
      assert.ok(fs.existsSync(P(".inbox/tickets-push.json")));
      fs.writeFileSync(P(".inbox/tickets-push.json"), JSON.stringify({ schema: "hitl.tickets-results/1", kind: "push", planId: plan.planId, unreachable: { reason: "offline" } }));
      assert.equal(await ticketsRun(["record", "--in", ".hitl/.inbox/tickets-push.json"], ctx), 0);
      assert.ok(!fs.existsSync(P(".inbox/tickets-push.json")));
      const q = JSON.parse(fs.readFileSync(P("index/linear.queue.json"), "utf8"));
      assert.equal(q.schema, "hitl.linear-queue/1"); assert.equal(q.items.length, 2);
      assert.equal(JSON.parse(out.at(-1)).queued, 2);
      await assert.rejects(ticketsRun(["bogus"], ctx), (e) => e.usage === true);
    } finally { console.log = log; }
  });
});

describe("linear: diff", () => {
  const pushedOne = () => {
    const I = inputs([mkTask("T-1")]);
    const p = buildPlan(I);
    const m = pushAll(I, p, (o) => (o.op === "createIssue" ? { id: "issue-uuid-1", issue: "ENG-1" } : {})).map;
    return { I, m, desc: p.ops[1].payload.description };
  };
  test("fixture: DONE_EARLY, priority + description drift, UNMAPPED; custom labels ignored", () => {
    const { I, m } = pushedOne();
    const { out } = buildDiff({ config: ON, map: m, remote: FIXR, statuses: I.statuses, localTasks: [mkTask("T-1")] });
    const codes = out.items.map((i) => `${i.code}:${i.field}`);
    assert.ok(codes.includes("LINEAR_DONE_EARLY:state"));
    assert.ok(codes.includes("LINEAR_DRIFT:priority"));
    assert.ok(codes.includes("LINEAR_DRIFT:description"));
    assert.ok(!codes.includes("LINEAR_DRIFT:labels"));
    assert.ok(codes.includes("LINEAR_UNMAPPED:null"));
    assert.deepEqual(out.remote["T-1"], { assignee: "Thai", cycle: "Cycle 12", state: "Done" });
    assert.deepEqual(out.relink, [], "T-7 is not a local task");
    assert.ok(codes.includes("LINEAR_DRIFT:title")); // fixture title differs from "Task T-1"
    assert.deepEqual(out.counts, { warn: 4, info: 1 });
  });
  test("per-field drift; MISSING only with complete; relink writes map", () => {
    const { I, m, desc } = pushedOne();
    const issue = { id: "issue-uuid-1", identifier: "ENG-1", title: "Renamed", description: desc, priority: 2,
      state: { id: "st-todo", name: "Todo", type: "unstarted" }, labels: [{ id: "lb-risk-high", name: "risk:high" }] };
    const { out } = buildDiff({ config: ON, map: m, remote: { schema: "hitl.tickets-remote/1", issues: [issue] }, statuses: I.statuses, localTasks: [] });
    assert.deepEqual(out.items.map((i) => i.field).sort(), ["labels", "state", "title"]);
    const none = buildDiff({ config: ON, map: m, remote: { schema: "hitl.tickets-remote/1", issues: [] }, statuses: I.statuses, localTasks: [] }).out;
    assert.equal(none.items.length, 0);
    const miss = buildDiff({ config: ON, map: m, remote: { schema: "hitl.tickets-remote/1", complete: true, issues: [] }, statuses: I.statuses, localTasks: [] }).out;
    assert.deepEqual(miss.items.map((i) => i.code), ["LINEAR_MISSING"]);
    // relink: map lost T-7's entry, remote carries the marker, T-7 exists locally
    const t7 = mkTask("T-7", { file: ".hitl/tasks/other.md", planning: "none" });
    const r = buildDiff({ config: ON, map: m, remote: FIXR, statuses: I.statuses, localTasks: [mkTask("T-1"), t7], relink: true });
    assert.deepEqual(r.out.relink, [{ task: "T-7", issue: "ENG-9", id: "issue-uuid-9", url: "https://linear.app/acme/issue/ENG-9/other", branch: "eng-9-something-else" }]);
    assert.equal(r.map.tasks["T-7"].id, "issue-uuid-9");
    assert.deepEqual(r.map.tasks["T-7"].pushed, {});
    assert.throws(() => buildDiff({ config: ON, map: m, remote: { schema: "x" } }), (e) => e.code === 1);
    // relinked task → next plan re-syncs all fields via updateIssue (no create)
    const J = { ...I, map: r.map, docs: [...I.docs, { file: ".hitl/tasks/other.md", status: "approved", planning: "none", tasks: [t7] }],
      statuses: { tasks: { ...I.statuses.tasks, "T-7": { status: "todo" } } } };
    const p = buildPlan(J).ops.filter((o) => o.task === "T-7");
    assert.deepEqual(p.map((o) => o.op), ["updateIssue"]);
    assert.ok(["title", "description", "priority", "stateId"].every((k) => k in p[0].payload.fields));
  });
});

describe("linear: status and summary", () => {
  test("synced flags, reasons and prLine", () => {
    const I = inputs([mkTask("T-1"), mkTask("T-2")]);
    const m = pushAll({ ...I, docs: [{ ...I.docs[0], tasks: [mkTask("T-1")] }] }, buildPlan({ ...I, docs: [{ ...I.docs[0], tasks: [mkTask("T-1")] }] })).map;
    const st = buildStatus({ config: ON, map: m, docs: I.docs, statuses: { tasks: { "T-1": { status: "verified" }, "T-2": { status: "todo" } } }, queue: { items: [{}] }, branch: "eng-1-x" });
    const [t1, t2] = st.tasks;
    assert.equal(t1.synced, false); assert.match(t1.reason, /state started→review/);
    assert.equal(t1.prLine, "Fixes ENG-1"); assert.equal(t1.onBranch, true);
    assert.equal(t2.reason, "not pushed"); assert.equal(t2.prLine, null);
    assert.deepEqual([st.mapped, st.unmapped, st.outOfSync, st.queued, st.enabled, st.configured, st.team], [1, 1, 1, 1, true, true, "ENG"]);
    const st2 = buildStatus({ config: ON, map: m, docs: I.docs, statuses: { tasks: { "T-1": { status: "red" } } } });
    assert.equal(st2.tasks[0].synced, true); assert.equal(st2.tasks[0].prLine, "Part of ENG-1");
    assert.equal(fallbackBranch("ENG", "ENG-12", "Register user!"), "eng-12-register-user");
  });

  test("ticketsSummary: null when disabled, never throws on corrupt map", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-linear-s-"));
    fs.mkdirSync(path.join(root, ".hitl/tasks"), { recursive: true });
    fs.writeFileSync(path.join(root, ".hitl/tasks/feat-x.md"), "# X Tasks\n> status: approved\n");
    assert.equal(await ticketsSummary(root, {}, [mkTask("T-1")], { tasks: {} }), null);
    fs.writeFileSync(path.join(root, ".hitl/linear.map.json"), "{corrupt");
    const s = await ticketsSummary(root, ON, [mkTask("T-1")], { tasks: { "T-1": { status: "red" } } });
    assert.deepEqual(s, { provider: "linear", label: "Linear", enabled: true, configured: false, team: "ENG", mapped: 0, unmapped: 1, outOfSync: 0, queued: 0, perTask: {} });
    assert.equal(await ticketsSummary(root, ON, null, null) !== undefined, true);
    const I = inputs([mkTask("T-1")]);
    fs.writeFileSync(path.join(root, ".hitl/linear.map.json"), JSON.stringify(pushAll(I, buildPlan(I)).map));
    const s2 = await ticketsSummary(root, ON, [mkTask("T-1")], { tasks: { "T-1": { status: "skeleton" } } });
    assert.deepEqual(s2.perTask["T-1"], { issue: "ENG-1", url: "https://linear.app/acme/issue/ENG-1/x", branch: "eng-1-task-t-1", synced: true, onBranch: false });
  });
});
