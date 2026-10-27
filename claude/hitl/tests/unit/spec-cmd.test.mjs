// v3 spec layer — `hitl-index spec …` and `hitl-index change`: exact JSON shapes (design v3 §6) and exit codes.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "../../scripts/hitl-index.mjs");
const FIX = path.resolve(HERE, "../fixtures/spec-app");
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};
const project = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-scmd-")); fs.cpSync(FIX, root, { recursive: true }); return root; };
const keys = (o) => Object.keys(o).sort();

test("spec validate --json: hitl.spec-validate/1 shape, exit 0 clean / 1 on error, --strict", () => {
  const root = project();
  const r = cli(root, "spec", "validate", "--json");
  assert.equal(r.code, 0, r.err);
  const d = r.json();
  assert.deepEqual(keys(d), ["counts", "items", "ok", "schema", "summary", "targets"]);
  assert.equal(d.schema, "hitl.spec-validate/1");
  assert.deepEqual(d.targets.map((t) => [t.kind, t.id]), [["living", "accounts"], ["living", "GLOSSARY"], ["change", "feat-password-reset"]]);
  assert.deepEqual(keys(d.targets[2]), ["files", "id", "kind"]);
  assert.deepEqual(d.summary, [{ change: "feat-password-reset", capability: "accounts", key: "ACC", new: false, added: ["ACC-R5", "ACC-R6", "ACC-BR1", "ACC-UC1"],
    modified: ["ACC-R1"], removed: ["ACC-R2"], terms: { added: ["Reset link"], modified: [], removed: [] } }]);
  // an error: item shape, exit 1
  const f = path.join(root, ".hitl/changes/feat-password-reset/specs/accounts/spec.md");
  fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace(/#### Scenario: ACC-R6\.S1[\s\S]*?(?=\n## MODIFIED)/, ""));
  const bad = cli(root, "spec", "validate", "feat-password-reset", "--json");
  assert.equal(bad.code, 1);
  const item = bad.json().items.find((i) => i.code === "REQ_NO_SCENARIO");
  assert.deepEqual(keys(item), ["code", "file", "level", "line", "message", "ref"]);
  assert.deepEqual([item.level, item.file, item.ref], ["error", ".hitl/changes/feat-password-reset/specs/accounts/spec.md", "ACC-R6"]);
  // --strict turns a warning into a failure
  const root2 = project();
  fs.writeFileSync(path.join(root2, ".hitl/changes/feat-password-reset/contracts/extra.md"), "x\n");
  assert.equal(cli(root2, "spec", "validate", "--json").code, 0);
  assert.equal(cli(root2, "spec", "validate", "--strict", "--json").code, 1);
  assert.equal(cli(root2, "spec", "validate", "feat-nope").code, 1);
});

test("spec list --json: hitl.spec-list/1", () => {
  const d = cli(project(), "spec", "list", "--json").json();
  assert.deepEqual(keys(d), ["capabilities", "pending", "schema"]);
  assert.equal(d.schema, "hitl.spec-list/1");
  const c = d.capabilities[0];
  assert.deepEqual(keys(c), ["activeChanges", "capability", "file", "flows", "key", "purpose", "requirements", "retired", "rules"]);
  assert.deepEqual(c.requirements[2], { id: "ACC-R3", title: "Two-factor code", priority: "must", quality: "security", scenarios: 1 });
  assert.deepEqual([c.retired, c.activeChanges, d.pending], [["ACC-R4"], ["feat-password-reset"], []]);
});

test("spec show: effective view per change; living view without --change; exit 1 when absent", () => {
  const root = project();
  const s = cli(root, "spec", "show", "ACC-R5.S2", "--change", "feat-password-reset", "--json");
  assert.equal(s.code, 0, s.err);
  const d = s.json();
  assert.deepEqual(keys(d), ["blocks", "change", "scenario", "schema", "view"]);
  assert.deepEqual([d.schema, d.change, d.view, d.blocks.length], ["hitl.spec-show/1", "feat-password-reset", "change", 1]);
  for (const k of ["kind", "id", "title", "text", "origin"]) assert.ok(k in d.blocks[0], k);
  assert.deepEqual([d.blocks[0].id, d.blocks[0].origin], ["ACC-R5", "added"]);
  assert.equal(cli(root, "spec", "show", "ACC-R5").code, 1);
  const lv = cli(root, "spec", "show", "accounts", "--json").json();
  assert.deepEqual([lv.view, lv.change, lv.blocks.map((b) => b.id)], ["living", null, ["ACC-R1", "ACC-R2", "ACC-R3"]]);
  const all = cli(root, "spec", "show", "--change", "feat-password-reset", "--json").json();
  assert.ok(all.blocks.some((b) => b.origin === "modified" && b.id === "ACC-R1") && !all.blocks.some((b) => b.id === "ACC-R2"));
  assert.match(cli(root, "spec", "show", "ACC-R3").out, /### Requirement: ACC-R3 Two-factor code/);
});

test("spec next-id: plain id, JSON list with --count/--json, scenarios, usage errors", () => {
  const root = project();
  assert.equal(cli(root, "spec", "next-id", "accounts").out.trim(), "ACC-R7");
  assert.deepEqual(JSON.parse(cli(root, "spec", "next-id", "accounts", "--count", "2").out), ["ACC-R7", "ACC-R8"]);
  assert.deepEqual(JSON.parse(cli(root, "spec", "next-id", "accounts", "--kind", "BR", "--json").out), ["ACC-BR2"]);
  assert.equal(cli(root, "spec", "next-id", "--scenario", "ACC-R1").out.trim(), "ACC-R1.S4");
  assert.equal(cli(root, "spec", "next-id").code, 2);
  assert.equal(cli(root, "spec", "next-id", "accounts", "--kind", "X").code, 2);
  assert.equal(cli(root, "spec", "next-id", "billing").code, 1);
  assert.equal(cli(root, "spec", "bogus").code, 2);
  assert.equal(cli(root, "spec", "validate", "--nope").code, 2);
});

test("spec conflicts --json: hitl.spec-conflicts/1, exit 1 when any", () => {
  const root = project();
  const ok = cli(root, "spec", "conflicts", "--json");
  assert.deepEqual([ok.code, ok.json()], [0, { schema: "hitl.spec-conflicts/1", conflicts: [], warnings: [] }]);
  const dir = path.join(root, ".hitl/changes/feat-2fa-recovery");
  fs.mkdirSync(path.join(dir, "specs/accounts"), { recursive: true });
  fs.writeFileSync(path.join(dir, "specs/accounts/spec.md"), "# Delta: Accounts\n> capability: accounts | key: ACC | change: feat-2fa-recovery\n\n## REMOVED Requirements\n### Requirement: ACC-R1 Sign in\nReason: x\n");
  const bad = cli(root, "spec", "conflicts", "--json");
  assert.equal(bad.code, 1);
  assert.deepEqual(bad.json().conflicts, [{ code: "CROSS_CHANGE_CONFLICT", ref: "ACC-R1", capability: "accounts", changes: ["feat-2fa-recovery", "feat-password-reset"] }]);
});

test("spec merge --dry-run / archive: hitl.spec-merge/1 shape, preconditions, exit codes", () => {
  const root = project();
  const dry = cli(root, "spec", "merge", "feat-password-reset", "--dry-run", "--json");
  assert.equal(dry.code, 0, dry.err + dry.out);
  const d = dry.json();
  assert.deepEqual(keys(d), ["archive", "capabilities", "change", "conflicts", "dryRun", "glossary", "ok", "preconditions", "schema"]);
  assert.deepEqual([d.schema, d.dryRun, d.ok, d.archive, d.preconditions], ["hitl.spec-merge/1", true, true, null, { validate: "ok", tasks: null }]);
  assert.deepEqual(d.capabilities, [{ capability: "accounts", file: ".hitl/specs/accounts/spec.md", created: false, deleted: false,
    added: ["ACC-R5", "ACC-R6", "ACC-BR1", "ACC-UC1"], modified: ["ACC-R1"], removed: ["ACC-R2"], alreadyApplied: [], renumbered: {} }]);
  assert.deepEqual(d.glossary, { added: ["Reset link"], modified: [], removed: [] });
  assert.doesNotMatch(fs.readFileSync(path.join(root, ".hitl/specs/accounts/spec.md"), "utf8"), /ACC-R5/);

  const blocked = cli(root, "spec", "archive", "feat-password-reset", "--json");
  assert.equal(blocked.code, 1);
  const b = blocked.json();
  assert.equal(b.ok, false);
  assert.deepEqual(b.preconditions.tasks, { total: 2, done: 1, notDone: ["T-13"] });
  assert.deepEqual(keys(b.archive), ["from", "moved", "to"]);
  assert.match(b.archive.to, /^\.hitl\/archive\/\d{4}-\d{2}-\d{2}-feat-password-reset$/);
  assert.equal(b.archive.moved, false);
  assert.ok(fs.existsSync(path.join(root, ".hitl/changes/feat-password-reset")));

  const done = cli(root, "spec", "archive", "feat-password-reset", "--force", "--json");
  assert.equal(done.code, 0, done.out);
  const a = done.json();
  assert.equal(a.archive.moved, true);
  assert.ok(fs.existsSync(path.join(root, a.archive.to, "tasks.md")));
  assert.match(fs.readFileSync(path.join(root, ".hitl/specs/accounts/spec.md"), "utf8"), /### Requirement: ACC-R5 Reset password by email/);
  assert.equal(cli(root, "spec", "archive", "feat-password-reset").code, 1);
  assert.equal(cli(root, "spec", "merge").code, 2);
});

test("change --json: hitl.change/1 shape; unknown id exit 1; not initialized exit 3", () => {
  const root = project();
  const d = cli(root, "change", "--json").json();
  assert.equal(d.schema, "hitl.change/1");
  assert.deepEqual(keys(d.changes[0]), ["archived", "capabilities", "contracts", "design", "dir", "id", "next", "phase", "proposal", "taskCounts", "tasks", "tasksFile", "title"]);
  assert.deepEqual(d.changes.map((c) => [c.id, c.phase]), [["feat-password-reset", "implement"], ["feat-2fa", "archived"]]);
  assert.deepEqual(cli(root, "change", "feat-2fa", "--json").json().changes.map((c) => c.dir), [".hitl/archive/2026-10-20-feat-2fa"]);
  assert.equal(cli(root, "change", "feat-nope").code, 1);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-none-"));
  assert.equal(cli(empty, "change").code, 3);
  assert.equal(cli(empty, "spec", "list").code, 3);
});
