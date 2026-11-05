// 0.9 — the human-only reopen stage (per-AC unlock, done record into history) and the dismiss/defer note decisions.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { planApproval, emptyLock, openReopen } from "../../scripts/lib/lock.mjs";
import { parseNotes } from "../../scripts/lib/notes.mjs";
import { cli, specProject } from "./notes.test.mjs";

const NOW = "2026-11-05T10:00:00.000Z";
const F = "src/reset.ts", REQ = `${F}#ResetService.request`, HASH = `${F}#hashToken`;
const TT = (n) => `tests/reset.test.ts#reset > ${n}`;
const tasks = [
  { id: "T-12", change: "feat-x", acs: [{ id: "T-12.AC1", reqs: ["ACC-R5.S1"] }, { id: "T-12.AC2", reqs: ["ACC-R5.S2"] }, { id: "T-12.AC3", reqs: ["ACC-R5.S3"] }] },
  { id: "T-14", change: "feat-x", acs: [{ id: "T-14.AC1", reqs: ["ACC-BR1"] }] },
  { id: "T-15", change: "feat-x", acs: [{ id: "T-15.AC1", reqs: ["ACC-R6.S1"] }] },
];
const lt = (task, ac, covers = []) => ({ task, ac, covers, stage: "locked", bodyHash: `b-${ac}`, intentHash: "i", lockedAt: "t0", lockedBy: "human" });
const mkLock = () => ({ ...emptyLock(),
  symbols: { [REQ]: { task: "T-14", sigHash: "s" }, [HASH]: { task: "T-14", sigHash: "h" } },
  tests: { [TT("a1")]: lt("T-12", ["T-12.AC1"]), [TT("a2")]: lt("T-12", ["T-12.AC2"]), [TT("b1")]: lt("T-14", ["T-14.AC1"], [HASH]), [TT("b2")]: lt("T-14", [], [REQ]) },
  tasks: { "T-12": { skeletonAt: "t0", testsAt: "t0", doneAt: "t1", doneBodyHashes: { x: "h1" } }, "T-14": { skeletonAt: "t0", testsAt: "t0", doneAt: null, doneBodyHashes: {} } } });
const recheck = (id, reopen, o = {}) => ({ id, kind: "recheck", title: `Recheck ${id}`, refs: [], status: "reopen pending", acks: [], meta: { reopen }, ...o });
const plan = (notes, o = {}) => planApproval({ changeId: "feat-x", stage: "reopen", by: "human", tasks, notes, lock: mkLock(), index: { symbols: {} }, now: NOW, ...o });

test("tests class: only the locked tests of the listed ACs reopen; doneAt + doneBodyHashes move into reopened[]", () => {
  const r = plan([recheck("N-2", [{ task: "T-12", stage: "tests", acs: ["T-12.AC2"], symbols: [] }])]);
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.reopened, [{ task: "T-12", stage: "tests", acs: ["T-12.AC2"], tests: [TT("a2")], symbols: [] }]);
  const t = r.lock.tests[TT("a2")];
  assert.deepEqual([t.stage, t.reopenedAt, t.reopenNote, t.lockedBodyHash], ["reopened", NOW, "N-2", "b-T-12.AC2"]);
  assert.equal(r.lock.tests[TT("a1")].stage, "locked", "the other AC stays locked");
  const T = r.lock.tasks["T-12"];
  assert.equal(T.doneAt, null); assert.deepEqual(T.doneBodyHashes, {});
  assert.deepEqual(T.reopened, [{ at: NOW, by: "human", note: "N-2", change: "feat-x", acs: ["T-12.AC2"], symbols: [], tests: [TT("a2")], pending: ["tests"],
    prev: { doneAt: "t1", doneBodyHashes: { x: "h1" } } }]);
  assert.equal(openReopen(T).note, "N-2");
  assert.equal(T.testsAt, "t0", "testsAt stays (re-lock path)");
  assert.deepEqual(r.notes, ["N-2"]); assert.equal(r.empty, false);
});

test("contract class: skeleton markers on the listed symbols, their covering tests reopen, pending skeleton then tests", () => {
  const r = plan([recheck("N-3", [{ task: "T-14", stage: "skeleton", acs: [], symbols: [REQ] }])]);
  assert.equal(r.ok, true, r.reasons.join("; "));
  assert.deepEqual(r.lock.symbols[REQ].reopen, { at: NOW, note: "N-3" });
  assert.equal(r.lock.symbols[HASH].reopen, undefined);
  assert.deepEqual(Object.entries(r.lock.tests).filter(([, x]) => x.stage === "reopened").map(([id]) => id), [TT("b2")]);
  assert.deepEqual(r.lock.tasks["T-14"].reopened[0].pending, ["skeleton", "tests"]);
  assert.equal(r.lock.tasks["T-14"].reopened[0].prev.doneAt, null, "a task that was not done reopens too");
});

test("wording-only recheck closes with nothing unlocked; new-scenario needs the new AC first; merged notes", () => {
  const w = plan([recheck("N-4", [{ task: "T-12", stage: null, acs: [], symbols: [] }])]);
  assert.equal(w.ok, true); assert.equal(w.empty, true); assert.deepEqual(w.nothing, ["T-12"]);
  assert.deepEqual(w.lock, mkLock(), "lock untouched");
  const miss = plan([recheck("N-5", [{ task: "T-15", stage: "tests", acs: [], symbols: [], newAc: ["ACC-R6.S2"] }])]);
  assert.equal(miss.ok, false); assert.match(miss.reasons[0], /T-15 has no AC for ACC-R6\.S2 yet: \/hitl:tasks feat-x update first/);
  const ok = plan([recheck("N-5", [{ task: "T-12", stage: "tests", acs: [], symbols: [], newAc: ["ACC-R5.S3"] }])]);
  assert.equal(ok.ok, true, ok.reasons.join("; "));
  assert.deepEqual(ok.reopened[0], { task: "T-12", stage: "tests", acs: ["T-12.AC3"], tests: [], symbols: [] }, "the new AC has no locked test yet: /hitl:test fills it");
  const both = plan([recheck("N-2", [{ task: "T-12", stage: "tests", acs: ["T-12.AC1"], symbols: [] }]), recheck("N-6", [{ task: "T-12", stage: "tests", acs: ["T-12.AC2"], symbols: [] }])]);
  assert.deepEqual([both.reopened[0].acs, both.lock.tasks["T-12"].reopened[0].note], [["T-12.AC1", "T-12.AC2"], "N-2,N-6"]);
});

test("refusals: not human, archived change, no pending recheck, wrong note; idempotent on an already reopened task", () => {
  const n = [recheck("N-2", [{ task: "T-12", stage: "tests", acs: ["T-12.AC2"], symbols: [] }])];
  assert.match(plan(n, { by: "auto" }).reasons[0], /reopen is human-only/);
  assert.match(plan(n, { archived: true }).reasons[0], /archived: archived work never reopens/);
  assert.match(plan([]).reasons[0], /no recheck note of feat-x waits for reopen/);
  assert.match(plan(n, { noteId: "N-9" }).reasons[0], /N-9 not found/);
  assert.match(plan([...n, { id: "N-1", kind: "spec", status: "open", refs: [], acks: [], meta: {} }], { noteId: "N-1" }).reasons[0], /N-1 is a spec note \(open\), not a recheck waiting for reopen/);
  assert.match(plan(n, { taskId: "T-12" }).reasons[0], /takes --change/);
  const first = plan(n);
  const again = planApproval({ changeId: "feat-x", stage: "reopen", by: "human", tasks, notes: n, lock: first.lock, index: { symbols: {} }, now: NOW });
  assert.equal(again.ok, true); assert.match(again.warnings[0], /T-12 is already reopened by N-2/);
  assert.deepEqual(again.lock, first.lock);
});

test("CLI: reopen writes the lock + closes the recheck; wording-only says 'nothing to unlock (confirmed by human)'; dismiss and defer", () => {
  const root = specProject();
  const C = ["--change", "feat-password-reset"];
  const lf = path.join(root, ".hitl/index/skeleton.lock.json");
  const L = JSON.parse(fs.readFileSync(lf, "utf8"));
  L.tests = { [TT("a2")]: { task: "T-12", ac: ["T-12.AC2"], covers: [], stage: "locked", bodyHash: "b", intentHash: "i", kind: "example", origin: "test-author" } };
  fs.writeFileSync(lf, JSON.stringify(L));
  const notesFile = path.join(root, ".hitl/changes/feat-password-reset/notes.md");
  // wording on locked T-12 → a recheck with nothing to unlock
  assert.equal(cli(root, "note", "apply", ...C, "--impact", "ACC-R5.S1=wording").code, 0);
  let r = cli(root, "approve", ...C, "--stage", "reopen", "--by", "human");
  assert.equal(r.code, 0, r.out + r.err);
  assert.match(r.out, /✅ N-1 closed: wording only, nothing to unlock \(confirmed by human\)/);
  assert.equal(JSON.parse(fs.readFileSync(lf, "utf8")).tasks["T-12"].doneAt, "2026-10-28T10:00:00Z", "nothing moved");
  assert.equal(parseNotes(fs.readFileSync(notesFile, "utf8")).notes[0].status, "applied");
  // behaviour → reopen
  assert.equal(cli(root, "note", "apply", ...C, "--impact", "ACC-R5.S2=behaviour").code, 0);
  assert.equal(cli(root, "approve", ...C, "--stage", "reopen", "--by", "auto").code, 2);
  assert.equal(cli(root, "approve", ...C, "--stage", "reopen", "--force").code, 2);
  r = cli(root, "approve", ...C, "--stage", "reopen", "--note", "N-2", "--by", "human", "--dry-run", "--json");
  assert.equal(r.code, 0, r.out); assert.equal(JSON.parse(fs.readFileSync(lf, "utf8")).tests[TT("a2")].stage, "locked", "dry run writes nothing");
  r = cli(root, "approve", ...C, "--stage", "reopen", "--note", "N-2", "--by", "human", "--json");
  assert.equal(r.code, 0, r.out);
  assert.equal(r.json().next, "/hitl:test T-12");
  const after = JSON.parse(fs.readFileSync(lf, "utf8"));
  assert.equal(after.tests[TT("a2")].stage, "reopened"); assert.equal(after.tasks["T-12"].doneAt, null);
  let ns = parseNotes(fs.readFileSync(notesFile, "utf8")).notes;
  assert.match(ns[1].resolved, /reopened .* by human: T-12 tests/);
  // dismiss / defer
  assert.equal(cli(root, "note", "add", ...C, "--kind", "spec", "--refs", "ACC-R6.S1", "--text", "Ask twice for the new password.").code, 0);
  assert.equal(cli(root, "note", "add", ...C, "--kind", "design", "--refs", "D-2", "--text", "Email normalising moves to the gateway.").code, 0);
  assert.equal(cli(root, "approve", ...C, "--stage", "dismiss", "--note", "N-3", "--by", "human").code, 2, "--reason required");
  assert.equal(cli(root, "approve", ...C, "--stage", "dismiss", "--by", "human", "--reason", "x").code, 2, "--note required");
  assert.equal(cli(root, "approve", ...C, "--stage", "dismiss", "--note", "N-3", "--reason", "x", "--by", "auto").code, 2);
  r = cli(root, "approve", ...C, "--stage", "dismiss", "--note", "N-3", "--reason", "Product kept a single field", "--by", "human");
  assert.equal(r.code, 0, r.out); assert.match(r.out, /N-3 .* dismissed by human: Product kept a single field/);
  assert.equal(cli(root, "approve", ...C, "--stage", "dismiss", "--note", "N-3", "--reason", "x", "--by", "human").code, 1, "already dismissed");
  // defer needs another active change: make a minimal one
  fs.mkdirSync(path.join(root, ".hitl/changes/feat-gateway"), { recursive: true });
  fs.writeFileSync(path.join(root, ".hitl/changes/feat-gateway/proposal.md"), "# Gateway\n> change: feat-gateway | type: feat | status: draft\n");
  assert.equal(cli(root, "approve", ...C, "--stage", "defer", "--note", "N-4", "--to", "feat-nope", "--by", "human").code, 1);
  assert.equal(cli(root, "approve", ...C, "--stage", "defer", "--note", "N-4", "--to", "feat-password-reset", "--by", "human").code, 1);
  r = cli(root, "approve", ...C, "--stage", "defer", "--note", "N-4", "--to", "feat-gateway", "--by", "human", "--json");
  assert.equal(r.code, 0, r.out);
  assert.deepEqual([r.json().newNote, r.json().dropped], ["N-1", ["D-2"]]);
  ns = parseNotes(fs.readFileSync(notesFile, "utf8")).notes;
  assert.deepEqual([ns[3].status, ns[3].deferredTo], ["deferred", { change: "feat-gateway", note: "N-1" }]);
  assert.match(fs.readFileSync(notesFile, "utf8"), /- status: deferred → feat-gateway \(N-1 there\)/);
  const tgt = parseNotes(fs.readFileSync(path.join(root, ".hitl/changes/feat-gateway/notes.md"), "utf8")).notes[0];
  assert.deepEqual([tgt.status, tgt.kind, tgt.from, tgt.refs, tgt.text], ["open", "design", "deferred from feat-password-reset N-4", [], "Email normalising moves to the gateway."]);
});
