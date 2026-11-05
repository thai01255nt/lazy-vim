// Prompt lint: every SKILL.md / agent has parseable frontmatter; v0.5 planning paths appear only as legacy/migration
// notes; /hitl:plan carries none of the old skeleton-first design-tree vocabulary (design v3 §3).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const skills = fs.readdirSync(path.join(ROOT, "skills")).filter((d) => fs.existsSync(path.join(ROOT, "skills", d, "SKILL.md")));
const agents = fs.readdirSync(path.join(ROOT, "agents")).filter((f) => f.endsWith(".md"));
const VENDORED = new Set(["security-audit", "grilling"]);

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^([a-z][a-z-]*):\s*(.*)$/);
    if (kv) out[kv[1]] = kv[2].replace(/^"(.*)"$/, "$1");
  }
  return out;
}

test("every skill has frontmatter with name = dir and a description", () => {
  assert.ok(skills.length >= 16, `skills found: ${skills.join(",")}`);
  for (const d of skills) {
    const fm = frontmatter(read(`skills/${d}/SKILL.md`));
    assert.ok(fm, `${d}: frontmatter`);
    assert.equal(fm.name, d, `${d}: name`);
    assert.ok((fm.description || "").length > 40, `${d}: description`);
  }
  for (const d of ["plan", "design", "archive", "grilling"]) assert.ok(skills.includes(d), `skill ${d} exists`);
});

test("every agent has frontmatter with name = file and tools", () => {
  for (const f of agents) {
    const fm = frontmatter(read(`agents/${f}`));
    assert.ok(fm, `${f}: frontmatter`);
    assert.equal(fm.name, f.replace(/\.md$/, ""));
    assert.ok(fm.tools && fm.description, `${f}: tools + description`);
  }
  for (const a of ["spec-scout", "spec-reviewer"]) assert.ok(agents.includes(`${a}.md`), `agent ${a}`);
});

test(".hitl/planning/ appears only in legacy / migration notes", () => {
  const files = [...skills.filter((d) => !VENDORED.has(d)).flatMap((d) => {
    const dir = path.join(ROOT, "skills", d);
    const walk = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((x) => walk(path.join(p, x))) : [p];
    return walk(dir).filter((p) => p.endsWith(".md"));
  }), ...agents.map((f) => path.join(ROOT, "agents", f)), ...fs.readdirSync(path.join(ROOT, "shared")).filter((f) => f.endsWith(".md")).map((f) => path.join(ROOT, "shared", f))];
  for (const abs of files) {
    const lines = fs.readFileSync(abs, "utf8").split("\n");
    lines.forEach((l, i) => {
      if (!/planning\//.test(l)) return;
      assert.match(l, /legacy|v0\.5|migrat|compat/i, `${path.relative(ROOT, abs)}:${i + 1} mentions planning/ outside a legacy note: ${l.trim()}`);
    });
  }
});

test("/hitl:plan has no design-tree vocabulary; templates dropped the v0.5 planning file", () => {
  const plan = read("skills/plan/SKILL.md");
  for (const bad of ["Level 1", "Level 2", "Test seams", "Components", "Part A", "Part B", "design tree", "## Risks"])
    assert.ok(!plan.includes(bad), `plan/SKILL.md contains "${bad}"`);
  assert.ok(!fs.existsSync(path.join(ROOT, "shared/templates/planning.md")), "planning template removed");
  assert.ok(!fs.existsSync(path.join(ROOT, "skills/plan/references/grilling.md")), "adapted grilling reference removed");
  assert.ok(fs.existsSync(path.join(ROOT, "tests/fixtures/legacy/planning-template.md")), "legacy copy kept for migrate tests");
});

test("skill descriptions route plan vs design vs grilling", () => {
  const d = (s) => frontmatter(read(`skills/${s}/SKILL.md`)).description;
  assert.match(d("plan"), /WHAT and WHY/);
  assert.match(d("plan"), /Not for architecture/);
  assert.doesNotMatch(d("plan"), /thiết kế|design tree/);
  assert.match(d("design"), /HOW/);
  assert.match(d("design"), /thiết kế/);
  assert.match(d("design"), /Not for requirements/);
});

test("shared language (0.8): [T] tag + credited Shared language, Plain replies stays short, glossary rules, glossary loaded", () => {
  const iv = read("shared/interview.md");
  assert.match(iv, /^\| `\[T\]` \|/m, "interview: [T] row");
  assert.match(iv, /^## 10\. Shared language/m);
  assert.match(iv, /\*\*A question is never an answer\.\*\*/, "interview §6: a question/discussion records nothing");
  assert.match(iv, /^## 7\. Recording \(settled answers only/m, "interview §7: records settled answers only");
  for (const s of ["plan", "design"]) assert.match(read(`skills/${s}/SKILL.md`), /question or discussion records nothing/, `${s}: no recording on a question`);
  assert.match(iv, /Adapted from mattpocock\/skills \(MIT\) — see NOTICE\.md\. Source: skills\/engineering\/domain-modeling\//);
  const conv = read("shared/conventions.md");
  const plain = conv.split(/^## Plain replies.*$/m)[1]?.split(/^## /m)[0] ?? "";
  assert.ok(plain, "conventions: ## Plain replies");
  const bullets = plain.split("\n").filter((l) => /^- /.test(l)).length;
  assert.ok(bullets > 0 && bullets <= 8, `Plain replies has ${bullets} bullets (≤ 8: the model copies the length)`);
  for (const w of ["`?`", "`wait`", "`hả`", "`giải thích`", "`không hiểu`"]) assert.ok(plain.includes(w), `recovery reply ${w}`);
  const g = read("shared/templates/glossary.md");
  assert.ok(g.includes("_Avoid_") && g.includes("In this project"), "glossary template rules");
  assert.match(g, /@ 4ae2317/);
  for (const s of ["plan", "design", "tasks"]) assert.match(read(`skills/${s}/SKILL.md`), /GLOSSARY\.md/, `${s} loads the glossary`);
  assert.match(read("skills/design/SKILL.md"), /💡 Needs term/);
  assert.match(read("agents/spec-scout.md"), /"vocabulary":/);
  assert.doesNotMatch(read("skills/tasks/references/slicing-and-risk.md"), /glossary \(BUSINESS-CONTEXT\)/);
  assert.doesNotMatch(read("skills/review/SKILL.md"), /Decide: F-1 \(accept/, "review gate glosses each finding");
});

test("test patterns (0.8): one source of truth, inner loop, tdd routing", () => {
  for (const f of ["agents/test-author.md", "agents/implementer.md", "skills/review/references/lenses.md", "skills/skeleton/SKILL.md",
    "skills/test/SKILL.md", "skills/implement/SKILL.md", "skills/design/SKILL.md", "skills/tdd/SKILL.md", "skills/test/references/tdd-rules.md"])
    assert.match(read(f), /shared\/test-patterns\.md/, `${f} points at shared/test-patterns.md`);
  assert.doesNotMatch(read("skills/test/references/tdd-rules.md"), /^\| real \|/m, "the duplicated good-tests table is gone");
  assert.match(read("agents/implementer.md"), /one failing test at a time/);
  assert.match(read("agents/implementer.md"), /only runs\s+without progress count/);
  assert.match(read("skills/implement/SKILL.md"), /Max iterations: 3 \(runs without progress\)/);
  assert.match(read("skills/test/SKILL.md"), /Pattern glance/);
  assert.match(read("skills/review/SKILL.md"), /Tests lens: add the line `Test patterns:/);
  assert.match(read("skills/tasks/references/slicing-and-risk.md"), /AC1 = the tracer/);
  assert.match(read("shared/templates/design.md"), /per ADDED\/MODIFIED requirement: `- <req id> — <seam> — catches/);
  const d = (s) => frontmatter(read(`skills/${s}/SKILL.md`)).description;
  assert.match(d("test"), /hitl:tdd/);
  assert.match(d("tdd"), /no hitl change/);
  assert.ok(!VENDORED.has("tdd"), "skills/tdd/SKILL.md is hitl's own and linted like other skills");
  assert.match(read("skills/flow/references/help.md"), /^\| `\/hitl:tdd` \|/m);
  assert.match(read("README.md"), /^\| `\/hitl:tdd /m);
  const notice = read("NOTICE.md");
  assert.match(notice, /Two skills are vendored unmodified/);
  assert.match(notice, /`shared\/test-patterns\.md` — from/);
  assert.match(notice, /`skills\/tdd\/SKILL\.md` \(`hitl:tdd`\) — adapted from/);
  assert.match(notice, /### mattpocock\/skills `tdd` reference files/);
});

test("churn (0.9): capture rule next to Plain replies, Impact block, approve forms, docs rows", () => {
  const conv = read("shared/conventions.md");
  const order = ["## Plain replies", "## Changes stated in chat (📌 notes)", "## No over-questioning"].map((h) => conv.indexOf(h));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "capture section sits right after Plain replies");
  const cap = conv.split("## Changes stated in chat (📌 notes)")[1].split(/^## /m)[0];
  assert.match(cap, /📌 Note for <change>, refs <ids \(titles\)>\? \(Y\/n\)/);
  assert.match(cap, /hitl-index note add --change/);
  assert.match(cap, /a question \(discuss it; nothing is recorded\)/);
  assert.match(cap, /explicit "amend\/apply it now" \(go straight to `amend-spec\.md`\)/);
  assert.match(conv, /Edit `\.hitl\/changes\/\*\/notes\.md`/);
  const amend = read("shared/amend-spec.md");
  assert.match(amend, /\*\*Impact block\*\*/);
  assert.match(amend, /hitl-index note apply --change <id> \[N-k\] --impact/);
  assert.match(amend, /\/hitl:approve <id> reopen N-k/);
  const ap = read("skills/approve/SKILL.md");
  for (const w of ["--stage reopen", "--stage dismiss", "--stage defer", "--ack <ids>", "nothing to unlock (confirmed by human)"]) assert.ok(ap.includes(w), `approve: ${w}`);
  assert.match(frontmatter(ap)["argument-hint"], /reopen \[N-k\]/);
  for (const s of ["plan", "design"]) assert.match(read(`skills/${s}/SKILL.md`), /amend \[N-k\]/, `${s} amend N-k`);
  assert.match(read("skills/test/SKILL.md"), /\*\*reopen fill\*\*/);
  assert.match(read("skills/skeleton/SKILL.md"), /\*\*reopen mode\*\*/);
  assert.match(read("skills/flow/SKILL.md"), /📌 T-14 blocked by N-3/);
  assert.match(read("skills/archive/SKILL.md"), /preconditions\.notes\.open/);
  assert.match(read("skills/flow/references/help.md"), /^\| `\/hitl:approve <id> reopen \[N-k\]` \|/m);
  assert.match(read("README.md"), /^### 4c\. Yêu cầu đổi giữa chừng/m);
  assert.match(read("HUONG-DAN.md"), /^## 5a\. Khi yêu cầu đổi giữa chừng/m);
});

test("coupling (0.10): reconcile mode in plan, overlap offer, archive/flow/help rows, conventions rule, docs sections", () => {
  const plan = read("skills/plan/SKILL.md");
  assert.match(frontmatter(plan)["argument-hint"], /reconcile <other>/);
  assert.match(plan, /^## 8\. Reconcile mode \(`\/hitl:plan <change-id> reconcile <other>`\)/m);
  assert.match(plan, /hitl-index reconcile <id> --from <other> --dry-run --json/);
  assert.match(plan, /Add <n> notes to <id>\? \(Y\/n\/pick\)/);
  assert.match(plan, /hitl-index coupling <id> --json/);
  assert.match(read("skills/design/SKILL.md"), /hitl-index coupling <id> --json/);
  const arch = read("skills/archive/SKILL.md");
  assert.match(arch, /preconditions\.reconcile\.pending/);
  assert.match(arch, /archive\.reconcile\[\]/);
  assert.match(read("skills/flow/SKILL.md"), /reconcilePending/);
  assert.match(read("skills/flow/references/help.md"), /^\| `\/hitl:plan <id> reconcile <other>` \|/m);
  assert.match(read("shared/conventions.md"), /Edit another change's files to carry this change's impact/);
  assert.match(read("shared/spec-format.md"), /COUPLING_UNDERSTATED/);
  assert.match(read("README.md"), /^### 4d\. Hai change chạy cùng lúc/m);
  assert.match(read("HUONG-DAN.md"), /^## 5b\. Hai change cùng lúc/m);
});
