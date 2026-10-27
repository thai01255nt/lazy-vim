// hitl 0.6.1 standards lints (scripts/lib/speclint.mjs; shared/formats/*): requirement quality (ISO 29148 / INCOSE),
// NFR fit criteria (ISO 25010 + Volere), DMN decision tables, state machines, Cockburn use cases, contracts
// (OpenAPI / AsyncAPI / JSON Schema / CLI), MADR decisions, CAP_DUP_NEW. Fixtures: tests/fixtures/standards/{good,bad}.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDelta, parseDesign } from "../../scripts/lib/specmd.mjs";
import { DEFAULT_VAGUE_TERMS, conditionsOverlap, findVagueTerms, lintContract, lintFlow, lintRequirement, lintRule, lintStateMachines,
  parseCondition, parseHitPolicy, vagueTermsFrom } from "../../scripts/lib/speclint.mjs";
import { findConflicts, resetStatusCache, validate } from "../../scripts/lib/changes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STD = path.resolve(HERE, "../fixtures/standards");
const APP = path.resolve(HERE, "../fixtures/spec-app");
const rd = (rel) => fs.readFileSync(path.join(STD, rel), "utf8");
const codesOf = (items) => [...new Set(items.map((i) => i.code))].sort();
const lintDelta = (doc, cfg = {}) => doc.blocks.flatMap((b) => (b.kind === "rule" ? lintRule(b) : b.kind === "flow" ? lintFlow(b) : lintRequirement(b, { vagueTerms: vagueTermsFrom(cfg) })));
const byRef = (items) => items.reduce((m, i) => ((m[i.ref] ||= new Set()).add(i.code), m), {});

test("good fixtures: no standards warnings (spec delta, design, contracts)", () => {
  const d = parseDelta(rd("good/spec.md"), "good/spec.md");
  assert.deepEqual(d.items, []);
  assert.deepEqual(lintDelta(d), []);
  const r2 = d.blocks.find((b) => b.id === "ORD-R2");
  assert.deepEqual([r2.quality, r2.qualitySub, r2.fit], ["performance-efficiency", "time behaviour", "95th percentile page time ≤ 2 s in a 500-user load test"]);
  assert.doesNotMatch(r2.statement, /Fit:/);
  const ds = parseDesign(rd("good/design.md"), "good/design.md");
  assert.deepEqual(ds.items, []);
  assert.deepEqual(ds.decisions.map((x) => [x.id, x.status, x.supersededBy]), [["D-1", "accepted", null], ["D-2", "superseded", "D-1"], ["D-3", "proposed", null]]);
  assert.deepEqual(ds.decisionDetails.map((x) => [x.id, [...x.fields].length]), [["D-1", 6]]);
  assert.deepEqual(lintStateMachines(rd("good/design.md")), []);
  for (const f of fs.readdirSync(path.join(STD, "good/contracts"))) assert.deepEqual(lintContract(`contracts/${f}`, rd(`good/contracts/${f}`)), [], f);
});

test("requirement quality (ISO 29148 / INCOSE): vague EN+VI, compound, passive without actor, NFR without fit", () => {
  const d = parseDelta(rd("bad/spec.md"), "bad/spec.md");
  const m = byRef(lintDelta(d));
  assert.deepEqual([...m["ORD-R1"]].sort(), ["REQ_COMPOUND", "REQ_PASSIVE_NO_ACTOR", "REQ_VAGUE"]);
  assert.deepEqual([...m["ORD-R2"]].sort(), ["NFR_NO_FIT", "REQ_COMPOUND", "REQ_VAGUE"]);
  assert.deepEqual([...m["ORD-R3"]].sort(), ["REQ_VAGUE"]);
  const vi = lintDelta(d).find((i) => i.ref === "ORD-R3");
  for (const t of ["nhanh", "thân thiện", "v.v."]) assert.ok(vi.message.includes(`"${t}"`), t);
  assert.ok(lintDelta(d).every((i) => i.level === "warn"), "never errors");
  // passive WITH an actor and "available" (not a participle) are fine
  const ok = { id: "X-R1", line: 1, statement: "Reset links SHALL be sent by the mail service. The system SHALL be available." };
  assert.deepEqual(codesOf(lintRequirement({ ...ok, statement: "Reset links SHALL be sent by the mail service." })), []);
  assert.deepEqual(codesOf(lintRequirement({ id: "X-R2", line: 1, statement: "The system SHALL be available 99.9% of a month.", quality: "reliability" })), []);
});

test("vague terms: unicode word boundaries and config (replace / extra)", () => {
  assert.deepEqual(findVagueTerms("SHALL respond fast"), ["fast"]);
  assert.deepEqual(findVagueTerms("SHALL respond in a breakfast-safe way"), []);
  assert.deepEqual(findVagueTerms("SHALL be faster than 2 s"), []);
  assert.deepEqual(findVagueTerms("ít nhất 3 lần"), []);
  assert.deepEqual(findVagueTerms("Giao diện dễ dùng"), ["dễ dùng"]);
  assert.deepEqual(findVagueTerms("Hệ thống nhanhchóng"), []);
  assert.ok(DEFAULT_VAGUE_TERMS.includes("tối ưu") && DEFAULT_VAGUE_TERMS.includes("linh hoạt") && DEFAULT_VAGUE_TERMS.includes("user-friendly"));
  assert.deepEqual(vagueTermsFrom({ spec: { vagueTerms: ["snappy"] } }), ["snappy"]);
  assert.ok(vagueTermsFrom({ spec: { vagueTermsExtra: ["snappy"] } }).includes("snappy"));
  assert.ok(vagueTermsFrom({}).includes("fast"));
  const b = { id: "X-R1", line: 1, statement: "The system SHALL be snappy." };
  assert.deepEqual(codesOf(lintRequirement(b, { vagueTerms: vagueTermsFrom({ spec: { vagueTermsExtra: ["snappy"] } }) })), ["REQ_VAGUE"]);
  assert.deepEqual(codesOf(lintRequirement(b)), []);
});

test("DMN decision tables: hit policy, columns, overlap under U, conflicting outputs under A", () => {
  const d = parseDelta(rd("bad/spec.md"), "bad/spec.md");
  const m = byRef(lintDelta(d));
  assert.deepEqual([...m["ORD-BR1"]], ["DT_NO_HIT_POLICY"]);
  assert.deepEqual([...m["ORD-BR2"]], ["DT_OVERLAP"]);
  assert.match(lintDelta(d).find((i) => i.code === "DT_OVERLAP").message, /rules 1 and 2 overlap/);
  assert.deepEqual([...m["ORD-BR3"]], ["DT_HIT_POLICY"]);
  assert.deepEqual(["U (unique)", "first", "C+", "collect", "Rule order", "X", ""].map(parseHitPolicy), ["U", "F", "C+", "C", "R", null, null]);
  const rule = (body) => ({ id: "X-BR1", line: 1, text: `### Rule: X-BR1 T\n${body}` });
  const anyTable = "Hit policy: A\n\n| age (in) | out (out) |\n|---|---|\n| [18..65] | ok |\n| > 60 | senior |\n";
  assert.deepEqual(codesOf(lintRule(rule(anyTable))), ["DT_OVERLAP"]);
  assert.deepEqual(codesOf(lintRule(rule(anyTable.replace("senior", "ok")))), []);
  assert.deepEqual(codesOf(lintRule(rule("| F | a (in) | b (out) |\n|---|---|---|\n| 1 | x | y |\n| 2 | - | z |\n"))), []); // hit policy in the header cell; F allows overlap
  assert.deepEqual(codesOf(lintRule(rule("Hit policy: U\n\n| a (in) | b | c (out) |\n|---|---|---|\n| x | y |\n"))), ["DT_COLUMNS", "DT_ROW_CELLS"]);
  assert.deepEqual(codesOf(lintRule(rule("Hit policy: U\n\n| a (in) | b (out) |\n|---|---|\n"))), ["DT_NO_RULES"]);
});

test("DMN conditions: numeric intervals, sets, wildcards; unknown forms never overlap unless identical", () => {
  const ov = (a, b) => conditionsOverlap(a, b);
  assert.equal(ov("≤ 30 min", "> 30 min"), false);
  assert.equal(ov("<= 30", ">= 30"), true);
  assert.equal(ov("< 50", ">= 50"), false);
  assert.equal(ov("[1..5]", "(5..10]"), false);
  assert.equal(ov("[1..5]", "[5..10]"), true);
  assert.equal(ov("gold, silver", "silver"), true);
  assert.equal(ov("gold", "bronze"), false);
  assert.equal(ov("any", "gold"), true);
  assert.equal(ov("-", "> 3"), true);
  assert.equal(ov("not gold", "gold"), false);
  assert.equal(ov("not gold", "not gold"), true);
  assert.deepEqual(parseCondition("30"), { kind: "num", lo: 30, loIn: true, hi: 30, hiIn: true });
});

test("state machines: columns, nondeterminism, unreachable states, diagram mismatch, stateDiagram-v2", () => {
  const d = parseDelta(rd("bad/spec.md"), "bad/spec.md");
  const items = lintDelta(d).filter((i) => i.ref === "ORD-BR4");
  assert.deepEqual(codesOf(items), ["SM_DIAGRAM_MISMATCH", "SM_NONDETERMINISTIC", "SM_UNREACHABLE"]);
  assert.match(items.find((i) => i.code === "SM_UNREACHABLE").message, /refunded/);
  assert.doesNotMatch(items.find((i) => i.code === "SM_UNREACHABLE").message, /cancelled/);
  assert.ok(items.every((i) => i.line > 1), "absolute line numbers");
  assert.deepEqual(codesOf(lintStateMachines(rd("bad/design.md"))), ["SM_COLUMNS", "SM_MERMAID"]);
  // a lifecycle rule is not mistaken for a decision table
  assert.ok(!codesOf(items).some((c) => c.startsWith("DT_")));
});

test("use cases (Cockburn lite): actor, numbered steps, extension refs, success guarantee", () => {
  const d = parseDelta(rd("bad/spec.md"), "bad/spec.md");
  const m = byRef(lintDelta(d));
  assert.deepEqual([...m["ORD-UC1"]].sort(), ["UC_EXT_REF", "UC_NO_GUARANTEE"]);
  assert.deepEqual([...m["ORD-UC2"]].sort(), ["UC_NO_ACTOR", "UC_NO_STEPS"]);
  // the v0.6.0 one-line form stays valid (Actor:, inline steps, no fully dressed fields)
  const old = { id: "X-UC1", line: 1, text: "### Flow: X-UC1 T\nActor: user · Goal: g · Trigger: t\n1. a. 2. b (X-R1). 3. c.\nAlternate 2a: d." };
  assert.deepEqual(lintFlow(old), []);
});

test("contracts: JSON parse, OpenAPI/AsyncAPI/JSON Schema versions, structure, CLI sections (zero-dependency)", () => {
  const got = Object.fromEntries(fs.readdirSync(path.join(STD, "bad/contracts")).map((f) => [f, codesOf(lintContract(`contracts/${f}`, rd(`bad/contracts/${f}`)))]));
  assert.deepEqual(got, {
    "api.yaml": ["CONTRACT_VERSION"],
    "broken.json": ["CONTRACT_PARSE"],
    "cli.md": ["CONTRACT_STRUCTURE"],
    "events.yaml": ["CONTRACT_VERSION"],
    "nodialect.schema.json": ["CONTRACT_VERSION"],
    "noversion.yaml": ["CONTRACT_VERSION"],
    "old.openapi.yaml": ["CONTRACT_STRUCTURE", "CONTRACT_VERSION"],
    "order.schema.json": ["CONTRACT_VERSION"],
  });
  assert.deepEqual(lintContract("contracts/x.yaml", "openapi: 3.2.0\ninfo: {title: x, version: 1}\npaths: {}\n"), []);
  assert.deepEqual(lintContract("contracts/x.json", JSON.stringify({ openapi: "3.1.1", info: {}, paths: {} })), []);
  assert.deepEqual(lintContract("contracts/notes.md", "# Reset email\nBody."), []);
  assert.deepEqual(lintContract("contracts/k8s.yaml", "apiVersion: v1\nkind: ConfigMap\n"), []);
});

test("MADR decisions: statuses, supersede target, detail blocks (tables inside them are not D rows)", () => {
  const ds = parseDesign(rd("bad/design.md"), "bad/design.md");
  const c = ds.items.map((i) => `${i.level} ${i.code} ${i.ref}`).sort();
  assert.deepEqual(c, ["warn DESIGN_DEC_DETAIL_UNKNOWN D-7", "warn DESIGN_DEC_INCOMPLETE D-1", "warn DESIGN_DEC_INCOMPLETE D-7", "warn DESIGN_DEC_SUPERSEDE_UNKNOWN D-1"]);
  assert.equal(ds.decisions.find((d) => d.id === "D-2").status, "deprecated");
  const withTable = "# Design: x\n> change: feat-x | status: draft\n## Decisions\n| id | decision | why | status |\n|---|---|---|---|\n| D-1 | a | b | accepted |\n\n### D-1 A\n- **Context and problem**: c\n- **Considered options**:\n\n| option | pro | con |\n|---|---|---|\n| one | x | y |\n\n- **Decision outcome**: one\n- **Consequences**: Good: x. Bad: y.\n";
  const w = parseDesign(withTable, "d");
  assert.deepEqual([w.items, w.decisions.length], [[], 1]);
  assert.equal(parseDesign(withTable.replace("| accepted |", "| maybe |"), "d").items[0].code, "DESIGN_DEC_STATUS");
});

// ---------------------------------------------------------------- integration through spec validate / conflicts
function project(extra) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-std-"));
  fs.cpSync(APP, root, { recursive: true });
  for (const [rel, text] of Object.entries(extra)) { const abs = path.join(root, rel); fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, text); }
  resetStatusCache();
  return root;
}
const OC = ".hitl/changes/feat-order-lifecycle";
const proposal = (id, cap = "orders", key = "ORD") => `# ${id}\n> change: ${id} | status: draft\n\n## Why\nCustomers want orders.\n\n## What changes\n- Orders.\n\n## Capabilities\n| capability | key | change | requirements |\n|---|---|---|---|\n| ${cap} | ${key} | new | +${key}-R1 |\n\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| design | included | new API |\n`;
const files = (kind) => {
  const out = { [`${OC}/proposal.md`]: proposal("feat-order-lifecycle"), [`${OC}/specs/orders/spec.md`]: rd(`${kind}/spec.md`), [`${OC}/design.md`]: rd(`${kind}/design.md`) };
  for (const f of fs.readdirSync(path.join(STD, kind, "contracts"))) out[`${OC}/contracts/${f}`] = rd(`${kind}/contracts/${f}`);
  return out;
};

test("spec validate: good change has no warnings; bad change only warnings from the standards lints", async () => {
  const good = await validate(project(files("good")), {}, { change: "feat-order-lifecycle", record: false });
  assert.deepEqual(good.items, []);
  const bad = await validate(project(files("bad")), {}, { change: "feat-order-lifecycle", record: false });
  const std = ["CONTRACT_PARSE", "CONTRACT_STRUCTURE", "CONTRACT_VERSION", "DESIGN_DEC_DETAIL_UNKNOWN", "DESIGN_DEC_INCOMPLETE", "DESIGN_DEC_SUPERSEDE_UNKNOWN",
    "DT_HIT_POLICY", "DT_NO_HIT_POLICY", "DT_OVERLAP", "NFR_NO_FIT", "REQ_COMPOUND", "REQ_PASSIVE_NO_ACTOR", "REQ_VAGUE", "SM_COLUMNS", "SM_DIAGRAM_MISMATCH",
    "SM_MERMAID", "SM_NONDETERMINISTIC", "SM_UNREACHABLE", "UC_EXT_REF", "UC_NO_ACTOR", "UC_NO_GUARANTEE", "UC_NO_STEPS"];
  const warns = codesOf(bad.items.filter((i) => i.level === "warn"));
  for (const c of std) assert.ok(warns.includes(c), `missing ${c}`);
  for (const i of bad.items.filter((x) => std.includes(x.code))) assert.equal(i.level, "warn", `${i.code} must stay a warning`);
  assert.ok(bad.items.filter((i) => i.code === "CONTRACT_UNLISTED").length >= 1);
  // qualityLint off silences only the requirement-quality heuristics
  const off = await validate(project(files("bad")), { spec: { qualityLint: "off" } }, { change: "feat-order-lifecycle", record: false });
  const offCodes = codesOf(off.items);
  for (const c of ["REQ_VAGUE", "REQ_COMPOUND", "REQ_PASSIVE_NO_ACTOR", "NFR_NO_FIT"]) assert.ok(!offCodes.includes(c), c);
  assert.ok(offCodes.includes("DT_OVERLAP"));
});

test("CAP_DUP_NEW: two active changes both create the same not-yet-living capability (warning, conflicts exit unchanged)", async () => {
  const delta = (id) => `# Delta: Orders\n> capability: orders | key: ORD | change: ${id}\n\n## Purpose\nOrders.\n\n## ADDED Requirements\n### Requirement: ORD-R${id.endsWith("a") ? 1 : 2} X\nThe system SHALL keep 1 order.\n\n#### Scenario: ORD-R${id.endsWith("a") ? 1 : 2}.S1 x\n- WHEN a\n- THEN b\n`;
  const root = project({
    ".hitl/changes/feat-orders-a/proposal.md": proposal("feat-orders-a"), ".hitl/changes/feat-orders-a/specs/orders/spec.md": delta("feat-orders-a"),
    ".hitl/changes/feat-orders-b/proposal.md": proposal("feat-orders-b"), ".hitl/changes/feat-orders-b/specs/orders/spec.md": delta("feat-orders-b"),
  });
  const v = await validate(root, {}, { change: "feat-orders-a", record: false });
  const dup = v.items.filter((i) => i.code === "CAP_DUP_NEW");
  assert.deepEqual(dup.map((i) => [i.level, i.ref]), [["warn", "orders"]]);
  assert.match(dup[0].message, /feat-orders-b/);
  const c = await findConflicts(root);
  assert.deepEqual(c.warnings, [{ code: "CAP_DUP_NEW", ref: "orders", capability: "orders", changes: ["feat-orders-a", "feat-orders-b"] }]);
  assert.ok(!c.conflicts.some((x) => x.code === "CAP_DUP_NEW"));
  // a capability that is already living is never "new" twice
  const v2 = await validate(project({}), {}, { change: "feat-password-reset", record: false });
  assert.ok(!v2.items.some((i) => i.code === "CAP_DUP_NEW"));
});

test("templates follow the standards: filled spec-delta/spec/design and the contract skeletons lint clean", () => {
  const T = path.resolve(HERE, "../../shared/templates");
  const fill = (s) => s.replace(/\{KEY\}/g, "ACC").replace(/\{n\}/g, "3").replace(/\{p\}/g, "4").replace(/\{m\}/g, "1").replace(/\{r\}/g, "2")
    .replace(/\{capability\}/g, "accounts").replace(/\{change-id\}/g, "feat-x");
  const d = parseDelta(fill(fs.readFileSync(path.join(T, "spec-delta.md"), "utf8")), "d");
  assert.deepEqual(d.items, []);
  assert.deepEqual(d.blocks.filter((b) => b.op !== "REMOVED").flatMap((b) => (b.kind === "rule" ? lintRule(b) : b.kind === "flow" ? lintFlow(b) : lintRequirement(b))), []);
  assert.deepEqual(parseDesign(fill(fs.readFileSync(path.join(T, "design.md"), "utf8")), "x").items, []);
  for (const f of fs.readdirSync(path.join(T, "contracts"))) assert.deepEqual(lintContract(`contracts/${f}`, fs.readFileSync(path.join(T, "contracts", f), "utf8")), [], f);
});
