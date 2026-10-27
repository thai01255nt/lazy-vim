// `hitl-index change [<change-id>] [--json]` — active and archived changes with their computed phase (design v3 §6.4).
import { parseArgv } from "../lib/project.mjs";
import { changeInfo, listChanges, readChange } from "../lib/changes.mjs";

export async function run(argv, ctx) {
  const a = parseArgv(argv, {});
  if (a._.length > 1) throw Object.assign(new Error("usage: hitl-index change [<change-id>] [--json]"), { usage: true });
  if (!ctx.root) { console.error("hitl: not initialized here — run /hitl:setup (hitl-index init)"); return 3; }
  const want = a._[0] || null;
  let entries = await listChanges(ctx.root);
  if (want) {
    entries = entries.filter((e) => e.id === want || e.dir.endsWith(`/${want}`));
    if (!entries.length) { console.error(`change ${want} not found`); return 1; }
  }
  const changes = [];
  for (const e of entries) changes.push(await changeInfo(ctx.root, ctx.config, await readChange(ctx.root, e)));
  const out = { schema: "hitl.change/1", changes };
  if (ctx.json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  if (!changes.length) { console.log("no changes yet (.hitl/changes/) — start one with /hitl:plan"); return 0; }
  console.log("| change | phase | proposal | design | tasks | next |\n|---|---|---|---|---|---|");
  for (const c of changes) {
    const tc = c.taskCounts.total ? ` ${c.taskCounts.done}/${c.taskCounts.total}` : "";
    console.log(`| ${c.id}${c.archived ? ` (${c.dir.split("/").pop()})` : ""} | ${c.phase} | ${c.proposal} | ${c.design} | ${c.tasks}${tc} | ${c.next ?? "—"} |`);
  }
  return 0;
}
