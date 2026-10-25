// P2 — `hitl-index report <T> [--json]`: writes reviews/<T>.review.md (§E.9.3) and records state.reviews[T].
import { parseArgs } from "node:util";
import { join, relative } from "node:path";
import { readdirSync } from "node:fs";
import { p2paths, readJsonFile, writeJsonSorted, writeFileAtomic } from "../lib/lock.mjs";
import { buildReport } from "../lib/report.mjs";
import { recordReview } from "../lib/state.mjs";
import { runShell } from "../lib/runner.mjs";
import { riskFor } from "./risk.mjs";

const OPTS = { json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function generateReport(root, config, T) {
  const P = p2paths(root); const dir = join(P.reviews, T);
  const { risk, g, task, findings } = await riskFor(root, config, T);
  const l0 = await readJsonFile(join(dir, "l0.json"), null);
  const decisions = await readJsonFile(join(dir, "decisions.json"), null);
  const h = await runShell("git rev-parse --short HEAD", { cwd: root, timeoutMs: 5000 });
  const head = h.code === 0 && h.stdout.trim() ? h.stdout.trim() : "no-git";
  let lensesRan = [];
  try { lensesRan = readdirSync(dir).map((n) => /^findings-([a-z]+)\.json$/.exec(n)?.[1]).filter(Boolean); } catch {}
  const rep = buildReport({ taskId: T, title: task?.title, l0, findings, decisions, risk, lensesRan, statuses: g.statuses, lock: g.lock, index: g.index, config, head });
  const file = join(P.reviews, `${T}.review.md`);
  await writeFileAtomic(file, rep.markdown);
  await writeJsonSorted(join(dir, "decisions.json"), rep.decisions);
  const bodyHashes = {}; for (const id of g.statuses.tasks[T]?.symbols || []) bodyHashes[id] = g.index.symbols[id]?.bodyHash;
  await recordReview(root, T, { verdict: rep.verdict, bodyHashes, report: relative(root, file) });
  return { ...rep, file: relative(root, file), l0Missing: !l0, override: !!risk.override };
}

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const T = positionals[0];
  if (!T) { console.error("usage: hitl-index report <T-id> [--json]"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const r = await generateReport(ctx.root, ctx.config, T);
  if (ctx.json || v.json) console.log(JSON.stringify({ task: T, verdict: r.verdict, humanRequired: r.humanRequired, report: r.file, fNumbers: r.decisions.keys, l0Missing: r.l0Missing, override: r.override }, null, 2));
  else {
    const top = r.markdown.split("\n## Intent vs body")[0];
    console.log(top.trimEnd());
    console.log(`\n📝 ${r.file}`);
  }
  return 0;
}
