// P2 — `hitl-index record-mutation --symbol ref --score 0.86 --survivors N [--details file]`
import { parseArgs } from "node:util";
import { promises as fsp } from "node:fs";
import { resolve } from "node:path";
import { loadApi, resolveWith } from "../lib/lock.mjs";
import { recordMutation } from "../lib/state.mjs";

const OPTS = { symbol: { type: "string" }, score: { type: "string" }, survivors: { type: "string" }, details: { type: "string" }, json: { type: "boolean" }, root: { type: "string" } };

export async function run(argv, ctx) {
  const { values: v } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  if (!v.symbol || v.score === undefined) { console.error("usage: hitl-index record-mutation --symbol <ref> --score <0..1> --survivors <n> [--details file]"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  let score = Number(v.score); if (score > 1) score = score / 100;
  if (!Number.isFinite(score) || score < 0) { console.error("--score must be a number in 0..1 (or a percentage)"); return 2; }
  const api = await loadApi(); const index = api && (await api.readIndex(ctx.root));
  if (!index) { console.error("index missing: run hitl-index index --all"); return 1; }
  const r = resolveWith(api, index, v.symbol);
  if (!r?.id) { console.error(r?.ambiguous ? `ambiguous ref ${v.symbol}: ${r.ambiguous.join(", ")}` : `symbol ${v.symbol} not found`); return 1; }
  let details;
  if (v.details) { const raw = await fsp.readFile(resolve(ctx.root, v.details), "utf8"); try { details = JSON.parse(raw); } catch { details = raw.slice(0, 4000); } }
  const m = await recordMutation(ctx.root, r.id, { score, survivors: Number(v.survivors) || 0, bodyHash: index.symbols[r.id].bodyHash, details });
  if (ctx.json || v.json) console.log(JSON.stringify({ symbol: r.id, ...m }));
  else console.log(`✅ mutation recorded for ${index.symbols[r.id].name}: ${Math.round(score * 100)}% (${m.survivors} survivors)`);
  return 0;
}
