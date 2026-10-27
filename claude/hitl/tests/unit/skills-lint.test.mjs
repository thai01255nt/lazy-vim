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
