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

const sample = () => ({ id: "N-1", title: "Reset link lasts 15 minutes", kind: "spec", refs: ["TFA-R1.S2", "PWR-D2"], refTitles: { "TFA-R1.S2": "Reset link expires (soon)", "PWR-D2": "Hash, the token" },
  status: "open", deferredTo: null, from: "user, during /hitl:implement PWR-T1", at: "2026-11-05", acks: [{ task: "QT-T14", at: "2026-11-05" }], reason: null, resolved: null,
  text: "The security review asked for a shorter link.\n\nIt must expire after 15 minutes.", meta: { base: { "TFA-R1.S2": "abc", "PWR-D2": "def" } } });

test("render/parse round trip: exact format, titles without parentheses, acks, deferred, recheck meta", () => {
  const a = sample();
  const b = { ...sample(), id: "N-2", title: "Recheck after N-1", kind: "recheck", refs: ["TFA-R1.S2"], refTitles: {}, status: "reopen pending", acks: [], text: "Reopens 2 tests.",
    from: "amend of N-1", meta: { impact: [{ ref: "TFA-R1.S2", class: "behaviour" }], reopen: [{ task: "PWR-T1", stage: "tests", acs: ["PWR-T1.AC2"], symbols: [] }] } };
  const c = { ...sample(), id: "N-3", refs: [], refTitles: {}, status: "deferred", deferredTo: { change: "feat-y", note: "N-4" }, acks: [], meta: {}, text: "" };
  const text = renderNotes("feat-x", [c, b, a]);
  assert.match(text, /^# Notes — feat-x\n\n> Written by hitl-index/);
  assert.ok(text.indexOf("## N-1") < text.indexOf("## N-2") && text.indexOf("## N-2") < text.indexOf("## N-3"), "sorted by id");
  assert.match(text, /- refs: TFA-R1\.S2 \(Reset link expires soon\), PWR-D2 \(Hash, the token\)/);
  assert.match(text, /- acked: QT-T14 · 2026-11-05/);
  assert.match(text, /- status: deferred → feat-y \(N-4 there\)/);
  assert.match(text, /- impact: TFA-R1\.S2 behaviour/);
  assert.match(text, /- reopens: PWR-T1 tests \(PWR-T1\.AC2\)/);
  assert.match(text, /- refs: none/);
  const p = parseNotes(text);
  assert.equal(p.title, "Notes — feat-x");
  assert.deepEqual(p.notes.map((n) => n.id), ["N-1", "N-2", "N-3"]);
  const [x, y, z] = p.notes;
  assert.deepEqual(x.refs, ["TFA-R1.S2", "PWR-D2"]);
  assert.equal(x.refTitles["PWR-D2"], "Hash, the token");
  assert.deepEqual(x.acks, [{ task: "QT-T14", at: "2026-11-05" }]);
  assert.equal(x.text, a.text);
  assert.deepEqual(x.meta, a.meta);
  assert.equal(x.from, "user, during /hitl:implement PWR-T1");
  assert.equal(y.status, "reopen pending");
  assert.deepEqual(y.meta.reopen[0].acs, ["PWR-T1.AC2"]);
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
  assert.deepEqual(["QT-T1", "QT-T1.AC2", "PWR-D3", "LACC-R1.S2", "PWR-BR1", "UserService.createUser"].map(refKind), ["task", "ac", "decision", "spec", "spec", "symbol"]);
  assert.ok(specRefsTouch("TFA-R1", "TFA-R1.S2") && specRefsTouch("TFA-R1.S2", "TFA-R1") && specRefsTouch("TFA-R1.S2", "TFA-R1.S2"));
  assert.ok(!specRefsTouch("TFA-R1.S1", "TFA-R1.S2") && !specRefsTouch("TFA-R1", "ACC-R30.S1") && !specRefsTouch("PWR-BR1", "LACC-R1"));
  assert.deepEqual(noteCounts([{ status: "open" }, { status: "reopen pending" }, { status: "applied" }, { status: "open" }]), { open: 2, reopenPending: 1, applied: 1, dismissed: 0, deferred: 0, total: 4, incoming: 0 });
  assert.equal(applyCommand("feat-x", { id: "N-1", kind: "spec", status: "open" }), "/hitl:plan feat-x amend N-1");
  assert.equal(applyCommand("feat-x", { id: "N-1", kind: "design", status: "open" }), "/hitl:design feat-x amend N-1");
  assert.equal(applyCommand("feat-x", { id: "N-1", kind: "order", status: "open" }), "/hitl:tasks feat-x update");
  assert.equal(applyCommand("feat-x", { id: "N-2", kind: "recheck", status: "reopen pending" }), "/hitl:approve feat-x reopen N-2");
  assert.equal(reopensLine([]), "nothing (confirm no impact)");
  assert.equal(reopensLine([{ task: "QT-T14", stage: "skeleton", symbols: ["src/a.ts#Svc.req"], acs: [] }]), "QT-T14 skeleton (Svc.req)");
});

const TASK = { id: "PWR-T1", acs: [{ id: "PWR-T1.AC1", reqs: ["PWR-R1.S1"] }, { id: "PWR-T1.AC2", reqs: ["PWR-R1"] }], decisions: ["PWR-D1"] };
const SYM = "src/reset.ts#ResetService.request", LOCKED = "src/token.ts#hashToken";
const idx = { symbols: { [SYM]: { tags: { dec: [] } }, [LOCKED]: { tags: { dec: ["PWR-D7"] } } } };
const ctx = { task: TASK, symIds: new Set([SYM, LOCKED]), index: idx, resolve: (r) => (r === "ResetService.request" ? { id: SYM } : null) };
const note = (refs, o = {}) => ({ id: "N-1", kind: "spec", refs, status: "open", acks: [], meta: {}, ...o });

test("noteHitsTask: task/AC id, scenario/requirement both ways, Why D-n, ### Symbols row, @dec of a locked symbol", () => {
  assert.deepEqual(noteHitsTask(note(["PWR-T1"]), ctx), ["PWR-T1"]);
  assert.deepEqual(noteHitsTask(note(["PWR-T1.AC2"]), ctx), ["PWR-T1.AC2"]);
  assert.deepEqual(noteHitsTask(note(["PWR-R1.S1"]), ctx), ["PWR-R1.S1"]);
  assert.deepEqual(noteHitsTask(note(["PWR-R1.S9"]), ctx), ["PWR-R1.S9"], "a scenario of a requirement an AC names");
  assert.deepEqual(noteHitsTask(note(["PWR-R1"]), ctx), ["PWR-R1"], "a requirement whose scenario an AC names");
  assert.deepEqual(noteHitsTask(note(["PWR-D1"]), ctx), ["PWR-D1"]);
  assert.deepEqual(noteHitsTask(note(["ResetService.request"]), ctx), ["ResetService.request"]);
  assert.deepEqual(noteHitsTask(note(["x"], { meta: { symbols: { x: SYM } } }), ctx), ["x"], "resolved id stored at add time");
  assert.deepEqual(noteHitsTask(note(["PWR-D7"]), ctx), ["PWR-D7"]);
  assert.deepEqual(noteHitsTask(note(["PWR-T2", "PWR-R2.S1", "PWR-D2", "Other.fn"]), ctx), []);
});

test("blockingNotes: open/pending block, applied/dismissed do not, no refs warn only, ack releases one task (open notes only)", () => {
  const notes = [note(["PWR-R1.S1"]), note(["PWR-D1"], { id: "N-2", status: "applied" }), note([], { id: "N-3" }), note(["PWR-T1"], { id: "N-4", acks: [{ task: "PWR-T1" }] }),
    note(["PWR-T1"], { id: "N-5", status: "reopen pending", kind: "recheck", acks: [{ task: "PWR-T1" }] }), note(["PWR-T1"], { id: "N-6", acks: [{ task: "QT-T99" }] })];
  const r = blockingNotes(notes, ctx);
  assert.deepEqual(r.block.map((x) => x.note.id), ["N-1", "N-5", "N-6"]);
  assert.deepEqual(r.acked.map((x) => x.note.id), ["N-4"]);
  assert.deepEqual(r.warn.map((x) => x.note.id), ["N-3"]);
});

test("changedSinceNoted: spec/design notes compare spec and decision refs only; order notes and symbol refs are not checked", () => {
  const block = { id: "PWR-R1", text: "old", scenarios: [{ id: "PWR-R1.S1", title: "t", steps: ["a"] }] };
  const view = { capabilities: new Map([["accounts", { blocks: [block] }]]) };
  const design = { decisions: [{ id: "PWR-D1", decision: "hash", status: "accepted", supersededBy: null }] };
  const findInView = (v, id) => id === "PWR-R1" ? { block, scenario: null } : id === "PWR-R1.S1" ? { block, scenario: block.scenarios[0] } : null;
  const c = { view, findInView, design };
  const base = { "PWR-R1": refHash("PWR-R1", c), "PWR-R1.S1": refHash("PWR-R1.S1", c), "PWR-D1": refHash("PWR-D1", c) };
  const n = note(["PWR-R1.S1", "PWR-D1", "Svc.fn"], { meta: { base } });
  assert.deepEqual(changedSinceNoted(n, c), { checked: true, changed: [] });
  block.scenarios[0].steps = ["b"];
  assert.deepEqual(changedSinceNoted(n, c).changed, ["PWR-R1.S1"]);
  const d = note(["PWR-D1"], { kind: "design", meta: { base: { "PWR-D1": base["PWR-D1"] } } });
  assert.deepEqual(changedSinceNoted(d, c).changed, []);
  design.decisions[0] = { ...design.decisions[0], status: "superseded", supersededBy: "PWR-D3" };
  assert.deepEqual(changedSinceNoted(d, c).changed, ["PWR-D1"], "a superseded decision satisfies a design note");
  assert.equal(changedSinceNoted(note(["PWR-T1"], { kind: "order", meta: { base: {} } }), c).checked, false);
  assert.equal(changedSinceNoted(note(["Svc.fn"], { meta: {} }), c).checked, false);
  block.scenarios.length = 0;
  assert.deepEqual(changedSinceNoted(note(["PWR-R1.S1"], { meta: { base } }), c).changed, ["PWR-R1.S1"], "a removed scenario counts as changed");
});

test("note add|list|show: writes notes.md, validates refs (exit 1, nothing written), blocks, archived refused, usage", () => {
  const root = specProject();
  const add = cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "PWR-R1.S2,PWR-D1", "--text", "The link lasts 15 minutes. Security asked.", "--json");
  assert.equal(add.code, 0, add.err);
  const d = add.json();
  assert.equal(d.note.id, "N-1");
  assert.equal(d.note.title, "The link lasts 15 minutes");
  assert.deepEqual(d.blocks, ["PWR-T1"]);
  const text = fs.readFileSync(path.join(root, NOTES), "utf8");
  assert.match(text, /## N-1 The link lasts 15 minutes\n- kind: spec\n- refs: PWR-R1\.S2 \(Unknown email reveals nothing\), PWR-D1 \(Store a hash/);
  assert.match(text, /<!-- hitl \{"base":\{"PWR-R1\.S2":"[0-9a-f]{12}","PWR-D1":"[0-9a-f]{12}"\}\} -->/);
  const bad = cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec", "--refs", "ACC-R9,NoSuch.symbol,QT-T99", "--text", "x", "--json");
  assert.equal(bad.code, 1);
  assert.equal(bad.json().errors.length, 3);
  assert.equal(fs.readFileSync(path.join(root, NOTES), "utf8"), text, "nothing written");
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "recheck", "--text", "x").code, 2);
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "spec").code, 2);
  assert.equal(cli(root, "note", "add", "--change", "feat-2fa", "--kind", "spec", "--text", "x").code, 1, "archived change");
  assert.equal(cli(root, "note", "add", "--change", "feat-nope", "--kind", "spec", "--text", "x").code, 1);
  assert.equal(cli(root, "note", "add", "--change", "feat-password-reset", "--kind", "order", "--text", "PWR-T2 first", "--refs", "PWR-T2").code, 0);
  const l = cli(root, "note", "list", "--json").json();
  assert.equal(l.schema, "hitl.notes/1");
  assert.deepEqual(l.changes[0].counts, { open: 2, reopenPending: 0, applied: 0, dismissed: 0, deferred: 0, total: 2, incoming: 0 });
  assert.deepEqual(l.changes[0].notes.map((n) => [n.id, n.blocks, n.apply]), [["N-1", ["PWR-T1"], "/hitl:plan feat-password-reset amend N-1"], ["N-2", ["PWR-T2"], "/hitl:tasks feat-password-reset update"]]);
  assert.deepEqual(cli(root, "note", "list", "--task", "PWR-T2", "--json").json().changes[0].notes.map((n) => n.id), ["N-2"]);
  const s = cli(root, "note", "show", "--change", "feat-password-reset", "N-2", "--json");
  assert.equal(s.json().note.kind, "order");
  assert.equal(cli(root, "note", "show", "--change", "feat-password-reset", "N-9").code, 1);
  assert.equal(cli(root, "note", "bogus").code, 2);
});
