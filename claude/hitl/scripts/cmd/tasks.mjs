// `hitl-index tasks [--check] [--json]` (§E.4). 0.21: `--check` also lists info TEST_OVERRIDE_UNRECORDED (a `!` row
// without an override answered Y in a tasks brief).
// 0.21 tasks brief (lib/tasksbrief.mjs); <target> = a change id, a quick key or a quick file name:
//   tasks gate <target> [--md] [--write] [--json]  the generated `## Tasks (N) — in build order` table (0.21.2, one
//       row per task); --write replaces it (or a 0.21.1 list) in the brief, sets `set:` and writes the round snapshot
//   tasks diff <target> [--json]       `_Changed since Round n:_` lines: tasks.md against the round snapshot
//   tasks approve <target> [--json]    sets `> status: approved` (only this command does): the brief's `Approve?`
//       has its own Y and the set equals the snapshot of the round (an approved set: prio, risk and blocked-by
//       excepted); tasks --check has no error
//   tasks baseline <target> [--json]   records the approved set (an update starts from it; an amend Close re-approves)
// `hitl-index tasks drop <task-id> --reason "<why>" [--amend <KEY>-A<n>] [--json]` (0.17, shared/task-changes.md): a
// todo task (no locked work) that an update or an amendment no longer needs gets `status: dropped` and a
// `**Dropped**: <reason>` line. Its id is never reused. Only this command writes `dropped`.
import { join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { readTasks, checkTasks, taskWarnings, hasLockedTaskWork, DROPPED, AMEND_ID_RE } from "../lib/tasksmd.mjs";
import { readIndex } from "../lib/indexer.mjs";
import { HITL_PREFIX } from "../lib/paths.mjs";
import { readJson, readText, writeTextAtomic } from "../lib/fsutil.mjs";
import { paths } from "../lib/project.mjs";

export async function run(argv, ctx) {
  if (argv[0] === "drop") return drop(argv.slice(1), ctx);
  if (["gate", "diff", "approve", "baseline"].includes(argv[0])) return brief(argv[0], argv.slice(1), ctx);
  const a = parseArgv(argv, { flags: ["check"] });
  const tasks = await readTasks(ctx.root);
  const errors = [];
  const warnings = a.check ? taskWarnings(tasks) : [];
  const info = [];
  if (a.check) {
    const index = await readIndex(ctx.root);
    errors.push(...await checkTasks(ctx.root, tasks, index));
    // 0.17: AMEND_ORDER and AMEND_UNCOVERED of the amend task sets of active changes
    const { amendTaskErrors } = await import("../lib/amend.mjs");
    errors.push(...await amendTaskErrors(ctx.root, ctx.config, tasks).catch((e) => [{ task: null, file: null, message: `amend checks failed: ${e.message}` }]));
    info.push(...await unrecordedOverrides(ctx.root, tasks).catch(() => []));
  }
  if (ctx.json) console.log(JSON.stringify({ tasks, errors, ...(a.check ? { warnings, info } : {}) }, null, 2));
  else if (!ctx.quiet) {
    if (!tasks.length) console.log(`no tasks (${HITL_PREFIX}changes/*/tasks.md, ${HITL_PREFIX}tasks/*.md)`);
    else {
      console.log("| id | title | prio | risk | impl | blocked-by | status |\n|---|---|---|---|---|---|---|");
      for (const t of tasks) console.log(`| ${t.id} | ${t.title} | ${t.prio ?? "?"} | ${t.risk ?? "?"}${t.riskReasons.length ? ` (${t.riskReasons.join(", ")})` : ""} | ${t.impl ?? "?"} | ${t.blockedBy.join(", ") || "none"} | ${t.status ?? "?"}${t.amend ? ` (${t.amend}${t.kind ? ` ${t.kind}` : ""})` : ""} |`);
    }
    if (a.check) for (const w of warnings) console.log(`⚠️ ${w.task ?? ""} ${w.message} (${w.file ?? ""})`);
    if (a.check) for (const w of info) console.log(`_Info:_ ${w.task ?? ""} ${w.message} (${w.file ?? ""})`);
    if (a.check) console.log(errors.length ? errors.map((e) => `❌ ${e.task ?? ""} ${e.message} (${e.file ?? ""})`).join("\n") : "✅ tasks check passed");
  }
  return errors.length ? 1 : 0;
}

async function drop(argv, ctx) {
  const a = parseArgv(argv, { flags: ["json"], values: ["reason", "amend"] });
  const json = ctx.json || a.json;
  const T = a._[0];
  const fail = (msg) => { if (json) console.log(JSON.stringify({ ok: false, task: T ?? null, message: msg })); else console.log(`❌ ${msg}`); return 1; };
  if (a._.length !== 1) throw Object.assign(new Error("usage: hitl-index tasks drop <task-id> --reason \"<why>\" [--amend <KEY>-A<n>]"), { usage: true });
  const reason = String(a.reason ?? "").replace(/\s+/g, " ").trim();
  if (!reason) throw Object.assign(new Error("tasks drop needs --reason \"<why>\""), { usage: true });
  if (a.amend !== undefined && !AMEND_ID_RE.test(String(a.amend))) throw Object.assign(new Error(`--amend takes <KEY>-A<n>, got ${a.amend}`), { usage: true });
  const t = (await readTasks(ctx.root)).find((x) => x.id === T);
  if (!t) return fail(`${T} is not in a tasks file`);
  if (t.archived) return fail(`${T} is archived: archived tasks never change`);
  if (t.status === DROPPED) return fail(`${T} is dropped already`);
  const lock = await readJson(paths(ctx.root).lock, null);
  if (hasLockedTaskWork(lock, T)) return fail(`${T} has locked work (skeleton, tests or a done record): only a todo task is dropped; a started task is reopened in place, a done task is taken over by a new task (shared/task-changes.md)`);
  const index = await readIndex(ctx.root).catch(() => null);
  const tagged = Object.values(index?.symbols || {}).filter((s) => (s.tags?.task || []).includes(T)).map((s) => s.name);
  if (tagged.length) return fail(`${T} has code tagged @task ${T} (${tagged.slice(0, 3).join(", ")}): remove those stubs or move them to another task first`);
  const abs = join(ctx.root, t.file);
  const text = await readText(abs, null);
  if (text === null) return fail(`${t.file} not readable`);
  const lines = text.split("\n");
  const head = lines.findIndex((l) => l.replace(/\s+$/, "") === `## ${T} ${t.title}` || l.startsWith(`## ${T} `));
  let meta = -1;
  for (let i = head + 1; i < lines.length && !/^## /.test(lines[i]); i++) if (/^- prio: P[0-3] \|/.test(lines[i])) { meta = i; break; }
  if (head < 0 || meta < 0) return fail(`${T}: heading or meta line not found in ${t.file}`);
  lines[meta] = lines[meta].replace(/\| status: [a-z-]+\s*$/, `| status: ${DROPPED}`);
  const why = `**Dropped**: ${reason}${a.amend ? ` (${a.amend})` : ""}`;
  lines.splice(meta + 1, 0, "", why, ...(lines[meta + 1]?.trim() ? [""] : []));
  await writeTextAtomic(abs, lines.join("\n"));
  const out = { ok: true, task: T, file: t.file, status: DROPPED, reason, amend: a.amend ?? null };
  if (json) console.log(JSON.stringify(out)); else console.log(`✅ ${T} (${t.title}) dropped: ${reason}`);
  return 0;
}

/** 0.21 info: `none!`/`manual!` rows in effect without an override answered Y in a tasks brief. */
async function unrecordedOverrides(root, tasks) {
  const { testOverrides } = await import("../lib/testplan.mjs");
  const { overrideRecords, OVERRIDE_UNRECORDED } = await import("../lib/tasksbrief.mjs");
  const live = tasks.filter((t) => !t.archived && t.status !== DROPPED && testOverrides(t).length);
  if (!live.length) return [];
  const rec = await overrideRecords(root);
  const out = [];
  for (const t of live) for (const r of testOverrides(t)) {
    const ac = /^AC\d+$/.test(r.ac) ? `${t.id}.${r.ac}` : r.ac;
    if (!rec.has(ac)) out.push({ task: t.id, file: t.file ?? null, code: OVERRIDE_UNRECORDED, message: `${OVERRIDE_UNRECORDED}: ${ac} "${r.test}!:" has no "Override: ${ac} …" answered Y in a tasks brief (no brief record)` });
  }
  return out;
}

/** `tasks gate|diff|approve|baseline <change-id|QKEY|quick-<slug>>` (0.21). */
async function brief(sub, argv, ctx) {
  const a = parseArgv(argv, { flags: ["json", "md", "write"] });
  const json = ctx.json || a.json;
  if (a._.length !== 1) throw Object.assign(new Error(`usage: hitl-index tasks ${sub} <change-id|QKEY|quick-<slug>>${sub === "gate" ? " [--md] [--write]" : ""} [--json]`), { usage: true });
  const TB = await import("../lib/tasksbrief.mjs");
  const target = await TB.resolveTasksTarget(ctx.root, a._[0]);
  const fail = (code, message, extra = {}) => {
    if (json) console.log(JSON.stringify({ ok: false, target: target?.id ?? a._[0], code, message, ...extra }));
    else { console.log(`❌ ${code} ${message}`); for (const l of extra.diff || []) console.log(`  ${l}`); }
    return 1;
  };
  if (!target) return fail("TASKS_TARGET_UNKNOWN", `${a._[0]} is not an active change, a quick key or a quick file`);
  const cur = await TB.readTarget(ctx.root, target);
  if (!cur) return fail("TASKS_FILE_MISSING", `${target.tasksFile} not found`);
  if (sub === "gate") {
    const lock = await readJson(paths(ctx.root).lock, null);
    const view = TB.renderList(target, cur.doc, { isDone: (T) => !!lock?.tasks?.[T]?.doneAt });
    const set = TB.setOf(cur.text, cur.doc).set;
    let snap = null;
    if (a.write) {
      const b = await TB.readTasksBrief(ctx.root, target);
      if (!b) return fail("TASKS_BRIEF_MISSING", `no ${target.briefFile}: write it from shared/templates/tasks-brief.md first`);
      const text = await readText(join(ctx.root, target.briefFile), "");
      await writeTextAtomic(join(ctx.root, target.briefFile), TB.putTasksList(text, view, set));
      snap = await TB.writeSnapshot(ctx.root, target, b.round, { text: cur.text });
    }
    if (json) console.log(JSON.stringify({ ok: true, target: target.id, file: target.tasksFile, brief: target.briefFile, set, markdown: view, ...(snap ? { snapshot: target.snapFile, round: snap.round } : {}) }, null, 2));
    else if (a.md || !a.write) console.log(view);
    else console.log(`✅ ${target.briefFile}: task list (set ${set}) and snapshot of round ${snap.round} written`);
    return 0;
  }
  if (sub === "diff") {
    const snap = await TB.readSnapshot(ctx.root, target);
    const now = TB.setOf(cur.text, cur.doc);
    const lines = snap ? TB.diffSets(snap.tasks, now.tasks) : [];
    if (json) console.log(JSON.stringify({ ok: true, target: target.id, file: target.tasksFile, snapshot: snap ? { round: snap.round, set: snap.set, at: snap.at } : null, set: now.set, changed: !snap || lines.length > 0, lines }, null, 2));
    else if (!snap) console.log(`no snapshot (${target.snapFile}): every task counts as changed`);
    else console.log(lines.length ? `_Changed since Round ${snap.round}:_ ${lines.join(" · ")}` : `no change since Round ${snap.round}`);
    return 0;
  }
  if (sub === "baseline") {
    const r = await TB.baselineSet(ctx.root, target);
    if (!r.ok) return fail(r.code, r.message);
    if (json) console.log(JSON.stringify(r)); else console.log(`✅ ${target.tasksFile}: approved set ${r.set} recorded`);
    return 0;
  }
  // approve
  const all = await readTasks(ctx.root);
  const checkErrors = await checkTasks(ctx.root, all, await readIndex(ctx.root));
  const r = await TB.approveSet(ctx.root, target, { checkErrors });
  if (!r.ok) return fail(r.code, r.message, r.diff ? { diff: r.diff } : {});
  if (json) console.log(JSON.stringify(r)); else console.log(`✅ ${target.tasksFile} approved (${target.briefFile} ${r.question}, set ${r.set})`);
  return 0;
}
