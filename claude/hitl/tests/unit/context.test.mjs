import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeProject } from "./_project.mjs";
import { updateIndex, buildContext, readIndex } from "../../scripts/lib/api.mjs";
import { writeMapMd } from "../../scripts/lib/mapmd.mjs";

test("context for a task lists ACs, targets, callers, callees and tests without line numbers", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "T-1", {});
  assert.match(c.markdown, /^# Context T-1 — Register user/);
  assert.match(c.markdown, /- T-1.AC1 Given an existing email/);
  assert.match(c.markdown, /### 1\. UserService\.createUser — impl: agent/);
  assert.match(c.markdown, /callers \(1\): register \(src\/http\/authController\.ts\) — "Handles registration requests\."/);
  assert.match(c.markdown, /callees declared \(@calls\): UserRepo\.findByEmail: findByEmail\(email: string\): User \| undefined/);
  assert.match(c.markdown, /throw new Error\("TODO\(impl\): UserService.createUser"\)/);
  assert.match(c.markdown, /interface User \{ id: string; email: string \}/);
  assert.doesNotMatch(c.markdown, /\.ts:\d+/);
  assert.deepEqual(c.symbols, ["src/services/userService.ts#UserService.createUser", "src/repo/userRepo.ts#UserRepo.findByEmail"]);
  assert.deepEqual(c.callers, ["src/http/authController.ts#register"]);
});

test("contract mode hides bodies, keeps TODO lines, adds test files and import paths", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "UserService.createUser", { contract: true });
  assert.doesNotMatch(c.markdown, /throw new Error/);
  assert.match(c.markdown, /\/\/ TODO\(impl\): 1\. reject duplicates\n\s+…\n\s+\}/);
  assert.match(c.markdown, /import paths: src\/services\/userService\.ts → \.\.\/src\/services\/userService\.ts/);
  assert.match(c.markdown, /it\.todo\("T-1\.AC1 rejects duplicate email"\)/);
  const small = await buildContext(root, "T-1", { contract: true, budget: 900 });
  assert.ok(small.markdown.length <= 900);
  await assert.rejects(buildContext(root, "Nope.none", {}), /unknown ref/);
});

test("map-md writes the AUTO block and preserves manual text", async () => {
  const root = makeProject({ ".hitl/docs/CODEBASE-MAP.md": "# Map\nmanual note\n<!-- AUTO-GENERATED:BEGIN codebase-map -->\nold\n<!-- AUTO-GENERATED:END codebase-map -->\ntail\n" });
  await updateIndex(root, null, { full: true });
  await writeMapMd(root, await readIndex(root));
  const md = readFileSync(join(root, ".hitl/docs/CODEBASE-MAP.md"), "utf8");
  assert.match(md, /^# Map\nmanual note\n<!-- AUTO-GENERATED:BEGIN codebase-map -->\n## src\/http\//);
  assert.match(md, /createUser\(email: string\): User` \(exported\) \[T-1 · agent · skeleton\] — Registers a user\./);
  assert.match(md, /<!-- AUTO-GENERATED:END codebase-map -->\ntail\n$/);
  assert.match(readFileSync(join(root, ".hitl/index/index.md"), "utf8"), /\| src\/repo\/userRepo.ts#UserRepo.findByEmail \| method \| T-1 \| manual/);
});

test("AC lines carry requirement text; decisions only outside contract mode", async () => {
  const { write } = await import("./_project.mjs");
  const root = makeProject({ ".hitl/planning/feat-users.md": "# U - Planning\n> status: approved\n\n## Requirements\n- R-1 [must] The system shall reject duplicate emails.\n\n## Decisions\n| id | decision | why | cost if wrong | serves | status |\n|---|---|---|---|---|---|\n| D-1 | Check in createUser | x | y | R-1 | accepted |\n" });
  const tf = join(root, ".hitl/tasks/feat-users.md");
  write(root, ".hitl/tasks/feat-users.md", readFileSync(tf, "utf8").replace("T-1.AC1 Given", "T-1.AC1 (R-1) Given").replace("### Acceptance", "**Why**: one entry point (D-1)\n\n### Acceptance"));
  const svc = join(root, "src/services/userService.ts");
  write(root, "src/services/userService.ts", readFileSync(svc, "utf8").replace("@prio 1", "@prio 1\n   * @dec D-1"));
  await updateIndex(root, null, { full: true });
  const c = await buildContext(root, "T-1", {});
  assert.match(c.markdown, /- T-1\.AC1 \(R-1: The system shall reject duplicate emails\.\) Given an existing email/);
  assert.match(c.markdown, /## Decisions\n- D-1 \(accepted\): Check in createUser/);
  assert.match(c.markdown, /decisions \(@dec\): D-1 \(Check in createUser\)/);
  const k = await buildContext(root, "T-1", { contract: true });
  assert.match(k.markdown, /- T-1\.AC1 \(R-1: The system shall reject duplicate emails\.\)/);
  assert.doesNotMatch(k.markdown, /## Decisions/);
  assert.doesNotMatch(k.markdown, /decisions \(@dec\)/);
});
