// design v3 §8 — `hitl-index migrate --specs`: v0.5 planning/tasks → change folders. Round trip on the legacy ts-app fixture
// (same AC↔test links, no block items, @dec still resolves), dry run, refusals, --map, key collisions, --archive-done.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { deriveKey, deriveCapability, stepsOf, statementOf, shortTitle } from "../../scripts/lib/migratespecs.mjs";
import { buildTrace, loadTraceInputs, specLinksFor } from "../../scripts/lib/trace.mjs";
import { updateIndex } from "../../scripts/lib/api.mjs";
import { loadConfig } from "../../scripts/lib/config.mjs";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLI = path.join(PLUGIN, "scripts/hitl-index.mjs");
const cli = (cwd, ...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 60000 }); return { code: r.status, out: r.stdout, err: r.stderr }; };
const w = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const ex = (root, rel) => fs.existsSync(path.join(root, rel));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "hitl-migspec-"));
function listAll(dir, pre = "") {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? listAll(path.join(dir, e.name), `${pre}${e.name}/`) : [`${pre}${e.name}`])).sort();
}
function copy(fixture) {
  const d = tmp(); fs.cpSync(path.join(PLUGIN, "tests/fixtures", fixture), d, { recursive: true });
  if (!ex(d, ".hitl/hitl.config.json")) w(d, ".hitl/hitl.config.json", JSON.stringify({ schema: "hitl.config/1" }));
  return d;
}
const acLinks = (tr) => Object.fromEntries(tr.rows.flatMap((r) => [...r.acs, ...r.scenarios.flatMap((s) => s.acs)]).map((a) => [a.id, a.tests.map((t) => t.id).sort()]));

test("helpers: key/capability derivation, Given/When/Then split, statement keyword, short titles", () => {
  assert.equal(deriveCapability("feat-user-register"), "user-register");
  assert.equal(deriveKey("user-register"), "UR");
  assert.equal(deriveKey("discount"), "DISC");
  assert.equal(deriveKey("a-b-c-d-e"), "ABCD");
  assert.equal(deriveKey("x"), "XX");
  assert.equal(deriveKey("2fa-login"), "C2L");
  assert.deepEqual(stepsOf("Given an existing email in any case When createUser Then throws a duplicate error").steps,
    [{ kw: "GIVEN", text: "an existing email in any case" }, { kw: "WHEN", text: "createUser" }, { kw: "THEN", text: "throws a duplicate error" }]);
  assert.deepEqual(stepsOf("given a and b when c then d And e").steps.map((s) => s.kw), ["GIVEN", "WHEN", "THEN", "AND"], "lowercase 'and' is prose");
  const f = stepsOf("the total is rounded");
  assert.deepEqual([f.steps.map((s) => s.kw), f.filled], [["GIVEN", "WHEN", "THEN"], ["WHEN", "THEN"]]);
  assert.equal(statementOf("When x, the system shall y.", "should").text, "When x, the system SHOULD y.");
  assert.deepEqual(statementOf("Totals are rounded.", "could"), { text: "Totals are rounded (MAY).", keywordAdded: true });
  assert.equal(shortTitle("a".repeat(30) + " " + "b".repeat(40)), "a".repeat(30) + "…");
});

test("round trip on the legacy ts-app: same AC↔test links, no block items, @dec resolves, validate clean", async () => {
  const root = copy("ts-app");
  const config = await loadConfig(root);
  await updateIndex(root, null, { full: true });
  const before = buildTrace(await loadTraceInputs(root, config), { kind: "all" });
  assert.equal(before.counts.block, 0);
  const r = cli(root, "migrate", "--specs", "--json");
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.equal(out.schema, "hitl.migrate-specs/1");
  assert.deepEqual(out.plan[0].ids, { "R-1": "UR-R1", "R-2": "UR-R2" });
  assert.deepEqual(out.plan[0].scenarios, { "T-1.AC1": ["UR-R1.S1"], "T-1.AC2": ["UR-R2.S1"] });
  const C = ".hitl/changes/feat-user-register";
  for (const f of ["proposal.md", "design.md", "tasks.md", "specs/user-register/spec.md", ".legacy/planning.md"]) assert.ok(ex(root, `${C}/${f}`), f);
  assert.ok(!ex(root, ".hitl/planning/feat-user-register.md") && !ex(root, ".hitl/tasks/feat-user-register.md"));
  assert.match(rd(root, `${C}/tasks.md`), /^← Change: feat-user-register$/m);
  assert.match(rd(root, `${C}/tasks.md`), /- \[ \] T-1\.AC1 \(UR-R1\.S1\) Given an existing email/);
  assert.match(rd(root, `${C}/design.md`), /\| D-1 \| Duplicate check in UserService\.createUser \| single entry point \|  \| duplicates slip in \| UR-R1, UR-R2 \| accepted \|/);
  assert.match(rd(root, `${C}/design.md`), /## Components\n### Legacy design tree \(v0\.5\)\n#### Level 1 - Components/);
  assert.match(rd(root, `${C}/specs/user-register/spec.md`), /### Requirement: UR-R1 .+ <!-- migrated -->\nIf a user registers .+ the system SHALL reject the registration\./);
  const v = cli(root, "spec", "validate", "--json");
  assert.equal(v.code, 0, v.out);
  assert.equal(JSON.parse(v.out).counts.error, 0);
  assert.equal(cli(root, "tasks", "--check", "--quiet").code, 0);
  await updateIndex(root, null, { full: true });
  const inputs = await loadTraceInputs(root, config);
  const after = buildTrace(inputs, { kind: "all" });
  assert.equal(after.counts.block, 0, JSON.stringify(after.items.filter((i) => i.level === "block")));
  assert.deepEqual(acLinks(after), acLinks(before), "same AC ↔ test links");
  const cu = "src/services/userService.ts#UserService.createUser";
  assert.deepEqual(after.decisions.find((d) => d.id === "D-1").symbols, [cu], "@dec D-1 still resolves");
  assert.equal(specLinksFor(inputs, cu).change, "feat-user-register");
  assert.ok(!after.items.some((i) => i.code === "DEC_UNKNOWN"));
  assert.equal(cli(root, "migrate", "--specs", "--json").code, 0, "second run: nothing to migrate");
});

test("--dry-run writes nothing; a planning without a tasks file; deferred/dropped requirements", () => {
  const root = tmp();
  w(root, ".hitl/hitl.config.json", JSON.stringify({ schema: "hitl.config/1" }));
  w(root, ".hitl/planning/fix-cart-total.md", `# Cart Total - Planning
> status: draft | updated: 2026-10-01

## Goal
Totals must be right.

## Requirements
- R-1 [must] When the cart changes, the system shall recompute the total.
- R-2 [should] The system shall show a breakdown. (status: deferred)
- R-3 [could] Totals are rounded. (status: dropped)

## Decisions
| id | decision | why | cost if wrong | serves | status |
|----|----------|-----|---------------|--------|--------|
| D-1 | Recompute on every change | simple | slow | R-1, R-3 | accepted |
`);
  const files0 = listAll(root);
  const r = cli(root, "migrate", "--specs", "--dry-run", "--json");
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(listAll(root), files0, "dry run wrote nothing");
  const p = JSON.parse(r.out).plan[0];
  assert.deepEqual([p.change, p.capability, p.key, p.target], ["fix-cart-total", "cart-total", "CT", "changes"]);
  assert.deepEqual(p.moves, [[".hitl/planning/fix-cart-total.md", ".hitl/changes/fix-cart-total/.legacy/planning.md"]]);
  assert.deepEqual(p.creates, [".hitl/changes/fix-cart-total/design.md", ".hitl/changes/fix-cart-total/proposal.md", ".hitl/changes/fix-cart-total/specs/cart-total/spec.md"]);
  assert.ok(JSON.parse(r.out).warnings.some((x) => /CT-R1 has no AC → no scenario/.test(x)));
  assert.equal(cli(root, "migrate", "--specs").code, 0);
  const C = ".hitl/changes/fix-cart-total";
  assert.match(rd(root, `${C}/proposal.md`), /## Deferred\n- R-2 The system shall show a breakdown\./);
  assert.match(rd(root, `${C}/specs/cart-total/spec.md`), /## Retired IDs <!-- migrated -->\n- CT-R3 Totals are rounded — dropped/);
  assert.match(rd(root, `${C}/design.md`), /\| D-1 \| Recompute on every change \| simple \|  \| slow \| CT-R1 \| accepted \|/);
  const v = JSON.parse(cli(root, "spec", "validate", "--json").out);
  assert.equal(v.counts.error, 0, JSON.stringify(v.items));
  assert.ok(v.items.some((i) => i.code === "REQ_NO_SCENARIO" && i.level === "warn"));
});

test("refuses with nothing written: existing change dir, --map key of another living capability, bad --map", () => {
  const root = copy("ts-app");
  w(root, ".hitl/changes/feat-user-register/proposal.md", "x");
  const files0 = listAll(root);
  let r = cli(root, "migrate", "--specs", "--json");
  assert.equal(r.code, 1);
  assert.deepEqual(JSON.parse(r.out).conflicts.map((c) => c.code), ["CHANGE_EXISTS"]);
  assert.deepEqual(listAll(root), files0);

  const app = copy("spec-app");
  w(app, ".hitl/planning/feat-bill.md", "# Bill - Planning\n> status: approved\n\n## Requirements\n- R-1 [must] When asked, the system shall bill.\n");
  const files1 = listAll(app);
  r = cli(app, "migrate", "--specs", "--map", JSON.stringify({ "feat-bill": { capability: "billing", key: "ACC" } }), "--json");
  assert.equal(r.code, 1);
  assert.deepEqual(JSON.parse(r.out).conflicts.map((c) => c.code), ["CAP_KEY_DUP"]);
  r = cli(app, "migrate", "--specs", "--map", JSON.stringify({ "feat-bill": { capability: "accounts", key: "ACX" } }), "--json");
  assert.deepEqual(JSON.parse(r.out).conflicts.map((c) => c.code), ["CAP_KEY_CHANGED"]);
  assert.equal(cli(app, "migrate", "--specs", "--map", "{nope").code, 2);
  assert.equal(cli(app, "migrate", "--specs", "feat-nope", "--json").code, 1);
  assert.deepEqual(listAll(app), files1);
});

test("--map onto an existing capability renumbers taken ids; a derived key that collides gets a digit", () => {
  const app = copy("spec-app");
  w(app, ".hitl/planning/feat-bill.md", "# Bill - Planning\n> status: approved\n\n## Goal\nBill.\n\n## Requirements\n- R-1 [must] When asked, the system shall bill.\n");
  w(app, ".hitl/planning/feat-acc.md", "# Acc - Planning\n> status: approved\n\n## Goal\nAcc.\n\n## Requirements\n- R-1 [must] When asked, the system shall do it.\n");
  const r = cli(app, "migrate", "--specs", "--map", JSON.stringify({ "feat-bill": { capability: "accounts" } }), "--json");
  assert.equal(r.code, 0, r.err + r.out);
  const plan = JSON.parse(r.out).plan;
  const bill = plan.find((p) => p.change === "feat-bill"), acc = plan.find((p) => p.change === "feat-acc");
  assert.deepEqual([bill.capability, bill.key, bill.ids], ["accounts", "ACC", { "R-1": "ACC-R7" }]);
  assert.deepEqual([acc.capability, acc.key], ["acc", "ACC2"]);
  const delta = rd(app, ".hitl/changes/feat-bill/specs/accounts/spec.md");
  assert.ok(!/## Purpose/.test(delta), "existing capability: no Purpose");
  assert.match(rd(app, ".hitl/changes/feat-bill/proposal.md"), /\| accounts \| ACC \| modified \| \+ACC-R7 \|/);
  const v = JSON.parse(cli(app, "spec", "validate", "--json").out);
  assert.equal(v.counts.error, 0, JSON.stringify(v.items.filter((i) => i.level === "error")));
});

test("--archive-done archives a change whose tasks are all done (seeds the living spec); linear.map.json keys migrate", () => {
  const root = tmp();
  w(root, ".hitl/hitl.config.json", JSON.stringify({ schema: "hitl.config/1" }));
  w(root, ".hitl/planning/feat-tags.md", "# Tags - Planning\n> status: approved | tasks: .hitl/tasks/feat-tags.md\n\n## Goal\nLet users tag notes.\n\n## Requirements\n- R-1 [must] When a user adds a tag, the system shall show it on the note.\n");
  w(root, ".hitl/tasks/feat-tags.md", "# Tags Tasks\n← Planning: .hitl/planning/feat-tags.md\n> status: approved\n\n## T-1 Add tag\n- prio: P1 | risk: low | impl: agent | blocked-by: none | status: done\n\n### Acceptance criteria\n- [x] T-1.AC1 (R-1) Given a note When a tag is added Then the note shows it\n\n### Test plan\n| ac | kind | oracle | seam | author |\n|----|------|--------|------|--------|\n| AC1 | example | spec | notes | test-author |\n");
  w(root, ".hitl/index/skeleton.lock.json", JSON.stringify({ schema: "hitl.lock/1", symbols: {}, tests: {}, tasks: { "T-1": { doneAt: "2026-10-01T00:00:00Z", doneBodyHashes: {} } } }));
  w(root, ".hitl/linear.map.json", JSON.stringify({ schema: "hitl.linear-map/1", planning: { "feat-tags.md": { kind: "project", id: "p-1" } }, tasks: { "T-1": { issue: "ENG-1", id: "i-1", planning: "feat-tags.md" } } }));
  const d = JSON.parse(cli(root, "migrate", "--specs", "--archive-done", "--dry-run", "--json").out);
  assert.equal(d.plan[0].target, "archive");
  const r = cli(root, "migrate", "--specs", "--archive-done", "--json");
  assert.equal(r.code, 0, r.err);
  const out = JSON.parse(r.out);
  assert.equal(out.archived[0].ok, true, JSON.stringify(out.archived));
  assert.ok(!ex(root, ".hitl/changes/feat-tags"));
  const arch = fs.readdirSync(path.join(root, ".hitl/archive"));
  assert.equal(arch.length, 1); assert.match(arch[0], /^\d{4}-\d{2}-\d{2}-feat-tags$/);
  assert.match(rd(root, ".hitl/specs/tags/spec.md"), /### Requirement: TAGS-R1 /);
  assert.match(rd(root, ".hitl/specs/tags/spec.md"), /#### Scenario: TAGS-R1\.S1 /);
  const map = JSON.parse(rd(root, ".hitl/linear.map.json"));
  assert.deepEqual([map.changes, "planning" in map, map.tasks["T-1"].change], [{ "feat-tags": { kind: "project", id: "p-1" } }, false, "feat-tags"]);
  const tr = JSON.parse(cli(root, "trace", "--json").out);
  assert.equal(tr.counts.block, 0, JSON.stringify(tr.items));
});

test("migrate without --specs rejects spec flags", () => {
  const root = tmp();
  assert.equal(cli(root, "migrate", "--archive-done").code, 2);
});
