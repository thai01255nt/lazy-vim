import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import lite, { lex } from "../../scripts/lib/adapters/ts-lite.mjs";
import compiler, { loadTs } from "../../scripts/lib/adapters/ts-compiler.mjs";
import py from "../../scripts/lib/adapters/py.mjs";
import { DEFAULTS } from "../../scripts/lib/config.mjs";
import { toIndexSymbols } from "../../scripts/lib/indexer.mjs";

const ctx = { root: process.cwd(), config: DEFAULTS };
const SRC = `import { UserRepo, type User } from "../repo/userRepo.ts";
import * as path from "node:path";

/** Service. */
export class UserService {
  repo: UserRepo;
  constructor(repo: UserRepo) { this.repo = repo; }

  /**
   * Registers a user.
   * @task T-1 @impl agent @status skeleton @prio 1
   * @calls UserRepo.findByEmail
   */
  async createUser(email: string, opts: { a: number }): Promise<User> {
    // TODO(impl): 1. reject duplicates
    // TODO(impl): 2. save
    throw new Error("TODO(impl): UserService.createUser");
  }
  get count(): number { return this.repo.size(); }
}

export function fmt(x: string): string;
export function fmt(x: any): string {
  const re = /\\/\\/not-a-comment/g; // real comment
  return \`\${path.join("a", x)}\`.replace(re, "");
}
export const add = (a: number, b: number): number => a + b;
export type Id = Map<string, { a: 1 }>;
export interface Shape { w: number }
`;
const TEST = `import { describe, it } from "node:test";
describe("UserService.createUser", () => {
  /** @covers UserService.createUser @ac T-1.AC1 @kind example @origin skeleton */
  it.todo("T-1.AC1 rejects duplicate");
  it.skip("skipped", () => {});
  it("active", async () => { await svc.createUser("a"); });
});
`;

test("lexer handles templates, regex and comments", () => {
  const { tokens, comments } = lex("const a = `x${b + `y${c}`}z` / 2; const r = /\\/\\//g; // c\n/* d */");
  assert.equal(comments.length, 2);
  assert.ok(tokens.some((t) => t.t === "regex" && t.v === "/\\/\\//g"));
});

test("ts-lite recognizes classes, methods, overloads, arrows, types, imports", async () => {
  const [r] = await lite.parse([{ path: "src/services/userService.ts", content: SRC }], ctx);
  const by = Object.fromEntries(r.symbols.map((s) => [s.name, s]));
  assert.deepEqual(Object.keys(by), ["UserService", "UserService.constructor", "UserService.createUser", "UserService.count", "fmt", "add", "Id", "Shape"]);
  const cu = by["UserService.createUser"];
  assert.equal(cu.sigText, "async createUser(email: string, opts: { a: number }): Promise<User>");
  assert.equal(cu.async, true);
  assert.equal(cu.stub, true);
  assert.deepEqual(cu.commentLines.map((c) => c.text), ["TODO(impl): 1. reject duplicates", "TODO(impl): 2. save"]);
  assert.deepEqual(cu.locals, { "this.repo": "UserRepo" });
  assert.match(cu.doc, /@task T-1/);
  assert.match(by.fmt.sigText, /^export function fmt\(x: string\): string;\nexport function fmt\(x: any\): string$/);
  assert.deepEqual(by.fmt.calleesRaw, [{ name: "join", qualifier: "path" }, { name: "replace", qualifier: "(expr)" }]);
  assert.equal(by.add.bodyText, "a + b");
  assert.equal(by.Id.sigText, "export type Id = Map<string, { a: 1 }>");
  assert.deepEqual(by["UserService.count"].calleesRaw, [{ name: "size", qualifier: "this.repo" }]);
  assert.deepEqual(r.imports[0].names, [{ name: "UserRepo", alias: null, typeOnly: false }, { name: "User", alias: null, typeOnly: true }]);
  assert.deepEqual(r.imports[1].names, [{ name: "*", alias: "path", typeOnly: false }]);
});

test("ts-lite recognizes test calls with modes and title paths", async () => {
  const [r] = await lite.parse([{ path: "tests/userService.test.ts", content: TEST }], ctx);
  assert.deepEqual(r.symbols.map((s) => [s.kind, s.name, s.test.mode]), [
    ["suite", "UserService.createUser", "active"],
    ["test", "UserService.createUser > T-1.AC1 rejects duplicate", "todo"],
    ["test", "UserService.createUser > skipped", "skip"],
    ["test", "UserService.createUser > active", "active"],
  ]);
  assert.match(r.symbols[1].doc, /@covers UserService.createUser/);
  assert.equal(r.symbols[1].parentName, "UserService.createUser");
});

test("ts-compiler and ts-lite produce identical results", { skip: !loadTs(process.cwd()) && "typescript not resolvable (set HITL_TYPESCRIPT)" }, async () => {
  for (const f of [{ path: "src/services/userService.ts", content: SRC }, { path: "tests/userService.test.ts", content: TEST }]) {
    const [a] = await lite.parse([f], ctx), [b] = await compiler.parse([f], ctx);
    assert.deepEqual(b.symbols, a.symbols);
    assert.deepEqual(b.imports, a.imports);
  }
});

const PY = `from decimal import Decimal
from .money import round_money as rm
import os.path


class Order:
    """An order."""
    total: Decimal

    def __init__(self, total: Decimal):
        self.total = total
        self.repo = Repo()

    @staticmethod
    def apply(order: "Order", pct: Decimal) -> "Order":
        """Apply pct.

        @task T-2 @impl manual @prio 2
        @calls round_money
        """
        # TODO(impl): 1. validate pct
        raise NotImplementedError("TODO(impl): Order.apply")

    def _helper(self):
        return self.repo.load(os.path.join("a", "b"))


async def fetch(x: int) -> int:
    return await rm(x)
`;
const PYTEST = `import unittest

class TestOrders(unittest.TestCase):
    @unittest.skip("TODO(test): T-2.AC1")
    def test_T2_AC1_x(self):
        """@covers Order.apply @ac T-2.AC1 @kind example @origin skeleton"""

    def test_ok(self):
        self.assertEqual(1, 1)
`;

test("py-ast adapter: qualnames, docstrings, stubs, locals, calls, tests", { skip: !(await py.available()) && "python3 unavailable" }, async () => {
  const [r, t, bad] = await py.parse([{ path: "orders.py", content: PY }, { path: "tests/test_orders.py", content: PYTEST }, { path: "bad.py", content: "def (:\n" }], ctx);
  const by = Object.fromEntries(r.symbols.map((s) => [s.name, s]));
  assert.deepEqual(Object.keys(by), ["Order", "Order.__init__", "Order.apply", "Order._helper", "fetch"]);
  const ap = by["Order.apply"];
  assert.equal(ap.sigText, '@staticmethod\n    def apply(order: "Order", pct: Decimal) -> "Order"');
  assert.equal(ap.stub, true);
  assert.match(ap.doc, /^Apply pct\.\n\n@task T-2/);
  assert.deepEqual(ap.commentLines.map((c) => c.text), ["TODO(impl): 1. validate pct"]);
  assert.equal(ap.locals.pct, "Decimal");
  assert.equal(ap.locals["self.repo"], "Repo");
  assert.deepEqual(by["Order._helper"].calleesRaw, [{ name: "load", qualifier: "self.repo" }, { name: "join", qualifier: "os.path" }]);
  assert.equal(by["Order._helper"].exported, false);
  assert.equal(by.fetch.async, true);
  assert.deepEqual(r.imports.map((i) => i.from), ["decimal", ".money", "os.path"]);
  assert.deepEqual(t.symbols.map((s) => [s.kind, s.name, s.test?.mode]), [["suite", "TestOrders", "active"], ["test", "TestOrders.test_T2_AC1_x", "skip"], ["test", "TestOrders.test_ok", "active"]]);
  assert.match(bad.parseError, /SyntaxError/);
});

test("toIndexSymbols computes hashes; status/prio edits leave intentHash unchanged", async () => {
  const [a] = await lite.parse([{ path: "src/s.ts", content: SRC }], ctx);
  const [b] = await lite.parse([{ path: "src/s.ts", content: SRC.replace("@status skeleton @prio 1", "@status green @prio 3").replace("// TODO(impl): 2. save", "// TODO(impl): 2. save it") }], ctx);
  const sa = toIndexSymbols(a, "ts").symbols.find((s) => s.name === "UserService.createUser");
  const sb = toIndexSymbols(b, "ts").symbols.find((s) => s.name === "UserService.createUser");
  assert.equal(sa.intentHash, sb.intentHash);
  assert.equal(sa.bodyHash, sb.bodyHash); // comments don't change bodyHash
  assert.notEqual(sa.todoHash, sb.todoHash);
  assert.deepEqual(sa.todos, ["1. reject duplicates", "2. save"]);
  assert.equal(sa.signature, "async createUser(email: string, opts: { a: number }): Promise<User>");
  assert.ok(existsSync(new URL("../../scripts/adapters/py_index.py", import.meta.url)));
});

test("registry: custom adapter first, adapters.<lang> override, generic fallback; ts/py unchanged", async () => {
  const { adapterFor, describeAdapter } = await import("../../scripts/lib/adapters/registry.mjs");
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = mkdtempSync(join(tmpdir(), "hitl-reg-"));
  writeFileSync(join(root, "kt.mjs"), 'export default { id: "my-kt@1", langs: ["kt"], available: async () => true, parse: async (fs) => fs.map((f) => ({ path: f.path, symbols: [] })) };');
  const env = process.env.PATH;
  process.env.PATH = "/nonexistent"; // no ctags
  try {
    assert.equal((await adapterFor("kotlin", root, { ...DEFAULTS, customAdapters: { kotlin: "./kt.mjs" } })).id, "my-kt@1");
    assert.equal((await adapterFor("kotlin", root, DEFAULTS)).id, "generic@1");
    assert.equal(await adapterFor("kotlin", root, { ...DEFAULTS, adapters: { kotlin: "none" } }), null);
    assert.equal((await adapterFor("kotlin", root, { ...DEFAULTS, adapters: { kotlin: "ctags" } })).id, "generic@1", "ctags requested but missing -> generic");
    assert.equal(await adapterFor("cobol", root, DEFAULTS), null);
    assert.equal((await adapterFor("ts", root, { ...DEFAULTS, adapters: { ts: "ts-lite" } })).id, "ts-lite@1");
    assert.match(describeAdapter("kotlin", "generic@1"), /^kotlin → generic@1 \(approx; install universal-ctags for better symbol discovery\)$/);
  } finally { process.env.PATH = env; }
  if (await py.available()) assert.equal((await adapterFor("py", root, DEFAULTS)).id, "py-ast@1");
});

test("config: language detection by extension, languages include/exclude, toIndexSymbols strips generic comments", async () => {
  const { langOf, enabledLanguages } = await import("../../scripts/lib/config.mjs");
  assert.deepEqual(["a.kt", "b.java", "c.go", "d.rs", "e.rb", "f.cs", "g.swift", "h.php", "i.scala", "j.dart", "k.lua", "l.sh", "m.sql", "n.ex", "o.cpp", "p.c", "x.ts", "y.py", "z.txt"].map((f) => langOf(f, DEFAULTS)),
    ["kotlin", "java", "go", "rust", "ruby", "csharp", "swift", "php", "scala", "dart", "lua", "shell", "sql", "elixir", "cpp", "c", "ts", "py", null]);
  assert.equal(langOf("a.kt", { ...DEFAULTS, languages: ["ts", "py"] }), null);
  assert.equal(langOf("a.kt", { ...DEFAULTS, languages: ["*", "!kotlin"] }), null);
  assert.equal(langOf("a.kt", { ...DEFAULTS, languages: ["kotlin"] }), "kotlin");
  assert.ok(enabledLanguages(DEFAULTS).has("elixir"));
  const res = { path: "a.kt", symbols: [{ name: "f", kind: "function", sigText: "fun f() // c", bodyText: "\n  return 1 // one\n  /* two */\n", doc: null }] };
  const res2 = { path: "a.kt", symbols: [{ ...res.symbols[0], sigText: "fun f()", bodyText: "return 1" }] };
  const [a] = toIndexSymbols(res, "kotlin").symbols, [b] = toIndexSymbols(res2, "kotlin").symbols;
  assert.equal(a.signature, "fun f()");
  assert.equal(a.bodyHash, b.bodyHash);
  assert.equal(a.sigHash, b.sigHash);
  assert.equal(a.bodyLines, 1);
});
