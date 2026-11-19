// 0.16 — `hitl-index tests audit [<change-id>|<task-id>] [--json]`: read-only list of prune candidates over the tests
// of a change (or one task, or every task): no named defect, no AC, duplicate coverage of the same ACs at the same
// seam, overlapping tracer tests, tests that kill no mutant when kill data exists, duplicate test names, ids in names;
// plus the per-task test budget. Writes nothing; deletion goes through the existing approve paths
// (/hitl:approve <T> tests for an open task, /hitl:approve <change> accept for an archived change).
import { parseArgs } from "node:util";
import { loadApi, readLock } from "../lib/lock.mjs";
import { readState } from "../lib/state.mjs";
import { auditTests } from "../lib/testplan.mjs";
import { TASK_ID_RE } from "../lib/specids.mjs";

const OPTS = { json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };
const USAGE = "usage: hitl-index tests audit [<change-id>|<task-id>] [--json]";

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  const [sub, target] = positionals;
  if (sub !== "audit") { console.error(USAGE); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const api = await loadApi(); if (!api) { console.error("hitl-index core not available"); return 1; }
  try { await api.updateIndex(ctx.root, null, { changedOnly: true }); } catch { /* best effort */ }
  const index = await api.readIndex(ctx.root);
  if (!index) { console.error("index missing: run hitl-index index --all"); return 1; }
  const tasks = (await api.readTasks(ctx.root).catch(() => [])) || [];
  let scope = { tasks: null, label: null };
  if (target) {
    const ids = TASK_ID_RE.test(target) ? tasks.filter((t) => t.id === target).map((t) => t.id)
      : (() => { const own = tasks.filter((t) => t.change === target); const act = own.filter((t) => !t.archived); return (act.length ? act : own).map((t) => t.id); })();
    if (!ids.length) { console.error(`${target}: no task or change with tasks`); return 1; }
    scope = { tasks: ids, label: target };
  }
  const out = auditTests({ index, lock: await readLock(ctx.root), state: await readState(ctx.root), tasks }, scope);
  if (json) { console.log(JSON.stringify(out, null, 2)); return 0; }
  const label = { block: "_Block:_", warn: "⚠️", info: "_Info:_" };
  console.log(`Tests audit${out.scope ? ` ${out.scope}` : ""}: ${out.tests} test(s), ${out.candidates.length} prune candidate(s) (read-only)`);
  if (out.budget.length) {
    console.log(["", "| task | new rows | tests | budget (new rows + 2) |", "|---|---|---|---|"].join("\n"));
    for (const b of out.budget) console.log(`| ${b.task} | ${b.newRows} | ${b.tests} | ${b.limit}${b.over ? " ⚠️ over" : ""} |`);
    const sum = out.budget.reduce((a, b) => ({ n: a.n + b.newRows, t: a.t + b.tests, l: a.l + b.limit }), { n: 0, t: 0, l: 0 });
    console.log(`total: ${sum.t} tests for ${sum.n} new rows (budget ${sum.l})`);
  }
  if (out.candidates.length) {
    console.log(["", "| level | code | test | file | ACs | why |", "|---|---|---|---|---|---|"].join("\n"));
    for (const c of out.candidates) console.log(`| ${label[c.level]} | ${c.code} | ${String(c.title).replace(/\|/g, "\\|")} | ${c.file} | ${c.acs.join(", ") || "—"} | ${c.message.replace(/\|/g, "\\|")} |`);
    console.log("\n_Next:_ pick the tests to delete or merge; the test-author edits them; then /hitl:approve <T> tests (open task) or /hitl:approve <change> accept (archived change)");
  } else console.log("✅ no prune candidates");
  return 0;
}
