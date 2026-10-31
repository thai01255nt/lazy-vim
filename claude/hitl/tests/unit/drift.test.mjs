import { test } from "node:test";
import assert from "node:assert/strict";
import { makeProject, write, SVC, REPO, TESTS } from "./_project.mjs";
import { updateIndex, readIndex, computeDrift, writeJsonAtomic, paths } from "../../scripts/lib/api.mjs";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { planApproval, readLock, writeLock } from "../../scripts/lib/lock.mjs";
import { readTasks } from "../../scripts/lib/tasksmd.mjs";

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

test("approve skeleton prunes a deleted locked symbol: --dry-run reports it without writing; after the write drift is clean", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  await lockAll(root);
  const lp = paths(root).lock;
  const lock = JSON.parse(readFileSync(lp, "utf8"));
  const GONE = "src/old/legacy.ts#Legacy.removedHelper";
  lock.symbols[GONE] = { ...lock.symbols["src/repo/userRepo.ts#UserRepo.findByEmail"], sigHash: "gone-sig", intentHash: "gone-int" };
  await writeJsonAtomic(lp, lock);
  assert.ok(codes(await computeDrift(root, {})).includes("warn:DELETED_LOCKED:Legacy.removedHelper"));
  const before = readFileSync(lp, "utf8");
  const cli = fileURLToPath(new URL("../../scripts/hitl-index.mjs", import.meta.url));
  const res = spawnSync(process.execPath, [cli, "approve", "T-1", "--stage", "skeleton", "--by", "human", "--dry-run", "--json", "--root", root], { encoding: "utf8" });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  const out = JSON.parse(res.stdout);
  assert.deepEqual(out.changes.symbols.removed, [GONE]);
  assert.deepEqual(out.changes.tests.removed, []);
  assert.equal(out.locked.symbols, 2, "locked count excludes the pruned symbol");
  assert.equal(readFileSync(lp, "utf8"), before, "dry run writes nothing");
  const tasks = await readTasks(root);
  const plan = planApproval({ taskId: "T-1", stage: "skeleton", by: "human", index: await readIndex(root), lock: await readLock(root), task: tasks.find((t) => t.id === "T-1"), tasks });
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  await writeLock(root, plan.lock);
  const after = codes(await computeDrift(root, {}));
  assert.ok(!after.some((c) => c.includes("Legacy.removedHelper")), after.join(" "));
});

// ---------------------------------------------------------------- tag-based rename detection (same file, @task, @prio)
const FE_ID = "src/repo/userRepo.ts#UserRepo.findByEmail", LBE = "src/repo/userRepo.ts#UserRepo.lookupByEmail";
async function lockSkeleton(root) {
  const tasks = await readTasks(root);
  const plan = planApproval({ taskId: "T-1", stage: "skeleton", by: "human", index: await readIndex(root), lock: await readLock(root), task: tasks.find((t) => t.id === "T-1"), tasks });
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  return plan;
}
async function renamedProject({ repo = (r) => r, keepCalls = false } = {}) {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const p = await lockSkeleton(root);
  assert.equal(p.lock.symbols[FE_ID].prio, 2, "approve stores @prio");
  await writeLock(root, p.lock);
  write(root, "src/repo/userRepo.ts", repo(REPO.replace("findByEmail(email: string)", "lookupByEmail(email: string)").replace('"TODO(impl): UserRepo.findByEmail"', '"TODO(impl): UserRepo.lookupByEmail"')));
  if (!keepCalls) write(root, "src/services/userService.ts", SVC.replace("@calls UserRepo.findByEmail", "@calls UserRepo.lookupByEmail"));
  await updateIndex(root, null, { full: true });
  return root;
}
const fixTasksRow = (root) => write(root, ".hitl/tasks/feat-users.md", readFileSync(`${root}/.hitl/tasks/feat-users.md`, "utf8").replace("`UserRepo.findByEmail`", "`UserRepo.lookupByEmail`"));

test("rename, unchanged body: RENAMED (not DELETED_LOCKED); approve refuses until the Symbols row is updated, then moves the entry", async () => {
  const root = await renamedProject();
  const d = await computeDrift(root, {});
  const it = d.items.find((i) => i.code === "RENAMED");
  assert.ok(it, codes(d).join(" "));
  assert.equal(it.symbol, FE_ID); assert.deepEqual(it.affected, [LBE]);
  assert.match(it.message, /### Symbols row/);
  assert.ok(!it.changed?.includes("intent") && !it.changed?.includes("todo"));
  assert.ok(!codes(d).some((c) => c.startsWith("warn:DELETED_LOCKED")));
  const tasks = await readTasks(root);
  const refused = planApproval({ taskId: "T-1", stage: "skeleton", by: "human", index: await readIndex(root), lock: await readLock(root), task: tasks.find((t) => t.id === "T-1"), tasks });
  assert.equal(refused.ok, false);
  assert.match(refused.reasons.join("\n"), /UserRepo\.findByEmail was renamed to UserRepo\.lookupByEmail: update its ### Symbols row/);
  fixTasksRow(root);
  const prevAt = (await readLock(root)).symbols[FE_ID].approvedAt;
  const p = await lockSkeleton(root);
  assert.deepEqual(p.changes.symbols.renamed, [{ from: FE_ID, to: LBE }]);
  assert.deepEqual(p.changes.symbols.new, []); assert.deepEqual(p.changes.symbols.removed, []);
  assert.equal(p.lock.symbols[FE_ID], undefined);
  assert.equal(p.lock.symbols[LBE].renamedFrom, FE_ID);
  assert.equal(p.lock.symbols[LBE].impl, "manual");
  assert.notEqual(p.lock.symbols[LBE].approvedAt, prevAt);
  assert.match(p.lock.symbols[LBE].signature, /lookupByEmail/);
  await writeLock(root, p.lock);
  const after = codes(await computeDrift(root, {}));
  assert.ok(!after.some((c) => /RENAMED|DELETED_|findByEmail|lookupByEmail/.test(c)), after.join(" "));
});

test("rename + intent/TODO edit: RENAMED carries approved vs current; approve moves the entry with current hashes", async () => {
  const root = await renamedProject({ repo: (r) => r.replace("Finds a user by email.", "Looks a user up by email.").replace("1. compare lower-cased", "1. compare trimmed, lower-cased") });
  const it = (await computeDrift(root, {})).items.find((i) => i.code === "RENAMED");
  assert.ok(it);
  assert.ok(it.changed.includes("intent") && it.changed.includes("todo"), it.changed.join());
  assert.match(it.approved.intent, /Finds a user/); assert.match(it.current.intent, /Looks a user up/);
  fixTasksRow(root);
  const p = await lockSkeleton(root);
  assert.deepEqual(p.changes.symbols.renamed, [{ from: FE_ID, to: LBE }]);
  const idx = await readIndex(root);
  assert.equal(p.lock.symbols[LBE].intentHash, idx.symbols[LBE].intentHash);
  assert.equal(p.lock.symbols[LBE].todoHash, idx.symbols[LBE].todoHash);
});

test("rename ambiguity: two same-file @task/@prio candidates → no RENAMED, fallback delete + add", async () => {
  const twin = "  /**\n   * Finds by email, cached.\n   * @task T-1 @impl manual @status skeleton @prio 2\n   */\n  cachedByEmail(email: string): User | undefined {\n    // TODO(impl): 1. cache\n    throw new Error(\"TODO(impl): UserRepo.cachedByEmail\");\n  }\n  save(";
  const root = await renamedProject({ repo: (r) => r.replace("  save(", twin) });
  const c = codes(await computeDrift(root, {}));
  assert.ok(!c.some((x) => x.includes("RENAMED")), c.join(" "));
  assert.ok(c.includes("warn:DELETED_LOCKED:UserRepo.findByEmail"));
  fixTasksRow(root);
  const p = await lockSkeleton(root);
  assert.deepEqual(p.changes.symbols.renamed, []);
  assert.deepEqual(p.changes.symbols.removed, [FE_ID]);
  assert.deepEqual(p.changes.symbols.new.sort(), ["src/repo/userRepo.ts#UserRepo.cachedByEmail", LBE].sort());
});

test("rename with the old name still referenced (@calls): DELETED_REFERENCED blocks and approve refuses", async () => {
  const root = await renamedProject({ keepCalls: true });
  const d = await computeDrift(root, {});
  assert.ok(codes(d).includes("block:DELETED_REFERENCED:UserRepo.findByEmail"), codes(d).join(" "));
  assert.ok(d.items.some((i) => i.code === "RENAMED"));
  fixTasksRow(root);
  const tasks = await readTasks(root);
  const r = planApproval({ taskId: "T-1", stage: "skeleton", by: "human", force: true, index: await readIndex(root), lock: await readLock(root), task: tasks.find((t) => t.id === "T-1"), tasks });
  assert.equal(r.ok, false);
  assert.match(r.reasons.join("\n"), /findByEmail was renamed to UserRepo\.lookupByEmail but the old name is still referenced by UserService\.createUser/);
  const scoped = planApproval({ taskId: "T-1", stage: "skeleton", by: "human", symbols: ["UserRepo.lookupByEmail"], index: await readIndex(root), lock: await readLock(root), task: tasks.find((t) => t.id === "T-1"), tasks });
  assert.equal(scoped.ok, false, "pair in scope via the new ref");
});

test("rename --dry-run (CLI): reports changes.symbols.renamed without writing; --symbols old ref scopes the pair", async () => {
  const root = await renamedProject();
  fixTasksRow(root);
  const lp = paths(root).lock, before = readFileSync(lp, "utf8");
  const cli = fileURLToPath(new URL("../../scripts/hitl-index.mjs", import.meta.url));
  for (const extra of [[], ["--symbols", "UserRepo.findByEmail"]]) {
    const res = spawnSync(process.execPath, [cli, "approve", "T-1", "--stage", "skeleton", "--by", "human", "--dry-run", "--json", ...extra, "--root", root], { encoding: "utf8" });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    const out = JSON.parse(res.stdout);
    assert.deepEqual(out.changes.symbols.renamed, [{ from: FE_ID, to: LBE }]);
    assert.equal(out.locked.symbols, 2);
  }
  assert.equal(readFileSync(lp, "utf8"), before, "dry run writes nothing");
});
