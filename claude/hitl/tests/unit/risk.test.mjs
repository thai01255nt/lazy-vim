// P2 — risk scoring/routing/lenses (§E.9.1) + mutation report parsing (Stryker JSON, mutmut 3 results).
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRisk, globToRegExp, routeOf, label } from "../../scripts/lib/risk.mjs";
import { parseStryker, parseMutmut } from "../../scripts/cmd/mutate.mjs";

const S = (id, o = {}) => ({ id, name: id.split("#")[1], file: id.split("#")[0], kind: "function", features: [], callers: [], callees: [], tags: { impl: "manual", concurrency: "none" }, bodyHash: "b", bodyLines: 5, ...o });
const A = "src/util.ts#plain", B = "src/auth/login.ts#login", C = "src/q.ts#worker", TST = "tests/x.test.ts#t";
const index = { symbols: {
  [A]: S(A),
  [B]: S(B, { features: ["crypto", "sql"], tags: { impl: "agent", concurrency: "none" }, callers: ["a", "b", "c", "d", "e", "f"], bodyLines: 80, span: { start: 1, end: 20 } }),
  [C]: S(C, { features: ["async"], tags: { impl: "agent", concurrency: "shared-state" } }),
  [TST]: { id: TST, kind: "test", file: "tests/x.test.ts", tags: {}, test: { coversResolved: [A] } },
} };
const config = { risk: { securityPaths: ["**/auth/**"], fanInThreshold: 5, bodyLinesThreshold: 60, weights: {} }, mutationThreshold: 0.8, review: { confidenceThreshold: 80 } };

test("glob matcher", () => {
  assert.ok(globToRegExp("**/auth/**").test("src/auth/login.ts"));
  assert.ok(globToRegExp("**/auth/**").test("auth/x.ts"));
  assert.ok(!globToRegExp("**/auth/**").test("src/oauth.ts"));
  assert.ok(globToRegExp("**/payment*/**").test("a/payments/b.ts"));
  assert.ok(globToRegExp("src/*.{ts,py}").test("src/a.py"));
  assert.ok(!globToRegExp("src/*.ts").test("src/a/b.ts"));
});

test("routes and labels", () => {
  assert.equal(routeOf(0.61, false), "HUMAN");
  assert.equal(routeOf(0.6, false), "SKIM");
  assert.equal(routeOf(0.3, false), "SKIM");
  assert.equal(routeOf(0.29, false), "AUTO");
  assert.equal(routeOf(0, true), "HUMAN");
  assert.equal(label(0.68), "HIGH");
});

test("per-symbol scoring, reasons, lenses", () => {
  const r = computeRisk({ taskId: "T-1", symbolIds: [A, B, C], index, config, state: {}, taskRisk: "low" });
  assert.equal(r.symbols[A].score, 0);
  assert.equal(r.symbols[A].route, "AUTO");
  // security .25 + fanIn .10 + agent .05 + bodyLines .05 = .45
  assert.equal(r.symbols[B].score, 0.45);
  assert.equal(r.symbols[B].route, "SKIM");
  assert.ok(r.symbols[B].reasons.some((x) => x.startsWith("security")));
  // concurrency .30 + agent .05
  assert.equal(r.symbols[C].score, 0.35);
  assert.deepEqual(r.lenses, ["contract", "tests", "concurrency", "security"]);
  assert.equal(r.score, 0.45);
  const high = computeRisk({ taskId: "T-1", symbolIds: [B], index, config, state: {}, taskRisk: "high" });
  assert.equal(high.symbols[B].score, 0.65);
  assert.equal(high.symbols[B].route, "HUMAN");
});

test("B9: task risk reasons select lenses; override selects all four", () => {
  assert.deepEqual(computeRisk({ taskId: "T-1", symbolIds: [A], index, config, state: {}, taskRisk: "high" }).lenses, ["contract", "tests"]);
  assert.deepEqual(computeRisk({ taskId: "T-1", symbolIds: [A], index, config, state: {}, taskRisk: "high", taskRiskReasons: ["Security"] }).lenses, ["contract", "tests", "security"]);
  assert.deepEqual(computeRisk({ taskId: "T-1", symbolIds: [], index, config, state: {}, taskRiskReasons: ["concurrency (queue)", "perf"] }).lenses, ["contract", "tests", "concurrency"]);
  assert.deepEqual(computeRisk({ taskId: "T-1", symbolIds: [A], index, config, state: {}, override: true }).lenses.sort(), ["concurrency", "contract", "security", "tests"]);
});

test("drift (own or covering-test) is a hard HUMAN flag; findings + mutation add weight; config weights override; clamp", () => {
  const drift = { items: [{ level: "warn", code: "TEST_CHANGED", symbol: TST }, { level: "info", code: "BODY_CHANGED", symbol: B }] };
  const r = computeRisk({ taskId: "T-1", symbolIds: [A, B], index, config, state: {}, drift });
  assert.equal(r.symbols[A].route, "HUMAN");
  assert.ok(r.symbols[A].reasons.includes("test drift"));
  assert.equal(r.symbols[B].route, "SKIM", "info drift is not a flag");
  const findings = { findings: [{ key: "k", symbol: B, severity: "important", confidence: 90, verifiedConfidence: 85, keep: true }, { key: "m", symbol: B, severity: "minor", verifiedConfidence: 99 }] };
  const state = { mutation: { [B]: { score: 0.5, survivors: 3, bodyHash: "b" } } };
  const r2 = computeRisk({ taskId: "T-1", symbolIds: [B], index, config, state, findings, taskRisk: "high" });
  assert.equal(r2.symbols[B].score, 1, "clamped");
  assert.ok(r2.symbols[B].reasons.some((x) => /mutation 50%/.test(x)));
  const w = computeRisk({ taskId: "T-1", symbolIds: [C], index, config: { ...config, risk: { ...config.risk, weights: { concurrency: 0.7 } } }, state: {} });
  assert.equal(w.symbols[C].route, "HUMAN");
});

test("--changed-since-review keeps only symbols whose body changed", () => {
  const state = { reviews: { "T-1": { verdict: "PASS", bodyHashes: { [A]: "b", [B]: "old" } } } };
  const r = computeRisk({ taskId: "T-1", symbolIds: [A, B, C], index, config, state, changedSinceReview: true });
  assert.deepEqual(Object.keys(r.symbols).sort(), [B, C].sort());
});

test("Stryker mutation.json mapped to innermost symbol span", () => {
  const idx = { symbols: {
    "src/a.ts#Cls": { id: "src/a.ts#Cls", file: "src/a.ts", kind: "class", span: { start: 1, end: 30 } },
    "src/a.ts#Cls.m": { id: "src/a.ts#Cls.m", file: "src/a.ts", kind: "method", span: { start: 5, end: 10 } },
    "src/a.ts#f": { id: "src/a.ts#f", file: "src/a.ts", kind: "function", span: { start: 12, end: 20 } },
  } };
  const report = { schemaVersion: "1", files: { "src/a.ts": { language: "typescript", mutants: [
    { id: "1", mutatorName: "x", status: "Killed", location: { start: { line: 6, column: 1 }, end: { line: 6, column: 5 } } },
    { id: "2", status: "Survived", location: { start: { line: 7, column: 1 }, end: { line: 7, column: 3 } } },
    { id: "3", status: "Timeout", location: { start: { line: 13, column: 1 }, end: { line: 13, column: 3 } } },
    { id: "4", status: "CompileError", location: { start: { line: 14, column: 1 }, end: { line: 14, column: 3 } } },
    { id: "5", status: "NoCoverage", location: { start: { line: 40, column: 1 }, end: { line: 40, column: 3 } } },
  ] } } };
  const r = parseStryker(report, idx, Object.keys(idx.symbols));
  assert.deepEqual(r.perSymbol["src/a.ts#Cls.m"], { killed: 1, survivors: 1, total: 2, score: 0.5 });
  assert.deepEqual(r.perSymbol["src/a.ts#f"], { killed: 1, survivors: 0, total: 1, score: 1 });
  assert.equal(r.unmapped, 1);
});

test("mutmut 3 results parsed per function and method", () => {
  const idx = { symbols: {
    "orders.py#apply_discount": { id: "orders.py#apply_discount", name: "apply_discount", file: "orders.py", kind: "function" },
    "orders.py#Order.total_due": { id: "orders.py#Order.total_due", name: "Order.total_due", file: "orders.py", kind: "method" },
  } };
  const text = ["    orders.x_apply_discount__mutmut_1: killed", "    orders.x_apply_discount__mutmut_2: survived", "    orders.x_apply_discount__mutmut_3: no tests",
    "    orders.xǁOrderǁtotal_due__mutmut_1: killed", "    other.x_nope__mutmut_1: killed", "garbage"].join("\n");
  const r = parseMutmut(text, idx, Object.keys(idx.symbols));
  assert.deepEqual(r.perSymbol["orders.py#apply_discount"], { killed: 1, survivors: 2, total: 3, score: 0.333 });
  assert.equal(r.perSymbol["orders.py#Order.total_due"].score, 1);
  assert.equal(r.unmapped, 1);
});
