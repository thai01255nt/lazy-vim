// v3 spec layer — merge (lib/specmerge.mjs) and the atomic merge/archive runner (lib/changes.mjs runMerge).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseLivingSpec, parseDelta, parseGlossary, blockHash } from "../../scripts/lib/specmd.mjs";
import { mergeChange, planCapability, planGlossary, renderLiving, livingModel, GLOSSARY_REL } from "../../scripts/lib/specmerge.mjs";
import { runMerge, resetStatusCache } from "../../scripts/lib/changes.mjs";
import { today } from "../../scripts/lib/specids.mjs";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/spec-app");
const D = "2026-11-02";
const LIVING = `# Accounts
> capability: accounts | key: ACC | updated: 2026-10-20

## Purpose
Sign in.

## Requirements

### Requirement: ACC-R1 Sign in
The system SHALL sign users in.

#### Scenario: ACC-R1.S1 Ok
- WHEN ok
- THEN in

#### Scenario: ACC-R1.S2 Bad
- WHEN bad
- THEN out

### Requirement: ACC-R2 Remember me
The system SHOULD remember.

#### Scenario: ACC-R2.S1 Back
- WHEN back
- THEN in

## Retired IDs
- ACC-R4 Questions — removed by feat-2fa (2026-10-20): gone

## Change History
- 2026-10-20 feat-2fa: -ACC-R4
`;
const REQ = (id, title = "Title", stmt = "The system SHALL do it.", scn = [[`${id}.S1`, "Ex"]]) =>
  `### Requirement: ${id} ${title}\n${stmt}\n\n${scn.map(([s, t]) => `#### Scenario: ${s} ${t}\n- WHEN a\n- THEN b\n`).join("\n")}`;
const delta = (body, cap = "accounts", key = "ACC") => parseDelta(`# Delta: Accounts\n> capability: ${cap} | key: ${key} | change: feat-y\n\n${body}`, "d.md");
const living = (text = LIVING) => parseLivingSpec(text, ".hitl/specs/accounts/spec.md");
const plan = (d, extra = {}) => planCapability({ living: living(), delta: d, change: "feat-y", date: D, ...extra });

test("apply order REMOVED → MODIFIED → ADDED; history, tombstones and meta updated", () => {
  const d = delta(`## ADDED Requirements\n${REQ("ACC-R6")}\n${REQ("ACC-R5")}\n## MODIFIED Requirements\n${REQ("ACC-R1", "Sign in", "The system SHALL sign users in, any case.", [["ACC-R1.S1", "Ok"]])}Changed: any case\n\n## REMOVED Requirements\n### Requirement: ACC-R2 Remember me\nReason: unsafe\n\n## ADDED Rules\n### Rule: ACC-BR1 Lock\nFive strikes.\n`);
  const r = plan(d);
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual([r.added, r.modified, r.removed], [["ACC-R5", "ACC-R6", "ACC-BR1"], ["ACC-R1"], ["ACC-R2"]]);
  const text = renderLiving(r.model);
  const doc = living(text);
  assert.deepEqual(doc.items.filter((i) => i.level === "error"), []);
  assert.deepEqual(doc.blocks.map((b) => b.id), ["ACC-R1", "ACC-R5", "ACC-R6", "ACC-BR1"]);
  assert.equal(doc.updated, D);
  assert.match(text, /^- ACC-R2 Remember me — removed by feat-y \(2026-11-02\): unsafe$/m);
  assert.match(text, /^- ACC-R1\.S2 Bad — removed by feat-y \(2026-11-02\): dropped from ACC-R1$/m, "dropped scenario is tombstoned");
  assert.match(text, /^- 2026-11-02 feat-y: \+ACC-R5 \+ACC-R6 \+ACC-BR1 ~ACC-R1 -ACC-R2 — ACC-R1: any case$/m);
  assert.doesNotMatch(text, /Changed:/);
  assert.match(text, /## Rules\n\n### Rule: ACC-BR1 Lock/);
});

test("idempotent re-run: everything alreadyApplied, no change, no write", () => {
  const d = delta(`## ADDED Requirements\n${REQ("ACC-R5")}\n## MODIFIED Requirements\n${REQ("ACC-R1", "Sign in", "The system SHALL sign in.")}Changed: x\n\n## REMOVED Requirements\n### Requirement: ACC-R2 Remember me\nReason: unsafe\n`);
  const first = plan(d);
  const text = renderLiving(first.model);
  const again = planCapability({ living: living(text), delta: d, change: "feat-y", date: D });
  assert.deepEqual(again.conflicts, []);
  assert.deepEqual(again.alreadyApplied.sort(), ["ACC-R1", "ACC-R2", "ACC-R5"]);
  assert.equal(again.changed, false);
  const m = mergeChange({ changeId: "feat-y", deltas: [d], living: new Map([["accounts", { doc: living(text), text }]]), date: D });
  assert.deepEqual(m.writes, []);
  assert.deepEqual(m.conflicts, []);
});

test("new capability: created with Purpose; non-ADDED and missing Purpose are conflicts", () => {
  const d = parseDelta(`# Delta: Billing\n> capability: billing | key: BIL | change: feat-y\n\n## Purpose\nInvoices.\n\n## ADDED Requirements\n${REQ("BIL-R1")}`, "d");
  const m = mergeChange({ changeId: "feat-y", deltas: [d], living: new Map(), date: D });
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.capabilities[0].created, true);
  assert.equal(m.writes[0].file, ".hitl/specs/billing/spec.md");
  const doc = parseLivingSpec(m.writes[0].text, "x");
  assert.equal(doc.purpose, "Invoices.");
  assert.equal(doc.key, "BIL");
  assert.deepEqual(doc.items.filter((i) => i.level === "error"), []);
  const bad = parseDelta(`# Delta: Billing\n> capability: billing | key: BIL | change: feat-y\n\n## MODIFIED Requirements\n${REQ("BIL-R1")}Changed: x\n`, "d");
  const r = planCapability({ living: null, delta: bad, change: "feat-y", date: D });
  assert.deepEqual(r.conflicts.map((c) => c.code).sort(), ["DELTA_NEW_CAP_NOT_ADDED_ONLY", "PURPOSE_MISSING"]);
  const dup = parseDelta(`# Delta: Billing\n> capability: billing | key: ACC | change: feat-y\n\n## Purpose\nx\n\n## ADDED Requirements\n${REQ("ACC-R9")}`, "d");
  const m2 = mergeChange({ changeId: "feat-y", deltas: [dup], living: new Map([["accounts", { doc: living(), text: LIVING }]]), date: D });
  assert.ok(m2.conflicts.some((c) => c.code === "CAP_KEY_DUP"));
  assert.deepEqual(m2.writes, []);
});

test("retire: an emptied capability is CAP_EMPTY unless the proposal marks it retired (then deleted)", () => {
  const d = delta("## REMOVED Requirements\n### Requirement: ACC-R1 Sign in\nReason: x\n### Requirement: ACC-R2 Remember me\nReason: y\n");
  assert.deepEqual(plan(d).conflicts.map((c) => c.code), ["CAP_EMPTY"]);
  const m = mergeChange({ changeId: "feat-y", deltas: [d], proposal: { capabilities: [{ capability: "accounts", change: "retired" }] },
    living: new Map([["accounts", { doc: living(), text: LIVING }]]), date: D });
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.capabilities[0].deleted, true);
  assert.deepEqual(m.writes, [{ file: ".hitl/specs/accounts/spec.md", text: null }]);
});

test("ADDED id taken: DELTA_ID_TAKEN, or --renumber past living, retired and reserved ids", () => {
  const d = delta(`## ADDED Requirements\n${REQ("ACC-R2", "Other")}\n${REQ("ACC-R4", "Reuse")}`);
  assert.deepEqual(plan(d).conflicts.map((c) => `${c.code} ${c.ref}`), ["DELTA_ID_TAKEN ACC-R2", "DELTA_ID_TAKEN ACC-R4"]);
  const r = plan(d, { renumber: true, reserved: { R: new Set([5]), BR: new Set(), UC: new Set() } });
  assert.deepEqual(r.conflicts, []);
  assert.deepEqual(r.renumbered, { "ACC-R2": "ACC-R6", "ACC-R4": "ACC-R7" });
  const text = renderLiving(r.model);
  assert.match(text, /### Requirement: ACC-R6 Other\n[\s\S]*#### Scenario: ACC-R6\.S1 Ex/);
  assert.match(text, /### Requirement: ACC-R7 Reuse/);
  assert.match(text, /### Requirement: ACC-R2 Remember me/, "living R2 untouched");
});

test("MODIFIED/REMOVED target missing; retired scenario reuse; SCN_RETITLED warning", () => {
  const d = delta(`## MODIFIED Requirements\n${REQ("ACC-R9")}Changed: x\n\n## REMOVED Requirements\n### Requirement: ACC-R8 X\nReason: y\n`);
  assert.deepEqual(plan(d).conflicts.map((c) => `${c.code} ${c.ref}`), ["DELTA_TARGET_MISSING ACC-R8", "DELTA_TARGET_MISSING ACC-R9"]);
  const text = LIVING.replace("## Retired IDs\n", "## Retired IDs\n- ACC-R1.S3 Old — removed by feat-z (2026-10-21): dropped from ACC-R1\n");
  const reuse = delta(`## MODIFIED Requirements\n${REQ("ACC-R1", "Sign in", "The system SHALL x.", [["ACC-R1.S1", "Renamed"], ["ACC-R1.S3", "Back"]])}Changed: x\n`);
  const r = planCapability({ living: living(text), delta: reuse, change: "feat-y", date: D });
  assert.deepEqual(r.conflicts.map((c) => `${c.code} ${c.ref}`), ["DELTA_ID_TAKEN ACC-R1.S3"]);
  assert.deepEqual(r.warnings.map((w) => `${w.code} ${w.ref}`), ["SCN_RETITLED ACC-R1.S1"]);
});

test("BASE_CHANGED unless --accept-base; accept updates the base hash", () => {
  const d = delta(`## MODIFIED Requirements\n${REQ("ACC-R1", "Sign in", "The system SHALL x.")}Changed: x\n`);
  const base = { "ACC-R1": "sha256:" + "0".repeat(64) };
  assert.deepEqual(plan(d, { base }).conflicts.map((c) => c.code), ["BASE_CHANGED"]);
  const cur = living().blocks[0];
  assert.deepEqual(plan(d, { base: { "ACC-R1": blockHash(cur.livingText) } }).conflicts, []);
  const m = mergeChange({ changeId: "feat-y", deltas: [d], living: new Map([["accounts", { doc: living(), text: LIVING }]]), base, acceptBase: ["ACC-R1"], date: D });
  assert.deepEqual(m.conflicts, []);
  assert.equal(m.base["ACC-R1"], blockHash(cur.livingText));
});

test("glossary merge: add, modify, remove, idempotent, conflicts", () => {
  const liv = parseGlossary("# Glossary\n> updated: 2026-01-01\n\n### Term: Account\nA person.\n\n### Term: Old\nx\n", GLOSSARY_REL);
  const del = parseGlossary("# G\n## ADDED Terms\n### Term: Reset link\nA link.\n## MODIFIED Terms\n### Term: account\nA person or company.\n## REMOVED Terms\n### Term: Old\nReason: gone\n", "g", { delta: true });
  const g = planGlossary({ living: liv, delta: del, date: D });
  assert.deepEqual([g.added, g.modified, g.removed], [["Reset link"], ["account"], ["Old"]]);
  assert.equal(g.model.updated, D);
  const del2 = parseGlossary("# G\n## ADDED Terms\n### Term: Account\nDifferent.\n## MODIFIED Terms\n### Term: Nope\nx\n", "g", { delta: true });
  assert.deepEqual(planGlossary({ living: liv, delta: del2, date: D }).conflicts.map((c) => c.code).sort(), ["DELTA_ID_TAKEN", "DELTA_TARGET_MISSING"]);
  const same = parseGlossary("# G\n## ADDED Terms\n### Term: Account\nA person.\n", "g", { delta: true });
  const s = planGlossary({ living: liv, delta: same, date: D });
  assert.deepEqual([s.alreadyApplied, s.changed], [["Account"], false]);
});

test("living model round-trips through render with no errors", () => {
  const doc = living();
  const text = renderLiving(livingModel(doc));
  const again = living(text);
  assert.deepEqual(again.items.filter((i) => i.level === "error"), []);
  assert.deepEqual(again.blocks.map((b) => b.livingText), doc.blocks.map((b) => b.livingText));
  assert.equal(renderLiving(livingModel(again)), text);
});

// ---------------------------------------------------------------- runner on disk
function copyFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-spec-"));
  fs.cpSync(FIX, root, { recursive: true });
  resetStatusCache();
  return root;
}
const snapshot = (root) => {
  const out = {};
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else out[path.relative(root, p)] = fs.readFileSync(p, "utf8"); } };
  walk(path.join(root, ".hitl"));
  return out;
};

test("atomic: a failing write restores every file; a failing move restores the living specs", async () => {
  const root = copyFixture();
  const before = snapshot(root);
  let n = 0;
  const failSecond = { write: async (abs, text) => { if (++n === 2) throw new Error("disk full"); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); },
    remove: async (abs) => fs.rmSync(abs, { force: true }), rename: (a, b) => fs.promises.rename(a, b) };
  await assert.rejects(runMerge(root, {}, "feat-password-reset", { archive: true, force: true, date: D, io: failSecond }), /disk full/);
  assert.deepEqual(snapshot(root), before);
  const failMove = { write: async (abs, text) => { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); },
    remove: async (abs) => fs.rmSync(abs, { force: true }), rename: async () => { throw Object.assign(new Error("busy"), { code: "EBUSY" }); } };
  await assert.rejects(runMerge(root, {}, "feat-password-reset", { archive: true, force: true, date: D, io: failMove }), /busy/);
  assert.deepEqual(snapshot(root), before);
});

test("runner: preconditions block (nothing written), merge then archive, re-merge is a no-op", async () => {
  const root = copyFixture();
  const before = snapshot(root);
  const blocked = await runMerge(root, {}, "feat-password-reset", { archive: true, date: D });
  assert.equal(blocked.ok, false);
  assert.deepEqual(blocked.preconditions.tasks, { total: 2, done: 1, notDone: ["T-13"] });
  assert.deepEqual(snapshot(root), before);
  const relaxed = await runMerge(root, { spec: { archiveRequiresDone: false } }, "feat-password-reset", { archive: true, dryRun: true, date: D });
  assert.equal(relaxed.ok, true);
  const merged = await runMerge(root, {}, "feat-password-reset", { date: D });
  assert.equal(merged.ok, true);
  assert.deepEqual(merged.written.sort(), [".hitl/specs/GLOSSARY.md", ".hitl/specs/accounts/spec.md"]);
  const again = await runMerge(root, {}, "feat-password-reset", { date: D });
  assert.deepEqual(again.written, []);
  assert.deepEqual(again.capabilities[0].alreadyApplied.sort(), ["ACC-BR1", "ACC-R1", "ACC-R2", "ACC-R5", "ACC-R6", "ACC-UC1"]);
  fs.writeFileSync(path.join(root, ".hitl/changes/feat-password-reset/.scout.json"), "{}");
  const arch = await runMerge(root, {}, "feat-password-reset", { archive: true, force: true, date: today() });
  assert.equal(arch.archive.moved, true);
  const dir = path.join(root, arch.archive.to);
  assert.ok(fs.existsSync(path.join(dir, "proposal.md")) && !fs.existsSync(path.join(dir, ".scout.json")));
  assert.ok(!fs.existsSync(path.join(root, ".hitl/changes/feat-password-reset")));
  await assert.rejects(runMerge(root, {}, "feat-password-reset", { archive: true, date: D }), /already archived/);
});

test("runner: --renumber rewrites ids inside the change folder only", async () => {
  const root = copyFixture();
  const delta = path.join(root, ".hitl/changes/feat-password-reset/specs/accounts/spec.md");
  // another branch already archived ACC-R5 with a different text
  const liv = path.join(root, ".hitl/specs/accounts/spec.md");
  fs.writeFileSync(liv, fs.readFileSync(liv, "utf8").replace("## Retired IDs", "### Requirement: ACC-R5 Export data\nThe system SHALL export data.\n\n#### Scenario: ACC-R5.S1 Export\n- WHEN asked\n- THEN a file is given\n\n## Retired IDs"));
  const blocked = await runMerge(root, {}, "feat-password-reset", { date: D });
  assert.deepEqual(blocked.conflicts.map((c) => `${c.code} ${c.ref}`), ["DELTA_ID_TAKEN ACC-R5"]);
  const r = await runMerge(root, {}, "feat-password-reset", { renumber: true, date: D });
  assert.equal(r.ok, true);
  assert.deepEqual(r.capabilities[0].renumbered, { "ACC-R5": "ACC-R7" });
  const dt = fs.readFileSync(delta, "utf8");
  assert.match(dt, /### Requirement: ACC-R7 Reset password by email/);
  assert.match(dt, /#### Scenario: ACC-R7\.S2/);
  assert.match(dt, /\(ACC-R7\)/, "flow refs rewritten");
  assert.match(fs.readFileSync(path.join(root, ".hitl/changes/feat-password-reset/tasks.md"), "utf8"), /T-12\.AC1 \(ACC-R7\.S1\)/);
  assert.match(fs.readFileSync(path.join(root, ".hitl/changes/feat-password-reset/design.md"), "utf8"), /\| ACC-R7, ACC-BR1 \|/);
  assert.match(fs.readFileSync(liv, "utf8"), /### Requirement: ACC-R5 Export data[\s\S]*### Requirement: ACC-R7 Reset password by email/);
});
