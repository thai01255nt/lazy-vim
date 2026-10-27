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
const proposal = (id, caps = "| accounts | ACC | modified | ~ACC-R1 |", status = "draft") =>
  `# ${id}\n> change: ${id} | status: ${status}\n\n## Why\nBecause.\n\n## What changes\n- Something.\n\n## Capabilities\n| capability | key | change | requirements |\n|---|---|---|---|\n${caps}\n\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| design | skipped | small |\n`;
const REQ = (id, title = "Title") => `### Requirement: ${id} ${title}\nThe system SHALL do it.\n\n#### Scenario: ${id}.S1 Ex\n- WHEN a\n- THEN b\n`;
const deltaMd = (id, body, cap = "accounts", key = "ACC") => `# Delta: X\n> capability: ${cap} | key: ${key} | change: ${id}\n\n${body}`;
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
  assert.deepEqual(blocks.map((b) => `${b.id}:${b.origin}`), ["ACC-R1:modified", "ACC-R3:living", "ACC-R5:added", "ACC-R6:added", "ACC-BR1:added", "ACC-UC1:added"]);
  assert.ok(v.ids.has("ACC-R1.S3") && !v.ids.has("ACC-R2"));
  const arch = await readChange(root, (await listChanges(root))[1]);
  const lv = effectiveView(living, arch);
  assert.equal(lv.view, "living");
  assert.ok(lv.ids.has("ACC-R2") && !lv.ids.has("ACC-R5"));
});

test("next-id: max+1 over living, retired and every active change", async () => {
  const root = project({
    ".hitl/changes/feat-export/proposal.md": proposal("feat-export", "| accounts | ACC | modified | +ACC-R9 |"),
    ".hitl/changes/feat-export/specs/accounts/spec.md": deltaMd("feat-export", `## ADDED Requirements\n${REQ("ACC-R9")}\n## ADDED Rules\n### Rule: ACC-BR4 X\nx\n`),
    ".hitl/changes/fix-sign-in/proposal.md": proposal("fix-sign-in"),
    ".hitl/changes/fix-sign-in/specs/accounts/spec.md": deltaMd("fix-sign-in", `## MODIFIED Requirements\n### Requirement: ACC-R1 Sign in\nThe system SHALL x.\n\n#### Scenario: ACC-R1.S1 a\n- WHEN a\n- THEN b\n\n#### Scenario: ACC-R1.S7 b\n- WHEN a\n- THEN b\nChanged: x\n`),
  });
  const living = await readLiving(root);
  const active = await readActiveChanges(root);
  assert.equal(active.length, 3);
  assert.deepEqual(nextSpecIds(living, active, "accounts", "R", 2), ["ACC-R10", "ACC-R11"]);
  assert.deepEqual(nextSpecIds(living, active, "accounts", "BR"), ["ACC-BR5"]);
  assert.deepEqual(nextSpecIds(living, active, "accounts", "UC"), ["ACC-UC2"]);
  assert.deepEqual(nextScenarioIds(living, active, "ACC-R1"), ["ACC-R1.S8"]);
  assert.deepEqual(nextScenarioIds(living, active, "ACC-R5", 2), ["ACC-R5.S3", "ACC-R5.S4"]);
  // retired ids count: only living R1..R3 + retired R4
  assert.deepEqual(nextSpecIds(living, [], "accounts"), ["ACC-R5"]);
  assert.throws(() => nextSpecIds(living, active, "billing"), /no key/);
  assert.throws(() => nextScenarioIds(living, active, "ACC-BR1"), /requirement id/);
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
    design: "approved", capabilities: ["accounts"], contracts: 1, tasksFile: `${PR}/tasks.md`, tasks: "approved", taskCounts: undefined, phase: "implement", next: "/hitl:skeleton T-13" });
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
  assert.deepEqual(Object.keys(base.blocks), ["ACC-R1", "ACC-R2"]);
  // living edit after the change was written → BASE_CHANGED (warn), base unchanged
  edit(root, ".hitl/specs/accounts/spec.md", "the system SHALL sign them in.", "the system SHALL sign them in quickly.");
  const again = await validate(root, {}, { change: "feat-password-reset" });
  assert.deepEqual(codes(again), ["BASE_CHANGED"]);
  assert.deepEqual(JSON.parse(r(root, `${PR}/.base.json`)), base);
  assert.equal(again.ok, true);
  assert.deepEqual((await findConflicts(root)).conflicts, [{ code: "BASE_CHANGED", ref: "ACC-R1", capability: "accounts", changes: ["feat-password-reset"] }]);
});

test("validate: change-level error codes", async () => {
  const cases = [
    ["DELTA_EMPTY", { [`${PR}/specs`]: null, [`${PR}/glossary.md`]: null }],
    ["DELTA_TARGET_MISSING", { [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", "## REMOVED Requirements\n### Requirement: ACC-R9 X\nReason: y\n") }],
    ["DELTA_ID_TAKEN", { [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", `## ADDED Requirements\n${REQ("ACC-R4")}`) }],
    ["DELTA_NEW_CAP_NOT_ADDED_ONLY", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## Purpose\nx\n\n## MODIFIED Requirements\n${REQ("BIL-R1")}Changed: x\n`, "billing", "BIL") }],
    ["PURPOSE_MISSING", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## ADDED Requirements\n${REQ("BIL-R1")}`, "billing", "BIL") }],
    ["CAP_KEY_DUP", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## Purpose\nx\n\n## ADDED Requirements\n${REQ("ACC-R9")}`, "billing", "ACC") }],
    ["CAP_KEY_CHANGED", { [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", `## ADDED Requirements\n${REQ("ACX-R9")}`, "accounts", "ACX") }],
    ["SPEC_PARSE", { [`${PR}/specs/billing/spec.md`]: deltaMd("feat-password-reset", `## Purpose\nx\n\n## ADDED Requirements\n${REQ("BIL-R1")}`, "invoices", "BIL") }],
    ["NEEDS_CLARIFICATION", { [`${PR}/proposal.md`]: proposal("feat-password-reset", "| accounts | ACC | modified | x |", "approved").replace("Because.", "Because [NEEDS CLARIFICATION: who?].") }],
    ["PROPOSAL_SECTION_MISSING", { [`${PR}/proposal.md`]: null }],
    ["CONTRACT_MISSING", { [`${PR}/contracts/reset-email.md`]: null }],
    ["DESIGN_SERVES_UNKNOWN", { [`${PR}/design.md`]: "# Design: x\n> change: feat-password-reset | status: draft\n## Decisions\n| id | decision | why | serves | status |\n|---|---|---|---|---|\n| D-1 | a | b | ACC-R2 | accepted |\n" }],
    ["RULE_UNKNOWN", { [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", "## ADDED Requirements\n### Requirement: ACC-R5 X\nThe system SHALL x.\nRules: ACC-BR7\n\n#### Scenario: ACC-R5.S1 a\n- WHEN a\n- THEN b\n") }],
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
    ".hitl/changes/fix-sign-in/specs/accounts/spec.md": deltaMd("fix-sign-in", `## MODIFIED Requirements\n${REQ("ACC-R1", "Sign in")}Changed: x\n\n## ADDED Requirements\n${REQ("ACC-R5")}`),
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
  assert.deepEqual(c.conflicts.map((x) => `${x.code} ${x.ref} ${x.changes.join(",")}`), ["CROSS_CHANGE_CONFLICT ACC-R1 feat-password-reset,fix-sign-in", "ID_COLLISION ACC-R5 feat-password-reset,fix-sign-in"]);
  const many = Array.from({ length: 13 }, (_, i) => REQ(`ACC-R${20 + i}`)).join("\n");
  const big = project({ [`${PR}/specs/accounts/spec.md`]: deltaMd("feat-password-reset", `## ADDED Requirements\n${many}`) });
  assert.ok(codes(await validate(big, {}, { record: false }), "warn").includes("CHANGE_TOO_BIG"));
});

test("validate: none (no behaviour change) is fine for a refactor, not for a feat", async () => {
  const base = { ".hitl/changes": null, ".hitl/archive": null };
  const none = (id) => proposal(id, "").replace("| capability | key | change | requirements |\n|---|---|---|---|\n", "none (no behaviour change)\n");
  const ok = await validate(project({ ...base, ".hitl/changes/refactor-x/proposal.md": none("refactor-x") }), {}, { record: false });
  assert.equal(ok.ok, true, JSON.stringify(ok.items));
  const bad = await validate(project({ ...base, ".hitl/changes/feat-x/proposal.md": none("feat-x") }), {}, { record: false });
  assert.ok(codes(bad, "error").includes("DELTA_EMPTY"));
});

test("validate --living: living parse errors, key dup across capabilities, unknown rule refs", async () => {
  const root = project({ ".hitl/specs/billing/spec.md": "# Billing\n> capability: billing | key: ACC\n\n## Requirements\n\n### Requirement: ACC-R9 X\nThe system SHALL x.\nRules: ACC-BR9\n\n## Notes\n" });
  const res = await validate(root, {}, { livingOnly: true });
  assert.deepEqual([...new Set(codes(res, "error"))].sort(), ["CAP_KEY_DUP", "RULE_UNKNOWN", "SPEC_UNKNOWN_SECTION"]);
  assert.ok(codes(res, "warn").includes("REQ_NO_SCENARIO"));
  assert.ok(res.targets.every((t) => t.kind === "living"));
});
