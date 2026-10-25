import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDoc, formatStatusEdit } from "../../scripts/lib/tags.mjs";
import { normalize, h } from "../../scripts/lib/hash.mjs";
import { features } from "../../scripts/lib/features.mjs";
import { matchGlob } from "../../scripts/lib/glob.mjs";

const DOC = `
 * Registers a user; rejects duplicates.
 * @param email - user email
 *
 *
 * @task T-12 @impl agent @status skeleton @prio 1
 * @calls UserRepo.findByEmail, src/repo/x.ts#UserRepo.save
 * @concurrency none
 `;

test("parseDoc splits prose and reserved tag lines", () => {
  const { prose, tags, errors } = parseDoc(DOC);
  assert.equal(prose, "Registers a user; rejects duplicates.\n@param email - user email");
  assert.deepEqual(tags.task, ["T-12"]);
  assert.equal(tags.impl, "agent");
  assert.equal(tags.status, "skeleton");
  assert.equal(tags.prio, 1);
  assert.deepEqual(tags.calls, ["UserRepo.findByEmail", "src/repo/x.ts#UserRepo.save"]);
  assert.equal(tags.concurrency, "none");
  assert.deepEqual(errors, []);
});

test("a line with any non-reserved @word stays prose", () => {
  const { prose, tags } = parseDoc("@task T-1 @returns nothing");
  assert.equal(prose, "@task T-1 @returns nothing");
  assert.deepEqual(tags.task, []);
});

test("bad values become BAD_TAG errors kept in extra; lists merge, scalars keep last", () => {
  const { tags, errors } = parseDoc("@impl robot @task T-1\n@task T-2, nope\n@kind example\n@kind golden\n@ac T-1.AC1, T-1.AC2");
  assert.equal(tags.impl, null);
  assert.deepEqual(tags.task, ["T-1", "T-2"]);
  assert.equal(tags.kind, "golden");
  assert.deepEqual(tags.ac, ["T-1.AC1", "T-1.AC2"]);
  assert.deepEqual(tags.extra, { impl: ["robot"], task: ["nope"] });
  assert.equal(errors.length, 2);
});

test("python docstring (no stars) and emails are not tags", () => {
  const { prose, tags } = parseDoc("Apply discount; mail a@b.io.\n\n@task T-2 @impl manual @prio 2");
  assert.equal(prose, "Apply discount; mail a@b.io.");
  assert.equal(tags.impl, "manual");
});

test("formatStatusEdit replaces only the @status value, or appends after @task", () => {
  const src = "/**\n * Intent.\n * @task T-1 @impl agent @status skeleton @prio 1\n */";
  assert.equal(formatStatusEdit(src, "green"), src.replace("@status skeleton", "@status green"));
  assert.equal(formatStatusEdit('"""x\n@task T-2 @impl manual\n"""', "red"), '"""x\n@task T-2 @status red @impl manual\n"""');
  assert.equal(formatStatusEdit("no tags", "red"), "no tags");
});

test("normalize strips comments and punctuation spacing; hashes are 16 hex", () => {
  assert.equal(normalize("foo( a ,  b ) // c\n /* d */ { return x ; }", "ts"), "foo(a,b){return x;}");
  assert.equal(normalize("x = '#not' # comment\ny", "py"), "x='#not' y");
  assert.match(h("x"), /^[0-9a-f]{16}$/);
  assert.equal(normalize("a  =  'x // y'", "ts"), "a='x // y'");
});

test("features and globs", () => {
  assert.deepEqual(features("await db.query(sql);setTimeout(f,1)"), ["async", "sql", "timer"]);
  assert.deepEqual(features("return a+b;"), []);
  assert.ok(matchGlob("src/a/b.test.ts", ["**/*.test.*"]));
  assert.ok(matchGlob("tests/x.py", ["tests/**"]));
  assert.ok(matchGlob("a/payments/x.ts", ["**/payment*/**"]));
  assert.ok(matchGlob("x.tsx", ["*.{ts,tsx}"]));
  assert.ok(!matchGlob("src/a.ts", ["tests/**", "**/*.spec.*"]));
});

test("@dec is a reserved list tag (merged, deduped); bad items are BAD_TAG errors", () => {
  const { tags, errors } = parseDoc("@task T-1 @dec D-1, D-2\n@dec D-2, D-10");
  assert.deepEqual(tags.dec, ["D-1", "D-2", "D-10"]);
  assert.deepEqual(errors, []);
  const bad = parseDoc("@dec ADR-1\n@dec x");
  assert.deepEqual(bad.tags.dec, []);
  assert.deepEqual(bad.tags.extra, { dec: ["ADR-1", "x"] });
  assert.equal(bad.errors.length, 2);
});

test("adding or removing an @dec line changes neither prose nor intentHash", async () => {
  const { toIndexSymbols } = await import("../../scripts/lib/indexer.mjs");
  const withDec = DOC.replace(" * @calls", " * @dec D-1\n * @calls");
  assert.equal(parseDoc(withDec).prose, parseDoc(DOC).prose);
  const mk = (doc) => toIndexSymbols({ path: "a.ts", symbols: [{ name: "f", kind: "function", doc, sigText: "f()", bodyText: "{}" }] }, "ts").symbols[0];
  assert.equal(mk(withDec).intentHash, mk(DOC).intentHash);
  assert.deepEqual(mk(withDec).tags.dec, ["D-1"]);
});
