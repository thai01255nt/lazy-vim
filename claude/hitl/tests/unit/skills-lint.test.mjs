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
  assert.match(read("skills/design/SKILL.md"), /_Needs term:_/);
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
  const order = ["## Plain replies", "## Edits to approved behaviour stated in chat (notes `N-k`)", "## No over-questioning"].map((h) => conv.indexOf(h));
  assert.ok(order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2], "capture section sits right after Plain replies");
  const cap = conv.split("## Edits to approved behaviour stated in chat (notes `N-k`)")[1].split(/^## /m)[0];
  assert.match(cap, /_Note_ for <change>, refs <ids \(titles\)>\? \(Y\/n\)/);
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
  assert.match(read("skills/flow/SKILL.md"), /_Note_ PWR-T14 blocked by N-3/);
  assert.match(read("skills/archive/SKILL.md"), /preconditions\.notes\.open/);
  assert.match(read("skills/flow/references/help.md"), /^\| `\/hitl:approve <id> reopen \[N-k\]` \|/m);
  assert.match(read("README.md"), /^### 4c\. Yêu cầu đổi giữa chừng/m);
  assert.match(read("HUONG-DAN.md"), /^## 5a\. Khi yêu cầu đổi giữa chừng/m);
});

test("prerequisite changes (0.12): --before, owner check, overlap, wait lines; no 0.10 coupling/reconcile left", () => {
  const plan = read("skills/plan/SKILL.md");
  assert.match(frontmatter(plan)["argument-hint"], /--before <change-id>/);
  assert.match(plan, /other-changes\.md/);
  assert.match(plan, /hitl-index overlap <id> --json/);
  assert.match(plan, /--source <id> --kind order/);
  assert.match(frontmatter(read("skills/go/SKILL.md"))["argument-hint"], /--before <change-id>/);
  assert.match(read("skills/go/SKILL.md"), /invoke the Skill `hitl:plan` with `<description> --before/);
  assert.match(read("skills/design/SKILL.md"), /hitl-index overlap <id> --json/);
  assert.match(read("skills/implement/SKILL.md"), /`tasks\[T\]\.wait` set/);
  assert.match(read("skills/review/SKILL.md"), /\/hitl:go <X> --before <change>/);
  const oc = read("shared/other-changes.md");
  for (const re of [/--before A,C/, /hitl-index note add --change P --source B --kind order/, /--kind spec\|design --refs/, /witness/, /B gone/])
    assert.match(oc, re);
  assert.match(read("skills/archive/SKILL.md"), /preconditions\.notes\.wait/);
  assert.match(read("skills/archive/SKILL.md"), /archive\.unblocked\[\]/);
  assert.match(read("skills/flow/SKILL.md"), /\.changes\[\]\.wait/);
  assert.match(read("skills/flow/references/help.md"), /^\| `\/hitl:plan <description> --before <id>\[,<id>\]` \|/m);
  assert.match(read("agents/spec-reviewer.md"), /"overlaps": \[/);
  assert.match(read("shared/conventions.md"), /Edit another change's files to carry this change's impact/);
  assert.match(read("shared/conventions.md"), /Out of scope for <change>/);
  assert.match(read("shared/spec-format.md"), /\| before: <change>/);
  assert.match(read("README.md"), /^### 4d\. Hai change chạy cùng lúc: change tiên quyết/m);
  assert.match(read("HUONG-DAN.md"), /^## 5b\. Hai change cùng lúc/m);
  const files = ["skills/plan/SKILL.md", "skills/design/SKILL.md", "skills/archive/SKILL.md", "skills/approve/SKILL.md", "skills/flow/SKILL.md",
    "skills/flow/references/help.md", "skills/go/SKILL.md", "shared/conventions.md", "shared/spec-format.md", "agents/spec-scout.md", "agents/spec-reviewer.md", "HUONG-DAN.md"];
  for (const f of files) assert.doesNotMatch(read(f), /hitl-index (coupling|reconcile)|RECONCILE_PENDING|skip RC-|reconcile <other>|\| after: |relates: feat/, f);
});

test("go (0.11): one entry for new work, router agent, trigger split, docs rows", () => {
  const fm = (s) => frontmatter(read(`skills/${s}/SKILL.md`));
  const start = read("skills/go/SKILL.md");
  const sf = fm("go");
  assert.match(sf["argument-hint"], /<description> \[--plan\|--quick\|--tdd\]/);
  for (const t of ["Agent", "Skill", "Bash(hitl-index *)"]) assert.ok(sf["allowed-tools"].split(/\s+/).includes(t) || sf["allowed-tools"].includes(t), `start allowed-tools: ${t}`);
  assert.doesNotMatch(sf["allowed-tools"], /\b(Write|Edit)\b/, "start writes no file");
  assert.match(sf.description, /\/hitl:go|Use when the user describes new work/);
  assert.match(start, /subagent_type: hitl:work-router/);
  assert.match(start, /hitl-index route --json/);
  assert.match(start, /hitl-index route --final/);
  assert.match(start, /\| `--plan` \| `hitl:plan` \|/);
  assert.match(start, /\| `--quick` \| `hitl:tasks` \| `quick <description>` \|/);
  assert.match(start, /\| `--tdd` \| `hitl:tdd` \|/);
  assert.match(start, /No `Go\?` question/);
  assert.match(start, /Never a second question round/);
  assert.match(start, /invoke the Skill `hitl:flow`/);
  assert.match(start, /\/hitl:setup/);
  assert.match(start, /Edits to approved behaviour stated in chat/);
  const ag = frontmatter(read("agents/work-router.md"));
  assert.equal(ag.name, "work-router");
  assert.doesNotMatch(ag.tools, /\bEdit\b/);
  const router = read("agents/work-router.md");
  // 0.16: one ordered rule replaced "ties go heavier" (doubt falls to the next, heavier route)
  assert.match(router, /falls to a later, heavier route \(tdd → quick →\s+plan\)/);
  assert.match(router, /"schema": "hitl\.route\/1"/);
  for (const r of ["`note`", "`amend`", "`update`", "`tdd`", "`quick`", "`plan`"]) assert.ok(router.includes(r), `router route ${r}`);
  assert.match(router, /≤ 3 short questions/);
  // trigger split: a bare description goes to go; explicit asks keep their skill
  assert.doesNotMatch(fm("plan").description, /describes something to build or fix/);
  assert.match(fm("plan").description, /\/hitl:go/);
  assert.doesNotMatch(fm("flow").description, /describes a new task/);
  assert.match(fm("flow").description, /\/hitl:go/);
  assert.match(fm("tdd").description, /\/hitl:go/);
  assert.match(fm("tdd").description, /"TDD this"/);
  assert.match(fm("tasks").description, /\/hitl:go/);
  assert.match(fm("tasks")["argument-hint"], /update \[<what>\]/);
  assert.match(read("skills/tasks/SKILL.md"), /`<change-id> update \[<what>\]`/);
  assert.match(read("skills/flow/SKILL.md"), /_Next:_ \/hitl:go <description>/);
  const help = read("skills/flow/references/help.md");
  assert.match(help, /^\| `\/hitl:go <description> \[--plan\\\|--quick\\\|--tdd\]( \[--before <id>\])?` \|/m);
  assert.match(help, /^\/hitl:setup → \/hitl:overview → \/hitl:go <description>/m);
  assert.match(read("README.md"), /^\| `\/hitl:go <mô tả> \[--plan\\\|--quick\\\|--tdd\]` \|/m);
  assert.match(read("README.md"), /^### Nâng cấp từ 0\.10/m);
  assert.match(read("HUONG-DAN.md"), /^## 1a\. Việc mới: bắt đầu bằng `\/hitl:go`/m);
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.(1[1-9]|[2-9]\d)\.\d+$/, "version ≥ 0.11");
  const trig = JSON.parse(read("evals/trigger.json")).cases;
  const want = (id) => trig.find((c) => c.id === id)?.expect;
  assert.equal(want("en-build-csv"), "hitl:go");
  for (const id of ["en-go-bug", "vi-go-bug", "en-go-feature", "vi-go-feature", "en-go-small", "en-go-in-change"]) assert.equal(want(id), "hitl:go", id);
  assert.equal(want("en-plan-explicit"), "hitl:plan");
  assert.equal(want("en-quick-explicit"), "hitl:tasks");
  assert.equal(want("vi-tdd-explicit"), "hitl:tdd");
  assert.equal(want("en-status-not-go"), "hitl:flow");
});

test("0.13: /hitl:migrate skill gates the id migration; docs use change-key ids", () => {
  const m = read("skills/migrate/SKILL.md");
  assert.equal(frontmatter(m).name, "migrate");
  assert.match(m, /hitl-index migrate --ids --dry-run --json/);
  assert.match(m, /Apply\? \(Y\/n\)/);
  assert.match(m, /id-map\.json/);
  assert.match(read("skills/flow/references/help.md"), /^\| `\/hitl:migrate` \|/m);
  assert.match(read("skills/flow/SKILL.md"), /IDS_LEGACY[\s\S]*\/hitl:migrate/);
  assert.match(read("skills/plan/SKILL.md"), /hitl-index spec key <id>`/);
  assert.match(read("shared/templates/proposal.md"), /\| key: \{KEY\}/);
  assert.doesNotMatch(read("shared/templates/spec.md"), /\| key:/, "capability keys left the living spec meta");
  assert.match(read("README.md"), /^### Nâng cấp từ 0\.12/m);
  assert.match(read("HUONG-DAN.md"), /^## 1b\. Nâng cấp từ 0\.12/m);
  // no pre-0.13 task/decision ids in skill and shared examples (the migrate skill and legacy notes name them on purpose)
  const files = [...skills.filter((d) => !VENDORED.has(d) && d !== "migrate" && d !== "tdd").map((d) => `skills/${d}/SKILL.md`),
    ...fs.readdirSync(path.join(ROOT, "shared/templates")).filter((f) => f.endsWith(".md")).map((f) => `shared/templates/${f}`)];
  for (const f of files) assert.doesNotMatch(read(f), /(?<![\w-])(?:T|D)-\d+\b/, `${f} shows a pre-0.13 id`);
});

test("0.13.1: /hitl:overlap — read-only skill, one cluster judge, witness gate, trigger split, docs; §4 heading; parent `_Parent:_` lines", () => {
  const fm = (s) => frontmatter(read(`skills/${s}/SKILL.md`));
  const o = read("skills/overlap/SKILL.md"), of = fm("overlap");
  assert.equal(of.name, "overlap");
  assert.match(of["argument-hint"], /<change-id> \[<other-id> …\] \| <change-id> --with <id>\[,<id>…\]/);
  assert.equal(of["allowed-tools"], "Agent Bash(hitl-index *) Bash(node *hitl-index.mjs *)", "Agent + hitl-index Bash only");
  assert.doesNotMatch(of["allowed-tools"], /\b(Write|Edit|Read|Skill)\b/, "overlap writes and reads no file itself");
  assert.match(of.description, /chồng lấn/); assert.match(of.description, /check overlap/);
  assert.match(of.description, /Not for new work \(\/hitl:go\), a task id or status \(\/hitl:flow\), or an archived change/);
  for (const re of [/hitl-index overlap <A> \[--with <B,C>\] --json/, /subagent_type: hitl:spec-reviewer/, /Mode: overlap/, /never one\s+per pair/,
    /hitl-index overlap <A> --with <candidate ids> --review --json/, /✅ <A>: no overlap with/, /no judge, no gate/,
    /1\. adjust <one side> · 2\. both sides \(source notes into the affected\s+change\(s\), which then wait until the other is archived\) · 3\. not an overlap/,
    /"1 2, 2 3"/, /\/hitl:plan <change> amend/, /Never run the amend yourself/, /hitl-index note add --change <affected>\s+--source <other>/,
    /\*\*3\. not an overlap\*\* → write nothing/, /_Next:_ \/hitl:flow/, /_Next:_ \/hitl:go/, /This skill writes no file/]) assert.match(o, re);
  const sr = read("agents/spec-reviewer.md");
  assert.match(sr, /\*\*Overlap mode\*\*/); assert.match(sr, /"schema": "hitl\.overlap-review\/1"/);
  assert.match(sr, /verbatim quote from each\s+change it names/); assert.match(sr, /as one cluster/);
  assert.match(sr, /\.hitl\/\.inbox\/overlap-review\.json/); assert.match(sr, /never write a note/);
  // trigger routing: overlap checks → /hitl:overlap; new work stays /hitl:go
  assert.match(fm("go").description, /checking overlap between existing changes \(\/hitl:overlap\)/);
  assert.match(fm("flow").description, /\/hitl:overlap/);
  assert.match(read("skills/go/SKILL.md"), /"check overlap \/ chồng lấn between <changes>" → `\/hitl:overlap`/);
  const trig = JSON.parse(read("evals/trigger.json")).cases;
  const want = (id) => trig.find((c) => c.id === id)?.expect;
  for (const id of ["en-overlap-check", "vi-overlap-check", "en-overlap-merge"]) assert.equal(want(id), "hitl:overlap", id);
  assert.equal(want("en-go-not-overlap"), "hitl:go");
  const sc = JSON.parse(read("evals/scenarios.json")).cases;
  assert.equal(sc.find((c) => c.id === "overlap-gate")?.fixture, "churn-overlap");
  assert.match(read("evals/fixtures/build.sh"), /churn\|churn-noted\|churn-recheck\|churn-waiting\|churn-overlap\)/);
  // other-changes.md: §4 is about every unlinked change; parents get `_Parent:_` lines; §6 points at the skill
  const oc = read("shared/other-changes.md");
  assert.match(oc, /^## 4\. Overlap with active changes B is not linked to \(with or without `--before`\)$/m);
  assert.doesNotMatch(oc, /Accidental overlap|B was not created with `--before`/);
  assert.match(oc, /`_Parent:_ <P> — shared: <evidence refs \(titles\)>`/);
  assert.match(oc, /^## 6\. On demand: `\/hitl:overlap <A> \[<B> <C> …\]`/m);
  assert.match(oc, /branch merge/);
  assert.match(read("skills/plan/SKILL.md"), /`_Parent:_ <P> — shared: <evidence refs \(titles\)>`/);
  assert.match(read("skills/plan/SKILL.md"), /`parent: true`/);
  assert.match(read("skills/design/SKILL.md"), /`_Parent:_ <P> — shared: <the new contract\/file refs>`/);
  // docs
  assert.match(read("skills/flow/references/help.md"), /^\| `\/hitl:overlap <id> \[<id> …\]` \|/m);
  assert.match(read("README.md"), /^\| `\/hitl:overlap <change-id> \[<change khác> …\]` · `--with B,C` \|/m);
  assert.match(read("README.md"), /^### Nâng cấp từ 0\.13\.0/m);
  assert.doesNotMatch(read("README.md"), /B không tạo với `--before`/);
  assert.match(read("HUONG-DAN.md"), /^\/hitl:overlap feat-fee feat-waive feat-report/m);
  assert.doesNotMatch(read("HUONG-DAN.md"), /Chồng lấn tình cờ/);
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.13\.[1-9]\d*$|^0\.(1[4-9]|[2-9]\d)\.\d+$/, "version ≥ 0.13.1");
});

test("0.13.2: a key per quick file — tasks quick mode, migrate, id docs, upgrade notes", () => {
  const tk = read("skills/tasks/SKILL.md");
  assert.match(tk, /`hitl-index next-id --quick <slug> --json`/);
  assert.match(tk, /`← Change: none \| key: <key>`/);
  assert.doesNotMatch(tk, /every quick file shares the key `QT`/);
  const mg = read("skills/migrate/SKILL.md");
  assert.match(mg, /`quickKeys\[\]`/);
  assert.match(mg, /quick:<slug>=<KEY>/);
  assert.match(mg, /QT-T7 → QFLT-T1/);
  assert.match(read("shared/spec-format.md"), /\| quick-file key \(0\.13\.2\) \|/);
  assert.match(read("shared/conventions-spec.md"), /QUICK_KEY_TAKEN/);
  assert.match(read("shared/templates/tasks.md"), /next-id --quick \{slug\}/);
  assert.match(read("skills/flow/references/help.md"), /a quick file has its own key/);
  assert.match(read("README.md"), /^### Nâng cấp từ 0\.13\.1/m);
  assert.match(read("HUONG-DAN.md"), /Từ 0\.13\.2, task quick cũ dạng `QT-T7`/);
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.13\.[2-9]$|^0\.(1[4-9]|[2-9]\d)\.\d+$/, "version ≥ 0.13.2");
});

test("0.14: plan and design interview in a brief file; no chat rounds, no design --auto", () => {
  for (const f of ["shared/templates/plan-brief.md", "shared/templates/design-brief.md"]) assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} exists`);
  const iv = read("shared/interview.md");
  assert.match(iv, /^## 4\. The brief file and the round format/m);
  assert.match(iv, /There is no\s+chat round mode/);
  assert.match(iv, /`Accept all recommendations of this round: >`/);
  for (const w of ["`được`", "`đồng ý`", "`ừ`", "`không biết`", "`chưa biết`", "`xong`", "`deep`", "→ carried to Round <n>", "→ recorded: <ids>", "_Disc:_"])
    assert.ok(iv.includes(w), `interview: ${w}`);
  assert.doesNotMatch(iv, /Reply:/, "no chat Reply: line left in the overlay");
  const plan = read("skills/plan/SKILL.md");
  assert.match(plan, /Brief ready: \.hitl\/changes\/<id>\/plan-brief\.md — answer in the file, then run \/hitl:plan <id>/);
  assert.match(plan, /\*\*Round 1 carries no recommendations\*\*/);
  assert.match(plan, /hitl-index brief rename <id>/);
  assert.match(plan, /### Approve the spec\? \(Y\/n\)/);
  assert.match(plan, /Unchanged by the brief file: amend stays one chat gate/);
  assert.doesNotMatch(plan, /Reply:|Spec complete\?/);
  const design = read("skills/design/SKILL.md");
  assert.match(design, /\*\*Every question carries `_Rec:_`\*\*/);
  assert.match(design, /Design brief ready: \.hitl\/changes\/<id>\/design-brief\.md/);
  assert.match(design, /### Approve the design\? \(Y\/n\)/);
  for (const f of ["skills/design/SKILL.md", "skills/flow/references/help.md", "README.md", "HUONG-DAN.md", "skills/implement/SKILL.md", "evals/scenarios.json", "evals/README.md", "evals/judge.mjs"])
    assert.doesNotMatch(read(f).replace(/^### Nâng cấp từ 0\.13\.2[\s\S]*?(?=^### )/m, ""), /design[^\n|]*--auto|--auto[^\n|]*design/, `${f} still offers /hitl:design --auto`);
  assert.doesNotMatch(frontmatter(design)["argument-hint"], /--auto/);
  assert.match(read("skills/flow/SKILL.md"), /_Brief:_ <id> — <kind> brief round <round>: <unanswered> unanswered/);
  assert.match(read("skills/flow/references/help.md"), /\*\*Brief files\*\* \(0\.14\)/);
  assert.match(read("README.md"), /^### Nâng cấp từ 0\.13\.2/m);
  assert.match(read("README.md"), /\*\*`\/hitl:design --auto` bị bỏ\*\*/);
  // per-round Notes block: templates, overlay rule, both skills; Description is the initial description only
  const NOTES = "### Notes — anything the questions missed, or a change to an earlier answer";
  for (const f of ["shared/templates/plan-brief.md", "shared/templates/design-brief.md", "shared/interview.md", "skills/plan/SKILL.md", "skills/design/SKILL.md"])
    assert.ok(read(f).includes(NOTES), `${f}: Notes block`);
  assert.match(iv, /Only an unmarked, non-empty Notes block is processed/);
  assert.match(iv, /`sửa Q5: …`/);
  for (const f of ["skills/plan/SKILL.md", "skills/design/SKILL.md"]) assert.doesNotMatch(read(f), /count as answers for the round|append it to `## Description`/, `${f}: new information goes into Notes`);
  assert.match(read("HUONG-DAN.md"), /khối \*\*Notes\*\*/);
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.14\.[0-9]+$|^0\.(1[5-9]|[2-9]\d)\.\d+$/, "version ≥ 0.14.0");
});

test("0.14.1: markdown files hitl writes are prettier-stable (markdownlint style)", () => {
  assert.match(read("shared/conventions.md"), /^## Markdown files hitl writes/m);
  assert.match(read("shared/conventions.md"), /a Claude mark \(`→ …`, `_Disc:_`\) never\s+directly under a `>` line/);
  assert.match(read("shared/interview.md"), /\*\*A Claude mark \(`→ …`\) or a `_Disc:_`\s+line never sits directly under a `>` line\*\*/);
  assert.doesNotMatch(read("shared/interview.md"), /a line\s+without `>` right after an answer line continues it/);
  assert.match(read("README.md"), /^### Nâng cấp từ 0\.14\.0/m);
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.14\.[1-9]$|^0\.(1[5-9]|[2-9]\d)\.\d+$/, "version ≥ 0.14.1");
});

// 0.15.0 — italic word labels instead of emoji; only ✅ ❌ ⚠️ and → stay. Vendored text and the parsers' pre-0.15
// compatibility patterns are the only exceptions.
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2300}-\u{23FF}\u{2139}\u{21AA}\u{21D2}\u{2B00}-\u{2BFF}]/u;
const KEPT = /[\u{2705}\u{274C}\u{26A0}]/gu;
const walkRel = (rel) => fs.statSync(path.join(ROOT, rel)).isDirectory()
  ? fs.readdirSync(path.join(ROOT, rel)).flatMap((n) => walkRel(`${rel}/${n}`)) : [rel];
const VENDORED_TEXT = /^skills\/(grilling\/SKILL\.md|security-audit\/|tdd\/(tests|mocking)\.md)/;
const COMPAT = new Set(["scripts/lib/brief.mjs", "scripts/lib/specmd.mjs", "scripts/lib/changes.mjs", "skills/grilling/UPSTREAM.md"]);

test("0.15.0: no emoji outside ✅ ❌ ⚠️ in skills, shared, agents, scripts, hooks, templates, help, README, HUONG-DAN", () => {
  const files = ["skills", "shared", "agents", "scripts", "hooks", "evals/fixtures/briefs"].flatMap(walkRel)
    .filter((f) => /\.(md|mjs|js|json|sh)$/.test(f) && !VENDORED_TEXT.test(f) && !COMPAT.has(f)).concat("HUONG-DAN.md", "NOTICE.md");
  const bad = [];
  for (const f of files) read(f).split("\n").forEach((l, i) => { if (EMOJI.test(l.replace(KEPT, ""))) bad.push(`${f}:${i + 1}: ${l.trim().slice(0, 80)}`); });
  // README: only the 0.15.0 upgrade note names the old icons
  const readme = read("README.md");
  const note = readme.slice(readme.indexOf("### Nâng cấp từ 0.14.1"), readme.indexOf("### Nâng cấp từ 0.14.0"));
  readme.replace(note, "").split("\n").forEach((l, i) => { if (EMOJI.test(l.replace(KEPT, ""))) bad.push(`README.md:${i + 1}: ${l.trim().slice(0, 80)}`); });
  assert.deepEqual(bad, []);
});

test("0.15.0: label legend in help, pointer in conventions, upgrade note; brief means only the brief file", () => {
  const help = read("skills/flow/references/help.md");
  assert.match(help, /^## Labels$/m);
  for (const l of ["_Rec:_", "_Assumed:_", "_Tip:_", "_Info:_", "_Next:_", "_Stop:_", "_Gate:_", "_Block:_", "_Disc:_", "_Hot_",
    "_Needs spec:_", "_Needs term:_", "_Parked:_", "_Forced:_", "_Note_", "_To P:_", "_From P:_", "_Take in:_", "_Waits:_",
    "_Blocks:_", "_Unblocked:_", "_Parent:_", "_Overlap?_", "_Delta:_", "_Impact:_", "_Reopen_", "_Yours:_", "_Fast_", "_Route:_",
    "_Brief:_", "_Summary:_", "_Skip:_"]) assert.ok(help.includes(`| \`${l}\` |`), `legend lacks ${l}`);
  assert.match(read("shared/conventions.md"), /skills\/flow\/references\/help\.md` § Labels/);
  assert.match(read("README.md"), /^### Nâng cấp từ 0\.14\.1/m);
  for (const f of ["skills/go/SKILL.md", "skills/flow/SKILL.md"]) {
    assert.match(read(f), /Status summary \(injected\):/, f);
    assert.doesNotMatch(read(f), /Brief status/, f);
  }
  assert.match(read("skills/tidy/SKILL.md"), /and this prompt:/);
  assert.match(read("agents/work-router.md"), /"summary": "/);
  assert.doesNotMatch(read("agents/work-router.md"), /"brief":/);
  assert.match(read("skills/go/SKILL.md"), /--text "<\.summary>"/);
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.15\.\d+$|^0\.(1[6-9]|[2-9]\d)\.\d+$/, "version ≥ 0.15.0");
});

// 0.16.0 — test policy: per-AC test decision, test plan at the tasks gate, names without ids, budget, audit, router rule
test("0.16.0: test policy in the docs (decisions, Q5, names without ids, @catches, regression, budget, audit, router rule)", () => {
  const tpl = read("shared/templates/tasks.md");
  assert.match(tpl, /^\| ac +\| test +\| kind +\| oracle +\| seam +\| author +\|$/m, "tasks template has the test column");
  assert.match(tpl, /\| AC1 \| new: \S/);
  const sr = read("skills/tasks/references/slicing-and-risk.md");
  for (const d of ["`new: <defect>`", "`shared: <ACk>`", "`covered: <test>`", "`none: <reason>`", "`manual: <check>`"]) assert.ok(sr.includes(d), `slicing §7 names ${d}`);
  assert.match(sr, /5\. Test plan ok\?/);
  assert.match(read("skills/tasks/SKILL.md"), /5\. Test plan ok\?/);
  assert.match(read("skills/tasks/SKILL.md"), /TEST_PLAN_BAD\|NO_DEFECT\|EMPTY\|SHARED\|COVERED\|NONE_RISK/);
  assert.match(read("skills/skeleton/SKILL.md"), /One stub per `new` row/);
  for (const f of ["shared/test-patterns.md", "skills/test/references/test-kinds.md", "skills/test/references/tdd-rules.md", "agents/test-author.md", "shared/tag-grammar.md"])
    assert.doesNotMatch(read(f), /[Tt]itle (?:always )?starts with the AC id|test_T\d+_AC\d+|keeps the `<KEY>-T<n>\.AC<k>` prefix/, `${f}: names carry no ids`);
  for (const f of ["shared/templates/skeleton-ts.md", "shared/templates/skeleton-py.md", "shared/templates/skeleton-lua.md"]) {
    assert.match(read(f), /@catches /, `${f}: stub carries @catches`);
    assert.doesNotMatch(read(f), /(?:it\.todo|pending)\("[A-Z]{2,5}-T\d+\.AC|def test_T\d+_AC/, `${f}: stub names carry no ids`);
  }
  assert.match(read("shared/tag-grammar.md"), /\| `@catches` \| test \|/);
  assert.match(read("shared/tag-grammar.md"), /"regression"/);
  assert.match(read("agents/test-author.md"), /"catches": "<defect>"/);
  assert.match(read("skills/test/SKILL.md"), /`reached-stub`/);
  assert.match(read("skills/review/references/lenses.md"), /\*\*Test economy\*\*/);
  assert.match(read("skills/tdd/SKILL.md"), /add it to the test list/);
  const wr = read("agents/work-router.md");
  assert.match(wr, /## Routes \(one rule: try them in this order; the first whose conditions all hold wins\)/);
  assert.doesNotMatch(wr, /Ties go to the safer, heavier route: plan over quick over tdd/, "the old contradictory tie rule is gone");
  assert.doesNotMatch(read("skills/flow/references/help.md"), /Ties go to the heavier route/);
  const readme = read("README.md");
  assert.match(readme, /^### Nâng cấp từ 0\.15\.0/m);
  const note = readme.slice(readme.indexOf("### Nâng cấp từ 0.15.0"), readme.indexOf("### Nâng cấp từ 0.14.1"));
  for (const w of ["không phải TDD của Kent Beck", "/hitl:tdd", "lỗi nó bắt", "tests audit", "mutationRequired", "@kind regression"]) assert.ok(note.includes(w), `README 0.16 note: ${w}`);
  assert.equal(JSON.parse(read(".claude-plugin/plugin.json")).version, "0.16.0");
});
