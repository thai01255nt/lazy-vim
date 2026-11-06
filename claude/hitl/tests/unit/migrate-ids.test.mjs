// 0.13 — change keys and change-scoped ids: keys.mjs (suggest, legacy keys, registry), the id grammar, and
// `hitl-index migrate --ids` on a 0.12 project (tests/fixtures/legacy-ids, built with the 0.12 CLI).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkKey, keyCandidates, legacyKeyFor, makeQuickKey, quickKeyCandidate, quickSlugLetters, readKeyRegistry, setQuickFileKey, suggestKey } from "../../scripts/lib/keys.mjs";
import { AC_ID_RE, DEC_ID_RE, TASK_ID_RE, compareTaskIds, keyOf, parseTaskId } from "../../scripts/lib/specids.mjs";
import { addProposalKey, parseKeysArg, rewriteTaskIds, stripCapabilityKey } from "../../scripts/lib/migrateids.mjs";
import { parseTasksMd, nextTaskId } from "../../scripts/lib/tasksmd.mjs";
import { parseDoc } from "../../scripts/lib/tags.mjs";
import { parseMarker } from "../../scripts/lib/tickets.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN = path.resolve(HERE, "../..");
const CLI = path.join(PLUGIN, "scripts/hitl-index.mjs");
const FIX = path.join(PLUGIN, "tests/fixtures/legacy-ids");
const cli = (cwd, ...args) => { const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8", timeout: 60000 }); return { code: r.status, out: r.stdout, err: r.stderr, json: () => JSON.parse(r.stdout) }; };
const legacy = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-migids-")); fs.cpSync(FIX, d, { recursive: true }); return d; };
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const KEYS = "feat-2fa=TFA,feat-password-reset=PWR,cap:accounts=LACC,quick:fix-label-typo=QFLT";
const git = (cwd, ...a) => spawnSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" } });

test("id grammar: task, AC and decision ids carry a 2–5 letter change key", () => {
  assert.ok(TASK_ID_RE.test("PWR-T3") && TASK_ID_RE.test("QT-T12") && !TASK_ID_RE.test("T-3") && !TASK_ID_RE.test("P-T3") && !TASK_ID_RE.test("ABCDEF-T1"));
  assert.ok(AC_ID_RE.test("PWR-T3.AC2") && !AC_ID_RE.test("T-3.AC2"));
  assert.ok(DEC_ID_RE.test("PWR-D1") && !DEC_ID_RE.test("D-1"));
  assert.deepEqual(parseTaskId("PWR-T3.AC2"), { key: "PWR", n: 3, ac: 2, task: "PWR-T3" });
  assert.equal(keyOf("LACC-R3.S1"), "LACC");
  assert.deepEqual(["PWR-T10", "FEE-T2", "PWR-T2", "PWR-T2.AC1"].sort(compareTaskIds), ["FEE-T2", "PWR-T2", "PWR-T2.AC1", "PWR-T10"]);
});

test("keys: type letter + 3 initials of the change id, 5th letter on collision; legacy keys per capability; checkKey codes", () => {
  assert.deepEqual(["refactor-lua-const-mirror", "feat-billing-exec-settle", "feat-executor-answer-contract", "fix-login-page", "fix-login", "perf-cache-warm-up-job"].map((id) => keyCandidates(id, "Ignored title")[0]), ["RLCM", "FBES", "FEAC", "XLGP", "XLGN", "PCWU"]);
  assert.equal(keyCandidates("ops-rotate-api-keys")[0], "ORAK", "an unknown type gives its first letter");
  assert.equal(suggestKey("feat-executor-answer-contract", null, new Set(["FEAC"])), "FEACA", "a taken key gets a 5th letter");
  assert.equal(suggestKey("feat-executor-answer-contract", null, new Set(["FEAC", "FEACA"])), "FEACB");
  assert.match(suggestKey("feat-a-b", null, new Set()), /^[A-Z]{2,5}$/);
  assert.equal(legacyKeyFor("accounts", "ACC", new Set()), "LACC");
  assert.equal(legacyKeyFor("billing-and-invoices", "BILLS", new Set()), "LBILL", "clipped to 5 letters");
  assert.notEqual(legacyKeyFor("accounts", "ACC", new Set(["LACC"])), "LACC");
  const reg = { byKey: new Map([["QT", [{ change: null, source: "quick" }]], ["PWR", [{ change: "feat-pwr", archived: true, source: "proposal" }]]]), byChange: new Map() };
  assert.equal(checkKey(reg, "pw", null).code, "CHANGE_KEY_BAD");
  assert.equal(checkKey(reg, "PWR", "feat-new").code, "CHANGE_KEY_TAKEN");
  assert.match(checkKey(reg, "PWR", "feat-new").message, /archived change feat-pwr/);
  assert.equal(checkKey(reg, "PWR", "feat-pwr"), null);
  assert.equal(checkKey(reg, "QT", null).code, "CHANGE_KEY_TAKEN");
});

test("pre-0.13 ids: tasks docs record them, tags reject them with the migrate hint; nextTaskId is per change key", async () => {
  const d = parseTasksMd("# T\n← Change: feat-x\n\n## T-3 Old\n- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo\n\n## PWR-T1 New\n- prio: P1 | risk: low | impl: agent | blocked-by: PWR-T9, FEE-T2 | status: todo\n", ".hitl/changes/feat-x/tasks.md");
  assert.deepEqual([d.legacyIds, d.tasks.map((t) => t.id), d.tasks[0].blockedBy], [["T-3"], ["PWR-T1"], ["PWR-T9", "FEE-T2"]]);
  const p = parseDoc("@task T-3 @ac T-3.AC1 @dec D-1");
  assert.deepEqual(p.tags.task, []);
  assert.match(p.errors[0].message, /pre-0\.13 id: run \/hitl:migrate/);
  assert.deepEqual(p.tags.dec, ["D-1"], "a v0.5 planning decision keeps D-n");
  assert.deepEqual(parseDoc("@task PWR-T3 @ac PWR-T3.AC1 @dec PWR-D2").tags, { ...parseDoc("").tags, task: ["PWR-T3"], ac: ["PWR-T3.AC1"], dec: ["PWR-D2"] });
  const root = legacy();
  assert.equal(cli(root, "migrate", "--ids", "--keys", KEYS).code, 0);
  assert.equal(await nextTaskId(root, "feat-password-reset"), "PWR-T3");
  // 0.13.2: a new quick file gets a fresh key of its own, never QT and never a taken key
  assert.match(await nextTaskId(root, "quick"), /^Q[A-Z]{1,4}-T1$/);
  assert.equal(await nextTaskId(root, "quick", { slug: "fix-greeting", seed: "s" }), await nextTaskId(root, "quick", { slug: "fix-greeting", seed: "s" }));
  await assert.rejects(nextTaskId(root, "feat-nope"), /no key yet/);
  assert.equal(cli(root, "next-id", "feat-password-reset").out.trim(), "PWR-T3");
  assert.equal(cli(root, "next-id", "--quick", "quick-fix-greeting").out.trim(), "QFXG-T1");
  const j = cli(root, "next-id", "--quick", "fix-greeting", "--json").json();
  assert.ok(j.key === "QFXG" && j.next === "QFXG-T1");
  assert.equal(cli(root, "next-id").code, 2);
  assert.equal(cli(root, "next-id", "--quick", "a", "b").code, 2);
});

test("quick keys: Q + 3 initials of the slug, 5th letter on collision, deterministic; header insertion", () => {
  assert.deepEqual(["fix-label-typo", "quick-mirror-plain-str.md", "typo", "42", ""].map(quickSlugLetters), ["FLT", "MPS", "TPY", "", ""]);
  assert.equal(quickKeyCandidate("mirror-plain-str"), "QMPS");
  assert.equal(quickKeyCandidate(""), "QX");
  assert.equal(makeQuickKey("fix-label-typo", new Set()), "QFLT");
  assert.equal(makeQuickKey("fix-label-typo", new Set(["QFLT"])), "QFLTA", "a taken key gets a 5th letter");
  assert.equal(makeQuickKey("t", new Set()), "QTXX", "never QT");
  assert.equal(setQuickFileKey("# T\n← Change: none\n> status: draft\n", "QFLT"), "# T\n← Change: none | key: QFLT\n> status: draft\n");
  assert.equal(setQuickFileKey("# T\n← Change: none | key: QABCD\n", "QFLT"), "# T\n← Change: none | key: QABCD\n");
  assert.equal(setQuickFileKey("# T\n\n## QT-T1 A\n", "QFLT"), "# T\n← Change: none | key: QFLT\n\n## QT-T1 A\n");
});

test("helpers: --keys parsing, task id rewrite, proposal key insertion, capability key strip", () => {
  assert.deepEqual(parseKeysArg("feat-a=PWR, cap:accounts=LACC, quick:quick-fix-x=QFXAB"), { changes: { "feat-a": "PWR" }, caps: { accounts: "LACC" }, quick: { "fix-x": "QFXAB" }, errors: [] });
  assert.match(parseKeysArg("feat-a=pw").errors[0], /2–5 upper-case letters/);
  assert.deepEqual(parseKeysArg('{"feat-a":"PWR"}').changes, { "feat-a": "PWR" });
  assert.equal(rewriteTaskIds("T-3, T-3.AC2, PWR-T3, UTF-8, T-30", { "T-3": "PWR-T1" }), "PWR-T1, PWR-T1.AC2, PWR-T3, UTF-8, T-30");
  assert.equal(addProposalKey("# x\n> change: feat-a | status: draft\n", "PWR"), "# x\n> change: feat-a | key: PWR | status: draft\n");
  assert.equal(addProposalKey("> change: feat-a | key: ABC | status: draft", "PWR"), "> change: feat-a | key: ABC | status: draft");
  assert.equal(stripCapabilityKey("> capability: accounts | key: ACC | updated: 2026-01-01"), "> capability: accounts | updated: 2026-01-01");
});

test("legacy project: status routes to /hitl:migrate, approve refuses with the hint, nothing crashes", () => {
  const root = legacy();
  assert.equal(cli(root, "index", "--all", "--quiet").code, 0);
  const st = cli(root, "status", "--json").json();
  assert.equal(st.next.command, "/hitl:migrate");
  assert.equal(st.idsLegacy.code, "IDS_LEGACY");
  assert.match(cli(root, "status", "--brief").out, /^⚠️ HITL: pre-0\.13 ids .* run \/hitl:migrate/);
  const a = cli(root, "approve", "T-12", "--stage", "tests");
  assert.equal(a.code, 1);
  assert.match(a.err, /T-12 is a pre-0\.13 task id: run \/hitl:migrate/);
  const v = cli(root, "spec", "validate", "--json").json();
  assert.ok(v.items.some((i) => i.code === "CHANGE_KEY_MISSING" && /\/hitl:migrate/.test(i.message)));
  assert.ok(v.items.some((i) => i.code === "IDS_LEGACY"));
  assert.match(cli(root, "context", "T-12").err, /pre-0\.13 task id and there is no id map: run \/hitl:migrate/);
  for (const c of [["trace", "--json"], ["drift", "--json"], ["tasks", "--check"]]) assert.ok([0, 1].includes(cli(root, ...c).code), c.join(" "));
});

test("migrate --ids: dry run plans everything and writes nothing; keys table; refusal on bad/taken keys", () => {
  const root = legacy();
  const snap = () => spawnSync("find", [".", "-type", "f", "-newer", path.join(root, ".hitl/hitl.config.json")], { cwd: root, encoding: "utf8" }).stdout;
  const before = rd(root, ".hitl/changes/feat-password-reset/tasks.md");
  const d = cli(root, "migrate", "--ids", "--dry-run", "--json").json();
  assert.equal(d.status, "plan");
  assert.equal(d.quickKeys.length, 1);
  assert.deepEqual([d.quickKeys[0].file, d.quickKeys[0].slug, d.quickKeys[0].source], [".hitl/tasks/fix-label-typo.md", "fix-label-typo", "suggested"]);
  assert.match(d.quickKeys[0].key, /^QF[A-Z]{2,3}$/, "a quick file's own key: Q + 3 initials of the slug");
  assert.equal(cli(root, "migrate", "--ids", "--dry-run", "--json").json().quickKeys[0].key, d.quickKeys[0].key, "deterministic: the dry run and the apply agree");
  assert.equal(rd(root, ".hitl/changes/feat-password-reset/tasks.md"), before, "dry run wrote nothing");
  assert.ok(!fs.existsSync(path.join(root, ".hitl/index/id-map.json")));
  assert.deepEqual(d.keys.map((k) => [k.change, k.archived, k.source]), [["feat-2fa", true, "suggested"], ["feat-password-reset", false, "suggested"]]);
  assert.deepEqual(d.legacyKeys.map((k) => [k.capability, k.oldKey, k.key]), [["accounts", "ACC", "LACC"]]);
  for (const k of d.keys) assert.match(k.key, /^[A-Z]{2,5}$/);
  const g = cli(root, "migrate", "--ids", "--dry-run", "--keys", KEYS, "--json").json();
  assert.deepEqual(g.map.tasks, { "T-12": "PWR-T1", "T-13": "PWR-T2", "T-20": "QFLT-T1", "T-10": "TFA-T1" });
  assert.deepEqual(g.map.specs, { "ACC-R1": "LACC-R1", "ACC-R2": "LACC-R2", "ACC-R4": "LACC-R3", "ACC-R3": "TFA-R1", "ACC-R5": "PWR-R1", "ACC-R6": "PWR-R2", "ACC-BR1": "PWR-BR1", "ACC-UC1": "PWR-UC1" },
    "a living id keeps the key of the change that ADDED it; unknown origin → the legacy key, old order");
  assert.deepEqual(g.map.decisions, { "feat-password-reset/D-1": "PWR-D1", "feat-password-reset/D-2": "PWR-D2" });
  assert.deepEqual(g.files.code, ["src/labels.py", "src/reset.ts", "tests/reset.test.ts", "tests/test_labels.py"]);
  assert.deepEqual(g.files.renamed.map((r) => r.to), [".hitl/reviews/PWR-T1", ".hitl/reviews/PWR-T1.review.md"]);
  assert.equal(g.lock.tasks, 4);
  const bad = cli(root, "migrate", "--ids", "--keys", "feat-2fa=PWR,feat-password-reset=PWR");
  assert.equal(bad.code, 1);
  assert.match(bad.err, /CHANGE_KEY_TAKEN PWR/);
  assert.equal(cli(root, "migrate", "--ids", "--keys", "feat-2fa=QT").code, 1, "the quick key is reserved");
  assert.equal(cli(root, "migrate", "--ids", "--keys", "quick:fix-label-typo=PWR,feat-password-reset=PWR").code, 1, "a quick key is unique too");
  assert.equal(cli(root, "migrate", "--ids", "--keys", "quick:nope=QNOPE").code, 1, "no such quick file");
  assert.equal(cli(root, "migrate", "--ids", "--keys", "feat-2fa=ACC").code, 1, "an old capability key is taken");
  assert.equal(cli(root, "migrate", "--ids", "--keys", "feat-nope=NOPE").code, 1);
  assert.equal(rd(root, ".hitl/changes/feat-password-reset/tasks.md"), before, "refusals wrote nothing");
  assert.equal(cli(root, "migrate", "--keys", "x=AB").code, 2, "--keys needs --ids");
  void snap;
});

test("migrate --ids: everything renamed, lock/2 re-keyed, hashes clean, id map written; validate/trace/drift clean; second run no-op", () => {
  const root = legacy();
  assert.equal(cli(root, "index", "--all", "--quiet").code, 0);
  const r = cli(root, "migrate", "--ids", "--keys", KEYS, "--json");
  assert.equal(r.code, 0, r.err + r.out);
  assert.equal(r.json().status, "applied");
  const C = ".hitl/changes/feat-password-reset";
  assert.match(rd(root, `${C}/proposal.md`), /^> change: feat-password-reset \| key: PWR \| status: approved/m);
  assert.match(rd(root, ".hitl/archive/2026-10-20-feat-2fa/proposal.md"), /\| key: TFA \|/);
  const tasks = rd(root, `${C}/tasks.md`);
  assert.match(tasks, /^## PWR-T1 Send a reset link$/m);
  assert.match(tasks, /blocked-by: PWR-T1 \| status/);
  assert.match(tasks, /- \[ \] PWR-T1\.AC1 \(PWR-R1\.S1\) /);
  assert.match(tasks, /\*\*Why\*\*: single-use hashed token \(PWR-D1\)/);
  assert.match(rd(root, `${C}/design.md`), /\| PWR-D1 \| Store a hash .* \| PWR-R1, PWR-BR1 \| accepted \|/);
  assert.match(rd(root, `${C}/specs/accounts/spec.md`), /^> capability: accounts \| change: feat-password-reset$/m);
  assert.match(rd(root, `${C}/specs/accounts/spec.md`), /### Requirement: LACC-R1 Sign in/, "MODIFIED keeps the living id");
  const living = rd(root, ".hitl/specs/accounts/spec.md");
  assert.match(living, /^> capability: accounts \| updated: /m);
  assert.match(living, /### Requirement: TFA-R1 Two-factor code/);
  assert.match(living, /- LACC-R3 Security questions — removed by feat-2fa/);
  assert.match(living, /- 2026-10-20 feat-2fa: \+TFA-R1 -LACC-R3/);
  assert.match(rd(root, `${C}/notes.md`), /- refs: PWR-D1 \(Store a hash of the reset token, never the token\), PWR-T2 \(Set a new password\)/);
  assert.match(rd(root, ".hitl/tasks/fix-label-typo.md"), /^← Change: none \| key: QFLT\n[\s\S]*^## QFLT-T1 Fix the label typo$/m);
  const ts = rd(root, "src/reset.ts");
  assert.match(ts, /@task PWR-T1 @impl agent @status skeleton @prio 1\n \* @dec PWR-D1/);
  assert.match(ts, /\/\/ TODO\(impl PWR-T1\): 1\. find the account/);
  assert.match(ts, /@task PWR-T2 @impl agent/);
  assert.match(rd(root, "tests/reset.test.ts"), /@ac PWR-T1\.AC1 /);
  assert.match(rd(root, "src/labels.py"), /@task QFLT-T1 @impl agent[\s\S]*# TODO\(impl QFLT-T1\)/);
  const lock = JSON.parse(rd(root, ".hitl/index/skeleton.lock.json"));
  assert.equal(lock.schema, "hitl.lock/2");
  assert.deepEqual(Object.keys(lock.tasks).sort(), ["PWR-T1", "PWR-T2", "QFLT-T1", "TFA-T1"]);
  assert.equal(lock.symbols["src/reset.ts#requestReset"].task, "PWR-T1");
  assert.equal(lock.symbols["src/reset.ts#requestReset"].intentLog[0].task, "PWR-T1");
  assert.ok(fs.existsSync(path.join(root, ".hitl/reviews/PWR-T1/decisions.json")) && !fs.existsSync(path.join(root, ".hitl/reviews/T-12")));
  assert.match(rd(root, ".hitl/reviews/PWR-T1.review.md"), /# Review PWR-T1 — .*\n.*\n- F-1 requestReset leaks whether PWR-T1\.AC2's email exists \(PWR-D1, PWR-R1\.S2\)/);
  const map = JSON.parse(rd(root, ".hitl/linear.map.json"));
  assert.deepEqual(Object.keys(map.tasks), ["PWR-T1", "PWR-T2"]);
  assert.deepEqual(map.tasks["PWR-T2"].pushed.relations, ["PWR-T1"]);
  assert.equal(map.tasks["PWR-T1"].pushed.title, "T-12 · Send a reset link", "what was pushed stays: the next push rewrites title + marker");
  const idm = JSON.parse(rd(root, ".hitl/index/id-map.json"));
  assert.deepEqual([idm.schema, idm.keys, idm.legacyKeys, idm.quickKeys, idm.ids["T-12"], idm.ids["ACC-R5"], idm.ids["feat-password-reset/D-1"]],
    ["hitl.id-map/1", { "feat-2fa": "TFA", "feat-password-reset": "PWR" }, { accounts: "LACC" }, { ".hitl/tasks/fix-label-typo.md": "QFLT" }, "PWR-T1", "PWR-R1", "PWR-D1"]);
  // nothing reads as drift or a changed base after a pure rename
  const v = cli(root, "spec", "validate", "--json").json();
  assert.deepEqual([v.counts.error, v.counts.warn], [0, 0], JSON.stringify(v.items));
  assert.equal(cli(root, "tasks", "--check").code, 0);
  const dr = cli(root, "drift", "--json").json();
  assert.deepEqual([dr.summary.block, dr.summary.warn], [0, 0], JSON.stringify(dr.items));
  const tr = cli(root, "trace", "--check", "--json");
  assert.equal(tr.code, 0, tr.out.slice(0, 2000));
  const st = cli(root, "status", "--json").json();
  assert.equal(st.idsLegacy, undefined);
  assert.equal(st.tasks["PWR-T1"].status, "approved");
  assert.equal(st.drift.block, 0);
  // second run: nothing to do; old ids resolve through the map
  const again = cli(root, "migrate", "--ids", "--json").json();
  assert.equal(again.status, "current");
  assert.match(cli(root, "context", "T-12").out, /^# Context PWR-T1 — Send a reset link/);
  assert.equal(cli(root, "context", "ACC-R5.S2", "--json").json().id, "PWR-R1.S2");
  assert.equal(cli(root, "context", "feat-password-reset/D-1", "--json").json().id, "PWR-D1");
  assert.match(rd(root, ".hitl/.gitignore"), /^!index\/id-map\.json$/m, "the id map is committed");
});

test("migrate --ids refuses while .hitl/ or a tagged source file has uncommitted changes (--force overrides)", () => {
  const root = legacy();
  git(root, "init", "-q"); git(root, "add", "-A"); git(root, "-c", "user.email=t@x", "-c", "user.name=t", "commit", "-qm", "legacy");
  fs.appendFileSync(path.join(root, "src/reset.ts"), "\n// wip\n");
  const r = cli(root, "migrate", "--ids", "--keys", KEYS);
  assert.equal(r.code, 1);
  assert.match(r.err, /uncommitted changes in 1 file\(s\) .*src\/reset\.ts/);
  assert.match(rd(root, ".hitl/changes/feat-password-reset/tasks.md"), /^## T-12 /m, "nothing written");
  const dry = cli(root, "migrate", "--ids", "--dry-run", "--json").json();
  assert.deepEqual(dry.dirty, ["src/reset.ts"]);
  const f = cli(root, "migrate", "--ids", "--keys", KEYS, "--force");
  assert.equal(f.code, 0, f.err);
  assert.match(rd(root, "src/reset.ts"), /@task PWR-T1 /);
});

test("tickets: a pre-0.13 marker / title prefix resolves through the id map; unknown old ids are skipped", () => {
  assert.deepEqual(parseMarker("<!-- hitl:task=PWR-T3 repo=acme -->"), { task: "PWR-T3", repo: "acme", file: null });
  assert.deepEqual(parseMarker("<!-- hitl:task=T-12 file=.hitl/tasks/x.md -->", { "T-12": "PWR-T1" }), { task: "PWR-T1", repo: null, file: ".hitl/tasks/x.md", legacy: "T-12" });
  assert.equal(parseMarker("<!-- hitl:task=T-99 -->", { "T-12": "PWR-T1" }).task, null);
});

test("readKeyRegistry: proposals (active + archived), legacy keys in living ids, the reserved quick key", async () => {
  const root = legacy();
  assert.equal(cli(root, "migrate", "--ids", "--keys", KEYS).code, 0);
  const reg = await readKeyRegistry(root);
  assert.deepEqual([...reg.byChange], [["feat-password-reset", "PWR"], ["feat-2fa", "TFA"]]);
  assert.ok(["QT", "PWR", "TFA", "LACC", "QFLT"].every((k) => reg.byKey.has(k)));
  assert.equal(checkKey(reg, "QFLT", "feat-new").code, "CHANGE_KEY_TAKEN");
  assert.match(checkKey(reg, "QFLT", "feat-new").message, /the quick file tasks\/fix-label-typo\.md/);
  assert.equal(cli(root, "spec", "key", "--check", "LACC").code, 1);
});

test("migrate --ids (0.13.2): a 0.13.1 project's QT quick task moves to its file's own key (tags, lock, review dir, tickets map, id map)", () => {
  const root = legacy();
  assert.equal(cli(root, "index", "--all", "--quiet").code, 0);
  assert.equal(cli(root, "migrate", "--ids", "--keys", KEYS).code, 0);
  // back to what 0.13.0–0.13.1 wrote: the quick task under the shared key QT, no header key, a review and a ticket
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  for (const f of walk(root)) { const t = fs.readFileSync(f, "utf8"); if (t.includes("QFLT")) fs.writeFileSync(f, t.replace(/ \| key: QFLT/g, "").replace(/QFLT/g, "QT")); }
  fs.mkdirSync(path.join(root, ".hitl/reviews/QT-T1"), { recursive: true });
  fs.writeFileSync(path.join(root, ".hitl/reviews/QT-T1/decisions.json"), '{"task":"QT-T1"}\n');
  const lm = JSON.parse(rd(root, ".hitl/linear.map.json"));
  lm.tasks["QT-T1"] = { issue: "ENG-9", pushed: { title: "QT-T1 · Fix the label typo", relations: [] } };
  fs.writeFileSync(path.join(root, ".hitl/linear.map.json"), JSON.stringify(lm, null, 2));
  assert.match(rd(root, ".hitl/tasks/fix-label-typo.md"), /^← Change: none\n[\s\S]*^## QT-T1 /m);
  // a keyed project: QT is legacy → status routes to /hitl:migrate, tasks --check names IDS_LEGACY
  const st = cli(root, "status", "--json").json();
  assert.equal(st.next.command, "/hitl:migrate");
  assert.match(st.idsLegacy.reasons.join(" "), /legacy QT-T<n> quick-task ids in \.hitl\/tasks\/fix-label-typo\.md/);
  assert.match(cli(root, "status", "--brief").out, /^⚠️ HITL: legacy quick-task ids \(legacy QT-T<n> .* run \/hitl:migrate/);
  const ck = cli(root, "tasks", "--check");
  assert.equal(ck.code, 1);
  assert.match(ck.out + ck.err, /IDS_LEGACY: QT-T1 uses the legacy shared quick key QT/);
  // dry run → the quick file's own key; apply rewrites everything that names QT-T1
  const d = cli(root, "migrate", "--ids", "--dry-run", "--json").json();
  assert.equal(d.status, "plan");
  const K = d.quickKeys[0].key;
  assert.match(K, /^QF[A-Z]{2,3}$/);
  assert.deepEqual(d.map.tasks, { "QT-T1": `${K}-T1` });
  const r = cli(root, "migrate", "--ids", "--keys", `quick:fix-label-typo=${K}`, "--json");
  assert.equal(r.code, 0, r.err + r.out);
  assert.match(rd(root, ".hitl/tasks/fix-label-typo.md"), new RegExp(`^← Change: none \\| key: ${K}\\n[\\s\\S]*^## ${K}-T1 Fix the label typo$[\\s\\S]*- \\[ \\] ${K}-T1\\.AC1 `, "m"));
  assert.match(rd(root, "src/labels.py"), new RegExp(`@task ${K}-T1 @impl agent[\\s\\S]*# TODO\\(impl ${K}-T1\\)`));
  assert.ok(Object.keys(JSON.parse(rd(root, ".hitl/index/skeleton.lock.json")).tasks).includes(`${K}-T1`));
  assert.ok(fs.existsSync(path.join(root, `.hitl/reviews/${K}-T1/decisions.json`)) && !fs.existsSync(path.join(root, ".hitl/reviews/QT-T1")));
  assert.equal(JSON.parse(rd(root, ".hitl/linear.map.json")).tasks[`${K}-T1`].issue, "ENG-9");
  const idm = JSON.parse(rd(root, ".hitl/index/id-map.json"));
  assert.deepEqual([idm.ids["QT-T1"], idm.ids["T-20"], idm.quickKeys[".hitl/tasks/fix-label-typo.md"]], [`${K}-T1`, `${K}-T1`, K], "older map entries follow the rename");
  assert.equal(cli(root, "tasks", "--check").code, 0);
  assert.equal(cli(root, "status", "--json").json().idsLegacy, undefined);
  assert.equal(cli(root, "migrate", "--ids", "--json").json().status, "current");
  assert.match(cli(root, "context", "QT-T1").out, new RegExp(`^# Context ${K}-T1 — Fix the label typo`));
});

test("migrate --ids: a keyed quick task moved into a change is renumbered under the change key; its old quick key goes", () => {
  const root = legacy();
  assert.equal(cli(root, "index", "--all", "--quiet").code, 0);
  assert.equal(cli(root, "migrate", "--ids", "--keys", KEYS).code, 0);
  const Q = ".hitl/tasks/fix-label-typo.md";
  fs.writeFileSync(path.join(root, Q), rd(root, Q).replace("← Change: none | key: QFLT", "← Change: feat-password-reset | key: QFLT"));
  const ck = cli(root, "tasks", "--check");
  assert.match(ck.out + ck.err, /TASK_KEY_MISMATCH: QFLT-T1 does not use the key PWR of feat-password-reset/);
  const d = cli(root, "migrate", "--ids", "--json");
  assert.equal(d.code, 0, d.err + d.out);
  assert.deepEqual([d.json().map.tasks, d.json().quickKeys], [{ "QFLT-T1": "PWR-T3" }, []]);
  assert.match(rd(root, Q), /^← Change: feat-password-reset\n[\s\S]*^## PWR-T3 Fix the label typo$/m);
  assert.match(rd(root, "src/labels.py"), /@task PWR-T3 @impl agent/);
  assert.equal(cli(root, "tasks", "--check").code, 0);
});
