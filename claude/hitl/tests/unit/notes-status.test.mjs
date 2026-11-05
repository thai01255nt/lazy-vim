// 0.9 — notes in routing (computeNext), status --json/--brief, change --json and the archive precondition.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeNext } from "../../scripts/lib/nextstep.mjs";
import { cli, specProject } from "./notes.test.mjs";

const st = (o) => ({ tasks: Object.fromEntries(Object.entries(o).map(([id, [status, next]]) => [id, { status, next }])) });
const T = (id, prio = "P1", blockedBy = []) => ({ id, prio, blockedBy });

test("computeNext: reopen pending first; blocked frontier tasks are skipped; all blocked → apply the first note", () => {
  const tasks = [T("QT-T1"), T("QT-T2"), T("QT-T3", "P2")];
  const statuses = st({ "QT-T1": ["red", "/hitl:implement QT-T1"], "QT-T2": ["todo", "/hitl:skeleton QT-T2"], "QT-T3": ["todo", "/hitl:skeleton QT-T3"] });
  const n1 = { id: "N-1", title: "Link lasts 15 minutes", apply: "/hitl:plan feat-x amend N-1", change: "feat-x" };
  assert.equal(computeNext({ tasks, statuses }).command, "/hitl:implement QT-T1");
  let r = computeNext({ tasks, statuses, notes: { byTask: { "QT-T1": [n1] } } });
  assert.equal(r.command, "/hitl:skeleton QT-T2"); assert.match(r.reason, /skipped QT-T1 \(N-1\): blocked by notes/);
  r = computeNext({ tasks, statuses, notes: { byTask: { "QT-T1": [n1], "QT-T2": [n1], "QT-T3": [n1] } } });
  assert.deepEqual([r.task, r.command, r.change], ["QT-T1", "/hitl:plan feat-x amend N-1", "feat-x"]); assert.match(r.reason, /QT-T1 is blocked by N-1 \(Link lasts 15 minutes\)/);
  r = computeNext({ tasks, statuses, notes: { byTask: { "QT-T1": [n1] }, pending: [{ change: "feat-x", id: "N-2", title: "Recheck after N-1" }] } });
  assert.deepEqual([r.command, r.change], ["/hitl:approve feat-x reopen N-2", "feat-x"]);
  const drift = { items: [{ level: "warn", code: "SIG_CHANGED", symbol: "a#b", task: "QT-T1" }] };
  assert.equal(computeNext({ tasks, statuses, drift, lock: {}, notes: { pending: [{ change: "feat-x", id: "N-2", title: "x" }] } }).command, "/hitl:sync", "locked drift still first");
});

test("status --json/--brief and change --json show notes; archive refuses open notes even with --force", () => {
  const root = specProject();
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "PWR-R2.S1", "--text", "A new password must differ from the old one.").code, 0);
  const s = cli(root, "status", "--json").json();
  assert.deepEqual(s.tasks["PWR-T2"].notes.map((n) => [n.id, n.apply]), [["N-1", "/hitl:plan feat-password-reset amend N-1"]]);
  assert.deepEqual(s.tasks["PWR-T1"].notes, []);
  assert.deepEqual(s.changes[0].notes, { open: 1, reopenPending: 0, applied: 0, dismissed: 0, deferred: 0, total: 1, incoming: 0 });
  assert.equal(s.next.command, "/hitl:plan feat-password-reset amend N-1", "PWR-T2 is the only frontier task and it is blocked");
  const brief = cli(root, "status", "--brief").out;
  assert.match(brief, /📌 notes: feat-password-reset 1 open → \/hitl:plan feat-password-reset amend N-1/);
  assert.match(cli(root, "status").out, /\| todo 📌 N-1 \|/);
  const c = cli(root, "change", "feat-password-reset", "--json").json().changes[0];
  assert.equal(c.notes.open, 1);
  const a = cli(root, "spec", "archive", "feat-password-reset", "--dry-run", "--force", "--json");
  assert.equal(a.code, 1);
  const d = a.json();
  assert.equal(d.ok, false);
  assert.deepEqual(d.preconditions.notes.open.map((n) => [n.id, n.status]), [["N-1", "open"]]);
  assert.match(cli(root, "spec", "archive", "feat-password-reset", "--dry-run", "--force").out, /📌 N-1 .*--force does not skip notes/);
  // no notes file: nothing changes
  const clean = specProject();
  assert.equal(cli(clean, "status", "--json").json().changes[0].notes, null);
  assert.doesNotMatch(cli(clean, "status", "--brief").out, /📌/);
  assert.ok(!fs.existsSync(path.join(clean, ".hitl/changes/feat-password-reset/notes.md")));
});
