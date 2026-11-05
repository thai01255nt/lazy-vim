// 0.12 — notes from another change (`source: B`): the whole-change wait, the forced amend after B's archive, B gone,
// `note add --source`, routing and status, the archive precondition and unblock report, the `before:` meta (display
// only), and the implementer hook deny.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { planApproval, emptyLock } from "../../scripts/lib/lock.mjs";
import { emptyState } from "../../scripts/lib/state.mjs";
import { parseNotes, renderNotes, incomingState, changeWait, waitReasons, blocksArchive, applyCommand, noteCounts, blockingNotes } from "../../scripts/lib/notes.mjs";
import { computeNext } from "../../scripts/lib/nextstep.mjs";
import { parseProposal } from "../../scripts/lib/specmd.mjs";
import { fixtureIndex, TASKS } from "./status.test.mjs";
import { cli, specProject } from "./notes.test.mjs";

const NOW = "2026-11-06T00:00:00.000Z";
const TASK = { ...TASKS[0], change: "feat-a", acs: [{ id: "T-1.AC1", reqs: ["ACC-R1.S1"], text: "x" }], decisions: [] };
const note = (id, o = {}) => ({ id, title: `note ${id}`, kind: "order", source: "feat-b", sourceState: "active", refs: [], refTitles: {}, status: "open", acks: [], meta: {}, text: "", ...o });
const base = (o) => ({ taskId: "T-1", index: fixtureIndex(), lock: emptyLock(), state: emptyState(), config: {}, task: TASK, tasks: [TASK], now: NOW, by: "human", ...o });

test("source: round trip; incomingState per status and source state; counts; applyCommand", () => {
  const n = note("N-1", { sourceState: undefined, text: "B first." });
  const text = renderNotes("feat-a", [n, { ...note("N-2", { kind: "spec", refs: ["ACC-R1"] }), source: null, sourceState: undefined }]);
  assert.match(text, /## N-1 note N-1\n- kind: order\n- source: feat-b\n- refs: none/);
  assert.doesNotMatch(text.split("## N-2")[1], /source:/);
  const p = parseNotes(text);
  assert.equal(p.notes[0].source, "feat-b"); assert.equal(p.notes[1].source, null);
  // tolerant of the dropped 0.10 reconcile record
  assert.equal(parseNotes(`# Notes — x\n\n> Reconciled: feat-b 2026-11-01 (archived)\n<!-- hitl-notes {"reconciled":{}} -->\n\n## N-1 a\n- kind: spec\n- refs: none\n- status: open\n`).notes.length, 1);
  const S = (o) => incomingState(note("N-1", o));
  assert.equal(S({}), "wait");
  assert.equal(S({ status: "applied" }), "wait", "applied but B still active: still waits");
  assert.equal(S({ sourceState: "gone" }), "wait", "B gone: waits until the human dismisses");
  assert.equal(S({ status: "dismissed" }), null);
  assert.equal(S({ status: "deferred" }), null);
  assert.equal(S({ sourceState: "archived" }), null, "an order note clears once B is archived");
  assert.equal(S({ sourceState: "archived", kind: "spec" }), "amend", "an unapplied spec note forces the amend");
  assert.equal(S({ sourceState: "archived", kind: "design", status: "applied" }), null);
  assert.equal(incomingState({ ...note("N-1"), source: null }), null);
  const c = noteCounts([note("N-1"), note("N-2", { sourceState: "archived" }), note("N-3", { kind: "spec", sourceState: "archived" })]);
  assert.deepEqual([c.open, c.incoming], [2, 2], "the cleared order note is not open");
  assert.equal(applyCommand("feat-a", note("N-1")), "/hitl:flow feat-b");
  assert.equal(applyCommand("feat-a", note("N-1", { kind: "spec" })), "/hitl:plan feat-a amend N-1");
  assert.equal(applyCommand("feat-a", note("N-1", { kind: "design" })), "/hitl:design feat-a amend N-1");
  assert.equal(blocksArchive(note("N-1", { status: "applied" })), true);
  assert.equal(blocksArchive(note("N-1", { sourceState: "archived" })), false);
  assert.equal(blockingNotes([note("N-1", { kind: "spec", refs: ["T-1"] })], { task: { id: "T-1", acs: [] }, symIds: [] }).block.length, 0, "per-task matching skips source notes");
});

test("changeWait + reasons: waits grouped by source, gone, amend", () => {
  const w = changeWait([note("N-1"), note("N-2", { kind: "spec", status: "applied" }), note("N-3", { source: "feat-c", sourceState: "gone" }), note("N-4", { kind: "spec", source: "feat-d", sourceState: "archived" })]);
  assert.equal(w.blocked, true);
  assert.deepEqual(w.waits, [{ source: "feat-b", state: "active", notes: ["N-1", "N-2"] }, { source: "feat-c", state: "gone", notes: ["N-3"] }]);
  assert.deepEqual(w.amend.map((n) => n.id), ["N-4"]);
  const r = waitReasons("feat-a", w);
  assert.match(r[0], /⏳ feat-a waits for feat-b \(N-1, N-2\): every task approval, implement and the archive of feat-a wait until feat-b is archived/);
  assert.match(r[1], /feat-c is gone .*\/hitl:approve feat-a dismiss/);
  assert.match(r[2], /📥 N-4 from feat-d \(archived\) is not applied yet: \/hitl:plan feat-a amend N-4/);
  assert.equal(changeWait([note("N-1", { status: "dismissed" })]).blocked, false);
});

test("planApproval: a wait refuses every task stage of the change, for every approver; --ack and --force do not help", () => {
  for (const stage of ["skeleton", "tests", "done"]) for (const o of [{}, { force: true }, { by: "auto", task: { ...TASK, risk: "low" } }, { by: "human-override" }]) {
    const r = planApproval(base({ stage, ...o, notes: [note("N-1")] }));
    assert.equal(r.ok, false, `${stage} ${JSON.stringify(o)}`);
    assert.match(r.reasons[0], /⏳ feat-a waits for feat-b \(N-1\)/);
    assert.deepEqual(r.blockedBy.map((b) => [b.note, b.source, b.wait]), [["N-1", "feat-b", "active"]]);
  }
  const ack = planApproval(base({ ack: ["N-1"], notes: [note("N-1")] }));
  assert.equal(ack.ok, false); assert.match(ack.reasons.join(";"), /--ack N-1: a note from another change cannot be acked/);
  // B archived: the order note clears; an unapplied spec note forces the amend; applied → free
  assert.equal(planApproval(base({ notes: [note("N-1", { sourceState: "archived" })] })).ok, true);
  const am = planApproval(base({ notes: [note("N-2", { kind: "spec", refs: ["T-9"], sourceState: "archived" })] }));
  assert.equal(am.ok, false); assert.match(am.reasons[0], /📥 N-2 from feat-b \(archived\) is not applied yet: \/hitl:plan feat-a amend N-2/);
  assert.equal(planApproval(base({ notes: [note("N-2", { kind: "spec", sourceState: "archived", status: "applied" })] })).ok, true);
  assert.equal(planApproval(base({ notes: [note("N-1", { status: "dismissed" })] })).ok, true);
});

test("computeNext: amend first; tasks of a waiting change are skipped; all waiting → the other change's next step; gone → dismiss", () => {
  const T = (id, change) => ({ id, prio: "P1", blockedBy: [], change });
  const tasks = [T("T-1", "feat-a"), T("T-2", "feat-b")];
  const statuses = { tasks: { "T-1": { status: "todo", next: "/hitl:skeleton T-1" }, "T-2": { status: "todo", next: "/hitl:skeleton T-2" } } };
  const waits = [{ change: "feat-a", for: [{ change: "feat-b", state: "active", notes: ["N-1"] }], amend: [] }];
  let r = computeNext({ tasks, statuses, notes: { waits } });
  assert.equal(r.command, "/hitl:skeleton T-2"); assert.match(r.reason, /skipped T-1 \(waits for feat-b\)/);
  r = computeNext({ tasks: [tasks[0]], statuses, notes: { waits }, changes: [{ id: "feat-b", phase: "design" }] });
  assert.deepEqual([r.command, r.change], ["/hitl:design feat-b", "feat-b"]); assert.match(r.reason, /feat-a waits for feat-b \(N-1\) until it is archived/);
  r = computeNext({ tasks: [tasks[0]], statuses, notes: { waits: [{ change: "feat-a", for: [{ change: "feat-b", state: "gone", notes: ["N-1"] }], amend: [] }] } });
  assert.equal(r.command, "/hitl:approve feat-a dismiss N-1 <reason>");
  r = computeNext({ tasks, statuses, notes: { waits: [{ change: "feat-a", for: [], amend: [{ id: "N-3", title: "x", source: "feat-b", apply: "/hitl:plan feat-a amend N-3" }] }] } });
  assert.deepEqual([r.command, r.change], ["/hitl:plan feat-a amend N-3", "feat-a"]);
  r = computeNext({ tasks: [], statuses: { tasks: {} }, notes: { waits }, changes: [{ id: "feat-a", phase: "archive-ready" }, { id: "feat-b", phase: "spec" }] });
  assert.equal(r.command, "/hitl:plan feat-b", "a waiting archive-ready change is not offered for archive");
});

test("proposal `| before: a, b` is parsed for display only", () => {
  const p = parseProposal("# T\n> change: feat-b | status: draft | created: 2026-11-06 | updated: 2026-11-06 | before: feat-a, feat-c\n\n## Why\nx\n## What changes\nx\n## Capabilities\nnone (no behaviour change)\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n", "p.md");
  assert.deepEqual(p.before, ["feat-a", "feat-c"]);
  assert.equal(p.links, undefined);
});

/** spec-app + a second active change feat-b (proposal only). */
function twoChanges() {
  const root = specProject();
  const dir = path.join(root, ".hitl/changes/feat-b");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "proposal.md"), "<!-- audience: business -->\n# Report\n> change: feat-b | status: draft | created: 2026-11-06 | updated: 2026-11-06 | before: feat-password-reset\n\n## Why\nx\n\n## What changes\n- x\n\n## Capabilities\n| capability | key | change | requirements |\n|---|---|---|---|\n| reporting | REP | new | |\n\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| spec delta | included | always |\n");
  return root;
}

test("note add --source: guards; waits show in note list, status, change and the archive; dismiss of an applied note whose source is gone", () => {
  const root = twoChanges();
  const C = "feat-password-reset";
  const add = (...a) => cli(root, "note", "add", "--change", C, "--kind", "order", "--text", "B first.", ...a);
  assert.equal(add("--source", C).code, 1);
  assert.match(add("--source", C, "--json").out, /--source must name another change/);
  assert.match(add("--source", "feat-zzz", "--json").out, /no such change/);
  const ok = add("--source", "feat-b");
  assert.equal(ok.code, 0, ok.out + ok.err); assert.match(ok.out, /⏳ feat-password-reset now waits for feat-b/);
  const l = cli(root, "note", "list", "--change", C, "--json").json().changes[0].notes[0];
  assert.deepEqual([l.source, l.sourceState, l.wait], ["feat-b", "active", "wait"]);
  assert.deepEqual(l.blocks, ["T-12", "T-13"], "every task of the change");
  const s = cli(root, "status", "--json").json();
  assert.deepEqual(s.tasks["T-13"].wait.for, [{ change: "feat-b", state: "active", notes: ["N-1"] }]);
  assert.equal(s.changes.find((c) => c.id === C).wait.for[0].change, "feat-b");
  assert.match(s.next.reason, /feat-password-reset waits for feat-b/);
  assert.equal(s.next.command, "/hitl:plan feat-b");
  assert.match(cli(root, "status", "--brief").out, /⏳ feat-password-reset waits for feat-b \(N-1\)/);
  const ch = cli(root, "change", "--json").json().changes;
  assert.deepEqual(ch.find((c) => c.id === "feat-b").blocks, [{ change: C, notes: ["N-1"] }]);
  assert.deepEqual(ch.find((c) => c.id === "feat-b").before, [C]);
  assert.match(cli(root, "change").out, /📤 feat-b blocks feat-password-reset \(N-1\)/);
  const a = cli(root, "spec", "archive", C, "--dry-run", "--force", "--json").json();
  assert.equal(a.ok, false); assert.match(a.preconditions.notes.wait[0], /waits for feat-b/);
  assert.match(cli(root, "spec", "archive", C, "--dry-run", "--force").out, /❌ ⏳ feat-password-reset waits for feat-b .*--force does not skip it/);
  // B deleted → gone: still blocks; the human may dismiss even an applied note
  fs.rmSync(path.join(root, ".hitl/changes/feat-b"), { recursive: true });
  assert.equal(cli(root, "note", "list", "--change", C, "--json").json().changes[0].notes[0].sourceState, "gone");
  assert.match(cli(root, "status", "--brief").out, /feat-b \(gone: dismiss its notes\)/);
  const nf = path.join(root, ".hitl/changes", C, "notes.md");
  fs.writeFileSync(nf, fs.readFileSync(nf, "utf8").replace("- status: open", "- status: applied"));
  const d = cli(root, "approve", "--change", C, "--stage", "dismiss", "--note", "N-1", "--reason", "B dropped", "--by", "human");
  assert.equal(d.code, 0, d.out);
  assert.equal(cli(root, "status", "--json").json().changes.find((c) => c.id === C).wait, undefined);
  assert.match(add("--source", "feat-b", "--json").out, /no such change/);
});

test("archive of B reports the changes it unblocks and their forced amend", () => {
  const root = specProject();
  // B = the spec-app change itself (archivable with --force); A = a second change waiting for it
  const A = path.join(root, ".hitl/changes/feat-a");
  fs.mkdirSync(A, { recursive: true });
  fs.writeFileSync(path.join(A, "proposal.md"), "<!-- audience: business -->\n# A\n> change: feat-a | status: draft | created: 2026-11-06 | updated: 2026-11-06\n\n## Why\nx\n\n## What changes\n- x\n\n## Capabilities\n| capability | key | change | requirements |\n|---|---|---|---|\n| reporting | REP | new | |\n\n## Artifacts\n| artifact | decision | why |\n|---|---|---|\n| spec delta | included | always |\n");
  const B = "feat-password-reset";
  assert.equal(cli(root, "note", "add", "--change", "feat-a", "--source", B, "--kind", "order", "--text", "wait").code, 0);
  fs.appendFileSync(path.join(A, "notes.md"), "\n## N-2 Show the reset date\n- kind: spec\n- source: feat-password-reset\n- refs: none\n- status: open\n- from: /hitl:plan feat-password-reset · 2026-11-06\n\nA must show it.\n");
  const r = cli(root, "spec", "archive", B, "--force", "--json");
  assert.equal(r.code, 0, r.out);
  const u = r.json().archive.unblocked;
  assert.deepEqual(u.map((x) => [x.change, x.notes, x.amend.map((n) => n.id), x.stillBlocked]), [["feat-a", ["N-1", "N-2"], ["N-2"], true]]);
  const s = cli(root, "status", "--json").json();
  assert.equal(s.next.command, "/hitl:plan feat-a amend N-2");
});
