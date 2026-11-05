// 0.9 notes inbox — notes.md format, ref validation, blocking match, `hitl-index note add|list|show`.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseNotes, renderNotes, nextNoteId, titleOf, refKind, specRefsTouch, noteHitsTask, blockingNotes, changedSinceNoted, refHash, noteCounts, applyCommand, reopensLine }
  from "../../scripts/lib/notes.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "../../scripts/hitl-index.mjs");
const FIX = path.resolve(HERE, "../fixtures/spec-app");
export const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};
export const specProject = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-notes-")); fs.cpSync(FIX, root, { recursive: true }); return root; };
const NOTES = ".hitl/changes/feat-password-reset/notes.md";

const sample = () => ({ id: "N-1", title: "Reset link lasts 15 minutes", kind: "spec", refs: ["ACC-R3.S2", "D-2"], refTitles: { "ACC-R3.S2": "Reset link expires (soon)", "D-2": "Hash, the token" },
  status: "open", deferredTo: null, from: "user, during /hitl:implement T-12", at: "2026-11-05", acks: [{ task: "T-14", at: "2026-11-05" }], reason: null, resolved: null,
  text: "The security review asked for a shorter link.\n\nIt must expire after 15 minutes.", meta: { base: { "ACC-R3.S2": "abc", "D-2": "def" } } });

test("render/parse round trip: exact format, titles without parentheses, acks, deferred, recheck meta", () => {
  const a = sample();
  const b = { ...sample(), id: "N-2", title: "Recheck after N-1", kind: "recheck", refs: ["ACC-R3.S2"], refTitles: {}, status: "reopen pending", acks: [], text: "Reopens 2 tests.",
    from: "amend of N-1", meta: { impact: [{ ref: "ACC-R3.S2", class: "behaviour" }], reopen: [{ task: "T-12", stage: "tests", acs: ["T-12.AC2"], symbols: [] }] } };
  const c = { ...sample(), id: "N-3", refs: [], refTitles: {}, status: "deferred", deferredTo: { change: "feat-y", note: "N-4" }, acks: [], meta: {}, text: "" };
  const text = renderNotes("feat-x", [c, b, a]);
  assert.match(text, /^# Notes — feat-x\n\n> Written by hitl-index/);
  assert.ok(text.indexOf("## N-1") < text.indexOf("## N-2") && text.indexOf("## N-2") < text.indexOf("## N-3"), "sorted by id");
  assert.match(text, /- refs: ACC-R3\.S2 \(Reset link expires soon\), D-2 \(Hash, the token\)/);
  assert.match(text, /- acked: T-14 · 2026-11-05/);
  assert.match(text, /- status: deferred → feat-y \(N-4 there\)/);
  assert.match(text, /- impact: ACC-R3\.S2 behaviour/);
  assert.match(text, /- reopens: T-12 tests \(T-12\.AC2\)/);
  assert.match(text, /- refs: none/);
  const p = parseNotes(text);
  assert.equal(p.title, "Notes — feat-x");
  assert.deepEqual(p.notes.map((n) => n.id), ["N-1", "N-2", "N-3"]);
  const [x, y, z] = p.notes;
  assert.deepEqual(x.refs, ["ACC-R3.S2", "D-2"]);
  assert.equal(x.refTitles["D-2"], "Hash, the token");
  assert.deepEqual(x.acks, [{ task: "T-14", at: "2026-11-05" }]);
  assert.equal(x.text, a.text);
  assert.deepEqual(x.meta, a.meta);
  assert.equal(x.from, "user, during /hitl:implement T-12");
  assert.equal(y.status, "reopen pending");
  assert.deepEqual(y.meta.reopen[0].acs, ["T-12.AC2"]);
  assert.equal(z.status, "deferred");
  assert.deepEqual(z.deferredTo, { change: "feat-y", note: "N-4" });
  assert.deepEqual(z.refs, []);
  assert.equal(renderNotes("feat-x", p.notes), text, "render(parse(x)) = x");
  assert.equal(nextNoteId(p.notes), "N-4");
  assert.equal(nextNoteId([]), "N-1");
});

test("small helpers: titleOf, refKind, specRefsTouch, counts, applyCommand, reopensLine", () => {
  assert.equal(titleOf("Link lasts 15 minutes. Security asked."), "Link lasts 15 minutes");
  assert.ok(titleOf("x".repeat(80)).length <= 60);
  assert.deepEqual(["T-1", "T-1.AC2", "D-3", "ACC-R1.S2", "ACC-BR1", "UserService.createUser"].map(refKind), ["task", "ac", "decision", "spec", "spec", "symbol"]);
  assert.ok(specRefsTouch("ACC-R3", "ACC-R3.S2") && specRefsTouch("ACC-R3.S2", "ACC-R3") && specRefsTouch("ACC-R3.S2", "ACC-R3.S2"));
  assert.ok(!specRefsTouch("ACC-R3.S1", "ACC-R3.S2") && !specRefsTouch("ACC-R3", "ACC-R30.S1") && !specRefsTouch("ACC-BR1", "ACC-R1"));
  assert.deepEqual(noteCounts([{ status: "open" }, { status: "reopen pending" }, { status: "applied" }, { status: "open" }]), { open: 2, reopenPending: 1, applied: 1, dismissed: 0, deferred: 0, total: 4, incoming: 0 });
  assert.equal(applyCommand("feat-x", { id: "N-1", kind: "spec", status: "open" }), "/hitl:plan feat-x amend N-1");
  assert.equal(applyCommand("feat-x", { id: "N-1", kind: "design", status: "open" }), "/hitl:design feat-x amend N-1");
  assert.equal(applyCommand("feat-x", { id: "N-1", kind: "order", status: "open" }), "/hitl:tasks feat-x update");
  assert.equal(applyCommand("feat-x", { id: "N-2", kind: "recheck", status: "reopen pending" }), "/hitl:approve feat-x reopen N-2");
  assert.equal(reopensLine([]), "nothing (confirm no impact)");
  assert.equal(reopensLine([{ task: "T-14", stage: "skeleton", symbols: ["src/a.ts#Svc.req"], acs: [] }]), "T-14 skeleton (Svc.req)");
});

const TASK = { id: "T-12", acs: [{ id: "T-12.AC1", reqs: ["ACC-R5.S1"] }, { id: "T-12.AC2", reqs: ["ACC-R5"] }], decisions: ["D-1"] };
const SYM = "src/reset.ts#ResetService.request", LOCKED = "src/token.ts#hashToken";
const idx = { symbols: { [SYM]: { tags: { dec: [] } }, [LOCKED]: { tags: { dec: ["D-7"] } } } };
const ctx = { task: TASK, symIds: new Set([SYM, LOCKED]), index: idx, resolve: (r) => (r === "ResetService.request" ? { id: SYM } : null) };
const note = (refs, o = {}) => ({ id: "N-1", kind: "spec", refs, status: "open", acks: [], meta: {}, ...o });

test("noteHitsTask: task/AC id, scenario/requirement both ways, Why D-n, ### Symbols row, @dec of a locked symbol", () => {
  assert.deepEqual(noteHitsTask(note(["T-12"]), ctx), ["T-12"]);
  assert.deepEqual(noteHitsTask(note(["T-12.AC2"]), ctx), ["T-12.AC2"]);
  assert.deepEqual(noteHitsTask(note(["ACC-R5.S1"]), ctx), ["ACC-R5.S1"]);
  assert.deepEqual(noteHitsTask(note(["ACC-R5.S9"]), ctx), ["ACC-R5.S9"], "a scenario of a requirement an AC names");
  assert.deepEqual(noteHitsTask(note(["ACC-R5"]), ctx), ["ACC-R5"], "a requirement whose scenario an AC names");
  assert.deepEqual(noteHitsTask(note(["D-1"]), ctx), ["D-1"]);
  assert.deepEqual(noteHitsTask(note(["ResetService.request"]), ctx), ["ResetService.request"]);
  assert.deepEqual(noteHitsTask(note(["x"], { meta: { symbols: { x: SYM } } }), ctx), ["x"], "resolved id stored at add time");
  assert.deepEqual(noteHitsTask(note(["D-7"]), ctx), ["D-7"]);
  assert.deepEqual(noteHitsTask(note(["T-13", "ACC-R6.S1", "D-2", "Other.fn"]), ctx), []);
});

test("blockingNotes: open/pending block, applied/dismissed do not, no refs warn only, ack releases one task (open notes only)", () => {
  const notes = [note(["ACC-R5.S1"]), note(["D-1"], { id: "N-2", status: "applied" }), note([], { id: "N-3" }), note(["T-12"], { id: "N-4", acks: [{ task: "T-12" }] }),
    note(["T-12"], { id: "N-5", status: "reopen pending", kind: "recheck", acks: [{ task: "T-12" }] }), note(["T-12"], { id: "N-6", acks: [{ task: "T-99" }] })];
  const r = blockingNotes(notes, ctx);
  assert.deepEqual(r.block.map((x) => x.note.id), ["N-1", "N-5", "N-6"]);
  assert.deepEqual(r.acked.map((x) => x.note.id), ["N-4"]);
  assert.deepEqual(r.warn.map((x) => x.note.id), ["N-3"]);
});

test("changedSinceNoted: spec/design notes compare spec and decision refs only; order notes and symbol refs are not checked", () => {
  const block = { id: "ACC-R5", text: "old", scenarios: [{ id: "ACC-R5.S1", title: "t", steps: ["a"] }] };
  const view = { capabilities: new Map([["accounts", { blocks: [block] }]]) };
  const design = { decisions: [{ id: "D-1", decision: "hash", status: "accepted", supersededBy: null }] };
  const findInView = (v, id) => id === "ACC-R5" ? { block, scenario: null } : id === "ACC-R5.S1" ? { block, scenario: block.scenarios[0] } : null;
  const c = { view, findInView, design };
  const base = { "ACC-R5": refHash("ACC-R5", c), "ACC-R5.S1": refHash("ACC-R5.S1", c), "D-1": refHash("D-1", c) };
  const n = note(["ACC-R5.S1", "D-1", "Svc.fn"], { meta: { base } });
  assert.deepEqual(changedSinceNoted(n, c), { checked: true, changed: [] });
  block.scenarios[0].steps = ["b"];
  assert.deepEqual(changedSinceNoted(n, c).changed, ["ACC-R5.S1"]);
  const d = note(["D-1"], { kind: "design", meta: { base: { "D-1": base["D-1"] } } });
  assert.deepEqual(changedSinceNoted(d, c).changed, []);
  design.decisions[0] = { ...design.decisions[0], status: "superseded", supersededBy: "D-3" };
  assert.deepEqual(changedSinceNoted(d, c).changed, ["D-1"], "a superseded decision satisfies a design note");
  assert.equal(changedSinceNoted(note(["T-12"], { kind: "order", meta: { base: {} } }), c).checked, false);
  assert.equal(changedSinceNoted(note(["Svc.fn"], { meta: {} }), c).checked, false);
  block.scenarios.length = 0;
  assert.deepEqual(changedSinceNoted(note(["ACC-R5.S1"], { meta: { base } }), c).changed, ["ACC-R5.S1"], "a removed scenario counts as changed");
});

test("note add|list|show: writes notes.md, validates refs (exit 1, nothing written), blocks, archived refused, usage", () => {
  const root = specProject();
  const add = cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "ACC-R5.S2,D-1", "--text", "The link lasts 15 minutes. Security asked.", "--json");
  assert.equal(add.code, 0, add.err);
  const d = add.json();
  assert.equal(d.note.id, "N-1");
  assert.equal(d.note.title, "The link lasts 15 minutes");
  assert.deepEqual(d.blocks, ["T-12"]);
  const text = fs.readFileSync(path.join(root, NOTES), "utf8");
  assert.match(text, /## N-1 The link lasts 15 minutes\n- kind: spec\n- refs: ACC-R5\.S2 \(Unknown email reveals nothing\), D-1 \(Store a hash/);
  assert.match(text, /<!-- hitl \{"base":\{"ACC-R5\.S2":"[0-9a-f]{12}","D-1":"[0-9a-f]{12}"\}\} -->/);
  const bad = cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "ACC-R9,NoSuch.symbol,T-99", "--text", "x", "--json");
  assert.equal(bad.code, 1);
  assert.equal(bad.json().errors.length, 3);
  assert.equal(fs.readFileSync(path.join(root, NOTES), "utf8"), text, "nothing written");
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "recheck", "--text", "x").code, 2);
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec").code, 2);
  assert.equal(cli(root, "note", "add", "--change", "feat-2fa", "--kind", "spec", "--text", "x").code, 1, "archived change");
  assert.equal(cli(root, "note", "add", "--change", "feat-nope", "--kind", "spec", "--text", "x").code, 1);
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "order", "--text", "T-13 first", "--refs", "T-13").code, 0);
  const l = cli(root, "note", "list", "--json").json();
  assert.equal(l.schema, "hitl.notes/1");
  assert.deepEqual(l.changes[0].counts, { open: 2, reopenPending: 0, applied: 0, dismissed: 0, deferred: 0, total: 2, incoming: 0 });
  assert.deepEqual(l.changes[0].notes.map((n) => [n.id, n.blocks, n.apply]), [["N-1", ["T-12"], "/hitl:plan feat-password-reset amend N-1"], ["N-2", ["T-13"], "/hitl:tasks feat-password-reset update"]]);
  assert.deepEqual(cli(root, "note", "list", "--task", "T-13", "--json").json().changes[0].notes.map((n) => n.id), ["N-2"]);
  const s = cli(root, "note", "show", "--change", "feat-password-reset", "N-2", "--json");
  assert.equal(s.json().note.kind, "order");
  assert.equal(cli(root, "note", "show", "--change", "feat-password-reset", "N-9").code, 1);
  assert.equal(cli(root, "note", "bogus").code, 2);
});
