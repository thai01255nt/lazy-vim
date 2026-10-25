// 0.4 — `hitl-index migrate`: legacy .claude/custom/ → .hitl/ (dry-run, move + rewrite, gitignore merge, conflicts),
// and the legacy notice from the CLI.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { rewriteRefs } from "../../scripts/cmd/migrate.mjs";

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../scripts/hitl-index.mjs");
const NOTICE = "⚠️ HITL: legacy dir .claude/custom/ — run hitl-index migrate";
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 });
  return { code: r.status, out: r.stdout, err: r.stderr };
};
const w = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const r = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const ex = (root, rel) => fs.existsSync(path.join(root, rel));

function legacyProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-mig-"));
  w(root, ".claude/custom/hitl.config.json", JSON.stringify({ schema: "hitl.config/1", customAdapters: { cobol: ".claude/custom/adapters/cobol.mjs", x: "tools/x.mjs" }, trace: { mdOut: ".claude/custom/index/trace.md" } }));
  w(root, ".claude/custom/.gitignore", "# hitl\nindex/*\n!index/skeleton.lock.json\nmy-own-line\n");
  w(root, ".claude/custom/tasks/feat-a.md", "# Tasks\n← Planning: .claude/custom/planning/feat-a.md\n");
  w(root, ".claude/custom/planning/feat-a.md", "# Plan\n> status: draft | tasks: .claude/custom/tasks/feat-a.md\n");
  w(root, ".claude/custom/index/skeleton.lock.json", "{}");
  w(root, ".claude/custom/index/state.json", JSON.stringify({ reviews: { "T-1": { report: ".claude/custom/reviews/T-1.review.md" } } }));
  w(root, ".claude/custom/reviews/T-1.review.md", "# Review T-1\n");
  w(root, ".claude/custom/adapters/cobol.mjs", "export default {};\n");
  w(root, ".claude/custom/linear.map.json", "{}");
  w(root, ".claude/custom/notes.txt", "mine\n");
  w(root, ".claude/settings.json", "{}");
  return root;
}

test("rewriteRefs replaces every legacy prefix and nothing else", () => {
  assert.equal(rewriteRefs("a .claude/custom/x and .claude/custom/y .claude/settings.json"), "a .hitl/x and .hitl/y .claude/settings.json");
});

test("CLI prints the legacy notice and init refuses an empty .hitl/ next to a legacy dir", () => {
  const root = legacyProject();
  const st = cli(root, "status");
  assert.ok((st.out + st.err).includes(NOTICE), st.out + st.err);
  const soft = cli(root, "status", "--brief", "--soft");
  assert.equal(soft.code, 0); assert.equal(soft.out.trim(), NOTICE);
  const init = cli(root, "init");
  assert.equal(init.code, 1); assert.match(init.out, /run hitl-index migrate.*--fresh/);
  assert.ok(!ex(root, ".hitl"));
});

test("migrate --dry-run changes nothing; migrate moves hitl entries, rewrites paths, merges .gitignore, keeps unknown files", () => {
  const root = legacyProject();
  const dry = cli(root, "migrate", "--dry-run");
  assert.equal(dry.code, 0, dry.err);
  assert.match(dry.out, /would move \.claude\/custom\/ → \.hitl\/: .*tasks\//);
  assert.match(dry.out, /left in place \(not hitl's\): \.claude\/custom\/notes\.txt/);
  assert.ok(!ex(root, ".hitl") && ex(root, ".claude/custom/tasks/feat-a.md"));

  const res = cli(root, "--json", "migrate");
  assert.equal(res.code, 0, res.err);
  const j = JSON.parse(res.out);
  assert.equal(j.status, "ok");
  assert.deepEqual(j.moved.sort(), ["adapters", "hitl.config.json", "index", "linear.map.json", "planning", "reviews", "tasks"]);
  assert.deepEqual(j.unknown, [".claude/custom/notes.txt"]);
  const cfg = JSON.parse(r(root, ".hitl/hitl.config.json"));
  assert.deepEqual(cfg.customAdapters, { cobol: ".hitl/adapters/cobol.mjs", x: "tools/x.mjs" });
  assert.equal(cfg.trace.mdOut, ".hitl/index/trace.md");
  assert.match(r(root, ".hitl/tasks/feat-a.md"), /← Planning: \.hitl\/planning\/feat-a\.md/);
  assert.match(r(root, ".hitl/index/state.json"), /"\.hitl\/reviews\/T-1\.review\.md"/);
  const gi = r(root, ".hitl/.gitignore");
  for (const l of ["index/*", "!index/skeleton.lock.json", "my-own-line", "reviews/*/*", "!reviews/*/decisions.json", ".inbox/"]) assert.ok(gi.split("\n").includes(l), l);
  assert.ok(ex(root, ".claude/custom/notes.txt") && !ex(root, ".claude/custom/.gitignore") && ex(root, ".claude/settings.json"));
  // the project now resolves to .hitl/; no notice; a second run has nothing to do
  const st = cli(root, "status");
  assert.ok(!(st.out + st.err).includes(NOTICE));
  fs.rmSync(path.join(root, ".claude/custom/notes.txt"));
  fs.rmdirSync(path.join(root, ".claude/custom"));
  assert.match(cli(root, "migrate").out, /nothing to migrate/);
});

test("migrate refuses when .hitl/ already holds conflicting content (nothing moved); empty target dirs are fine", () => {
  const root = legacyProject();
  w(root, ".hitl/tasks/feat-a.md", "# other\n");
  fs.mkdirSync(path.join(root, ".hitl/docs"), { recursive: true });
  const res = cli(root, "migrate");
  assert.equal(res.code, 1);
  assert.match(res.err, /refused — \.hitl\/ already has: \.hitl\/tasks\//);
  assert.ok(ex(root, ".claude/custom/tasks/feat-a.md") && ex(root, ".claude/custom/hitl.config.json"));
  fs.rmSync(path.join(root, ".hitl/tasks"), { recursive: true });
  fs.mkdirSync(path.join(root, ".hitl/tasks"));
  w(root, ".hitl/.gitignore", "custom-target-line\n");
  const ok = cli(root, "migrate");
  assert.equal(ok.code, 0, ok.err);
  assert.ok(ex(root, ".hitl/tasks/feat-a.md"));
  const gi = r(root, ".hitl/.gitignore").split("\n");
  assert.equal(gi[0], "custom-target-line"); assert.ok(gi.includes("my-own-line") && gi.includes(".inbox/"));
});

test("inside git: dry-run prints git mv lines for tracked entries; migrate prints the git add hint and never stages", (t) => {
  if (spawnSync("git", ["--version"]).status !== 0) return t.skip("git not available");
  const root = legacyProject();
  const g = (...a) => spawnSync("git", a, { cwd: root, encoding: "utf8" });
  g("init", "-q"); g("add", ".claude/custom/tasks", ".claude/custom/hitl.config.json");
  const dry = cli(root, "migrate", "--dry-run");
  assert.match(dry.out, /git mv \.claude\/custom\/tasks \.hitl\/tasks/);
  assert.match(dry.out, /git mv \.claude\/custom\/hitl\.config\.json \.hitl\/hitl\.config\.json/);
  assert.ok(!/git mv \.claude\/custom\/reviews/.test(dry.out));
  const res = cli(root, "migrate");
  assert.match(res.out, /git add -A -- \.claude\/custom \.hitl/);
  assert.deepEqual(g("diff", "--cached", "--name-only").stdout.trim().split("\n").sort(), [".claude/custom/hitl.config.json", ".claude/custom/tasks/feat-a.md"]);
});
