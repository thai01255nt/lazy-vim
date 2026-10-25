// `hitl-index index [files…] [--all] [--json]` (§E.1, output hitl.indexResult/1).
import { parseArgv, toRel } from "../lib/project.mjs";
import { updateIndex } from "../lib/indexer.mjs";
import { resolve } from "node:path";

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["all", "changed"] });
  const files = a._.map((f) => toRel(ctx.root, resolve(process.cwd(), f)));
  const res = await updateIndex(ctx.root, files.length && !a.all ? files : null, { full: !!a.all, changedOnly: !files.length && !a.all });
  if (ctx.json) console.log(JSON.stringify(res, null, 2));
  else if (!ctx.quiet) {
    console.log(`indexed ${res.changedFiles.length} changed file(s): +${res.added.length} −${res.removed.length} ~${res.modified.length} symbols`);
    const s = res.drift.summary;
    console.log(`drift: ${s.block} block · ${s.warn} warn · ${s.info} info`);
    for (const i of res.drift.items.filter((x) => x.level !== "info")) console.log(`${i.level === "block" ? "⛔" : "⚠️"} ${i.code} ${i.symbol || i.file} — ${i.message}`);
  }
  return 0;
}
