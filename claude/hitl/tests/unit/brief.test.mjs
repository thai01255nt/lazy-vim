// 0.14 — brief files (`plan-brief.md`, `design-brief.md`): the parser (answers, accept-all, carried, recorded, close
// items, en + vi keywords), the next step while a round waits for answers, `hitl-index brief` (+ rename), and the
// `brief` field of `change --json` / `status --json`. spec validate ignores the brief files.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { parseBrief, answerKind, briefSummary, briefNext, pickBrief } from "../../scripts/lib/brief.mjs";
import { computeNext, nextForChange } from "../../scripts/lib/nextstep.mjs";
import { cli, specProject } from "./notes.test.mjs";

const PLAN = `<!-- hitl brief file: answer on the > lines. -->
# Plan brief — feat-export-csv
> change: feat-export-csv | key: FEC | kind: plan | status: open | round: 2 | updated: 2026-11-19
> next: answer the \`>\` lines, then run /hitl:plan feat-export-csv

## Description
Admins export the orders of a month to CSV.
Accountants import it.

## Round 1 ✅
🔗 parent feat-report — shared: none found yet

### Q0 Change id and key: \`feat-export-csv\` / \`FEC\` — keep?
💡 Recommended: keep \`feat-export-csv\` / \`FEC\`.
> Y
→ recorded: kept

### Q1 [R] Who uses this, and who must not?
_e.g. "accountants and admins; warehouse staff not"_
> Accountants and admins;
warehouse staff no.
→ recorded: FEC-R1, FEC-R1.S1

### Q2 [R] What is out of scope?
_e.g. "no Excel"_
> tại sao phải loại Excel?
💬 Excel needs a library; CSV opens in Excel too.
Option 1: CSV only. Option 2: CSV and Excel.
💡 Recommended: CSV only.
→ carried to Round 2

### Q3 [R] Use Redis for the export queue?
> use Redis
→ parked for design

## Round 2 — Coverage: Scope ✅ · Actors ✅ · Data ⚠️ · Edge ❌   (🔥 FEC-R2, big files)
Accept all recommendations of this round: > được
### Q2 [R] What is out of scope?
💡 Recommended: CSV only.
>

### Q8 [R] 🔥 What happens above 10 000 rows?
One file can get very large.
💡 Recommended: split into several files of ≤ 10 000 rows.
> không biết

### Q9 [T] Is an "export" the same as a "report"?
>

### Q10 [R] Must finance be told?
💡 Recommended: no.
> deep FEC-R2
`;

test("parseBrief: header, description, rounds, questions, answers, marks", () => {
  const b = parseBrief(PLAN, ".hitl/changes/feat-export-csv/plan-brief.md");
  assert.equal(b.schema, "hitl.brief/1");
  assert.deepEqual([b.kind, b.change, b.key, b.status, b.round, b.updated], ["plan", "feat-export-csv", "FEC", "open", 2, "2026-11-19"]);
  assert.equal(b.description, "Admins export the orders of a month to CSV.\nAccountants import it.");
  assert.deepEqual(b.rounds.map((r) => [r.n, r.done, r.acceptAll]), [[1, true, false], [2, false, true]]);
  assert.equal(b.rounds[1].coverage, "Scope ✅ · Actors ✅ · Data ⚠️ · Edge ❌");
  assert.deepEqual(b.rounds[1].hot, ["FEC-R2", "big files"]);
  const q = (round, id) => b.questions.find((x) => x.round === round && x.id === id);
  assert.deepEqual([q(1, "Q0").tag, q(1, "Q0").kind, q(1, "Q0").recorded], [null, "accept", ["kept"]]);
  assert.equal(q(1, "Q1").answer, "Accountants and admins;\nwarehouse staff no.", "a line without > continues the answer");
  assert.equal(q(1, "Q1").hint, 'e.g. "accountants and admins; warehouse staff not"');
  assert.deepEqual(q(1, "Q1").recorded, ["FEC-R1", "FEC-R1.S1"]);
  assert.deepEqual([q(1, "Q2").discussed, q(1, "Q2").carried, q(1, "Q2").settled, q(1, "Q2").recommended], [true, 2, true, "CSV only."]);
  assert.equal(q(1, "Q2").answer, "tại sao phải loại Excel?", "the 💬 block is not part of the answer");
  assert.equal(q(1, "Q3").parked, true);
  assert.ok(b.questions.filter((x) => x.round === 1).every((x) => !x.pending), "a ✅ round has nothing pending");
  // round 2: accept-all Y (vi) covers questions with a recommendation and an empty answer only
  assert.deepEqual([q(2, "Q2").kind, q(2, "Q2").acceptedByRound, q(2, "Q2").answered, q(2, "Q2").pending], ["empty", true, true, true]);
  assert.deepEqual([q(2, "Q8").hot, q(2, "Q8").kind, q(2, "Q8").acceptedByRound], [true, "unknown", false]);
  assert.equal(q(2, "Q8").body, "One file can get very large.");
  assert.deepEqual([q(2, "Q9").tag, q(2, "Q9").answered], ["T", false], "no recommendation: accept-all does not answer it");
  assert.equal(q(2, "Q10").kind, "deep");
  assert.deepEqual(b.counts, { questions: 8, pending: 4, answered: 3, unanswered: 1, notes: 0 });
  assert.deepEqual(b.items, []);
  assert.deepEqual(briefSummary(b), { kind: "plan", file: ".hitl/changes/feat-export-csv/plan-brief.md", status: "open", round: 2, open: true, unanswered: 1, pending: 4, notes: 0 });
});

test("answerKind: English and Vietnamese keywords", () => {
  const cases = { "": "empty", "  ": "empty", Y: "accept", "y.": "accept", yes: "accept", OK: "accept", "được": "accept", "Đồng ý": "accept", "ừ": "accept",
    "?": "unknown", "???": "unknown", "don't know": "unknown", "Don’t know": "unknown", "không biết": "unknown", "chưa biết": "unknown",
    done: "done", "Xong": "done", deep: "deep", "deep FEC-R2": "deep", "deep big files": "deep", n: "decline", "không": "decline",
    "Yes, but only admins": "text", "tại sao?": "text", "not sure": "text", "deeper please": "text" };
  for (const [a, k] of Object.entries(cases)) assert.equal(answerKind(a), k, JSON.stringify(a));
});

test("accept-all on the next line; tolerant without a header; close items with overlap and approve", () => {
  const b = parseBrief(`## Round 3 ✅ — D: PWR-D1…PWR-D4 settled · open: 0
Accept all recommendations of this round: >
> Y
### Q20 [D] Store the token hashed?
💡 My Recommendation: Option 2 — reasoning: PWR-R1
→ recorded: PWR-D5

## Close
🏗️ Design feat-password-reset — D: 5
- gap one
### O1 ⚠️ Overlap with feat-x — witness (1/2/3)
> 3
→ recorded: not an overlap
### Approve the design? (Y/n) — then /hitl:tasks
> y
`, ".hitl/changes/feat-password-reset/design-brief.md");
  assert.equal(b.kind, "design", "kind from the file name");
  assert.equal(b.items[0].code, "BRIEF_NO_HEADER");
  assert.deepEqual([b.rounds[0].acceptAll, b.round, b.status], [true, 3, "closing"]);
  assert.equal(b.questions[0].recommended, "Option 2 — reasoning: PWR-R1");
  assert.equal(b.close.items.length, 2);
  assert.deepEqual([b.close.items[0].answer, b.close.items[0].resolved], ["3", "recorded: not an overlap"]);
  assert.deepEqual([b.close.question, b.close.answer, b.close.kind, b.close.resolved], ["Approve the design? (Y/n) — then /hitl:tasks", "y", "accept", null]);
  assert.deepEqual(b.close.gaps, ["gap one"]);
  assert.deepEqual(b.counts, { questions: 1, pending: 1, answered: 1, unanswered: 0, notes: 0 });
  const g = parseBrief("# Plan brief — feat-a\n> change: feat-a | kind: plan | status: closing | round: 4\n\n## Close\n### Close with gaps? (round · deep <ID> · force)\n>\n");
  assert.deepEqual([g.close.kind, g.counts.unanswered], ["empty", 1]);
  assert.equal(parseBrief("# Plan brief — feat-a\n## Close\n### Close with gaps?\n> force, ship it\n").close.kind, "force");
  const done = parseBrief("# Plan brief — feat-a\n> change: feat-a | status: done\n## Close\n### Approve the spec? (Y/n)\n> Y\n→ approved 2026-11-19\n");
  assert.deepEqual([briefSummary(done).open, done.counts.unanswered], [false, 0]);
});

test("Notes blocks: empty, filled (vi, several lines), marked, in Close; only unmarked text is pending; never unanswered", () => {
  const b = parseBrief(`# Plan brief — feat-a
> change: feat-a | key: FA | kind: plan | status: open | round: 3

## Round 1 ✅
### Q1 [R] Who?
> admins
→ recorded: FA-R1

### Notes — anything the questions missed, or a change to an earlier answer
> sửa Q1: cả kế toán nữa
→ recorded: FA-R1 (changed)

## Round 2 ✅
### Q2 [R] Why?
> to save time
→ recorded: FA-R2

### Notes — anything the questions missed, or a change to an earlier answer
>

## Round 3 — Coverage: Scope ✅
Accept all recommendations of this round: >
### Q3 [R] How many rows?
💡 Recommended: 10 000.
>

### Notes — anything the questions missed, or a change to an earlier answer
> Xuất cả đơn hàng đã huỷ, đánh dấu cột trạng thái.
Thêm một dòng tổng ở cuối file.
`);
  const [n1, n2, n3] = b.rounds.map((r) => r.notes);
  assert.deepEqual([n1.text, n1.marked, n1.pending, n1.recorded], ["sửa Q1: cả kế toán nữa", true, false, ["FA-R1 (changed)"]], "marked: processed once, never again");
  assert.deepEqual([n2.text, n2.answered, n2.marked, n2.pending], ["", false, false, false], "empty Notes need no mark");
  assert.deepEqual([n3.text, n3.answered, n3.pending, n3.kind], ["Xuất cả đơn hàng đã huỷ, đánh dấu cột trạng thái.\nThêm một dòng tổng ở cuối file.", true, true, "text"]);
  assert.ok(!b.questions.some((q) => q.id === "notes"), "Notes are not questions");
  assert.deepEqual(b.counts, { questions: 3, pending: 2, answered: 1, unanswered: 1, notes: 1 }, "Q3 stays unanswered; the Notes count as an answer");
  assert.equal(briefSummary(b).notes, 1);
  // a round with only Notes filled has something to process
  const only = parseBrief("# Plan brief — feat-a\n> change: feat-a | status: open | round: 2\n## Round 2\n### Q4 [R] X?\n💡 Recommended: y\n>\n### Notes — …\n> one more thing: export by week too\n");
  assert.deepEqual([only.counts.answered, only.counts.unanswered, only.counts.notes, only.questions[0].answer], [1, 1, 1, ""], "the Notes answer is not Q4's");
  // a question in Notes: 💬 + carried mark
  const asked = parseBrief("## Round 2 ✅\n### Notes\n> tại sao không xuất Excel?\n💬 Excel needs a library…\n→ carried to Round 3\n");
  assert.deepEqual([asked.rounds[0].notes.discussed, asked.rounds[0].notes.carried, asked.rounds[0].notes.pending], [true, 3, false]);
  // Close: Notes before the approve question; neither is mixed into the other
  const c = parseBrief("# Plan brief — feat-a\n> change: feat-a | status: closing | round: 4\n## Close\n📋 summary\n\n### Notes — anything the questions missed, or a change to an earlier answer\n> also log who exported\n\n### Approve the spec? (Y/n) — then /hitl:design\n>\n");
  assert.deepEqual(c.close.items.map((it) => it.title), ["Approve the spec? (Y/n) — then /hitl:design"]);
  assert.deepEqual([c.close.notes.text, c.close.notes.pending, c.close.kind], ["also log who exported", true, "empty"]);
  assert.deepEqual(c.counts, { questions: 0, pending: 2, answered: 1, unanswered: 1, notes: 1 });
});

test("next step: an open brief round with unanswered questions → answer the file first", () => {
  const brief = { kind: "plan", file: ".hitl/changes/feat-a/plan-brief.md", status: "open", round: 2, open: true, unanswered: 3, pending: 4 };
  assert.equal(briefNext("feat-a", "spec", brief), "answer .hitl/changes/feat-a/plan-brief.md, then /hitl:plan feat-a");
  assert.equal(briefNext("feat-a", "spec", { ...brief, unanswered: 0 }), null, "all answered: just run the skill");
  assert.equal(briefNext("feat-a", "design", brief), null, "the plan brief does not drive the design phase");
  assert.equal(briefNext("feat-a", "design", { ...brief, kind: "design", file: "x/design-brief.md" }), "answer x/design-brief.md, then /hitl:design feat-a");
  assert.equal(nextForChange({ id: "feat-a", phase: "spec", brief }), "answer .hitl/changes/feat-a/plan-brief.md, then /hitl:plan feat-a");
  assert.equal(nextForChange({ id: "feat-a", phase: "spec", brief: { ...brief, open: false } }), "/hitl:plan feat-a");
  const n = computeNext({ tasks: [], statuses: { tasks: {} }, changes: [{ id: "feat-a", phase: "spec", brief }] });
  assert.equal(n.command, "answer .hitl/changes/feat-a/plan-brief.md, then /hitl:plan feat-a");
  assert.match(n.reason, /plan brief round 2 has 3 unanswered question/);
  assert.equal(pickBrief("spec", { plan: "P", design: "D" }), "P");
  assert.equal(pickBrief("design", { plan: "P", design: null }), "P");
  assert.equal(pickBrief("tasks", { plan: "P", design: "D" }), "D");
});

const DIR = ".hitl/changes/feat-export-csv";
const proposal = (id = "feat-export-csv", key = "FEC") => `<!-- audience: business -->\n# Export orders\n> change: ${id} | key: ${key} | status: draft | created: 2026-11-19 | updated: 2026-11-19\n\n## Why\nAccountants retype orders.\n\n## What changes\n- Admins export orders.\n`;
const newChange = () => {
  const root = specProject();
  fs.mkdirSync(path.join(root, DIR), { recursive: true });
  fs.writeFileSync(path.join(root, DIR, "proposal.md"), proposal());
  fs.writeFileSync(path.join(root, DIR, "plan-brief.md"), PLAN);
  return root;
};

test("hitl-index brief: parsed JSON; change/status --json carry brief and the answer-first next step; validate ignores briefs", () => {
  const root = newChange();
  const before = cli(root, "spec", "validate", "feat-export-csv", "--json");
  let r = cli(root, "brief", "feat-export-csv", "--json");
  assert.equal(r.code, 0, r.err);
  const b = r.json();
  assert.deepEqual([b.kind, b.round, b.counts.unanswered, b.summary.unanswered], ["plan", 2, 1, 1]);
  assert.equal(b.questions.find((q) => q.round === 2 && q.id === "Q8").kind, "unknown");
  r = cli(root, "brief", "feat-export-csv");
  assert.match(r.out, /📝 feat-export-csv — plan brief round 2 \(open\): 4 pending, 1 unanswered/);
  assert.match(r.out, /Q9 \[T\] Is an "export" the same as a "report"\? — unanswered/);
  assert.equal(cli(root, "brief", "feat-export-csv", "--kind", "design", "--json").code, 1, "no design brief");
  assert.equal(cli(root, "brief", "feat-password-reset").code, 1);
  assert.equal(cli(root, "brief", "--kind", "x", "feat-export-csv").code, 2);
  const c = cli(root, "change", "feat-export-csv", "--json").json().changes[0];
  assert.equal(c.phase, "spec");
  assert.deepEqual(c.brief, { kind: "plan", file: `${DIR}/plan-brief.md`, status: "open", round: 2, open: true, unanswered: 1, pending: 4, notes: 0 });
  assert.equal(c.next, `answer ${DIR}/plan-brief.md, then /hitl:plan feat-export-csv`);
  assert.equal(cli(root, "change", "feat-password-reset", "--json").json().changes[0].brief, undefined, "no brief file: no field");
  const s = cli(root, "status", "--json").json();
  assert.equal(s.changes.find((x) => x.id === "feat-export-csv").brief.unanswered, 1);
  assert.match(cli(root, "status", "--brief").out, /📝 feat-export-csv — plan brief round 2: 1 unanswered → answer \.hitl\/changes\/feat-export-csv\/plan-brief\.md, then \/hitl:plan feat-export-csv/);
  // every question answered → the next step is the skill itself
  fs.writeFileSync(path.join(root, DIR, "plan-brief.md"), PLAN.replace("### Q9 [T] Is an \"export\" the same as a \"report\"?\n>", "### Q9 [T] Is an \"export\" the same as a \"report\"?\n> no"));
  assert.equal(cli(root, "change", "feat-export-csv", "--json").json().changes[0].next, "/hitl:plan feat-export-csv");
  assert.match(cli(root, "status", "--brief").out, /📝 feat-export-csv — plan brief round 2: 0 unanswered → \/hitl:plan feat-export-csv/);
  // the brief files are not spec files: validate reports the same with and without them
  fs.writeFileSync(path.join(root, DIR, "design-brief.md"), "# Design brief — feat-export-csv\n### Q1 [D] `src/x.ts` SELECT * FROM t\n>\n");
  const after = cli(root, "spec", "validate", "feat-export-csv", "--json");
  assert.deepEqual(after.json().items, before.json().items);
});

test("hitl-index brief rename: moves the folder, rewrites meta lines and notes' source; refused once ids exist or a key is taken", () => {
  const root = newChange();
  // feat-password-reset waits for feat-export-csv (created --before it)
  let r = cli(root, "note", "add", "--change", "feat-password-reset", "--source", "feat-export-csv", "--kind", "order", "--text", "Export first.", "--json");
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(cli(root, "brief", "rename", "feat-export-csv", "--key", "PWR", "--json").json().code, "CHANGE_KEY_TAKEN");
  assert.equal(cli(root, "brief", "rename", "feat-export-csv", "--to", "feat-password-reset", "--json").json().code, "CHANGE_EXISTS");
  assert.equal(cli(root, "brief", "rename", "feat-export-csv", "--to", "Bad_Id", "--json").json().code, "ID_BAD_FORMAT");
  assert.equal(cli(root, "brief", "rename", "feat-export-csv").code, 2, "needs --to and/or --key");
  r = cli(root, "brief", "rename", "feat-export-csv", "--to", "feat-csv-export", "--key", "FCSV", "--json");
  assert.equal(r.code, 0, r.err + r.out);
  assert.deepEqual(r.json(), { ok: true, from: "feat-export-csv", to: "feat-csv-export", key: "FCSV", oldKey: "FEC", dir: ".hitl/changes/feat-csv-export", notesUpdated: ["feat-password-reset"] });
  assert.ok(!fs.existsSync(path.join(root, DIR)));
  const nd = path.join(root, ".hitl/changes/feat-csv-export");
  assert.match(fs.readFileSync(path.join(nd, "proposal.md"), "utf8"), /^> change: feat-csv-export \| key: FCSV \| status: draft/m);
  const brief = fs.readFileSync(path.join(nd, "plan-brief.md"), "utf8");
  assert.match(brief, /^# Plan brief — feat-csv-export$/m);
  assert.match(brief, /^> change: feat-csv-export \| key: FCSV \| kind: plan/m);
  assert.match(brief, /run \/hitl:plan feat-export-csv/, "only the meta lines change; the user's text stays");
  assert.match(fs.readFileSync(path.join(root, ".hitl/changes/feat-password-reset/notes.md"), "utf8"), /- source: feat-csv-export/);
  // once a delta exists the name is fixed
  fs.mkdirSync(path.join(nd, "specs/orders"), { recursive: true });
  fs.writeFileSync(path.join(nd, "specs/orders/spec.md"), "# Delta: Orders\n");
  r = cli(root, "brief", "rename", "feat-csv-export", "--key", "FCE", "--json");
  assert.equal(r.code, 1);
  assert.equal(r.json().code, "BRIEF_RENAME_LATE");
});

// ---- evals (dry): the 0.14 brief checks of evals/grade.mjs on synthetic transcripts and files (no claude calls)
test("evals (dry): plan-vi passes on a brief round 1 and fails on a chat round; design-r1 needs a 💡 on every question", async () => {
  const { gradeRun } = await import("../../evals/grade.mjs");
  const { spawnSync } = await import("node:child_process");
  const os = await import("node:os");
  const scenarios = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../evals/scenarios.json"), "utf8")).cases;
  const grade = (c, proj, last) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-grade-"));
    fs.symlinkSync(proj, path.join(dir, "proj"));
    spawnSync("git", ["init", "-q"], { cwd: proj });
    const ev = [{ type: "assistant", message: { content: [{ type: "text", text: last }] } }, { type: "result", result: last, total_cost_usd: 0 }];
    fs.writeFileSync(path.join(dir, "out.jsonl"), ev.map((e) => JSON.stringify(e)).join("\n"));
    return gradeRun({ suite: "behaviour", c, dir, proj, pluginDir: path.resolve(import.meta.dirname, "../.."), exit: 0 }).checks;
  };
  const c = scenarios.find((x) => x.id === "plan-vi");
  const id = "feat-deactivate-account";
  const root = specProject();
  const dir = path.join(root, ".hitl/changes", id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "proposal.md"), proposal(id, "FDCA") + "\n## Coverage\n| category | status | note |\n|---|---|---|\n| Scope & behaviour | ⚠️ | |\n");
  const desc = c.prompt.replace(`/hitl:plan ${id} `, "");
  const tpl = fs.readFileSync(path.resolve(import.meta.dirname, "../../shared/templates/plan-brief.md"), "utf8")
    .replaceAll("{change-id}", id).replaceAll("{KEY}", "FDCA").replace("{YYYY-MM-DD}", "2026-11-19")
    .replace(/\{the user's description, verbatim\.[^}]*\}/, desc).replace(/\{🔗 parent[^}]*\}\n/, "");
  fs.writeFileSync(path.join(dir, "plan-brief.md"), tpl);
  const chat = `📝 Brief ready: .hitl/changes/${id}/plan-brief.md — answer in the file, then run /hitl:plan ${id}`;
  let g = grade(c, root, chat);
  for (const k of ["plan_brief_written", "plan_brief_round1", "plan_brief_chat", "plan_coverage_table", "plan_change_created"]) assert.ok(g[k].ok, `${k}: ${g[k].why}`);
  assert.equal(grade(c, root, "🌳 Round 1\n❓ **Q1** [R] - **Who?**: …\n💡 Recommended: admins\nReply: Y").plan_brief_chat.ok, false, "a chat round fails");
  fs.writeFileSync(path.join(dir, "plan-brief.md"), tpl.replace(/(### Q3 .*\n)/, "$1💡 Recommended: admins only\n"));
  assert.equal(grade(c, root, chat).plan_brief_round1.ok, false, "a recommendation in plan round 1 fails");
  // design-r1: the template filled in, then one question without a recommendation
  const d = scenarios.find((x) => x.id === "design-r1");
  let n = 0;
  const filled = fs.readFileSync(path.resolve(import.meta.dirname, "../../shared/templates/design-brief.md"), "utf8")
    .replaceAll("{change-id}", "feat-password-reset").replaceAll("{KEY}", "PWR").replace(/Q\{n\}/g, () => `Q${++n}`);
  const pr = path.join(root, ".hitl/changes/feat-password-reset/design-brief.md");
  fs.writeFileSync(pr, filled);
  const dchat = "📝 Design brief ready: .hitl/changes/feat-password-reset/design-brief.md — answer, then /hitl:design feat-password-reset";
  g = grade(d, root, dchat);
  assert.ok(g.design_brief_r1.ok, g.design_brief_r1.why);
  assert.ok(g.design_brief_chat.ok, g.design_brief_chat.why);
  fs.writeFileSync(pr, filled.replace(/(### Q2 [^\n]*\n)💡 Recommended:[^\n]*\n/, "$1"));
  assert.equal(grade(d, root, dchat).design_brief_r1.ok, false);
});
