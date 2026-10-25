// v2 §A.3.1 — trace: check codes, stage-dependent levels, scopes, proof, rows, specLinksFor, markdown. In-memory only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrace, specLinksFor, renderTraceMd } from "../../scripts/lib/trace.mjs";

const P = ".hitl/planning/feat-users.md";
const SVC = "src/services/userService.ts", REPO = "src/repo/userRepo.ts", TF = "tests/userService.test.ts";
const CU = `${SVC}#UserService.createUser`, FE = `${REPO}#UserRepo.findByEmail`;
const T1 = `${TF}#UserService.createUser > T-1.AC1 rejects`, T2 = `${TF}#UserService.createUser > T-1.AC2 returns`;

const sym = (id, o) => ({ id, name: id.split("#")[1], file: id.split("#")[0], callers: [], callees: [], ...o });
const tst = (id, ac, covers, o = {}) => sym(id, { kind: "test", name: id.split("#")[1], bodyHash: `tb-${id}`,
  tags: { ac, covers: covers.map((c) => c.split("#")[1]), task: [], dec: [] }, test: { titlePath: ["UserService.createUser", id.split("> ")[1]], mode: "active", coversResolved: covers }, ...o });

/** A clean, fully proven T-1 (green, tests locked); every case below mutates one thing. */
function base() {
  const index = { symbols: {
    [CU]: sym(CU, { kind: "method", bodyHash: "bCU", callees: [FE], tags: { task: ["T-1"], dec: ["D-1"] } }),
    [FE]: sym(FE, { kind: "method", bodyHash: "bFE", callers: [CU], tags: { task: ["T-1"], dec: [] } }),
    [T1]: tst(T1, ["T-1.AC1"], [CU]),
    [T2]: tst(T2, ["T-1.AC2"], [CU]),
  }, warnings: [] };
  const run = (t, outcome = "pass") => ({ outcome, testBodyHash: index.symbols[t].bodyHash, coveredBodyHashes: Object.fromEntries(index.symbols[t].test.coversResolved.map((c) => [c, index.symbols[c].bodyHash])) });
  const state = { runs: { [T1]: run(T1), [T2]: run(T2) } };
  const lock = { symbols: {}, tests: { [T1]: { stage: "locked" }, [T2]: { stage: "locked" } }, tasks: { "T-1": { skeletonAt: "x", testsAt: "y" } } };
  const tasks = [{ id: "T-1", title: "Register", file: ".hitl/tasks/feat-users.md", planning: P, why: "dup check (D-1)", decisions: ["D-1"],
    acs: [{ id: "T-1.AC1", reqs: ["R-1"], text: "Given dup Then throws", done: false }, { id: "T-1.AC2", reqs: ["R-2"], text: "Given new Then returns", done: false }],
    symbols: [], testPlan: [], parseErrors: [], blockedBy: [] }];
  const statuses = { symbols: { [CU]: { status: "green" }, [FE]: { status: "green" } }, tasks: { "T-1": { status: "green", testsLocked: true, symbols: [CU, FE] } } };
  const planning = { file: P, title: "Users", status: "approved", hasRequirements: true,
    requirements: [{ id: "R-1", priority: "must", text: "reject duplicates", status: "active", supersededBy: null }, { id: "R-2", priority: "must", text: "return the user", status: "active", supersededBy: null }],
    decisions: [{ id: "D-1", decision: "Check in createUser", why: "", cost: "", serves: ["R-1", "R-2"], status: "accepted", supersededBy: null }],
    changelog: [], parseErrors: [] };
  return { index, state, lock, tasks, statuses, plannings: new Map([[P, planning]]), run };
}
const codes = (tr) => tr.items.map((i) => `${i.level}:${i.code}:${i.ref}`);
const only = (tr, code) => codes(tr).filter((c) => c.split(":")[1] === code);
const all = (b) => buildTrace(b, { kind: "all" });

test("clean fully proven task: no items, proven ACs, summary and counts", () => {
  const tr = all(base());
  assert.equal(tr.schema, "hitl.trace/1");
  assert.deepEqual(codes(tr), []);
  assert.deepEqual(tr.counts, { block: 0, warn: 0, info: 0 });
  assert.deepEqual(tr.rows.map((r) => [r.req?.id ?? null, r.acs.map((a) => [a.id, a.proven])]), [["R-1", [["T-1.AC1", true]]], ["R-2", [["T-1.AC2", true]]]]);
  assert.deepEqual(tr.summary, { reqs: { total: 2, active: 2, covered: 2 }, acs: { total: 2, tested: 2, proven: 2 }, tasks: 1 });
  assert.deepEqual(tr.plannings, [{ file: P, status: "approved", hasRequirements: true, requirements: 2, decisions: 1, exists: true }]);
  assert.deepEqual(tr.decisions, [{ planning: P, id: "D-1", status: "accepted", text: "Check in createUser", serves: ["R-1", "R-2"], tasks: ["T-1"], symbols: [CU] }]);
  const t = tr.rows[0].acs[0].tests[0];
  assert.deepEqual(t, { id: T1, title: "T-1.AC1 rejects", mode: "active", outcome: "pass", fresh: true, locked: true });
  assert.deepEqual(tr.rows[0].acs[0].symbols, [{ id: CU, name: "UserService.createUser", status: "green" }]);
});

test("REQ_UNKNOWN (AC and serves), REQ_INACTIVE", () => {
  let b = base(); b.tasks[0].acs[0].reqs = ["R-9"];
  assert.deepEqual(only(all(b), "REQ_UNKNOWN"), ["block:REQ_UNKNOWN:R-9"]);
  b = base(); b.plannings.get(P).decisions[0].serves = ["R-1", "R-7"];
  assert.deepEqual(all(b).items.filter((i) => i.code === "REQ_UNKNOWN").map((i) => [i.ref, i.task]), [["R-7", null]]);
  b = base(); Object.assign(b.plannings.get(P).requirements[0], { status: "superseded", supersededBy: "R-2" });
  const it = all(b).items.find((i) => i.code === "REQ_INACTIVE");
  assert.equal(it.level, "block"); assert.match(it.message, /superseded by R-2/);
  b = base(); b.plannings.get(P).requirements[0].status = "dropped";
  assert.deepEqual(only(all(b), "REQ_INACTIVE"), ["block:REQ_INACTIVE:R-1"]);
});

test("DEC_UNKNOWN (Why and @dec), DEC_SUPERSEDED_REF, DEC_UNUSED", () => {
  let b = base(); b.tasks[0].decisions = ["D-1", "D-9"]; b.index.symbols[CU].tags.dec = ["D-1", "D-8"];
  assert.deepEqual(only(all(b), "DEC_UNKNOWN"), ["block:DEC_UNKNOWN:D-8", "block:DEC_UNKNOWN:D-9"]);
  b = base(); Object.assign(b.plannings.get(P).decisions[0], { status: "superseded", supersededBy: "D-2" });
  b.plannings.get(P).decisions.push({ id: "D-2", decision: "new", serves: ["R-1", "R-2"], status: "accepted", supersededBy: null });
  const tr = all(b);
  assert.deepEqual(only(tr, "DEC_SUPERSEDED_REF"), ["warn:DEC_SUPERSEDED_REF:D-1", "warn:DEC_SUPERSEDED_REF:D-1"]);
  assert.deepEqual(only(tr, "DEC_UNUSED"), ["info:DEC_UNUSED:D-2"]);
});

test("AC_UNKNOWN, COVERS_UNRESOLVED, TEST_NO_COVERS, TEST_NO_AC", () => {
  const b = base();
  const X = `${TF}#x > T-1.AC9 x`, Y = `${TF}#y > T-7.AC1 y`, Z = `${TF}#z > no covers`, N = `${TF}#n > no ac`;
  b.index.symbols[X] = tst(X, ["T-1.AC9"], [CU]);
  b.index.symbols[Y] = tst(Y, ["T-7.AC1"], [CU]);
  b.index.symbols[Z] = tst(Z, ["T-1.AC1"], []);
  b.index.symbols[N] = tst(N, [], [CU]);
  b.index.symbols[T2].tags.covers = ["UserService.createUser", "Nope.gone"];
  const tr = all(b);
  assert.deepEqual(only(tr, "AC_UNKNOWN"), ["block:AC_UNKNOWN:T-1.AC9", "block:AC_UNKNOWN:T-7.AC1"]);
  assert.deepEqual(only(tr, "COVERS_UNRESOLVED"), [`block:COVERS_UNRESOLVED:${T2}`]);
  assert.deepEqual(only(tr, "TEST_NO_COVERS"), [`warn:TEST_NO_COVERS:${Z}`]);
  assert.deepEqual(only(tr, "TEST_NO_AC"), [`info:TEST_NO_AC:${N}`]);
  // index warning alone also counts as unresolved
  const b2 = base(); b2.index.warnings = [{ code: "UNRESOLVED_COVERS_TAG", symbol: T1, message: "x" }];
  assert.deepEqual(only(all(b2), "COVERS_UNRESOLVED"), [`block:COVERS_UNRESOLVED:${T1}`]);
});

test("PLANNING_MISSING is block with refs, info without; PLANNING_PARSE warns", () => {
  let b = base(); b.plannings.set(P, null);
  assert.deepEqual(only(all(b), "PLANNING_MISSING"), [`block:PLANNING_MISSING:${P}`]);
  b = base(); b.plannings.set(P, null); b.tasks[0].acs.forEach((a) => (a.reqs = [])); b.tasks[0].decisions = []; b.index.symbols[CU].tags.dec = [];
  assert.deepEqual(only(all(b), "PLANNING_MISSING"), [`info:PLANNING_MISSING:${P}`]);
  b = base(); b.plannings.get(P).parseErrors = [{ section: "requirements", line: "- R-x", message: "malformed requirement line" }];
  assert.deepEqual(only(all(b), "PLANNING_PARSE"), [`warn:PLANNING_PARSE:${P}`]);
  assert.deepEqual(only(buildTrace(b, { kind: "task", id: "T-1" }), "PLANNING_PARSE"), [], "planning-level check");
});

test("stage-dependent levels: AC_NO_TEST, AC_ONLY_STUB, SYMBOL_NO_TEST; AC_NOT_PROVEN only when late", () => {
  let b = base(); delete b.index.symbols[T2];
  assert.deepEqual(only(all(b), "AC_NO_TEST"), ["warn:AC_NO_TEST:T-1.AC2"]);
  assert.deepEqual(only(all(b), "AC_NOT_PROVEN"), ["warn:AC_NOT_PROVEN:T-1.AC2"]);
  b.lock.tasks["T-1"].skeletonAt = null; b.statuses.tasks["T-1"].status = "skeleton";
  assert.deepEqual(only(all(b), "AC_NO_TEST"), ["info:AC_NO_TEST:T-1.AC2"]);
  assert.deepEqual(only(all(b), "AC_NOT_PROVEN"), [], "not late");

  b = base(); for (const t of [T1, T2]) b.index.symbols[t].test.mode = "todo";
  assert.deepEqual(only(all(b), "AC_ONLY_STUB"), ["warn:AC_ONLY_STUB:T-1.AC1", "warn:AC_ONLY_STUB:T-1.AC2"]);
  b.statuses.tasks["T-1"].testsLocked = false;
  assert.deepEqual(only(all(b), "AC_ONLY_STUB"), ["info:AC_ONLY_STUB:T-1.AC1", "info:AC_ONLY_STUB:T-1.AC2"]);

  b = base(); const X = `${SVC}#helper`;
  b.index.symbols[X] = sym(X, { kind: "function", bodyHash: "h", tags: { task: ["T-1"], dec: [] } });
  assert.deepEqual(only(all(b), "SYMBOL_NO_TEST"), [`warn:SYMBOL_NO_TEST:${X}`]);
  b.lock.tasks["T-1"].skeletonAt = null;
  assert.deepEqual(only(all(b), "SYMBOL_NO_TEST"), [`info:SYMBOL_NO_TEST:${X}`]);
  assert.deepEqual(only(all(base()), "SYMBOL_NO_TEST"), [], "FE is covered indirectly via its caller's tests");

  b = base(); b.state.runs[T1].testBodyHash = "old";
  assert.deepEqual(only(all(b), "AC_NOT_PROVEN"), ["warn:AC_NOT_PROVEN:T-1.AC1"]);
  b.statuses.tasks["T-1"].status = "red";
  assert.deepEqual(only(all(b), "AC_NOT_PROVEN"), []);
});

test("proven requires a fresh pass for every covered symbol", () => {
  const b = base();
  b.index.symbols[T1].test.coversResolved = [CU, FE];
  b.state.runs[T1] = b.run(T1);
  assert.equal(all(b).rows[0].acs[0].proven, true);
  b.state.runs[T1].coveredBodyHashes[FE] = "stale";
  const tr = all(b);
  assert.equal(tr.rows[0].acs[0].proven, false);
  assert.equal(tr.rows[0].acs[0].tests[0].fresh, false);
  b.state.runs[T1] = b.run(T1, "fail");
  assert.equal(all(b).rows[0].acs[0].proven, false);
});

test("REQ_NO_AC, AC_NO_REQ, REQ_NO_DEC; task scope omits planning-level checks", () => {
  const b = base(); const R = b.plannings.get(P).requirements;
  R.push({ id: "R-3", priority: "should", text: "s", status: "active" }, { id: "R-4", priority: "could", text: "c", status: "active" }, { id: "R-5", priority: "must", text: "d", status: "deferred" });
  b.tasks[0].acs.push({ id: "T-1.AC3", reqs: [], text: "no req", done: false });
  const tr = all(b);
  assert.deepEqual(only(tr, "REQ_NO_AC"), ["warn:REQ_NO_AC:R-3", "info:REQ_NO_AC:R-4"]);
  assert.deepEqual(only(tr, "REQ_NO_DEC"), ["info:REQ_NO_DEC:R-3", "info:REQ_NO_DEC:R-4"]);
  assert.deepEqual(only(tr, "AC_NO_REQ"), ["info:AC_NO_REQ:T-1.AC3"]);
  const tt = buildTrace(b, { kind: "task", id: "T-1" });
  assert.deepEqual(only(tt, "REQ_NO_AC"), []);
  assert.deepEqual(only(tt, "REQ_NO_DEC"), []);
  assert.deepEqual(only(tt, "AC_NO_REQ"), ["info:AC_NO_REQ:T-1.AC3"]);
  assert.deepEqual(tt.scope, { kind: "task", id: "T-1" });
  const tp = buildTrace(b, { kind: "planning", file: "feat-users.md" });
  assert.deepEqual(tp.scope, { kind: "planning", id: P });
  assert.deepEqual(only(tp, "REQ_NO_AC"), only(tr, "REQ_NO_AC"));
  // legacy planning without Requirements: no AC_NO_REQ
  const l = base(); Object.assign(l.plannings.get(P), { hasRequirements: false, requirements: [] }); l.plannings.get(P).decisions[0].serves = []; l.tasks[0].acs.forEach((a) => (a.reqs = []));
  assert.deepEqual(only(all(l), "AC_NO_REQ"), []);
  assert.deepEqual(all(l).counts.block, 0);
});

test("row ordering (numeric R, loose ACs, quick tasks last) and item sort", () => {
  const b = base(); const R = b.plannings.get(P).requirements;
  R.push({ id: "R-10", priority: "must", text: "ten", status: "active" });
  b.tasks[0].acs.push({ id: "T-1.AC3", reqs: ["R-10"], text: "x", done: false }, { id: "T-1.AC4", reqs: [], text: "y", done: false });
  b.tasks.push({ id: "T-2", title: "quick", file: ".hitl/tasks/quick-x.md", planning: "none", why: null, decisions: [],
    acs: [{ id: "T-2.AC1", reqs: [], text: "q", done: false }], symbols: [], testPlan: [], parseErrors: [], blockedBy: [] });
  const tr = all(b);
  assert.deepEqual(tr.rows.map((r) => [r.planning, r.req?.id ?? null, r.acs.map((a) => a.id)]),
    [[P, "R-1", ["T-1.AC1"]], [P, "R-2", ["T-1.AC2"]], [P, "R-10", ["T-1.AC3"]], [P, null, ["T-1.AC4"]], [null, null, ["T-2.AC1"]]]);
  const lv = { block: 0, warn: 1, info: 2 };
  for (let i = 1; i < tr.items.length; i++) {
    const a = tr.items[i - 1], c = tr.items[i];
    assert.ok(lv[a.level] < lv[c.level] || (a.level === c.level && a.code <= c.code), `${a.code} before ${c.code}`);
  }
  assert.equal(tr.counts.warn, tr.items.filter((i) => i.level === "warn").length);
});

test("specLinksFor via @dec and via @covers → @ac → reqs; tests get their own @ac reqs; null without planning", () => {
  const b = base();
  assert.deepEqual(specLinksFor(b, CU), { planning: P, decisions: [{ id: "D-1", text: "Check in createUser", status: "accepted", via: "@dec" }],
    requirements: [{ id: "R-1", text: "reject duplicates", via: "T-1.AC1" }, { id: "R-2", text: "return the user", via: "T-1.AC2" }] });
  assert.deepEqual(specLinksFor(b, FE), { planning: P, decisions: [], requirements: [] }, "only direct @covers");
  assert.deepEqual(specLinksFor(b, T1), { planning: P, decisions: [], requirements: [{ id: "R-1", text: "reject duplicates", via: "T-1.AC1" }] });
  b.lock.symbols["src/x.ts#gone"] = { task: "T-1" };
  assert.deepEqual(specLinksFor(b, "src/x.ts#gone"), { planning: P, decisions: [], requirements: [] });
  b.plannings.set(P, null);
  assert.equal(specLinksFor(b, CU), null);
});

test("renderTraceMd: header, matrix rows, decisions line, markers, no percentages", () => {
  const b = base(); b.plannings.get(P).requirements.push({ id: "R-3", priority: "should", text: "s", status: "active" });
  b.index.symbols[T2].test.mode = "todo";
  const md = renderTraceMd(all(b));
  assert.match(md, /^# Trace — feat-users\.md \(planning approved · R 3 · D 1\)\n\| R \| AC \| tests \(fresh\) \| symbols \(status\) \|/);
  assert.match(md, /\| R-1 must \| T-1\.AC1 \| "T-1\.AC1 rejects" ✅ \| UserService\.createUser \(green\) \|/);
  assert.match(md, /\| R-2 must \| T-1\.AC2 \| "T-1\.AC2 returns" 📝 \|/);
  assert.match(md, /\| R-3 should \| — \| — \| — \|/);
  assert.match(md, /Decisions: D-1 → T-1, UserService\.createUser \(@dec\)/);
  assert.match(md, /⚠️ REQ_NO_AC R-3 — no AC references R-3/);
  assert.match(md, /summary: 0 block · \d+ warn · \d+ info\n$/);
  assert.ok(!md.includes("%"));
});
