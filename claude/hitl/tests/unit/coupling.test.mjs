// 0.10 change coupling + reconcile — header parse, link graph, evidence, validate items, order notes, reconcile
// findings, the `coupling` / `reconcile` CLI, archive (both orders), status/next routing.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseProposal } from "../../scripts/lib/specmd.mjs";
import { graphOf, linksOf, reconcilePending, cycleThrough, couplingItems, couplingEvidence } from "../../scripts/lib/coupling.mjs";
import { lineDiff, computeFindings } from "../../scripts/lib/reconcile.mjs";
import { parseNotes, renderNotes, applyCommand } from "../../scripts/lib/notes.mjs";
import { computeNext } from "../../scripts/lib/nextstep.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, "../../scripts/hitl-index.mjs");
const FIX = path.resolve(HERE, "../fixtures/spec-app");
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 30000 });
  return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) };
};
const specProject = () => { const root = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-link-")); fs.cpSync(FIX, root, { recursive: true }); return root; };

const A = "feat-signin-audit", B = "feat-password-reset";
const ADIR = `.hitl/changes/${A}`;
const NOTES = `${ADIR}/notes.md`;

const proposalMd = (id, header, created = "2026-10-28") => `<!-- audience: business -->
# Sign-in audit
> change: ${id} | status: approved | created: ${created} | updated: ${created}${header ? ` | ${header}` : ""}

## Why
Support cannot tell when a user last signed in.

## What changes
- Every sign-in is recorded.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| accounts | ACC | modified | ~ACC-R1 +ACC-R7 |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | skipped | small |
`;
const DELTA = `<!-- audience: business -->
# Delta: Accounts
> capability: accounts | key: ACC | change: ${A}

## MODIFIED Requirements
### Requirement: ACC-R1 Sign in
When a registered user enters their email and password, the system SHALL sign them in and record the sign-in.

#### Scenario: ACC-R1.S1 Correct password
- GIVEN a registered user with email "ana@example.com"
- WHEN they sign in with the correct password
- THEN they see their account home
- AND the sign-in is recorded

#### Scenario: ACC-R1.S2 Wrong password
- GIVEN a registered user with email "ana@example.com"
- WHEN they sign in with a wrong password
- THEN they see "email or password is wrong"
Changed: a sign-in is now recorded.

## ADDED Requirements
### Requirement: ACC-R7 Sign-in log
When support opens a user's sign-in log, the system SHALL list the user's sign-ins, newest first.

#### Scenario: ACC-R7.S1 Log lists sign-ins
- GIVEN a user who signed in twice
- WHEN support opens the sign-in log
- THEN two sign-ins are listed, newest first
`;
const TASKS = `# Sign-in audit Tasks
← Change: ${A}
> status: approved

## T-20 Record each sign-in
- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo

### Acceptance criteria
- [ ] T-20.AC1 (ACC-R1.S1) Given a registered user When they sign in Then the sign-in is recorded

## T-21 Show the sign-in log
- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo

### Acceptance criteria
- [ ] T-21.AC1 (ACC-R7.S1) Given two sign-ins When support opens the log Then both are listed
`;
/** spec-app + feat-signin-audit (A) linked to feat-password-reset (B) by `header` in A's proposal. */
function linkedProject(header = `after: ${B} (strong)`) {
  const root = specProject();
  const w = (rel, t) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), t); };
  w(`${ADIR}/proposal.md`, proposalMd(A, header));
  w(`${ADIR}/specs/accounts/spec.md`, DELTA);
  w(`${ADIR}/tasks.md`, TASKS);
  return root;
}
const read = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ---------------------------------------------------------------- header
test("proposal header: after/relates, comma lists, repeated segments; bad entries and level mismatch → COUPLING_BAD", () => {
  const p = parseProposal(proposalMd("feat-x", "after: feat-a (strong), feat-b | relates: feat-c (low)"), "p.md");
  assert.deepEqual(p.links.map((l) => [l.rel, l.change, l.level]), [["after", "feat-a", "strong"], ["after", "feat-b", "strong"], ["relates", "feat-c", "low"]]);
  assert.equal(p.status, "approved");
  assert.ok(!p.items.some((i) => i.code === "COUPLING_BAD"));
  const bad = parseProposal(proposalMd("feat-x", "after: feat-a (low) | relates: Feat B | relates: feat-c, feat-c"), "p.md");
  assert.deepEqual(bad.items.filter((i) => i.code === "COUPLING_BAD").map((i) => i.ref), ["feat-a", "Feat B", "feat-c"]);
  assert.deepEqual(parseProposal(proposalMd("feat-x", ""), "p.md").links, []);
});

// ---------------------------------------------------------------- graph
const node = (id, links = [], o = {}) => ({ id, dir: `.hitl/changes/${id}`, archived: false, archiveDate: null, created: "2026-10-10", links, ...o });
const L = (rel, change) => ({ rel, change, level: rel === "after" ? "strong" : "low", line: 3 });

test("link graph: both directions, strongest wins, reconcile pending/done, archived-before is stale, cycles", () => {
  const g = graphOf([node("feat-a", [L("after", "feat-b"), L("relates", "feat-c")]), node("feat-b", [L("relates", "feat-a")]),
    node("feat-c", [], { archived: true, archiveDate: "2026-10-20" }), node("feat-d", [L("relates", "feat-a")], { archived: true, archiveDate: "2026-10-21" }),
    node("feat-e", [L("after", "feat-old")]), node("feat-old", [], { archived: true, archiveDate: "2026-10-01" })],
  new Map([["feat-a", { "feat-d": { at: "2026-10-22", archived: true } }]]));
  assert.deepEqual(linksOf(g, "feat-a").map((l) => [l.change, l.rel, l.declaredIn, l.reconcile]),
    [["feat-b", "after", "feat-a", null], ["feat-c", "relates", "feat-a", "pending"], ["feat-d", "relates", "feat-d", "done"]]);
  assert.deepEqual(linksOf(g, "feat-b").map((l) => [l.change, l.rel]), [["feat-a", "before"]]);
  assert.deepEqual(reconcilePending(g, "feat-a"), [{ from: "feat-c", command: "/hitl:plan feat-a reconcile feat-c" }]);
  const e = linksOf(g, "feat-e")[0];
  assert.deepEqual([e.stale, e.reconcile], [true, null], "archived before feat-e was created: no reconcile owed");
  assert.equal(cycleThrough(g, "feat-a"), null);
  const cyc = graphOf([node("feat-a", [L("after", "feat-b")]), node("feat-b", [L("after", "feat-c")]), node("feat-c", [L("after", "feat-a")])]);
  assert.deepEqual(cycleThrough(cyc, "feat-a"), ["feat-a", "feat-b", "feat-c", "feat-a"]);
});

test("couplingItems: self, unknown, archived before creation, cycle, understated, reconcile pending", () => {
  const ch = (id, links, o = {}) => ({ id, dir: `.hitl/changes/${id}`, proposal: { links }, deltas: [], ...o });
  const g = graphOf([node("feat-a", [L("after", "feat-a"), L("relates", "feat-zz"), L("relates", "feat-old"), L("after", "feat-b")]), node("feat-b", [L("after", "feat-a")]),
    node("feat-old", [], { archived: true, archiveDate: "2026-10-01" }), node("feat-c", [], { archived: true, archiveDate: "2026-10-20" }), node("feat-x", [L("relates", "feat-c")])]);
  const items = couplingItems(g, ch("feat-a", g.byId("feat-a").links));
  assert.deepEqual(items.map((i) => [i.level, i.code, i.ref]).sort(), [["error", "COUPLING_ARCHIVED", "feat-old"], ["error", "COUPLING_CYCLE", "feat-a"], ["error", "COUPLING_SELF", "feat-a"], ["error", "COUPLING_UNKNOWN", "feat-zz"]]);
  const blk = (id, op) => ({ id, op, kind: "requirement", rules: [], livingText: id });
  const mod = (id) => ({ deltas: [{ capability: "accounts", blocks: [blk(id, "MODIFIED")] }] });
  const x = ch("feat-x", [L("relates", "feat-c")], mod("ACC-R1")), y = ch("feat-y", [], mod("ACC-R1"));
  const it2 = couplingItems(g, x, [y], { index: { symbols: {} }, lock: { symbols: {} } });
  assert.deepEqual(it2.map((i) => [i.level, i.code, i.ref]), [["warn", "COUPLING_UNDERSTATED", "feat-y"], ["warn", "RECONCILE_PENDING", "feat-c"]]);
  assert.match(it2[0].message, /ACC-R1 same-id/);
});

// ---------------------------------------------------------------- evidence
test("couplingEvidence: same id, AC ref, serves, Rules:, shared symbol, contract → strong; capability only → low", () => {
  const blk = (id, op, o = {}) => ({ id, op, kind: "requirement", rules: [], livingText: id, ...o });
  const task = (id, reqs, symbols = []) => ({ id, acs: reqs.map((r, i) => ({ id: `${id}.AC${i + 1}`, reqs: [r] })), symbols, decisions: [] });
  const a = { id: "feat-a", deltas: [{ capability: "acc", blocks: [blk("ACC-R1", "MODIFIED"), blk("ACC-R7", "ADDED", { rules: ["ACC-BR1"] })] }],
    tasksDoc: { tasks: [task("T-20", ["ACC-R2.S1"]), task("T-21", ["ACC-R7.S1"])] },
    design: { decisions: [{ id: "D-1", decision: "use the mail.yaml contract", why: "", serves: ["ACC-R3"], status: "accepted" }] }, contracts: ["contracts/mail.yaml"] };
  const b = { id: "feat-b", deltas: [{ capability: "acc", blocks: [blk("ACC-R1", "REMOVED"), blk("ACC-R2", "MODIFIED"), blk("ACC-R3", "MODIFIED"), blk("ACC-BR1", "MODIFIED", { kind: "rule" })] }],
    tasksDoc: { tasks: [task("T-30", ["ACC-R9.S1"])] }, design: { decisions: [] }, contracts: ["contracts/mail.yaml"] };
  const lock = { symbols: { "src/a.ts#Svc.run": { tasks: ["T-21", "T-30"] } } };
  const index = { symbols: { "src/a.ts#Svc.run": { name: "run", kind: "method" } } };
  const ev = couplingEvidence(a, b, { index, lock, resolve: (r) => (r === "Svc.run" ? { id: "src/a.ts#Svc.run" } : null) });
  assert.equal(ev.level, "strong");
  assert.deepEqual(ev.evidence.map((e) => `${e.type}:${e.ref}`), ["same-id:ACC-R1", "ac-ref:ACC-R2", "serves-ref:ACC-R3", "rule-ref:ACC-BR1", "symbol:Svc.run", "contract:contracts/mail.yaml", "capability:acc"]);
  assert.deepEqual(ev.refsA.sort(), ["ACC-BR1", "ACC-R1", "ACC-R2", "ACC-R3", "ACC-R7", "D-1", "Svc.run", "T-20.AC1"].sort());
  assert.deepEqual(ev.symbolsA, { "Svc.run": "src/a.ts#Svc.run" });
  const low = couplingEvidence({ id: "x", deltas: [{ capability: "acc", blocks: [blk("ACC-R8", "ADDED")] }] }, { id: "y", deltas: [{ capability: "acc", blocks: [blk("ACC-R9", "ADDED")] }] });
  assert.deepEqual([low.level, low.evidence.map((e) => e.type)], ["low", ["capability"]]);
  assert.equal(couplingEvidence({ id: "x", deltas: [] }, { id: "y", deltas: [] }).level, "none");
});

// ---------------------------------------------------------------- reconcile findings (pure)
test("lineDiff: deletions before additions, unchanged lines dropped, capped", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nB\nc"), ["- b", "+ B"]);
  assert.deepEqual(lineDiff(null, "x"), ["+ x"]);
  assert.deepEqual(lineDiff("x", null), ["- x"]);
  const big = lineDiff("", Array.from({ length: 30 }, (_, i) => `l${i}`).join("\n"), 5);
  assert.equal(big.length, 6); assert.match(big[5], /more line/);
});

test("computeFindings: spec (prev diff, refs in A), design (shared contract), recheck (drifted locked symbol → reopen set)", () => {
  const blk = (id, op, text, o = {}) => ({ id, op, title: "Sign in", kind: "requirement", rules: [], livingText: text, changed: null, reason: null, ...o });
  const a = { id: "feat-a", deltas: [], tasksDoc: { tasks: [{ id: "T-20", acs: [{ id: "T-20.AC1", reqs: ["ACC-R1.S1"], text: "Given a user When sign in Then recorded" }], symbols: [], decisions: [] }] },
    design: { decisions: [{ id: "D-4", decision: "mail.yaml stays v1", why: "", serves: [], status: "accepted" }] }, contracts: ["contracts/mail.yaml"], contractTexts: new Map([["contracts/mail.yaml", "v: 1\n"]]) };
  const b = { id: "feat-b", archived: true, deltas: [{ capability: "accounts", blocks: [blk("ACC-R1", "MODIFIED", "new text", { changed: "case-insensitive" }), blk("ACC-R2", "REMOVED", null, { reason: "unsafe" })] }],
    tasksDoc: { tasks: [{ id: "T-30", acs: [], symbols: [{ ref: "Svc.run" }], decisions: [] }] },
    design: { decisions: [{ id: "D-2", decision: "mail.yaml goes to v2", why: "", serves: [], status: "accepted" }] }, contracts: ["contracts/mail.yaml"], contractTexts: new Map([["contracts/mail.yaml", "v: 2\n"]]) };
  const SYM = "src/a.ts#Svc.run";
  const index = { symbols: { [SYM]: { name: "run", kind: "method", sigHash: "s2", intentHash: "i1", bodyHash: "b2", tags: { task: ["T-30"] } } }, files: {} };
  const lock = { symbols: { [SYM]: { task: "T-20", sigHash: "s1", intentHash: "i1" } }, tasks: { "T-20": { skeletonAt: "x" } }, tests: {} };
  const refCtx = { view: { capabilities: new Map() }, resolveSpecRef: (v, r) => (r === "ACC-R1" ? { status: "ok", block: { title: "Sign in" } } : { status: "unknown" }), findInView: () => null,
    design: a.design, tasks: a.tasksDoc.tasks, index, resolve: (r) => (r === "Svc.run" ? { id: SYM } : null) };
  const f = computeFindings({ a, b, living: { specs: new Map() }, prev: { "ACC-R1": "old text" }, index, lock, resolve: refCtx.resolve, refCtx });
  assert.deepEqual(f.map((x) => [x.id, x.type, x.ref]), [["RC-1", "spec", "ACC-R1"], ["RC-2", "design", "contracts/mail.yaml"], ["RC-3", "recheck", "Svc.run"]]);
  assert.deepEqual(f[0].refs, ["ACC-R1", "T-20.AC1"]);
  assert.deepEqual(f[0].diff, ["- old text", "+ new text"]);
  assert.match(f[0].text, /Changed: case-insensitive/);
  assert.equal(f[0].class, "behaviour");
  assert.deepEqual(f[1].refs, ["D-4"]); assert.match(f[1].text, /D-2 \(mail\.yaml goes to v2\)/); assert.deepEqual(f[1].diff, ["- v: 1", "+ v: 2"]);
  assert.equal(f[2].kind, "recheck"); assert.equal(f[2].class, "contract");
  assert.deepEqual(f[2].meta.reopen.map((r) => [r.task, r.stage, r.symbols]), [["T-20", "skeleton", [SYM]]]);
  // the ACC-R2 removal is not referenced by A: no finding; no drift → no recheck
  lock.symbols[SYM].sigHash = "s2";
  assert.ok(!computeFindings({ a, b, living: { specs: new Map() }, prev: null, index, lock, resolve: refCtx.resolve, refCtx }).some((x) => x.type === "recheck"));
});

test("notes.md file record round trip; order note apply command; computeNext reconcile + paused routing", () => {
  const n = { id: "N-1", title: "Wait for feat-b", kind: "order", refs: ["ACC-R1"], refTitles: {}, status: "open", deferredTo: null, from: "coupling header (after: feat-b)", at: "2026-11-05",
    acks: [], reason: null, resolved: null, text: "x", meta: { coupling: { from: "feat-b", rel: "after" } } };
  const meta = { reconciled: { "feat-b": { at: "2026-11-05", archived: true, notes: ["N-2"], skipped: ["k"] } } };
  const text = renderNotes("feat-a", [n], meta);
  assert.match(text, /^> Reconciled: feat-b 2026-11-05 \(archived\) · N-2 · 1 skipped$/m);
  const p = parseNotes(text);
  assert.deepEqual(p.meta, meta);
  assert.equal(renderNotes("feat-a", p.notes, p.meta), text);
  assert.equal(applyCommand("feat-a", n), "/hitl:plan feat-a reconcile feat-b");
  const tasks = [{ id: "T-1", prio: "P1", blockedBy: [] }];
  const statuses = { tasks: { "T-1": { status: "todo", next: "/hitl:skeleton T-1" } } };
  const rc = [{ change: "feat-a", from: "feat-b", command: "/hitl:plan feat-a reconcile feat-b" }];
  assert.equal(computeNext({ tasks, statuses, reconcile: rc }).command, "/hitl:plan feat-a reconcile feat-b");
  assert.equal(computeNext({ tasks, statuses, reconcile: rc, notes: { pending: [{ change: "feat-a", id: "N-3", title: "x" }] } }).command, "/hitl:approve feat-a reopen N-3", "reopen first");
  const paused = { byTask: { "T-1": [{ id: "N-1", title: "Wait for feat-b", apply: "/hitl:plan feat-a reconcile feat-b", change: "feat-a", waitFor: "feat-b" }] } };
  const r = computeNext({ tasks, statuses, notes: paused, changes: [{ id: "feat-b", phase: "archive-ready" }] });
  assert.deepEqual([r.command, r.change], ["/hitl:archive feat-b", "feat-b"]); assert.match(r.reason, /paused until feat-b is archived/);
});

// ---------------------------------------------------------------- CLI
test("validate keeps one order note per after: link (blocks only the overlapping task; never recreated once dismissed)", () => {
  const root = linkedProject();
  const c = cli(root, "coupling", A, B, "--json").json();
  assert.equal(c.pairs[0].level, "strong");
  assert.deepEqual(c.pairs[0].refs, ["ACC-R1", "T-20.AC1"]);
  assert.equal(c.pairs[0].understated, false);
  assert.equal(c.links[0].rel, "after");
  assert.match(cli(root, "coupling", A).out, /🔗 feat-signin-audit after feat-password-reset \(strong\)/);
  const v = cli(root, "spec", "validate", A, "--json").json();
  assert.deepEqual(v.orderNotes.map((o) => [o.change, o.note, o.created]), [[A, "N-1", true]]);
  assert.match(read(root, NOTES), /## N-1 Wait for feat-password-reset\n- kind: order\n- refs: ACC-R1 \(Sign in\), T-20\.AC1/);
  const list = cli(root, "note", "list", "--change", A, "--json").json().changes[0].notes[0];
  assert.deepEqual([list.blocks, list.apply], [["T-20"], `/hitl:plan ${A} reconcile ${B}`]);
  const before = read(root, NOTES);
  assert.equal(cli(root, "spec", "validate", A, "--json").json().orderNotes, undefined, "idempotent");
  assert.equal(read(root, NOTES), before);
  const s = cli(root, "status", "--json").json();
  assert.deepEqual(s.changes.find((x) => x.id === A).links[0].paused, ["T-20"]);
  assert.deepEqual(s.tasks["T-21"].notes, []);
  assert.equal(s.tasks["T-20"].notes[0].waitFor, B);
  // the human dismisses it: validate never brings it back
  assert.equal(cli(root, "approve", "--change", A, "--stage", "dismiss", "--note", "N-1", "--reason", "we go in parallel", "--by", "human").code, 0);
  cli(root, "spec", "validate", A);
  assert.equal((read(root, NOTES).match(/^## N-/gm) || []).length, 1);
  // no after: link → no order note; relates is understated against strong evidence
  const r2 = linkedProject(`relates: ${B} (low)`);
  const v2 = cli(r2, "spec", "validate", A, "--json").json();
  assert.equal(v2.orderNotes, undefined);
  assert.ok(v2.items.some((i) => i.code === "COUPLING_UNDERSTATED" && i.ref === B));
  assert.ok(!fs.existsSync(path.join(r2, NOTES)));
  // header errors
  const r3 = linkedProject("after: feat-nope (strong) | relates: feat-2fa (low)");
  const v3 = cli(r3, "spec", "validate", A, "--json").json();
  assert.deepEqual(v3.items.filter((i) => i.code.startsWith("COUPLING_") && i.level === "error").map((i) => [i.code, i.ref]).sort(), [["COUPLING_ARCHIVED", "feat-2fa"], ["COUPLING_UNKNOWN", "feat-nope"]]);
  assert.equal(v3.ok, false);
  assert.equal(cli(r3, "coupling").code, 2);
  assert.equal(cli(r3, "coupling", "feat-2fa").code, 1, "archived change");
});

test("archive B first: next line, A's RECONCILE_PENDING (validate, archive, status), reconcile dry-run/real/idempotent closes the order note", () => {
  const root = linkedProject();
  cli(root, "spec", "validate", A);
  const arch = cli(root, "spec", "archive", B, "--force", "--json").json();
  assert.equal(arch.ok, true);
  assert.deepEqual(arch.archive.reconcile, [{ change: A, command: `/hitl:plan ${A} reconcile ${B}` }]);
  const prev = JSON.parse(read(root, `${arch.archive.to}/.prev.json`));
  assert.deepEqual(Object.keys(prev.blocks).sort(), ["ACC-R1", "ACC-R2"]);
  assert.ok(!fs.existsSync(path.join(root, `${ADIR}/.prev.json`)), "nothing written into A");
  const v = cli(root, "spec", "validate", A, "--json").json();
  assert.ok(v.items.some((i) => i.code === "RECONCILE_PENDING" && i.ref === B));
  const ad = cli(root, "spec", "archive", A, "--dry-run", "--force", "--json").json();
  assert.equal(ad.ok, false);
  assert.deepEqual(ad.preconditions.reconcile.pending.map((p) => p.from), [B]);
  assert.equal(cli(root, "status", "--json").json().next.command, `/hitl:plan ${A} reconcile ${B}`);
  assert.match(cli(root, "status", "--brief").out, /🔄 reconcile pending: feat-signin-audit from feat-password-reset/);
  assert.equal(cli(root, "change", A, "--json").json().changes[0].reconcilePending[0].from, B);
  // dry run: nothing written
  const notesBefore = read(root, NOTES);
  const dry = cli(root, "reconcile", A, "--from", B, "--dry-run", "--json").json();
  assert.deepEqual([dry.counts.new, dry.findings[0].type, dry.findings[0].ref, dry.closesOrder], [1, "spec", "ACC-R1", ["N-1"]]);
  assert.deepEqual(dry.findings[0].refs, ["ACC-R1", "T-20.AC1"]);
  assert.ok(dry.findings[0].diff.includes("+ When a registered user enters their email in any letter case and their password, the system SHALL sign them in."));
  assert.equal(read(root, NOTES), notesBefore);
  // real run
  const real = cli(root, "reconcile", A, "--from", B, "--json").json();
  assert.deepEqual([real.added, real.closed, real.recorded, real.next], [["N-2"], ["N-1"], true, `/hitl:plan ${A} amend N-2`]);
  const t = read(root, NOTES);
  assert.match(t, /> Reconciled: feat-password-reset \d{4}-\d{2}-\d{2} \(archived\) · N-2/);
  assert.match(t, /## N-1 Wait for feat-password-reset[\s\S]*?- status: applied\n[\s\S]*?- resolved: feat-password-reset archived; reconciled \d{4}-\d{2}-\d{2}: N-2 added/);
  assert.match(t, /## N-2 feat-password-reset changed ACC-R1 Sign in\n- kind: spec\n- refs: ACC-R1 \(Sign in\), T-20\.AC1/);
  assert.match(t, /```diff\n- When a registered user enters their email and password/);
  // idempotent
  const again = cli(root, "reconcile", A, "--from", B, "--json").json();
  assert.deepEqual([again.counts.new, again.added, again.findings[0].existing], [0, [], "N-2"]);
  assert.equal((read(root, NOTES).match(/^## N-/gm) || []).length, 2);
  // pending cleared; archive now blocked only by the open note N-2 (not by the reconcile)
  assert.ok(!cli(root, "spec", "validate", A, "--json").json().items.some((i) => i.code === "RECONCILE_PENDING"));
  const ad2 = cli(root, "spec", "archive", A, "--dry-run", "--force", "--json").json();
  assert.deepEqual([ad2.preconditions.reconcile.pending, ad2.preconditions.notes.open.map((n) => n.id)], [[], ["N-2"]]);
  // N-2 asks for the merge: apply refuses until A's own ACC-R1 block changed
  assert.equal(cli(root, "note", "apply", "--change", A, "N-2", "--impact", "ACC-R1=behaviour").code, 1);
});

test("archive A first (relates): B owes the reconcile; pick none leaves the findings pending; only the human skip clears it; usage errors", () => {
  const root = linkedProject(`relates: ${B} (low)`);
  // A archives first (its tasks are not done: --force); B is linked by A's header
  const arch = cli(root, "spec", "archive", A, "--force", "--json").json();
  assert.equal(arch.ok, true, JSON.stringify(arch.conflicts));
  assert.deepEqual(arch.archive.reconcile, [{ change: B, command: `/hitl:plan ${B} reconcile ${A}` }]);
  assert.deepEqual(cli(root, "spec", "archive", B, "--dry-run", "--force", "--json").json().preconditions.reconcile.pending.map((p) => p.from), [A]);
  const dry = cli(root, "reconcile", B, "--from", A, "--dry-run", "--json").json();
  assert.deepEqual(dry.findings.map((f) => [f.type, f.ref]), [["spec", "ACC-R1"]]);
  assert.deepEqual(dry.findings[0].refs, ["ACC-R1", "D-2"], "B's own decision serves it");
  assert.equal(cli(root, "reconcile", B, "--from", A, "--pick", "RC-9").code, 2);
  assert.equal(cli(root, "reconcile", B, "--from", B).code, 2);
  assert.equal(cli(root, "reconcile", B).code, 2);
  assert.equal(cli(root, "reconcile", A, "--from", B).code, 1, "an archived change is frozen");
  const BN = ".hitl/changes/feat-password-reset/notes.md";
  // pick none: the run is recorded, but the finding stays pending (the AI cannot skip it)
  const none = cli(root, "reconcile", B, "--from", A, "--pick", "none", "--json").json();
  assert.deepEqual([none.added, none.pending, none.skipped, none.recorded], [[], ["RC-1"], [], true]);
  assert.match(read(root, BN), /> Reconciled: feat-signin-audit \S+ \(archived\) · no new notes · pending RC-1$/m);
  assert.ok(!/^## N-/m.test(read(root, BN)));
  const pend = cli(root, "spec", "archive", B, "--dry-run", "--force", "--json").json().preconditions.reconcile.pending;
  assert.deepEqual(pend.map((p) => [p.from, p.findings]), [[A, ["RC-1"]]]);
  const val = cli(root, "spec", "validate", B, "--json").json().items.find((i) => i.code === "RECONCILE_PENDING");
  assert.match(val.message, /neither added nor skipped \(RC-1\).*\/hitl:approve feat-password-reset skip RC-1 <reason>/);
  // a pick naming nothing is the same: still pending; the dry run offers it again
  assert.equal(cli(root, "reconcile", B, "--from", A, "--dry-run", "--json").json().counts.new, 1);
  // the human skip: CLI shape errors
  const skip = (...x) => cli(root, "approve", "--change", B, "--stage", "skip", ...x);
  const before = read(root, BN);
  assert.equal(skip("--findings", "RC-1", "--reason", "x", "--by", "auto").code, 2, "human-only");
  assert.equal(skip("--findings", "RC-1", "--reason", "x", "--by", "human-override").code, 2, "human-only");
  assert.equal(skip("--findings", "RC-1", "--by", "human").code, 2, "needs a reason");
  assert.equal(skip("--findings", "N-1", "--reason", "x", "--by", "human").code, 2, "RC ids only");
  assert.equal(skip("--reason", "x", "--by", "human").code, 2, "needs findings");
  assert.equal(cli(root, "approve", "--change", B, "--stage", "dismiss", "--note", "N-1", "--findings", "RC-1", "--reason", "x").code, 2, "--findings belongs to skip");
  assert.equal(skip("--findings", "RC-7", "--reason", "x", "--by", "human").code, 1, "unknown finding");
  assert.equal(skip("--findings", "RC-1", "--from", "feat-nope", "--reason", "x", "--by", "human").code, 1, "unknown change");
  assert.equal(read(root, BN), before, "nothing written by a refused skip");
  // dry run writes nothing; the real skip (from inferred) records it with the reason and clears the pending
  const dryS = skip("--findings", "RC-1", "--reason", "x", "--by", "human", "--dry-run", "--json").json();
  assert.deepEqual([dryS.from, dryS.pending, dryS.reconciled], [A, [], true]);
  assert.equal(read(root, BN), before);
  const sk = skip("--findings", "RC-1", "--reason", "B keeps its own <sign-in> rule --> fine", "--by", "human", "--json");
  assert.equal(sk.code, 0, sk.out + sk.err);
  assert.deepEqual([sk.json().skipped.map((f) => f.id), sk.json().pending, sk.json().reconciled], [["RC-1"], [], true]);
  const bn = read(root, BN);
  assert.match(bn, /> Reconciled: feat-signin-audit \S+ \(archived\) · no new notes · 1 skipped$/m);
  const rec = parseNotes(bn).meta.reconciled[A];
  assert.deepEqual([rec.pending, rec.skipped.length, rec.skipped[0].id, rec.skipped[0].by, rec.skipped[0].reason], [[], 1, "RC-1", "human", "B keeps its own sign-in rule fine"]);
  assert.deepEqual(cli(root, "spec", "archive", B, "--dry-run", "--force", "--json").json().preconditions.reconcile.pending, []);
  // a re-run does not offer it again; picking it is refused; skipping it again is refused
  const re = cli(root, "reconcile", B, "--from", A, "--dry-run", "--json").json();
  assert.deepEqual([re.findings[0].skippedBefore, re.counts.new, re.skipped], [true, 0, ["RC-1"]]);
  assert.equal(cli(root, "reconcile", B, "--from", A, "--pick", "RC-1").code, 2);
  assert.equal(skip("--findings", "RC-1", "--reason", "x", "--by", "human").code, 1);
  const re2 = cli(root, "reconcile", B, "--from", A, "--json").json();
  assert.deepEqual([re2.added, re2.pending], [[], []]);
  assert.equal(parseNotes(read(root, BN)).meta.reconciled[A].skipped.length, 1, "a re-run keeps the skips");
  assert.deepEqual(cli(root, "spec", "archive", B, "--dry-run", "--force", "--json").json().preconditions.reconcile.pending, []);
});

test("reconcile pick: the findings not picked stay pending until added; a 0.10 record with bare skipped keys still counts as skipped", () => {
  const root = linkedProject(`relates: ${B} (low)`);
  cli(root, "spec", "archive", A, "--force", "--json");
  const BN = ".hitl/changes/feat-password-reset/notes.md";
  cli(root, "reconcile", B, "--from", A, "--pick", "none");
  // Y on a later run adds the pending finding and clears it
  const y = cli(root, "reconcile", B, "--from", A, "--json").json();
  assert.deepEqual([y.added, y.pending], [["N-1"], []]);
  assert.deepEqual(cli(root, "spec", "archive", B, "--dry-run", "--force", "--json").json().preconditions.reconcile.pending, []);
  // legacy record: skipped as bare keys, no pending → done; the key is never offered again
  const r2 = linkedProject(`relates: ${B} (low)`);
  cli(r2, "spec", "archive", A, "--force", "--json");
  const key = cli(r2, "reconcile", B, "--from", A, "--dry-run", "--json").json().findings[0].key;
  fs.writeFileSync(path.join(r2, BN), renderNotes(B, [], { reconciled: { [A]: { at: "2026-11-05", archived: true, notes: [], skipped: [key] } } }));
  assert.deepEqual(cli(r2, "spec", "archive", B, "--dry-run", "--force", "--json").json().preconditions.reconcile.pending, []);
  assert.equal(cli(r2, "reconcile", B, "--from", A, "--dry-run", "--json").json().findings[0].skippedBefore, true);
});
