// P2 — `hitl-index precommit`: full reindex, drift --fail-on block (precommit levels), forged-status check. Exit 1 on block.
import { parseArgs } from "node:util";
import { loadApi, readLock } from "../lib/lock.mjs";
import { readState } from "../lib/state.mjs";
import { computeStatuses, rank } from "../lib/status.mjs";
import { buildTrace, loadTraceInputs } from "../lib/trace.mjs";
import { wasRecorded } from "../lib/drift.mjs";

const OPTS = { json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

/** Symbols whose source @status claims verified/done but the computed status is lower. Pure. */
export function forgedStatuses(index, statuses, lock = null, state = null) {
  const out = [];
  for (const [id, st] of Object.entries(statuses.symbols || {})) {
    const S = index.symbols[id]; const claimed = S?.tags?.status;
    if (S && ["verified", "done"].includes(claimed) && rank(st.status) < rank(claimed) && !wasRecorded(lock, state, S, id, claimed)) {
      out.push({ level: "block", code: "STATUS_FORGED", symbol: id, file: S.file, line: S.docSpan?.start ?? S.span?.start ?? null, task: (S.tags?.task || [])[0] || null,
        message: `${S.name} says @status ${claimed} but computed status is ${st.status}`, affected: [] });
    }
  }
  return out;
}

export async function run(argv, ctx) {
  const { values: v } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  if (!ctx.root) { if (!json) console.log("hitl precommit: not initialized, skipping"); return 0; }
  const api = await loadApi(); if (!api) { console.error("hitl precommit: core not available, skipping"); return 0; }
  await api.updateIndex(ctx.root, null, { full: true });
  const index = await api.readIndex(ctx.root);
  const drift = await api.computeDrift(ctx.root, { precommit: true });
  const tasks = (await api.readTasks(ctx.root).catch(() => [])) || [];
  const lock = await readLock(ctx.root); const state = await readState(ctx.root);
  const statuses = computeStatuses(index, lock, state, ctx.config, tasks);
  const items = [...(drift.items || [])];
  if (ctx.config?.trace?.precommit === true) {
    try {
      const tr = buildTrace(await loadTraceInputs(ctx.root, ctx.config, { index, lock, state, tasks, statuses }), { kind: "all" });
      for (const i of tr.items) if (i.level === "block") items.push({ level: "block", code: i.code, symbol: i.ref, file: null, task: i.task, message: i.message, affected: [] });
    } catch { /* trace failure never blocks a commit */ }
  }
  for (const f of forgedStatuses(index, statuses, lock, state)) if (!items.some((i) => i.code === "STATUS_FORGED" && i.symbol === f.symbol)) items.push(f);
  for (const i of items) if (i.code === "STATUS_FORGED") i.level = "block";
  const block = items.filter((i) => i.level === "block"); const warn = items.filter((i) => i.level === "warn");
  const name = (id) => index.symbols[id]?.name || id;
  if (json) console.log(JSON.stringify({ ok: !block.length, block: block.length, warn: warn.length, items: [...block, ...warn] }, null, 2));
  else {
    console.log(`hitl precommit: ${block.length} block, ${warn.length} warn`);
    for (const i of block) console.log(`⛔ ${i.code} ${name(i.symbol)} (${i.file || "?"}) — ${i.message || ""}`);
    for (const i of warn.slice(0, 10)) console.log(`⚠️ ${i.code} ${name(i.symbol)} — ${i.message || ""}`);
    if (block.length) console.log("Commit blocked. Fix the items above or run /hitl:sync in Claude Code (git commit --no-verify bypasses).");
  }
  return block.length ? 1 : 0;
}
