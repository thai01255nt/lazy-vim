// v3 spec layer — parsers (lib/specmd.mjs) and ids (lib/specids.mjs): templates parse clean, each parse-level code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parseLivingSpec, parseDelta, parseGlossary, parseProposal, parseDesign, blockHash, bizLint, findClarifications, artifactDecision, usedIds } from "../../scripts/lib/specmd.mjs";
import { parseId, compareIds, allocate, rewriteIds, isChangeId, SPECREF_RE, today } from "../../scripts/lib/specids.mjs";

const TPL = join(dirname(fileURLToPath(import.meta.url)), "../../shared/templates");
const FILL = { "change-id": "feat-sample", capability: "accounts", KEY: "ACC", "YYYY-MM-DD": "2026-01-01", n: "3", m: "1", r: "2", k: "1", p: "4" };
const fill = (t) => t.replace(/\{([^{}]+)\}/g, (_, k) => FILL[k] ?? "sample words");
const tpl = (name) => fill(readFileSync(join(TPL, name), "utf8"));
const codes = (doc) => doc.items.map((i) => i.code);
const errors = (doc) => doc.items.filter((i) => i.level === "error");
const has = (doc, code, level) => doc.items.some((i) => i.code === code && (!level || i.level === level));

const LIVING = `<!-- audience: business · generated -->
# Accounts
> capability: accounts | key: ACC | updated: 2026-10-20

## Purpose
Who can sign in.

## Requirements

### Requirement: ACC-R1 Sign in
When a user signs in, the system SHALL check the password.
Quality: security
Rules: ACC-BR1

#### Scenario: ACC-R1.S1 Correct password
- GIVEN a user
- WHEN they sign in
- THEN they see home
  and a greeting

## Rules

### Rule: ACC-BR1 Lockout
Five wrong passwords lock the account.

## Retired IDs
- ACC-R2 Remember me — removed by feat-x (2026-10-01): unsafe

## Change History
- 2026-10-01 feat-x: +ACC-R1 -ACC-R2
`;

const delta = (body, meta = "> capability: accounts | key: ACC | change: feat-y") => `# Delta: Accounts\n${meta}\n\n${body}`;
const REQ = (id, extra = "") => `### Requirement: ${id} Title\nWhen x, the system SHALL y.\n${extra}\n#### Scenario: ${id}.S1 Ex\n- WHEN a\n- THEN b\n`;

test("templates parse to zero errors after placeholder fill", () => {
  const spec = parseLivingSpec(tpl("spec.md"), "spec.md");
  assert.deepEqual(errors(spec), []);
  assert.equal(spec.key, "ACC");
  assert.deepEqual(spec.blocks.map((b) => b.id), ["ACC-R3", "ACC-BR3", "ACC-UC3"]);
  const d = parseDelta(tpl("spec-delta.md"), "delta.md");
  assert.deepEqual(errors(d), []);
  assert.deepEqual(d.blocks.map((b) => `${b.op} ${b.id}`), ["ADDED ACC-R3", "ADDED ACC-R4", "MODIFIED ACC-R1", "REMOVED ACC-R2", "ADDED ACC-BR3", "ADDED ACC-BR1", "ADDED ACC-UC3"]);
  assert.equal(d.change, "feat-sample");
  const p = parseProposal(tpl("proposal.md"), "proposal.md");
  assert.deepEqual(errors(p), []);
  assert.equal(p.status, "draft");
  assert.equal(p.capabilities[0].capability, "accounts");
  assert.equal(artifactDecision(p, "design"), "included");
  const g = parseGlossary(tpl("glossary.md"), "glossary.md", { delta: true });
  assert.deepEqual(errors(g), []);
  assert.equal(g.terms[0].op, "ADDED");
  const ds = parseDesign(tpl("design.md"), "design.md");
  assert.deepEqual(errors(ds), []);
  assert.equal(ds.decisions[0].id, "D-1");
  for (const f of ["proposal.md", "spec.md", "spec-delta.md", "glossary.md", "design.md", "data-model.md"])
    assert.match(readFileSync(join(TPL, f), "utf8").split("\n")[0], /^<!-- audience: (business|dev)\b/, f);
});

test("living spec: fields, priority, quality, rules, scenarios, retired, history", () => {
  const d = parseLivingSpec(LIVING, "s.md");
  assert.deepEqual(errors(d), []);
  assert.equal(d.title, "Accounts");
  assert.equal(d.updated, "2026-10-20");
  assert.equal(d.purpose, "Who can sign in.");
  const r = d.blocks[0];
  assert.equal(r.priority, "must");
  assert.equal(r.quality, "security");
  assert.deepEqual(r.rules, ["ACC-BR1"]);
  assert.equal(r.statement, "When a user signs in, the system SHALL check the password.");
  assert.deepEqual(r.scenarios[0].steps.at(-1), { kw: "THEN", text: "they see home and a greeting" });
  assert.deepEqual(d.retired.map((x) => [x.id, x.title]), [["ACC-R2", "Remember me"]]);
  assert.equal(d.history.length, 1);
  const u = usedIds(d);
  assert.deepEqual([...u.R].sort(), [1, 2]);
  assert.deepEqual([...u.S.get("ACC-R1")], [1]);
});

test("priority from the RFC 2119 keyword; mixed keywords warn", () => {
  const p = (stmt) => parseDelta(delta(`## ADDED Requirements\n### Requirement: ACC-R1 T\n${stmt}\n#### Scenario: ACC-R1.S1 E\n- WHEN a\n- THEN b\n`), "d").blocks[0];
  assert.equal(p("The system SHOULD x.").priority, "should");
  assert.equal(p("The system MAY x.").priority, "could");
  assert.equal(p("The system MUST x.").priority, "must");
  const d = parseDelta(delta(`## ADDED Requirements\n### Requirement: ACC-R1 T\nThe system SHALL x and MAY y.\n#### Scenario: ACC-R1.S1 E\n- WHEN a\n- THEN b\n`), "d");
  assert.ok(has(d, "REQ_MULTI_KEYWORD", "warn"));
});

test("parse-level error and warning codes", () => {
  const cases = [
    ["SPEC_UNKNOWN_SECTION", parseLivingSpec(LIVING + "\n## Notes\nx\n", "s"), "error"],
    ["SPEC_UNKNOWN_SECTION", parseDelta(delta("## Notes\nx\n"), "d"), "warn"],
    ["CAP_KEY_MISSING", parseLivingSpec("# A\n> capability: accounts\n## Requirements\n", "s"), "error"],
    ["CAP_KEY_MISSING", parseLivingSpec("# A\n## Requirements\n", "s"), "error"],
    ["SPEC_PARSE", parseLivingSpec(LIVING.replace("### Rule: ACC-BR1 Lockout", "### Rul ACC-BR1"), "s"), "error"],
    ["SPEC_PARSE", parseLivingSpec(LIVING.replace("Quality: security", "Quality: speed"), "s"), "error"],
    ["SPEC_PARSE", parseLivingSpec(LIVING.replace("- WHEN they sign in", "- When they sign in"), "s"), "error"],
    ["SPEC_PARSE", parseDelta(delta(`## ADDED Rules\n${REQ("ACC-R1")}`), "d"), "error"],
    ["ID_BAD_FORMAT", parseDelta(delta("## ADDED Requirements\n### Requirement: ACC-BR1 T\nThe system SHALL x.\n"), "d"), "error"],
    ["ID_BAD_FORMAT", parseDelta(delta("## ADDED Requirements\n### Requirement: R-1 T\nThe system SHALL x.\n"), "d"), "error"],
    ["ID_DUP", parseLivingSpec(LIVING.replace("## Rules", REQ("ACC-R1") + "\n## Rules"), "s"), "error"],
    ["ID_DUP", parseLivingSpec(LIVING.replace("## Rules", REQ("ACC-R2") + "\n## Rules"), "s"), "error"],
    ["ID_KEY_MISMATCH", parseDelta(delta(`## ADDED Requirements\n${REQ("BIL-R1")}`), "d"), "error"],
    ["REQ_NO_KEYWORD", parseDelta(delta("## ADDED Requirements\n### Requirement: ACC-R1 T\nThe system sends x.\n#### Scenario: ACC-R1.S1 E\n- WHEN a\n- THEN b\n"), "d"), "error"],
    ["REQ_NO_SCENARIO", parseDelta(delta("## ADDED Requirements\n### Requirement: ACC-R1 T\nThe system SHALL x.\n"), "d"), "error"],
    ["REQ_NO_SCENARIO", parseDelta(delta("## ADDED Requirements\n### Requirement: ACC-R1 T <!-- migrated -->\nThe system SHALL x.\n"), "d"), "warn"],
    ["REQ_NO_SCENARIO", parseLivingSpec(LIVING.replace("## Rules", "### Requirement: ACC-R3 T\nThe system SHALL x.\n\n## Rules"), "s"), "warn"],
    ["REQ_TOO_LONG", parseDelta(delta(`## ADDED Requirements\n### Requirement: ACC-R1 T\nThe system SHALL ${"x".repeat(520)}.\n#### Scenario: ACC-R1.S1 E\n- WHEN a\n- THEN b\n`), "d"), "warn"],
    ["SCN_NO_WHEN_THEN", parseDelta(delta("## ADDED Requirements\n### Requirement: ACC-R1 T\nThe system SHALL x.\n#### Scenario: ACC-R1.S1 E\n- GIVEN a\n- THEN b\n"), "d"), "error"],
    ["SCN_ID_MISMATCH", parseDelta(delta("## ADDED Requirements\n### Requirement: ACC-R1 T\nThe system SHALL x.\n#### Scenario: ACC-R2.S1 E\n- WHEN a\n- THEN b\n"), "d"), "error"],
    ["DELTA_RENAMED_UNSUPPORTED", parseDelta(delta("## RENAMED Requirements\n- FROM: a\n- TO: b\n"), "d"), "error"],
    ["DELTA_CONFLICT", parseDelta(delta(`## ADDED Requirements\n${REQ("ACC-R1")}\n## REMOVED Requirements\n### Requirement: ACC-R1 T\nReason: x\n`), "d"), "error"],
    ["ID_DUP", parseDelta(delta(`## ADDED Requirements\n${REQ("ACC-R1")}\n${REQ("ACC-R1")}`), "d"), "error"],
    ["MODIFIED_NO_CHANGED_LINE", parseDelta(delta(`## MODIFIED Requirements\n${REQ("ACC-R1")}`), "d"), "error"],
    ["REMOVED_NO_REASON", parseDelta(delta("## REMOVED Requirements\n### Requirement: ACC-R1 T\n"), "d"), "error"],
    ["SPEC_UNKNOWN_SECTION", parseDelta(delta("## Retired IDs\n- ACC-R9 x\n"), "d"), "error"],
    ["SPEC_PARSE", parseDelta(delta(REQ("ACC-R1"), "> capability: accounts | key: ACC"), "d"), "error"],
  ];
  for (const [code, doc, level] of cases) assert.ok(has(doc, code, level), `${code}/${level}: got ${JSON.stringify(doc.items.map((i) => [i.code, i.level]))}`);
});

test("delta: Changed:/Reason: lines are kept out of the living text; comments stripped", () => {
  const d = parseDelta(delta(`## MODIFIED Requirements\n${REQ("ACC-R1")}Changed: now case-insensitive <!-- one line -->\n\n## REMOVED Requirements\n### Requirement: ACC-R2 Old\nReason: unused\n`), "d");
  const [m, r] = d.blocks;
  assert.equal(m.changed, "now case-insensitive");
  assert.doesNotMatch(m.livingText, /Changed:|<!--/);
  assert.match(m.text, /Changed:/);
  assert.equal(r.reason, "unused");
  assert.deepEqual(errors(d), []);
});

test("migrated delta may carry ## Retired IDs", () => {
  const d = parseDelta(delta(`## ADDED Requirements\n${REQ("ACC-R1")}\n## Retired IDs <!-- migrated -->\n- ACC-R2 Old — dropped\n`), "d");
  assert.deepEqual(errors(d), []);
  assert.deepEqual(d.retired.map((r) => r.id), ["ACC-R2"]);
});

test("headers inside fenced code are ignored", () => {
  const d = parseLivingSpec(LIVING.replace("Five wrong passwords lock the account.", "Five wrong.\n```\n## Notes\n### Requirement: nope\n```"), "s");
  assert.deepEqual(errors(d), []);
  assert.match(d.blocks[1].livingText, /## Notes/);
});

test("glossary: living + delta, case-folded identity, duplicates", () => {
  const g = parseGlossary("# Glossary\n> updated: 2026-01-01\n### Term: Reset link\nA link.\n_Avoid_: token, magic link\n", "G");
  assert.deepEqual(errors(g), []);
  assert.deepEqual(g.terms[0].avoid, ["token", "magic link"]);
  assert.equal(g.terms[0].key, "reset link");
  const dup = parseGlossary("# Glossary\n### Term: Reset link\nA.\n### Term: reset LINK\nB.\n", "G");
  assert.ok(has(dup, "ID_DUP"));
  const d = parseGlossary("# G\n## ADDED Terms\n### Term: A\nx\n## REMOVED Terms\n### Term: a\nReason: y\n", "g", { delta: true });
  assert.ok(has(d, "DELTA_CONFLICT"));
  assert.ok(has(parseGlossary("# G\n## RENAMED Terms\n", "g", { delta: true }), "DELTA_RENAMED_UNSUPPORTED"));
});

test("proposal: required sections, capabilities table, none, artifacts", () => {
  const p = parseProposal("# T\n> change: docs-x | status: approved\n## Why\nx\n## Capabilities\nnone (no behaviour change)\n", "p");
  assert.deepEqual(p.items.filter((i) => i.code === "PROPOSAL_SECTION_MISSING").map((i) => i.ref), ["What changes", "Artifacts"]);
  assert.equal(p.noBehaviourChange, true);
  assert.equal(p.capabilities.length, 0);
  const q = parseProposal("# T\n> change: feat-x | status: draft\n## Why\n## What changes\n## Capabilities\n| capability | key | change | requirements |\n|---|---|---|---|\n| billing | BIL | retired | -BIL-R1 |\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| design | asked → skipped | small |\n## Deferred\n- later\n", "p");
  assert.deepEqual(q.capabilities.map((c) => [c.capability, c.key, c.change]), [["billing", "BIL", "retired"]]);
  assert.equal(artifactDecision(q, "design"), "skipped");
  assert.deepEqual(q.deferred, ["later"]);
  assert.ok(has(parseProposal("# T\n> change: feat-x\n", "p"), "SPEC_PARSE"));
});

test("design: decisions table with alternatives, bad status, bad serves, contracts", () => {
  const d = parseDesign(`# Design: X\n> change: feat-x | status: approved\n## Decisions\n| id | decision | why | alternatives | cost if wrong | serves | status |\n|---|---|---|---|---|---|---|\n| D-1 | a | b | c | d | ACC-R1, ACC-BR1 | accepted |\n| D-2 | a | b | c | d | foo | maybe |\n| D-3 | a | b | c | d | — | superseded by D-1 |\n## Contracts\n- contracts/api.yaml — public HTTP\n`, "d");
  assert.deepEqual(d.decisions[0].serves, ["ACC-R1", "ACC-BR1"]);
  assert.equal(d.decisions[0].alternatives, "c");
  assert.equal(d.decisions[2].supersededBy, "D-1");
  assert.ok(has(d, "DESIGN_DEC_STATUS"));
  assert.ok(has(d, "DESIGN_SERVES_UNKNOWN"));
  assert.deepEqual(d.contracts, [{ file: "contracts/api.yaml", boundary: "public HTTP", line: 10 }]);
});

test("blockHash ignores trailing whitespace and blank-line runs", () => {
  assert.equal(blockHash("a  \n\n\n\nb\n\n"), blockHash("a\n\nb"));
  assert.notEqual(blockHash("a\nb"), blockHash("a\n\nb"));
  assert.match(blockHash("x"), /^sha256:[0-9a-f]{64}$/);
});

test("bizLint flags code tokens, skips fences/meta/rule tables and glossary terms", () => {
  const text = "# T\n> change: feat_x | status: draft\nUse `resetToken` and sendMail() via user_id in src/a/b.ts with POST /reset.\nThe ResetLink is fine.\n```\nfooBar()\n```\n### Rule: ACC-BR1 X\n| user_id | out |\n";
  const hits = bizLint(text, { terms: ["resetlink"] });
  assert.deepEqual([...new Set(hits.map((h) => h.rule))].sort(), ["backtick", "call", "camelCase", "http", "path", "snake_case"]);
  assert.ok(hits.every((h) => h.line === 3));
});

test("findClarifications", () => {
  assert.deepEqual(findClarifications("a [NEEDS CLARIFICATION: who?]\n```\n[NEEDS CLARIFICATION: no]\n```\n<!-- [NEEDS CLARIFICATION: no] -->"), [{ line: 1, text: "[NEEDS CLARIFICATION: who?]" }]);
});

test("specids: parse, compare, allocate, rewrite, change ids", () => {
  assert.deepEqual(parseId("ACC-R3.S2"), { id: "ACC-R3.S2", key: "ACC", kind: "S", n: 3, k: 2, req: "ACC-R3" });
  assert.equal(parseId("ACC-BR1").kind, "BR");
  assert.equal(parseId("R-1"), null);
  assert.deepEqual(["ACC-R10", "ACC-BR1", "ACC-R2", "ACC-R2.S1"].sort(compareIds), ["ACC-R2", "ACC-R2.S1", "ACC-R10", "ACC-BR1"]);
  assert.deepEqual(allocate(new Set([1, 4]), 2), [5, 6]);
  assert.deepEqual(allocate([], 1), [1]);
  assert.equal(rewriteIds("ACC-R7 ACC-R7.S1 ACC-R70 XACC-R7 ACC-R8", { "ACC-R7": "ACC-R8", "ACC-R8": "ACC-R9" }), "ACC-R8 ACC-R8.S1 ACC-R70 XACC-R7 ACC-R9");
  assert.ok(isChangeId("feat-password-reset"));
  assert.ok(!isChangeId("feature-x") && !isChangeId("feat-" + "a".repeat(50)));
  assert.ok(SPECREF_RE.test("ACC-UC1") && !SPECREF_RE.test("ACC-S1"));
  assert.match(today(), /^\d{4}-\d{2}-\d{2}$/);
});
