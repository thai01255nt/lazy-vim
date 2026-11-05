// 0.9 — open notes block a task's approvals (skeleton, tests, done); --ack (human, per task) releases one task.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planApproval, emptyLock } from "../../scripts/lib/lock.mjs";
import { emptyState } from "../../scripts/lib/state.mjs";
import { renderNotes, parseNotes } from "../../scripts/lib/notes.mjs";
import { fixtureIndex, TASKS, IDS } from "./status.test.mjs";
import { makeProject, TASKS as PTASKS } from "./_project.mjs";
import { loadConfig } from "../../scripts/lib/config.mjs";
import { updateIndex } from "../../scripts/lib/indexer.mjs";
import { run as approveCmd } from "../../scripts/cmd/approve.mjs";

const { CU } = IDS;
const NOW = "2026-11-05T00:00:00.000Z";
const TASK = { ...TASKS[0], change: "feat-users", acs: [{ id: "T-1.AC1", reqs: ["ACC-R1.S1"], text: "dup" }, { id: "T-1.AC2", reqs: [], text: "ok" }], decisions: ["D-1"] };
const note = (id, refs, o = {}) => ({ id, title: `note ${id}`, kind: "spec", refs, refTitles: {}, status: "open", acks: [], meta: {}, text: "", ...o });
const base = (o) => ({ taskId: "T-1", index: fixtureIndex(), lock: emptyLock(), state: emptyState(), config: {}, task: TASK, tasks: [TASK], now: NOW, by: "human", ...o });

test("each hit type refuses skeleton, tests and done; --force, --by auto and human-override do not skip it", () => {
  const idx = fixtureIndex(); idx.symbols[CU].tags.dec = ["D-9"];
  const lockedCU = { ...emptyLock(), symbols: { [CU]: { task: "T-1" } } };
  const cases = [["T-1.AC1"], ["ACC-R1.S1"], ["ACC-R1"], ["D-1"], ["UserService.createUser"], ["D-9"], ["T-1"]];
  for (const refs of cases) for (const stage of ["skeleton", "tests", "done"]) {
    const n = note("N-1", refs, refs[0] === "UserService.createUser" ? { meta: { symbols: { "UserService.createUser": CU } } } : {});
    const r = planApproval(base({ stage, index: idx, lock: lockedCU, notes: [n] }));
    assert.equal(r.ok, false, `${refs} ${stage}`);
    assert.match(r.reasons[0], new RegExp(`📌 N-1 \\(note N-1\\) touches T-1 via ${refs[0].replace(/\./g, "\\.")}`));
    assert.deepEqual(r.blockedBy.map((b) => [b.note, b.apply]), [["N-1", "/hitl:plan feat-users amend N-1"]]);
  }
  for (const o of [{ force: true }, { by: "auto", task: { ...TASK, risk: "low" } }, { by: "human-override" }]) {
    const r = planApproval(base({ ...o, notes: [note("N-1", ["T-1"])] }));
    assert.equal(r.ok, false, JSON.stringify(o)); assert.match(r.reasons.join(";"), /📌 N-1/);
  }
  const miss = planApproval(base({ notes: [note("N-1", ["T-2", "ACC-R2.S1", "D-2"])] }));
  assert.equal(miss.ok, true, miss.reasons.join("; "));
});

test("statuses: applied/dismissed/deferred never block; reopen pending blocks and cannot be acked; no refs only warns", () => {
  for (const status of ["applied", "dismissed", "deferred"]) assert.equal(planApproval(base({ notes: [note("N-1", ["T-1"], { status })] })).ok, true, status);
  const pend = planApproval(base({ notes: [note("N-2", ["T-1"], { status: "reopen pending", kind: "recheck" })] }));
  assert.equal(pend.ok, false); assert.match(pend.reasons[0], /\/hitl:approve feat-users reopen N-2/);
  const pa = planApproval(base({ ack: ["N-2"], notes: [note("N-2", ["T-1"], { status: "reopen pending", kind: "recheck" })] }));
  assert.match(pa.reasons.join(";"), /--ack N-2: .* is a recheck waiting for \/hitl:approve feat-users reopen N-2/);
  const w = planApproval(base({ notes: [note("N-3", [])] }));
  assert.equal(w.ok, true); assert.match(w.warnings[0], /N-3 \(note N-3\) is open and has no refs/);
});

test("--ack: releases only the named note for this task, human only, unknown/unrelated ids refused; an existing ack keeps covering the task", () => {
  const notes = [note("N-1", ["T-1"]), note("N-2", ["ACC-R1"])];
  const one = planApproval(base({ ack: ["N-1"], notes }));
  assert.equal(one.ok, false); assert.match(one.reasons.join(";"), /N-2/); assert.doesNotMatch(one.reasons.join(";"), /📌 N-1/);
  const both = planApproval(base({ ack: ["N-1", "N-2"], notes }));
  assert.equal(both.ok, true, both.reasons.join("; ")); assert.deepEqual(both.noteAcks, ["N-1", "N-2"]);
  assert.match(planApproval(base({ ack: ["N-9"], notes: [] })).reasons[0], /--ack N-9: no such note in feat-users/);
  assert.match(planApproval(base({ ack: ["N-1"], notes: [note("N-1", ["T-7"])] })).reasons[0], /--ack N-1: .* does not block T-1/);
  assert.match(planApproval(base({ ack: ["N-1"], by: "auto", notes })).reasons[0], /--ack is human-only/);
  const later = planApproval(base({ stage: "tests", notes: [note("N-1", ["T-1"], { acks: [{ task: "T-1", at: "2026-11-05" }] })] }));
  assert.doesNotMatch(later.reasons.join(";"), /📌/, "acked for T-1: all stages of T-1");
  assert.match(later.warnings.join(";"), /is open but acked for T-1/);
  const other = planApproval(base({ notes: [note("N-1", ["T-1"], { acks: [{ task: "T-2" }] })] }));
  assert.equal(other.ok, false, "an ack for another task does not count");
});

test("approve CLI: blocked → exit 1 with blockedBy; --ack writes `acked: T-1` and the note stays open; --by auto --ack is a usage error", async () => {
  const root = makeProject({ ".hitl/changes/feat-users/tasks.md": PTASKS.replace("← Planning: .hitl/planning/feat-users.md", "← Change: feat-users") });
  rmSync(join(root, ".hitl/tasks/feat-users.md"));
  const nfile = join(root, ".hitl/changes/feat-users/notes.md");
  writeFileSync(nfile, renderNotes("feat-users", [note("N-1", ["T-1"], { from: "user", at: "2026-11-05" })]));
  const config = await loadConfig(root);
  await updateIndex(root, null, { config });
  const cli = async (args) => {
    const log = console.log, err = console.error; const out = [];
    console.log = (...a) => out.push(a.join(" ")); console.error = (...a) => out.push(a.join(" "));
    try { return { code: await approveCmd(args, { root, config, json: true }), out: out.join("\n") }; } finally { console.log = log; console.error = err; }
  };
  let r = await cli(["T-1", "--stage", "skeleton", "--by", "human"]);
  assert.equal(r.code, 1, r.out);
  const d = JSON.parse(r.out);
  assert.equal(d.blockedBy[0].note, "N-1"); assert.equal(d.suggest, "/hitl:plan feat-users amend N-1");
  assert.equal((await cli(["T-1", "--stage", "skeleton", "--by", "auto", "--ack", "N-1"])).code, 2);
  assert.equal((await cli(["T-1", "--ack", "x1"])).code, 2);
  const before = readFileSync(nfile, "utf8");
  r = await cli(["T-1", "--stage", "skeleton", "--by", "human", "--ack", "N-1", "--dry-run"]);
  assert.equal(r.code, 0, r.out); assert.equal(readFileSync(nfile, "utf8"), before, "dry run records no ack");
  r = await cli(["T-1", "--stage", "skeleton", "--by", "human", "--ack", "N-1"]);
  assert.equal(r.code, 0, r.out); assert.deepEqual(JSON.parse(r.out).acked, ["N-1"]);
  const n = parseNotes(readFileSync(nfile, "utf8")).notes[0];
  assert.equal(n.status, "open"); assert.deepEqual(n.acks.map((a) => a.task), ["T-1"]);
});
