// 0.18 — amend step 2: the dependency pass of an amendment (callers over the call graph, their tests, data-model
// entities; AMEND_UNCOVERED for callers), the INTENT_HISTORY lint (English + Vietnamese, true and false positives,
// opt-out), and parallel change for merged or released behaviour (**Temp**: / **Removes**: / deploy:,
// AMEND_TEMP_NO_REMOVAL, AMEND_CONTRACT_SAME_DEPLOY, the AMEND_ORDER extension; in-branch sets unaffected).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { amendAffected, callPass, callLines, checkAmendCoverage, checkAmendOrder, checkAmendTemp, dataModelEntities, identWords, renderAmendBriefHead } from "../../scripts/lib/amend.mjs";
import { historyHits, symbolHistory, historyItems, HISTORY_PATTERNS } from "../../scripts/lib/history.mjs";
import { intentReport } from "../../scripts/lib/intents.mjs";
import { parseTasksMd, checkTaskChanges } from "../../scripts/lib/tasksmd.mjs";
import { parseBrief } from "../../scripts/lib/brief.mjs";
import { makeProject, write, REPO } from "./_project.mjs";
import { updateIndex, readIndex, computeDrift } from "../../scripts/lib/api.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

// ---------------------------------------------------------------- dependency pass

const sym = (id, kind, extra = {}) => ({ id, name: id.slice(id.indexOf("#") + 1), file: id.slice(0, id.indexOf("#")), kind, tags: {}, callers: [], signature: "", intent: "", ...extra });
const INDEX = () => ({ symbols: Object.fromEntries([
  sym("src/reset.ts#ResetService.request", "method", { tags: { task: ["PWR-T1"], dec: ["PWR-D2"] }, signature: "request(email: string): ResetToken", intent: "Issues a reset token for an email.",
    callers: ["src/http.ts#ResetController.post", "src/job.ts#ResetJob.resend", "tests/http.test.ts#makeReset"] }),
  sym("tests/http.test.ts#makeReset", "function"),
  sym("src/http.ts#ResetController.post", "method", { tags: { task: ["PWR-T3"] }, callers: ["src/app.ts#routes"] }),
  sym("src/job.ts#ResetJob.resend", "method", { tags: { task: ["PWR-T9"] } }),
  sym("src/app.ts#routes", "function"),
  sym("src/audit.ts#auditReset", "function", { tags: { calls: ["ResetService.request"] }, intent: "Writes an audit entry per reset." }),
  sym("tests/http.test.ts#posts a reset", "test", { tags: { covers: ["ResetController.post"] }, test: { titlePath: ["posts a reset"], coversResolved: ["src/http.ts#ResetController.post"] } }),
  sym("tests/job.test.ts#resends a link", "test", { tags: { ac: ["PWR-T9.AC1"] }, test: { titlePath: ["resends a link"], coversResolved: [] } }),
  sym("tests/r.test.ts#issues a link", "test", { tags: { ac: ["PWR-T1.AC1"] }, test: { titlePath: ["issues a link"], coversResolved: ["src/reset.ts#ResetService.request"] } }),
].map((s) => [s.id, s])) });
const LOCK = () => ({ symbols: {}, tasks: { "PWR-T1": { doneAt: "2026-11-01" } }, tests: {
  "tests/r.test.ts#issues a link": { task: "PWR-T1", ac: ["PWR-T1.AC1"], covers: ["src/reset.ts#ResetService.request"], stage: "locked" },
  "tests/http.test.ts#posts a reset": { task: "PWR-T3", ac: ["PWR-T3.AC1"], covers: ["src/http.ts#ResetController.post"], stage: "locked" } } });
const resolve = (r) => { const ids = Object.keys(INDEX().symbols).filter((id) => id.endsWith(`#${r}`)); return ids.length === 1 ? { id: ids[0] } : null; };
const TASKS = (extra = {}) => [
  { id: "PWR-T1", change: "feat-x", status: "done", acs: [{ id: "PWR-T1.AC1", reqs: ["PWR-R1.S1"] }], symbols: [], testPlan: [] },
  { id: "PWR-T4", change: "feat-x", status: "todo", amend: "PWR-A1", kind: "switch", acs: [{ id: "PWR-T4.AC1", reqs: ["PWR-R1.S1"] }], testPlan: [],
    symbols: [{ ref: "ResetService.request", change: "modify", file: "src/reset.ts" }, ...(extra.t4rows || [])] },
  { id: "PWR-T9", change: "feat-x", status: "todo", amend: extra.t9amend ?? null, acs: [], symbols: [], testPlan: [] },
];

test("callPass: 1 hop callers (index edges and @calls tags), their tests (@covers, lock covers, @ac of the caller's task), entities; deterministic", () => {
  const index = INDEX();
  const r = callPass({ index, lock: LOCK(), seeds: [{ id: "src/reset.ts#ResetService.request", via: "@dec PWR-D2" }], entities: ["Reset token", "Audit entry"] });
  assert.deepEqual(r.seeds, [{ id: "src/reset.ts#ResetService.request", name: "ResetService.request", via: ["@dec PWR-D2"] }]);
  assert.deepEqual(r.callers.map((c) => [c.name, c.hop, c.via]), [["auditReset", 1, "calls ResetService.request"], ["ResetController.post", 1, "calls ResetService.request"], ["ResetJob.resend", 1, "calls ResetService.request"]]);
  assert.deepEqual(r.tests.map((t) => [t.title, t.via, t.locked]), [["makeReset", "test-file code that calls ResetService.request", false], ["posts a reset", "covers ResetController.post", true],
    ["resends a link", "@ac PWR-T9.AC1 (a test of ResetJob.resend's task, no @covers)", false]], "a helper in a test file is listed with the tests, not as a caller");
  assert.deepEqual(r.callers.find((c) => c.name === "ResetController.post").tests, ["tests/http.test.ts#posts a reset"]);
  assert.deepEqual(r.entities, [{ name: "Reset token", symbols: ["ResetService.request"], via: "named in ResetService.request (signature, intent)" },
    { name: "Audit entry", symbols: ["auditReset"], via: "named in auditReset (intent)" }]);
  assert.equal(r.truncated, false);
  assert.match(r.limits, /not dynamic calls .*reflection.*other services.*languages the indexer does not parse/);
  assert.deepEqual(callPass({ index, lock: LOCK(), seeds: [{ id: "src/reset.ts#ResetService.request", via: "x" }] }), callPass({ index, lock: LOCK(), seeds: [{ id: "src/reset.ts#ResetService.request", via: "x" }] }));
});

test("callPass: depth is a parameter (2 hops reach routes); the limit stops the pass and says so; tests and unknown seeds are skipped", () => {
  const index = INDEX(), seeds = [{ id: "src/reset.ts#ResetService.request", via: "r" }];
  const two = callPass({ index, seeds, depth: 2 });
  assert.deepEqual(two.callers.at(-1), { id: "src/app.ts#routes", name: "routes", file: "src/app.ts", hop: 2, calls: ["src/http.ts#ResetController.post"], seed: "src/reset.ts#ResetService.request",
    via: "calls ResetController.post (2 hops from ResetService.request)", tests: [] });
  assert.equal(callPass({ index, seeds }).callers.length, 3, "default depth 1");
  const cut = callPass({ index, seeds, limit: 1 });
  assert.deepEqual([cut.callers.length, cut.truncated], [1, true]);
  assert.match(callLines(cut).join("\n"), /stopped at 1 callers: the list is incomplete/);
  assert.deepEqual(callPass({ index, seeds: [{ id: "tests/r.test.ts#issues a link", via: "x" }, { id: "nope#x", via: "y" }] }).seeds, []);
});

test("identWords / dataModelEntities: camel and snake split; entities under ## Entities only; template placeholders skipped", () => {
  assert.deepEqual(identWords("ResetToken reset_tokens HTTPServer"), ["reset", "token", "reset", "tokens", "http", "server"]);
  const md = "# Data model: X\n\n## Entities\n\n### Reset token\n\n| field | type |\n\n### `AuditEntry`\n\n### {Entity}\n\n## Persistence changes\n\n### Not an entity\n";
  assert.deepEqual(dataModelEntities(md), ["Reset token", "AuditEntry"]);
  assert.deepEqual(dataModelEntities(read("shared/templates/data-model.md")), []);
});

test("amendAffected: seeds are @dec of a changed decision, symbol refs, contract-class tested symbols and the set's modify/remove rows", () => {
  const index = INDEX(), lock = LOCK();
  const base = { tasks: TASKS(), change: "feat-x", index, lock, resolve };
  let a = amendAffected({ ...base, refs: ["PWR-D2"] });
  assert.deepEqual(a.calls.seeds.map((x) => [x.name, x.via]), [["ResetService.request", ["@dec PWR-D2"]]]);
  a = amendAffected({ ...base, refs: ["PWR-R1.S1"], impact: [{ ref: "PWR-R1.S1", class: "behaviour" }] });
  assert.deepEqual(a.calls.seeds, [], "a behaviour class reaches the tested symbol by traceability only");
  a = amendAffected({ ...base, refs: ["PWR-R1.S1"], impact: [{ ref: "PWR-R1.S1", class: "contract" }] });
  assert.deepEqual(a.calls.seeds.map((x) => [x.name, x.via]), [["ResetService.request", ["tested by PWR-T1.AC1"]]]);
  a = amendAffected({ ...base, tasks: TASKS({ t4rows: [{ ref: "ResetJob.resend", change: "remove", file: "src/job.ts" }] }), refs: [], amend: "PWR-A1" });
  assert.deepEqual(a.calls.seeds.map((x) => [x.name, x.via]), [["ResetJob.resend", ["remove row of PWR-T4"]], ["ResetService.request", ["modify row of PWR-T4"]]]);
  assert.equal(amendAffected({ ...base, refs: ["PWR-D2"], depth: 2 }).calls.callers.length, 4);
});

test("AMEND_UNCOVERED for callers: each caller is in a task of the set (Symbols row or owner) or under ## Unchanged with a reason", () => {
  const index = INDEX(), lock = LOCK();
  const affected = (tasks) => amendAffected({ refs: ["PWR-D2"], tasks, change: "feat-x", index, lock, resolve, amend: "PWR-A1" });
  const brief = { file: "amend-PWR-A1-brief.md", unchanged: [] };
  let tasks = TASKS();
  let e = checkAmendCoverage({ amend: "PWR-A1", brief, affected: affected(tasks), tasks, index, lock, change: "feat-x" }).filter((x) => x.kind === "caller");
  assert.deepEqual(e.map((x) => x.ref), ["auditReset", "ResetController.post", "ResetJob.resend"]);
  assert.match(e[1].message, /^AMEND_UNCOVERED: ResetController\.post \(a caller: calls ResetService\.request\) — no task of PWR-A1 handles it: name it in ### Symbols of a task of PWR-A1, or list it under ## Unchanged in amend-PWR-A1-brief\.md with a reason \(e\.g\. "signature-compatible"\)$/);
  // a Symbols row of the set, a task of the set that owns the caller, an Unchanged line with a reason
  tasks = TASKS({ t4rows: [{ ref: "ResetController.post", change: "modify", file: "src/http.ts" }], t9amend: "PWR-A1" });
  const unchanged = [{ id: "auditReset", reason: "signature-compatible: it only logs the call" }];
  e = checkAmendCoverage({ amend: "PWR-A1", brief: { ...brief, unchanged }, affected: affected(tasks), tasks, index, lock, change: "feat-x" });
  // ResetController.post is now a modify row of the set: it is changed too, so its own caller is reached
  assert.deepEqual(e.filter((x) => x.kind === "caller").map((x) => x.message), ["AMEND_UNCOVERED: routes (a caller: calls ResetController.post) — no task of PWR-A1 handles it: name it in ### Symbols of a task of PWR-A1, or list it under ## Unchanged in amend-PWR-A1-brief.md with a reason (e.g. \"signature-compatible\")"]);
  e = checkAmendCoverage({ amend: "PWR-A1", brief: { ...brief, unchanged: [...unchanged, { id: "routes", reason: "signature-compatible" }] }, affected: affected(tasks), tasks, index, lock, change: "feat-x" });
  assert.deepEqual(e.filter((x) => x.kind === "caller"), []);
  // the brief text: ### Reached through calls; prettier-stable via tidyMarkdown; the parser ignores it
  const md = renderAmendBriefHead({ change: "feat-x", key: "PWR", amend: "PWR-A1", refs: ["PWR-D2"], today: "2026-11-20", stands: [], affected: affected(TASKS()) });
  assert.match(md, /^### Reached through calls \(1 hop\)$/m);
  assert.match(md, /^- Changed: ResetService\.request — @dec PWR-D2, modify row of PWR-T4$/m);
  assert.match(md, /^- Caller: ResetController\.post — calls ResetService\.request; 1 test\(s\)$/m);
  assert.match(md, /^- Caller test: posts a reset — covers ResetController\.post; locked by PWR-T3$/m);
  assert.match(md, /^- Caller: auditReset — calls ResetService\.request; no test covers it$/m);
  const b = parseBrief(md, ".hitl/changes/feat-x/amend-PWR-A1-brief.md");
  assert.deepEqual([b.kind, b.amend, b.questions.length], ["amend", "PWR-A1", 0]);
  const PRETTIER = [path.join(os.homedir(), ".local/share/nvim/mason/bin/prettier")].find((p) => fs.existsSync(p));
  if (PRETTIER) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-deps-"));
    fs.writeFileSync(path.join(dir, "amend-PWR-A1-brief.md"), md);
    const r = spawnSync(PRETTIER, ["--check", "--no-config", "--ignore-path", "", "amend-PWR-A1-brief.md"], { cwd: dir, encoding: "utf8" });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  }
});

test("callPass on an indexed project: register calls UserService.createUser (graph edge from the TS indexer)", async () => {
  const root = makeProject();
  await updateIndex(root, null, { full: true });
  const index = await readIndex(root);
  const r = callPass({ index, seeds: [{ id: "src/services/userService.ts#UserService.createUser", via: "modify row of QT-T2" }] });
  assert.deepEqual(r.callers.map((c) => [c.id, c.via]), [["src/http/authController.ts#register", "calls UserService.createUser"]]);
});

// ---------------------------------------------------------------- INTENT_HISTORY

const TRUE_EN = ["Previously returned null.", "No longer sends the welcome email.", "Used to sweep expired links every hour.", "The TTL changed from 1 hour to 15 minutes.",
  "Was renamed from issue().", "Keeps the old behaviour for clients.", "As of v2.3 the link lives 15 minutes.", "It does not retry anymore.", "After this change the job is gone.",
  "Now returns 404 for an unknown email.", "Is no longer supported.", "From now on the token is hashed.", "This function was renamed.", "Formerly called issueLink."];
const TRUE_VI = ["Trước đây trả về null.", "Bây giờ trả về lỗi NotFound.", "Không còn gửi email chào mừng.", "Đổi từ 1 giờ sang 15 phút.", "Hàm đã đổi tên từ issue.",
  "Giữ hành vi cũ cho client.", "Kể từ phiên bản 2.3 link sống 15 phút.", "Giờ đây link sống 15 phút.", "Hàm này trước kia quét link.", "Từ nay token được băm."];
const FALSE_EN = ["Returns now() plus the TTL.", "Expires at now + 15 minutes.", "Rejects the old password.", "Refuses a session that is no longer active.", "The key used to sign the token.",
  "Restores the previously selected item.", "Notifies when the status changed from DRAFT to SENT.", "Accepts no more than 3 retries.", "Reads records since 2024-01-01.",
  "Returns true when the password has been changed.", "Counts orders since the last run.", "Returns the `previouslyCached` value.", "Keeps the current time as now."];
const FALSE_VI = ["Mật khẩu cũ bị từ chối.", "Trả về thời điểm bây giờ cộng TTL.", "Token không còn hiệu lực thì bị từ chối.", "Sau 24 giờ trả về lỗi.",
  "Chuyển trạng thái từ DRAFT sang SENT.", "Người dùng đã đổi mật khẩu.", "Phiên đăng nhập cũ bị đóng."];

test("INTENT_HISTORY: history phrases in English and Vietnamese are found", () => {
  for (const t of [...TRUE_EN, ...TRUE_VI]) assert.ok(historyHits(t).length, `missed: ${t}`);
  assert.deepEqual(historyHits("Trước đây trả về null.")[0], { phrase: "Trước đây", pattern: "trước đây", lang: "vi", line: 1 });
  assert.deepEqual(historyHits("Issues a link that\nchanged from 1 hour\nto 15 minutes.").map((h) => [h.phrase, h.line]), [["changed from 1 hour to", 2]], "across docstring lines");
  assert.ok(HISTORY_PATTERNS.some((p) => p.lang === "en") && HISTORY_PATTERNS.some((p) => p.lang === "vi"));
});

test("INTENT_HISTORY: domain words stay quiet (now as a timestamp, old password, no longer active, used to sign, mật khẩu cũ, …)", () => {
  for (const t of [...FALSE_EN, ...FALSE_VI]) assert.deepEqual(historyHits(t), [], `false positive: ${t}`);
});

test("INTENT_HISTORY: opt-out marker hitl: history-ok (own line = whole docstring, inline = that line), backticks ignored; steps and TODOs checked", () => {
  assert.deepEqual(historyHits("Accepts the v1 payload.\nhitl: history-ok\nPreviously the only format."), []);
  assert.deepEqual(historyHits("Previously the only format. (hitl: history-ok)\nNo longer sends mail.").map((h) => h.phrase), ["No longer sends"]);
  const s = { name: "issue", kind: "function", intent: "Issues a link.\n@task PWR-T1", todos: ["2. now also store the expiry"], flowSteps: ["1. check the email", "3. trước đây quét link"] };
  assert.deepEqual(symbolHistory(s).map((h) => [h.where, h.phrase]), [["todo", "now also"], ["step", "trước đây"]]);
  assert.deepEqual(symbolHistory({ ...s, flowSteps: ["3. trước đây quét link (hitl: history-ok)"], todos: [] }), []);
  const items = historyItems({ symbols: { "a.ts#issue": { ...s, file: "a.ts" }, "a.test.ts#t": { name: "t", kind: "test", intent: "Previously x." } } }, ["a.ts#issue", "a.test.ts#t"]);
  assert.deepEqual(items.map((i) => [i.code, i.symbol]), [["INTENT_HISTORY", "a.ts#issue"]]);
  assert.match(items[0].message, /issue todo: "now also", step: "trước đây": history wording in a docstring — state the current contract only; move the history to the spec delta Changed:\/Reason:, the superseded decision and design\.md ## Changelog, the amend brief, or the commit message \(opt out: hitl: history-ok\)/);
});

test("INTENT_HISTORY in hitl-index intents (history per symbol) and drift (warn on a draft intent, off by config); never a block", async () => {
  const root = makeProject();
  write(root, "src/repo/userRepo.ts", REPO.replace("Finds a user by email.", "Finds a user by email. Previously returned null for an unknown email."));
  await updateIndex(root, null, { full: true });
  const index = await readIndex(root);
  const rep = intentReport({ index, lock: {}, tasks: [{ id: "QT-T1", symbols: [] }], files: {} });
  const r = rep.find((x) => x.name === "UserRepo.findByEmail");
  assert.deepEqual(r.history.map((h) => [h.where, h.phrase]), [["intent", "Previously"]]);
  const d = await computeDrift(root, {});
  const it = d.items.find((i) => i.code === "INTENT_HISTORY");
  assert.equal(it.level, "warn");
  assert.match(it.message, /UserRepo\.findByEmail intent: "Previously"/);
  assert.ok(!d.items.some((i) => i.code === "INTENT_HISTORY" && i.level === "block"));
  write(root, ".hitl/hitl.config.json", JSON.stringify({ schema: "hitl.config/1", adapters: { ts: "ts-lite", py: "py-ast" }, intent: { history: "off" } }));
  assert.ok(!(await computeDrift(root, {})).items.some((i) => i.code === "INTENT_HISTORY"));
});

// ---------------------------------------------------------------- parallel change (merged / released)

const FILE = ".hitl/changes/feat-x/tasks.md";
const md = ({ transitionDeploy = true, t10deploy = "3", removes = "dual-write-expiry, ttl-hours-column", t10blocked = "PWR-T9", t7temps = true } = {}) => `# X Tasks

← Change: feat-x

> status: approved

## PWR-T7 Store the link expiry as a timestamp

- prio: P1 | risk: high (data) | impl: agent | blocked-by: none | amend: PWR-A2 | kind: expand${transitionDeploy ? " | deploy: 1" : ""} | status: todo
${t7temps ? "\n**Temp**: dual-write-expiry (data) — writes expires_at and ttl_hours both\n**Temp**: `ttl-hours-column` (data) — the old column, read until the switch\n" : ""}
### Acceptance criteria

- [ ] PWR-T7.AC1 Given a new reset When it is stored Then both forms hold the same expiry

## PWR-T8 Backfill the timestamp

- prio: P1 | risk: high (data) | impl: agent | blocked-by: PWR-T7 | amend: PWR-A2 | kind: migrate | deploy: 1 | status: todo

### Acceptance criteria

- [ ] PWR-T8.AC1 Given rows with only the old form When the backfill runs twice Then every row has the new form

## PWR-T9 Read the timestamp

- prio: P1 | risk: high | impl: agent | blocked-by: PWR-T8 | amend: PWR-A2 | kind: switch | deploy: 2 | status: todo

### Acceptance criteria

- [ ] PWR-T9.AC1 (PWR-R1.S1) Given a link older than 15 minutes When it is used Then it is refused

## PWR-T10 Drop the hour-based expiry

- prio: P2 | risk: high (data) | impl: agent | blocked-by: ${t10blocked} | amend: PWR-A2 | kind: contract${t10deploy ? ` | deploy: ${t10deploy}` : ""} | status: todo

**Removes**: ${removes}

### Acceptance criteria

- [ ] PWR-T10.AC1 Given the schema after this deploy Then the old column does not exist
`;
const tasksOf = (o) => parseTasksMd(md(o), FILE).tasks.map((t) => ({ ...t, change: "feat-x" }));
const all = (o, tr) => [...checkAmendOrder(tasksOf(o), { "PWR-A2": tr }), ...checkAmendTemp(tasksOf(o), { "PWR-A2": tr })].map((e) => e.message);

test("parser: deploy: meta, **Temp**: lines (name, type, what; backticks), **Removes**: list; malformed Temp → parse error; TASK_KIND_BAD rules", () => {
  const t = Object.fromEntries(tasksOf().map((x) => [x.id, x]));
  assert.deepEqual([t["PWR-T7"].deploy, t["PWR-T9"].deploy, t["PWR-T10"].deploy, t["PWR-T10"].status], [1, 2, 3, "todo"]);
  assert.deepEqual(t["PWR-T7"].temps, [{ name: "dual-write-expiry", type: "data", what: "writes expires_at and ttl_hours both" }, { name: "ttl-hours-column", type: "data", what: "the old column, read until the switch" }]);
  assert.deepEqual(t["PWR-T10"].removes, ["dual-write-expiry", "ttl-hours-column"]);
  for (const x of Object.values(t)) assert.deepEqual(x.parseErrors, [], x.id);
  const bad = parseTasksMd("# T\n\n## PWR-T1 A\n\n- prio: P1 | risk: low | impl: agent | blocked-by: none | status: todo\n\n**Temp**: a flag without a type\n", FILE).tasks[0];
  assert.match(bad.parseErrors.join(), /malformed Temp line/);
  assert.match(checkTaskChanges({ ...t["PWR-T9"], amend: null, kind: null }, {}).join(), /TASK_KIND_BAD: PWR-T9 deploy: 2 needs amend: and kind:/);
  assert.match(checkTaskChanges({ ...t["PWR-T9"], removes: ["x"] }, {}).join(), /TASK_KIND_BAD: PWR-T9 \*\*Removes\*\*: is for a contract task/);
  assert.match(checkTaskChanges({ ...t["PWR-T7"], amend: null, kind: null, deploy: null }, {}).join(), /TASK_KIND_BAD: PWR-T7 \*\*Temp\*\*: needs amend:/);
  // a formatter that indents the Temp lines under the meta list item still parses
  const indented = parseTasksMd(md().replace("\n**Temp**: dual", "  **Temp**: dual"), FILE).tasks[0];
  assert.equal(indented.temps.length, 2);
});

test("released: a full expand → migrate → switch → contract set with temp items and deploy groups passes", () => {
  assert.deepEqual(all({}, "released"), []);
  assert.deepEqual(all({}, "merged"), []);
});

test("AMEND_TEMP_NO_REMOVAL: an expand without temp items, a temp item no contract removes, a Removes name nobody declares", () => {
  assert.match(all({ t7temps: false, removes: "dual-write-expiry" }, "released").join("\n"), /AMEND_TEMP_NO_REMOVAL: PWR-T7 \(expand\) names no temporary item/);
  const e = all({ removes: "dual-write-expiry" }, "merged");
  assert.deepEqual(e, ["AMEND_TEMP_NO_REMOVAL: temporary item ttl-hours-column (data) of PWR-T7 has no contract task in PWR-A2 that removes it: add a contract task with \"**Removes**: ttl-hours-column\" (or a remove row), blocked by PWR-T7"]);
  assert.match(all({ removes: "dual-write-expiry, ttl-hours-column, flag-x" }, "released").join("\n"), /AMEND_TEMP_NO_REMOVAL: PWR-T10 removes flag-x, which no task of PWR-A2 declares/);
  // a remove row of the same symbol counts as the removal
  const ts = tasksOf({ removes: "dual-write-expiry" }).map((t) => (t.id === "PWR-T10" ? { ...t, symbols: [{ ref: "ttl-hours-column", change: "remove", file: "src/db.ts" }] } : t));
  assert.deepEqual(checkAmendTemp(ts, { "PWR-A2": "merged" }), []);
});

test("AMEND_CONTRACT_SAME_DEPLOY: the drop of data ships in a later deploy; released needs the deploy group; merged does not", () => {
  assert.deepEqual(all({ t10deploy: "1" }, "released").filter((m) => /SAME_DEPLOY/.test(m)).length, 2);
  assert.match(all({ t10deploy: "1" }, "merged").join("\n"), /AMEND_CONTRACT_SAME_DEPLOY: PWR-T10 \(deploy: 1\) removes dual-write-expiry \(data\) that PWR-T7 adds in deploy 1: the drop ships in a later deploy \(deploy: 2 or later\)/);
  assert.match(all({ t10deploy: "" }, "released").join("\n"), /AMEND_CONTRACT_SAME_DEPLOY: PWR-T10 removes dual-write-expiry \(data\) of released behaviour \(PWR-A2\): name its deploy group/);
  assert.deepEqual(all({ t10deploy: "" }, "merged"), [], "merged: no deploy group needed");
  // a flag or a shim needs no deploy boundary
  const flag = tasksOf({ t10deploy: "1" }).map((t) => ({ ...t, temps: (t.temps || []).map((x) => ({ ...x, type: "flag" })) }));
  assert.deepEqual(checkAmendTemp(flag, { "PWR-A2": "released" }), []);
});

test("AMEND_ORDER 0.18: a contract of merged/released behaviour never has blocked-by: none; deploy groups follow blocked-by", () => {
  const solo = parseTasksMd("# T\n\n← Change: feat-x\n\n## PWR-T10 Drop v1\n\n- prio: P2 | risk: low | impl: agent | blocked-by: none | amend: PWR-A2 | kind: contract | status: todo\n", FILE).tasks;
  assert.match(checkAmendOrder(solo, { "PWR-A2": "released" })[0].message, /AMEND_ORDER: PWR-T10 \(contract\) has blocked-by: none; the old behaviour of PWR-A2 is released/);
  assert.deepEqual(checkAmendOrder(solo, { "PWR-A2": "branch" }), [], "in-branch: a lone contract is fine");
  assert.match(all({ t10deploy: "3" }, "released").join() + all({ t10blocked: "PWR-T9" }, "released").join(), /^$/);
  const back = tasksOf().map((t) => (t.id === "PWR-T9" ? { ...t, deploy: 1 } : t.id === "PWR-T8" ? { ...t, deploy: 2 } : t));
  assert.match(checkAmendOrder(back, { "PWR-A2": "released" }).map((e) => e.message).join("\n"), /AMEND_ORDER: PWR-T9 \(deploy: 1\) is blocked by PWR-T8 \(deploy: 2\)/);
});

test("in-branch amendments are unaffected: prep → switch → contract, no temp rule, no deploy rule", () => {
  const branch = parseTasksMd(`# T

← Change: feat-x

## PWR-T4 Switch

- prio: P1 | risk: low | impl: agent | blocked-by: none | amend: PWR-A1 | kind: switch | status: todo

## PWR-T5 Contract

- prio: P2 | risk: low | impl: agent | blocked-by: PWR-T4 | amend: PWR-A1 | kind: contract | status: todo

**Removes**: anything
`, FILE).tasks;
  assert.deepEqual([...checkAmendOrder(branch, { "PWR-A1": "branch" }), ...checkAmendTemp(branch, { "PWR-A1": "branch" })], []);
  assert.deepEqual(checkAmendTemp(tasksOf({ t7temps: false, t10deploy: "1" }), { "PWR-A2": null }), [], "no transition answer yet: no temp rule");
});

// ---------------------------------------------------------------- docs and version

test("docs: parallel-change patterns, amend brief questions, task-changes and amend-spec rules, tag-grammar markers, README 0.18 note, version", () => {
  const pc = read("shared/formats/parallel-change.md");
  for (const w of ["### 2.1 Schema or stored-data change", "### 2.2 API or contract change", "### 2.3 Behaviour behind a feature flag", "### 2.4 Event or message format change",
    "copy of real-shaped data", "the old path is gone", "**Temp**: <name> (<type>) — <what>", "**Removes**:", "deploy: <n>", "AMEND_TEMP_NO_REMOVAL", "AMEND_CONTRACT_SAME_DEPLOY", "Who depends on the old form?"])
    assert.ok(pc.includes(w), `parallel-change.md: ${w}`);
  const tpl = read("shared/templates/amend-brief.md");
  for (const w of ["### Reached through calls (1 hop)", "Who depends on the old form?", "deprecation window", "feature flag"]) assert.ok(tpl.includes(w), `amend-brief template: ${w}`);
  const tc = read("shared/task-changes.md");
  for (const w of ["AMEND_TEMP_NO_REMOVAL", "AMEND_CONTRACT_SAME_DEPLOY", "parallel-change.md", "**Temp**:", "deploy: <n>", "signature-compatible"]) assert.ok(tc.includes(w), `task-changes.md: ${w}`);
  const am = read("shared/amend-spec.md");
  for (const w of ["### Reached through calls", "--depth n", "who depends on the old form", "deprecation window", "INTENT_HISTORY", "reflection"]) assert.ok(am.includes(w), `amend-spec.md: ${w}`);
  const tg = read("shared/tag-grammar.md");
  for (const w of ["INTENT_HISTORY", "hitl: history-ok", "**Temp**:"]) assert.ok(tg.includes(w), `tag-grammar.md: ${w}`);
  assert.match(read("skills/review/SKILL.md"), /The `history` gate/);
  assert.match(read("skills/tasks/SKILL.md"), /parallel-change\.md/);
  const readme = read("README.md");
  const note = readme.slice(readme.indexOf("### Nâng cấp từ 0.17.0"), readme.indexOf("### Nâng cấp từ 0.16.0"));
  for (const w of ["Reached through calls", "INTENT_HISTORY", "hitl: history-ok", "**Temp**:", "deploy:", "AMEND_TEMP_NO_REMOVAL", "AMEND_CONTRACT_SAME_DEPLOY"]) assert.ok(note.includes(w), `README 0.18 note: ${w}`);
  assert.match(read("HUONG-DAN.md"), /INTENT_HISTORY/);
  assert.match(JSON.parse(read(".claude-plugin/plugin.json")).version, /^0\.(1[8-9]|[2-9]\d)\.\d+$/, "version ≥ 0.18.0");
});
