// v3 spec layer — lib/changes.mjs: effective view, id allocation, phase, validation codes, base hashes, conflicts.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listChanges, readChange, readLiving, readActiveChanges, effectiveView, nextSpecIds, nextScenarioIds, changePhase, changeInfo,
  validate, findConflicts, resetStatusCache, findChange } from "../../scripts/lib/changes.mjs";

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/spec-app");
const PR = ".hitl/changes/feat-password-reset";
function project(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-chg-"));
  fs.cpSync(FIX, root, { recursive: true });
  for (const [rel, text] of Object.entries(extra)) {
    const abs = path.join(root, rel);
    if (text === null) { fs.rmSync(abs, { recursive: true, force: true }); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  resetStatusCache();
  return root;
}
const r = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const edit = (root, rel, from, to) => { const t = r(root, rel); assert.ok(t.includes(from), `${rel} lacks ${from}`); fs.writeFileSync(path.join(root, rel), t.replace(from, to)); };
const KEYS = { "feat-export": "EXP", "fix-sign-in": "FSI", "refactor-x": "RFX", "feat-x": "FX", "feature-x": "FTX", "feat-password-reset": "PWR" };
const proposal = (id, caps = "| accounts | modified | ~LACC-R1 |", status = "draft", key = KEYS[id]) =>
  `# ${id}\n> change: ${id}${key ? ` | key: ${key}` : ""} | status: ${status}\n\n## Why\nBecause.\n\n## What changes\n- Something.\n\n## Capabilities\n| capability | change | requirements |\n|---|---|---|\n${caps}\n\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| design | skipped | small |\n`;
const REQ = (id, title = "Title") => `### Requirement: ${id} ${title}\nThe system SHALL do it.\n\n#### Scenario: ${id}.S1 Ex\n- WHEN a\n- THEN b\n`;
const deltaMd = (id, body, cap = "accounts") => `# Delta: X\n> capability: ${cap} | change: ${id}\n\n${body}`;
const codes = (res, level) => res.items.filter((i) => !level || i.level === level).map((i) => i.code);

test("listChanges / findChange: active first, archived with date", async () => {
  const root = project();
  const all = await listChanges(root);
  assert.deepEqual(all.map((c) => [c.id, c.archived, c.archiveDate]), [["feat-password-reset", false, null], ["feat-2fa", true, "2026-10-20"]]);
  assert.equal((await findChange(root, "2026-10-20-feat-2fa")).id, "feat-2fa");
  assert.equal(await findChange(root, "feat-nope"), null);
});

test("effective view: living ⊕ the change's own deltas; archived change sees living", async () => {
  const root = project();
  const living = await readLiving(root);
  const ch = await readChange(root, (await listChanges(root))[0]);
  const v = effectiveView(living, ch);
  const blocks = v.capabilities.get("accounts").blocks;
  assert.equal(v.view, "change");
  assert.deepEqual(blocks.map((b) => `${b.id}:${b.origin}`), ["LACC-R1:modified", "TFA-R1:living", "PWR-R1:added", "PWR-R2:added", "PWR-BR1:added", "PWR-UC1:added"]);
  assert.ok(v.ids.has("LACC-R1.S3") && !v.ids.has("LACC-R2"));
  const arch = await readChange(root, (await listChanges(root))[1]);
  const lv = effectiveView(living, arch);
  assert.equal(lv.view, "living");
  assert.ok(lv.ids.has("LACC-R2") && !lv.ids.has("PWR-R1"));
});

test("next-id: max+1 over living, retired and every active change", async () => {
  const root = project({
    ".hitl/changes/feat-export/proposal.md": proposal("feat-export", "| accounts | modified | +EXP-R9 |"),
    ".hitl/changes/feat-export/specs/accounts/spec.md": deltaMd("feat-export", `## ADDED Requirements\n${REQ("EXP-R9")}\n## ADDED Rules\n### Rule: EXP-BR4 X\nx\n`),
    ".hitl/changes/fix-sign-in/proposal.md": proposal("fix-sign-in"),
    ".hitl/changes/fix-sign-in/specs/accounts/spec.md": deltaMd("fix-sign-in", `## MODIFIED Requirements\n### Requirement: LACC-R1 Sign in\nThe system SHALL x.\n\n#### Scenario: LACC-R1.S1 a\n- WHEN a\n- THEN b\n\n#### Scenario: LACC-R1.S7 b\n- WHEN a\n- THEN b\nChanged: x\n`),
  });
  const living = await readLiving(root);
  const active = await readActiveChanges(root);
  assert.equal(active.length, 3);
  // 0.13: numbers are per change key (EXP), never per capability
  assert.deepEqual(nextSpecIds(living, active, "feat-export", "R", 2), ["EXP-R10", "EXP-R11"]);
  assert.deepEqual(nextSpecIds(living, active, "feat-export", "BR"), ["EXP-BR5"]);
  assert.deepEqual(nextSpecIds(living, active, "feat-export", "UC"), ["EXP-UC1"]);
  assert.deepEqual(nextSpecIds(living, active, "feat-password-reset", "R"), ["PWR-R3"]);
  assert.deepEqual(nextSpecIds(living, active, "feat-password-reset", "UC"), ["PWR-UC2"]);
  assert.deepEqual(nextSpecIds(living, active, "feat-password-reset", "D", 2), ["PWR-D3", "PWR-D4"]);
  assert.deepEqual(nextScenarioIds(living, active, "LACC-R1"), ["LACC-R1.S8"]);
  assert.deepEqual(nextScenarioIds(living, active, "PWR-R1", 2), ["PWR-R1.S3", "PWR-R1.S4"]);
  assert.throws(() => nextSpecIds(living, active, "feat-nope"), /no active change/);
  fs.writeFileSync(path.join(root, ".hitl/changes/fix-sign-in/proposal.md"), proposal("fix-sign-in", undefined, "draft", null));
  const keyless = await readActiveChanges(root);
  assert.throws(() => nextSpecIds(living, keyless, "fix-sign-in"), /no key yet[\s\S]*\/hitl:migrate/);
  assert.throws(() => nextScenarioIds(living, active, "PWR-BR1"), /requirement id/);
});

test("changePhase rules", () => {
  const p = (o) => changePhase({ archived: false, proposal: "approved", design: "approved", tasks: "approved", taskCounts: { total: 2, done: 1 }, ...o });
  assert.equal(p({ archived: true }), "archived");
  assert.equal(p({ proposal: "draft" }), "spec");
  assert.equal(p({ design: "missing" }), "design");
  assert.equal(p({ design: "draft" }), "design");
  assert.equal(p({ design: "skipped", tasks: "missing" }), "tasks");
  assert.equal(p({ tasks: "draft" }), "tasks");
  assert.equal(p({}), "implement");
  assert.equal(p({ taskCounts: { total: 2, done: 2 } }), "archive-ready");
  assert.equal(p({ design: "skipped", tasks: "missing", tasksSkipped: true }), "archive-ready");
});

test("changeInfo: computed task status from the lock, next command", async () => {
  const root = project();
  const [act, arch] = await listChanges(root);
  const a = await changeInfo(root, {}, await readChange(root, act));
  assert.deepEqual({ ...a, taskCounts: undefined }, { id: "feat-password-reset", dir: PR, archived: false, title: "Password reset by email", proposal: "approved",
    design: "approved", capabilities: ["accounts"], contracts: 1, tasksFile: `${PR}/tasks.md`, tasks: "approved", taskCounts: undefined, phase: "implement", next: "/hitl:skeleton PWR-T2",
    notes: { open: 0, reopenPending: 0, applied: 0, dismissed: 0, deferred: 0, total: 0, incoming: 0 }, before: [], wait: null, blocks: [] });
  assert.deepEqual(a.taskCounts, { total: 2, done: 1, byStatus: { done: 1, todo: 1 } });
  const b = await changeInfo(root, {}, await readChange(root, arch));
  assert.deepEqual([b.phase, b.design, b.next], ["archived", "skipped", null]);
});

test("validate: fixture is clean and records .base.json once (never overwritten)", async () => {
  const root = project();
  const res = await validate(root, {});
  assert.equal(res.ok, true, JSON.stringify(res.items));
  assert.deepEqual(res.counts, { error: 0, warn: 0, info: 0 });
  const base = JSON.parse(r(root, `${PR}/.base.json`));
  assert.equal(base.schema, "hitl.spec-base/1");
  assert.deepEqual(Object.keys(base.blocks), ["LACC-R1", "LACC-R2"]);
  // living edit after the change was written → BASE_CHANGED (warn), base unchanged
  edit(root, ".hitl/specs/accounts/spec.md", "the system SHALL sign them in.", "the system SHALL sign them in quickly.");
  const again = await validate(root, {}, { change: "feat-password-reset" });
  assert.deepEqual(codes(again), ["BASE_CHANGED"]);
  assert.deepEqual(JSON.parse(r(root, `${PR}/.base.json`)), base);
  assert.equal(again.ok, true);
  assert.deepEqual((await findConflicts(root)).conflicts, [{ code: "BASE_CHANGED", ref: "LACC-R1", capability: "accounts", changes: ["feat-password-reset"] }]);
});

test("validate: change-level error codes", async () => {
  const cases = [
    ["DELTA_EMPTY", { [`${PR}/specs`]: null, [`${PR}/glossary.md`]: null }],
    ["DELTA_TARGET_MISSING", { [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", "## REMOVED Requirements\n### Requirement: ACC-R9 X\nReason: y\n") }],
    ["DELTA_ID_TAKEN", { [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", `## ADDED Requirements\n${REQ("LACC-R3")}`) }],
    ["DELTA_NEW_CAP_NOT_ADDED_ONLY", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## Purpose\nx\n\n## MODIFIED Requirements\n${REQ("PWR-R7")}Changed: x\n`, "billing") }],
    ["PURPOSE_MISSING", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## ADDED Requirements\n${REQ("PWR-R7")}`, "billing") }],
    ["DELTA_KEY_MISMATCH", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## Purpose\nx\n\n## ADDED Requirements\n${REQ("ACC-R9")}`, "billing") }],
    ["CHANGE_KEY_TAKEN", { [`${PR}/proposal.md`]: r(project(), `${PR}/proposal.md`).replace("| key: PWR", "| key: TFA") }],
    ["CHANGE_KEY_TAKEN", { ".hitl/changes/fix-sign-in/proposal.md": proposal("fix-sign-in", undefined, "draft", "PWR") }],
    ["CHANGE_KEY_MISSING", { [`${PR}/proposal.md`]: r(project(), `${PR}/proposal.md`).replace(" | key: PWR", "") }],
    ["CHANGE_KEY_BAD", { [`${PR}/proposal.md`]: r(project(), `${PR}/proposal.md`).replace("| key: PWR", "| key: P1") }],
    ["DELTA_KEY_MISMATCH", { [`${PR}/design.md`]: "# Design: x\n> change: feat-password-reset | status: draft\n## Decisions\n| id | decision | why | serves | status |\n|---|---|---|---|---|\n| TFA-D1 | a | b | PWR-R1 | accepted |\n" }],
    ["IDS_LEGACY", { [`${PR}/design.md`]: "# Design: x\n> change: feat-password-reset | status: draft\n## Decisions\n| id | decision | why | serves | status |\n|---|---|---|---|---|\n| D-1 | a | b | PWR-R1 | accepted |\n" }],
    ["SPEC_PARSE", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## Purpose\nx\n\n## ADDED Requirements\n${REQ("PWR-R7")}`, "invoices") }],
    ["NEEDS_CLARIFICATION", { [`${PR}/proposal.md`]: proposal("feat-password-reset", "| accounts | modified | x |", "approved").replace("Because.", "Because [NEEDS CLARIFICATION: who?].") }],
    ["PROPOSAL_SECTION_MISSING", { [`${PR}/proposal.md`]: null }],
    ["CONTRACT_MISSING", { [`${PR}/contracts/reset-email.md`]: null }],
    ["DESIGN_SERVES_UNKNOWN", { [`${PR}/design.md`]: "# Design: x\n> change: feat-password-reset | status: draft\n## Decisions\n| id | decision | why | serves | status |\n|---|---|---|---|---|\n| PWR-D1 | a | b | LACC-R2 | accepted |\n" }],
    ["RULE_UNKNOWN", { [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", "## ADDED Requirements\n### Requirement: PWR-R1 X\nThe system SHALL x.\nRules: ACC-BR7\n\n#### Scenario: PWR-R1.S1 a\n- WHEN a\n- THEN b\n") }],
    ["ID_BAD_FORMAT", { ".hitl/changes/feature-x/proposal.md": proposal("feature-x"), ".hitl/changes/feature-x/specs/accounts/spec.md": deltaMd("feature-x", `## ADDED Requirements\n${REQ("ACC-R20")}`) }],
  ];
  for (const [code, extra] of cases) {
    const root = project(extra);
    const res = await validate(root, {}, { record: false });
    assert.ok(codes(res, "error").includes(code), `${code}: got ${JSON.stringify(res.items.map((i) => [i.code, i.level]))}`);
    assert.equal(res.ok, false);
  }
});

test("validate: warnings — draft clarification, unlisted contract, biz tokens, too big, cross-change", async () => {
  const root = project({
    [`${PR}/proposal.md`]: r(project(), `${PR}/proposal.md`).replace("status: approved", "status: draft").replace("Users who forget", "Users who call resetPassword() [NEEDS CLARIFICATION: who] forget"),
    [`${PR}/contracts/extra.json`]: "{}",
    ".hitl/changes/fix-sign-in/proposal.md": proposal("fix-sign-in"),
    ".hitl/changes/fix-sign-in/specs/accounts/spec.md": deltaMd("fix-sign-in", `## MODIFIED Requirements\n${REQ("LACC-R1", "Sign in")}Changed: x\n\n## ADDED Requirements\n${REQ("PWR-R1")}`),
  });
  const res = await validate(root, {}, { change: "feat-password-reset", record: false });
  assert.deepEqual([...new Set(codes(res, "warn"))].sort(), ["BIZ_CODE_TOKEN", "CONTRACT_UNLISTED", "CROSS_CHANGE_CONFLICT", "ID_COLLISION", "NEEDS_CLARIFICATION"]);
  assert.equal(res.ok, true);
  assert.deepEqual(res.targets.map((t) => t.id), ["feat-password-reset"]);
  const err = await validate(root, { spec: { businessLint: "error" } }, { change: "feat-password-reset", record: false });
  assert.ok(codes(err, "error").includes("BIZ_CODE_TOKEN"));
  const off = await validate(root, { spec: { businessLint: "off" } }, { change: "feat-password-reset", record: false });
  assert.ok(!codes(off).includes("BIZ_CODE_TOKEN"));
  const c = await findConflicts(root);
  assert.deepEqual(c.conflicts.map((x) => `${x.code} ${x.ref} ${x.changes.join(",")}`), ["CROSS_CHANGE_CONFLICT LACC-R1 feat-password-reset,fix-sign-in", "ID_COLLISION PWR-R1 feat-password-reset,fix-sign-in"]);
  const many = Array.from({ length: 13 }, (_, i) => REQ(`PWR-R${20 + i}`)).join("\n");
  const big = project({ [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", `## ADDED Requirements\n${many}`) });
  assert.ok(codes(await validate(big, {}, { record: false }), "warn").includes("CHANGE_TOO_BIG"));
});

test("validate: none (no behaviour change) is fine for a refactor, not for a feat", async () => {
  const base = { ".hitl/changes": null, ".hitl/archive": null };
  const none = (id) => proposal(id, "").replace("| capability | change | requirements |\n|---|---|---|\n", "none (no behaviour change)\n");
  const ok = await validate(project({ ...base, ".hitl/changes/refactor-x/proposal.md": none("refactor-x") }), {}, { record: false });
  assert.equal(ok.ok, true, JSON.stringify(ok.items));
  const bad = await validate(project({ ...base, ".hitl/changes/feat-x/proposal.md": none("feat-x") }), {}, { record: false });
  assert.ok(codes(bad, "error").includes("DELTA_EMPTY"));
});

test("validate --living: living parse errors, unknown rule refs", async () => {
  const root = project({ ".hitl/specs/billing/spec.md": "# Billing\n> capability: billing\n\n## Requirements\n\n### Requirement: ACC-R9 X\nThe system SHALL x.\nRules: ACC-BR9\n\n## Notes\n" });
  const res = await validate(root, {}, { livingOnly: true });
  assert.deepEqual([...new Set(codes(res, "error"))].sort(), ["RULE_UNKNOWN", "SPEC_UNKNOWN_SECTION"]);
  assert.ok(codes(res, "warn").includes("REQ_NO_SCENARIO"));
  assert.ok(res.targets.every((t) => t.kind === "living"));
});
