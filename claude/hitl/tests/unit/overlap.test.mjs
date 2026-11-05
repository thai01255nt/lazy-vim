// 0.12 — `hitl-index overlap`: deterministic overlap candidates (shared ids, rules, decisions, contracts, symbols,
// files, glossary terms, capability) and the judge's pack. Ported evidence cases from the 0.10 coupling tests.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { overlapEvidence, overlapPack, changeFiles, codeOverlap, changeCodeFiles, checkOverlapReview, quoteFound, normText, REVIEW_FILE } from "../../scripts/lib/overlap.mjs";
import { cli, specProject } from "./notes.test.mjs";

const blk = (id, op, o = {}) => ({ id, op, kind: "requirement", rules: [], title: `t ${id}`, text: `text of ${id}`, livingText: id, ...o });
const task = (id, reqs, symbols = []) => ({ id, acs: reqs.map((r, i) => ({ id: `${id}.AC${i + 1}`, reqs: [r] })), symbols, decisions: [] });

test("overlapEvidence: same id, AC ref, serves, Rules:, symbol, contract, capability; refs in the other change's words", () => {
  const a = { id: "feat-a", deltas: [{ capability: "acc", blocks: [blk("ACC-R1", "MODIFIED"), blk("ACC-R7", "ADDED", { rules: ["ACC-BR1"] })] }],
    tasksDoc: { tasks: [task("QT-T20", ["ACC-R2.S1"]), task("QT-T21", ["ACC-R7.S1"])] },
    design: { decisions: [{ id: "PWR-D1", decision: "use the mail.yaml contract", why: "", serves: ["ACC-R3"], status: "accepted" }] }, contracts: ["contracts/mail.yaml"] };
  const b = { id: "feat-b", deltas: [{ capability: "acc", blocks: [blk("ACC-R1", "REMOVED"), blk("ACC-R2", "MODIFIED"), blk("ACC-R3", "MODIFIED"), blk("ACC-BR1", "MODIFIED", { kind: "rule" })] }],
    tasksDoc: { tasks: [task("QT-T30", ["ACC-R9.S1"])] }, design: { decisions: [] }, contracts: ["contracts/mail.yaml"] };
  const lock = { symbols: { "src/a.ts#Svc.run": { tasks: ["QT-T21", "QT-T30"] } } };
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
    tasksDoc: { tasks: [{ ...task("QT-T1", []), symbols: [{ ref: "settle", file: "src/billing/settle.ts" }] }] } };
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
    design: { decisions: [{ id: "PWR-D2", decision: "mail.yaml goes to v2", why: "", serves: [], status: "accepted" }] } };
  const p = overlapPack({ id: "feat-a" }, b, [{ type: "ac-ref", ref: "ACC-R2" }, { type: "capability", ref: "acc" }, { type: "contract", ref: "contracts/mail.yaml" }]);
  assert.deepEqual(p.blocks.map((x) => x.id), ["ACC-R2", "ACC-R4", "ACC-R5"]);
  assert.equal(p.blocks[0].text, "text of ACC-R2");
  assert.deepEqual(p.decisions.map((d) => d.id), ["PWR-D2"]);
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

// ---- 0.13.1: code-level evidence, --with, parents, the /hitl:overlap judge verdict (--review)

test("codeOverlap: shared symbols and files of the tasks (### Symbols, tags, locked, scout), drift on a's locked symbols in b's files", () => {
  const index = { symbols: {
    "src/settle.ts#settle": { name: "settle", kind: "function", file: "src/settle.ts", sigHash: "s1", intentHash: "i1", bodyHash: "b2", tags: { task: [] } },
    "src/settle.ts#fee": { name: "fee", kind: "function", file: "src/settle.ts", sigHash: "s9", intentHash: "i1", bodyHash: "b1", tags: { task: [] } },
    "src/report.ts#report": { name: "report", kind: "function", file: "src/report.ts", sigHash: "s1", intentHash: "i1", bodyHash: "b1", tags: { task: ["REP-T1"] } } } };
  const lock = { symbols: {
    "src/settle.ts#settle": { task: "FEE-T1", sigHash: "s1", intentHash: "i1", doneBodyHash: "b1" },
    "src/settle.ts#fee": { task: "FEE-T1", sigHash: "s1", intentHash: "i1" },
    "src/gone.ts#old": { task: "FEE-T1", sigHash: "s1", intentHash: "i1" } }, tasks: { "FEE-T1": { doneAt: "2026-11-01", doneBodyHashes: { "src/settle.ts#settle": "b1" } } } };
  const a = { id: "feat-fee", tasksDoc: { tasks: [{ id: "FEE-T1", acs: [], symbols: [{ ref: "settle", file: "src/settle.ts" }] }] } };
  const b = { id: "feat-waive", tasksDoc: { tasks: [{ id: "WAV-T1", acs: [], symbols: [{ ref: "settle", file: "src/settle.ts" }, { ref: "old", file: "src/gone.ts" }] }] } };
  const resolve = (r) => ({ settle: { id: "src/settle.ts#settle" }, fee: { id: "src/settle.ts#fee" } })[r] || null;
  const c = codeOverlap(a, b, { index, lock, resolve, scoutB: { behaviourFacts: [{ source: "src/report.ts#L4" }] } });
  assert.deepEqual(c.symbols.map((x) => [x.ref, x.a, x.b]), [["settle", ["FEE-T1"], ["WAV-T1"]]]);
  assert.deepEqual(c.files.map((x) => [x.file, x.a, x.b]), [["src/gone.ts", ["FEE-T1"], ["WAV-T1"]], ["src/settle.ts", ["FEE-T1"], ["WAV-T1"]]]);
  const drift = Object.fromEntries(c.drift.map((d) => [d.ref, d.changed]));
  assert.deepEqual(drift.fee, ["sig"], "signature changed since a's lock");
  assert.deepEqual(drift["src/gone.ts#old"], ["deleted"]);
  assert.ok(c.drift.every((d) => d.tasks.join() === "FEE-T1" && d.b.includes("WAV-T1")));
  assert.deepEqual([...changeCodeFiles(b, index, lock, { behaviourFacts: [{ source: "src/report.ts#L4" }] })].map(([f, l]) => `${f}:${l}`).sort(),
    ["src/gone.ts:WAV-T1", "src/report.ts:scout", "src/settle.ts:WAV-T1"]);
  // nothing shared → empty sections; b touches no file of a's locked symbols → no drift
  const none = codeOverlap(a, { id: "x", tasksDoc: { tasks: [{ id: "X-T1", acs: [], symbols: [{ ref: "z", file: "src/z.ts" }] }] } }, { index, lock, resolve });
  assert.deepEqual(none, { symbols: [], files: [], drift: [] });
});

const TEXTS = new Map([
  ["feat-fee", normText("### Requirement: FEE-R1 Settle with a fee\nWhen a charge is settled, the system SHALL add the settlement fee of 1.\n- GIVEN an amount of 10\n- WHEN it is settled\n- THEN the result is 11")],
  ["feat-waive", normText("### Requirement: WAV-R1 Premium settles free\nWhen a premium customer's charge is settled, the system SHALL NOT add a fee.\n- THEN the result is 10")],
  ["feat-report", normText("The report lists every settlement fee of the month.")]]);
const F = (o) => ({ id: "O-1", changes: ["feat-fee", "feat-waive"], type: "contradiction", given: "a premium customer with an amount of 10", when: "the charge is settled",
  then: "feat-fee adds the fee, feat-waive does not", quotes: { "feat-fee": "THEN the result is 11", "feat-waive": "the system SHALL NOT add a fee" },
  refs: { "feat-fee": ["FEE-R1.S2"], "feat-waive": ["WAV-R1"] }, confidence: 90, adjust: "feat-waive", source: "feat-waive", affected: ["feat-fee"], kind: "spec", ...o });

test("checkOverlapReview: a finding needs ≥ 2 changes of the cluster incl. the change, G/W/T, a quote found in each change, confidence ≥ 80", () => {
  const cluster = ["feat-fee", "feat-waive", "feat-report"];
  const r = checkOverlapReview({ findings: [
    F(),
    F({ id: "O-2", quotes: { "feat-fee": "THEN the result is 11" } }),
    F({ id: "O-3", quotes: { "feat-fee": "THEN the result is 12", "feat-waive": "SHALL NOT add a fee" } }),
    F({ id: "O-4", changes: ["feat-fee"] }),
    F({ id: "O-5", changes: ["feat-fee", "feat-nope"] }),
    F({ id: "O-6", changes: ["feat-waive", "feat-report"], quotes: { "feat-waive": "SHALL NOT add a fee", "feat-report": "lists every settlement fee" } }),
    F({ id: "O-7", when: "" }),
    F({ id: "O-8", confidence: 70 }),
    F({ id: "O-9", changes: ["feat-fee", "feat-waive", "feat-report"], quotes: { "feat-fee": "the settlement fee of 1 … result is 11", "feat-waive": "`SHALL NOT add a fee`", "feat-report": "\"lists every settlement fee\"" },
      source: "bogus", affected: [], adjust: null, kind: "design", confidence: 95, refs: { "feat-report": ["REP-R1", "bad id;"] } }),
  ] }, { change: "feat-fee", cluster, texts: TEXTS });
  assert.deepEqual(r.findings.map((f) => f.id), ["O-9", "O-1"], "highest confidence first");
  assert.deepEqual(Object.fromEntries(r.dropped.map((d) => [d.id, d.reason])), {
    "O-2": "witness quote not found in feat-waive", "O-3": "witness quote not found in feat-fee", "O-4": "names fewer than two changes",
    "O-5": "names feat-nope, which this check did not include", "O-6": "not about feat-fee (check it with /hitl:overlap feat-waive feat-report)",
    "O-7": "no Given/When/Then witness", "O-8": "confidence 70 < 80" });
  const [three, one] = r.findings;
  // defaults: no valid source/affected → the change goes first, the others get the notes; adjust = the first affected
  assert.deepEqual([three.source, three.affected, three.adjust, three.kind], ["feat-fee", ["feat-waive", "feat-report"], "feat-waive", "design"]);
  assert.deepEqual(three.refs["feat-report"], ["REP-R1"]);
  assert.equal(three.amend, "/hitl:design feat-waive amend");
  assert.equal(one.n, 2);
  assert.equal(one.line, "⚠️ 2. feat-fee + feat-waive — Given a premium customer with an amount of 10 When the charge is settled Then feat-fee adds the fee, feat-waive does not " +
    "(feat-fee: \"THEN the result is 11\" · feat-waive: \"the system SHALL NOT add a fee\") → 1. adjust feat-waive · 2. both sides (📥 note in feat-fee from feat-waive; " +
    "feat-fee then waits until feat-waive is archived) · 3. not an overlap");
  assert.equal(one.amend, "/hitl:plan feat-waive amend");
  assert.equal(one.notes.length, 1);
  assert.match(one.notes[0].command, /^hitl-index note add --change feat-fee --source feat-waive --kind spec --refs FEE-R1\.S2 --text "[^"`$]+" --from "\/hitl:overlap feat-fee"$/);
  assert.match(three.line, /2\. both sides \(📥 note in feat-waive, feat-report from feat-fee; feat-waive, feat-report then wait until feat-fee is archived\)/);
  assert.deepEqual(checkOverlapReview({}, { change: "feat-fee", cluster, texts: TEXTS }), { findings: [], dropped: [] });
  const many = checkOverlapReview({ findings: Array.from({ length: 7 }, (_, i) => F({ id: `O-${i + 1}`, confidence: 80 + i })) }, { change: "feat-fee", cluster, texts: TEXTS });
  assert.equal(many.findings.length, 5); assert.deepEqual(many.dropped.map((d) => d.id), ["O-2", "O-1"]);
  assert.ok(quoteFound("GIVEN an amount of 10 WHEN it is settled", TEXTS.get("feat-fee")), "a quote may span scenario lines");
  assert.ok(!quoteFound("result", TEXTS.get("feat-fee")), "too short");
});

// a small project with three active changes: feat-fee (BIL), feat-waive (WAV, same file and capability), feat-report (REP)
function threeChanges() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-overlap-"));
  assert.equal(cli(root, "init", "--quiet").code, 0);
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  const change = (id, key, title, cap, req, scen, sym) => {
    put(`.hitl/changes/${id}/proposal.md`, `<!-- audience: business -->\n# ${title}\n> change: ${id} | key: ${key} | status: approved | created: 2026-11-01 | updated: 2026-11-01\n\n## Why\nx\n\n## What changes\n- ${title}.\n`);
    put(`.hitl/changes/${id}/specs/${cap}/spec.md`, `<!-- audience: business -->\n# Delta: ${cap}\n> capability: ${cap} | change: ${id}\n\n## Purpose\nx\n\n## ADDED Requirements\n### Requirement: ${key}-R1 ${title}\n${req}\n\n#### Scenario: ${key}-R1.S1 Case\n${scen}\n`);
    if (sym) put(`.hitl/changes/${id}/tasks.md`, `# ${title} Tasks\n← Change: ${id}\n> status: approved\n\n## ${key}-T1 ${title}\n- prio: P1 | risk: low (small) | impl: agent | blocked-by: none | status: todo\n\n### Acceptance criteria\n- [ ] ${key}-T1.AC1 (${key}-R1.S1) Given 10 When settle Then it works\n\n### Symbols\n1. [ ] \`${sym[0]}\` | modify | \`${sym[1]}\` | impl: agent | ${title}\n`);
  };
  change("feat-fee", "BIL", "Settle with a fee", "billing", "When a charge is settled, the system SHALL add the settlement fee of 1.", "- GIVEN an amount of 10\n- WHEN it is settled\n- THEN the result is 11", ["settle", "src/settle.ts"]);
  change("feat-waive", "WAV", "Premium settles free", "billing", "When a premium customer's charge is settled, the system SHALL NOT add a fee.", "- GIVEN a premium amount of 10\n- WHEN it is settled\n- THEN the result is 10", ["settle", "src/settle.ts"]);
  change("feat-report", "REP", "Monthly report", "reporting", "When a month ends, the system SHALL list every settlement.", "- GIVEN two settlements\n- WHEN the report is made\n- THEN it lists two", null);
  return root;
}

test("hitl-index overlap --with: only the named targets; code section; unknown, archived or self targets refused; parents listed with 🔗", () => {
  const root = threeChanges();
  let r = cli(root, "overlap", "feat-fee", "--json");
  assert.equal(r.code, 0, r.err);
  let j = r.json();
  assert.deepEqual(j.targets, ["feat-report", "feat-waive"]); assert.equal(j.with, false);
  assert.deepEqual(j.candidates.map((c) => c.other), ["feat-waive"]);
  const w = j.candidates[0];
  assert.equal(w.title, "Premium settles free"); assert.equal(w.parent, false);
  assert.deepEqual(w.code.files.map((f) => [f.file, f.a, f.b]), [["src/settle.ts", ["BIL-T1"], ["WAV-T1"]]]);
  assert.ok(w.evidence.some((e) => e.type === "file" && e.ref === "src/settle.ts") && w.evidence.some((e) => e.type === "capability"));
  // --with filters (comma list and repeated flag); targets with no evidence → ✅ line naming them
  j = cli(root, "overlap", "feat-fee", "--with", "feat-report", "--json").json();
  assert.deepEqual([j.targets, j.with, j.candidates], [["feat-report"], true, []]);
  assert.equal(cli(root, "overlap", "feat-fee", "--with", "feat-report").out.trim(), "✅ feat-fee: no overlap with feat-report");
  j = cli(root, "overlap", "feat-fee", "--with", "feat-waive,feat-report", "--json").json();
  assert.deepEqual([j.targets, j.candidates.map((c) => c.other)], [["feat-report", "feat-waive"], ["feat-waive"]]);
  assert.deepEqual(cli(root, "overlap", "feat-fee", "--with", "feat-waive", "--with", "feat-report", "--json").json().targets, ["feat-report", "feat-waive"]);
  r = cli(root, "overlap", "feat-fee", "--with", "feat-waive");
  assert.match(r.out, /^🔎 feat-fee may overlap feat-waive: .*src\/settle\.ts file/m);
  assert.match(r.out, /^   🧩 code: files src\/settle\.ts \(feat-fee BIL-T1 · feat-waive WAV-T1\)$/m);
  r = cli(root, "overlap", "feat-fee", "--with", "feat-nope");
  assert.equal(r.code, 1); assert.match(r.err, /change feat-nope not found/);
  r = cli(root, "overlap", "feat-fee", "--with", "feat-fee");
  assert.equal(r.code, 1); assert.match(r.err, /names feat-fee itself/);
  assert.equal(cli(root, "overlap", "feat-fee", "--keep").code, 2);
  // a parent (holds a note from feat-report, e.g. feat-report was created --before feat-fee) is listed even with no evidence
  assert.equal(cli(root, "note", "add", "--change", "feat-fee", "--source", "feat-report", "--kind", "order", "--text", "wait").code, 0);
  j = cli(root, "overlap", "feat-report", "--json").json();
  const p = j.candidates.find((c) => c.other === "feat-fee");
  assert.deepEqual([p.parent, p.waitsFor, p.linked, p.evidence], [true, false, true, []]);
  assert.match(cli(root, "overlap", "feat-report").out, /^🔗 parent feat-fee — shared: none found yet$/m);
  assert.ok(!cli(root, "overlap", "feat-fee", "--json").json().candidates.some((c) => c.other === "feat-report"), "a change it waits for, with no evidence, is not a candidate");
  // an archived target is refused
  fs.mkdirSync(path.join(root, ".hitl/archive"), { recursive: true });
  fs.renameSync(path.join(root, ".hitl/changes/feat-report"), path.join(root, ".hitl/archive/2026-11-02-feat-report"));
  r = cli(root, "overlap", "feat-fee", "--with", "feat-report");
  assert.equal(r.code, 1); assert.match(r.err, /feat-report is archived/);
});

test("hitl-index overlap --review: checks the judge's verdict against the changes' own text, gate lines, removes the file", () => {
  const root = threeChanges();
  const file = path.join(root, REVIEW_FILE);
  const put = (o) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof o === "string" ? o : JSON.stringify(o)); };
  let r = cli(root, "overlap", "feat-fee", "--with", "feat-waive", "--review", "--json");
  assert.equal(r.code, 1); assert.match(r.json().errors[0], /no verdict/);
  put({ schema: "hitl.overlap-review/1", change: "feat-fee", targets: ["feat-waive"], findings: [
    F({ quotes: { "feat-fee": "THEN the result is 11", "feat-waive": "the system SHALL NOT add a fee" } }),
    F({ id: "O-2", quotes: { "feat-fee": "THEN the result is 99", "feat-waive": "SHALL NOT add a fee" } }),
    F({ id: "O-3", changes: ["feat-fee", "feat-report"], quotes: { "feat-fee": "THEN the result is 11", "feat-report": "list every settlement" } })] });
  r = cli(root, "overlap", "feat-fee", "--with", "feat-waive", "--review", "--keep", "--json");
  assert.equal(r.code, 0, r.err);
  const j = r.json();
  assert.equal(j.schema, "hitl.overlap-gate/1"); assert.deepEqual(j.targets, ["feat-waive"]);
  assert.deepEqual(j.findings.map((f) => f.id), ["O-1"]);
  assert.deepEqual(j.dropped.map((d) => d.id), ["O-2", "O-3"]);
  assert.match(j.dropped[1].reason, /feat-report, which this check did not include/);
  assert.ok(fs.existsSync(file), "--keep keeps the verdict");
  r = cli(root, "overlap", "feat-fee", "--with", "feat-waive", "--review");
  assert.match(r.out, /^⚠️ 1\. feat-fee \+ feat-waive — Given .* → 1\. adjust feat-waive · 2\. both sides \(📥 note in feat-fee from feat-waive; .*\) · 3\. not an overlap$/m);
  assert.match(r.out, /^💡 dropped O-2: witness quote not found in feat-fee$/m);
  assert.ok(!fs.existsSync(file), "the verdict is removed after reading");
  // the note command of "both sides" runs as printed
  put({ change: "feat-fee", findings: [F({ refs: { "feat-fee": ["BIL-R1.S1"], "feat-waive": ["WAV-R1"] } })] });
  const cmd = cli(root, "overlap", "feat-fee", "--with", "feat-waive", "--review", "--json").json().findings[0].notes[0];
  const add = cli(root, "note", "add", "--change", cmd.change, "--source", cmd.source, "--kind", cmd.kind, "--refs", cmd.refs.join(","), "--text", cmd.text, "--from", "/hitl:overlap feat-fee");
  assert.equal(add.code, 0, add.err + add.out);
  assert.match(add.out, /⏳ feat-fee now waits for feat-waive/);
  put({ change: "feat-waive", findings: [] });
  r = cli(root, "overlap", "feat-fee", "--review", "--json");
  assert.equal(r.code, 1); assert.match(r.json().errors[0], /about feat-waive, not feat-fee/);
  put("{ nope");
  assert.match(cli(root, "overlap", "feat-fee", "--review", "--json").json().errors[0], /not JSON/);
  put({ change: "feat-fee", findings: [] });
  assert.match(cli(root, "overlap", "feat-fee", "--with", "feat-waive", "--review").out, /✅ feat-fee: no overlap with a witness among feat-waive/);
});

// ---- dry grade of the overlap eval scenarios (synthetic stream-json, no claude calls)
test("evals (dry): overlap-gate passes on a good transcript; overlap-none fails when a judge runs without evidence", async () => {
  const { gradeRun } = await import("../../evals/grade.mjs");
  const PLUGIN = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
  const cases = JSON.parse(fs.readFileSync(path.join(PLUGIN, "evals/scenarios.json"), "utf8")).cases;
  const asst = (content) => ({ type: "assistant", message: { content } });
  const text = (t) => asst([{ type: "text", text: t }]);
  const tool = (name, input) => asst([{ type: "tool_use", name, input }]);
  const grade = (c, events) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-grade-ov-"));
    const proj = path.join(dir, "proj"); fs.mkdirSync(proj);
    spawnSync("git", ["init", "-q"], { cwd: proj });
    const last = events.filter((e) => e.message?.content?.[0]?.type === "text").at(-1)?.message.content[0].text ?? "";
    fs.writeFileSync(path.join(dir, "out.jsonl"), [...events, { type: "result", result: last, total_cost_usd: 0 }].map((e) => JSON.stringify(e)).join("\n"));
    return gradeRun({ suite: "behaviour", c, dir, proj, pluginDir: PLUGIN, exit: 0 }).checks;
  };
  const gate = cases.find((x) => x.id === "overlap-gate"), none = cases.find((x) => x.id === "overlap-none");
  assert.ok(gate && none, "overlap scenarios exist");
  for (const c of [gate, none]) for (const [k, v] of Object.entries(grade(c, [text("x")]))) assert.notEqual(v.why, "unknown check", `${c.id}: ${k}`);
  const good = grade(gate, [
    tool("Bash", { command: "hitl-index overlap feat-fee --with feat-waive,feat-report --json" }),
    text("🔎 feat-fee may overlap feat-waive: settle symbol · src/settle.ts file"),
    tool("Agent", { subagent_type: "hitl:spec-reviewer", prompt: "Mode: overlap. Change: feat-fee. Targets: feat-waive, feat-report.\nOverlap: hitl-index overlap feat-fee --with feat-waive,feat-report --json" }),
    tool("Bash", { command: "hitl-index overlap feat-fee --with feat-waive,feat-report --review --json" }),
    text("📋 /hitl:overlap feat-fee — 1 finding(s)\n⚠️ 1. feat-fee + feat-waive — Given … → 1. adjust feat-waive · 2. both sides (📥 note in feat-fee from feat-waive; …) · 3. not an overlap\nReply per finding: \"1 2\"")]);
  for (const k of gate.checks) assert.ok(good[k].ok, `${k}: ${good[k].why}`);
  const twoJudges = grade(gate, [tool("Agent", { subagent_type: "hitl:spec-reviewer", prompt: "Mode: overlap. feat-waive" }), tool("Agent", { subagent_type: "hitl:spec-reviewer", prompt: "Mode: overlap. feat-report" }),
    tool("Write", { file_path: "/x/.hitl/changes/feat-fee/notes.md", content: "x" })]);
  assert.equal(twoJudges.overlap_one_judge.ok, false); assert.equal(twoJudges.overlap_judge_cluster.ok, false);
  assert.equal(twoJudges.overlap_cli.ok, false); assert.equal(twoJudges.overlap_gate.ok, false); assert.equal(twoJudges.overlap_no_writes.ok, false);
  const clean = grade(none, [tool("Bash", { command: "hitl-index overlap feat-fee --json" }), text("✅ feat-fee: no overlap (no other active change)")]);
  for (const k of none.checks) assert.ok(clean[k].ok, `${k}: ${clean[k].why}`);
  const judged = grade(none, [tool("Bash", { command: "hitl-index overlap feat-fee --json" }), tool("Agent", { subagent_type: "hitl:spec-reviewer" }), text("✅ no overlap")]);
  assert.equal(judged.overlap_no_judge.ok, false);
});
