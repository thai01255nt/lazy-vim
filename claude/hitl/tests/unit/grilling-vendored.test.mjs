// Vendored mattpocock/skills grilling: files stay byte-identical to the checksums in UPSTREAM.md, and the hitl overlay
// lives outside the vendored directory.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIR = path.join(ROOT, "skills/grilling");
const manifest = () => [...fs.readFileSync(path.join(DIR, "UPSTREAM.md"), "utf8").matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gm)]
  .map((m) => ({ sha: m[1], file: m[2] }));

test("vendored grilling files match UPSTREAM.md checksums", () => {
  const m = manifest();
  assert.deepEqual(m.map((x) => x.file).sort(), ["LICENSE", "SKILL.md"]);
  for (const { sha, file } of m) {
    const got = crypto.createHash("sha256").update(fs.readFileSync(path.join(DIR, file))).digest("hex");
    assert.equal(got, sha, `${file} differs from upstream (re-sync per UPSTREAM.md, never edit in place)`);
  }
  const extra = fs.readdirSync(DIR).filter((f) => f !== "UPSTREAM.md" && !m.some((x) => x.file === f));
  assert.deepEqual(extra, [], "hitl glue belongs in shared/interview.md, not skills/grilling/");
});

test("design doc checksums are the vendored ones (SKILL.md befdff1e…, LICENSE 0e7ac423…)", () => {
  const m = Object.fromEntries(manifest().map((x) => [x.file, x.sha]));
  assert.equal(m["SKILL.md"], "befdff1e27a1dfe2a294d5871169ac1afe16d983911daa4f32627514a48c1e15");
  assert.equal(m.LICENSE, "0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5");
});

test("plan and design load hitl:grilling through the Skill tool, with a file fallback", () => {
  for (const s of ["plan", "design"]) {
    const t = fs.readFileSync(path.join(ROOT, `skills/${s}/SKILL.md`), "utf8");
    assert.match(t, /^allowed-tools:.*\bSkill\b/m, `${s}: Skill in allowed-tools`);
    assert.match(t, /invoke the Skill tool with `hitl:grilling`/, `${s}: explicit Skill call`);
    assert.match(t, /skills\/grilling\/SKILL\.md/, `${s}: Read fallback`);
  }
});
