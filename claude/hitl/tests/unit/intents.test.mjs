// `hitl-index intents`: read-only intent hygiene report (ids in prose, restated collaborator rules, growth, pseudo-code steps).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tokens, jaccard, sentences, pseudoReason, stepFindings, intents, DEFAULT_RESTATE_OVERLAP } from "../../scripts/lib/intents.mjs";
import { run as intentsCmd } from "../../scripts/cmd/intents.mjs";
import { makeProject } from "./_project.mjs";
import { loadConfig } from "../../scripts/lib/config.mjs";
import { updateIndex, readIndex } from "../../scripts/lib/indexer.mjs";
import { readTasks } from "../../scripts/lib/tasksmd.mjs";
import { planApproval, emptyLock, writeLock } from "../../scripts/lib/lock.mjs";
import { emptyState } from "../../scripts/lib/state.mjs";

test("tokens / jaccard / sentences: stopwords, plurals and ids dropped; annotation lines are not prose", () => {
  assert.deepEqual([...tokens("The stored final charges stay (T-5, D-7, BILL-R7.S1).")], ["stored", "final", "charge", "stay"]);
  assert.equal(jaccard(tokens("stored final charge stays"), tokens("final charge stays stored")), 1);
  assert.equal(jaccard(new Set(), tokens("x y")), 0);
  assert.deepEqual(sentences("Settles one tx. Every check runs first;\nthen writes.\n@param x the tx\n@return SettleResult"),
    ["Settles one tx.", "Every check runs first; then writes."]);
  assert.deepEqual(sentences("SUCCESS: settled. NO_RES: no reservation; Python logs."), ["SUCCESS: settled.", "NO_RES: no reservation;", "Python logs."]);
});

test("pseudoReason: assignment, comparison, call syntax, > 10 words; intent labels pass", () => {
  assert.equal(pseudoReason("x = load(key)"), "assignment");
  assert.equal(pseudoReason("stop when final ~= reserved"), "comparison");
  assert.equal(pseudoReason("self.client.register_script(script)"), "call syntax");
  // only the label counts: a bracketed reason after it is allowed
  assert.equal(pseudoReason("validate billing stream key type (before any write: a script error does not roll back)"), null);
  assert.equal(pseudoReason("decode reservation (unreadable -> INCONSISTENT, see [x == y])"), null);
  assert.equal(pseudoReason("read the marker and then compare the stored usage hash with the new one"), "14 words");
  assert.equal(pseudoReason("set total = total - refund (refund lease)"), "assignment");
  for (const ok of ["parse args", "validate stream key type (before any write: no rollback)", "decode marker (unreadable -> INCONSISTENT)", "return early when already settled"])
    assert.equal(pseudoReason(ok), null, ok);
});

test("stepFindings: every numbered comment in a class body is dead; function bodies report only pseudo-code; docs and nested symbols skipped", () => {
  const lines = ["class E:", '    """1. not a comment"""', "    # 1. A = 'a'", "    A = 'a'", "    # note", "    def m(self):", "        # 1. x = y", "        return 1"];
  const cls = { kind: "class", span: { start: 1, end: 8 }, docSpan: { start: 2, end: 2 } };
  assert.deepEqual(stepFindings(cls, lines, [{ start: 6, end: 8 }]).map((s) => [s.line, s.text]), [[3, "1. A = 'a'"]]);
  const fn = { kind: "method", span: { start: 6, end: 8 } };
  assert.deepEqual(stepFindings(fn, lines).map((s) => [s.line, s.why]), [[7, "assignment"]]);
  assert.deepEqual(stepFindings({ kind: "function", span: { start: 1, end: 2 } }, ["-- 1. parse args", "-- 2. return result"]), []);
});

const SRC = `/**
 * Status values of a settle.
 * ALREADY_SETTLED: settled before with the same usage hash; nothing written.
 * MISMATCH: settled before with another usage hash; the stored final charge stays (T-5, D-7).
 * @task T-1 @impl agent @status skeleton @prio 1
 */
export class SettleStatus {
  // 1. ALREADY_SETTLED = "alreadySettled"
  static ALREADY_SETTLED = "alreadySettled";
  static MISMATCH = "mismatch";
}

/**
 * Reads the settled marker; writes nothing.
 * Marker with another usage hash returns MISMATCH and keeps the stored final charge.
 * @task T-1 @impl agent @status skeleton @prio 2
 */
export function checkSettled(m: string): string {
  // 1. read marker
  return m;
}

/**
 * Settles one transaction.
 * Settled before with another usage hash: the stored final charge stays, MISMATCH (D-7).
 * @task T-1 @impl agent @status skeleton @prio 3
 * @calls checkSettled
 */
export function settle(m: string): string {
  // 1. x = checkSettled(m)
  const x = checkSettled(m);
  // 2. return the answer
  return x;
}

/**
 * Formats an amount as a decimal string.
 * @task T-2 @impl agent @status skeleton @prio 1
 */
export function fmt(n: number): string {
  // 1. format amount
  return String(n);
}
`;
const TASKS_MD = `# Settle Tasks
← Change: feat-s
> status: approved

## T-1 Settle
- prio: P1 | risk: high (money) | impl: agent | blocked-by: none | status: todo

### Acceptance criteria
- [ ] T-1.AC1 Given a settled tx When settle Then the stored charge stays

### Symbols
1. [ ] \`SettleStatus\` | new | \`src/settle.ts\` | impl: agent | statuses
2. [ ] \`checkSettled\` | new | \`src/settle.ts\` | impl: agent | check
3. [ ] \`settle\` | new | \`src/settle.ts\` | impl: agent | settle

## T-2 Format
- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo

### Acceptance criteria
- [ ] T-2.AC1 Given 5 When fmt Then "5"

### Symbols
1. [ ] \`fmt\` | new | \`src/settle.ts\` | impl: agent | format
`;

function walk(dir, out = {}) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out[p] = `${statSync(p).mtimeMs}:${readFileSync(p, "utf8").length}`;
  }
  return out;
}

async function settleProject() {
  const root = makeProject({ "src/settle.ts": SRC, ".hitl/changes/feat-s/tasks.md": TASKS_MD });
  const config = await loadConfig(root);
  await updateIndex(root, null, { config });
  const index = await readIndex(root); const tasks = await readTasks(root);
  const t1 = tasks.find((t) => t.id === "T-1");
  const plan = planApproval({ taskId: "T-1", by: "human", force: true, index, lock: emptyLock(), state: emptyState(), config, task: t1, tasks });
  assert.equal(plan.ok, true, plan.reasons.join("; "));
  const id = Object.keys(index.symbols).find((k) => k.endsWith("#settle"));
  plan.lock.symbols[id].tasks = ["T-0", "T-1"];
  plan.lock.symbols[id].intentLog = [{ task: "T-0", stage: "skeleton", lines: 1, at: "a" }, { task: "T-1", stage: "skeleton", lines: 2, at: "b" }];
  delete plan.lock.symbols[Object.keys(index.symbols).find((k) => k.endsWith("#SettleStatus"))].intentLog; // locked before intentLog existed
  await writeLock(root, plan.lock);
  return { root, config };
}

test("intents <change>: ids, restates (callee and enum term), growth and steps, ranked; writes nothing", async () => {
  const { root, config } = await settleProject();
  const before = walk(join(root, ".hitl")); const src = walk(join(root, "src"));
  const r = await intents(root, { target: "feat-s", config });
  assert.equal(r.ok, true, r.error);
  assert.equal(r.overlap, DEFAULT_RESTATE_OVERLAP);
  assert.deepEqual(r.tasks, ["T-1", "T-2"]);
  const by = Object.fromEntries(r.symbols.map((s) => [s.name, s]));
  assert.deepEqual(Object.keys(by).sort(), ["SettleStatus", "checkSettled", "settle"], "fmt is clean, not listed");
  assert.equal(r.symbols[0].name, "settle", "most signals first");
  const s = by.settle;
  assert.deepEqual(s.ids, ["D-7"]);
  const names = s.restates.map((x) => x.collaboratorName).sort();
  assert.deepEqual(names, ["SettleStatus", "checkSettled"]);
  assert.ok(s.restates.every((x) => x.sentence.startsWith("Settled before with another usage hash")));
  assert.equal(s.restates.find((x) => x.collaboratorName === "SettleStatus").term, "MISMATCH", "linked through the term the enum defines");
  assert.deepEqual({ tasks: s.growth.tasks, first: s.growth.linesFirst, now: s.growth.linesNow }, { tasks: 2, first: 1, now: 2 });
  assert.deepEqual(s.growth.taskIds, ["T-0", "T-1"]);
  assert.deepEqual(s.steps.map((x) => [x.text, x.why]), [["1. x = checkSettled(m)", "assignment"]]);
  assert.deepEqual(by.SettleStatus.ids, ["T-5", "D-7"]);
  assert.deepEqual(by.SettleStatus.steps.map((x) => x.text), ['1. ALREADY_SETTLED = "alreadySettled"']);
  assert.equal(by.SettleStatus.growth.linesFirst, null, "no intentLog: lines now only");
  assert.equal(by.checkSettled.ids.length, 0);
  assert.deepEqual(walk(join(root, ".hitl")), before, "read-only: nothing under .hitl changed");
  assert.deepEqual(walk(join(root, "src")), src);
  // intent.restateOverlap is configurable: a strict threshold keeps only the enum-term restate (half the threshold + shared words)
  const strict = await intents(root, { target: "feat-s", config: { ...config, intent: { ...config.intent, restateOverlap: 0.95 } } });
  assert.equal(strict.overlap, 0.95);
  assert.deepEqual(strict.symbols.find((x) => x.name === "settle").restates.map((x) => x.collaboratorName), ["SettleStatus"]);
});

test("intents CLI: T-id scope, ✅ when tidy, exit 1 for an unknown target", async () => {
  const { root, config } = await settleProject();
  const cli = async (args, json = false) => {
    const log = console.log, err = console.error; const out = [];
    console.log = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" "));
    try { return { code: await intentsCmd(args, { root, config, json }), out: out.join("\n") }; } finally { console.log = log; console.error = err; }
  };
  let r = await cli(["T-2"]);
  assert.equal(r.code, 0); assert.match(r.out, /^✅ intents tidy: T-2/);
  r = await cli(["feat-s"]);
  assert.equal(r.code, 0); assert.match(r.out, /RESTATES checkSettled/); assert.match(r.out, /ids: T-5, D-7/); assert.match(r.out, /lines 1 → 2/);
  r = await cli(["T-1"], true);
  assert.equal(JSON.parse(r.out).schema, "hitl.intents/1");
  r = await cli(["feat-nope"]);
  assert.equal(r.code, 1); assert.match(r.out, /no change "feat-nope"/);
  assert.equal((await cli([])).code, 2);
});
