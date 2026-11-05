// `hitl-index strip`: bookkeeping tags removed from done tasks only; lock, drift and statuses unchanged.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
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
  const doc = ["/**", " * Registers a user.", " * @task QT-T1 @impl agent @status done @prio 1", " * @dec D-2", " * @calls A.b @concurrency none", " */", "fn() {}"].join("\n");
  const r = stripDocTags(doc, span(doc, 1, 6), { dropBlock: true });
  assert.deepEqual(r.removed.sort(), ["dec", "impl", "prio", "status", "task"]);
  assert.equal(r.text, ["/**", " * Registers a user.", " * @calls A.b @concurrency none", " */", "fn() {}"].join("\n"));
  const mixed = ["/**", " * @task QT-T1 @calls A.b", " */"].join("\n");
  assert.equal(stripDocTags(mixed, span(mixed, 1, 3)).text, ["/**", " * @calls A.b", " */"].join("\n"));
});

test("stripDocTags: a doc left with only delimiters goes away (JSDoc), stays for Python docstrings", () => {
  const ts = ["  /**", "   * @task QT-T1 @impl manual @status done", "   */", "  save() {}"].join("\n");
  assert.equal(stripDocTags(ts, span(ts, 1, 3), { dropBlock: true }).text, "  save() {}");
  const py = ['    """Find a user.', "", "    @task QT-T1 @impl agent @status done @prio 2", '    """', "    return x"].join("\n");
  const r = stripDocTags(py, span(py, 1, 4));
  assert.equal(r.text, ['    """Find a user.', "", '    """', "    return x"].join("\n"));
});

test("stripDocTags: tags on a delimiter line are skipped, prose with @words is untouched", () => {
  const one = "/** @task QT-T1 @impl agent */\nfn() {}";
  const r = stripDocTags(one, span(one, 1, 1), { dropBlock: true });
  assert.equal(r.text, one);
  assert.match(r.skipped, /delimiters/);
  const prose = ["/**", " * Mentions @task in prose, and @param x.", " */"].join("\n");
  assert.equal(stripDocTags(prose, span(prose, 1, 3)).text, prose);
});

/** A project where QT-T1 is done: implemented bodies, passing fresh run, skeleton + done recorded in the lock. */
async function doneProject({ helper = false, intent = "Registers a user." } = {}) {
  const repo = REPO.replace('throw new Error("TODO(impl): UserRepo.findByEmail");', "return this.users.find((u) => u.email.toLowerCase() === email.toLowerCase());")
    .replace("  save(user: User)", helper ? "  /**\n   * Normalizes an email.\n   * @task QT-T1 @impl agent @status done\n   */\n  norm(e: string): string { return e.toLowerCase(); }\n  save(user: User)" : "  save(user: User)");
  const svc = SVC.replace("Registers a user.", intent).replace('throw new Error("TODO(impl): UserService.createUser");', `if (this.repo.findByEmail(${helper ? "this.repo.norm(email)" : "email"})) throw new Error("duplicate");\n    return this.repo.save({ id: email, email });`);
  const root = makeProject({ "src/repo/userRepo.ts": repo, "src/services/userService.ts": svc, "tests/userService.test.ts": TESTS.replace('it.todo("QT-T1.AC1 rejects duplicate email");', 'it("QT-T1.AC1 rejects duplicate email", () => {});') });
  const config = await loadConfig(root);
  await updateIndex(root, null, { config });
  const index = await readIndex(root); const tasks = await readTasks(root);
  const plan = planApproval({ taskId: "QT-T1", by: "human", force: true, index, lock: emptyLock(), state: emptyState(), config, task: tasks[0], tasks });
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  const lock = plan.lock; const testId = Object.values(index.symbols).find((s) => s.kind === "test").id;
  const syms = Object.values(index.symbols).filter((s) => (s.tags?.task || []).includes("QT-T1") && s.kind !== "test");
  lock.tasks["QT-T1"] = { ...lock.tasks["QT-T1"], testsAt: "x", doneAt: "x", doneBodyHashes: Object.fromEntries(syms.map((s) => [s.id, s.bodyHash])) };
  await writeLock(root, lock);
  await recordRuns(root, buildRunRecords(index, [{ testId, outcome: "pass", message: "" }]));
  return { root, config };
}

const snap = async (root, config) => {
  const index = await readIndex(root);
  const st = computeStatuses(index, await readLock(root), await readState(root), config, await readTasks(root));
  const drift = (await computeDrift(root, { config })).items.filter((i) => !i.code.startsWith("STATUS_TAG")).map((i) => `${i.code} ${i.symbol}`).sort();
  return { status: st.tasks["QT-T1"].status, drift, lock: readFileSync(`${root}/.hitl/index/skeleton.lock.json`, "utf8") };
};

test("strip <T>: done task loses its bookkeeping tags; lock, drift and status unchanged", async () => {
  const { root, config } = await doneProject();
  const before = await snap(root, config);
  assert.equal(before.status, "done");
  const dry = await strip(root, { target: "QT-T1", dryRun: true, config });
  assert.equal(dry.ok, true); assert.equal(dry.symbols.length, 2);
  assert.match(readFileSync(`${root}/src/services/userService.ts`, "utf8"), /@task QT-T1/, "dry run writes nothing");
  const r = await strip(root, { target: "QT-T1", config });
  assert.equal(r.ok, true, r.error); assert.equal(r.verified, true);
  assert.deepEqual(r.files, ["src/repo/userRepo.ts", "src/services/userService.ts"]);
  const svc = readFileSync(`${root}/src/services/userService.ts`, "utf8");
  assert.doesNotMatch(svc, /@task|@impl|@status|@prio/);
  assert.match(svc, /Registers a user\.\n\s*\* @calls UserRepo\.findByEmail, UserRepo\.save/);
  assert.match(readFileSync(`${root}/tests/userService.test.ts`, "utf8"), /@covers UserService\.createUser @ac QT-T1\.AC1/, "tests untouched");
  assert.deepEqual(await snap(root, config), before);
  const again = await strip(root, { target: "QT-T1", config });
  assert.equal(again.ok, true); assert.equal(again.files.length, 0, "idempotent");
});

test("strip keeps ids in intent prose (prose is hashed); INTENT_TASK_REF stays an info on the locked symbol", async () => {
  const doc = ["/**", " * Registers a user (QT-T1, D-2, ACC-R1.S2).", " * @task QT-T1 @impl agent @status done @dec D-2", " */"].join("\n");
  assert.equal(stripDocTags(doc, span(doc, 1, 4)).text, ["/**", " * Registers a user (QT-T1, D-2, ACC-R1.S2).", " */"].join("\n"));
  const { root, config } = await doneProject({ intent: "Registers a user (QT-T1, D-2)." });
  const ref = (d) => d.items.filter((i) => i.code === "INTENT_TASK_REF").map((i) => `${i.level} ${i.symbol.split("#")[1]} ${i.ids.join(",")}`);
  assert.deepEqual(ref(await computeDrift(root, { config })), ["info UserService.createUser QT-T1,D-2"]);
  const r = await strip(root, { target: "QT-T1", config });
  assert.equal(r.ok, true, r.error); assert.equal(r.verified, true);
  const svc = readFileSync(`${root}/src/services/userService.ts`, "utf8");
  assert.match(svc, /Registers a user \(QT-T1, D-2\)\./);
  assert.doesNotMatch(svc, /@task|@impl|@status|@prio/);
  assert.deepEqual(ref(await computeDrift(root, { config })), ["info UserService.createUser QT-T1,D-2"], "still locked: info, not warn");
});

test("strip: refuses tasks that are not done; skips symbols only reachable through @task", async () => {
  const fresh = makeProject(); const cfg = await loadConfig(fresh);
  await updateIndex(fresh, null, { config: cfg });
  const no = await strip(fresh, { target: "QT-T1", config: cfg });
  assert.equal(no.ok, false); assert.match(no.error, /QT-T1 is (todo|skeleton)/);
  assert.match((await strip(fresh, { target: "QT-T99", config: cfg })).error, /no task or change "QT-T99"/);

  const { root, config } = await doneProject({ helper: true });
  const r = await strip(root, { target: "QT-T1", config });
  assert.equal(r.ok, true, r.error);
  assert.deepEqual(r.skipped.map((s) => s.id), ["src/repo/userRepo.ts#UserRepo.norm"]);
  assert.match(r.skipped[0].reason, /not in ### Symbols of QT-T1/);
  assert.match(readFileSync(`${root}/src/repo/userRepo.ts`, "utf8"), /@task QT-T1 @impl agent @status done\n\s*\*\/\n\s*norm/);
});

// Python: nested classes/methods live inside the enclosing class's body; their docstrings are their own intent and must
// not count toward the enclosing class's bodyHash (JSDoc / Lua doc comments already don't: comments are stripped).
const PY_CONSTS = `from enum import StrEnum


class BillingConsts:
    """Billing contract constants.

    @task QT-T1 @impl agent @status done @prio 1
    @dec D-1
    @concurrency none
    """

    # 1. event types
    class EventTypeEnum(StrEnum):
        """Values of the eventType field.

        @task QT-T1 @impl agent @status done
        """

        SETTLEMENT = "settlement"

    class FieldEnum(StrEnum):
        """Field names.

        @task QT-T1 @impl agent @status done
        """

        SEQ = "seq"

        class Inner:
            """Deeper still.

            @task QT-T1 @impl agent
            """

    SCHEMA_ID = "2f6e"

    def label(self) -> str:
        """Human label.

        @task QT-T1 @impl agent @status done
        """
        return "billing"


def build_event(kind: str) -> dict:
    """Builds one event.

    @task QT-T1 @impl agent @status done @prio 2
    """
    return {"kind": kind}
`;
const PY_TEST = `from src.billing_consts import build_event


def test_T1_AC1_builds_event():
    """@covers build_event, BillingConsts.label @ac QT-T1.AC1 @kind example @origin test-author"""
    assert build_event("x") == {"kind": "x"}
`;
const PY_TASKS = TASKS_PY("QT-T1");
function TASKS_PY(T) {
  return `# Billing Tasks
← Planning: .hitl/planning/feat-billing.md
> status: approved

## ${T} Billing contract
- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo

### Acceptance criteria
- [ ] ${T}.AC1 Given a kind When build_event Then an event

### Symbols
1. [ ] \`build_event\` | new | \`src/billing_consts.py\` | impl: agent | builds
2. [ ] \`BillingConsts.label\` | new | \`src/billing_consts.py\` | impl: agent | label
3. [ ] \`BillingConsts\` | new | \`src/billing_consts.py\` | impl: agent | contract
4. [ ] \`BillingConsts.EventTypeEnum\` | new | \`src/billing_consts.py\` | impl: agent | event types
5. [ ] \`BillingConsts.FieldEnum\` | new | \`src/billing_consts.py\` | impl: agent | fields
6. [ ] \`BillingConsts.FieldEnum.Inner\` | new | \`src/billing_consts.py\` | impl: agent | inner

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | build_event | test-author |
`;
}
const NO_TS = { "src/repo/userRepo.ts": "export const a = 1;\n", "src/services/userService.ts": "export const b = 2;\n", "src/http/authController.ts": "export const c = 3;\n", "tests/userService.test.ts": "export {};\n" };
const pyOk = await (await import("../../scripts/lib/adapters/py.mjs")).default.available();

test("py: a nested symbol's docstring (prose or tags) is not part of the enclosing class's bodyHash; its code is", { skip: !pyOk && "python3 unavailable" }, async () => {
  const { parseSources } = await import("../../scripts/lib/indexer.mjs");
  const { DEFAULTS } = await import("../../scripts/lib/config.mjs");
  const hashes = async (content, path = "src/billing_consts.py") => Object.fromEntries((await parseSources("/tmp", [{ path, content }], DEFAULTS))[0].symbols.map((s) => [s.name, s]));
  const a = await hashes(PY_CONSTS);
  const noTags = await hashes(PY_CONSTS.replace(/\n\s*@task QT-T1 @impl agent( @status done)?\n/g, "\n"));
  const prose = await hashes(PY_CONSTS.replace("Values of the eventType field.", "The eventType values.").replace("Human label.", "Label."));
  const code = await hashes(PY_CONSTS.replace('SEQ = "seq"', 'SEQ = "sequence"'));
  for (const b of [noTags, prose]) {
    assert.equal(b.BillingConsts.bodyHash, a.BillingConsts.bodyHash);
    assert.equal(b["BillingConsts.FieldEnum"].bodyHash, a["BillingConsts.FieldEnum"].bodyHash, "Inner's doc is nested two levels down");
  }
  assert.notEqual(prose["BillingConsts.EventTypeEnum"].intentHash, a["BillingConsts.EventTypeEnum"].intentHash, "the doc is still the nested symbol's intent");
  assert.notEqual(code.BillingConsts.bodyHash, a.BillingConsts.bodyHash, "nested code still counts");
  assert.notEqual(code["BillingConsts.FieldEnum"].bodyHash, a["BillingConsts.FieldEnum"].bodyHash);
  // Lua (generic adapter): doc comments of nested code are comments, already outside the enclosing body hash
  const lua = "local M = {}\n--- Outer.\n--- @task QT-T1 @impl agent\nfunction M.outer()\n  --- Inner helper.\n  --- @task QT-T1 @impl agent @status done\n  local function inner() return 1 end\n  return inner()\nend\nreturn M\n";
  const la = await hashes(lua, "m.lua"), lb = await hashes(lua.replace("  --- @task QT-T1 @impl agent @status done\n", ""), "m.lua");
  assert.equal(lb["M.outer"].bodyHash, la["M.outer"].bodyHash);
});

/** Python project where QT-T1 (an outer class with nested enums, a method and a function) is done. */
async function donePyProject() {
  const root = makeProject({ ...NO_TS, ".hitl/tasks/feat-users.md": PY_TASKS, "src/billing_consts.py": PY_CONSTS, "tests/test_billing.py": PY_TEST });
  const config = await loadConfig(root);
  await updateIndex(root, null, { config });
  const index = await readIndex(root); const tasks = await readTasks(root);
  const plan = planApproval({ taskId: "QT-T1", by: "human", force: true, index, lock: emptyLock(), state: emptyState(), config, task: tasks[0], tasks });
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  const lock = plan.lock; const testId = Object.values(index.symbols).find((s) => s.kind === "test").id;
  const syms = Object.values(index.symbols).filter((s) => (s.tags?.task || []).includes("QT-T1") && ["function", "method"].includes(s.kind));
  lock.tasks["QT-T1"] = { ...lock.tasks["QT-T1"], testsAt: "x", doneAt: "x", doneBodyHashes: Object.fromEntries(syms.map((s) => [s.id, s.bodyHash])) };
  await writeLock(root, lock);
  await recordRuns(root, buildRunRecords(index, [{ testId, outcome: "pass", message: "" }]));
  return { root, config };
}

test("strip <T> on Python nested classes: tags leave every docstring, the enclosing class's hashes stay, verified", { skip: !pyOk && "python3 unavailable" }, async () => {
  const { root, config } = await donePyProject();
  const before = await snap(root, config);
  assert.equal(before.status, "done");
  const idx0 = await readIndex(root);
  const r = await strip(root, { target: "QT-T1", config });
  assert.equal(r.ok, true, r.error); assert.equal(r.verified, true);
  assert.deepEqual(r.symbols.map((s) => s.id.split("#")[1]).sort(),
    ["BillingConsts", "BillingConsts.EventTypeEnum", "BillingConsts.FieldEnum", "BillingConsts.FieldEnum.Inner", "BillingConsts.label", "build_event"]);
  const src = readFileSync(`${root}/src/billing_consts.py`, "utf8");
  assert.doesNotMatch(src, /@task|@impl|@status|@prio|@dec/);
  assert.match(src, /Billing contract constants\.\n\n\s*@concurrency none\n\s*"""/);
  const idx1 = await readIndex(root);
  for (const id of Object.keys(idx0.symbols)) for (const k of ["sigHash", "intentHash", "bodyHash"]) assert.equal(idx1.symbols[id]?.[k], idx0.symbols[id][k], `${id} ${k}`);
  const after = await snap(root, config);
  const noTagDrift = (d) => d.filter((x) => !x.startsWith("STATUS_")); // the nested enums' stale @status tags are gone
  assert.deepEqual({ ...after, drift: noTagDrift(after.drift) }, { ...before, drift: noTagDrift(before.drift) });
});

test("strip T-a,T-b: a comma list strips each listed task; an unknown id in the list is an error", async () => {
  const { root, config } = await doneProject();
  const bad = await strip(root, { target: "QT-T1,QT-T99", config });
  assert.equal(bad.ok, false); assert.match(bad.error, /no task or change "QT-T99"/);
  assert.match(readFileSync(`${root}/src/services/userService.ts`, "utf8"), /@task QT-T1/, "nothing written on error");
  const r = await strip(root, { target: "QT-T1, QT-T1", config });
  assert.equal(r.ok, true, r.error); assert.deepEqual(r.tasks, ["QT-T1"], "a task named twice is stripped once");
  assert.equal(r.symbols.length, 2);
});

test("strip <change>: an archived change strips cleanly (verified) while its symbols have body drift; its task stays done", async () => {
  const { root, config } = await doneProject();
  // archive: the tasks file moves under .hitl/archive/<date>-<id>/ (the lock's file still points at the old path)
  const text = readFileSync(`${root}/.hitl/tasks/feat-users.md`, "utf8").replace("← Planning: .hitl/planning/feat-users.md", "← Change: feat-users");
  write(root, ".hitl/archive/2026-11-01-feat-users/tasks.md", text); rmSync(`${root}/.hitl/tasks/feat-users.md`);
  const svc = `${root}/src/services/userService.ts`;
  writeFileSync(svc, readFileSync(svc, "utf8").replace('throw new Error("duplicate")', 'throw new Error("dup")')); // a later edit
  await updateIndex(root, null, { config });
  const before = await snap(root, config);
  assert.equal(before.status, "done", "archived: frozen history");
  assert.ok(before.drift.some((d) => d.startsWith("ARCHIVED_BODY_CHANGED") && d.includes("createUser")), before.drift.join("\n"));
  const r = await strip(root, { target: "feat-users", config });
  assert.equal(r.ok, true, r.error); assert.equal(r.verified, true);
  assert.doesNotMatch(readFileSync(svc, "utf8"), /@task QT-T1/);
  const after = await snap(root, config);
  assert.deepEqual([after.status, after.drift, after.lock], [before.status, before.drift, before.lock]);
});
