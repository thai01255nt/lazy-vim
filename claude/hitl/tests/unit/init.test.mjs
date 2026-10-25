// v2 §A.6.2 — init writes the canonical .gitignore, appends missing lines to an existing one, never removes lines.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, mergeGitignore, GITIGNORE } from "../../scripts/cmd/init.mjs";

async function init(root) {
  const out = []; const log = console.log;
  console.log = (s) => out.push(String(s));
  try { assert.equal(await run([], { root, json: true }), 0); } finally { console.log = log; }
  return JSON.parse(out.join("\n"));
}
const V1 = ["index/index.json", "index/index.md", "index/.cache.json", "index/state.json", "index/.session/", "index/contracts/", "index/.lock"];
const GI = ".hitl/.gitignore";

test("fresh init writes the canonical .gitignore", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-init-"));
  const r = await init(root);
  assert.ok(r.created.includes(GI));
  assert.deepEqual(r.gitignore, { path: GI, added: GITIGNORE });
  assert.equal(readFileSync(join(root, GI), "utf8"),
    "# hitl: generated files (rebuildable) — do not commit\nindex/*\n!index/skeleton.lock.json\nreviews/*/*\n!reviews/*/decisions.json\n.inbox/\n");
  const again = await init(root);
  assert.deepEqual(again.gitignore.added, []);
  assert.ok(!again.created.includes(GI));
});

test("existing v1 .gitignore: canonical lines appended once, old lines kept", async () => {
  const root = mkdtempSync(join(tmpdir(), "hitl-init-"));
  mkdirSync(join(root, ".hitl"), { recursive: true });
  writeFileSync(join(root, GI), V1.join("\n") + "\n.inbox/\n");
  const r = await init(root);
  assert.deepEqual(r.gitignore.added, ["index/*", "!index/skeleton.lock.json", "reviews/*/*", "!reviews/*/decisions.json"]);
  assert.ok(!r.created.includes(GI));
  const text = readFileSync(join(root, GI), "utf8");
  assert.equal(text, [...V1, ".inbox/", "# hitl v2", "index/*", "!index/skeleton.lock.json", "reviews/*/*", "!reviews/*/decisions.json"].join("\n") + "\n");
  assert.deepEqual((await init(root)).gitignore.added, []);
  assert.equal(readFileSync(join(root, GI), "utf8"), text, "second run appends nothing");
});

test("mergeGitignore handles a missing trailing newline and trimmed matches", () => {
  const r = mergeGitignore("foo\n  index/*  ");
  assert.equal(r.text, "foo\n  index/*  \n# hitl v2\n!index/skeleton.lock.json\nreviews/*/*\n!reviews/*/decisions.json\n.inbox/\n");
  assert.deepEqual(mergeGitignore(r.text).added, []);
});
