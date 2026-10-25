// P2 — `hitl-index risk <T> [--changed-since-review] [--json]` (§E.9.1)
import { parseArgs } from "node:util";
import { join } from "node:path";
import { p2paths, readJsonFile, taskRisk } from "../lib/lock.mjs";
import { computeRisk, label } from "../lib/risk.mjs";
import { gather } from "./status.mjs";

const OPTS = { "changed-since-review": { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

/** Shared with report: returns {risk, g(gathered), task, findings}. */
export async function riskFor(root, config, T, { changedSinceReview = false, g = null } = {}) {
  g = g || (await gather(root, config));
  const task = g.tasks.find((t) => t.id === T);
  const findings = await readJsonFile(join(p2paths(root).reviews, T, "findings.json"), null);
  let drift = g.drift;
  try { drift = await g.api.computeDrift(root, { task: T }); } catch { /* keep global */ }
  const symbolIds = g.statuses.tasks[T]?.symbols || [];
  const risk = computeRisk({ taskId: T, symbolIds, index: g.index, lock: g.lock, state: g.state, config, drift, findings, taskRisk: taskRisk(task, g.lock, T), taskRiskReasons: task?.riskReasons || [], changedSinceReview });
  return { risk, g, task, findings, drift };
}

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const T = positionals[0];
  if (!T) { console.error("usage: hitl-index risk <T-id> [--changed-since-review] [--json]"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const { risk, g } = await riskFor(ctx.root, ctx.config, T, { changedSinceReview: !!v["changed-since-review"] });
  if (!g.statuses.tasks[T]) { console.error(`task ${T} not found`); return 1; }
  if (ctx.json || v.json) { console.log(JSON.stringify(risk, null, 2)); return 0; }
  console.log(`risk ${T}: ${risk.score.toFixed(2)} (${label(risk.score)}) · lenses: ${risk.lenses.join(", ")}`);
  console.log("| symbol | risk | route | reasons |\n|---|---|---|---|");
  for (const [id, r] of Object.entries(risk.symbols).sort((a, b) => b[1].score - a[1].score)) console.log(`| ${g.index.symbols[id]?.name || id} | ${r.score.toFixed(2)} | ${r.route} | ${r.reasons.join(", ")} |`);
  return 0;
}
