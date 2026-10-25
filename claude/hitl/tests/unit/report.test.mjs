// P2 — verdict, F-number stability and review markdown layout (§E.8, §E.9.2, §E.9.3).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildReport, assignFNumbers, computeVerdict, intentVsBody } from "../../scripts/lib/report.mjs";

const CU = "src/services/userService.ts#UserService.createUser";
const index = { symbols: { [CU]: { id: CU, name: "UserService.createUser", tags: { impl: "agent" }, flowSteps: ["1. normalize email", "2. reject duplicate"], todos: [] } } };
const lock = { symbols: { [CU]: { impl: "agent", todos: ["1. normalize email", "2. reject duplicate", "3. hash and save"] } } };
const l0 = { schema: "hitl.l0/1", task: "T-1",
  gates: [{ name: "lint", result: "pass", detail: "" }, { name: "typecheck", result: "skip", detail: "not configured" }, { name: "tests", result: "pass", detail: "fresh for current bodies" },
    { name: "mutation", result: "skip", detail: "not configured" }, { name: "drift", result: "pass", detail: "TEST_CHANGED tests/userService.test.ts" }],
  tests: { pass: 7, fail: 0, error: 0, skip: 0, stale: 0 },
  drift: { items: [{ level: "warn", code: "TEST_CHANGED", symbol: "t" }], summary: { block: 0, warn: 1, info: 0 } }, mutation: { configured: false, perSymbol: {} } };
const F = (key, severity, conf, o = {}) => ({ key, lens: "contract", symbol: CU, file: "src/services/userService.ts", line: 52, severity, confidence: conf, verifiedConfidence: conf, keep: conf >= 80, title: key, evidence: "ev", fixOwner: "agent", ...o });
const findings = { schema: "hitl.findings/1", task: "T-1", lens: "merged",
  findings: [F("minor-1", "minor", 95), F("imp-1", "important", 85), F("crit-1", "critical", 92, { fixOwner: "human" }), F("low-1", "critical", 60)], setAside: ["perf of bulk path: not in plan"] };
const risk = { task: "T-1", score: 0.68, symbols: { [CU]: { score: 0.68, reasons: ["security", "test drift"], route: "HUMAN" } }, lenses: ["contract", "tests"] };

test("F-numbers: severity then confidence, stable across runs via key", () => {
  const d = assignFNumbers(findings.findings, null, 80);
  assert.deepEqual(d.keys, { "crit-1": "F-1", "imp-1": "F-2", "minor-1": "F-3" });
  const d2 = assignFNumbers([F("new-crit", "critical", 99), ...findings.findings], d, 80);
  assert.equal(d2.keys["crit-1"], "F-1");
  assert.equal(d2.keys["new-crit"], "F-4");
});

test("verdict rules", () => {
  const d = assignFNumbers(findings.findings, null, 80);
  assert.equal(computeVerdict({ l0, findings: findings.findings, decisions: d, risk, thr: 80 }).verdict, "WITH FIXES");
  assert.equal(computeVerdict({ l0: { ...l0, tests: { pass: 6, fail: 1 } }, findings: [], decisions: d, risk, thr: 80 }).verdict, "FAIL");
  assert.equal(computeVerdict({ l0: { ...l0, drift: { summary: { block: 1 } } }, findings: [], decisions: d, risk, thr: 80 }).verdict, "FAIL");
  assert.equal(computeVerdict({ l0: null, findings: [], decisions: d, risk, thr: 80 }).verdict, "FAIL", "no L0 evidence");
  d.items["F-1"] = { key: "crit-1", decision: "reject" }; d.items["F-2"] = { key: "imp-1", decision: "defer" };
  const v = computeVerdict({ l0, findings: findings.findings, decisions: d, risk, thr: 80 });
  assert.equal(v.verdict, "PASS");
  // HUMAN symbol 1 + human-owned kept finding 1 + undecided critical 0
  assert.equal(v.humanRequired, 2);
  assert.equal(computeVerdict({ l0, findings: [], decisions: {}, risk: { symbols: {} }, thr: 80 }).verdict, "PASS");
});

test("intent vs body maps lock todos to flowSteps by number", () => {
  assert.equal(intentVsBody(lock.symbols[CU], index.symbols[CU]), "1 normalize email ✓ · 2 reject duplicate ✓ · 3 hash and save ✗");
});

test("report markdown has the exact section layout", () => {
  const rep = buildReport({ taskId: "T-1", title: "Register user with unique email", l0, findings, decisions: null, risk, statuses: { symbols: { [CU]: { status: "green" } } }, lock, index,
    config: { review: { confidenceThreshold: 80 } }, head: "abc1234", now: "2026-10-25T00:00:00Z" });
  const md = rep.markdown;
  const lines = md.split("\n");
  assert.equal(lines[0], "# Review T-1: Register user with unique email");
  assert.equal(lines[1], "verdict: WITH FIXES | risk: 0.68 (HIGH) | human required: 3 | head: abc1234");
  assert.equal(lines[2], "generated: 2026-10-25T00:00:00Z | lenses: contract | threshold: conf>=80");
  const order = ["## Gates (L0)", "## Trace", "## Functions (sorted by risk)", "## Findings needing a decision", "## Intent vs body (HUMAN-routed only)", "## Set aside / out of scope", "## Collapsed: minor or conf<80 (2)", "## Outcome log"];
  let pos = -1; for (const h of order) { const p = md.indexOf(h); assert.ok(p > pos, `section ${h} in order`); pos = p; }
  assert.match(md, /\| tests \| 7\/7 pass \| fresh for current bodies \|/);
  assert.match(md, /\| drift vs lock \| sig 0 · intent 0 · tests 1 changed \|/);
  assert.match(md, /\| UserService\.createUser \| agent \| green \| 0\.68 \| security, test drift \| HUMAN \|/);
  assert.match(md, /### F-1 \[critical · conf 92\] crit-1 — src\/services\/userService\.ts:52/);
  assert.match(md, /fix owner: human \| decision: pending → `\/hitl:review T-1 fix F-1`/);
  assert.match(md, /UserService\.createUser: 1 normalize email ✓ · 2 reject duplicate ✓ · 3 hash and save ✗/);
  assert.match(md, /- perf of bulk path: not in plan/);
  assert.match(md, /<details><summary>show<\/summary>\n\n- \[minor · conf 95\] minor-1/);
  assert.match(md, /- \[critical · conf 60\] low-1/);
  assert.ok(!md.includes("### F-3"), "minor findings are collapsed, not decision items");
});

test("B4: header lists every lens that ran, not only lenses with findings", () => {
  const rep = buildReport({ taskId: "T-1", title: "x", l0, findings, decisions: null, risk, lensesRan: ["contract", "tests", "security"], statuses: {}, lock, index, config: {}, now: "n" });
  assert.match(rep.markdown.split("\n")[2], /lenses: contract, tests, security \|/);
});

test("decisions show in report and outcome log tracks resolved keys", () => {
  const d = assignFNumbers(findings.findings, null, 80);
  d.items["F-1"] = { key: "crit-1", decision: "accept", note: "do it", at: "x" };
  d.items["F-2"] = { key: "imp-1", decision: "reject", note: "", at: "x" };
  const rep = buildReport({ taskId: "T-1", title: "x", l0, findings: { findings: findings.findings.filter((f) => f.key !== "crit-1") }, decisions: d, risk, statuses: {}, lock, index, config: {} });
  assert.match(rep.markdown, /- F-1 accept → fixed, re-review pass — do it/);
  assert.match(rep.markdown, /- F-2 reject → reject/);
  assert.match(rep.markdown, /decision: reject/);
  assert.equal(rep.verdict, "PASS");
});

test("trace: block → FAIL; gate row, ## Trace section after Gates, card spec line + amend hint", () => {
  const trace = { counts: { block: 0, warn: 1, info: 0 }, acs: [{ id: "T-1.AC1", reqs: ["R-1"], proven: true, tests: 1 }, { id: "T-1.AC2", reqs: [], proven: false, tests: 0 }],
    items: [{ level: "warn", code: "AC_NO_TEST", ref: "T-1.AC2", task: "T-1", planning: null, message: "T-1.AC2 has no test" }],
    spec: { [CU]: { decisions: ["D-1"], requirements: ["R-1", "R-2"] } } };
  const tl0 = { ...l0, gates: [...l0.gates, { name: "trace", result: "warn", detail: "AC_NO_TEST T-1.AC2" }], trace };
  assert.equal(computeVerdict({ l0: { ...tl0, trace: { ...trace, counts: { block: 1, warn: 0, info: 0 } } }, findings: [], decisions: {}, risk: { symbols: {} }, thr: 80 }).verdict, "FAIL");
  assert.equal(computeVerdict({ l0: tl0, findings: [], decisions: {}, risk: { symbols: {} }, thr: 80 }).verdict, "PASS");
  const md = buildReport({ taskId: "T-1", title: "x", l0: tl0, findings: { findings: [F("imp-1", "important", 85, { category: "intent" }), F("crit-1", "critical", 90, { category: "logic", symbol: "other" }), F("imp-2", "important", 88, { category: "logic" })] },
    decisions: null, risk, statuses: {}, lock, index, config: {} }).markdown;
  assert.match(md, /\| trace \| AC 1\/2 proven · 0 block · 1 warn warn \| AC_NO_TEST T-1\.AC2 \|/);
  assert.match(md, /## Trace\n- T-1\.AC1 \(R-1\) — 1 test ✅ proven\n- T-1\.AC2 — 0 tests ⚠️ not proven\n⚠️ AC_NO_TEST T-1\.AC2 — T-1\.AC2 has no test\n\n## Functions/);
  assert.ok(md.indexOf("## Trace") > md.indexOf("## Gates (L0)"));
  assert.match(md, /spec: D-1 · R-1, R-2 — reply "amend F-3" to accept \+ amend the spec/);
  assert.match(md, /### F-2 [^\n]*\n[^\n]*\nspec: D-1 · R-1, R-2\n/, "logic finding: spec line without amend hint");
  assert.equal((md.match(/^spec: /gm) || []).length, 2, "no spec line for symbols without links");
  const none = buildReport({ taskId: "T-1", title: "x", l0, findings: { findings: [] }, decisions: null, risk, statuses: {}, lock, index, config: {} }).markdown;
  assert.match(none, /## Trace\n- not computed\n/);
});

test("needs_validation security finding: own card tag + blocker line, routed to the human", () => {
  const nv = F("security-1", "important", 85, { lens: "security", category: "security", verdict: "needs_validation", blocker: "is the admin route behind the SSO proxy?", fixOwner: "human", suggestedFix: "check the ingress config" });
  const doc = { schema: "hitl.findings/1", task: "T-1", lens: "merged", findings: [nv] };
  const rep = buildReport({ taskId: "T-1", title: "t", l0, findings: doc, decisions: null, risk: { symbols: {} }, statuses: {}, lock, index,
    config: { review: { confidenceThreshold: 80 } }, head: "h", now: "n" });
  assert.match(rep.markdown, /### F-1 \[needs_validation · conf 85\] security-1/);
  assert.match(rep.markdown, /blocker: is the admin route behind the SSO proxy\? — validate it/);
  assert.equal(rep.humanRequired, 1);
  assert.equal(rep.verdict, "WITH FIXES");
});
