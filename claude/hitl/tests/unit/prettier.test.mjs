// 0.14.1 — the markdown files hitl writes stay the same under prettier (markdownlint style; many editors run it on
// save): templates and eval brief fixtures are prettier-clean, every hitl parser reads a prettier-formatted file the same
// (proposal, deltas, living specs, design, glossary, tasks, notes, briefs), tidyMarkdown() (the CLI writers' style) is
// what prettier would print, and files the CLI writes (living spec, glossary, notes) need no change.
// Skipped when prettier is not installed (PATH or ~/.local/share/nvim/mason/bin/prettier).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseProposal, parseDelta, parseLivingSpec, parseDesign, parseGlossary, canonicalBlock } from "../../scripts/lib/specmd.mjs";
import { parseTasksMd } from "../../scripts/lib/tasksmd.mjs";
import { parseNotes } from "../../scripts/lib/notes.mjs";
import { parseBrief } from "../../scripts/lib/brief.mjs";
import { tidyMarkdown } from "../../scripts/lib/mdstyle.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(ROOT, "scripts/hitl-index.mjs");
const PRETTIER = (() => {
  const onPath = spawnSync("sh", ["-c", "command -v prettier"], { encoding: "utf8" }).stdout.trim();
  const mason = path.join(os.homedir(), ".local/share/nvim/mason/bin/prettier");
  return onPath || (fs.existsSync(mason) ? mason : null);
})();
const skip = PRETTIER ? false : "prettier not found (PATH or ~/.local/share/nvim/mason/bin/prettier)";
const walk = (p) => (!fs.existsSync(p) ? [] : fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((x) => walk(path.join(p, x))) : [p]);
const mdUnder = (...dirs) => dirs.flatMap((d) => walk(path.join(ROOT, d))).filter((f) => f.endsWith(".md"));

/** Copy files into a temp dir (same relative paths), run prettier --write once, return {rel: [before, after]}. */
function formatted(files) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-prettier-"));
  const rels = files.map((f) => path.relative(ROOT, f));
  for (const r of rels) { fs.mkdirSync(path.dirname(path.join(tmp, r)), { recursive: true }); fs.copyFileSync(path.join(ROOT, r), path.join(tmp, r)); }
  execFileSync(PRETTIER, ["--write", "--no-config", "--ignore-path", "", ...rels], { cwd: tmp, stdio: "ignore" });
  return Object.fromEntries(rels.map((r) => [r, [fs.readFileSync(path.join(ROOT, r), "utf8"), fs.readFileSync(path.join(tmp, r), "utf8")]]));
}

const parserOf = (f) => {
  if (/-brief\.md$/.test(f)) return (t) => parseBrief(t, "x");
  if (/proposal\.md$/.test(f)) return (t) => parseProposal(t, "x");
  if (/(?:changes|archive)\/[^/]+\/specs\/.*spec\.md$/.test(f)) return (t) => parseDelta(t, "x");
  if (/specs\/[^/]+\/spec\.md$/.test(f)) return (t) => parseLivingSpec(t, "x");
  if (/design\.md$/.test(f)) return (t) => parseDesign(t, "x");
  if (/GLOSSARY\.md$/.test(f)) return (t) => parseGlossary(t, "x");
  if (/glossary\.md$/.test(f)) return (t) => parseGlossary(t, "x", { delta: true });
  if (/notes\.md$/.test(f)) return (t) => parseNotes(t);
  if (/tasks(?:\.md|\/[^/]+\.md)$/.test(f)) return (t) => parseTasksMd(t, "x");
  return null;
};
// line numbers move; text keeps its meaning (canonical form: blank lines, padding, emphasis style)
const DROP = new Set(["line", "lines", "n", "file", "purposeLine"]);
const norm = (v) => (Array.isArray(v) ? v.map(norm) : v && typeof v === "object"
  ? Object.fromEntries(Object.entries(v).filter(([k]) => !DROP.has(k)).map(([k, x]) => [k, k === "items" ? x.map((i) => i.code) : norm(x)]))
  : typeof v === "string" ? canonicalBlock(v) : v);

test("prettier --check: shared/templates/**/*.md and evals/fixtures/briefs/**/*.md are clean", { skip }, () => {
  const r = spawnSync(PRETTIER, ["--check", "--no-config", "shared/templates/**/*.md", "evals/fixtures/briefs/**/*.md"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});

test("every hitl parser reads a prettier-formatted fixture the same way", { skip }, () => {
  const files = mdUnder("tests/fixtures", "evals/fixtures").filter((f) => /\/\.hitl\/|\/briefs\/|\/standards\//.test(f) && parserOf(f));
  assert.ok(files.length > 30, `found ${files.length} fixture files`);
  const out = formatted(files);
  let changed = 0;
  for (const [rel, [a, b]] of Object.entries(out)) {
    if (a !== b) changed++;
    const p = parserOf(rel);
    assert.deepEqual(norm(p(b)), norm(p(a)), `${rel}: parse differs after prettier`);
  }
  assert.ok(changed > 10, "prettier changed the compact fixtures (so the comparison means something)");
});

test("brief: marks written right under an answer (prettier pulls them into the blockquote) parse as marks", { skip }, () => {
  const text = `# Plan brief — feat-a
> change: feat-a | key: FA | kind: plan | status: open | round: 2
## Round 1 ✅
### Q1 [R] Who?
> admins
> and accountants
→ recorded: FA-R1
### Q2 [R] Why?
> tại sao?
💬 Because it saves a day.
Option 1: CSV. Option 2: Excel.
💡 Recommended: CSV only.
→ carried to Round 2
### Notes — anything the questions missed, or a change to an earlier answer
> Q1: also auditors
→ recorded: FA-R1 (changed)
## Close
### Approve the spec? (Y/n)
> Y
→ approved 2026-11-19
`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-prettier-"));
  fs.writeFileSync(path.join(tmp, "plan-brief.md"), text);
  execFileSync(PRETTIER, ["--write", "--no-config", "plan-brief.md"], { cwd: tmp, stdio: "ignore" });
  const after = fs.readFileSync(path.join(tmp, "plan-brief.md"), "utf8");
  assert.match(after, /^> → recorded: FA-R1$/m, "prettier rewrote the mark into the blockquote");
  assert.match(after, /^> 💬 Because/m);
  const a = parseBrief(text), b = parseBrief(after);
  assert.deepEqual(norm(b), norm(a));
  const q = (x, id) => x.questions.find((y) => y.id === id);
  assert.deepEqual([q(b, "Q1").answer, q(b, "Q1").recorded], ["admins\nand accountants", ["FA-R1"]]);
  assert.deepEqual([q(b, "Q2").answer, q(b, "Q2").discussed, q(b, "Q2").carried, q(b, "Q2").recommended], ["tại sao?", true, 2, "CSV only."]);
  assert.deepEqual([b.rounds[0].notes.text, b.rounds[0].notes.marked], ["Q1: also auditors", true]);
  assert.deepEqual([b.close.answer, b.close.resolved], ["Y", "approved 2026-11-19"]);
  // the documented form (a blank line before every mark) is already prettier-clean
  const good = tidyMarkdown(text);
  assert.deepEqual(norm(parseBrief(good)), norm(a));
});

test("tidyMarkdown (the CLI writers' style) prints what prettier prints", { skip }, () => {
  const files = [...mdUnder("tests/fixtures/spec-app/.hitl", "tests/fixtures/legacy-ids/.hitl", "evals/fixtures/churn-app/.hitl", "evals/fixtures/lua-app/.hitl", "tests/fixtures/standards"),
    ...mdUnder("shared/templates")];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-tidy-"));
  const rels = files.map((f) => path.relative(ROOT, f));
  const tidy = {};
  for (const r of rels) { tidy[r] = tidyMarkdown(fs.readFileSync(path.join(ROOT, r), "utf8")); fs.mkdirSync(path.dirname(path.join(tmp, r)), { recursive: true }); fs.writeFileSync(path.join(tmp, r), tidy[r]); }
  execFileSync(PRETTIER, ["--write", "--no-config", "--ignore-path", "", ...rels], { cwd: tmp, stdio: "ignore" });
  for (const r of rels) assert.equal(fs.readFileSync(path.join(tmp, r), "utf8").replace(/\n+$/, ""), tidy[r].replace(/\n+$/, ""), `${r}: prettier changes tidyMarkdown output`);
});

test("files the CLI writes (living spec + glossary after merge, notes.md) are prettier-clean", { skip }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-prettier-"));
  fs.cpSync(path.join(ROOT, "tests/fixtures/spec-app"), root, { recursive: true });
  const cli = (...a) => execFileSync(process.execPath, [CLI, ...a], { cwd: root, encoding: "utf8" });
  cli("spec", "merge", "feat-password-reset", "--json");
  cli("note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "PWR-R1", "--text", "The link lasts 15 minutes.\n\nSecond paragraph.", "--json");
  const files = [".hitl/specs/accounts/spec.md", ".hitl/specs/GLOSSARY.md", ".hitl/changes/feat-password-reset/notes.md"];
  const r = spawnSync(PRETTIER, ["--check", "--no-config", "--ignore-path", "", ...files], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
