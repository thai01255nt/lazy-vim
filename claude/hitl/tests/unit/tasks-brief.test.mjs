// 0.21 tasks brief: the /hitl:tasks gate in a brief file (parse, quick resolution, the `*-brief.md` filter, the
// generated task table (0.21.2) with waves, the round snapshot, `tasks approve`, the hook refusal, TASKS_NOT_APPROVED and the
// update hold), plus a dry grade of the tasks-* eval cases.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseBrief, ownYKind, briefSummary, pickBrief, briefNext } from "../../scripts/lib/brief.mjs";
import { isTasksDocName, parseTasksMd, readTaskDocs } from "../../scripts/lib/tasksmd.mjs";
import { canonTask, diffSets, setOf, waves, headerApproved, setHeaderApproved, renderList, putTasksList, testsText, ownerText } from "../../scripts/lib/tasksbrief.mjs";
import { briefLines } from "../../scripts/cmd/status.mjs";
import { gradeRun } from "../../evals/grade.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, "../..");
const CLI = path.join(PLUGIN, "scripts/hitl-index.mjs");
const cli = (cwd, ...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 }); return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) }; };
const project = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-tb-")); fs.cpSync(path.join(PLUGIN, "tests/fixtures/spec-app"), root, { recursive: true }); return root; };
const W = (root, rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
const R = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const PWR = ".hitl/changes/feat-password-reset";

const QUICK = (status = "draft") => `# Fix label typo Tasks

← Change: none | key: QFLT

> status: ${status}

## QFLT-T1 Fix the reset email subject typo

- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo

**Why**: users see "Pasword" in the subject

### Acceptance criteria

- [ ] QFLT-T1.AC1 Given a reset request When the email is sent Then the subject reads "Password reset"
- [ ] QFLT-T1.AC2 Given the subject constant When it is read Then it has no typo

### Test plan

| ac  | test                             | kind    | oracle | seam         | author      |
| --- | -------------------------------- | ------- | ------ | ------------ | ----------- |
| AC1 | new: the subject keeps "Pasword" | example | spec   | resetSubject | test-author |
| AC2 | shared: AC1                      | —       | —      | —            | —           |
`;

/** A tasks brief (0.21.1, the template's shape): the generated list, Needs your eye (only with an override or `eye`),
 *  Notes, Approve? last. */
const BRIEF = ({ head = "> change: feat-password-reset | key: PWR | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21", title = "feat-password-reset", approve = "", override = null, eye = null } = {}) => `# Tasks brief — ${title}

${head}
> next: read the list, change anything in Notes (or edit tasks.md directly), then Y at the end and run /hitl:tasks ${title}

## Tasks (1) — in build order

1. **PWR-T9** not a question — after T8
   P0 · risk low → fast lane · agent · 1 AC, 1 new test
${override || eye ? `
## Needs your eye

${eye ?? ""}${override ? `- Override: ${override} \`none!: the identity provider sets it — no sandbox\`? (needs its own Y)
  PWR-T2 has risk security.
  >${override.answer ? ` ${override.answer}` : ""}
` : ""}` : ""}
## Notes — change risk, order, prio, add/drop/merge tasks

>

## Approve? (needs its own Y)

>${approve ? ` ${approve}` : ""}
`;

/** A 0.21.0 brief (`## Current set`, `### Q<n>` questions, accept-all line): still read and approved. */
const BRIEF_0210 = ({ approve = "", override = null } = {}) => `# Tasks brief — feat-password-reset

> change: feat-password-reset | key: PWR | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21

## Current set

| id | title |
| --- | --- |
| PWR-T9 | not a question |

## Round 1

Accept all recommendations of this round: > Y

### Q1 [Q] Slices: is each task one vertical slice that fits one session (merge or split any)?

_Rec:_ keep as drafted.

>
${override ? `
### Q2 _Override:_ ${override} none!: the identity provider sets it — no sandbox? (needs its own Y)

> Y
` : ""}
### Notes — anything the questions missed, or a change to an earlier answer

>

### Q${override ? 3 : 2} Approve the task set? (Y/n) (needs its own Y)

Approves the set as shown in Current set.

>${approve ? ` ${approve}` : ""}
`;

test("ownYKind: overrides and the approve question need their own Y (0.21.1 and 0.21.0 forms)", () => {
  assert.equal(ownYKind(1, "Override: PWR-T2.AC1 `none!: x`? (needs its own Y)"), "override");
  assert.equal(ownYKind(5, "_Override:_ PWR-T2.AC1 none!: x? (needs its own Y)"), "override");
  assert.equal(ownYKind(1, "Approve? (needs its own Y)"), "approve");
  assert.equal(ownYKind(7, "Approve the task set? (Y/n) (needs its own Y)"), "approve");
  assert.equal(ownYKind(1, "[Q] Slices"), null);
});

test("parseBrief: a 0.21.1 tasks brief (the list is no question; Needs your eye bullets; Notes; Approve? last)", () => {
  const eye = "- PWR-T2 is large: Claude suggests one task.\n- Who writes `resetSubject`, you or the agent?\n  >\n";
  const b = parseBrief(BRIEF({ override: "PWR-T2.AC1", eye }).replace("set: —", "set: 3f9a1c2e0b11"), `${PWR}/tasks-brief.md`);
  assert.equal(b.kind, "tasks"); assert.equal(b.change, "feat-password-reset"); assert.equal(b.set, "3f9a1c2e0b11"); assert.equal(b.quick, null);
  assert.deepEqual(b.questions.map((q) => q.id), ["E2", "Override PWR-T2.AC1", "Approve"], "an info bullet (no > line) and the list are no questions");
  const [ask, ov, ap] = b.questions;
  assert.equal(ask.ownY, null); assert.equal(ov.ownY, "override"); assert.equal(ap.ownY, "approve");
  assert.equal(ov.title, "Override: PWR-T2.AC1 `none!: the identity provider sets it — no sandbox`?");
  assert.ok(b.questions.every((q) => q.round === 1 && !q.tag));
  assert.equal(b.counts.unanswered, 3);
  assert.ok(b.rounds[0].notes, "Notes section"); assert.equal(b.rounds.length, 1); assert.equal(b.rounds[0].acceptAllLine, false);
  const s = briefSummary(b);
  assert.deepEqual(s.approve, { id: "Approve", round: 1, answer: "empty", settled: false });
  assert.equal(s.set, "3f9a1c2e0b11");
  const y = parseBrief(BRIEF({ approve: "Y", override: Object.assign("PWR-T2.AC1", { answer: "Y" }) }), `${PWR}/tasks-brief.md`);
  assert.equal(y.questions.at(-1).kind, "accept"); assert.equal(y.questions[0].kind, "accept");
  assert.equal(y.counts.unanswered, 0);
  // a mark under the override bullet (an earlier round's Y kept)
  const m = parseBrief(BRIEF({ override: Object.assign("PWR-T2.AC1", { answer: "Y\n  → recorded: PWR-T2.AC1 none!" }) }), `${PWR}/tasks-brief.md`);
  assert.deepEqual(m.questions[0].recorded, ["PWR-T2.AC1 none!"]);
  // Needs your eye omitted when empty: no questions besides Approve; an empty heading adds none either
  assert.deepEqual(parseBrief(BRIEF(), `${PWR}/tasks-brief.md`).questions.map((q) => q.id), ["Approve"]);
  assert.deepEqual(parseBrief(BRIEF().replace("## Notes", "## Needs your eye\n\n## Notes"), `${PWR}/tasks-brief.md`).questions.map((q) => q.id), ["Approve"]);
  // a done brief: its round is done, nothing pending
  const d = parseBrief(BRIEF({ approve: "Y\n\n→ approved 2026-11-21" }).replace("status: open", "status: done"), `${PWR}/tasks-brief.md`);
  assert.equal(d.rounds[0].done, true); assert.equal(d.counts.pending, 0); assert.deepEqual(d.questions.at(-1).recorded, ["approved 2026-11-21"]);
});

test("parseBrief: an open 0.21.0 brief is still read (questions, accept-all, override, approve)", () => {
  const b = parseBrief(BRIEF_0210({ override: "PWR-T2.AC1" }), `${PWR}/tasks-brief.md`);
  assert.deepEqual(b.questions.map((q) => q.id), ["Q1", "Q2", "Q3"]);
  assert.deepEqual(b.questions.map((q) => q.ownY), [null, "override", "approve"]);
  assert.ok(b.questions[0].acceptedByRound); assert.equal(b.questions[2].answered, false, "accept-all never answers the approval");
});

test("parseBrief: a quick brief names its slug and key, never a change", () => {
  const b = parseBrief(BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21" }), ".hitl/tasks/quick-fix-label-typo-brief.md");
  assert.equal(b.kind, "tasks"); assert.equal(b.change, null); assert.deepEqual(b.quick, { slug: "fix-label-typo", key: "QFLT" });
  assert.deepEqual(b.questions.map((q) => q.id), ["Approve"]);
  // from the file name alone
  const f = parseBrief("# Tasks brief — quick-fix-label-typo\n\n## Approve? (needs its own Y)\n\n>\n", ".hitl/tasks/quick-fix-label-typo-brief.md");
  assert.equal(f.kind, "tasks"); assert.equal(f.change, null); assert.equal(f.quick.slug, "fix-label-typo"); assert.equal(f.questions[0].ownY, "approve");
});

test("pickBrief / briefNext / briefLines: an open tasks brief in phase tasks and as an update in any phase; quick lines", () => {
  const tb = { kind: "tasks", status: "open" };
  assert.equal(pickBrief("implement", { plan: { kind: "plan", status: "done" }, design: null, tasks: tb }), tb);
  assert.equal(pickBrief("implement", { plan: null, design: null, tasks: tb, amend: { kind: "amend", status: "open" } }).kind, "amend");
  assert.equal(pickBrief("tasks", { plan: null, design: { kind: "design" }, tasks: { kind: "tasks", status: "done" } }).kind, "tasks");
  const sum = { kind: "tasks", file: `${PWR}/tasks-brief.md`, open: true, round: 2, unanswered: 1, pending: 1 };
  assert.equal(briefNext("feat-password-reset", "implement", sum), `answer ${PWR}/tasks-brief.md, then /hitl:tasks feat-password-reset`);
  assert.equal(briefNext("feat-password-reset", "tasks", { ...sum, unanswered: 0 }), "/hitl:tasks feat-password-reset");
  const lines = briefLines([{ id: "feat-password-reset", phase: "implement", brief: sum }],
    [{ id: "QFLT", key: "QFLT", file: ".hitl/tasks/quick-fix-label-typo.md", tasks: "draft", brief: { kind: "tasks", open: true, round: 1, unanswered: 2, file: ".hitl/tasks/quick-fix-label-typo-brief.md" } },
      { id: "QOLD", key: "QOLD", file: ".hitl/tasks/quick-old.md", tasks: "draft", brief: null }]);
  assert.deepEqual(lines, [
    `_Brief:_ feat-password-reset — tasks brief round 2 (update): 1 unanswered → answer ${PWR}/tasks-brief.md, then /hitl:tasks feat-password-reset`,
    "_Brief:_ quick QFLT — tasks brief round 1 (draft): 2 unanswered → answer .hitl/tasks/quick-fix-label-typo-brief.md, then /hitl:tasks QFLT",
    "_Brief:_ quick QOLD — .hitl/tasks/quick-old.md is draft, no tasks brief yet → /hitl:tasks QOLD",
  ]);
});

test("*-brief.md filter: a quick brief is no tasks doc and does not register its key twice; every reader of .hitl/tasks uses the filter", async () => {
  assert.equal(isTasksDocName("quick-fix-label-typo.md"), true);
  assert.equal(isTasksDocName("quick-fix-label-typo-brief.md"), false);
  assert.equal(isTasksDocName(".quick-x-round.json"), false);
  const root = project();
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | status: open | round: 1" }) + "\n← Change: none | key: QFLT\n");
  const docs = await readTaskDocs(root);
  assert.deepEqual(docs.filter((d) => d.file.startsWith(".hitl/tasks/")).map((d) => d.file), [".hitl/tasks/quick-fix-label-typo.md"]);
  const { readKeyRegistry } = await import("../../scripts/lib/keys.mjs");
  assert.equal((await readKeyRegistry(root)).byKey.get("QFLT").length, 1, "the brief's key is not a second owner");
  assert.deepEqual(cli(root, "tasks", "--check", "--json").json().errors.filter((e) => /QFLT|quick-fix/.test(`${e.task} ${e.file} ${e.message}`)), [], "no QUICK_KEY_TAKEN, no error of the quick file");
  // every readdir of the tasks dir in scripts/ filters with isTasksDocName
  for (const f of fs.readdirSync(path.join(PLUGIN, "scripts/lib")).map((n) => `scripts/lib/${n}`).concat(fs.readdirSync(path.join(PLUGIN, "scripts/cmd")).map((n) => `scripts/cmd/${n}`))) {
    if (!f.endsWith(".mjs")) continue;
    for (const l of fs.readFileSync(path.join(PLUGIN, f), "utf8").split("\n").filter((x) => /readdir\((?:P|paths\(root\))\.tasks\b/.test(x)))
      assert.match(l, /isTasksDocName/, `${f}: ${l.trim()}`);
  }
});

test("next-id --quick refuses a slug that ends in -brief (QUICK_SLUG_RESERVED)", () => {
  const root = project();
  const r = cli(root, "--json", "next-id", "--quick", "update-brief");
  assert.equal(r.code, 1); assert.equal(r.json().code, "QUICK_SLUG_RESERVED");
  assert.equal(cli(root, "--json", "next-id", "--quick", "fix-label-typo").code, 0);
});

test("resolution order: a change id, then a quick key, then quick-<slug> (brief, tasks gate)", () => {
  const root = project();
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21" }));
  W(root, `${PWR}/tasks-brief.md`, BRIEF());
  for (const arg of ["QFLT", "quick-fix-label-typo", "quick-fix-label-typo.md"]) {
    const j = cli(root, "brief", arg, "--kind", "tasks", "--json").json();
    assert.equal(j.kind, "tasks", arg); assert.equal(j.change, null); assert.equal(j.quick.key, "QFLT"); assert.equal(j.file, ".hitl/tasks/quick-fix-label-typo-brief.md");
  }
  assert.match(cli(root, "brief", "QFLT").out, /^_Brief:_ quick QFLT — tasks brief round 1 \(open\)/);
  const c = cli(root, "brief", "feat-password-reset", "--kind", "tasks", "--json").json();
  assert.equal(c.change, "feat-password-reset"); assert.equal(c.file, `${PWR}/tasks-brief.md`);
  assert.equal(cli(root, "tasks", "gate", "QFLT", "--json").json().file, ".hitl/tasks/quick-fix-label-typo.md");
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--json").json().file, `${PWR}/tasks.md`);
  const bad = cli(root, "tasks", "gate", "NOPE", "--json");
  assert.equal(bad.code, 1); assert.equal(bad.json().code, "TASKS_TARGET_UNKNOWN");
});

test("waves: depth over blocked-by inside the set; done and out-of-set blockers add nothing", () => {
  const t = (id, b = [], status = "todo") => ({ id, blockedBy: b, status });
  assert.deepEqual(waves([t("A-T1"), t("A-T2", ["A-T1"]), t("A-T3", ["A-T1", "A-T2"]), t("A-T4", ["B-T9"])]), { "A-T1": 1, "A-T2": 2, "A-T3": 3, "A-T4": 1 });
  assert.deepEqual(waves([t("A-T1"), t("A-T2", ["A-T1"])], (id) => id === "A-T1"), { "A-T1": null, "A-T2": 1 });
});

test("the set hash ignores tooling-owned parts and formatting; diffSets names what changed", () => {
  const doc = (x) => parseTasksMd(x, ".hitl/tasks/quick-fix-label-typo.md");
  const a = QUICK(), base = setOf(a, doc(a));
  const same = a.replace("status: todo", "status: wip").replace("- [ ] QFLT-T1.AC1", "- [x] QFLT-T1.AC1").replace('| AC1 | new: the subject keeps "Pasword" | example |', '|AC1|new: the subject keeps "Pasword"|example|')
    .replace("## QFLT-T1 Fix the reset email subject typo\n", "## QFLT-T1 Fix the reset email subject typo\n\n\n").replace("**Why**", "**Dropped**: merged\n\n**Why**");
  assert.equal(setOf(same, doc(same)).set, base.set, "status, boxes, padding, blank lines and the Dropped line are not content");
  const edited = a.replace("impl: agent", "impl: manual").replace("| AC2 | shared: AC1 ", "| AC2 | new: a second typo ").replace("- [ ] QFLT-T1.AC2", "- [ ] QFLT-T1.AC3 Given x When y Then z\n- [ ] QFLT-T1.AC2");
  const lines = diffSets(base.tasks, setOf(edited, doc(edited)).tasks);
  assert.equal(lines.length, 1);
  assert.equal(lines[0], "~ QFLT-T1 impl agent → manual; +AC3; AC2 test: shared: AC1 → new: a second typo");
  assert.deepEqual(diffSets({}, base.tasks), ["+ QFLT-T1 new (Fix the reset email subject typo)"]);
  assert.deepEqual(diffSets(base.tasks, {}), ["- QFLT-T1 removed"]);
  // a masked AC: its test-plan rows are left out
  const masked = canonTask(["### Test plan", "| AC1 | new: x |", "| AC2 | none!: y |"], "QFLT-T1", new Set(["QFLT-T1.AC2"]));
  assert.deepEqual(masked, ["### Test plan", "| AC1 | new: x |"]);
  assert.equal(headerApproved(setHeaderApproved(a)), true);
  assert.equal(headerApproved(a), false);
  assert.match(setHeaderApproved("# T\n← Change: none | key: QX\n\n## QX-T1 a\n"), /← Change: none \| key: QX\n\n> status: approved\n/);
  // 0.21.1 loose hash: prio, risk and blocked-by (and the task order) are cheap late edits; an AC edit is not
  const late = a.replace("prio: P2 | risk: low | impl: agent | blocked-by: none", "prio: P0 | risk: high (security) | impl: agent | blocked-by: PWR-T1");
  const l = setOf(late, doc(late)).tasks["QFLT-T1"];
  assert.notEqual(l.hash, base.tasks["QFLT-T1"].hash); assert.equal(l.loose, base.tasks["QFLT-T1"].loose);
  assert.notEqual(setOf(edited, doc(edited)).tasks["QFLT-T1"].loose, base.tasks["QFLT-T1"].loose);
  assert.deepEqual(diffSets(base.tasks, setOf(late, doc(late)).tasks), ["~ QFLT-T1 prio P2 → P0; risk low → high (security); blocked-by none → PWR-T1"], "still shown in _Changed since_");
});

/** A tasks file with five tasks for the list: build order, after, owners, test summaries, high risk, done, dropped. */
const LIST_MD = `# Raw API Tasks

← Change: feat-brain-raw-api

> status: draft

## FBRA-T5 55 operations

- prio: P2 | risk: low | impl: agent | blocked-by: FBRA-T2 | status: todo

### Acceptance criteria

- [ ] FBRA-T5.AC1 a
- [ ] FBRA-T5.AC2 b

### Test plan

| ac | test | kind | oracle | seam | author |
| --- | --- | --- | --- | --- | --- |
| AC1 | manual: call one | — | — | — | — |
| AC2 | manual: call two | — | — | — | — |

## FBRA-T2 Send a request with the session token

- prio: P0 | risk: high (security) | impl: mixed | blocked-by: FBRA-T1, FEE-T2 | status: todo

**Why**: the token never leaves the session

### Acceptance criteria

- [ ] FBRA-T2.AC1 a
- [ ] FBRA-T2.AC2 b
- [ ] FBRA-T2.AC3 c

### Symbols

1. [ ] \`send\` | new | \`src/a.ts\` | impl: agent | x
2. [ ] \`diffParts\` | new | \`src/a.ts\` | impl: manual | y

### Test plan

| ac | test | kind | oracle | seam | author |
| --- | --- | --- | --- | --- | --- |
| AC1 | new: no token sent | example | spec | send | test-author |
| AC2 | covered: sends json | — | — | — | — |
| AC3 | covered: sends json | — | — | — | — |

## FBRA-T1 Envelope and shared errors

- prio: P0 | risk: low | impl: manual | blocked-by: none | status: todo

**Why**: one envelope for every operation (FBRA-D1)

### Acceptance criteria

- [ ] FBRA-T1.AC1 a
- [ ] FBRA-T1.AC2 b

### Symbols

1. [ ] \`a\` | new | \`src/b.ts\` | impl: manual | x
2. [ ] \`b\` | new | \`src/b.ts\` | impl: manual | x

### Test plan

| ac | test | kind | oracle | seam | author |
| --- | --- | --- | --- | --- | --- |
| AC1 | new: wrong envelope | example | spec | a | test-author |
| AC2 | shared: AC1 | — | — | — | — |

## FBRA-T3 Slack notifier

- prio: P1 | risk: high (concurrency) | impl: mixed | blocked-by: FBRA-T1 | status: todo

### Acceptance criteria

- [ ] FBRA-T3.AC1 a

### Symbols

1. [ ] \`n1\` | new | \`src/c.ts\` | impl: manual | x
2. [ ] \`n2\` | new | \`src/c.ts\` | impl: manual | x
3. [ ] \`n3\` | new | \`src/c.ts\` | impl: manual | x
4. [ ] \`n4\` | new | \`src/c.ts\` | impl: agent | x

### Test plan

| ac | test | kind | oracle | seam | author |
| --- | --- | --- | --- | --- | --- |
| AC1 | none: wiring | — | — | — | — |

## FBRA-T4 Old export

- prio: P3 | risk: low | impl: agent | blocked-by: none | status: dropped

**Dropped**: merged into FBRA-T2

## FBRA-T6 Done earlier

- prio: P1 | risk: low | impl: agent | blocked-by: none | status: done

### Acceptance criteria

- [x] FBRA-T6.AC1 a

### Test plan

| ac | test | kind | oracle | seam | author |
| --- | --- | --- | --- | --- | --- |
| AC1 | new: x | example | spec | a | test-author |
`;

test("renderList: one table row per task in build order (done first, wave, prio, file order; dropped last), after, owner, tests, bold high risk, markers, Why", () => {
  const doc = parseTasksMd(LIST_MD, ".hitl/changes/feat-brain-raw-api/tasks.md");
  const md = renderList({ id: "feat-brain-raw-api" }, doc);
  assert.equal(md, `## Tasks (5 + 1 dropped) — in build order

| #         | Task    | Title                                 | After      | Prio | Risk → lane                              | Owner                 | Tests                  | Why                                        |
| --------- | ------- | ------------------------------------- | ---------- | ---- | ---------------------------------------- | --------------------- | ---------------------- | ------------------------------------------ |
| 1 ✅      | FBRA-T6 | Done earlier                          | —          | P1   | low                                      | agent                 | 1 AC, 1 new            |                                            |
| 2         | FBRA-T1 | Envelope and shared errors            | —          | P0   | low → fast lane                          | you                   | 2 AC, 1 new            | one envelope for every operation (FBRA-D1) |
| 3         | FBRA-T2 | Send a request with the session token | T1, FEE-T2 | P0   | **high** (security) → skeleton review    | you write \`diffParts\` | 3 AC, 1 new, 2 covered | the token never leaves the session         |
| 4         | FBRA-T3 | Slack notifier                        | T1         | P1   | **high** (concurrency) → skeleton review | you write 3 symbols   | 1 AC, none             |                                            |
| 5         | FBRA-T5 | 55 operations                         | T2         | P2   | low → fast lane                          | agent                 | 2 AC, manual           |                                            |
| 6 dropped | FBRA-T4 | Old export                            | —          | P3   | low                                      | agent                 | 0 AC, no test plan     |                                            |`);
  // done from the lock (isDone) counts like status done: it no longer delays its dependants
  const d2 = renderList({ id: "x" }, doc, { isDone: (T) => T === "FBRA-T1" });
  assert.match(d2, /^\| 1 ✅ +\| FBRA-T1 +\| Envelope and shared errors +\| — +\| P0 +\| low +\|/m, "done first, then prio; no lane");
  assert.match(d2, /^\| 3 +\| FBRA-T2 +\|/m);
  assert.equal(testsText({ testPlan: [{ test: "manual", override: true }] }), "manual!");
  assert.equal(testsText({ testPlan: [{ test: "new" }, { test: "new" }, { test: "shared" }] }), "2 new");
  assert.equal(ownerText({ impl: "mixed", symbols: [{ ref: "a", impl: "manual" }, { ref: "b", impl: "manual" }, { ref: "c", impl: "agent" }] }), "you write `a`, `b`");
});

/** One task of a quick file for the table cases. */
const ONE = ({ title = "Fix the subject", meta = "- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo", why = null, id = "QFLT-T1" } = {}) => `## ${id} ${title}

${meta}
${why === null ? "" : `\n${why}\n`}
### Acceptance criteria

- [ ] ${id}.AC1 a

### Test plan

| ac | test | kind | oracle | seam | author |
| --- | --- | --- | --- | --- | --- |
| AC1 | new: x | example | spec | a | test-author |
`;
const quickDoc = (...tasks) => parseTasksMd(`# Q Tasks\n\n← Change: none | key: QFLT\n\n> status: draft\n\n${tasks.join("\n")}`, ".hitl/tasks/quick-x.md");
/** The table rows of a rendered list as cell arrays (header and separator left out; `\|` stays in its cell). */
const tableRows = (md) => md.split("\n").filter((l) => l.startsWith("|")).slice(2).map((l) => l.slice(1, -1).split(/(?<!\\)\|/).map((c) => c.trim()));

test("renderList table: a multi-line Why on one line (never cut, decision ids kept); no Why → empty cell", () => {
  const long = "a reset link is the only way back in when the password is lost, so it must work for every user of every tenant, also the ones that were created before the migration (QFLT-D1, QFLT-D2)";
  const why = `**Why**: a reset link is the only way back in when the password is lost,\nso it must work for every user of every tenant,\n  also the ones that were created before the migration (QFLT-D1, QFLT-D2)`;
  const doc = quickDoc(ONE({ why }), ONE({ id: "QFLT-T2", title: "No why" }));
  assert.equal(doc.tasks[0].why, long, "the parser joins the paragraph");
  assert.deepEqual(doc.tasks[0].decisions, ["QFLT-D1", "QFLT-D2"]);
  const rows = tableRows(renderList({ id: "QFLT" }, doc));
  assert.equal(rows[0][8], long);
  assert.equal(rows[1][8], "", "no Why: empty cell");
  // the Why ends at a blank line or the next block (a heading, a `**Temp**:` line) right under it
  const d2 = quickDoc(ONE({ why: "**Why**: short\n**Temp**: `oldMail` (shim) — old sender" }), ONE({ id: "QFLT-T2", why: "**Why**: shorter" }).replace("shorter\n\n###", "shorter\n###"));
  assert.deepEqual(d2.tasks.map((t) => t.why), ["short", "shorter"]);
  assert.equal(d2.tasks[0].temps[0]?.name, "oldMail");
  assert.equal(d2.tasks[1].acs.length, 1);
});

test("renderList table: a | in a title or Why is escaped (one cell each)", () => {
  const doc = quickDoc(ONE({ title: "Split a | b", why: "**Why**: either `x | y` or z" }));
  const md = renderList({ id: "QFLT" }, doc);
  assert.match(md, /\| Split a \\\| b \|/);
  const rows = tableRows(md);
  assert.equal(rows[0].length, 9);
  assert.equal(rows[0][2], "Split a \\| b");
  assert.equal(rows[0][8], "either `x \\| y` or z");
});

test("renderList table: done and dropped markers in #, cross-change after by full id, unknown risk", () => {
  const doc = quickDoc(
    ONE({ id: "QFLT-T1", meta: "- prio: P1 | risk: low | impl: agent | blocked-by: none | status: done" }),
    ONE({ id: "QFLT-T2", meta: "- prio: P0 | risk: high (security, public-api) | impl: agent | blocked-by: QFLT-T1, FEE-T2 | status: todo" }),
    ONE({ id: "QFLT-T3", meta: "- prio: P0 | risk: low | impl: agent | blocked-by: none | status: dropped" }));
  const rows = tableRows(renderList({ id: "QFLT" }, doc));
  assert.deepEqual(rows.map((r) => r.slice(0, 6)), [
    ["1 ✅", "QFLT-T1", "Fix the subject", "—", "P1", "low"],
    ["2", "QFLT-T2", "Fix the subject", "T1, FEE-T2", "P0", "**high** (security, public-api) → skeleton review"],
    ["3 dropped", "QFLT-T3", "Fix the subject", "—", "P0", "low"],
  ]);
  const unknown = { tasks: [{ id: "QFLT-T9", title: "x", prio: null, risk: null, blockedBy: [], acs: [], testPlan: [], symbols: [] }] };
  assert.deepEqual(tableRows(renderList({ id: "QFLT" }, unknown))[0].slice(4, 6), ["P?", "?"]);
});

const PRETTIER = (() => {
  const onPath = spawnSync("sh", ["-c", "command -v prettier"], { encoding: "utf8" }).stdout.trim();
  const mason = path.join(os.homedir(), ".local/share/nvim/mason/bin/prettier");
  return onPath || (fs.existsSync(mason) ? mason : null);
})();
test("renderList table: prettier-stable (a brief with the table is unchanged by prettier)", { skip: PRETTIER ? false : "prettier not found" }, () => {
  const doc = parseTasksMd(LIST_MD, ".hitl/changes/feat-brain-raw-api/tasks.md");
  const extra = quickDoc(ONE({ title: "Split a | b", why: "**Why**: a long why\nover two lines with `x | y` (QFLT-D1)" }));
  for (const md of [renderList({ id: "x" }, doc), renderList({ id: "QFLT" }, extra)]) {
    const brief = putTasksList(BRIEF(), md, "abc");
    const r = spawnSync(PRETTIER, ["--no-config", "--stdin-filepath", "tasks-brief.md"], { input: brief, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout, brief.endsWith("\n") ? brief : `${brief}\n`);
  }
});

test("tasks gate --md: the table; --write puts it in the brief (before Needs your eye / Notes) with set: and a snapshot", () => {
  const root = project();
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("> status: approved", "> status: draft"));
  const md = cli(root, "tasks", "gate", "feat-password-reset", "--md").out;
  assert.match(md, /^## Tasks \(2\) — in build order$/m);
  assert.match(md, /^\| 1 ✅ \| PWR-T1 \| Send a reset link  \| —     \| P1   \| \*\*high\*\* \(security\) {19}\| mixed \| 2 AC, 2 new \| single-use hashed token \(PWR-D1\) \|$/m);
  assert.match(md, /^\| 2    \| PWR-T2 \| Set a new password \| T1    \| P1   \| \*\*high\*\* \(security\) → skeleton review \| agent \| 1 AC, 1 new \| {34}\|$/m);
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--write", "--json").json().code, "TASKS_BRIEF_MISSING");
  W(root, `${PWR}/tasks-brief.md`, BRIEF().replace(/## Tasks \(1\)[\s\S]*?\n\n(?=## Notes)/, ""));
  const j = cli(root, "tasks", "gate", "feat-password-reset", "--write", "--json").json();
  assert.equal(j.ok, true); assert.equal(j.round, 1); assert.match(j.set, /^[0-9a-f]{12}$/);
  const b = R(root, `${PWR}/tasks-brief.md`);
  assert.match(b, new RegExp(`^> change: feat-password-reset \\| key: PWR \\| kind: tasks \\| set: ${j.set} \\| status: open`, "m"));
  assert.match(b, /run \/hitl:tasks feat-password-reset\n\n## Tasks \(2\) — in build order\n\n\| # +\| Task +\|[^\n]*\n\| -+ \|[^\n]*\n\| 1 ✅ \| PWR-T1 [^\n]*\n\| 2 +\| PWR-T2 [^\n]*\n\n## Notes/, "inserted before Notes");
  // a second --write replaces it (and a 0.21.0 brief's Current set too)
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--write").code, 0);
  assert.equal((R(root, `${PWR}/tasks-brief.md`).match(/^## Tasks /gm) || []).length, 1);
  const snap = JSON.parse(R(root, `${PWR}/.tasks-round.json`));
  assert.equal(snap.schema, "hitl.tasks-round/1"); assert.equal(snap.round, 1); assert.equal(snap.set, j.set); assert.equal(snap.approved, null);
  assert.deepEqual(Object.keys(snap.tasks), ["PWR-T1", "PWR-T2"]);
  assert.deepEqual(parseBrief(R(root, `${PWR}/tasks-brief.md`), `${PWR}/tasks-brief.md`).questions.map((q) => q.id), ["Approve"], "the list adds no question");
  const old = putTasksList(BRIEF_0210(), "## Tasks (2) — in build order\n\n1. x", "abc");
  assert.doesNotMatch(old, /## Current set|not a question/); assert.match(old, /set: abc/); assert.match(old, /^## Round 1$/m);
  // a 0.21.1 brief: its two-line list is replaced by the table
  const l211 = putTasksList(BRIEF(), md, "abc");
  assert.doesNotMatch(l211, /not a question|^ {3}P0 · /m); assert.match(l211, /^\| # +\| Task +\| Title /m);
  assert.equal((l211.match(/^## Tasks /gm) || []).length, 1);
  // diff: none, then the human's own edit
  assert.deepEqual(cli(root, "tasks", "diff", "feat-password-reset", "--json").json().lines, []);
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("impl: agent | blocked-by: PWR-T1", "impl: manual | blocked-by: PWR-T1"));
  const d = cli(root, "tasks", "diff", "feat-password-reset", "--json").json();
  assert.equal(d.changed, true); assert.deepEqual(d.lines, ["~ PWR-T2 impl agent → manual"]);
  assert.match(cli(root, "tasks", "diff", "feat-password-reset").out, /^_Changed since Round 1:_ ~ PWR-T2 impl agent → manual$/m);
});

/** spec-app with feat-password-reset's tasks.md back to draft, a brief round written and its snapshot. */
function draftRound(brief = BRIEF()) {
  const root = project();
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("> status: approved", "> status: draft"));
  W(root, `${PWR}/tasks-brief.md`, brief);
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--write", "--json").code, 0);
  return root;
}
const answer = (root, fn) => W(root, `${PWR}/tasks-brief.md`, fn(R(root, `${PWR}/tasks-brief.md`)));
const approveY = (t) => t.replace(/(## Approve\? \(needs its own Y\)\n\n)>/, "$1> Y");

test("tasks approve: no Y → TASKS_APPROVE_NO_Y; Y + unchanged set → approved by the CLI", () => {
  const root = draftRound();
  answer(root, (t) => t.replace("## Notes — change risk, order, prio, add/drop/merge tasks\n\n>", "## Notes — change risk, order, prio, add/drop/merge tasks\n\n> Y"));
  let r = cli(root, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r.code, 1); assert.equal(r.json().code, "TASKS_APPROVE_NO_Y"); assert.match(r.json().message, /only a Y under "Approve\?" itself approves/);
  assert.match(R(root, `${PWR}/tasks.md`), /^> status: draft$/m);
  answer(root, approveY);
  r = cli(root, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r.code, 0, r.out); assert.equal(r.json().ok, true); assert.equal(r.json().question, "Approve"); assert.equal(r.json().was, "draft");
  assert.match(R(root, `${PWR}/tasks.md`), /^> status: approved$/m);
  const b = parseBrief(R(root, `${PWR}/tasks-brief.md`), `${PWR}/tasks-brief.md`);
  assert.equal(b.status, "done"); assert.equal(b.rounds[0].done, true);
  assert.match(b.questions.at(-1).recorded[0], /^approved \d{4}-\d{2}-\d{2}$/);
  assert.match(R(root, `${PWR}/tasks-brief.md`), /## Approve\? \(needs its own Y\)\n\n> Y\n\n→ approved \d{4}-\d{2}-\d{2}\n/);
  const snap = JSON.parse(R(root, `${PWR}/.tasks-round.json`));
  assert.deepEqual(Object.keys(snap.approved.tasks), ["PWR-T1", "PWR-T2"]); assert.equal(snap.approved.mode, "loose");
  // a second approve: the question is marked now
  assert.equal(cli(root, "tasks", "approve", "feat-password-reset", "--json").json().code, "TASKS_APPROVE_NO_Y");
});

test("tasks approve: an open 0.21.0 brief still approves (its Y under Approve the task set?, its _Override:_ record)", () => {
  const root = draftRound(BRIEF_0210({ approve: "Y", override: "PWR-T2.AC1" }));
  const r = cli(root, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r.code, 0, r.out); assert.equal(r.json().question, "Q3");
  assert.equal(parseBrief(R(root, `${PWR}/tasks-brief.md`), `${PWR}/tasks-brief.md`).rounds[0].done, true);
});

test("tasks approve: the set changed since the round → TASKS_SET_CHANGED with the diff; a drop after Y and the round's override row are allowed", () => {
  const root = draftRound();
  answer(root, approveY);
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("Set a new password", "Set a new password once"));
  const r = cli(root, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r.code, 1); assert.equal(r.json().code, "TASKS_SET_CHANGED"); assert.deepEqual(r.json().diff, ["~ PWR-T2 title Set a new password → Set a new password once"]);
  assert.match(R(root, `${PWR}/tasks.md`), /^> status: draft$/m, "nothing written");
  // an override answered Y in this round: its `!` row may change after the snapshot
  const root2 = draftRound(BRIEF({ override: Object.assign("PWR-T2.AC1", { answer: "Y" }) }));
  answer(root2, approveY);
  W(root2, `${PWR}/tasks.md`, R(root2, `${PWR}/tasks.md`).replace(/\| AC1 \| example \| spec \| reset endpoint \| test-author \|\n$/, "| AC1 | example | spec | reset endpoint | test-author |\n").replace(/(## PWR-T2[\s\S]*?\| ac \| kind \| oracle \| seam \| author \|\n\|----\|------\|--------\|------\|--------\|\n)\| AC1 \| example \| spec \| reset endpoint \| test-author \|/, "$1| AC1 | none!: the identity provider sets it — no sandbox | — | — | — |"));
  assert.match(R(root2, `${PWR}/tasks.md`), /none!: the identity provider/);
  const r2 = cli(root2, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r2.code, 0, r2.out);
  // without the override question's own Y the same row change supersedes
  const root3 = draftRound(BRIEF({ override: "PWR-T2.AC1" }));
  answer(root3, approveY);
  W(root3, `${PWR}/tasks.md`, R(root3, `${PWR}/tasks.md`).replace(/(## PWR-T2[\s\S]*?\n)\| AC1 \| example \| spec \| reset endpoint \| test-author \|/, "$1| AC1 | none!: x — y | — | — | — |"));
  assert.equal(cli(root3, "tasks", "approve", "feat-password-reset", "--json").json().code, "TASKS_SET_CHANGED");
  // the snapshot is of an older round → TASKS_SNAPSHOT_MISSING
  const root4 = draftRound();
  answer(root4, (t) => approveY(t).replace("round: 1", "round: 2"));
  assert.equal(cli(root4, "tasks", "approve", "feat-password-reset", "--json").json().code, "TASKS_SNAPSHOT_MISSING");
});

test("TASKS_NOT_APPROVED: a draft set refuses skeleton/tests approval and the context pack; status holds it and next goes to the brief", () => {
  const root = draftRound();
  let r = cli(root, "approve", "PWR-T2", "--stage", "skeleton", "--by", "auto", "--json");
  assert.equal(r.code, 1); assert.equal(r.json().code, "TASKS_NOT_APPROVED"); assert.match(r.json().reasons[0], /^TASKS_NOT_APPROVED: PWR-T2 is in a draft task set/);
  assert.equal(r.json().suggest, `answer ${PWR}/tasks-brief.md, then /hitl:tasks feat-password-reset`);
  r = cli(root, "approve", "PWR-T2", "--stage", "tests", "--by", "auto", "--force", "--json");
  assert.equal(r.json().code, "TASKS_NOT_APPROVED", "never forced");
  r = cli(root, "--json", "context", "PWR-T2", "--contract");
  assert.equal(r.code, 1); assert.equal(r.json().code, "TASKS_NOT_APPROVED"); assert.equal(r.json().reason, "draft");
  const s = cli(root, "status", "--json").json();
  assert.equal(s.tasks["PWR-T2"].tasksHold.reason, "draft");
  assert.equal(s.next.command, `answer ${PWR}/tasks-brief.md, then /hitl:tasks feat-password-reset`);
  assert.match(cli(root, "status").out, /\| PWR-T2 \|[^\n]*_Held:_ draft task set \| answer \.hitl\/changes\/feat-password-reset\/tasks-brief\.md, then \/hitl:tasks feat-password-reset \|/);
  assert.match(cli(root, "status", "--brief").out, /_Brief:_ feat-password-reset — tasks brief round 1: 1 unanswered → answer/);
  // approved through the brief → the hold is gone
  answer(root, approveY);
  assert.equal(cli(root, "tasks", "approve", "feat-password-reset").code, 0);
  assert.equal(cli(root, "status", "--json").json().tasks["PWR-T2"].tasksHold, undefined);
  assert.notEqual(cli(root, "--json", "context", "PWR-T2").code, 1);
});

test("update hold: tasks.md stays approved; only the new or edited task is held while the update round is open", () => {
  const root = project();
  // the approved set → baseline (refused while a round is open, and for a draft set)
  W(root, `${PWR}/tasks-brief.md`, BRIEF().replace("status: open", "status: done"));
  assert.equal(cli(root, "tasks", "baseline", "feat-password-reset", "--json").json().ok, true);
  // the update: a new task PWR-T3, PWR-T2 untouched; a new round opens
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`) + "\n## PWR-T3 Expire old links\n- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo\n\n### Acceptance criteria\n- [ ] PWR-T3.AC1 (PWR-R2.S1) Given an old link When used Then refused\n\n### Test plan\n| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | new: an old link still works | example | spec | reset endpoint | test-author |\n");
  answer(root, (t) => t.replace("status: done", "status: open"));
  assert.equal(cli(root, "tasks", "baseline", "feat-password-reset", "--json").json().code, "TASKS_BRIEF_OPEN");
  const s = cli(root, "status", "--json").json();
  assert.equal(s.tasks["PWR-T3"].tasksHold.reason, "update");
  assert.equal(s.tasks["PWR-T2"].tasksHold, undefined, "untouched task goes on");
  assert.match(R(root, `${PWR}/tasks.md`), /^> status: approved$/m);
  assert.equal(cli(root, "approve", "PWR-T3", "--stage", "skeleton", "--by", "auto", "--json").json().code, "TASKS_NOT_APPROVED");
  assert.match(cli(root, "status", "--brief").out, /_Brief:_ feat-password-reset — tasks brief round 1 \(update\)/);
  // a draft set has no baseline
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("> status: approved", "> status: draft"));
  answer(root, (t) => t.replace("status: open", "status: done"));
  assert.equal(cli(root, "tasks", "baseline", "feat-password-reset", "--json").json().code, "TASKS_NOT_APPROVED");
});

test("cheap late edits: on an approved set, prio, blocked-by and risk edits are not held and do not refuse the approval; an AC edit does", () => {
  const root = project();
  W(root, `${PWR}/tasks-brief.md`, BRIEF().replace("status: open", "status: done"));
  assert.equal(cli(root, "tasks", "baseline", "feat-password-reset", "--json").json().ok, true);
  // an update round is open (a new task PWR-T3); meanwhile PWR-T2 gets a new prio, blocker and a higher-reason risk
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`) + "\n## PWR-T3 Expire old links\n- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo\n\n### Acceptance criteria\n- [ ] PWR-T3.AC1 (PWR-R2.S1) Given an old link When used Then refused\n\n### Test plan\n| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | new: an old link still works | example | spec | reset endpoint | test-author |\n");
  answer(root, (t) => t.replace("status: done", "status: open"));
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--write").code, 0);
  const late = (t) => t.replace("- prio: P1 | risk: high (security) | impl: agent | blocked-by: PWR-T1 |", "- prio: P0 | risk: high (security, data) | impl: agent | blocked-by: PWR-T3 |");
  W(root, `${PWR}/tasks.md`, late(R(root, `${PWR}/tasks.md`)));
  let s = cli(root, "status", "--json").json();
  assert.equal(s.tasks["PWR-T2"].tasksHold, undefined, "prio, blocked-by, risk: not held");
  assert.equal(s.tasks["PWR-T3"].tasksHold.reason, "update");
  assert.deepEqual(cli(root, "tasks", "diff", "feat-password-reset", "--json").json().lines, ["~ PWR-T2 prio P1 → P0; risk high (security) → high (security, data); blocked-by PWR-T1 → PWR-T3"], "still listed in _Changed since_");
  answer(root, approveY);
  const r = cli(root, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r.code, 0, `an approved set: late edits after the round do not supersede the Y — ${r.out}`);
  assert.equal(cli(root, "status", "--json").json().tasks["PWR-T3"].tasksHold, undefined);
  // the next update round: an AC edit of PWR-T2 is held, and after the round it refuses the Y
  answer(root, (t) => t.replace("status: done", "status: open").replace("round: 1", "round: 2").replace(/\n\n→ approved [\d-]+/, "").replace("> Y", ">"));
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--write").code, 0);
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("Then sign-in works with it", "Then sign-in works with it once"));
  s = cli(root, "status", "--json").json();
  assert.equal(s.tasks["PWR-T2"].tasksHold.reason, "update", "an AC edit is held");
  answer(root, approveY);
  assert.equal(cli(root, "tasks", "approve", "feat-password-reset", "--json").json().code, "TASKS_SET_CHANGED");
  // a draft set: a prio edit after the round still supersedes the Y
  const d = draftRound();
  answer(d, approveY);
  W(d, `${PWR}/tasks.md`, R(d, `${PWR}/tasks.md`).replace("- prio: P1 | risk: high (security) | impl: agent", "- prio: P0 | risk: high (security) | impl: agent"));
  assert.equal(cli(d, "tasks", "approve", "feat-password-reset", "--json").json().code, "TASKS_SET_CHANGED");
});

test("quick: a draft quick file waits for its brief (status quick[], next), then QKEY approves it", async () => {
  const root = project();
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  let s = cli(root, "status", "--json").json();
  assert.deepEqual(s.quick.map((q) => [q.key, q.tasks, q.brief]), [["QFLT", "draft", null]]);
  assert.equal(s.tasks["QFLT-T1"].tasksHold.apply, "/hitl:tasks QFLT");
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21" }));
  assert.equal(cli(root, "tasks", "gate", "QFLT", "--write").code, 0);
  assert.ok(fs.existsSync(path.join(root, ".hitl/tasks/.quick-fix-label-typo-round.json")));
  assert.match(R(root, ".hitl/tasks/quick-fix-label-typo-brief.md"), /## Tasks \(1\) — in build order\n\n\| #   \| Task [^\n]*\n\| --- [^\n]*\n\| 1   \| QFLT-T1 \| Fix the reset email subject typo \| —     \| P2   \| low → fast lane \| agent \| 2 AC, 1 new \| users see "Pasword" in the subject \|\n\n## Notes/);
  s = cli(root, "status", "--json").json();
  assert.equal(s.quick[0].brief.unanswered, 1);
  // with no other task to do, the open quick brief is the next step (like a change brief)
  const { computeNext } = await import("../../scripts/lib/nextstep.mjs");
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} }, quick: s.quick }).command, "answer .hitl/tasks/quick-fix-label-typo-brief.md, then /hitl:tasks QFLT");
  assert.equal(computeNext({ tasks: [{ id: "QFLT-T1", quick: true, docStatus: "draft", blockedBy: [] }], statuses: { tasks: { "QFLT-T1": { status: "todo", next: "/hitl:implement QFLT-T1" } } }, quick: [{ id: "QFLT", key: "QFLT", tasks: "draft", brief: null }] }).command, "/hitl:tasks QFLT", "a draft quick task is not on the frontier");
  assert.match(cli(root, "status", "--brief").out, /^_Brief:_ quick QFLT — tasks brief round 1 \(draft\): 1 unanswered → answer \.hitl\/tasks\/quick-fix-label-typo-brief\.md, then \/hitl:tasks QFLT$/m);
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", approveY(R(root, ".hitl/tasks/quick-fix-label-typo-brief.md")));
  const r = cli(root, "tasks", "approve", "QFLT", "--json");
  assert.equal(r.code, 0, r.out);
  assert.match(R(root, ".hitl/tasks/quick-fix-label-typo.md"), /^> status: approved$/m);
  s = cli(root, "status", "--json").json();
  assert.equal(s.tasks["QFLT-T1"].tasksHold, undefined);
  assert.equal(s.quick[0].tasks, "approved");
  assert.doesNotMatch(cli(root, "status", "--brief").out, /_Brief:_ quick/);
});

// ---- hook: only the CLI sets the header
const hookDeny = (root, tool, input) => {
  const r = spawnSync(process.execPath, [path.join(PLUGIN, "scripts/hooks/pre-tool.mjs")], {
    input: JSON.stringify({ session_id: "s1", cwd: root, hook_event_name: "PreToolUse", tool_name: tool, tool_input: input }), encoding: "utf8", timeout: 30000,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: PLUGIN },
  });
  return /"permissionDecision"\s*:\s*"deny"/.test(r.stdout) ? r.stdout : null;
};

test("hook: Claude's own edit that sets a tasks header to approved is refused (Edit, Write, Bash); keeping it approved is fine", () => {
  const root = project();
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  const q = path.join(root, ".hitl/tasks/quick-fix-label-typo.md");
  let d = hookDeny(root, "Edit", { file_path: q, old_string: "> status: draft", new_string: "> status: approved" });
  assert.ok(d && /TASKS_NOT_APPROVED: only `hitl-index tasks approve/.test(d), d);
  assert.ok(hookDeny(root, "Write", { file_path: path.join(root, ".hitl/tasks/quick-new.md"), content: QUICK("approved") }), "a new file written approved");
  assert.ok(hookDeny(root, "Bash", { command: `sed -i 's/> status: draft/> status: approved/' ${q}` }), "sed -i");
  assert.equal(hookDeny(root, "Edit", { file_path: q, old_string: "users see", new_string: "people see" }), null, "other edits of a draft file");
  const t = path.join(root, PWR, "tasks.md");
  assert.equal(hookDeny(root, "Edit", { file_path: t, old_string: "Set a new password", new_string: "Set a new password once" }), null, "an update keeps approved");
  assert.equal(hookDeny(root, "Write", { file_path: path.join(root, ".hitl/tasks/quick-fix-label-typo-brief.md"), content: "> status: approved\n" }), null, "a brief is not a tasks file");
  assert.equal(hookDeny(root, "Bash", { command: "hitl-index tasks approve QFLT --json" }), null);
});

test("hook: once the set has a tasks brief, Claude's edit that lowers a risk or drops a reason is refused; raising is fine", () => {
  const root = project();
  const t = path.join(root, PWR, "tasks.md");
  const meta = "- prio: P1 | risk: high (security) | impl: agent | blocked-by: PWR-T1 | status: todo";
  const edit = (to) => hookDeny(root, "Edit", { file_path: t, old_string: meta, new_string: meta.replace("risk: high (security)", to) });
  // no brief yet: Claude is still drafting its own set
  assert.equal(edit("risk: low"), null, "no brief yet");
  W(root, `${PWR}/tasks-brief.md`, BRIEF());
  const d = edit("risk: low");
  assert.ok(d && /TASKS_RISK_LOWERED: PWR-T2 risk high \(security\) → low/.test(d), d);
  assert.ok(edit("risk: high (data)"), "a reason removed");
  assert.ok(hookDeny(root, "Write", { file_path: t, content: R(root, `${PWR}/tasks.md`).replace(meta, meta.replace("high (security)", "low")) }), "Write too");
  assert.equal(edit("risk: high (security, data)"), null, "a reason added");
  assert.equal(hookDeny(root, "Edit", { file_path: t, old_string: meta, new_string: meta.replace("P1", "P0").replace("blocked-by: PWR-T1", "blocked-by: none") }), null, "prio and blocked-by");
  // a low task raised to high is fine; a quick file's brief is quick-<slug>-brief.md
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  const q = path.join(root, ".hitl/tasks/quick-fix-label-typo.md");
  assert.equal(hookDeny(root, "Edit", { file_path: q, old_string: "risk: low", new_string: "risk: high (security)" }), null);
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK().replace("risk: low", "risk: high (security)"));
  assert.equal(hookDeny(root, "Edit", { file_path: q, old_string: "risk: high (security)", new_string: "risk: low" }), null, "quick, no brief yet");
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", BRIEF({ title: "quick-fix-label-typo" }));
  assert.ok(hookDeny(root, "Edit", { file_path: q, old_string: "risk: high (security)", new_string: "risk: low" }), "quick with its brief");
});

// ---- evals (dry): the tasks-* cases of evals/grade.mjs on synthetic transcripts and files (no claude calls)
const scenarios = JSON.parse(fs.readFileSync(path.join(PLUGIN, "evals/scenarios.json"), "utf8")).cases;
const asst = (content) => ({ type: "assistant", message: { content } });
const text = (t) => asst([{ type: "text", text: t }]);
const tool = (name, input) => asst([{ type: "tool_use", name, input }]);
function grade(c, proj, events) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-grade-"));
  fs.symlinkSync(proj, path.join(dir, "proj"));
  spawnSync("git", ["init", "-q"], { cwd: proj });
  const last = events.filter((e) => e.message?.content?.[0]?.type === "text").at(-1)?.message.content[0].text ?? "";
  fs.writeFileSync(path.join(dir, "out.jsonl"), [...events, { type: "result", result: last, total_cost_usd: 0 }].map((e) => JSON.stringify(e)).join("\n"));
  return gradeRun({ suite: "behaviour", c, dir, proj, pluginDir: PLUGIN, exit: 0 }).checks;
}

test("evals (dry): tasks-brief passes on a brief with its table and snapshot; fails on a chat gate, the old list, a missing row, an empty Needs your eye, Q questions or a self-approval", () => {
  const c = scenarios.find((x) => x.id === "tasks-brief");
  assert.ok(c, "tasks-brief case");
  const root = draftRound();
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("| ac | kind | oracle | seam | author |\n|----|------|--------|------|--------|\n| AC1 | example | spec | reset endpoint | test-author |\n| AC2 |", "| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | new: a | example | spec | reset endpoint | test-author |\n| AC2 | shared: AC1 |").replace(/(## PWR-T2[\s\S]*?)\| ac \| kind \| oracle \| seam \| author \|\n\|----\|------\|--------\|------\|--------\|\n\| AC1 \|/, "$1| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | new: b |"));
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--write").code, 0);
  const chat = `✅ 2 tasks in ${PWR}/tasks.md\nRound 1: 2 tasks in ${PWR}/tasks-brief.md — read the list, Y under Approve?, then /hitl:tasks feat-password-reset`;
  const good = grade(c, root, [tool("Bash", { command: "hitl-index tasks gate feat-password-reset --write" }), text(chat)]);
  for (const k of ["tasks_brief_written", "tasks_test_decisions", "tasks_brief_chat", "tasks_snapshot_written", "tasks_not_approved", "tasks_no_chat_gate"]) assert.ok(good[k].ok, `${k}: ${good[k].why}`);
  const gate = grade(c, root, [text("| PWR-T1 | Send a reset link |\n1. Granularity ok?  2. Blocking edges right?\n— reply changes, or Y")]);
  assert.equal(gate.tasks_no_chat_gate.ok, false); assert.equal(gate.tasks_brief_chat.ok, false);
  assert.equal(grade(c, root, [text(`1. **PWR-T1** Send a reset link\nApprove? (Y/n) — ${PWR}/tasks-brief.md`)]).tasks_no_chat_gate.ok, false, "the list in chat");
  assert.equal(grade(c, root, [text(`| 1   | PWR-T1 | Send a reset link |\nRound 1 in ${PWR}/tasks-brief.md`)]).tasks_no_chat_gate.ok, false, "a table row in chat");
  const brief = R(root, `${PWR}/tasks-brief.md`);
  // the 0.21.1 two-line list is no longer the generated table: one table row per task
  const old = brief.replace(/(## Tasks \(2\) — in build order\n\n)[\s\S]*?\n\n(?=## )/, "$1" + "1. **PWR-T1** Send a reset link · ✅ done\n   P1 · risk **high (security)** · mixed · 2 AC, 2 new tests\n2. **PWR-T2** Set a new password — after T1\n   P1 · risk **high (security)** → skeleton review · agent · 1 AC, 1 new test\n\n");
  assert.notEqual(old, brief);
  W(root, `${PWR}/tasks-brief.md`, old);
  let g = grade(c, root, [text(chat)]);
  assert.equal(g.tasks_brief_written.ok, false, "the old list"); assert.equal(g.tasks_test_decisions.ok, false, "the old list");
  W(root, `${PWR}/tasks-brief.md`, brief.replace(/^\| 2 .*\n/m, ""));
  g = grade(c, root, [text(chat)]);
  assert.equal(g.tasks_brief_written.ok, false, "a task without its row"); assert.equal(g.tasks_test_decisions.ok, false);
  W(root, `${PWR}/tasks-brief.md`, brief.replace("## Notes", "## Needs your eye\n\n## Notes"));
  assert.equal(grade(c, root, [text(chat)]).tasks_brief_written.ok, false, "an empty Needs your eye");
  W(root, `${PWR}/tasks-brief.md`, brief.replace("## Notes", "## Needs your eye\n\n- PWR-T2 may be too small to stand alone.\n\n## Notes"));
  assert.equal(grade(c, root, [text(chat)]).tasks_brief_written.ok, true, "Needs your eye with a bullet");
  W(root, `${PWR}/tasks-brief.md`, brief.replace("## Notes", "## Round 1\n\n### Q1 [Q] Slices: ok?\n\n_Rec:_ keep.\n\n>\n\n## Notes"));
  assert.equal(grade(c, root, [text(chat)]).tasks_brief_written.ok, false, "a [Q] question");
  W(root, `${PWR}/tasks-brief.md`, brief);
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("> status: draft", "> status: approved"));
  assert.equal(grade(c, root, [text(chat)]).tasks_not_approved.ok, false);
  fs.rmSync(path.join(root, PWR, ".tasks-round.json"));
  assert.equal(grade(c, root, [text(chat)]).tasks_snapshot_written.ok, false);
});

test("evals (dry): tasks-quick and tasks-quick-accept (the eval fixture brief)", () => {
  const c = scenarios.find((x) => x.id === "tasks-quick");
  const root = project();
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21" }).replace(/## Tasks \(1\)[\s\S]*?\n\n(?=## Notes)/, ""));
  cli(root, "tasks", "gate", "QFLT", "--write");
  const chat = "Round 1: 1 task in .hitl/tasks/quick-fix-label-typo-brief.md — read it, Y under Approve?, then /hitl:tasks QFLT";
  const g = grade(c, root, [text(chat)]);
  for (const k of c.checks) assert.ok(g[k].ok, `${k}: ${g[k].why}`);
  const brief = R(root, ".hitl/tasks/quick-fix-label-typo-brief.md");
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", brief.replace("## Notes", "## Needs your eye\n\n- Blocking edges: n/a (1 task)\n\n## Notes"));
  assert.equal(grade(c, root, [text(chat)]).tasks_quick_brief.ok, false, "an n/a mark");
  // tasks-quick-accept: the eval fixture's answered brief → the next run calls tasks approve
  const a = scenarios.find((x) => x.id === "tasks-quick-accept");
  const fx = fs.readFileSync(path.join(PLUGIN, "evals/fixtures/briefs/quick/quick-duplicate-email-message-brief.md"), "utf8");
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", fx.replace(/duplicate-email-message/g, "fix-label-typo").replace(/\{KEY\}/g, "QFLT"));
  assert.equal(cli(root, "tasks", "gate", "QFLT", "--write").code, 0);
  assert.deepEqual(parseBrief(R(root, ".hitl/tasks/quick-fix-label-typo-brief.md"), ".hitl/tasks/quick-fix-label-typo-brief.md").questions.map((q) => [q.id, q.kind]), [["Approve", "accept"]]);
  assert.equal(cli(root, "tasks", "approve", "QFLT").code, 0);
  const ok = grade(a, root, [tool("Bash", { command: "hitl-index tasks approve QFLT --json" }), text("✅ Tasks approved.\n_Next:_ /hitl:implement QFLT-T1 (_Fast_ lane)")]);
  for (const k of a.checks) assert.ok(ok[k].ok, `${k}: ${ok[k].why}`);
  const self = grade(a, root, [tool("Edit", { file_path: path.join(root, ".hitl/tasks/quick-fix-label-typo.md"), old_string: "> status: draft", new_string: "> status: approved" }), text("✅ Tasks approved.\n_Next:_ /hitl:implement QFLT-T1")]);
  assert.equal(self.tasks_approved_by_cli.ok, false);
});
