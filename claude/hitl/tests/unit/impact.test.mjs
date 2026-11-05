// 0.9 — impact of an amendment on locked work (computeImpact) and `hitl-index note apply`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeImpact, parseImpact, classErrors, impactLine, hasLockedWork } from "../../scripts/lib/impact.mjs";
import { parseNotes } from "../../scripts/lib/notes.mjs";
import { cli, specProject } from "./notes.test.mjs";

const F = "src/reset.ts";
const REQ = `${F}#ResetService.request`, HASH = `${F}#hashToken`, MAIL = `${F}#sendMail`;
const TT = (n) => `tests/reset.test.ts#reset > ${n}`;
const index = { symbols: {
  [REQ]: { id: REQ, name: "ResetService.request", file: F, kind: "method", tags: { task: ["T-14"], dec: [] } },
  [HASH]: { id: HASH, name: "hashToken", file: F, kind: "function", tags: { task: ["T-14"], dec: ["D-1"] } },
  [MAIL]: { id: MAIL, name: "sendMail", file: F, kind: "function", tags: { task: ["T-12"], dec: [] } },
} };
const tasks = [
  { id: "T-12", acs: [{ id: "T-12.AC1", reqs: ["ACC-R5.S1"] }, { id: "T-12.AC2", reqs: ["ACC-R5.S2"] }], decisions: [], symbols: [] },
  { id: "T-13", acs: [{ id: "T-13.AC1", reqs: ["ACC-R6.S1"] }], decisions: [], symbols: [] },
  { id: "T-14", acs: [{ id: "T-14.AC1", reqs: ["ACC-R5.S2"] }, { id: "T-14.AC2", reqs: ["ACC-BR1"] }], decisions: ["D-1"], symbols: [] },
];
const lt = (o) => ({ test: { task: o.task, ac: o.ac, covers: o.covers || [], stage: o.stage || "locked" } }).test;
const lock = {
  symbols: { [REQ]: { task: "T-14" }, [HASH]: { task: "T-14" }, [MAIL]: { task: "T-12" } },
  tests: { [TT("a1")]: lt({ task: "T-12", ac: ["T-12.AC1"], covers: [MAIL] }), [TT("a2")]: lt({ task: "T-12", ac: ["T-12.AC2"], covers: [MAIL] }),
    [TT("b1")]: lt({ task: "T-14", ac: ["T-14.AC1"], covers: [REQ] }), [TT("b2")]: lt({ task: "T-14", ac: ["T-14.AC2"], covers: [HASH] }), [TT("stub")]: lt({ task: "T-13", ac: ["T-13.AC1"], stage: "stub" }) },
  tasks: { "T-12": { skeletonAt: "x", testsAt: "x", doneAt: "x" }, "T-14": { skeletonAt: "x", testsAt: "x" } },
};
const imp = (entries) => computeImpact({ entries, tasks, index, lock, resolve: (r) => (r === "hashToken" ? { id: HASH } : null) });
const by = (r, T) => r.tasks.find((x) => x.task === T);

test("parseImpact / classErrors / hasLockedWork", () => {
  assert.deepEqual(parseImpact("ACC-R5.S2=behaviour, D-1=contract").entries, [{ ref: "ACC-R5.S2", class: "behaviour" }, { ref: "D-1", class: "contract" }]);
  assert.match(parseImpact("ACC-R5.S2=big").errors[0], /class must be one of wording\|behaviour\|contract\|scenario\|requirement/);
  assert.match(parseImpact("ACC-R5.S2").errors[0], /not <ref>=<class>/);
  assert.match(classErrors([{ ref: "D-1", class: "behaviour" }])[0], /use contract/);
  assert.match(classErrors([{ ref: "ACC-R5.S2", class: "requirement" }])[0], /new requirement id/);
  assert.deepEqual(classErrors([{ ref: "ACC-R5.S3", class: "scenario" }, { ref: "ACC-R9", class: "requirement" }]), []);
  assert.ok(hasLockedWork(lock, "T-12") && hasLockedWork(lock, "T-14") && !hasLockedWork(lock, "T-13"));
});

test("wording: nothing reopens, but locked tasks it touches need a recheck", () => {
  const r = imp([{ ref: "ACC-R5.S2", class: "wording" }]);
  assert.deepEqual(r.tasks.map((x) => [x.task, x.locked, x.reopen]), [["T-12", true, null], ["T-14", true, null]]);
  assert.deepEqual(r.counts, { tests: 0, skeletons: 0, tasks: 0 });
  assert.equal(r.recheck, true);
  assert.equal(imp([{ ref: "ACC-R6.S1", class: "wording" }]).recheck, false, "T-13 is not locked: no recheck");
});

test("behaviour: only the locked tests whose AC maps to the scenario (per AC); requirement refs cover their scenarios", () => {
  const r = imp([{ ref: "ACC-R5.S2", class: "behaviour" }]);
  assert.deepEqual([by(r, "T-12").reopen, by(r, "T-12").acs, by(r, "T-12").tests], ["tests", ["T-12.AC2"], [TT("a2")]]);
  assert.deepEqual([by(r, "T-14").reopen, by(r, "T-14").tests], ["tests", [TT("b1")]]);
  assert.deepEqual(r.counts, { tests: 2, skeletons: 0, tasks: 2 });
  assert.equal(r.suggestFollowUp, false);
  const req = imp([{ ref: "ACC-R5", class: "behaviour" }]);
  assert.deepEqual(by(req, "T-12").tests, [TT("a1"), TT("a2")]);
  const un = imp([{ ref: "ACC-R6.S1", class: "behaviour" }]);
  assert.deepEqual(un.tasks.map((x) => [x.task, x.locked, x.reopen, x.tests]), [["T-13", false, null, []]], "not locked yet: nothing to reopen");
  assert.match(impactLine(un), /T-13 not locked yet/);
});

test("contract: @dec symbols (or the symbol ref, or covers of the hit ACs' tests) reopen the skeleton plus their tests; follow-up suggested", () => {
  const d = imp([{ ref: "D-1", class: "contract" }]);
  assert.deepEqual([by(d, "T-14").reopen, by(d, "T-14").symbols, by(d, "T-14").tests], ["skeleton", [HASH], [TT("b2")]]);
  assert.equal(by(d, "T-12"), undefined);
  assert.equal(d.suggestFollowUp, true);
  const s = imp([{ ref: "hashToken", class: "contract" }]);
  assert.deepEqual(by(s, "T-14").symbols, [HASH]);
  const sc = imp([{ ref: "ACC-R5.S2", class: "contract" }]);
  assert.deepEqual([by(sc, "T-12").symbols, by(sc, "T-12").tests], [[MAIL], [TT("a1"), TT("a2")]], "covers of the AC's tests, plus every locked test covering them");
  assert.deepEqual(by(sc, "T-14").symbols, [REQ]);
});

test("scenario: a new scenario on a covered requirement → new AC + tests on locked tasks; requirement → tasks update only", () => {
  const r = imp([{ ref: "ACC-R5.S3", class: "scenario" }]);
  assert.deepEqual(r.tasks.map((x) => [x.task, x.reopen, x.newAc]), [["T-12", "tests", ["ACC-R5.S3"]], ["T-14", "tests", ["ACC-R5.S3"]]]);
  assert.equal(r.tasksUpdate, true);
  const q = imp([{ ref: "ACC-R9", class: "requirement" }]);
  assert.deepEqual([q.tasks.length, q.recheck, q.tasksUpdate], [0, false, true]);
  const many = computeImpact({ entries: [{ ref: "T-1", class: "wording" }], index: { symbols: {} }, lock: { symbols: {}, tests: {}, tasks: Object.fromEntries(["T-1", "T-2", "T-3", "T-4"].map((t) => [t, { skeletonAt: "x" }])) },
    tasks: ["T-1", "T-2", "T-3", "T-4"].map((id) => ({ id, acs: [], decisions: [] })) });
  assert.equal(many.suggestFollowUp, false, "one task hit");
});

test("note apply: guard, dry run, applied + recheck (also for wording on locked work), no recheck when nothing is locked", () => {
  const root = specProject();
  const lf = path.join(root, ".hitl/index/skeleton.lock.json");
  const L = JSON.parse(fs.readFileSync(lf, "utf8"));
  L.tests = { [TT("a2")]: { task: "T-12", ac: ["T-12.AC2"], covers: [], stage: "locked", bodyHash: "b", intentHash: "i", kind: "example", origin: "test-author" } };
  fs.writeFileSync(lf, JSON.stringify(L));
  const spec = path.join(root, ".hitl/changes/feat-password-reset/specs/accounts/spec.md");
  const notesFile = path.join(root, ".hitl/changes/feat-password-reset/notes.md");
  const C = ["--change", "feat-password-reset"];
  assert.equal(cli(root, "note", "add", ...C, "--kind", "spec", "--refs", "ACC-R5.S2", "--text", "Log the attempt.").code, 0);
  let r = cli(root, "note", "apply", ...C, "N-1", "--impact", "ACC-R5.S2=behaviour", "--json");
  assert.equal(r.code, 1); assert.match(r.json().errors[0], /none of its refs \(ACC-R5\.S2\) changed since it was noted/);
  fs.writeFileSync(spec, fs.readFileSync(spec, "utf8").replace("- AND no email is sent", "- AND no email is sent\n- AND the attempt is logged"));
  const before = fs.readFileSync(notesFile, "utf8");
  r = cli(root, "note", "apply", ...C, "N-1", "--impact", "ACC-R5.S2=behaviour", "--dry-run", "--json");
  assert.equal(r.code, 0, r.out); assert.equal(fs.readFileSync(notesFile, "utf8"), before);
  assert.deepEqual([r.json().counts.tests, r.json().tasks[0].tests], [1, [TT("a2")]]);
  assert.equal(cli(root, "note", "apply", ...C, "N-1", "--impact", "D-1=behaviour").code, 1, "class/ref mismatch");
  assert.equal(cli(root, "note", "apply", ...C, "N-1").code, 1, "--impact required");
  assert.equal(cli(root, "note", "apply", ...C, "N-1", "--impact", "ACC-R5.S2=nope").code, 2);
  r = cli(root, "note", "apply", ...C, "N-1", "--impact", "ACC-R5.S2=behaviour", "--json");
  assert.equal(r.code, 0, r.out); assert.equal(r.json().recheck, "N-2");
  let ns = parseNotes(fs.readFileSync(notesFile, "utf8")).notes;
  assert.deepEqual(ns.map((n) => [n.id, n.kind, n.status]), [["N-1", "spec", "applied"], ["N-2", "recheck", "reopen pending"]]);
  assert.deepEqual(ns[1].meta.reopen, [{ task: "T-12", stage: "tests", acs: ["T-12.AC2"], symbols: [] }]);
  assert.equal(cli(root, "note", "apply", ...C, "N-1", "--impact", "ACC-R5.S2=behaviour").code, 1, "already applied");
  assert.equal(cli(root, "note", "apply", ...C, "N-2", "--impact", "ACC-R5.S2=behaviour").code, 1, "a recheck is confirmed by the human, never applied");
  // the recheck blocks T-12 only
  const s = cli(root, "status", "--json").json();
  assert.deepEqual(s.tasks["T-12"].notes.map((n) => n.id), ["N-2"]); assert.deepEqual(s.tasks["T-13"].notes, []);
  assert.match(cli(root, "status", "--brief").out, /📌 notes: feat-password-reset 1 reopen pending → \/hitl:approve feat-password-reset reopen N-2/);
  // wording on locked work still writes a recheck (nothing to unlock); without a note id (amend from review)
  r = cli(root, "note", "apply", ...C, "--impact", "ACC-R5.S1=wording", "--from", "/hitl:review T-12 amend F-2", "--json");
  assert.equal(r.code, 0, r.out); assert.equal(r.json().recheck, "N-3");
  ns = parseNotes(fs.readFileSync(notesFile, "utf8")).notes;
  assert.match(ns[2].text, /Wording only on locked work: nothing to unlock/);
  assert.equal(ns[2].from, "/hitl:review T-12 amend F-2");
  assert.deepEqual(ns[2].meta.reopen, [{ task: "T-12", stage: null, acs: [], symbols: [] }]);
  // T-13 is not locked: no recheck
  r = cli(root, "note", "apply", ...C, "--impact", "ACC-R6.S1=behaviour", "--json");
  assert.equal(r.json().recheck, null);
});
