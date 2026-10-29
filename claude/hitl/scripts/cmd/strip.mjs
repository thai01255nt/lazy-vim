// `hitl-index strip <T-id|change-id> [--dry-run] [--json]`: remove @task @impl @status @prio @dec @risk from the docs of
// done tasks (code only, never tests). Lock, drift and statuses are unchanged; verified by reindex, rolled back otherwise.
import { parseArgs } from "node:util";
import { strip } from "../lib/strip.mjs";

const OPTS = { "dry-run": { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json; const target = positionals[0];
  if (!target) { console.error("usage: hitl-index strip <T-id|change-id> [--dry-run] [--json]"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const r = await strip(ctx.root, { target, dryRun: !!v["dry-run"], config: ctx.config });
  if (json) { console.log(JSON.stringify({ ...r, dryRun: !!v["dry-run"] }, null, 2)); return r.ok ? 0 : 1; }
  if (!r.ok) { console.log(`🛑 strip ${target}: ${r.error}`); return 1; }
  const name = (id) => id.split("#").at(-1);
  console.log(`✂️ strip ${target}${v["dry-run"] ? " (dry run)" : ""}: ${r.symbols.length} symbol(s) in ${r.files.length} file(s) · tasks ${r.tasks.join(", ")}`);
  for (const s of r.symbols) console.log(`  ${s.file}  ${name(s.id)}  (-@${s.removed.join(" -@")})`);
  for (const s of r.skipped) console.log(`  ⏭ ${name(s.id)}: ${s.reason}`);
  if (r.notDone.length) console.log(`  ⏭ not done: ${r.notDone.map((t) => `${t.id} (${t.status})`).join(", ")}`);
  if (r.verified) console.log("✅ verified: signatures, intents, bodies and task statuses unchanged · lock untouched");
  return 0;
}
