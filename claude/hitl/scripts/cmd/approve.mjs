// P2 — `hitl-index approve <T> [--stage skeleton|tests|done] [--symbols a,b] [--by human|auto|human-override] [--dry-run] [--force] [--json]` (§E.5)
// The human-only rule for `--by human` is enforced by the PreToolUse approve token (P3); the CLI enforces `--by auto` = low risk only.
// `--by human-override` (the user forced the fast lane with `/hitl:implement <T> --lane fast`) is gated by the hook's override
// token the same way; the CLI allows it for any risk, never for stage done, and marks the task as overridden in the lock.
import { parseArgs } from "node:util";
import { planApproval, writeLock, APPROVERS } from "../lib/lock.mjs";
import { synctags } from "../lib/synctags.mjs";
import { computeStatuses } from "../lib/status.mjs";
import { computeNext } from "../lib/nextstep.mjs";
import { gather } from "./status.mjs";
import { loadTraceInputs, specLinksFor } from "../lib/trace.mjs";

const OPTS = { stage: { type: "string" }, symbols: { type: "string" }, by: { type: "string" }, "dry-run": { type: "boolean" }, force: { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  const T = positionals[0];
  // tolerate positional stage/symbols (`approve T-1 tests a,b`) in addition to the flags
  if (!v.stage && ["skeleton", "tests", "done"].includes(positionals[1])) v.stage = positionals[1];
  if (!v.symbols && positionals.length > 2) v.symbols = positionals.slice(2).join(",");
  if (!T || !/^T-\d+$/.test(T)) { console.error("usage: hitl-index approve <T-id> [--stage skeleton|tests|done] [--symbols a,b] [--by human|auto|human-override] [--dry-run] [--force]"); return 2; }
  const by = v.by || "human";
  if (!APPROVERS.includes(by)) { console.error(`--by must be one of ${APPROVERS.join("|")}`); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const g = await gather(ctx.root, ctx.config, { drift: false });
  const task = g.tasks.find((t) => t.id === T);
  const plan = planApproval({ taskId: T, stage: v.stage, symbols: v.symbols ? v.symbols.split(",").map((s) => s.trim()).filter(Boolean) : null,
    by, force: !!v.force, index: g.index, lock: g.lock, state: g.state, config: ctx.config, task, tasks: g.tasks, statuses: g.statuses, api: g.api });
  const counts = (l) => ({ symbols: Object.values(l.symbols).filter((s) => s.task === T).length, tests: Object.values(l.tests).filter((t) => t.task === T).length,
    testsLocked: Object.values(l.tests).filter((t) => t.task === T && t.stage === "locked").length });
  const nextCmd = plan.stage === "skeleton" ? `/hitl:test ${T}` : plan.stage === "tests" ? `/hitl:implement ${T}` : null;
  const out = { ok: plan.ok, task: T, stage: plan.stage, by, ...(by === "human-override" ? { override: true } : {}), dryRun: !!v["dry-run"], reasons: plan.reasons, changes: plan.changes };

  if (!plan.ok) {
    const suggest = plan.stage === "skeleton" ? `fix the skeleton/tags then rerun; check with: hitl-index drift --task ${T}`
      : plan.stage === "tests" ? `hitl-index test --task ${T}` : `/hitl:review ${T}`;
    if (json) console.log(JSON.stringify({ ...out, suggest }, null, 2));
    else { console.log(`🛑 approve ${T} --stage ${plan.stage} refused:`); for (const r of plan.reasons) console.log(`  - ${r}`); console.log(`💡 ${suggest}`); }
    return 1;
  }
  if (v["dry-run"]) {
    if (json) console.log(JSON.stringify({ ...out, locked: counts(plan.lock) }, null, 2));
    else {
      const c = plan.changes; const nm = (id) => g.index.symbols[id]?.name || id;
      console.log(`approve ${T} --stage ${plan.stage} (dry run, by ${by}):`);
      console.log(`  symbols: new ${c.symbols.new.length}, changed ${c.symbols.changed.length}, unchanged ${c.symbols.unchanged.length}`);
      for (const id of c.symbols.new) console.log(`    + ${nm(id)}`);
      for (const x of c.symbols.changed) console.log(`    ~ ${nm(x.id)} (${x.what.join(",")})`);
      console.log(`  tests: new ${c.tests.new.length}, changed ${c.tests.changed.length}, unchanged ${c.tests.unchanged.length}`);
      for (const [ac, ts] of Object.entries(c.acCoverage)) console.log(`    ${ac}: ${ts.length} test(s)`);
    }
    return 0;
  }
  await writeLock(ctx.root, plan.lock);
  let sync = null; try { sync = await synctags(ctx.root, { task: T, config: ctx.config }); } catch (e) { sync = { error: e.message }; }
  let next = nextCmd;
  if (!next) {
    const st = computeStatuses(g.index, plan.lock, g.state, ctx.config, g.tasks);
    next = computeNext({ tasks: g.tasks, statuses: st, lock: plan.lock }).command;
  }
  let specLinks = null;
  if (plan.stage === "skeleton" && plan.changes.symbols.changed.length) {
    try {
      const inputs = await loadTraceInputs(ctx.root, ctx.config, { index: g.index, lock: plan.lock, state: g.state, tasks: g.tasks, statuses: g.statuses });
      specLinks = [];
      for (const { id } of plan.changes.symbols.changed) {
        const sp = specLinksFor(inputs, id);
        if (sp && (sp.decisions.length || sp.requirements.length)) specLinks.push({ symbol: id, decisions: sp.decisions, requirements: sp.requirements });
      }
    } catch { specLinks = null; }
  }
  const hasLinks = specLinks?.length > 0;
  if (json) console.log(JSON.stringify({ ...out, ...(hasLinks ? { specLinks } : {}), locked: counts(plan.lock), next, syncTags: sync && !sync.error ? { files: sync.files, tasksFiles: sync.tasksFiles } : sync }, null, 2));
  else {
    const k = counts(plan.lock);
    console.log(`✅ ${T} ${plan.stage} approved by ${by}: ${k.symbols} symbol(s), ${k.tests} test(s) (${k.testsLocked} locked)`);
    if (by === "human-override") console.log(`⚠️ ${T} is marked human-override: its review routes every function to the human (L2)`);
    if (hasLinks) {
      const ids = [...new Set(specLinks.flatMap((l) => [...l.decisions.map((d) => d.id), ...l.requirements.map((r) => r.id)]))];
      console.log(`📐 linked ${ids.join(", ")} — if the decision changed, amend the plan (/hitl:sync offers it)`);
    }
    console.log(`🎯 next: ${next}`);
  }
  return 0;
}
