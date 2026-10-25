// P2 — `hitl-index status [T] [--brief] [--json] [--sync-tags]` (§E.6)
import { parseArgs } from "node:util";
import { promises as fsp } from "node:fs";
import { join, basename } from "node:path";
import { loadApi, readLock, p2paths } from "../lib/lock.mjs";
import { readState } from "../lib/state.mjs";
import { computeStatuses } from "../lib/status.mjs";
import { computeNext, lockedDrift } from "../lib/nextstep.mjs";
import { synctags } from "../lib/synctags.mjs";
import { buildTrace, loadTraceInputs } from "../lib/trace.mjs";

export const OPTS = { brief: { type: "boolean" }, json: { type: "boolean" }, "sync-tags": { type: "boolean" }, soft: { type: "boolean" }, quiet: { type: "boolean" }, root: { type: "string" } };

async function planningInfo(root) {
  const P = p2paths(root); const out = [];
  let files = []; try { files = (await fsp.readdir(P.planning)).filter((f) => f.endsWith(".md")); } catch { return out; }
  for (const f of files.sort()) {
    let text = ""; try { text = await fsp.readFile(join(P.planning, f), "utf8"); } catch { /* skip */ }
    const m = /^> status: (draft|approved)/m.exec(text);
    let hasTasks = false; try { await fsp.access(join(P.tasks, basename(f))); hasTasks = true; } catch { /* none */ }
    out.push({ file: f, status: m ? m[1] : "draft", hasTasks });
  }
  return out;
}

/** Gather everything status needs. Exported for l0/precommit reuse. */
export async function gather(root, config, { reindex = true, drift = true } = {}) {
  const api = await loadApi();
  if (!api) throw new Error("hitl-index core (lib/api.mjs) not available");
  if (reindex) {
    try {
      const idx = await api.readIndex(root);
      await api.updateIndex(root, null, idx ? { changedOnly: true, budgetMs: 4000 } : { full: true, budgetMs: 10000 });
    } catch { /* stale index is still usable */ }
  }
  const index = (await api.readIndex(root)) || { symbols: {}, files: {} };
  const lock = await readLock(root); const state = await readState(root);
  const tasks = (await api.readTasks(root).catch(() => [])) || [];
  const statuses = computeStatuses(index, lock, state, config, tasks);
  let d = null; if (drift) { try { d = await api.computeDrift(root, {}); } catch { d = null; } }
  return { api, index, lock, state, tasks, statuses, drift: d };
}

/** All-scope trace (null on failure) and the optional Linear summary (null when the module is absent or disabled). */
export async function traceAndTickets(ctx, g) {
  let trace = null;
  try { trace = buildTrace(await loadTraceInputs(ctx.root, ctx.config, { index: g.index, lock: g.lock, state: g.state, tasks: g.tasks, statuses: g.statuses }), { kind: "all" }); }
  catch { trace = null; }
  let linear = null;
  try { const m = await import("../lib/linear.mjs"); linear = await m.ticketsSummary(ctx.root, ctx.config, g.tasks, g.statuses); } catch { linear = null; }
  return { trace, linear };
}

/** Per-task trace summary: items with task === T + its AC rows. */
export function taskTrace(trace, T) {
  if (!trace) return null;
  const items = trace.items.filter((i) => i.task === T);
  const acs = [...new Map(trace.rows.flatMap((r) => r.acs).filter((a) => a.task === T).map((a) => [a.id, a])).values()];
  return { block: items.filter((i) => i.level === "block").length, warn: items.filter((i) => i.level === "warn").length, info: items.filter((i) => i.level === "info").length,
    acs: { total: acs.length, proven: acs.filter((a) => a.proven).length } };
}

/** Line-2 suffix of `status --brief`: trace and Linear hints (no new lines). */
export function briefSuffix(trace, tickets) {
  let out = "";
  const acs = trace?.summary?.acs;
  if (acs?.total > 0) {
    out += ` · trace: AC ${acs.proven}/${acs.total} proven`;
    if (trace.counts.block) out += `, ⛔ ${trace.counts.block}`;
    if (trace.counts.warn) out += `, ⚠️ ${trace.counts.warn}`;
  }
  if (tickets?.enabled && tickets.configured && (tickets.outOfSync || tickets.queued))
    out += ` · linear: ${tickets.outOfSync || 0} out of sync${tickets.queued ? `, ${tickets.queued} queued` : ""}`;
  return out;
}

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json; const soft = ctx.soft || v.soft;
  const T = positionals[0] || null;
  if (!ctx.root) {
    if (json) console.log(JSON.stringify({ initialized: false, next: { task: null, command: "/hitl:setup", reason: "not initialized" } }));
    else console.log("HITL: not initialized — run /hitl:setup");
    return soft ? 0 : 3;
  }
  try {
    let sync = null;
    if (v["sync-tags"]) {
      await gather(ctx.root, ctx.config, { drift: false }); // reindex first so tags are computed on current code
      sync = await synctags(ctx.root, { task: T, config: ctx.config });
    }
    const g = await gather(ctx.root, ctx.config, { reindex: !sync });
    const { index, tasks, statuses, drift, lock } = g;
    const next = computeNext({ tasks, statuses, drift, lock, planning: await planningInfo(ctx.root) });
    const ld = lockedDrift(drift, lock);
    if (T && !statuses.tasks[T]) {
      const msg = `task ${T} not found`;
      if (json) console.log(JSON.stringify({ error: msg })); else console.error(msg);
      return soft ? 0 : 1;
    }
    const tmeta = (id) => tasks.find((t) => t.id === id) || {};
    const { trace, linear } = json || v.brief ? await traceAndTickets(ctx, g) : { trace: null, linear: null };
    const tickets = linear ? (({ perTask, ...rest }) => rest)(linear) : null;
    if (json) {
      const pick = T ? Object.fromEntries(Object.entries(statuses.symbols).filter(([id]) => statuses.tasks[T].symbols.includes(id))) : statuses.symbols;
      const enrich = (id, st) => { const m = tmeta(id); const items = (drift?.items || []).filter((i) => i.task === id);
        return { ...st, title: m.title || null, prio: m.prio || null, file: m.file || null, blockedBy: m.blockedBy || [],
          drift: { block: items.filter((i) => i.level === "block").length, warn: items.filter((i) => i.level === "warn").length, info: items.filter((i) => i.level === "info").length },
          trace: taskTrace(trace, id), linear: linear?.perTask?.[id] ?? null }; };
      const taskOut = Object.fromEntries(Object.entries(statuses.tasks).filter(([id]) => !T || id === T).map(([id, st]) => [id, enrich(id, st)]));
      console.log(JSON.stringify({ symbols: pick, tasks: taskOut, next, drift: drift ? drift.summary : null, lockedDrift: ld.length,
        trace: trace ? { block: trace.counts.block, warn: trace.counts.warn, info: trace.counts.info, reqs: trace.summary.reqs, acs: { total: trace.summary.acs.total, tested: trace.summary.acs.tested, proven: trace.summary.acs.proven }, plannings: trace.plannings.length } : null,
        tickets,
        ...(sync ? { syncTags: { files: sync.files, tags: sync.tags, tasksFiles: sync.tasksFiles } } : {}) }, null, 2));
      return 0;
    }
    if (v.brief) {
      const ft = next.task ? statuses.tasks[next.task] : null;
      const m = next.task ? tmeta(next.task) : {};
      console.log(next.task ? `HITL: ${next.task} ${m.title || ""} — ${ft?.status} (${m.prio || "P?"}, ${ft?.risk}) · next: ${next.command}`.replace(/\s+—/, " —")
        : `HITL: ${next.reason} · next: ${next.command}`);
      const ids = Object.keys(statuses.tasks);
      if (ids.length) {
        const done = ids.filter((id) => statuses.tasks[id].status === "done").length;
        console.log(`tasks: ${ids.length} (done ${done})` + (drift ? ` · drift: ${drift.summary?.block || 0} block, ${drift.summary?.warn || 0} warn` : "") + briefSuffix(trace, tickets));
      }
      if (ld.length) console.log(`⚠️ HITL: ${ld.length} drift item(s) on locked symbols — run /hitl:sync`);
      return 0;
    }
    const rows = Object.entries(statuses.tasks).filter(([id]) => !T || id === T);
    console.log("| task | title | prio | risk | status | next |\n|---|---|---|---|---|---|");
    for (const [id, s] of rows) { const m = tmeta(id); console.log(`| ${id} | ${m.title || ""} | ${m.prio || ""} | ${s.risk}${s.override ? " ⚠️ override" : ""} | ${s.status} | ${s.next || "—"} |`); }
    if (T) {
      console.log("\n| symbol | impl | status | reasons |\n|---|---|---|---|");
      for (const id of statuses.tasks[T].symbols) { const S = index.symbols[id]; const st = statuses.symbols[id]; console.log(`| ${S?.name || id} | ${S?.tags?.impl || "?"} | ${st?.status} | ${(st?.reasons || []).join("; ")} |`); }
    }
    if (sync) console.log(`\nsync-tags: ${sync.tags.length} @status tag(s) rewritten in ${sync.files.length} file(s); ${sync.tasksFiles.length} tasks file(s) updated`);
    console.log(`\n🎯 next: ${next.command} (${next.reason})`);
    return 0;
  } catch (e) {
    if (soft) { console.log(`HITL: status unavailable (${e.message})`); return 0; }
    throw e;
  }
}
