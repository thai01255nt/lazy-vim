// 0.19 id jump — `hitl-index where <id>`: id grammar and kinds, exact id boundaries, roles (def, test, symbol, brief,
// ref) and their order, the archive flag, the quickfix line and the JSON shape, exit 1 (no location) and 2 (not an id).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canonicalId, compareLocations, findInText, formatLocation, idKind, invalidIdMessage, where } from "../../scripts/lib/where.mjs";
import { loadConfig } from "../../scripts/lib/config.mjs";
import os from "node:os";
import { spawnSync } from "node:child_process";

const HERE = import.meta.dirname;
const CLI = path.resolve(HERE, "../../scripts/hitl-index.mjs");
const FIX = path.resolve(HERE, "../fixtures/spec-app");
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};
const specProject = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-where-")); fs.cpSync(FIX, root, { recursive: true }); return root; };

const CH = ".hitl/changes/feat-password-reset";
const write = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };

const SRC = `/** Issues and redeems reset tokens. */
export class ResetService {
  /**
   * Sends a single-use reset link.
   * @task PWR-T1 @impl agent @status done
   */
  sendLink(email: string): void {}
  /** Redeems a link (PWR-R10 is another requirement). */
  redeem(token: string): boolean { return token.length > 0; }
}
`;
const TESTS = `import { it } from "node:test";
/** @covers ResetService.sendLink @ac PWR-T1.AC1,PWR-T1.AC2 @kind example @origin test-author */
it("PWR-T1.AC2 unknown email reveals nothing", () => {});
/** @covers ResetService.sendLink @ac PWR-T1.AC1 @kind example @origin test-author */
it("known email gets a link", () => {});
`;
const PLAN_BRIEF = `# Plan brief — feat-password-reset
> change: feat-password-reset | key: PWR | kind: plan | status: open | round: 1 | updated: 2026-11-20

## Round 1

### Q1 [R] Who may reset a password?
> anyone with the email
→ recorded: PWR-R1, PWR-R1.S2
`;
const AMEND_BRIEF = `# Amend brief — feat-password-reset · PWR-A1

> change: feat-password-reset | key: PWR | kind: amend | amend: PWR-A1 | from: N-1 | refs: PWR-R1.S2 | transition: — | skill: plan | status: open | round: 1 | updated: 2026-11-20
`;

/** spec-app plus code, tests, briefs and a Symbols row (PWR-T1 → ResetService.redeem), indexed. */
function project() {
  const root = specProject();
  write(root, "src/reset.ts", SRC);
  write(root, "tests/reset.test.ts", TESTS);
  write(root, `${CH}/plan-brief.md`, PLAN_BRIEF);
  write(root, `${CH}/amend-PWR-A1-brief.md`, AMEND_BRIEF);
  const tasks = path.join(root, CH, "tasks.md");
  fs.writeFileSync(tasks, fs.readFileSync(tasks, "utf8").replace("\n## PWR-T2", "\n### Symbols\n1. [x] `ResetService.redeem` | new | `src/reset.ts` | impl: agent | redeem\n\n## PWR-T2"));
  const r = cli(root, "index", "--json");
  assert.equal(r.code, 0, r.err);
  return root;
}

test("id grammar: kinds, canonical upper case, invalid and pre-0.13 ids", () => {
  const kinds = { "PWR-R1": "requirement", "PWR-R1.S2": "scenario", "PWR-BR1": "rule", "PWR-UC3": "flow", "PWR-T12": "task", "PWR-T12.AC2": "ac",
    "PWR-D1": "decision", "PWR-A1": "amendment", "QFLT-T1": "task", "LACC-R1": "requirement" };
  for (const [id, kind] of Object.entries(kinds)) assert.equal(idKind(id), kind, id);
  assert.equal(canonicalId(" pwr-t1.ac2 "), "PWR-T1.AC2");
  for (const bad of ["PWR", "PWR-X1", "pwr-r", "N-1", "F-2", "PWR-R1.AC1", "PWR-T1.S1", "PWR-R1,"]) assert.equal(idKind(canonicalId(bad)), null, bad);
  assert.match(invalidIdMessage("T-3"), /pre-0\.13 id: run \/hitl:migrate/);
  assert.match(invalidIdMessage("foo"), /is not a hitl id \(<KEY>-R<n>, /);
});

test("exact id boundaries: no longer id, no scenario/AC suffix, no prefix; punctuation around the id is fine", () => {
  const text = ["PWR-R10 and PWR-R1.S2 and XPWR-R1 and PWR-R1_x", "see (PWR-R1).", "`PWR-R1`, [PWR-R1]", "end PWR-R1.", "→ recorded: PWR-R1, PWR-R1.S2"].join("\n");
  const hits = findInText(text, "PWR-R1");
  assert.deepEqual(hits.map((h) => h.line), [2, 3, 4, 5]);
  assert.deepEqual(hits.map((h) => h.text), ["see (PWR-R1).", "`PWR-R1`, [PWR-R1]", "end PWR-R1.", "→ recorded: PWR-R1, PWR-R1.S2"]);
  // one location per line (the first match); col counts UTF-8 bytes (`→` is 3 bytes), colUtf16 counts code units
  assert.deepEqual([hits[1].col, hits[3].col, hits[3].colUtf16], [2, 15, 13]);
  assert.deepEqual(findInText(text, "PWR-R1.S2").map((h) => h.line), [1, 5]);
  assert.deepEqual(findInText("PWR-T1.AC2,PWR-T1.AC3 PWR-T1", "PWR-T1").map((h) => h.col), [23]);
});

test("location order: role, active before archived, living spec → change → other, then file and line", () => {
  const L = (role, file, line, archived = false) => ({ role, file, line, col: 1, archived });
  const xs = [L("ref", "src/a.ts", 1), L("def", ".hitl/archive/x/specs/a/spec.md", 3, true), L("brief", ".hitl/changes/c/plan-brief.md", 9),
    L("def", ".hitl/changes/c/specs/a/spec.md", 5), L("test", "tests/a.test.ts", 2), L("def", ".hitl/specs/a/spec.md", 7), L("symbol", "src/a.ts", 4)];
  assert.deepEqual(xs.sort(compareLocations).map((l) => `${l.role} ${l.file}`), [
    "def .hitl/specs/a/spec.md", "def .hitl/changes/c/specs/a/spec.md", "def .hitl/archive/x/specs/a/spec.md", "test tests/a.test.ts",
    "symbol src/a.ts", "brief .hitl/changes/c/plan-brief.md", "ref src/a.ts"]);
  assert.equal(formatLocation({ file: "a.md", line: 3, col: 5, role: "def", archived: true, text: "### X" }), "a.md:3:5: def (archived): ### X");
});

test("roles: spec/scenario defs, brief lines, refs; archived defs flagged and sorted after active ones", async () => {
  const root = project();
  const config = await loadConfig(root);
  const r = await where(root, config, "pwr-r1.s2");
  assert.equal(r.id, "PWR-R1.S2");
  assert.equal(r.kind, "scenario");
  const roles = r.locations.map((l) => `${l.role} ${l.file}:${l.line}`);
  assert.equal(roles[0], `def ${CH}/specs/accounts/spec.md:17`);
  assert.ok(roles.includes(`brief ${CH}/plan-brief.md:8`), roles.join("\n"));
  assert.ok(roles.includes(`brief ${CH}/amend-PWR-A1-brief.md:3`), roles.join("\n"));
  assert.ok(roles.includes(`ref ${CH}/tasks.md:11`), "an AC's spec ref is a ref");
  assert.ok(!r.locations.some((l) => l.file.startsWith(".hitl/index/")), "the generated index dir is not searched");
  const tfa = await where(root, config, "TFA-R1");
  assert.deepEqual(tfa.locations.filter((l) => l.role === "def").map((l) => [l.file, l.archived]),
    [[".hitl/specs/accounts/spec.md", false], [".hitl/archive/2026-10-20-feat-2fa/specs/accounts/spec.md", true]]);
  assert.ok(tfa.locations.findIndex((l) => l.role === "ref" && l.archived) > tfa.locations.findIndex((l) => l.role === "ref" && !l.archived));
});

test("roles: task def, symbols from Symbols rows and @task tags (tag line folded in), AC def, tests via @ac, decision rows", async () => {
  const root = project();
  const config = await loadConfig(root);
  const t = await where(root, config, "PWR-T1");
  const by = (role) => t.locations.filter((l) => l.role === role);
  assert.deepEqual(by("def").map((l) => [l.file, l.line, l.text]), [[`${CH}/tasks.md`, 5, "## PWR-T1 Send a reset link"]]);
  assert.deepEqual(by("symbol").map((l) => [l.symbol, l.line, l.text]), [
    ["src/reset.ts#ResetService.redeem", 9, "redeem(token: string): boolean { return token.length > 0; }"],
    ["src/reset.ts#ResetService.sendLink", 7, "sendLink(email: string): void {}"]].sort((a, b) => a[1] - b[1]));
  assert.ok(!t.locations.some((l) => l.file === "src/reset.ts" && l.line === 5), "the @task tag line inside a listed symbol's docstring is dropped");
  assert.ok(!t.locations.some((l) => l.file === "tests/reset.test.ts"), "PWR-T1 does not match PWR-T1.AC1");
  assert.deepEqual(t.locations.map((l) => l.role), [...t.locations.map((l) => l.role)].sort((a, b) => ["def", "test", "symbol", "brief", "ref"].indexOf(a) - ["def", "test", "symbol", "brief", "ref"].indexOf(b)));
  const ac = await where(root, config, "PWR-T1.AC2");
  assert.deepEqual(ac.locations.map((l) => `${l.role} ${l.file}:${l.line}`), [
    `def ${CH}/tasks.md:11`, "test tests/reset.test.ts:2", "ref tests/reset.test.ts:3"]);
  assert.ok(!ac.locations.some((l) => l.role === "symbol"), "an AC id lists no symbols");
  const d = await where(root, config, "PWR-D1");
  assert.deepEqual(d.locations.filter((l) => l.role === "def").map((l) => l.line), [14]);
  const a = await where(root, config, "PWR-A1");
  assert.deepEqual(a.locations.map((l) => `${l.role} ${l.line}`), ["def 1", "brief 3"]);
});

test("CLI: quickfix lines, --json shape, exit 1 for an unknown id, exit 2 for a non-id", () => {
  const root = project();
  const txt = cli(root, "where", "PWR-T1.AC2");
  assert.equal(txt.code, 0, txt.err);
  assert.deepEqual(txt.out.trim().split("\n"), [
    `${CH}/tasks.md:11:7: def: - [x] PWR-T1.AC2 (PWR-R1.S2) Given an unknown email When a reset is requested Then the same message shows and nothing is sent`,
    "tests/reset.test.ts:2:50: test: /** @covers ResetService.sendLink @ac PWR-T1.AC1,PWR-T1.AC2 @kind example @origin test-author */",
    'tests/reset.test.ts:3:5: ref: it("PWR-T1.AC2 unknown email reveals nothing", () => {});']);
  const js = cli(root, "where", "PWR-T1.AC2", "--json");
  assert.equal(js.code, 0);
  const d = js.json();
  assert.deepEqual(Object.keys(d), ["schema", "id", "kind", "locations"]);
  assert.deepEqual([d.schema, d.id, d.kind], ["hitl.where/1", "PWR-T1.AC2", "ac"]);
  assert.deepEqual(Object.keys(d.locations[0]).sort(), ["archived", "col", "colUtf16", "file", "line", "role", "text"]);
  const none = cli(root, "where", "PWR-R99", "--json");
  assert.equal(none.code, 1);
  assert.deepEqual(none.json().locations, []);
  assert.match(none.err, /PWR-R99 not found/);
  const bad = cli(root, "where", "PWR-X1");
  assert.equal(bad.code, 2);
  assert.match(bad.err, /is not a hitl id/);
  assert.equal(cli(root, "where").code, 2, "no id: usage");
  assert.equal(cli(fs.mkdtempSync(path.join(root, "..", "plain-")), "where", "PWR-R1").code, 3, "not initialized");
});

test("0.19 docs: README upgrade note and section, HUONG-DAN section, help line, version", () => {
  const ROOT = path.resolve(HERE, "../..");
  const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
  const readme = read("README.md");
  const note = readme.slice(readme.indexOf("### Nâng cấp từ 0.18.0"), readme.indexOf("### Nâng cấp từ 0.17.0"));
  assert.ok(note.includes("hitl-index where <id>") && note.includes("migrate"), "README 0.19 upgrade note, before the 0.18 one");
  assert.match(readme, /### 3a\. Nhảy tới id: `hitl-index where` \(0\.19\)/);
  assert.match(readme, /`hitl-index where <id> \[--json\]`/, "README command list");
  assert.match(read("HUONG-DAN.md"), /## 5c\. Nhảy tới id \(0\.19\)/);
  assert.match(read("skills/flow/references/help.md"), /\*\*Id jump\*\* \(0\.19\): `hitl-index where <id>`/);
  assert.match(read("scripts/hitl-index.mjs"), /brief amend where`/, "USAGE lists where");
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.(19|[2-9]\d)\.\d+$/, "version ≥ 0.19.0");
});
