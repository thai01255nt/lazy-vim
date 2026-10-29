// Tickets mirror providers (design v4): Jira and GitHub reuse the provider-neutral core; Linear stays the default.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  ticketsCfg, ticketsPaths, buildPlan, applyRecord, buildDiff, buildStatus, emptyMap, pickServer, verifyIdentity, urlKeyFromUrl,
  readMap, writeMap, ticketsSummary, mapRel, PROVIDERS, providerOf,
} from "../../scripts/lib/tickets.mjs";
import { DEFAULTS } from "../../scripts/lib/config.mjs";

const NOW = "2026-10-29T00:00:00.000Z";
const TF = ".hitl/changes/feat-x/tasks.md";
const JIRA = { tickets: { provider: "jira" }, jira: { enabled: true, team: "PAY", server: "atlassian" } };
const GH = { tickets: { provider: "github" }, github: { enabled: true, team: "acme/app", server: "github" } };

const INIT = {
  jira: { schema: "hitl.tickets-results/1", kind: "init", init: {
    workspace: { url: "https://acme.atlassian.net/browse/PAY-1" }, team: { key: "PAY", id: "10001", name: "Payments" }, project: null,
    states: { backlog: { id: "1", name: "Backlog" }, unstarted: { id: "11", name: "To Do" }, started: { id: "21", name: "In Progress" },
      review: { id: "31", name: "In Review" }, completed: { id: "41", name: "Done" }, canceled: { id: "51", name: "Won't Do" } },
    labels: { "risk:high": "risk:high", "impl:agent": "impl:agent" } } },
  github: { schema: "hitl.tickets-results/1", kind: "init", init: {
    workspace: { url: "https://github.com/acme/app" }, team: { key: "acme/app", id: "R_kgDOabc", name: "acme/app" }, project: null,
    states: { unstarted: { id: "open", name: "Open" }, started: { id: "open", name: "Open" }, completed: { id: "closed:completed", name: "Closed" },
      canceled: { id: "closed:not_planned", name: "Closed as not planned" } },
    labels: { "risk:high": "risk:high", "impl:agent": "impl:agent" } } },
};
const initMap = (config, name) => applyRecord({ map: emptyMap(PROVIDERS[name]), plan: null, queue: null, input: INIT[name], now: NOW, config }).map;
const mkTask = (id, o = {}) => ({ id, title: `Task ${id}`, file: TF, change: "feat-x", prio: "P0", risk: "high", riskReasons: ["security"], impl: "agent",
  blockedBy: [], why: "because (D-1)", acs: [{ id: `${id}.AC1`, reqs: ["X-R1.S1"], text: "Given a When b Then c" }], ...o });
const inputs = (config, map, tasks) => ({
  config, map, statuses: { tasks: Object.fromEntries(tasks.map((t) => [t.id, { status: "todo" }])) },
  docs: [{ file: TF, status: "approved", change: "feat-x", tasks }],
  changes: { "feat-x": { kind: "change", file: ".hitl/changes/feat-x", title: "Feat X", why: "Ship X.", whatChanges: "- a", requirements: [{ id: "X-R1", title: "Do a" }] } },
  reviews: {}, scope: { kind: "all" },
});

describe("providers: selection and defaults", () => {
  test("default provider is linear; unknown provider is a usage error; config DEFAULTS mirror provider defaults", () => {
    assert.equal(providerOf({}).name, "linear");
    assert.equal(providerOf(JIRA).name, "jira");
    assert.throws(() => providerOf({ tickets: { provider: "trello" } }), /unknown tickets.provider "trello"/);
    assert.equal(DEFAULTS.tickets.provider, "linear");
    for (const n of ["jira", "github"]) assert.deepEqual(JSON.parse(JSON.stringify(DEFAULTS[n])), JSON.parse(JSON.stringify(PROVIDERS[n].defaults)), n);
    assert.equal(ticketsCfg(JIRA).changeAs, "epic");
    assert.equal(ticketsCfg(GH).changeAs, "milestone");
    assert.equal(ticketsCfg({}).changeAs, "project");
  });

  test("per-provider map / plan / queue files; Linear keeps linear.map.json", () => {
    const P = ticketsPaths("/r", JIRA);
    assert.ok(P.map.endsWith(".hitl/jira.map.json") && P.queue.endsWith("index/jira.queue.json") && P.plan.endsWith("index/jira.plan.json"));
    assert.ok(ticketsPaths("/r", {}).map.endsWith(".hitl/linear.map.json"));
    assert.equal(mapRel(PROVIDERS.github), ".hitl/github.map.json");
  });

  test("workspace keys from tracker URLs", () => {
    assert.equal(urlKeyFromUrl("https://acme.atlassian.net/browse/PAY-1", PROVIDERS.jira), "acme.atlassian.net");
    assert.equal(urlKeyFromUrl("https://github.com/Acme/app/issues/3", PROVIDERS.github), "acme");
    assert.equal(urlKeyFromUrl("https://linear.app/venera-ai/issue/X-1"), "venera-ai");
  });

  test("server pick and identity messages name the provider", () => {
    assert.match(pickServer({ tickets: { provider: "jira" } }, []).message, /Jira MCP not found — claude mcp add --transport http atlassian https:\/\/mcp\.atlassian\.com/);
    assert.match(pickServer({ tickets: { provider: "github" }, github: {} }, ["github"], "init").message, /github\.server=github/);
    const map = initMap(JIRA, "jira");
    const ok = verifyIdentity({ config: JIRA, map, observed: { schema: "hitl.tickets-identity/1", server: "atlassian", workspace: { urlKey: "acme.atlassian.net" }, team: { id: "10001", key: "PAY" } } });
    assert.equal(ok.result.ok, true);
    const bad = verifyIdentity({ config: JIRA, map, observed: { schema: "hitl.tickets-identity/1", server: "atlassian", workspace: { urlKey: "other.atlassian.net" }, team: { id: "10001", key: "PAY" } } });
    assert.equal(bad.result.ok, false);
    assert.match(bad.result.fix[0], /jira\.server/);
  });
});

describe("providers: plan, record, diff, status", () => {
  test("Jira: change → Epic (ensureParent), issues carry priority name, labels by name and issue type", () => {
    const map = initMap(JIRA, "jira");
    assert.equal(map.schema, "hitl.jira-map/1");
    assert.equal(map.workspace.urlKey, "acme.atlassian.net");
    const p = buildPlan(inputs(JIRA, map, [mkTask("T-1"), mkTask("T-2", { prio: "P2", blockedBy: ["T-1"] })]));
    assert.equal(p.provider, "jira");
    const ens = p.ops[0];
    assert.equal(ens.op, "ensureParent");
    assert.equal(ens.payload.container, "epic");
    assert.equal(ens.payload.issueType, "Epic");
    const c1 = p.ops.find((o) => o.op === "createIssue" && o.task === "T-1");
    assert.deepEqual([c1.payload.priority, c1.payload.priorityName, c1.payload.issueType, c1.payload.stateId], [1, "Highest", "Task", "11"]);
    assert.deepEqual(c1.payload.labelIds, ["impl:agent", "risk:high"]);
    assert.deepEqual(c1.payload.labels, ["impl:agent", "risk:high"]);
    assert.equal(p.ops.find((o) => o.task === "T-2").payload.priorityName, "Medium");
    // record: epic id is the parent of the issues created in the same batch
    const results = p.ops.map((o) => (o.op === "ensureParent" ? { opId: o.opId, ok: true, id: "10500", issue: "PAY-1", url: "https://acme.atlassian.net/browse/PAY-1" }
      : { opId: o.opId, ok: true, id: `id-${o.task}`, issue: `PAY-${o.task.slice(2) * 1 + 1}`, url: "https://acme.atlassian.net/browse/x" }));
    const r = applyRecord({ map, plan: p, queue: null, input: { schema: "hitl.tickets-results/1", kind: "push", planId: p.planId, results }, now: NOW, config: JIRA });
    assert.equal(r.out.provider, "jira");
    assert.equal(r.out.map, ".hitl/jira.map.json");
    assert.deepEqual(r.map.changes["feat-x"], { kind: "parent-issue", container: "epic", id: "10500", key: "PAY-1", url: "https://acme.atlassian.net/browse/PAY-1", pushedHash: ens.meta.pushedHash, at: NOW });
    assert.equal(r.map.tasks["T-1"].pushed.parentId, "10500");
    assert.equal(r.map.tasks["T-1"].branch, "pay-2-task-t-1");
    // pinned epic: no epic per change, every issue goes into the pinned one (as projectId → the skill sends it as parent)
    const pinned = { ...JIRA, jira: { ...JIRA.jira, project: { id: "10900", name: "Billing epic" } } };
    const pp = buildPlan(inputs(pinned, initMap(pinned, "jira"), [mkTask("T-1")]));
    assert.ok(!pp.ops.some((o) => o.op === "ensureParent"));
    assert.equal(pp.ops[0].payload.projectId, "10900");
  });

  test("GitHub: change → milestone (ensureProject container milestone); open/closed state ids; JIRA-free drift codes", () => {
    const map = initMap(GH, "github");
    assert.equal(map.workspace.urlKey, "acme");
    const p = buildPlan(inputs(GH, map, [mkTask("T-1", { prio: "P3" })]));
    const ens = p.ops[0];
    assert.deepEqual([ens.op, ens.payload.container, ens.payload.name], ["ensureProject", "milestone", "Feat X"]);
    const c1 = p.ops[1];
    assert.deepEqual([c1.payload.stateId, c1.payload.priorityName], ["open", "low"]);
    const results = [{ opId: ens.opId, ok: true, id: "7", url: "https://github.com/acme/app/milestone/7" },
      { opId: c1.opId, ok: true, id: "I_kw1", issue: "#12", url: "https://github.com/acme/app/issues/12" }];
    const r = applyRecord({ map, plan: p, queue: null, input: { schema: "hitl.tickets-results/1", kind: "push", planId: p.planId, results }, now: NOW, config: GH });
    assert.equal(r.map.changes["feat-x"].container, "milestone");
    assert.equal(r.map.tasks["T-1"].pushed.projectId, "7");
    assert.equal(r.map.tasks["T-1"].branch, "acme-app-12-task-t-1");
    const remote = { schema: "hitl.tickets-remote/1", complete: true, issues: [{ id: "I_kw1", identifier: "#12", title: "Edited", description: r.map.tasks["T-1"].pushed.descHash,
      priority: 4, state: { id: "closed:completed", name: "Closed", type: "completed" }, labels: [] }] };
    const d = buildDiff({ config: GH, map: r.map, remote, statuses: { tasks: { "T-1": { status: "todo" } } }, localTasks: [] });
    const codes = d.out.items.map((i) => `${i.code}:${i.field}`);
    assert.ok(codes.includes("GITHUB_DONE_EARLY:state"));
    assert.ok(codes.includes("GITHUB_DRIFT:title"));
    assert.match(d.out.items.find((i) => i.field === "title").message, /in GitHub/);
    const st = buildStatus({ config: GH, map: r.map, docs: inputs(GH, map, [mkTask("T-1")]).docs, statuses: { tasks: { "T-1": { status: "done" } } } });
    assert.deepEqual([st.provider, st.mapFile, st.tasks[0].prLine], ["github", ".hitl/github.map.json", "Fixes #12"]);
  });

  test("Linear payloads carry no provider extras", () => {
    const L = { linear: { enabled: true, team: "ENG" } };
    const lin = { schema: "hitl.tickets-results/1", kind: "init", init: { team: { key: "ENG", id: "t1" }, states: { started: { id: "s1" }, unstarted: { id: "s0" } }, labels: {} } };
    const map = applyRecord({ map: emptyMap(), plan: null, queue: null, input: lin, now: NOW, config: L }).map;
    const p = buildPlan(inputs(L, map, [mkTask("T-1")]));
    assert.equal(p.provider, "linear");
    for (const o of p.ops) for (const k of ["priorityName", "issueType", "container", "labels"]) assert.ok(!(k in o.payload), `${o.op} has ${k}`);
  });

  test("IO and summary read the active provider's map", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-tp-"));
    fs.mkdirSync(path.join(root, ".hitl/changes/feat-x"), { recursive: true });
    fs.writeFileSync(path.join(root, TF), "# X Tasks\n> status: approved\n");
    await writeMap(root, initMap(GH, "github"), GH);
    assert.ok(fs.existsSync(path.join(root, ".hitl/github.map.json")));
    assert.ok(!fs.existsSync(path.join(root, ".hitl/linear.map.json")));
    assert.equal((await readMap(root, GH)).team.key, "acme/app");
    const s = await ticketsSummary(root, GH, [mkTask("T-1")], { tasks: { "T-1": { status: "todo" } } });
    assert.deepEqual([s.provider, s.label, s.configured, s.unmapped], ["github", "GitHub", true, 1]);
  });
});
