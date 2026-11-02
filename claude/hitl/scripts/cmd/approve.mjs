// P2 — `hitl-index approve <T> [--stage skeleton|tests|done] [--symbols a,b] [--by human|auto|human-override] [--dry-run] [--force] [--json]` (§E.5)
// The human-only rule for `--by human` is enforced by the PreToolUse approve token (P3); the CLI enforces `--by auto` = low risk only.
// `--by human-override` (the user forced the fast lane with `/hitl:implement <T> --lane fast`) is gated by the hook's override
// token the same way; the CLI allows it for any risk, never for stage done, and marks the task as overridden in the lock.
// `hitl-index approve --change <id> [--stage intent] [--symbols a,b] --by human [--dry-run] [--json]`: intent re-approval of a
// done change's locked symbols (lock.planApproval stage intent; the hook's approve token must be bound to that change).
import { parseArgs } from "node:util";
import { planApproval, writeLock, APPROVERS, lockedTasks } from "../lib/lock.mjs";
import { synctags } from "../lib/synctags.mjs";
import { computeStatuses } from "../lib/status.mjs";
import { computeNext } from "../lib/nextstep.mjs";
import { gather } from "./status.mjs";
import { loadTraceInputs, specLinksFor } from "../lib/trace.mjs";

const OPTS = { change: { type: "string" }, stage: { type: "string" }, symbols: { type: "string" }, by: { type: "string" }, "dry-run": { type: "boolean" }, force: { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  const T = positionals[0];
  // tolerate positional stage/symbols (`approve T-1 tests a,b`) in addition to the flags
  if (v.change !== undefined) return runIntent(v, positionals, ctx, json);
  if (v.stage === "intent") { console.error("--stage intent takes --change <change-id> instead of a task id: hitl-index approve --change <id> --stage intent --by human"); return 2; }
  if (!v.stage && ["skeleton", "tests", "done"].includes(positionals[1])) v.stage = positionals[1];
  if (!v.symbols && positionals.length > 2) v.symbols = positionals.slice(2).join(",");
  if (!T || !/^T-\d+$/.test(T)) { console.error("usage: hitl-index approve <T-id> [--stage skeleton|tests|done] [--symbols a,b] [--by human|auto|human-override] [--dry-run] [--force]  |  hitl-index approve --change <change-id> --stage intent [--symbols a,b] --by human [--dry-run]"); return 2; }
  const by = v.by || "human";
  if (!APPROVERS.includes(by)) { console.error(`--by must be one of ${APPROVERS.join("|")}`); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const g = await gather(ctx.root, ctx.config, { drift: false });
  const task = g.tasks.find((t) => t.id === T);
  const plan = planApproval({ taskId: T, stage: v.stage, symbols: v.symbols ? v.symbols.split(",").map((s) => s.trim()).filter(Boolean) : null,
    by, force: !!v.force, index: g.index, lock: g.lock, state: g.state, config: ctx.config, task, tasks: g.tasks, statuses: g.statuses, api: g.api });
  const counts = (l) => ({ symbols: Object.values(l.symbols).filter((s) => lockedTasks(s).includes(T)).length, tests: Object.values(l.tests).filter((t) => t.task === T).length,
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
      console.log(`  symbols: new ${c.symbols.new.length}, changed ${c.symbols.changed.length}, unchanged ${c.symbols.unchanged.length}, removed ${c.symbols.removed.length}, renamed ${c.symbols.renamed.length}`);
      for (const id of c.symbols.new) console.log(`    + ${nm(id)}`);
      for (const x of c.symbols.changed) console.log(`    ~ ${nm(x.id)} (${x.what.join(",")})`);
      for (const id of c.symbols.removed) console.log(`    - ${id} (removed from lock)`);
      for (const x of c.symbols.renamed) console.log(`    ✏️ ${x.from} → ${x.to} (renamed in lock)`);
      console.log(`  tests: new ${c.tests.new.length}, changed ${c.tests.changed.length}, unchanged ${c.tests.unchanged.length}, removed ${c.tests.removed.length}`);
      for (const id of c.tests.removed) console.log(`    - ${id} (removed from lock)`);
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
    const removed = [...plan.changes.symbols.removed, ...plan.changes.tests.removed];
    if (removed.length) console.log(`🗑️ removed from lock: ${removed.join(", ")}`);
    if (plan.changes.symbols.renamed.length) console.log(`✏️ renamed in lock: ${plan.changes.symbols.renamed.map((x) => `${x.from} → ${x.to}`).join(", ")}`);
    if (by === "human-override") console.log(`⚠️ ${T} is marked human-override: its review routes every function to the human (L2)`);
    if (hasLinks) {
      const ids = [...new Set(specLinks.flatMap((l) => [...l.decisions.map((d) => d.id), ...l.requirements.map((r) => r.id)]))];
      console.log(`📐 linked ${ids.join(", ")} — if the decision changed, amend the plan (/hitl:sync offers it)`);
    }
    console.log(`🎯 next: ${next}`);
  }
  return 0;
}

/** `approve --change <id> --stage intent`: re-lock the intents of a done change's symbols; nothing else in the lock moves. */
async function runIntent(v, positionals, ctx, json) {
  const C = typeof v.change === "string" ? v.change.trim() : "";
  const usage = "usage: hitl-index approve --change <change-id> [--stage intent] [--symbols a,b] --by human [--dry-run] [--json]";
  if (!C || !/^[A-Za-z0-9][\w.-]*$/.test(C) || /^T-\d+$/.test(C)) { console.error(usage); return 2; }
  if (positionals.length) { console.error(`--change takes no positional task/stage (got ${positionals.join(" ")}); ${usage}`); return 2; }
  if (v.stage && v.stage !== "intent") { console.error(`--change approves only --stage intent (got ${v.stage})`); return 2; }
  if (v.force) { console.error("--force does not apply to --stage intent"); return 2; }
  const by = v.by || "human";
  if (by !== "human") { console.error(`intent re-approval is human-only: --by human (not --by ${by})`); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const g = await gather(ctx.root, ctx.config, { drift: false });
  const plan = planApproval({ changeId: C, stage: "intent", symbols: v.symbols ? v.symbols.split(",").map((s) => s.trim()).filter(Boolean) : null,
    by, index: g.index, lock: g.lock, state: g.state, config: ctx.config, tasks: g.tasks, statuses: g.statuses, api: g.api });
  const nm = (id) => g.index.symbols[id]?.name || id;
  const out = { ok: plan.ok, change: C, stage: "intent", by, dryRun: !!v["dry-run"], reasons: plan.reasons, warnings: plan.warnings || [], changes: plan.changes };
  const warn = () => { if (!json) for (const w of out.warnings) console.log(`⚠️ ${w}`); };
  if (!plan.ok) {
    const suggest = `hitl-index drift --json (INTENT_CHANGED only); hitl-index intents ${C}`;
    if (json) console.log(JSON.stringify({ ...out, suggest }, null, 2));
    else { console.log(`🛑 approve --change ${C} --stage intent refused:`); for (const r of plan.reasons) console.log(`  - ${r}`); console.log(`💡 ${suggest}`); }
    return 1;
  }
  const changed = plan.changes.symbols.changed.map((x) => x.id);
  if (v["dry-run"]) {
    if (json) console.log(JSON.stringify(out, null, 2));
    else { console.log(`approve --change ${C} --stage intent (dry run, by ${by}): ${changed.length} intent(s)`); for (const id of changed) console.log(`    ~ ${nm(id)} (intent)`); warn(); }
    return 0;
  }
  await writeLock(ctx.root, plan.lock);
  if (json) console.log(JSON.stringify({ ...out, approved: changed }, null, 2));
  else { console.log(`✅ ${C} intent re-approved by ${by}: ${changed.map(nm).join(", ")}`); warn(); }
  return 0;
}
