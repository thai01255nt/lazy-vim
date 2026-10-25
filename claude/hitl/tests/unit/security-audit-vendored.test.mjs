// Vendored cloudflare/security-audit-skill: files stay byte-identical to the checksums in UPSTREAM.md, and the
// upstream validator tests pass when run from the plugin copy (zero-dependency, ~1 s).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../skills/security-audit");
const manifest = () => {
  const text = fs.readFileSync(path.join(DIR, "UPSTREAM.md"), "utf8");
  return [...text.matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gm)].map((m) => ({ sha: m[1], file: m[2] }));
};

test("vendored security-audit files match UPSTREAM.md checksums", () => {
  const m = manifest();
  assert.ok(m.length >= 20, "manifest lists the vendored files");
  for (const { sha, file } of m) {
    const got = crypto.createHash("sha256").update(fs.readFileSync(path.join(DIR, file))).digest("hex");
    assert.equal(got, sha, `${file} differs from upstream (re-sync per UPSTREAM.md, never edit in place)`);
  }
  const listed = new Set(m.map((x) => x.file));
  const extra = fs.readdirSync(DIR).filter((f) => f !== "UPSTREAM.md" && !listed.has(f));
  assert.deepEqual(extra, [], "hitl glue belongs outside skills/security-audit/");
});

test("upstream validator tests pass from the plugin copy", () => {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT; // else the child reports to our runner, not stdout
  const r = spawnSync(process.execPath, ["--test", "--test-reporter=tap", "validate-findings.test.cjs", "validate-coverage-ledger.test.cjs"],
    { cwd: DIR, env, encoding: "utf8", timeout: 120000 });
  assert.equal(r.status, 0, r.stdout.slice(-2000) + r.stderr.slice(-2000));
  assert.match(r.stdout, /^# fail 0$/m);
});
