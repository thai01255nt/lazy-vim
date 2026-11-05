// 0.12 — `hitl-index overlap`: deterministic overlap candidates (shared ids, rules, decisions, contracts, symbols,
// files, glossary terms, capability) and the judge's pack. Ported evidence cases from the 0.10 coupling tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { overlapEvidence, overlapPack, changeFiles } from "../../scripts/lib/overlap.mjs";
import { cli, specProject } from "./notes.test.mjs";

const blk = (id, op, o = {}) => ({ id, op, kind: "requirement", rules: [], title: `t ${id}`, text: `text of ${id}`, livingText: id, ...o });
const task = (id, reqs, symbols = []) => ({ id, acs: reqs.map((r, i) => ({ id: `${id}.AC${i + 1}`, reqs: [r] })), symbols, decisions: [] });

test("overlapEvidence: same id, AC ref, serves, Rules:, symbol, contract, capability; refs in the other change's words", () => {
  const a = { id: "feat-a", deltas: [{ capability: "acc", blocks: [blk("ACC-R1", "MODIFIED"), blk("ACC-R7", "ADDED", { rules: ["ACC-BR1"] })] }],
    tasksDoc: { tasks: [task("T-20", ["ACC-R2.S1"]), task("T-21", ["ACC-R7.S1"])] },
    design: { decisions: [{ id: "D-1", decision: "use the mail.yaml contract", why: "", serves: ["ACC-R3"], status: "accepted" }] }, contracts: ["contracts/mail.yaml"] };
  const b = { id: "feat-b", deltas: [{ capability: "acc", blocks: [blk("ACC-R1", "REMOVED"), blk("ACC-R2", "MODIFIED"), blk("ACC-R3", "MODIFIED"), blk("ACC-BR1", "MODIFIED", { kind: "rule" })] }],
    tasksDoc: { tasks: [task("T-30", ["ACC-R9.S1"])] }, design: { decisions: [] }, contracts: ["contracts/mail.yaml"] };
  const lock = { symbols: { "src/a.ts#Svc.run": { tasks: ["T-21", "T-30"] } } };
  const index = { symbols: { "src/a.ts#Svc.run": { name: "run", kind: "method" } } };
  const ev = overlapEvidence(a, b, { index, lock, resolve: (r) => (r === "Svc.run" ? { id: "src/a.ts#Svc.run" } : null) });
  assert.equal(ev.shared, true);
  assert.deepEqual(ev.evidence.map((e) => `${e.type}:${e.ref}`), ["same-id:ACC-R1", "ac-ref:ACC-R2", "serves-ref:ACC-R3", "rule-ref:ACC-BR1", "symbol:Svc.run", "contract:contracts/mail.yaml", "capability:acc"]);
  assert.deepEqual(ev.refsB.sort(), ["ACC-BR1", "ACC-R1", "ACC-R2", "ACC-R3", "Svc.run"].sort());
  const low = overlapEvidence({ id: "x", deltas: [{ capability: "acc", blocks: [blk("ACC-R8", "ADDED")] }] }, { id: "y", deltas: [{ capability: "acc", blocks: [blk("ACC-R9", "ADDED")] }] });
  assert.deepEqual([low.shared, low.evidence.map((e) => e.type)], [false, ["capability"]]);
  assert.deepEqual(overlapEvidence({ id: "x", deltas: [] }, { id: "y", deltas: [] }).evidence, []);
});

test("overlapEvidence: glossary terms (both define, one uses the other's) and files (tasks, design Components, scout sources)", () => {
  const a = { id: "feat-a", deltas: [{ capability: "bil", blocks: [blk("BIL-R5", "ADDED", { text: "The system SHALL waive the Settlement fee for premium customers." })] }],
    glossaryDelta: { terms: [{ term: "Premium customer", op: "ADDED" }] }, design: { decisions: [], sections: { Components: "- `src/billing/settle.ts` — the settle step" } } };
  const b = { id: "feat-b", deltas: [{ capability: "rcpt", blocks: [blk("RCPT-R1", "ADDED", { text: "A receipt SHALL list each premium customer discount." })] }],
    glossaryDelta: { terms: [{ term: "Settlement fee", op: "ADDED" }, { term: "Premium customer", op: "ADDED" }] },
    tasksDoc: { tasks: [{ ...task("T-1", []), symbols: [{ ref: "settle", file: "src/billing/settle.ts" }] }] } };
  const ev = overlapEvidence(a, b, { scoutA: { behaviourFacts: [{ text: "x", source: "src/receipt/print.ts" }] } });
  const got = ev.evidence.map((e) => `${e.type}:${e.ref}`);
  assert.ok(got.includes("term:Premium customer"), got.join(" "));
  assert.ok(got.includes("term:Settlement fee"), "B defines it, A uses it");
  assert.ok(got.includes("file:src/billing/settle.ts"), got.join(" "));
  assert.equal(ev.shared, true);
  assert.deepEqual([...changeFiles(a, { behaviourFacts: [{ source: "src/receipt/print.ts#L3" }] })].sort(), ["src/billing/settle.ts", "src/receipt/print.ts"]);
});

test("overlapPack: named blocks first, then the other change's ADDED blocks in a shared capability; capped", () => {
  const b = { id: "feat-b", deltas: [{ capability: "acc", blocks: [blk("ACC-R2", "MODIFIED"), blk("ACC-R4", "ADDED"), blk("ACC-R5", "ADDED")] }, { capability: "zzz", blocks: [blk("ZZZ-R1", "ADDED")] }],
    design: { decisions: [{ id: "D-2", decision: "mail.yaml goes to v2", why: "", serves: [], status: "accepted" }] } };
  const p = overlapPack({ id: "feat-a" }, b, [{ type: "ac-ref", ref: "ACC-R2" }, { type: "capability", ref: "acc" }, { type: "contract", ref: "contracts/mail.yaml" }]);
  assert.deepEqual(p.blocks.map((x) => x.id), ["ACC-R2", "ACC-R4", "ACC-R5"]);
  assert.equal(p.blocks[0].text, "text of ACC-R2");
  assert.deepEqual(p.decisions.map((d) => d.id), ["D-2"]);
  assert.equal(p.truncated, false);
});

test("hitl-index overlap: no candidates; a second change with the same id; linked by a source note; archived/unknown refused", () => {
  const root = specProject();
  const C = "feat-password-reset";
  let r = cli(root, "overlap", C, "--json");
  assert.equal(r.code, 0, r.err); assert.deepEqual(r.json().candidates, []);
  assert.match(cli(root, "overlap", C).out, /no overlap candidates/);
  const dir = path.join(root, ".hitl/changes/fix-sign-in");
  fs.mkdirSync(path.join(dir, "specs/accounts"), { recursive: true });
  const delta = fs.readFileSync(path.join(root, ".hitl/changes", C, "specs/accounts/spec.md"), "utf8").replace(/change: feat-password-reset/, "change: fix-sign-in");
  fs.writeFileSync(path.join(dir, "specs/accounts/spec.md"), delta);
  fs.writeFileSync(path.join(dir, "proposal.md"), fs.readFileSync(path.join(root, ".hitl/changes", C, "proposal.md"), "utf8").replace(/change: feat-password-reset/, "change: fix-sign-in"));
  r = cli(root, "overlap", C, "--json");
  const c = r.json().candidates;
  assert.equal(c.length, 1); assert.equal(c[0].other, "fix-sign-in"); assert.equal(c[0].shared, true); assert.equal(c[0].linked, false);
  assert.ok(c[0].evidence.some((e) => e.type === "same-id" || e.type === "capability"));
  assert.ok(c[0].pack.blocks.length > 0);
  assert.equal(cli(root, "note", "add", "--change", C, "--source", "fix-sign-in", "--kind", "order", "--text", "wait").code, 0);
  assert.equal(cli(root, "overlap", C, "--json").json().candidates[0].linked, true);
  assert.match(cli(root, "overlap", C).out, /🔎 feat-password-reset may overlap fix-sign-in \(linked by notes\)/);
  assert.equal(cli(root, "overlap", "feat-nope").code, 1);
  assert.equal(cli(root, "overlap").code, 2);
});
