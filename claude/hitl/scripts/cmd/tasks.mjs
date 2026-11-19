// `hitl-index tasks [--check] [--json]` (§E.4).
// `hitl-index tasks drop <task-id> --reason "<why>" [--amend <KEY>-A<n>] [--json]` (0.17, shared/task-changes.md): a
// todo task (no locked work) that an update or an amendment no longer needs gets `status: dropped` and a
// `**Dropped**: <reason>` line. Its id is never reused. Only this command writes `dropped`.
import { join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { readTasks, checkTasks, hasLockedTaskWork, DROPPED, AMEND_ID_RE } from "../lib/tasksmd.mjs";
import { readIndex } from "../lib/indexer.mjs";
import { HITL_PREFIX } from "../lib/paths.mjs";
import { readJson, readText, writeTextAtomic } from "../lib/fsutil.mjs";
import { paths } from "../lib/project.mjs";

export async function run(argv, ctx) {
  if (argv[0] === "drop") return drop(argv.slice(1), ctx);
  const a = parseArgv(argv, { flags: ["check"] });
  const tasks = await readTasks(ctx.root);
  const errors = [];
  if (a.check) {
    const index = await readIndex(ctx.root);
    errors.push(...await checkTasks(ctx.root, tasks, index));
    // 0.17: AMEND_ORDER and AMEND_UNCOVERED of the amend task sets of active changes
    const { amendTaskErrors } = await import("../lib/amend.mjs");
    errors.push(...await amendTaskErrors(ctx.root, ctx.config, tasks).catch((e) => [{ task: null, file: null, message: `amend checks failed: ${e.message}` }]));
  }
  if (ctx.json) console.log(JSON.stringify({ tasks, errors }, null, 2));
  else if (!ctx.quiet) {
    if (!tasks.length) console.log(`no tasks (${HITL_PREFIX}changes/*/tasks.md, ${HITL_PREFIX}tasks/*.md)`);
    else {
      console.log("| id | title | prio | risk | impl | blocked-by | status |\n|---|---|---|---|---|---|---|");
      for (const t of tasks) console.log(`| ${t.id} | ${t.title} | ${t.prio ?? "?"} | ${t.risk ?? "?"}${t.riskReasons.length ? ` (${t.riskReasons.join(", ")})` : ""} | ${t.impl ?? "?"} | ${t.blockedBy.join(", ") || "none"} | ${t.status ?? "?"}${t.amend ? ` (${t.amend}${t.kind ? ` ${t.kind}` : ""})` : ""} |`);
    }
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
