// generic@1 + ctags@1 adapters: polyglot fixtures (tests/fixtures/poly), hashing, scanner, full index, fake ctags.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, cpSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, delimiter } from "node:path";
import { fileURLToPath } from "node:url";
import generic, { parseGeneric, stripCommentsGeneric, scan } from "../../scripts/lib/adapters/generic.mjs";
import { LANGS } from "../../scripts/lib/adapters/langs.mjs";
import { adapterFor } from "../../scripts/lib/adapters/registry.mjs";
import { DEFAULTS } from "../../scripts/lib/config.mjs";
import { toIndexSymbols, updateIndex } from "../../scripts/lib/indexer.mjs";

const POLY = join(dirname(fileURLToPath(import.meta.url)), "../fixtures/poly");
const FAKE_CTAGS = join(POLY, "fake-ctags");
const read = (rel) => readFileSync(join(POLY, rel), "utf8");
const parse = (rel, lang, config = DEFAULTS) => parseGeneric({ path: rel, content: read(rel) }, lang, config);
const byName = (r) => Object.fromEntries(r.symbols.map((s) => [s.name, s]));
const J = "java/src/main/java/com/acme/users/UserService.java", JR = "java/src/main/java/com/acme/users/UserRepo.java", JT = "java/src/test/java/com/acme/users/UserServiceTest.java";
const K = "kotlin/src/main/kotlin/acme/AccountService.kt", KT = "kotlin/src/test/kotlin/acme/AccountServiceTest.kt";
const G = "go/users/service.go", GT = "go/users/service_test.go", RS = "rust/src/lib.rs", RB = "ruby/lib/user_service.rb", RBS = "ruby/spec/user_service_spec.rb";

test("generic java: Class.method ids, signatures, body spans, stubs, interface + tests", () => {
  const r = parse(J, "java"), by = byName(r);
  assert.deepEqual(Object.keys(by), ["UserService", "UserService.UserService", "UserService.createUser", "UserService.count", "UserService.listOf", "UserService.Stats", "UserService.Stats.total"]);
  const cu = by["UserService.createUser"];
  assert.equal(cu.kind, "method");
  assert.equal(cu.parentName, "UserService");
  assert.equal(cu.sigText, "@Override\n    public User createUser(String email) throws DuplicateEmailException");
  assert.deepEqual(cu.span, { start: 22, end: 27 });
  assert.deepEqual(cu.bodySpan, { start: 23, end: 27 });
  assert.deepEqual(cu.docSpan, { start: 15, end: 21 });
  assert.equal(cu.stub, true);
  assert.deepEqual(cu.commentLines.map((c) => c.text), ["TODO(impl): 1. reject duplicates", "TODO(impl): 2. save"]);
  assert.equal(cu.locals["this.repo"], "UserRepo");
  assert.equal(cu.locals.email, "String");
  // braces inside strings / char literals / block comments do not end the body
  assert.deepEqual(by["UserService.count"].bodySpan, { start: 30, end: 33 });
  assert.deepEqual(by["UserService.count"].calleesRaw, [{ name: "size", qualifier: "repo" }]);
  assert.equal(by["UserService.listOf"].exported, false);
  assert.equal(by["UserService.Stats.total"].parentName, "UserService.Stats");
  assert.equal(by.UserService.sigText, "public class UserService");
  assert.deepEqual(r.imports.map((i) => i.from), ["java.util.Map", "java.util.HashMap"]);

  const repo = byName(parse(JR, "java"));
  assert.deepEqual(Object.keys(repo), ["UserRepo", "UserRepo.findByEmail", "UserRepo.save", "UserRepo.size"], "bodiless interface methods kept");
  assert.equal(repo.UserRepo.kind, "type");
  assert.equal(repo["UserRepo.findByEmail"].bodySpan, null);

  const t = parse(JT, "java", { ...DEFAULTS });
  assert.deepEqual(t.symbols.map((s) => [s.kind, s.name, s.test?.mode]), [
    ["suite", "UserServiceTest", "active"], ["test", "UserServiceTest.t1Ac1RejectsDuplicateEmail", "skip"], ["test", "UserServiceTest.countsUsers", "active"]]);
  assert.match(t.symbols[1].doc, /@covers UserService\.createUser/);
});

test("generic kotlin: companion transparent, expression bodies, suspend, backtick test names", () => {
  const by = byName(parse(K, "kotlin"));
  assert.deepEqual(Object.keys(by), ["AccountService", "AccountService.createUser", "AccountService.greeting", "AccountService.count", "AccountService.create", "User", "formatEmail"]);
  assert.equal(by.AccountService.sigText, "class AccountService(private val repo: UserRepo)");
  assert.equal(by.AccountService.exported, true);
  assert.equal(by["AccountService.createUser"].async, true);
  assert.equal(by["AccountService.createUser"].stub, true);
  assert.equal(by["AccountService.greeting"].sigText, "fun greeting(name: String)");
  assert.equal(by["AccountService.greeting"].bodyText, '"hello ${name.trim()} }"');
  assert.deepEqual(by["AccountService.count"].bodySpan, { start: 20, end: 23 });
  assert.equal(by["AccountService.count"].locals.repo, "UserRepo");
  assert.equal(by.User.bodySpan, null);
  assert.equal(by.formatEmail.kind, "function");
  assert.equal(by.formatEmail.stub, true);
  const t = parse(KT, "kotlin");
  assert.deepEqual(t.symbols.map((s) => [s.kind, s.name]), [["suite", "AccountServiceTest"], ["test", "AccountServiceTest.T-2 AC1 rejects duplicate email"]]);
});

test("generic go: receiver methods, exported by case, `//` docs, testing.T tests", () => {
  const by = byName(parse(G, "go"));
  assert.deepEqual(Object.keys(by), ["Service", "Repo", "User", "Service.CreateUser", "Repo.FindByEmail", "normalize"]);
  const cu = by["Service.CreateUser"];
  assert.equal(cu.parentName, "Service");
  assert.equal(cu.sigText, "func (s *Service) CreateUser(email string) (*User, error)");
  assert.equal(cu.stub, true);
  assert.equal(cu.locals.s, "Service");
  assert.equal(cu.locals["s.repo"], "Repo");
  assert.match(cu.doc, /^CreateUser registers a user; rejects duplicate emails\.\n@task T-3/);
  assert.equal(by.normalize.exported, false);
  assert.deepEqual(by.normalize.bodySpan, { start: 36, end: 40 }, "raw string `}{` ignored");
  const t = parse(GT, "go");
  assert.deepEqual(t.symbols.map((s) => [s.kind, s.name, s.test.mode]), [["test", "TestT3AC1RejectsDuplicate", "skip"]]);
});

test("generic rust: impl blocks, lifetimes vs char literals, raw strings, #[test] #[ignore]", () => {
  const by = byName(parse(RS, "rust"));
  assert.deepEqual(Object.keys(by), ["UserRepo", "User", "UserRepo.find_by_email", "UserRepo.create_user", "helper", "t4_ac1_rejects_duplicate"]);
  const cu = by["UserRepo.create_user"];
  assert.equal(cu.parentName, "UserRepo");
  assert.equal(cu.sigText, "pub fn create_user<'a>(&'a mut self, email: &str) -> Result<&'a User, String>");
  assert.deepEqual(cu.bodySpan, { start: 24, end: 28 });
  assert.equal(cu.stub, true);
  assert.deepEqual(cu.calleesRaw.map((c) => c.name), ["find_by_email", "is_some", "Err"]);
  assert.equal(by.helper.exported, false);
  assert.deepEqual(by.helper.bodySpan, { start: 31, end: 33 });
  assert.equal(by.User.sigText, "#[derive(Clone, Debug)]\npub struct User");
  assert.deepEqual([by.t4_ac1_rejects_duplicate.kind, by.t4_ac1_rejects_duplicate.test.mode], ["test", "skip"]);
});

test("generic ruby: module/class nesting, end matching (modifiers, do-blocks, heredoc), private, rspec", () => {
  const by = byName(parse(RB, "ruby"));
  assert.deepEqual(Object.keys(by), ["Acme", "Acme.UserService", "Acme.UserService.initialize", "Acme.UserService.create_user", "Acme.UserService.count",
    "Acme.UserService.ready?", "Acme.UserService.secret", "Acme.UserRepo", "Acme.UserRepo.find_by_email"]);
  assert.deepEqual(by["Acme.UserService"].span, { start: 7, end: 38 });
  assert.deepEqual(by["Acme.UserService.count"].bodySpan, { start: 21, end: 27 });
  assert.equal(by["Acme.UserService.create_user"].stub, true);
  assert.equal(by["Acme.UserService.create_user"].sigText, "def create_user(email)");
  assert.equal(by["Acme.UserService.ready?"].bodyText, "true");
  assert.equal(by["Acme.UserService.secret"].exported, false);
  assert.deepEqual(by["Acme.UserService.secret"].span, { start: 33, end: 37 });
  const t = parse(RBS, "ruby");
  assert.deepEqual(t.symbols.map((s) => [s.kind, s.name, s.test.mode]), [
    ["suite", "Acme.UserService", "active"], ["suite", "Acme.UserService > #create_user", "active"],
    ["test", "Acme.UserService > #create_user > T-5.AC1 rejects duplicate email", "todo"], ["test", "Acme.UserService > #create_user > counts", "active"]]);
  assert.match(t.symbols[2].doc, /@covers UserService\.create_user/);
});

const SNIPPETS = {
  c: ["a.c", "#include <stdio.h>\n/** Adds. @task T-9 */\nstatic int add(int a, int b)\n{\n  const char *s = \"}\";\n  return a + b;\n}\nint main(void) { return add(1, 2); }\n", ["add", "main"]],
  cpp: ["b.cpp", "namespace geo {\nclass Shape {\n public:\n  virtual double area() const { return 0; }\n};\n}\ndouble geo::Shape::perimeter() const { auto s = R\"x(})x\"; return 1; }\n", ["Shape", "Shape.area", "Shape.perimeter"]],
  csharp: ["c.cs", "namespace Acme\n{\n    public class Svc\n    {\n        /// @task T-7\n        public async Task<User> Create(string e)\n        {\n            var s = $\"{e} }}\";\n            throw new NotImplementedException(\"TODO(impl): Create\");\n        }\n        public int Count() => repo.Size();\n    }\n}\n", ["Svc", "Svc.Create", "Svc.Count"]],
  swift: ["d.swift", "struct Repo {\n  func find(email: String) -> User? { let s = \"\\(email) }\"; return nil }\n}\nextension Repo {\n  mutating func save(_ u: User) { }\n}\n", ["Repo", "Repo.find", "Repo.save"]],
  php: ["e.php", "<?php\n#[Attr]\nfinal class Svc {\n    /** @task T-8 */\n    public function create(string $e): User {\n        # comment }\n        throw new \\Exception('TODO(impl): create');\n    }\n}\nfunction helper($x) { return $x; }\n", ["Svc", "Svc.create", "helper"]],
  scala: ["f.scala", "object Main {\n  def run(args: Array[String]): Unit = {\n    println(s\"${args.length} }\")\n  }\n  def add(a: Int, b: Int): Int = a + b\n}\n", ["Main", "Main.run", "Main.add"]],
  dart: ["g.dart", "class Svc {\n  /// @task T-11\n  Future<User> create(String e) async {\n    throw UnimplementedError('TODO(impl): create');\n  }\n}\nvoid main() { print('${1} }'); }\n", ["Svc", "Svc.create", "main"]],
  lua: ["h.lua", "local M = {}\n--- @task T-12\nfunction M.add(a, b)\n  if a then return a + b end\n  --[[ long } end ]]\n  return 0\nend\nlocal function helper() return [[ end ]] end\nreturn M\n", ["M.add", "helper"]],
  shell: ["i.sh", "#!/usr/bin/env bash\n# @task T-13\ngreet() {\n  echo \"hi ${1} }\" # not } a brace\n  case \"$1\" in a) echo a ;; esac\n}\nfunction other {\n  cat <<EOF\n } }\nEOF\n}\n", ["greet", "other"]],
  sql: ["j.sql", "-- @task T-14\nCREATE OR REPLACE FUNCTION order_total(o_id int) RETURNS numeric AS $$\nBEGIN\n  RAISE EXCEPTION 'TODO(impl): order_total';\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE TABLE users (id int, email text);\n", ["order_total", "users"]],
  elixir: ["k.ex", "defmodule Acme.Users do\n  @doc \"\"\"\n  Registers.\n  @task T-15\n  \"\"\"\n  def create(attrs) do\n    raise \"TODO(impl): create\"\n  end\n\n  defp helper(x), do: {:ok, x}\n  def go(x) do\n    Enum.map(x, fn y -> y end)\n  end\nend\n", ["Acme.Users", "Acme.Users.create", "Acme.Users.helper", "Acme.Users.go"]],
};

test("generic: language table covers C, C++, C#, Swift, PHP, Scala, Dart, Lua, Shell, SQL, Elixir", () => {
  for (const [lang, [path, src, names]] of Object.entries(SNIPPETS)) {
    const r = parseGeneric({ path, content: src }, lang, DEFAULTS);
    assert.equal(r.parseError, null, lang);
    assert.deepEqual(r.symbols.map((s) => s.name), names, lang);
    const tagged = r.symbols.find((s) => s.doc && /@task/.test(s.doc));
    if (!/@task/.test(src)) continue;
    assert.ok(tagged, `${lang}: tagged symbol has its doc`);
    const ix = toIndexSymbols(r, lang).symbols.find((s) => s.name === tagged.name);
    assert.ok(ix.tags.task.length === 1, `${lang}: @task parsed`);
  }
  const stubs = Object.entries(SNIPPETS).filter(([, [p, s]]) => /TODO\(impl\)/.test(s)).map(([lang, [path, src]]) => [lang, parseGeneric({ path, content: src }, lang, DEFAULTS).symbols.some((s) => s.stub)]);
  assert.deepEqual(stubs.filter(([, ok]) => !ok), [], "TODO(impl): sentinel detected in every language");
  for (const spec of Object.values(LANGS)) assert.ok(spec.style && spec.strings && spec.decls?.length, "every table entry is complete");
});

test("hashes: stable across parses; comments/whitespace/@status ignored; signature edits detected", () => {
  for (const [rel, lang] of [[J, "java"], [K, "kotlin"], [G, "go"], [RS, "rust"], [RB, "ruby"]]) {
    const a = toIndexSymbols(parse(rel, lang), lang).symbols, b = toIndexSymbols(parse(rel, lang), lang).symbols;
    assert.deepEqual(a, b, rel);
  }
  const src = read(J);
  const edit = (s) => toIndexSymbols(parseGeneric({ path: J, content: s }, "java", DEFAULTS), "java").symbols.find((x) => x.name === "UserService.createUser");
  const base = edit(src);
  const commented = edit(src.replace("// TODO(impl): 2. save", "// TODO(impl): 2. save it").replace("throw new", "/* note */ throw   new"));
  assert.equal(commented.bodyHash, base.bodyHash);
  assert.equal(commented.sigHash, base.sigHash);
  assert.notEqual(commented.todoHash, base.todoHash);
  const status = edit(src.replace("@status skeleton @prio 1", "@status green @prio 3"));
  assert.equal(status.intentHash, base.intentHash);
  assert.deepEqual(status.tags.task, ["T-1"]);
  assert.deepEqual(status.tags.calls, ["UserRepo.findByEmail", "UserRepo.save"]);
  assert.equal(status.tags.concurrency, "none");
  assert.equal(base.signature, "@Override public User createUser(String email) throws DuplicateEmailException");
  assert.notEqual(edit(src.replace("createUser(String email)", "createUser(String email, int n)")).sigHash, base.sigHash);
  assert.notEqual(edit(src.replace("@concurrency none", "@concurrency io")).intentHash, base.intentHash);
  assert.notEqual(edit(src.replace('"TODO(impl): UserService.createUser"', '"x"')).bodyHash, base.bodyHash);
});

test("scanner: comment stripping respects strings; nested comments; heredocs; approx flag", () => {
  assert.equal(stripCommentsGeneric('a = "// no" // yes', "kotlin"), 'a = "// no"  ');
  assert.equal(stripCommentsGeneric('x = "#{a} # no" # yes', "ruby"), 'x = "#{a} # no"  ');
  assert.equal(stripCommentsGeneric("/* a /* b */ c */ d", "rust"), "  d");
  assert.equal(stripCommentsGeneric("/* a /* b */ c */ d", "java"), "  c */ d");
  assert.equal(stripCommentsGeneric("echo $# ${#x} # c", "shell"), "echo $# ${#x}  ");
  const { masked } = scan("x = <<~EOS\n  } end\nEOS\ny = 1\n", LANGS.ruby);
  assert.ok(!/[}]|end/.test(masked), "heredoc body masked");
  const bad = parseGeneric({ path: "x.kt", content: "fun a() {\n  val s = \"open\n}\n" }, "kotlin", DEFAULTS);
  assert.equal(bad.warnings.filter((w) => w.code === "GENERIC_APPROX").length, 1);
  assert.match(bad.warnings[0].message, /unterminated/);
});

test("GENERIC_APPROX once per file, adapter marked approx, tagged-doc fallback for unknown declaration shapes", async () => {
  assert.equal(generic.approx, true);
  const res = await generic.parse([{ path: J, content: read(J) }, { path: RB, content: read(RB) }], { config: DEFAULTS });
  for (const r of res) assert.equal(r.warnings.filter((w) => w.code === "GENERIC_APPROX").length, 1);
  const odd = "val handler = run {\n}\n/**\n * Odd shape.\n * @task T-3 @impl agent\n */\nval register: (String) -> Unit = { email ->\n  TODO(\"TODO(impl): register\")\n}\n";
  const r = parseGeneric({ path: "o.kt", content: odd }, "kotlin", DEFAULTS);
  assert.deepEqual(r.symbols.map((s) => s.name), ["register"]);
  assert.equal(r.symbols[0].stub, true);
  assert.match(r.warnings[0].message, /1 tagged declaration\(s\) not matched/);
});

function polyProject(config) {
  const root = mkdtempSync(join(tmpdir(), "hitl-poly-"));
  for (const d of readdirSync(POLY)) if (d !== "fake-ctags") cpSync(join(POLY, d), join(root, d), { recursive: true });
  mkdirSync(join(root, ".hitl"), { recursive: true });
  writeFileSync(join(root, ".hitl/hitl.config.json"), JSON.stringify({ schema: "hitl.config/1", ...config }));
  return root;
}

test("full index of the polyglot fixture: graph, tags, ADAPTER_LANG once per language, byte-identical reindex", async () => {
  const root = polyProject({ testGlobs: [...DEFAULTS.testGlobs] });
  const res = await updateIndex(root, null, { full: true });
  const ix = JSON.parse(readFileSync(join(root, ".hitl/index/index.json"), "utf8"));
  for (const l of ["java", "kotlin", "go", "rust", "ruby"]) assert.equal(ix.adapters[l], "generic@1", l);
  assert.deepEqual(Object.keys(res.languages), ["go", "java", "kotlin", "ruby", "rust"]);
  assert.match(res.languages.kotlin.note, /^kotlin → generic@1 \(approx; install universal-ctags/);
  const al = ix.warnings.filter((w) => w.code === "ADAPTER_LANG");
  assert.equal(al.length, 5);
  assert.equal(new Set(al.map((w) => w.message)).size, 5);
  assert.deepEqual(ix.warnings.filter((w) => w.code === "UNRESOLVED_CALLS_TAG" || w.code === "UNRESOLVED_COVERS_TAG").map((w) => w.message), []);
  const S = ix.symbols;
  assert.deepEqual(S[`${J}#UserService.createUser`].tags.calls, ["UserRepo.findByEmail", "UserRepo.save"]);
  assert.deepEqual(S[`${JT}#UserServiceTest.t1Ac1RejectsDuplicateEmail`].test.coversResolved, [`${J}#UserService.createUser`]);
  assert.deepEqual(S[`${GT}#TestT3AC1RejectsDuplicate`].test.coversResolved, [`${G}#Service.CreateUser`]);
  assert.deepEqual(S[`${RS}#UserRepo.create_user`].callees, [`${RS}#UserRepo.find_by_email`]);
  assert.deepEqual(S[`${RS}#UserRepo.create_user`].unresolvedCalls, [], "unknown names (is_some, Err) are not recorded");
  assert.deepEqual(S[`${J}#UserService.count`].callees, [`${JR}#UserRepo.size`], "field type UserRepo resolves repo.size()");
  assert.equal(S[`${G}#Service.CreateUser`].stub, true);
  assert.deepEqual(S[`${G}#Service.CreateUser`].todos, ["1. reject duplicates"]);
  const before = readFileSync(join(root, ".hitl/index/index.json"));
  await updateIndex(root, null, { full: true });
  assert.ok(before.equals(readFileSync(join(root, ".hitl/index/index.json"))), "full reindex is byte-identical");
  await updateIndex(root, [K]);
  assert.ok(before.equals(readFileSync(join(root, ".hitl/index/index.json"))), "incremental reindex is byte-identical");
});

test("config.languages explicit list keeps old projects ts/py-only; summary reports disabled languages", async () => {
  const root = polyProject({ languages: ["ts", "py"] });
  const res = await updateIndex(root, null, { full: true });
  const ix = JSON.parse(readFileSync(join(root, ".hitl/index/index.json"), "utf8"));
  assert.deepEqual(Object.keys(ix.files), []);
  assert.deepEqual(Object.keys(ix.adapters).sort(), ["py", "ts"]);
  assert.equal(res.languages.java.enabled, false);
  assert.match(res.languages.java.note, /disabled/);
  const root2 = polyProject({ languages: ["*", "!ruby", "!rust"], adapters: { go: "none" } });
  await updateIndex(root2, null, { full: true });
  const ix2 = JSON.parse(readFileSync(join(root2, ".hitl/index/index.json"), "utf8"));
  assert.deepEqual([...new Set(Object.values(ix2.files).map((f) => f.lang))].sort(), ["go", "java", "kotlin"]);
  assert.ok(Object.values(ix2.files).filter((f) => f.lang === "go").every((f) => f.parseError === "no adapter available for go"));
});

test("ctags adapter (fake universal-ctags on PATH): discovery via JSON tags, generic bodies/hashes, fallbacks", async () => {
  const saved = process.env.PATH;
  process.env.PATH = FAKE_CTAGS + delimiter + saved;
  try {
    const ad = await adapterFor("java", POLY, DEFAULTS);
    assert.equal(ad.id, "ctags@1+6.1.0");
    assert.equal((await adapterFor("lua", POLY, DEFAULTS)).id, "generic@1", "language ctags lacks -> generic");
    assert.equal((await adapterFor("java", POLY, { ...DEFAULTS, adapters: { java: "generic" } })).id, "generic@1", "adapters.<lang> override");
    for (const [rel, lang] of [[J, "java"], [JR, "java"], [K, "kotlin"]]) {
      const [viaCtags] = await (await adapterFor(lang, POLY, DEFAULTS)).adapter.parse([{ path: rel, content: read(rel) }], { config: DEFAULTS });
      const viaGeneric = parse(rel, lang);
      assert.deepEqual(viaCtags.symbols.map((s) => s.name), viaGeneric.symbols.map((s) => s.name), rel);
      const hc = toIndexSymbols(viaCtags, lang).symbols.map((s) => [s.id, s.sigHash, s.bodyHash, s.intentHash]);
      const hg = toIndexSymbols(viaGeneric, lang).symbols.map((s) => [s.id, s.sigHash, s.bodyHash, s.intentHash]);
      assert.deepEqual(hc, hg, `${rel}: same hashes as generic`);
      assert.match(viaCtags.warnings[0].message, /^ctags\+generic adapter/);
    }
    // a file ctags knows nothing about still gets tagged-doc fallbacks
    const [g] = await (await adapterFor("go", POLY, DEFAULTS)).adapter.parse([{ path: G, content: read(G) }], { config: DEFAULTS });
    assert.deepEqual(g.symbols.map((s) => s.name), ["Service.CreateUser"]);
    process.env.FAKE_CTAGS_FAIL = "1";
    const [f] = await ad.adapter.parse([{ path: J, content: read(J) }], { config: DEFAULTS });
    assert.ok(f.warnings.some((w) => w.code === "CTAGS_FAILED"));
    assert.equal(f.symbols.length, 7);
  } finally {
    process.env.PATH = saved;
    delete process.env.FAKE_CTAGS_FAIL;
  }
  assert.equal((await adapterFor("java", POLY, DEFAULTS)).id, "generic@1", "probe is re-evaluated per PATH");
});
