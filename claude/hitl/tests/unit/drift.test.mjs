import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProject, write, SVC, REPO, TESTS } from "./_project.mjs";
import { updateIndex, readIndex, computeDrift, writeJsonAtomic, paths } from "../../scripts/lib/api.mjs";

async function lockAll(root, testStage = "locked") {
  const idx = await readIndex(root);
  const lock = { schema: "hitl.lock/1", symbols: {}, tests: {}, tasks: { "T-1": { file: ".hitl/tasks/feat-users.md", risk: "high", skeletonAt: "x", testsAt: null, doneAt: null, doneBodyHashes: {} } } };
  for (const id of ["src/services/userService.ts#UserService.createUser", "src/repo/userRepo.ts#UserRepo.findByEmail"]) {
    const s = idx.symbols[id];
    lock.symbols[id] = { task: "T-1", impl: s.tags.impl, signature: s.signature, intent: s.intent, todos: s.todos, sigHash: s.sigHash, intentHash: s.intentHash, todoHash: s.todoHash, approvedAt: "x", approvedBy: "human" };
  }
  const t = Object.values(idx.symbols).find((s) => s.kind === "test");
  lock.tests[t.id] = { task: "T-1", covers: t.test.coversResolved, ac: t.tags.ac, kind: "example", stage: testStage, bodyHash: t.bodyHash, intentHash: t.intentHash, origin: "skeleton", lockedAt: "x", lockedBy: "human" };
  await writeJsonAtomic(paths(root).lock, lock);
}
const codes = (d) => d.items.map((i) => `${i.level}:${i.code}:${i.symbol?.split("#")[1] ?? i.file}`).sort();

test("clean locked project: only ORPHAN warn for untagged save", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  await lockAll(root, "stub");
  const d = await computeDrift(root, {});
  assert.equal(d.schema, "hitl.drift/1");
  assert.deepEqual(codes(d).filter((c) => !c.includes("STATUS_")), ["warn:ORPHAN:UserRepo.save"]);
});

test("signature + intent change on locked symbol reports callers", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  await lockAll(root);
  write(root, "src/services/userService.ts", SVC.replace("createUser(email: string)", "createUser(email: string, role: string)").replace("Registers a user.", "Registers any user."));
  const r = await updateIndex(root, ["src/services/userService.ts"]);
  const sig = r.drift.items.find((i) => i.code === "SIG_CHANGED");
  assert.deepEqual(sig.affected, ["src/http/authController.ts#register"]);
  assert.equal(sig.approved.signature, "createUser(email: string): User");
  assert.match(sig.message, /affected callers: register/);
  assert.ok(r.drift.items.some((i) => i.code === "INTENT_CHANGED"));
  const d = await computeDrift(root, { task: "T-1" });
  assert.ok(d.summary.warn >= 2);
});

test("deleting a locked, referenced symbol blocks; test edits/skip warn", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  await lockAll(root);
  write(root, "src/repo/userRepo.ts", REPO.replace(/\/\*\*\n {3}\* Finds[\s\S]*?\n {2}\}\n/, ""));
  write(root, "tests/userService.test.ts", TESTS.replace("it.todo(", "it.skip("));
  await updateIndex(root, null, { changedOnly: true });
  const d = await computeDrift(root, {});
  const c = codes(d);
  assert.ok(c.includes("block:DELETED_REFERENCED:UserRepo.findByEmail"), c.join(" "));
  assert.ok(c.includes("warn:DELETED_LOCKED:UserRepo.findByEmail"));
  assert.ok(c.includes("warn:TEST_SKIPPED:UserService.createUser > T-1.AC1 rejects duplicate email"));
  assert.ok(c.some((x) => x.startsWith("warn:UNRESOLVED_CALLS_TAG")));
});

test("implemented body: undeclared/missing calls are info", async () => {
  const root = makeProject();
  write(root, "src/services/userService.ts", SVC.replace('    // TODO(impl): 1. reject duplicates\n    throw new Error("TODO(impl): UserService.createUser");', "    // 1. reject duplicates\n    return this.repo.save({ id: '1', email });"));
  await updateIndex(root, null, { full: true });
  const d = await computeDrift(root, { files: ["src/services/userService.ts"] });
  assert.ok(codes(d).includes("info:CALLS_MISSING:UserService.createUser"));
  const idx = await readIndex(root);
  assert.deepEqual(idx.symbols["src/services/userService.ts#UserService.createUser"].flowSteps, ["1. reject duplicates"]);
});

const PLAN = "# Users - Planning\n> status: approved\n\n## Requirements\n- R-1 [must] If the email exists, then the system shall reject it.\n\n## Decisions\n| id | decision | why | cost if wrong | serves | status |\n|---|---|---|---|---|---|\n| D-1 | Duplicate check in createUser | one entry | dupes | R-1 | accepted |\n";

test("spec:true attaches planning links to SIG_CHANGED; without spec no field (hook path)", async () => {
  const root = makeProject({ ".hitl/planning/feat-users.md": PLAN });
  const { readFileSync } = await import("node:fs");
  const tf = `${root}/.hitl/tasks/feat-users.md`;
  write(root, ".hitl/tasks/feat-users.md", readFileSync(tf, "utf8").replace("T-1.AC1 Given", "T-1.AC1 (R-1) Given"));
  write(root, "src/services/userService.ts", SVC.replace("@task T-1 @impl agent @status skeleton @prio 1", "@task T-1 @impl agent @status skeleton @prio 1\n   * @dec D-1"));
  await updateIndex(root, null, { full: true });
  await lockAll(root);
  write(root, "src/services/userService.ts", SVC.replace("createUser(email: string)", "createUser(email: string, role: string)").replace("@prio 1", "@prio 1\n   * @dec D-1"));
  const r = await updateIndex(root, ["src/services/userService.ts"]);
  assert.ok(r.drift.items.every((i) => !("spec" in i)), "hook/index path has no spec");
  const d = await computeDrift(root, { spec: true });
  const sig = d.items.find((i) => i.code === "SIG_CHANGED");
  assert.equal(sig.spec.planning, ".hitl/planning/feat-users.md");
  assert.deepEqual(sig.spec.decisions, [{ id: "D-1", text: "Duplicate check in createUser", status: "accepted", via: "@dec" }]);
  assert.deepEqual(sig.spec.requirements.map((x) => [x.id, x.via]), [["R-1", "T-1.AC1"]]);
  assert.ok(!("spec" in (await computeDrift(root, {})).items.find((i) => i.code === "SIG_CHANGED")));
});
