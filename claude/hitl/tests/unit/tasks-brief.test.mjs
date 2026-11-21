// 0.21 tasks brief: the /hitl:tasks gate in a brief file (parse, quick resolution, the `*-brief.md` filter, the
// generated Current set with waves, the round snapshot, `tasks approve`, the hook refusal, TASKS_NOT_APPROVED and the
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
import { canonTask, diffSets, setOf, waves, headerApproved, setHeaderApproved } from "../../scripts/lib/tasksbrief.mjs";
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

/** A tasks brief round (the template's shape): 4 [Q], optional [C] / _Override:_, Notes, approve last. */
const BRIEF = ({ head = "> change: feat-password-reset | key: PWR | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21", title = "feat-password-reset", acceptAll = "", approve = "", override = null, q2 = null } = {}) => `# Tasks brief — ${title}

${head}
> next: answer the \`>\` lines, then run /hitl:tasks ${title}

## Current set

<!-- generated -->

| id | title |
| --- | --- |
| PWR-T9 | not a question |

## Round 1

Accept all recommendations of this round: >${acceptAll ? ` ${acceptAll}` : ""}

### Q1 [Q] Slices: is each task one vertical slice that fits one session (merge or split any)?

All within the rules.
_Rec:_ keep as drafted.

>

${q2 ?? `### Q2 [Q] Blocking edges: does each task wait only for tasks that really gate it?

Waves: 1 = PWR-T1 · 2 = PWR-T2.
_Rec:_ keep as drafted.

>`}

### Q3 [Q] Owners: who writes each symbol (agent or you)?

_Rec:_ keep as drafted.

>

### Q4 [Q] Test plan: which ACs get a new test (and the defect it catches), which do not?

_Rec:_ keep as drafted.

>
${override ? `
### Q5 _Override:_ ${override} none!: the identity provider sets it — no sandbox? (needs its own Y)

PWR-T2 has risk security.

>${override.answer ? ` ${override.answer}` : ""}
` : ""}
### Notes — anything the questions missed, or a change to an earlier answer

>

### Q${override ? 6 : 5} Approve the task set? (Y/n) (needs its own Y)

Approves the set as shown in Current set.

>${approve ? ` ${approve}` : ""}
`;

test("ownYKind: _Override:_ and the approve question need their own Y", () => {
  assert.equal(ownYKind(5, "_Override:_ PWR-T2.AC1 none!: x? (needs its own Y)"), "override");
  assert.equal(ownYKind(7, "Approve the task set? (Y/n) (needs its own Y)"), "approve");
  assert.equal(ownYKind(1, "[Q] Slices"), null);
});

test("parseBrief: a tasks brief (kind, set, Current set ignored, accept-all never answers override or approve)", () => {
  const b = parseBrief(BRIEF({ acceptAll: "Y", override: "PWR-T2.AC1" }).replace("set: —", "set: 3f9a1c2e0b11"), `${PWR}/tasks-brief.md`);
  assert.equal(b.kind, "tasks"); assert.equal(b.change, "feat-password-reset"); assert.equal(b.set, "3f9a1c2e0b11"); assert.equal(b.quick, null);
  assert.deepEqual(b.questions.map((q) => q.id), ["Q1", "Q2", "Q3", "Q4", "Q5", "Q6"], "the Current set table is not a question");
  assert.deepEqual(b.questions.map((q) => q.tag), ["Q", "Q", "Q", "Q", null, null]);
  const ov = b.questions[4], ap = b.questions[5];
  assert.equal(ov.ownY, "override"); assert.equal(ap.ownY, "approve");
  assert.ok(b.questions.slice(0, 4).every((q) => q.acceptedByRound), "accept-all takes the four [Q] recommendations");
  assert.equal(ov.answered, false); assert.equal(ap.answered, false, "accept-all answers neither");
  assert.equal(b.counts.unanswered, 2);
  assert.ok(b.rounds[0].notes, "Notes before the approve question");
  const s = briefSummary(b);
  assert.deepEqual(s.approve, { id: "Q6", round: 1, answer: "empty", settled: false });
  assert.equal(s.set, "3f9a1c2e0b11");
  const y = parseBrief(BRIEF({ approve: "Y" }), `${PWR}/tasks-brief.md`);
  assert.equal(y.questions.at(-1).kind, "accept");
});

test("parseBrief: a quick brief names its slug and key, never a change; a prefilled n/a question is settled", () => {
  const q2 = "### Q2 [Q] Blocking edges: does each task wait only for tasks that really gate it?\n\n— (1 task)\n\n→ recorded: n/a (1 task)";
  const b = parseBrief(BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21", q2 }), ".hitl/tasks/quick-fix-label-typo-brief.md");
  assert.equal(b.kind, "tasks"); assert.equal(b.change, null); assert.deepEqual(b.quick, { slug: "fix-label-typo", key: "QFLT" });
  const q = b.questions.find((x) => x.id === "Q2");
  assert.ok(q.settled && !q.pending, "Q2 n/a is recorded"); assert.deepEqual(q.recorded, ["n/a (1 task)"]);
  // from the file name alone
  const f = parseBrief("# Tasks brief — quick-fix-label-typo\n\n## Round 1\n", ".hitl/tasks/quick-fix-label-typo-brief.md");
  assert.equal(f.kind, "tasks"); assert.equal(f.change, null); assert.equal(f.quick.slug, "fix-label-typo");
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
});

test("tasks gate --md: summary, task table with the wave column, test-plan table; --write puts it in the brief with set: and a snapshot", () => {
  const root = project();
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("> status: approved", "> status: draft"));
  const md = cli(root, "tasks", "gate", "feat-password-reset", "--md").out;
  assert.match(md, /^_Summary:_ \.hitl\/changes\/feat-password-reset\/tasks\.md — 2 task\(s\) \(2 high, 0 low\) · spec: approved · design: approved · tests: 3 new/m);
  assert.match(md, /^\| id +\| title +\| prio \| risk \(reasons\) +\| impl +\| blocked-by \| wave \|$/m);
  assert.match(md, /^\| PWR-T1 \| Send a reset link +\| P1 +\| high \(security\) +\| mixed \| — +\| done \|$/m, "a done task has no wave");
  assert.match(md, /^\| PWR-T2 \| Set a new password +\| P1 +\| high \(security\) +\| agent \| PWR-T1 +\| 1 +\|$/m);
  assert.match(md, /^\| task +\| AC +\| test +\| seam +\|$/m);
  assert.match(md, /^\| PWR-T2 \| AC1 \| new +\| reset endpoint \|$/m);
  assert.equal(cli(root, "tasks", "gate", "feat-password-reset", "--write", "--json").json().code, "TASKS_BRIEF_MISSING");
  W(root, `${PWR}/tasks-brief.md`, BRIEF());
  const j = cli(root, "tasks", "gate", "feat-password-reset", "--write", "--json").json();
  assert.equal(j.ok, true); assert.equal(j.round, 1); assert.match(j.set, /^[0-9a-f]{12}$/);
  const b = R(root, `${PWR}/tasks-brief.md`);
  assert.match(b, new RegExp(`^> change: feat-password-reset \\| key: PWR \\| kind: tasks \\| set: ${j.set} \\| status: open`, "m"));
  assert.match(b, /## Current set\n\n<!-- generated by `hitl-index tasks gate feat-password-reset --write` each round;[^\n]*-->\n\n_Summary:_/);
  assert.doesNotMatch(b, /not a question/, "the old Current set is replaced");
  assert.equal((b.match(/^## Current set$/gm) || []).length, 1);
  const snap = JSON.parse(R(root, `${PWR}/.tasks-round.json`));
  assert.equal(snap.schema, "hitl.tasks-round/1"); assert.equal(snap.round, 1); assert.equal(snap.set, j.set); assert.equal(snap.approved, null);
  assert.deepEqual(Object.keys(snap.tasks), ["PWR-T1", "PWR-T2"]);
  assert.equal(parseBrief(b, `${PWR}/tasks-brief.md`).questions.length, 5, "a written view adds no question");
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
const approveY = (t) => t.replace(/(### Q\d+ Approve the task set\?[^\n]*\n\nApproves[^\n]*\n\n)>/, "$1> Y");

test("tasks approve: no Y → TASKS_APPROVE_NO_Y (accept-all never approves); Y + unchanged set → approved by the CLI", () => {
  const root = draftRound();
  answer(root, (t) => t.replace("Accept all recommendations of this round: >", "Accept all recommendations of this round: > Y"));
  let r = cli(root, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r.code, 1); assert.equal(r.json().code, "TASKS_APPROVE_NO_Y"); assert.match(r.json().message, /accept-all Y never approves/);
  assert.match(R(root, `${PWR}/tasks.md`), /^> status: draft$/m);
  answer(root, approveY);
  r = cli(root, "tasks", "approve", "feat-password-reset", "--json");
  assert.equal(r.code, 0, r.out); assert.equal(r.json().ok, true); assert.equal(r.json().question, "Q5"); assert.equal(r.json().was, "draft");
  assert.match(R(root, `${PWR}/tasks.md`), /^> status: approved$/m);
  const b = parseBrief(R(root, `${PWR}/tasks-brief.md`), `${PWR}/tasks-brief.md`);
  assert.equal(b.status, "done"); assert.equal(b.rounds[0].done, true);
  assert.match(b.questions.at(-1).recorded[0], /^approved \d{4}-\d{2}-\d{2}$/);
  const snap = JSON.parse(R(root, `${PWR}/.tasks-round.json`));
  assert.deepEqual(Object.keys(snap.approved.tasks), ["PWR-T1", "PWR-T2"]);
  // a second approve: the question is marked now
  assert.equal(cli(root, "tasks", "approve", "feat-password-reset", "--json").json().code, "TASKS_APPROVE_NO_Y");
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
  answer(root4, (t) => approveY(t).replace("round: 1", "round: 2") + "\n## Round 2\n\n### Q6 Approve the task set? (Y/n) (needs its own Y)\n\n> Y\n");
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
  assert.match(cli(root, "status", "--brief").out, /_Brief:_ feat-password-reset — tasks brief round 1: 5 unanswered → answer/);
  // approved through the brief → the hold is gone
  answer(root, (t) => approveY(t).replace("Accept all recommendations of this round: >", "Accept all recommendations of this round: > Y"));
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

test("quick: a draft quick file waits for its brief (status quick[], next), then QKEY approves it", async () => {
  const root = project();
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  let s = cli(root, "status", "--json").json();
  assert.deepEqual(s.quick.map((q) => [q.key, q.tasks, q.brief]), [["QFLT", "draft", null]]);
  assert.equal(s.tasks["QFLT-T1"].tasksHold.apply, "/hitl:tasks QFLT");
  const q2 = "### Q2 [Q] Blocking edges: does each task wait only for tasks that really gate it?\n\n— (1 task)\n\n→ recorded: n/a (1 task)";
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21", q2 }));
  assert.equal(cli(root, "tasks", "gate", "QFLT", "--write").code, 0);
  assert.ok(fs.existsSync(path.join(root, ".hitl/tasks/.quick-fix-label-typo-round.json")));
  s = cli(root, "status", "--json").json();
  assert.equal(s.quick[0].brief.unanswered, 4);
  // with no other task to do, the open quick brief is the next step (like a change brief)
  const { computeNext } = await import("../../scripts/lib/nextstep.mjs");
  assert.equal(computeNext({ tasks: [], statuses: { tasks: {} }, quick: s.quick }).command, "answer .hitl/tasks/quick-fix-label-typo-brief.md, then /hitl:tasks QFLT");
  assert.equal(computeNext({ tasks: [{ id: "QFLT-T1", quick: true, docStatus: "draft", blockedBy: [] }], statuses: { tasks: { "QFLT-T1": { status: "todo", next: "/hitl:implement QFLT-T1" } } }, quick: [{ id: "QFLT", key: "QFLT", tasks: "draft", brief: null }] }).command, "/hitl:tasks QFLT", "a draft quick task is not on the frontier");
  assert.match(cli(root, "status", "--brief").out, /^_Brief:_ quick QFLT — tasks brief round 1 \(draft\): 4 unanswered → answer \.hitl\/tasks\/quick-fix-label-typo-brief\.md, then \/hitl:tasks QFLT$/m);
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", approveY(R(root, ".hitl/tasks/quick-fix-label-typo-brief.md")).replace("Accept all recommendations of this round: >", "Accept all recommendations of this round: > Y"));
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

test("evals (dry): tasks-brief passes on a brief round with its snapshot and fails on a chat gate or a self-approval", () => {
  const c = scenarios.find((x) => x.id === "tasks-brief");
  assert.ok(c, "tasks-brief case");
  const root = draftRound();
  const chat = `✅ 2 tasks in ${PWR}/tasks.md\nRound 1: 5 questions in ${PWR}/tasks-brief.md — answer there, then /hitl:tasks feat-password-reset`;
  const good = grade(c, root, [tool("Bash", { command: "hitl-index tasks gate feat-password-reset --write" }), text(chat)]);
  for (const k of ["tasks_brief_written", "tasks_brief_chat", "tasks_snapshot_written", "tasks_not_approved", "tasks_no_chat_gate"]) assert.ok(good[k].ok, `${k}: ${good[k].why}`);
  const gate = grade(c, root, [text("| PWR-T1 | Send a reset link |\n1. Granularity ok?  2. Blocking edges right?\n— reply changes, or Y")]);
  assert.equal(gate.tasks_no_chat_gate.ok, false); assert.equal(gate.tasks_brief_chat.ok, false);
  W(root, `${PWR}/tasks.md`, R(root, `${PWR}/tasks.md`).replace("> status: draft", "> status: approved"));
  assert.equal(grade(c, root, [text(chat)]).tasks_not_approved.ok, false);
  fs.rmSync(path.join(root, PWR, ".tasks-round.json"));
  assert.equal(grade(c, root, [text(chat)]).tasks_snapshot_written.ok, false);
});

test("evals (dry): tasks-quick and tasks-quick-accept", () => {
  const c = scenarios.find((x) => x.id === "tasks-quick");
  const root = project();
  W(root, ".hitl/tasks/quick-fix-label-typo.md", QUICK());
  const q2 = "### Q2 [Q] Blocking edges: does each task wait only for tasks that really gate it?\n\n— (1 task)\n\n→ recorded: n/a (1 task)";
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", BRIEF({ title: "quick-fix-label-typo", head: "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21", q2 }));
  cli(root, "tasks", "gate", "QFLT", "--write");
  const chat = "Round 1: 4 questions in .hitl/tasks/quick-fix-label-typo-brief.md — answer there, then /hitl:tasks QFLT";
  const g = grade(c, root, [text(chat)]);
  for (const k of c.checks) assert.ok(g[k].ok, `${k}: ${g[k].why}`);
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", R(root, ".hitl/tasks/quick-fix-label-typo-brief.md").replace("→ recorded: n/a (1 task)", "_Rec:_ keep as drafted.\n\n>"));
  assert.equal(grade(c, root, [text(chat)]).tasks_quick_brief.ok, false, "Q2 not prefilled");
  // tasks-quick-accept: the answered brief → the next run calls tasks approve
  const a = scenarios.find((x) => x.id === "tasks-quick-accept");
  W(root, ".hitl/tasks/quick-fix-label-typo-brief.md", approveY(R(root, ".hitl/tasks/quick-fix-label-typo-brief.md")).replace("Accept all recommendations of this round: >", "Accept all recommendations of this round: > Y"));
  assert.equal(cli(root, "tasks", "approve", "QFLT").code, 0);
  const ok = grade(a, root, [tool("Bash", { command: "hitl-index tasks approve QFLT --json" }), text("✅ Tasks approved.\n_Next:_ /hitl:implement QFLT-T1 (_Fast_ lane)")]);
  for (const k of a.checks) assert.ok(ok[k].ok, `${k}: ${ok[k].why}`);
  const self = grade(a, root, [tool("Edit", { file_path: path.join(root, ".hitl/tasks/quick-fix-label-typo.md"), old_string: "> status: draft", new_string: "> status: approved" }), text("✅ Tasks approved.\n_Next:_ /hitl:implement QFLT-T1")]);
  assert.equal(self.tasks_approved_by_cli.ok, false);
});
