// 0.11 /hitl:go — the work-router verdict → one action (lib/route.mjs), `hitl-index route`, and a dry grade of the
// go eval checks on synthetic transcripts (no claude calls).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveRoute, signalTag, ROUTES, ROUTE_FILE } from "../../scripts/lib/route.mjs";
import { gradeRun } from "../../evals/grade.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, "../..");
const CLI = path.join(PLUGIN, "scripts/hitl-index.mjs");
const FIX = path.join(PLUGIN, "tests/fixtures/spec-app");
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};
const project = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-go-")); fs.cpSync(FIX, root, { recursive: true }); return root; };

const ACTIVE = { id: "feat-reset", title: "Password reset", archived: false, proposal: "approved", phase: "implement", tasksFile: ".hitl/changes/feat-reset/tasks.md" };
const DRAFT = { id: "feat-draft", title: "Draft thing", archived: false, proposal: "draft", phase: "spec", tasksFile: null };
const NOTASKS = { id: "feat-notasks", title: "No tasks yet", archived: false, proposal: "approved", phase: "design", tasksFile: null };
const OLD = { id: "feat-old", title: "Archived", archived: true, proposal: "approved", phase: "archived", tasksFile: "x" };
const CH = [ACTIVE, DRAFT, NOTASKS, OLD];
const V = (o) => ({ schema: "hitl.route/1", reason: "why", brief: "do the thing", signals: [], questions: [], ...o });

test("route order and skill/args per route", () => {
  assert.deepEqual(ROUTES, ["note", "amend", "update", "tdd", "quick", "plan"]);
  const plan = resolveRoute(V({ route: "plan" }), CH);
  assert.equal(plan.action, "invoke"); assert.equal(plan.skill, "hitl:plan"); assert.equal(plan.args, "do the thing");
  assert.equal(plan.line, "🧭 /hitl:plan — why");
  const quick = resolveRoute(V({ route: "quick" }), CH);
  assert.equal(quick.skill, "hitl:tasks"); assert.equal(quick.args, "quick do the thing"); assert.equal(quick.line, "🧭 /hitl:tasks quick — why");
  const tdd = resolveRoute(V({ route: "tdd", signals: ["bug-repro: total off by one cent", "functions: 1"] }), CH);
  assert.equal(tdd.skill, "hitl:tdd"); assert.equal(tdd.args, "do the thing"); assert.equal(tdd.from, null);
  const amend = resolveRoute(V({ route: "amend", change: "feat-reset" }), CH);
  assert.equal(amend.skill, "hitl:plan"); assert.equal(amend.args, "feat-reset amend do the thing");
  assert.equal(amend.line, "🧭 /hitl:plan feat-reset amend — why");
  assert.deepEqual(amend.change, { id: "feat-reset", title: "Password reset", phase: "implement" });
  const upd = resolveRoute(V({ route: "update", change: "feat-reset" }), CH);
  assert.equal(upd.skill, "hitl:tasks"); assert.equal(upd.args, "feat-reset update do the thing");
});

test("note: the 📌 gate with refs and kind, no skill; no refs → a warning hint", () => {
  const r = resolveRoute(V({ route: "note", change: "feat-reset", kind: "design", refs: ["ACC-R3.S2 (Reset link expires)", "D-2 (hash the token)"] }), CH);
  assert.equal(r.action, "note"); assert.equal(r.skill, null); assert.equal(r.args, null); assert.equal(r.noteKind, "design");
  assert.equal(r.gate, "📌 Note for feat-reset (Password reset), refs ACC-R3.S2 (Reset link expires), D-2 (hash the token)? (Y/n)");
  assert.equal(r.line, "🧭 📌 note for feat-reset — why");
  const n = resolveRoute(V({ route: "note", change: "feat-reset", kind: "bogus" }), CH);
  assert.equal(n.noteKind, "spec");
  assert.match(n.gate, /refs none\? \(Y\/n\)$/);
  assert.ok(n.hints.some((h) => /no refs/.test(h)));
});

test("change routes: unknown or archived change → plan; draft spec → /hitl:plan <id>; update without tasks → amend", () => {
  for (const change of ["feat-nope", "feat-old", undefined]) {
    const r = resolveRoute(V({ route: "amend", change }), CH);
    assert.equal(r.route, "plan"); assert.equal(r.from, "amend"); assert.equal(r.skill, "hitl:plan"); assert.equal(r.args, "do the thing");
    assert.match(r.hints[0], /raised from amend to plan/);
  }
  for (const route of ["note", "amend", "update"]) {
    const r = resolveRoute(V({ route, change: "feat-draft" }), CH);
    assert.equal(r.action, "invoke"); assert.equal(r.skill, "hitl:plan"); assert.equal(r.args, "feat-draft do the thing", route);
    assert.ok(r.hints.some((h) => /still a draft/.test(h)));
  }
  const u = resolveRoute(V({ route: "update", change: "feat-notasks" }), CH);
  assert.equal(u.route, "amend"); assert.equal(u.from, "update"); assert.equal(u.args, "feat-notasks amend do the thing");
});

test("ties go heavier: quick and tdd are raised to plan on risk signals; negated signals do not count", () => {
  for (const tag of ["security", "concurrency", "public-api", "domain", "data", "core", "business-rule"]) {
    const r = resolveRoute(V({ route: "quick", signals: [`${tag}: evidence`] }), CH);
    assert.equal(r.route, "plan", tag); assert.equal(r.from, "quick"); assert.equal(r.skill, "hitl:plan");
  }
  for (const tag of ["security", "concurrency", "data"]) assert.equal(resolveRoute(V({ route: "tdd", signals: [`${tag}: x`] }), CH).route, "plan", tag);
  for (const tag of ["public-api", "business-rule", "bug-repro"]) assert.equal(resolveRoute(V({ route: "tdd", signals: [`${tag}: x`] }), CH).route, "tdd", tag);
  assert.equal(resolveRoute(V({ route: "quick", signals: ["security: no", "public-api: none", "data: không"] }), CH).route, "quick");
  assert.equal(signalTag("  Public-API : exported "), "public-api");
});

test("plan hints: design-skip and low-risk", () => {
  const r = resolveRoute(V({ route: "plan", signals: ["design-skip: one function, no stored data", "low-risk: wording only"] }), CH);
  assert.ok(r.hints.some((h) => /design will likely be skipped/.test(h)));
  assert.ok(r.hints.some((h) => /fast lane/.test(h)));
  assert.deepEqual(resolveRoute(V({ route: "quick", signals: ["design-skip: x"] }), CH).hints, []);
});

test("questions: ask (≤ 3) on the first dispatch; --final drops them and decides", () => {
  const qs = ["Q a — 💡 x", "Q b", { q: "Q c" }, "Q d"];
  const a = resolveRoute(V({ route: "plan", questions: qs }), CH);
  assert.equal(a.action, "ask"); assert.deepEqual(a.questions, ["Q a — 💡 x", "Q b", "Q c"]); assert.ok(a.hints[0].includes("only the first 3"));
  const f = resolveRoute(V({ route: "quick", questions: qs }), CH, { final: true });
  assert.equal(f.action, "invoke"); assert.equal(f.skill, "hitl:tasks"); assert.deepEqual(f.questions, []);
});

test("invalid verdicts: not an object, unknown route, empty brief", () => {
  assert.equal(resolveRoute(null, CH).ok, false);
  assert.equal(resolveRoute([], CH).ok, false);
  assert.match(resolveRoute(V({ route: "build" }), CH).errors[0], /unknown route "build"/);
  assert.match(resolveRoute(V({ route: "plan", brief: " " }), CH).errors[0], /brief is empty/);
});

test("hitl-index route: reads and removes the verdict, checks the real change list, exit 1 without a verdict", () => {
  const root = project();
  const file = path.join(root, ROUTE_FILE);
  const put = (o) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(V(o))); };
  put({ route: "update", change: "feat-password-reset" });
  let r = cli(root, "route", "--json");
  assert.equal(r.code, 0, r.err);
  let j = r.json();
  assert.equal(j.schema, "hitl.route-action/1"); assert.equal(j.skill, "hitl:tasks"); assert.equal(j.args, "feat-password-reset update do the thing");
  assert.equal(j.change.title, "Password reset by email");
  assert.ok(!fs.existsSync(file), "verdict removed");
  r = cli(root, "route", "--json");
  assert.equal(r.code, 1); assert.match(r.json().errors[0], /no verdict/);
  // the archived feat-2fa is not a target
  put({ route: "note", change: "feat-2fa" });
  j = cli(root, "route", "--json", "--keep").json();
  assert.equal(j.route, "plan"); assert.match(j.hints[0], /feat-2fa is not an active change/);
  assert.ok(fs.existsSync(file), "--keep keeps the file");
  // text mode
  put({ route: "quick", questions: ["What is the goal?"] });
  r = cli(root, "route");
  assert.equal(r.code, 0); assert.match(r.out, /^Q1\. What is the goal\?/);
  put({ route: "quick", questions: ["What is the goal?"] });
  r = cli(root, "route", "--final");
  assert.match(r.out, /^🧭 \/hitl:tasks quick — why\n→ Skill hitl:tasks quick do the thing/);
  fs.writeFileSync(file, "{ not json");
  r = cli(root, "route", "--json");
  assert.equal(r.code, 1); assert.match(r.json().errors[0], /not JSON/);
  assert.equal(cli(root, "route", "extra").code, 2);
});

test("hitl-index route: not initialized → exit 3", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-go-none-"));
  assert.equal(cli(dir, "route", "--json").code, 3);
});

// ---- dry grade of the go scenarios (synthetic stream-json, no claude calls)
const scenarios = JSON.parse(fs.readFileSync(path.join(PLUGIN, "evals/scenarios.json"), "utf8")).cases;
const asst = (content) => ({ type: "assistant", message: { content } });
const text = (t) => asst([{ type: "text", text: t }]);
const tool = (name, input) => asst([{ type: "tool_use", name, input }]);
function grade(c, events) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-grade-"));
  const proj = path.join(dir, "proj"); fs.mkdirSync(proj);
  spawnSync("git", ["init", "-q"], { cwd: proj });
  const last = events.filter((e) => e.message?.content?.[0]?.type === "text").at(-1)?.message.content[0].text ?? "";
  fs.writeFileSync(path.join(dir, "out.jsonl"), [...events, { type: "result", result: last, total_cost_usd: 0 }].map((e) => JSON.stringify(e)).join("\n"));
  return gradeRun({ suite: "behaviour", c, dir, proj, pluginDir: PLUGIN, exit: 0 }).checks;
}

test("evals: every scenario check exists in grade.mjs", () => {
  for (const c of scenarios) {
    const checks = grade(c, [text("x")]);
    for (const [k, v] of Object.entries(checks)) assert.notEqual(v.why, "unknown check", `${c.id}: ${k}`);
  }
});

test("evals (dry): go-auto-plan passes on a good transcript and fails on a Go? gate or a missing route line", () => {
  const c = scenarios.find((x) => x.id === "go-auto-plan");
  const good = [tool("Agent", { subagent_type: "hitl:work-router", prompt: "Description: …" }), tool("Bash", { command: "hitl-index route --json" }),
    text("🧭 /hitl:plan — a new feature that admins will use"), tool("Skill", { skill: "hitl:plan", args: "Admins export all users as CSV" }), text("🌳 Round 1 …")];
  const g = grade(c, good);
  for (const k of c.checks) assert.ok(g[k].ok, `${k}: ${g[k].why}`);
  const bad = grade(c, [tool("Agent", { subagent_type: "hitl:work-router" }), text("I suggest /hitl:plan. Go? (Y/n)"), tool("Skill", { skill: "plan" })]);
  assert.equal(bad.go_no_confirm_gate.ok, false); assert.equal(bad.go_route_line.ok, false); assert.equal(bad.go_invoked.ok, false); assert.equal(bad.go_route_cli.ok, false);
});

test("evals (dry): go-manual-tdd fails when the router runs or the skill comes before the 🧭 line", () => {
  const c = scenarios.find((x) => x.id === "go-manual-tdd");
  const good = grade(c, [text("🧭 /hitl:tdd — --tdd chosen"), tool("Skill", { skill: "hitl:tdd", args: "make UserService reject …" }), text("**Q1** Seams … Reply:")]);
  for (const k of ["go_no_router", "go_route_line", "go_invoked", "tdd_seam_gate", "tdd_no_writes_before_gate"]) assert.ok(good[k].ok, `${k}: ${good[k].why}`);
  const bad = grade(c, [tool("Agent", { subagent_type: "hitl:work-router" }), tool("Skill", { skill: "hitl:tdd" }), text("🧭 /hitl:tdd")]);
  assert.equal(bad.go_no_router.ok, false); assert.match(bad.go_invoked.why, /before the 🧭 line/);
});
