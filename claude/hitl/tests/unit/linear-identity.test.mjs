// Unit tests for Linear identity (0.5.0): server pin, workspace/team verify, linear.project mode, repo-collision. No network.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LINEAR_DEFAULTS, linearCfg, emptyMap, applyRecord, buildPlan, buildDiff, buildStatus, verifyIdentity, pickServer, serverOfTool,
  urlKeyFromUrl, repoKeyFromRemote, parseMarker, describeTask, projectRef,
} from "../../scripts/lib/linear.mjs";
import { DEFAULTS } from "../../scripts/lib/config.mjs";
import { run as ticketsRun } from "../../scripts/cmd/tickets.mjs";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const FIXI = JSON.parse(fs.readFileSync(path.join(PLUGIN, "tests/fixtures/linear/init.json"), "utf8"));
const NOW = "2026-10-25T00:00:00.000Z";
const TF = ".hitl/tasks/feat-x.md";
const ON = { linear: { enabled: true, team: "ENG", server: "linear-work" } };
const PROJ = { linear: { ...ON.linear, project: { id: "proj-shared", name: "Shared" } } };
const ID = (o = {}) => ({ schema: "hitl.tickets-identity/1", server: "linear-work", workspace: { urlKey: "acme" }, team: { id: "team-uuid-eng", key: "ENG" }, ...o });

const initMap = (repo = "thai/app-a", input = FIXI) => applyRecord({ map: emptyMap(), plan: null, queue: null, input, now: NOW, repo }).map;
const mkTask = (id, o = {}) => ({ id, title: `Task ${id}`, file: TF, planning: ".hitl/planning/feat-x.md", prio: "P1", risk: "low", impl: "agent",
  blockedBy: [], status: "todo", why: "w", acs: [{ id: `${id}.AC1`, reqs: [], text: "t", done: false }], ...o });
const inputs = (config, map, tasks) => ({
  config, map, statuses: { tasks: Object.fromEntries(tasks.map((t) => [t.id, { status: "todo" }])) },
  docs: [{ file: TF, status: "approved", planning: ".hitl/planning/feat-x.md", tasks }], reviews: {},
  plannings: { "feat-x.md": { file: ".hitl/planning/feat-x.md", title: "Feat X", goal: "Ship X.", requirements: [], decisions: [] } }, scope: { kind: "all" },
});

describe("linear identity: config defaults", () => {
  test("server and project default to null in both default tables", () => {
    assert.equal(DEFAULTS.linear.server, null);
    assert.equal(DEFAULTS.linear.project, null);
    assert.deepEqual(JSON.parse(JSON.stringify(DEFAULTS.linear)), JSON.parse(JSON.stringify(LINEAR_DEFAULTS)));
    assert.equal(linearCfg({}).server, null);
    assert.equal(projectRef(linearCfg({})), null);
    assert.deepEqual(projectRef(linearCfg(PROJ)), { id: "proj-shared", name: "Shared", url: null });
    assert.deepEqual(projectRef(linearCfg({ linear: { project: "Roadmap" } })), { id: null, unresolved: "Roadmap" });
  });
});

describe("linear identity: server pin", () => {
  test("tool name → server; pinned use / missing; init save / pick; legacy", () => {
    assert.equal(serverOfTool("mcp__plugin_linear_linear__save_issue"), "plugin_linear_linear");
    assert.equal(serverOfTool("mcp__linear-work__list_teams"), "linear-work");
    assert.equal(serverOfTool("Read"), null);
    const both = ["mcp__linear-work__list_teams", "linear-personal", "mcp__linear-work__save_issue"];
    assert.deepEqual(pickServer(ON, both), { ...pickServer(ON, both), action: "use", server: "linear-work", visible: ["linear-personal", "linear-work"] });
    const miss = pickServer(ON, ["linear-personal"]);
    assert.equal(miss.action, "missing");
    assert.match(miss.message, /claude mcp add --transport http linear-work https:\/\/mcp\.linear\.app\/mcp/);
    assert.match(miss.message, /\/mcp/);
    const legacy = { linear: { enabled: true } };
    assert.equal(pickServer(legacy, [], "init").action, "none");
    assert.deepEqual([pickServer(legacy, ["linear-work"], "init").action, pickServer(legacy, ["linear-work"], "init").server], ["save", "linear-work"]);
    const pick = pickServer(legacy, ["linear-work", "linear-personal"], "init");
    assert.equal(pick.action, "pick"); assert.deepEqual(pick.candidates, ["linear-personal", "linear-work"]); assert.equal(pick.server, null);
    const run = pickServer(legacy, ["linear-work", "linear-personal"]);
    assert.equal(run.action, "legacy"); assert.match(run.message, /pin/);
  });

  test("plan warns when the server is not pinned", () => {
    const m = initMap();
    const noPin = buildPlan(inputs({ linear: { enabled: true } }, m, [mkTask("T-1")]));
    assert.ok(noPin.warnings.some((w) => /linear\.server not pinned/.test(w)));
    const pin = buildPlan(inputs(ON, m, [mkTask("T-1")]));
    assert.ok(!pin.warnings.some((w) => /not pinned/.test(w)));
    assert.equal(pin.server, "linear-work"); assert.equal(pin.workspace, "acme"); assert.equal(pin.repo, "thai/app-a");
  });
});

describe("linear identity: verify", () => {
  test("match", () => {
    const { result, map } = verifyIdentity({ config: ON, map: initMap(), observed: ID() });
    assert.equal(result.ok, true); assert.equal(result.status, "match"); assert.equal(map, null);
    // urlKey from a team/issue URL, case-insensitive
    assert.equal(verifyIdentity({ config: ON, map: initMap(), observed: ID({ workspace: { url: "https://linear.app/ACME/team/ENG/all" } }) }).result.ok, true);
    assert.equal(urlKeyFromUrl("https://linear.app/acme/issue/ENG-1/x"), "acme");
  });
  test("workspace mismatch → refused with expected vs observed and the fix", () => {
    const { result, map } = verifyIdentity({ config: ON, map: initMap(), observed: ID({ workspace: { urlKey: "personal" } }) });
    assert.equal(result.ok, false); assert.equal(result.status, "mismatch"); assert.equal(map, null);
    assert.deepEqual(result.mismatches, [{ field: "workspace", expected: "acme", observed: "personal" }]);
    assert.ok(result.fix.some((f) => /init --relink/.test(f)) && result.fix.some((f) => /linear\.server/.test(f)));
  });
  test("team mismatch (and missing team) → refused; server mismatch → refused", () => {
    const t = verifyIdentity({ config: ON, map: initMap(), observed: ID({ team: { id: "team-other", key: "ENG" } }) }).result;
    assert.deepEqual(t.mismatches, [{ field: "team.id", expected: "team-uuid-eng", observed: "team-other" }]);
    assert.equal(verifyIdentity({ config: ON, map: initMap(), observed: ID({ team: null }) }).result.ok, false);
    const s = verifyIdentity({ config: ON, map: initMap(), observed: ID({ server: "linear-personal" }) }).result;
    assert.deepEqual(s.mismatches.map((x) => x.field), ["server"]);
    const p = verifyIdentity({ config: PROJ, map: initMap(), observed: ID({ project: { id: "proj-other" } }) }).result;
    assert.deepEqual(p.mismatches.map((x) => x.field), ["project"]);
    assert.throws(() => verifyIdentity({ config: ON, map: initMap(), observed: { schema: "x" } }), (e) => e.code === 1);
  });
  test("legacy map without workspace → allowed once and recorded; renamed team key learned", () => {
    const legacy = { ...initMap(), workspace: null };
    const { result, map } = verifyIdentity({ config: ON, map: legacy, observed: ID() });
    assert.equal(result.ok, true); assert.equal(result.status, "learned");
    assert.deepEqual(map.workspace, { urlKey: "acme" });
    assert.equal(verifyIdentity({ config: ON, map, observed: ID() }).result.status, "match");
    const ren = verifyIdentity({ config: ON, map: initMap(), observed: ID({ team: { id: "team-uuid-eng", key: "CORE" } }) });
    assert.equal(ren.result.ok, true); assert.equal(ren.map.team.key, "CORE");
    // workspace not observable: team id is enough, with a warning
    const nows = verifyIdentity({ config: ON, map: initMap(), observed: ID({ workspace: null }) }).result;
    assert.equal(nows.ok, true); assert.ok(nows.warnings.length === 1);
  });

  test("record push with a mismatching identity throws code 4: nothing applied, nothing queued", () => {
    const I = inputs(ON, initMap(), [mkTask("T-1")]);
    const p = buildPlan(I);
    const input = { schema: "hitl.tickets-results/1", kind: "push", planId: p.planId, identity: ID({ workspace: { urlKey: "personal" } }),
      results: p.ops.map((o) => ({ opId: o.opId, ok: false, error: "x" })) };
    assert.throws(() => applyRecord({ map: I.map, plan: p, queue: null, input, now: NOW, config: ON }), (e) => e.code === 4 && e.verify.mismatches[0].field === "workspace");
    const ok = applyRecord({ map: { ...I.map, workspace: null }, plan: p, queue: null, input: { ...input, identity: ID() }, now: NOW, config: ON });
    assert.deepEqual(ok.out.learned, ["workspace acme"]); assert.equal(ok.map.workspace.urlKey, "acme");
  });

  test("diff with a mismatching identity throws code 4", () => {
    const remote = { schema: "hitl.tickets-remote/1", identity: ID({ team: { id: "nope", key: "X" } }), issues: [] };
    assert.throws(() => buildDiff({ config: ON, map: initMap(), remote, statuses: { tasks: {} }, localTasks: [] }), (e) => e.code === 4);
  });

  test("init into another team: refused without relink; relink clears task mappings", () => {
    const m = initMap();
    m.tasks["T-1"] = { issue: "ENG-1", id: "iss-1", pushed: {} };
    const other = structuredClone(FIXI);
    other.init.workspace = { urlKey: "personal" }; other.init.team = { key: "ME", id: "team-me", name: "Me" };
    assert.throws(() => applyRecord({ map: m, plan: null, queue: null, input: other, now: NOW }), (e) => e.code === 4);
    const r = applyRecord({ map: m, plan: null, queue: null, input: { ...other, relink: true }, now: NOW });
    assert.equal(r.out.reset, 1); assert.deepEqual(r.map.tasks, {}); assert.equal(r.map.team.id, "team-me"); assert.equal(r.map.workspace.urlKey, "personal");
    // same team again: mappings kept, repo kept
    const same = applyRecord({ map: m, plan: null, queue: null, input: FIXI, now: NOW, repo: "other/x" });
    assert.equal(same.map.tasks["T-1"].issue, "ENG-1"); assert.equal(same.map.repo, "thai/app-a");
  });

  test("CLI verify: exit 4 on mismatch (map untouched), exit 0 + map learns workspace on legacy", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-linear-v-"));
    const P = (r) => path.join(root, ".hitl", r);
    fs.mkdirSync(P(".inbox"), { recursive: true }); fs.mkdirSync(P("index"), { recursive: true });
    fs.writeFileSync(P("linear.map.json"), JSON.stringify({ ...initMap(), workspace: null }));
    const ctx = { root, config: ON, json: true };
    const log = console.log; const out = []; console.log = (s) => out.push(String(s));
    try {
      fs.writeFileSync(P(".inbox/id.json"), JSON.stringify(ID({ team: { id: "team-x", key: "X" } })));
      assert.equal(await ticketsRun(["verify", "--in", ".hitl/.inbox/id.json"], ctx), 4);
      assert.equal(JSON.parse(out.at(-1)).status, "mismatch");
      assert.equal(JSON.parse(fs.readFileSync(P("linear.map.json"), "utf8")).workspace, null);
      fs.writeFileSync(P(".inbox/id.json"), JSON.stringify(ID()));
      assert.equal(await ticketsRun(["verify", "--in", ".hitl/.inbox/id.json"], ctx), 0);
      assert.equal(JSON.parse(out.at(-1)).status, "learned");
      assert.equal(JSON.parse(fs.readFileSync(P("linear.map.json"), "utf8")).workspace.urlKey, "acme");
      assert.equal(await ticketsRun(["server", "linear-personal"], ctx), 0);
      assert.equal(JSON.parse(out.at(-1)).action, "missing");
    } finally { console.log = log; }
  });
});

describe("linear identity: linear.project mode", () => {
  test("no ensureProject; createIssue carries the pinned projectId; record stores map.project", () => {
    const I = inputs(PROJ, initMap(), [mkTask("T-1"), mkTask("T-2")]);
    const p = buildPlan(I);
    assert.ok(!p.ops.some((o) => o.op === "ensureProject" || o.op === "ensureParent"));
    const creates = p.ops.filter((o) => o.op === "createIssue");
    assert.equal(creates.length, 2);
    assert.ok(creates.every((o) => o.payload.projectId === "proj-shared" && o.payload.parentId === null));
    assert.deepEqual(p.project, { id: "proj-shared", name: "Shared" });
    const results = p.ops.map((o, i) => ({ opId: o.opId, ok: true, id: `iss-${i}`, issue: `ENG-${i + 1}` }));
    const r = applyRecord({ map: I.map, plan: p, queue: null, input: { schema: "hitl.tickets-results/1", kind: "push", planId: p.planId, results }, now: NOW });
    assert.equal(r.map.project.id, "proj-shared");
    assert.equal(r.map.tasks["T-1"].pushed.projectId, "proj-shared");
    assert.equal(buildPlan({ ...I, map: r.map }).ops.length, 0, "in sync afterwards");
    assert.equal(buildStatus({ config: PROJ, map: r.map, docs: I.docs, statuses: I.statuses }).project.id, "proj-shared");
  });
  test("parent-issue keeps working inside the pinned project", () => {
    const cfg = { linear: { ...PROJ.linear, planningAs: "parent-issue" } };
    const p = buildPlan(inputs(cfg, initMap(), [mkTask("T-1")]));
    const ens = p.ops.find((o) => o.op === "ensureParent");
    assert.ok(ens); assert.equal(ens.payload.projectId, "proj-shared");
    assert.equal(p.ops.find((o) => o.op === "createIssue").payload.projectId, "proj-shared");
  });
  test("mapped issue in an old per-planning project moves to the pinned one", () => {
    const m = initMap();
    m.changes["feat-x"] = { kind: "project", id: "proj-old", pushedHash: "x" };
    const I0 = inputs(ON, m, [mkTask("T-1")]);
    const p0 = buildPlan(I0);
    const r0 = applyRecord({ map: m, plan: p0, queue: null, now: NOW, input: { schema: "hitl.tickets-results/1", kind: "push", planId: p0.planId,
      results: p0.ops.map((o) => ({ opId: o.opId, ok: true, id: o.op === "createIssue" ? "iss-1" : "proj-old", issue: "ENG-1" })) } });
    const ups = buildPlan({ ...inputs(PROJ, r0.map, [mkTask("T-1")]) }).ops;
    assert.deepEqual(ups.map((o) => [o.op, o.payload.fields?.projectId]), [["updateIssue", "proj-shared"]]);
  });
  test("unresolved project name → not configured, no ops", () => {
    const p = buildPlan(inputs({ linear: { ...ON.linear, project: "Roadmap" } }, initMap(), [mkTask("T-1")]));
    assert.equal(p.configured, false); assert.equal(p.ops.length, 0);
    assert.ok(p.warnings.some((w) => /not resolved/.test(w)));
  });
});

describe("linear identity: two repos sharing a team/project", () => {
  test("marker carries repo=; repo key from git remotes", () => {
    assert.equal(repoKeyFromRemote("git@github.com:Thai/App-A.git"), "thai/app-a");
    assert.equal(repoKeyFromRemote("https://github.com/thai/app-a"), "thai/app-a");
    assert.equal(repoKeyFromRemote("ssh://git@gitlab.example.com:2222/grp/sub/app.git"), "sub/app");
    assert.equal(repoKeyFromRemote(""), null);
    const d = describeTask(mkTask("T-1"), null, "thai/app-a");
    assert.ok(d.includes(`\n<!-- hitl:task=T-1 repo=thai/app-a file=${TF} -->\n`));
    assert.deepEqual(parseMarker(d), { task: "T-1", repo: "thai/app-a", file: TF });
    assert.deepEqual(parseMarker(`<!-- hitl:task=T-3 file=${TF} -->`), { task: "T-3", repo: null, file: TF });
    const p = buildPlan(inputs(ON, initMap("thai/app-a"), [mkTask("T-1")]));
    assert.match(p.ops.find((o) => o.op === "createIssue").payload.description, /hitl:task=T-1 repo=thai\/app-a /);
  });

  test("repo B never relinks repo A's T-1 (same file name, shared team)", () => {
    const mapB = initMap("thai/app-b"); // B's map lost T-1 (or never pushed)
    const issueA = { id: "iss-a1", identifier: "ENG-1", title: "A one", description: describeTask(mkTask("T-1"), null, "thai/app-a"), state: { id: "st-todo", type: "unstarted" } };
    const r = buildDiff({ config: ON, map: mapB, remote: { schema: "hitl.tickets-remote/1", issues: [issueA] }, statuses: { tasks: {} }, localTasks: [mkTask("T-1")], relink: true });
    assert.deepEqual(r.out.relink, []); assert.equal(r.out.items.length, 0); assert.equal(r.out.foreign, 1);
    assert.equal(r.map.tasks["T-1"], undefined);
    // own issue with repo= is relinked
    const issueB = { ...issueA, id: "iss-b1", identifier: "ENG-2", description: describeTask(mkTask("T-1"), null, "thai/app-b") };
    const r2 = buildDiff({ config: ON, map: mapB, remote: { schema: "hitl.tickets-remote/1", issues: [issueA, issueB] }, statuses: { tasks: {} }, localTasks: [mkTask("T-1")], relink: true });
    assert.deepEqual(r2.out.relink.map((x) => x.issue), ["ENG-2"]);
    // legacy repo without map.repo: the computed repo key (I.repo) still filters
    const legacyB = { ...mapB, repo: null };
    const r3 = buildDiff({ config: ON, map: legacyB, remote: { schema: "hitl.tickets-remote/1", issues: [issueA] }, statuses: { tasks: {} }, localTasks: [mkTask("T-1")], repo: "thai/app-b", relink: true });
    assert.deepEqual(r3.out.relink, []);
  });

  test("legacy markers (no repo=): other file → not relinked; two candidates → ambiguous, none relinked", () => {
    const mapB = initMap("thai/app-b");
    const leg = (id, ident, file) => ({ id, identifier: ident, title: "x", description: `<!-- hitl:task=T-1 file=${file} -->\n**Why**: —`, state: { id: "st-todo", type: "unstarted" } });
    const other = buildDiff({ config: ON, map: mapB, remote: { schema: "hitl.tickets-remote/1", issues: [leg("i1", "ENG-1", ".hitl/tasks/other.md")] }, statuses: { tasks: {} }, localTasks: [mkTask("T-1")], relink: true });
    assert.deepEqual(other.out.relink, []); assert.match(other.out.items[0].message, /legacy hitl marker/);
    const two = buildDiff({ config: ON, map: mapB, remote: { schema: "hitl.tickets-remote/1", issues: [leg("i1", "ENG-1", TF), leg("i2", "ENG-5", TF)] }, statuses: { tasks: {} }, localTasks: [mkTask("T-1")], relink: true });
    assert.deepEqual(two.out.relink, []);
    assert.ok(two.out.items.some((i) => i.code === "LINEAR_AMBIGUOUS" && i.task === "T-1"));
    assert.equal(two.map.tasks["T-1"], undefined);
  });

  test("push side matches only via map ids: B's plan for T-1 creates its own issue even when A already has one", () => {
    const mapA = initMap("thai/app-a"); mapA.tasks["T-1"] = { issue: "ENG-1", id: "iss-a1", tasksFile: TF, pushed: {} };
    const pB = buildPlan(inputs(ON, initMap("thai/app-b"), [mkTask("T-1")]));
    const c = pB.ops.find((o) => o.op === "createIssue" && o.task === "T-1");
    assert.ok(c && !("id" in c) && !pB.ops.some((o) => o.id === "iss-a1"));
  });
});
