// Vendored mattpocock/skills tdd reference files (tests.md, mocking.md, LICENSE) stay byte-identical to the checksums in
// UPSTREAM.md; skills/tdd/SKILL.md is hitl's own adaptation; the hitl overlay lives in shared/test-patterns.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "skills/tdd");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const manifest = () => [...fs.readFileSync(path.join(DIR, "UPSTREAM.md"), "utf8").matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gm)]
  .map((m) => ({ sha: m[1], file: m[2] }));

test("vendored tdd reference files match UPSTREAM.md checksums", () => {
  const m = manifest();
  assert.deepEqual(m.map((x) => x.file).sort(), ["LICENSE", "mocking.md", "tests.md"]);
  for (const { sha, file } of m) {
    const got = crypto.createHash("sha256").update(fs.readFileSync(path.join(DIR, file))).digest("hex");
    assert.equal(got, sha, `${file} differs from upstream (re-sync per UPSTREAM.md, never edit in place)`);
  }
  const extra = fs.readdirSync(DIR).filter((f) => !["UPSTREAM.md", "SKILL.md"].includes(f) && !m.some((x) => x.file === f));
  assert.deepEqual(extra, [], "hitl glue belongs in shared/test-patterns.md, not skills/tdd/");
});

test("checksums are the 4ae2317 ones (tests.md 859f9e59…, mocking.md 3ceb807f…, LICENSE 0e7ac423…)", () => {
  const m = Object.fromEntries(manifest().map((x) => [x.file, x.sha]));
  assert.equal(m["tests.md"], "859f9e592c188fda4fc7277dd180e4ce9c7a2e13f6efe1f6f29eccc9d28c106a");
  assert.equal(m["mocking.md"], "3ceb807fdf4a47d6a93d4d9a891e5ba6d362a6247bd08adc451feebfc17361ef");
  assert.equal(m.LICENSE, "0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5");
  assert.match(read("skills/tdd/UPSTREAM.md"), /4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/);
});

test("hitl:tdd SKILL.md is hitl's adaptation: credited, points at the overlay + refs, no dangling skill calls, tuned triggers", () => {
  const s = read("skills/tdd/SKILL.md");
  assert.match(s, /^Adapted from mattpocock\/skills \(MIT\) — see NOTICE\.md\. Source: skills\/engineering\/tdd\/SKILL\.md @ 4ae2317/m);
  for (const p of ["shared/test-patterns.md", "skills/tdd/tests.md", "skills/tdd/mocking.md", "shared/interview.md"]) assert.ok(s.includes(p), `points at ${p}`);
  assert.doesNotMatch(s, /^allowed-tools:.*\bSkill\b/m, "no Skill tool");
  assert.doesNotMatch(s, /(Skill tool|invoke|call)[^\n]*(codebase-design|code-review)/i, "no codebase-design / code-review Skill call");
  assert.match(s, /\/hitl:flow/, "guard routes in-change work to /hitl:flow");
  const desc = s.match(/^description:\s*(.*)$/m)[1];
  assert.match(desc, /no hitl change/);
  for (const c of ["/hitl:test", "/hitl:plan", "/hitl:flow"]) assert.ok(desc.includes(c), `description names ${c}`);
});

test("test-patterns.md: credited overlay ≤ 90 lines, code-layer terms without the codebase-design avoid-list", () => {
  const t = read("shared/test-patterns.md");
  assert.ok(t.split("\n").length <= 90, "token budget");
  assert.match(t, /^Adapted from mattpocock\/skills \(MIT\) — see NOTICE\.md\. Source: skills\/engineering\/tdd\/SKILL\.md/m);
  for (const w of ["interface", "seam", "port", "adapter", "stand-in", "fake"]) assert.match(t, new RegExp(`^- \\*\\*${w}\\*\\*:`, "m"), `term ${w}`);
  assert.match(t, /"Component".*keep/, "component and trust boundary stay");
  assert.match(t, /side channel/i);
  assert.match(t, /AC1 is the tracer/);
  assert.match(t, /## Terms/, "names use the contract pack's ## Terms");
  assert.match(t, /nothing is sent/, "true-external call assertion exception");
  assert.match(t, /\/hitl:review/, "refactor goes to review");
});

test("no hitl agent or skill points at skills/tdd/SKILL.md (in-flow agents read only tests.md / mocking.md)", () => {
  const walk = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((x) => walk(path.join(p, x))) : [p];
  const files = [...walk(path.join(ROOT, "agents")), ...walk(path.join(ROOT, "skills")), ...walk(path.join(ROOT, "shared"))]
    .filter((f) => f.endsWith(".md") && !f.startsWith(path.join(DIR, "")) && !/skills\/(grilling|security-audit)\//.test(f));
  for (const f of files) assert.doesNotMatch(fs.readFileSync(f, "utf8"), /skills\/tdd\/SKILL\.md/, path.relative(ROOT, f));
});
