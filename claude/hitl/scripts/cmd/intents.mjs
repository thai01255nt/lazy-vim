// `hitl-index intents <change-id|T-id> [--json]`: read-only intent hygiene report (lib/intents.mjs). Writes nothing
// (no reindex: run `hitl-index index` first when the code changed). Exit 0 with or without findings; 1 unknown target.
import { parseArgs } from "node:util";
import { intents } from "../lib/intents.mjs";

const OPTS = { json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json; const target = positionals[0];
  if (!target) { console.error("usage: hitl-index intents <change-id|T-id> [--json]"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const r = await intents(ctx.root, { target, config: ctx.config });
  if (json) { console.log(JSON.stringify(r, null, 2)); return r.ok ? 0 : 1; }
  if (!r.ok) { console.log(`🛑 intents ${target}: ${r.error}`); return 1; }
  if (!r.symbols.length) { console.log(`✅ intents tidy: ${target} (${r.scanned} symbol(s), tasks ${r.tasks.join(", ")})`); return 0; }
  const s = r.summary;
  console.log(`🧹 intents ${target}: ${s.symbols} of ${r.scanned} symbol(s) · ids ${s.ids} · restates ${s.restates} · steps ${s.steps} (overlap ≥ ${r.overlap})`);
  for (const x of r.symbols) {
    const g = x.growth;
    const lines = g.linesFirst == null ? `${g.linesNow} lines` : `lines ${g.linesFirst} → ${g.linesNow}`;
    console.log(`\n${x.name} — ${x.file}:${x.line ?? "?"} · ${g.tasks} task(s)${g.taskIds.length ? ` (${g.taskIds.join(", ")})` : ""} · ${lines}${x.intentChanged ? " · intent edited since approval" : ""}`);
    if (x.ids.length) console.log(`  ids: ${x.ids.join(", ")}`);
    for (const m of x.restates) {
      console.log(`  RESTATES ${m.collaboratorName} (${m.overlap}${m.term ? `, ${m.term}` : ""})`);
      console.log(`    this: ${m.sentence}`);
      console.log(`    it:   ${m.collaboratorSentence}`);
    }
    for (const st of x.steps) console.log(`  step L${st.line}: ${st.text} — ${st.why}`);
  }
  return 0;
}
