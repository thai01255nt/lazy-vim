// `hitl-index strip`: bookkeeping tags removed from done tasks only; lock, drift and statuses unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripDocTags, strip } from "../../scripts/lib/strip.mjs";
import { makeProject, write, REPO, SVC, TESTS } from "./_project.mjs";
import { loadConfig } from "../../scripts/lib/config.mjs";
import { updateIndex, readIndex } from "../../scripts/lib/indexer.mjs";
import { readTasks } from "../../scripts/lib/tasksmd.mjs";
import { planApproval, emptyLock, writeLock, readLock } from "../../scripts/lib/lock.mjs";
import { emptyState, recordRuns, readState } from "../../scripts/lib/state.mjs";
import { buildRunRecords } from "../../scripts/lib/runner.mjs";
import { computeStatuses } from "../../scripts/lib/status.mjs";
import { computeDrift } from "../../scripts/lib/drift.mjs";

const span = (text, from, to) => ({ start: from, end: to ?? text.split("\n").length });

test("stripDocTags: drops bookkeeping tags, keeps @calls/@concurrency and prose", () => {
  const doc = ["/**", " * Registers a user.", " * @task T-1 @impl agent @status done @prio 1", " * @dec D-2", " * @calls A.b @concurrency none", " */", "fn() {}"].join("\n");
  const r = stripDocTags(doc, span(doc, 1, 6), { dropBlock: true });
  assert.deepEqual(r.removed.sort(), ["dec", "impl", "prio", "status", "task"]);
  assert.equal(r.text, ["/**", " * Registers a user.", " * @calls A.b @concurrency none", " */", "fn() {}"].join("\n"));
  const mixed = ["/**", " * @task T-1 @calls A.b", " */"].join("\n");
  assert.equal(stripDocTags(mixed, span(mixed, 1, 3)).text, ["/**", " * @calls A.b", " */"].join("\n"));
});

test("stripDocTags: a doc left with only delimiters goes away (JSDoc), stays for Python docstrings", () => {
  const ts = ["  /**", "   * @task T-1 @impl manual @status done", "   */", "  save() {}"].join("\n");
  assert.equal(stripDocTags(ts, span(ts, 1, 3), { dropBlock: true }).text, "  save() {}");
  const py = ['    """Find a user.', "", "    @task T-1 @impl agent @status done @prio 2", '    """', "    return x"].join("\n");
  const r = stripDocTags(py, span(py, 1, 4));
  assert.equal(r.text, ['    """Find a user.', "", '    """', "    return x"].join("\n"));
});

test("stripDocTags: tags on a delimiter line are skipped, prose with @words is untouched", () => {
  const one = "/** @task T-1 @impl agent */\nfn() {}";
  const r = stripDocTags(one, span(one, 1, 1), { dropBlock: true });
  assert.equal(r.text, one);
  assert.match(r.skipped, /delimiters/);
  const prose = ["/**", " * Mentions @task in prose, and @param x.", " */"].join("\n");
  assert.equal(stripDocTags(prose, span(prose, 1, 3)).text, prose);
});

/** A project where T-1 is done: implemented bodies, passing fresh run, skeleton + done recorded in the lock. */
async function doneProject({ helper = false } = {}) {
  const repo = REPO.replace('throw new Error("TODO(impl): UserRepo.findByEmail");', "return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());")
    .replace("  save(user: User)", helper ? "  /**\n   * Normalizes an email.\n   * @task T-1 @impl agent @status done\n   */\n  norm(e: string): string { return e.toLowerCase(); }\n  save(user: User)" : "  save(user: User)");
  const svc = SVC.replace('throw new Error("TODO(impl): UserService.createUser");', `if (this.repo.findByEmail(${helper ? "this.repo.norm(email)" : "email"})) throw new Error("duplicate");\n    return this.repo.save({ id: email, email });`);
  const root = makeProject({ "src/repo/userRepo.ts": repo, "src/services/userService.ts": svc, "tests/userService.test.ts": TESTS.replace('it.todo("T-1.AC1 rejects duplicate email");', 'it("T-1.AC1 rejects duplicate email", () => {});') });
  const config = await loadConfig(root);
  await updateIndex(root, null, { config });
  const index = await readIndex(root); const tasks = await readTasks(root);
  const plan = planApproval({ taskId: "T-1", by: "human", force: true, index, lock: emptyLock(), state: emptyState(), config, task: tasks[0], tasks });
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  const lock = plan.lock; const testId = Object.values(index.symbols).find((s) => s.kind === "test").id;
  const syms = Object.values(index.symbols).filter((s) => (s.tags?.task || []).includes("T-1") && s.kind !== "test");
  lock.tasks["T-1"] = { ...lock.tasks["T-1"], testsAt: "x", doneAt: "x", doneBodyHashes: Object.fromEntries(syms.map((s) => [s.id, s.bodyHash])) };
  await writeLock(root, lock);
  await recordRuns(root, buildRunRecords(index, [{ testId, outcome: "pass", message: "" }]));
  return { root, config };
}

const snap = async (root, config) => {
  const index = await readIndex(root);
  const st = computeStatuses(index, await readLock(root), await readState(root), config, await readTasks(root));
  const drift = (await computeDrift(root, { config })).items.filter((i) => !i.code.startsWith("STATUS_TAG")).map((i) => `${i.code} ${i.symbol}`).sort();
  return { status: st.tasks["T-1"].status, drift, lock: readFileSync(`${root}/.hitl/index/skeleton.lock.json`, "utf8") };
};

test("strip <T>: done task loses its bookkeeping tags; lock, drift and status unchanged", async () => {
  const { root, config } = await doneProject();
  const before = await snap(root, config);
  assert.equal(before.status, "done");
  const dry = await strip(root, { target: "T-1", dryRun: true, config });
  assert.equal(dry.ok, true); assert.equal(dry.symbols.length, 2);
  assert.match(readFileSync(`${root}/src/services/userService.ts`, "utf8"), /@task T-1/, "dry run writes nothing");
  const r = await strip(root, { target: "T-1", config });
  assert.equal(r.ok, true, r.error); assert.equal(r.verified, true);
  assert.deepEqual(r.files, ["src/repo/userRepo.ts", "src/services/userService.ts"]);
  const svc = readFileSync(`${root}/src/services/userService.ts`, "utf8");
  assert.doesNotMatch(svc, /@task|@impl|@status|@prio/);
  assert.match(svc, /Registers a user\.\n\s*\* @calls UserRepo\.findByEmail, UserRepo\.save/);
  assert.match(readFileSync(`${root}/tests/userService.test.ts`, "utf8"), /@covers UserService\.createUser @ac T-1\.AC1/, "tests untouched");
  assert.deepEqual(await snap(root, config), before);
  const again = await strip(root, { target: "T-1", config });
  assert.equal(again.ok, true); assert.equal(again.files.length, 0, "idempotent");
});

test("strip: refuses tasks that are not done; skips symbols only reachable through @task", async () => {
  const fresh = makeProject(); const cfg = await loadConfig(fresh);
  await updateIndex(fresh, null, { config: cfg });
  const no = await strip(fresh, { target: "T-1", config: cfg });
  assert.equal(no.ok, false); assert.match(no.error, /T-1 is (todo|skeleton)/);
  assert.match((await strip(fresh, { target: "T-99", config: cfg })).error, /no task or change "T-99"/);

  const { root, config } = await doneProject({ helper: true });
  const r = await strip(root, { target: "T-1", config });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.skipped.map((s) => s.id), ["src/repo/userRepo.ts#UserRepo.norm"]);
  assert.match(r.skipped[0].reason, /not in ### Symbols of T-1/);
  assert.match(readFileSync(`${root}/src/repo/userRepo.ts`, "utf8"), /@task T-1 @impl agent @status done\n\s*\*\/\n\s*norm/);
});
