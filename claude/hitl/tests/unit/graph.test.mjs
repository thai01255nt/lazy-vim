import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeProject, write } from "./_project.mjs";
import { updateIndex, readIndex, resolveRef, findRoot, parseSources } from "../../scripts/lib/api.mjs";
import { resolveImport } from "../../scripts/lib/graph.mjs";

test("index builds callees/callers, covers and is deterministic", async () => {
  const root = makeProject();
  assert.equal(await findRoot(join(root, "src/repo")), root);
  const res = await updateIndex(root, null, { full: true });
  assert.equal(res.schema, "hitl.indexResult/1");
  assert.ok(res.added.includes("src/services/userService.ts#UserService.createUser"));
  const idx = await readIndex(root);
  const cu = idx.symbols["src/services/userService.ts#UserService.createUser"];
  assert.deepEqual(cu.callers, ["src/http/authController.ts#register"]);
  assert.deepEqual(idx.symbols["src/http/authController.ts#register"].callees, [cu.id]);
  assert.equal(idx.files["src/services/userService.ts"].imports[0].resolved, "src/repo/userRepo.ts");
  const t = idx.symbols["tests/userService.test.ts#UserService.createUser > T-1.AC1 rejects duplicate email"];
  assert.deepEqual(t.test.coversResolved, [cu.id]);
  assert.equal(idx.adapters.ts, "ts-lite@1");
  const first = readFileSync(join(root, ".hitl/index/index.json"), "utf8");
  assert.ok(!first.includes(root), "no absolute paths");
  await updateIndex(root, null, { full: true });
  assert.equal(readFileSync(join(root, ".hitl/index/index.json"), "utf8"), first);
});

test("incremental update: changed-only and explicit files, modified flags", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const none = await updateIndex(root, null, { changedOnly: true });
  assert.deepEqual(none.changedFiles, []);
  write(root, "src/http/authController.ts", (await import("./_project.mjs")).CTRL.replace("email: string)", "email: string, x: number)"));
  const r = await updateIndex(root, ["src/http/authController.ts"]);
  assert.deepEqual(r.modified, [{ id: "src/http/authController.ts#register", sig: true, intent: false, body: false }]);
  write(root, "src/extra.ts", "export function extra() { return 1; }\n");
  const r2 = await updateIndex(root, null, { changedOnly: true });
  assert.deepEqual(r2.added, ["src/extra.ts#extra"]);
});

test("resolveRef: exact, short, suffix, ambiguous, preferring same file", async () => {
  const root = makeProject({ "src/other.ts": "export class UserRepo { save(u: any) { return u; } }\n" });
  await updateIndex(root, null, { full: true });
  const idx = await readIndex(root);
  assert.deepEqual(resolveRef(idx, "UserService.createUser"), { id: "src/services/userService.ts#UserService.createUser" });
  assert.deepEqual(resolveRef(idx, "createUser"), { id: "src/services/userService.ts#UserService.createUser" });
  assert.deepEqual(resolveRef(idx, "src/http/authController.ts#register"), { id: "src/http/authController.ts#register" });
  assert.ok(resolveRef(idx, "UserRepo.save").ambiguous);
  assert.deepEqual(resolveRef(idx, "UserRepo.save", "src/services/userService.ts"), { id: "src/repo/userRepo.ts#UserRepo.save" });
  assert.equal(resolveRef(idx, "Nope.nothing"), null);
});

test("parseSources works without writing; python import resolution", async () => {
  const root = makeProject();
  const [f] = await parseSources(root, [{ path: "src/a.ts", content: "export const f = () => g();\nfunction g() {}\n" }]);
  assert.deepEqual(f.symbols.map((s) => s.name), ["f", "g"]);
  const has = (p) => ["pkg/__init__.py", "pkg/money.py", "orders.py"].includes(p);
  assert.equal(resolveImport("pkg/a.py", ".money", "py", has), "pkg/money.py");
  assert.equal(resolveImport("x.py", "pkg", "py", has), "pkg/__init__.py");
  assert.equal(resolveImport("tests/t.py", "orders", "py", has), "orders.py");
  assert.equal(resolveImport("src/a.ts", "./b.js", "ts", (p) => p === "src/b.ts"), "src/b.ts");
});
