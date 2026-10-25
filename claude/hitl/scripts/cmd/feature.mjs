// `hitl-index feature <planning-or-tasks-file> [--lane fast] [--report] [--json]`
// Plan of a feature run (task order, lane and next action per task, early-stop reason) or, with --report, the
// one-screen summary .hitl/reviews/feature-<name>.md built from each task's review artifacts.
// `--report --security-audit <dir>` records a finished full security audit (<dir>/REPORT.md) in
// reviews/feature-<name>.security.json; every later --report links it.
import { parseArgs } from "node:util";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { p2paths, readJsonFile, writeFileAtomic } from "../lib/lock.mjs";
import { resolveFeature, planFeature, buildFeatureReport } from "../lib/feature.mjs";
import { gather } from "./status.mjs";

const OPTS = { lane: { type: "string" }, report: { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" }, "security-audit": { type: "string" } };
const USAGE = "usage: hitl-index feature <planning-or-tasks-file> [--lane fast] [--report [--security-audit <audit-dir>]] [--json]";

const ACTION_TEXT = {
  implement: (i) => (i.lane === "normal" ? `/hitl:implement ${i.id}` : `${i.lane === "override" ? "⚠️ override" : "⚡ fast"} lane: skeleton → tests → implement`),
  skeleton: (i) => `/hitl:skeleton ${i.id} (stops at its gate)`,
  test: (i) => `/hitl:test ${i.id} (stops at its gate)`,
  approve: (i) => `human: /hitl:approve ${i.id}`,
  "approve-tests": (i) => `human: /hitl:approve ${i.id} tests`,
  blocked: (i) => `waits for ${i.waitsFor.join(", ")}`,
  skip: () => "implemented (review at the end)",
};

export async function featureReport(root, config, plan, state, auditDir) {
  const P = p2paths(root); const perTask = {};
  for (const it of plan.items) {
    const dir = join(P.reviews, it.id); const rv = state.reviews?.[it.id];
    perTask[it.id] = { verdict: rv?.verdict || null, report: rv?.report || null,
      l0: await readJsonFile(join(dir, "l0.json"), null), findings: await readJsonFile(join(dir, "findings.json"), null),
      decisions: await readJsonFile(join(dir, "decisions.json"), null), securityLens: existsSync(join(dir, "findings-security.json")) };
  }
  const secFile = join(P.reviews, `feature-${plan.name}.security.json`);
  if (auditDir) {
    const report = join(resolve(root, auditDir), "REPORT.md");
    if (!existsSync(report)) return { error: `no REPORT.md in ${auditDir} (finish the security audit first)` };
    await writeFileAtomic(secFile, JSON.stringify({ schema: "hitl.security-audit/1", dir: resolve(root, auditDir), report, at: new Date().toISOString() }, null, 2) + "\n");
  }
  const securityAudit = await readJsonFile(secFile, null);
  const rep = buildFeatureReport({ plan, perTask, config, securityAudit });
  const file = join(P.reviews, `feature-${plan.name}.md`);
  await writeFileAtomic(file, rep.markdown);
  return { ...rep, file: relative(root, file) };
}

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  if (!positionals[0]) { console.error(USAGE); return 2; }
  if (v.lane !== undefined && v.lane !== "fast") { console.error("--lane takes only: fast"); return 2; }
  if (v["security-audit"] !== undefined && (!v.report || typeof v["security-audit"] !== "string" || !v["security-audit"])) { console.error("--security-audit <audit-dir> needs --report"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const g = await gather(ctx.root, ctx.config);
  const feature = resolveFeature(g.tasks, positionals[0]);
  if (feature.error) {
    if (json) console.log(JSON.stringify(feature, null, 2));
    else { console.log(`❌ ${feature.error}`); if (feature.candidates?.length) console.log(`tasks files: ${feature.candidates.join(", ")}`); }
    return 1;
  }
  const plan = planFeature({ feature, allTasks: g.tasks, statuses: g.statuses, drift: g.drift, laneFast: v.lane === "fast" });
  if (v.report) {
    const r = await featureReport(ctx.root, ctx.config, plan, g.state, v["security-audit"]);
    if (r.error) { if (json) console.log(JSON.stringify({ error: r.error }, null, 2)); else console.log(`❌ ${r.error}`); return 1; }
    if (json) console.log(JSON.stringify({ feature: plan.name, verdict: r.verdict, humanRequired: r.humanRequired, counts: r.counts, report: r.file, securityLensTasks: r.securityLensTasks }, null, 2));
    else { console.log(r.markdown.trimEnd()); console.log(`\n📝 ${r.file}`); }
    return 0;
  }
  if (json) { console.log(JSON.stringify(plan, null, 2)); return 0; }
  console.log(`🎯 Feature ${plan.name} — ${plan.items.length} task(s) · ${plan.file}${plan.laneFast ? " · --lane fast" : ""}`);
  console.log("| # | task | risk | lane | status | action |\n|---|---|---|---|---|---|");
  plan.items.forEach((i, n) => console.log(`| ${n + 1} | ${i.id} ${i.title} | ${i.risk}${i.riskReasons.length ? ` (${i.riskReasons.join(", ")})` : ""} | ${i.lane} | ${i.status} | ${ACTION_TEXT[i.action](i)} |`));
  if (plan.cycle.length) console.log(`⚠️ blocked-by cycle: ${plan.cycle.join(", ")}`);
  if (plan.stop) console.log(`🛑 ${plan.stop}`);
  else if (plan.phase === "review") console.log(`🎯 next: review every task, then hitl-index feature ${plan.file} --report`);
  else console.log(`🎯 next: ${plan.current.id}`);
  return 0;
}
