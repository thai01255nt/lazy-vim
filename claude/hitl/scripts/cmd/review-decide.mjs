// P2 — `hitl-index review-decide <T> <F-n> accept|reject|defer [--note text]`
import { parseArgs } from "node:util";
import { join } from "node:path";
import { p2paths, readJsonFile, writeJsonSorted, nowIso } from "../lib/lock.mjs";
import { assignFNumbers } from "../lib/report.mjs";
import { generateReport } from "./report.mjs";

const OPTS = { note: { type: "string" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const [T, F, decision] = positionals;
  if (!T || !/^F-\d+$/.test(F || "") || !["accept", "reject", "defer"].includes(decision)) {
    console.error("usage: hitl-index review-decide <T-id> <F-n> accept|reject|defer [--note text]"); return 2;
  }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const dir = join(p2paths(ctx.root).reviews, T);
  const findings = await readJsonFile(join(dir, "findings.json"), { findings: [] });
  const thr = ctx.config?.review?.confidenceThreshold ?? 80;
  const d = assignFNumbers(findings.findings || [], await readJsonFile(join(dir, "decisions.json"), null), thr);
  const key = Object.entries(d.keys).find(([, f]) => f === F)?.[0] || d.items[F]?.key;
  if (!key) { console.error(`${F} not found for ${T} (run hitl-index report ${T} first)`); return 1; }
  d.items[F] = { key, decision, note: v.note || "", at: nowIso() };
  await writeJsonSorted(join(dir, "decisions.json"), d);
  const r = await generateReport(ctx.root, ctx.config, T);
  if (ctx.json || v.json) console.log(JSON.stringify({ task: T, finding: F, key, decision, verdict: r.verdict, humanRequired: r.humanRequired }));
  else console.log(`✅ ${F} → ${decision}. verdict: ${r.verdict} · human required: ${r.humanRequired}`);
  return 0;
}
