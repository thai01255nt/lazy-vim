// `hitl-index tasks [--check] [--json]` (§E.4).
import { parseArgv } from "../lib/project.mjs";
import { readTasks, checkTasks } from "../lib/tasksmd.mjs";
import { readIndex } from "../lib/indexer.mjs";
import { HITL_PREFIX } from "../lib/paths.mjs";

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["check"] });
  const tasks = await readTasks(ctx.root);
  const errors = a.check ? await checkTasks(ctx.root, tasks, await readIndex(ctx.root)) : [];
  if (ctx.json) console.log(JSON.stringify({ tasks, errors }, null, 2));
  else if (!ctx.quiet) {
    if (!tasks.length) console.log(`no tasks (${HITL_PREFIX}tasks/*.md)`);
    else {
      console.log("| id | title | prio | risk | impl | blocked-by | status |\n|---|---|---|---|---|---|---|");
      for (const t of tasks) console.log(`| ${t.id} | ${t.title} | ${t.prio ?? "?"} | ${t.risk ?? "?"}${t.riskReasons.length ? ` (${t.riskReasons.join(", ")})` : ""} | ${t.impl ?? "?"} | ${t.blockedBy.join(", ") || "none"} | ${t.status ?? "?"} |`);
    }
    if (a.check) console.log(errors.length ? errors.map((e) => `❌ ${e.task ?? ""} ${e.message} (${e.file ?? ""})`).join("\n") : "✅ tasks check passed");
  }
  return errors.length ? 1 : 0;
}
