// 0.8 phase 2 — lib/glossary.mjs: the one avoided-word matcher (TERM_AVOIDED) used by `spec validate` (business files)
// and `l0` (intent docstrings of a task's symbols), plus the task glossary and the review "structure" suggestions.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { avoidList, avoidedInIntents, avoidedMessage, effectiveTerms, findAvoided, phraseRx } from "../../scripts/lib/glossary.mjs";
import { effectiveTerms as viaContext } from "../../scripts/lib/context.mjs";
import { changeForTask, loadSpecContext, resetStatusCache, taskGlossary, validate } from "../../scripts/lib/changes.mjs";
import { parseGlossary } from "../../scripts/lib/specmd.mjs";
import { buildReport, computeVerdict } from "../../scripts/lib/report.mjs";
import { makeProject, write } from "./_project.mjs";
import { updateIndex } from "../../scripts/lib/api.mjs";
import { loadConfig } from "../../scripts/lib/config.mjs";
import { computeL0 } from "../../scripts/cmd/l0.mjs";

const TERMS = [
  { term: "Account", avoid: ["user record", "profile", "user"] },
  { term: "Reset link", avoid: ["token", "magic link"] },
  { term: "Customer account", avoid: [] },
  { term: "Hoàn tiền", avoid: ["trả tiền"] },
];
const words = (text, terms = TERMS) => findAvoided(text, terms).map((x) => [x.word, x.term, x.line, x.count]);

test("phraseRx: whole words, case and spaces folded, dotted code neighbours are not words", () => {
  const rx = phraseRx("user record");
  assert.ok(rx.test("Merge two USER  RECORD rows"));
  assert.ok(rx.test("the user\nrecord"), "any whitespace between words");
  assert.ok(!phraseRx("user").test("users and username"), "no partial word");
  assert.ok(!phraseRx("user").test("reads order.user and user.id"), "dotted neighbours are code");
  assert.ok(phraseRx("user").test("asks the user."), "a sentence-final dot is not code");
  assert.ok(!phraseRx("hoàn tiền").test("hoàn tiềnx"), "Unicode word boundary");
});

test("avoidList: longest first, first term wins, a word that is a term's name is never avoided", () => {
  const list = avoidList([...TERMS, { term: "Profile", avoid: [] }, { term: "Order", avoid: ["Token "] }]);
  assert.deepEqual(list.map((x) => [x.word, x.term]), [["user record", "Account"], ["magic link", "Reset link"], ["trả tiền", "Hoàn tiền"], ["token", "Reset link"], ["user", "Account"]]);
  assert.deepEqual(avoidList([]), []);
  assert.deepEqual(avoidList(null), []);
});

test("findAvoided: multi-word, case-insensitive, one item per word with its first line and count", () => {
  assert.deepEqual(words("# Title\nThe User Record is kept.\nA profile, another Profile.\nNo users here."),
    [["User Record", "Account", 2, 1], ["profile", "Account", 3, 2]]);
  assert.deepEqual(words("khách được trả tiền"), [["trả tiền", "Hoàn tiền", 1, 1]], "diacritics");
  assert.equal(avoidedMessage({ word: "user record", term: "Account", count: 1 }), `"user record" → use Account (glossary)`);
  assert.equal(avoidedMessage({ word: "token", term: "Reset link", count: 3 }), `"token" → use Reset link (glossary) · 3 uses`);
});

test("findAvoided: skips code spans, fences, comments, meta lines and _Avoid_ lines", () => {
  const text = [
    "> change: feat-x | status: draft (a token here is meta)",
    "Send the `token` value.",
    "```",
    "token = make_token()",
    "```",
    "<!-- the old token flow -->",
    "_Avoid_: token, magic link",
    "A magic link is sent.",
  ].join("\n");
  assert.deepEqual(words(text), [["magic link", "Reset link", 8, 1]]);
});

test("findAvoided: a longer avoided phrase or a term's own name claims the words once", () => {
  assert.deepEqual(words("the user record of a user"), [["user record", "Account", 1, 1], ["user", "Account", 1, 1]]);
  const terms = [{ term: "Customer account", avoid: [] }, { term: "Account", avoid: ["account holder"] }, { term: "Client", avoid: ["customer"] }];
  assert.deepEqual(words("Each Customer account has an owner; a customer pays.", terms), [["customer", "Client", 1, 1]]);
  assert.deepEqual(words("no avoided words", [{ term: "Account", avoid: [] }]), []);
});

test("effectiveTerms lives in glossary.mjs; context.mjs re-exports the same function", () => {
  assert.equal(viaContext, effectiveTerms);
});

test("avoidedInIntents: warn items per symbol with the term to use; symbols without intent or glossary words are skipped", () => {
  const index = { symbols: {
    "src/a.ts#createUser": { name: "createUser", file: "src/a.ts", intent: "Creates the user record for an email.\nReturns the `user` id." },
    "src/a.ts#noIntent": { name: "noIntent", file: "src/a.ts", intent: "" },
    "src/a.ts#clean": { name: "clean", file: "src/a.ts", intent: "Opens the Account." },
  } };
  const items = avoidedInIntents(index, ["src/a.ts#createUser", "src/a.ts#noIntent", "src/a.ts#clean", "src/a.ts#missing"], TERMS);
  assert.deepEqual(items, [{ level: "warn", code: "TERM_AVOIDED", ref: "createUser", symbol: "src/a.ts#createUser", file: "src/a.ts",
    word: "user record", term: "Account", message: `intent of createUser: "user record" → use Account (glossary)` }]);
  assert.deepEqual(avoidedInIntents(index, Object.keys(index.symbols), [{ term: "Account", avoid: [] }]), []);
  assert.deepEqual(avoidedInIntents(null, ["x"], TERMS), []);
});

// ---------------------------------------------------------------- spec validate (business files)
const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/spec-app");
const PR = ".hitl/changes/feat-password-reset";
function project(edits = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-gloss-"));
  fs.cpSync(FIX, root, { recursive: true });
  for (const [rel, [from, to]] of Object.entries(edits)) {
    const abs = path.join(root, rel); const t = fs.readFileSync(abs, "utf8");
    assert.ok(t.includes(from), `${rel} lacks ${from}`);
    fs.writeFileSync(abs, t.replace(from, to));
  }
  resetStatusCache();
  return root;
}
const avoided = (res) => res.items.filter((i) => i.code === "TERM_AVOIDED").map((i) => [i.level, i.file.split("/").slice(-2).join("/"), i.ref, i.line, i.message]);

test("spec validate: TERM_AVOIDED warns in proposal and spec deltas against living + change glossary, never in glossary files", async () => {
  const root = project({
    [`${PR}/proposal.md`]: ["Users who forget their password", "Users whose user record has a forgotten password"],
    [`${PR}/specs/accounts/spec.md`]: ["the system SHALL send a single-use reset link", "the system SHALL send a single-use Magic Link (`token`)"],
  });
  const res = await validate(root, {}, { change: "feat-password-reset", record: false });
  assert.deepEqual(avoided(res), [
    ["warn", "feat-password-reset/proposal.md", "user record", 6, `"user record" → use Account (glossary)`],
    ["warn", "accounts/spec.md", "Magic Link", 7, `"Magic Link" → use Reset link (glossary)`],
  ]);
  assert.equal(res.ok, true, "never blocks");
  const strict = await validate(root, { spec: { businessLint: "error" } }, { change: "feat-password-reset", record: false });
  assert.ok(avoided(strict).every((x) => x[0] === "warn"), "a warning even when the business lint is an error");
  const off = await validate(root, { spec: { businessLint: "off" } }, { change: "feat-password-reset", record: false });
  assert.deepEqual(avoided(off), [], "businessLint off turns it off");
});

test("spec validate: a term the change REMOVES no longer has avoided words", async () => {
  const root = project({
    [`${PR}/proposal.md`]: ["Users who forget their password", "A profile owner who forgets the password"],
    [`${PR}/glossary.md`]: ["## ADDED Terms", "## REMOVED Terms\n### Term: Account\nReason: renamed later\n\n## ADDED Terms"],
  });
  const res = await validate(root, {}, { change: "feat-password-reset", record: false });
  assert.deepEqual(avoided(res), []);
});

// ---------------------------------------------------------------- l0: the task glossary
test("taskGlossary: living + the active change's delta; archived or no change → living only", async () => {
  const root = project();
  const ctx = await loadSpecContext(root);
  const g = taskGlossary(ctx, { id: "T-12", change: "feat-password-reset" });
  assert.deepEqual(effectiveTerms(g.living, g.delta).map((t) => t.term), ["Account", "Reset link"]);
  assert.equal(taskGlossary(ctx, { id: "T-1" }).delta, null);
  assert.equal(taskGlossary(ctx, { id: "T-1" }).living.terms[0].term, "Account");
  const arch = ctx.entries.find((x) => x.entry.archived);
  assert.ok(arch && changeForTask(ctx, { id: "T-2", change: arch.entry.id }));
  assert.equal(taskGlossary(ctx, { id: "T-2", change: arch.entry.id }).delta, null, "archived: already merged");
  assert.deepEqual(taskGlossary(null, null), { living: null, delta: null });
});

test("l0 terms on a parsed glossary: delta terms count, REMOVED ones do not", () => {
  const living = parseGlossary("# Glossary\n> updated: 2026-10-20\n\n### Term: Account\nAn identity.\n_Avoid_: user record\n", "GLOSSARY.md");
  const delta = parseGlossary("# Glossary delta\n> change: x\n\n## ADDED Terms\n### Term: Reset link\nA link.\n_Avoid_: token\n\n## REMOVED Terms\n### Term: Account\nReason: gone\n", "g.md", { delta: true });
  const index = { symbols: { a: { name: "send", file: "a.ts", intent: "Sends a token to the user record's email." } } };
  assert.deepEqual(avoidedInIntents(index, ["a"], effectiveTerms(living, delta)).map((i) => i.word), ["token"]);
  assert.deepEqual(avoidedInIntents(index, ["a"], effectiveTerms(living, null)).map((i) => i.word), ["user record"]);
});

// ---------------------------------------------------------------- review: structure suggestions (refactor step)
test("report: structure findings are suggestions — own section, never WITH FIXES, never a human gate", () => {
  const S = "src/a.ts#createUser";
  const l0 = { gates: [{ name: "tests", result: "pass", detail: "" }], tests: { pass: 2, fail: 0, error: 0 }, drift: { summary: { block: 0 } } };
  const F = (key, o) => ({ key, lens: "contract", symbol: S, file: "src/a.ts", line: 9, confidence: 90, verifiedConfidence: 90, keep: true, title: key, evidence: "e", fixOwner: "human", ...o });
  const findings = [F("contract-1", { category: "structure", severity: "important", suggestedFix: "extract the shared check" }), F("contract-2", { category: "structure", severity: "minor", fixOwner: "agent" })];
  const v = computeVerdict({ l0, findings, decisions: {}, risk: { symbols: {} }, thr: 80 });
  assert.deepEqual(v, { verdict: "PASS", humanRequired: 0 });
  const rep = buildReport({ taskId: "T-1", title: "x", l0, findings: { findings, setAside: [] }, decisions: null, risk: { symbols: {} }, config: {}, head: "h", now: "n" });
  const md = rep.markdown;
  assert.match(md, /## Findings needing a decision\nnone\n/);
  assert.match(md, /## Structure \(suggestions\)\nRefactor step: tests stay green and untouched\./);
  assert.match(md, /- F-1 contract-1 — src\/a\.ts:9 → extract the shared check\n- F-2 contract-2 — src\/a\.ts:9\n/);
  assert.match(md, /## Collapsed: minor or conf<80 \(0\)/, "not hidden among the collapsed");
  assert.ok(md.indexOf("## Structure") > md.indexOf("## Findings needing a decision") && md.indexOf("## Structure") < md.indexOf("## Intent vs body"));
  const none = buildReport({ taskId: "T-1", title: "x", l0, findings: { findings: [], setAside: [] }, decisions: null, risk: { symbols: {} }, config: {}, head: "h", now: "n" });
  assert.doesNotMatch(none.markdown, /## Structure/, "no section without structure findings");
});

// ---------------------------------------------------------------- l0: the terms gate end to end
test("l0: the terms gate warns on intents of the task's symbols; skip without _Avoid_ words; never fails", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const gate = (l0) => l0.gates.find((g) => g.name === "terms");
  const none = await computeL0(root, await loadConfig(root), "T-1");
  assert.deepEqual(gate(none), { name: "terms", result: "skip", detail: "no _Avoid_ words in the glossary" });
  assert.deepEqual(none.terms, { items: [] });
  write(root, ".hitl/specs/GLOSSARY.md", "# Glossary\n> updated: 2026-10-20\n\n### Term: Account\nA person's identity.\n_Avoid_: user\n");
  const l0 = await computeL0(root, await loadConfig(root), "T-1");
  assert.equal(gate(l0).result, "warn");
  assert.deepEqual(l0.terms.items.map((i) => [i.ref, i.message]).sort(), [
    ["UserRepo.findByEmail", `intent of UserRepo.findByEmail: "user" → use Account (glossary)`],
    ["UserService.createUser", `intent of UserService.createUser: "user" → use Account (glossary)`],
  ]);
  assert.ok(!l0.terms.items.some((i) => i.ref === "register"), "only the task's symbols");
});
