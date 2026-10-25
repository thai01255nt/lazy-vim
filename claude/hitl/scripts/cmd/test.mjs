// P2 — `hitl-index test [--task T|--symbol ref|--files f…] [--junit file --record-only] [--json]`
// Exit 0 even with failing tests (the result is data); exit 1 only if the command could not run.
import { parseArgs } from "node:util";
import { executeTest } from "../lib/runner.mjs";

const OPTS = { task: { type: "string" }, symbol: { type: "string" }, files: { type: "string", multiple: true }, junit: { type: "string" },
  "record-only": { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  // `--files a b c`: parseArgs takes one value per flag; remaining positionals are extra files
  const files = v.files ? [...v.files, ...positionals] : null;
  if (v["record-only"] && !v.junit) { console.error("--record-only requires --junit <file>"); return 2; }
  const r = await executeTest(ctx.root, ctx.config, { task: v.task, symbol: v.symbol, files, junit: v.junit });
  if (r.error) { if (json) console.log(JSON.stringify({ error: r.error })); else console.error(`❌ ${r.error}`); return 1; }
  const out = { runs: r.runs, perSymbol: r.perSymbol, unmatched: r.unmatched, errors: r.errors, commands: r.commands.map(({ lang, cmd, code }) => ({ lang, cmd, code })) };
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    const name = (id) => r.index.symbols[id]?.name || id;
    console.log("| symbol | status | pass | fail | skip | stale |\n|---|---|---|---|---|---|");
    for (const [id, c] of Object.entries(r.perSymbol)) console.log(`| ${name(id)} | ${c.status} | ${c.pass} | ${c.fail} | ${c.skip} | ${c.stale} |`);
    console.log("");
    for (const x of r.runs) console.log(`${x.outcome === "pass" ? "✅" : x.outcome === "skip" ? "⏭️" : "❌"} ${x.outcome.padEnd(5)} ${name(x.testId)}${x.outcome !== "pass" && x.message ? " — " + x.message : ""}`);
    if (r.unmatched.length) console.log(`⚠️ ${r.unmatched.length} JUnit case(s) not matched to indexed tests: ${r.unmatched.slice(0, 5).map((u) => u.name).join("; ")}`);
    for (const e of r.errors) console.log(`❌ ${e}`);
    if (!r.runs.length && !r.errors.length) console.log("no tests selected");
  }
  return r.fatal ? 1 : 0;
}
