// P2 — `hitl-index status [T] [--brief] [--json] [--sync-tags] [--work-order|--by-prio]` (§E.6)
import { parseArgs } from "node:util";
import { promises as fsp } from "node:fs";
import { join, basename } from "node:path";
import { loadApi, readLock, p2paths } from "../lib/lock.mjs";
import { readState } from "../lib/state.mjs";
import { computeStatuses } from "../lib/status.mjs";
import { computeNext, lockedDrift } from "../lib/nextstep.mjs";
import { synctags } from "../lib/synctags.mjs";
import { buildTrace, loadTraceInputs } from "../lib/trace.mjs";
import { workOrder } from "../lib/workorder.mjs";
import { resolveWith, notesByTask } from "../lib/lock.mjs";
import { readActiveNotes, noteCounts, applyCommand, changeWait, waitReasons } from "../lib/notes.mjs";
import { compareTaskIds } from "../lib/specids.mjs";

/**
 * Notes of the active changes for status/next (0.9): {changes:[{change, counts, first}], byTask:{T:[…]},
 * pending:[{change, id, title}], waits:[{change, for:[{change, state, notes}], amend:[{id, title, source, apply}], reasons}]}.
 * `changes` and `first` count the change's own notes; notes from another change (`source:`) go to `waits` (0.12).
 * Fail-open: an unreadable notes file counts as none.
 */
export async function notesInfo(root, g) {
  let cn = [];
  try { cn = await readActiveNotes(root); } catch { cn = []; }
  const byTask = notesByTask(cn, g.tasks, g.index, g.lock, g.api);
  const pending = cn.flatMap((c) => c.notes.filter((n) => n.status === "reopen pending").map((n) => ({ change: c.change, id: n.id, title: n.title })));
  const changes = cn.map((c) => {
    const own = c.notes.filter((n) => !n.source);
    const open = own.filter((n) => n.status === "reopen pending").concat(own.filter((n) => n.status === "open"));
    return { change: c.change, counts: noteCounts(own), first: open[0] ? applyCommand(c.change, open[0]) : null };
  }).filter((c) => c.counts.open || c.counts.reopenPending);
  const waits = cn.map((c) => ({ change: c.change, w: changeWait(c.notes) })).filter((x) => x.w.blocked).map(({ change, w }) => ({ change,
    for: w.waits.map((x) => ({ change: x.source, state: x.state, notes: x.notes })),
    amend: w.amend.map((n) => ({ id: n.id, title: n.title, source: n.source, kind: n.kind, apply: applyCommand(change, n) })), reasons: waitReasons(change, w) }));
  return { changes, byTask, pending, waits };
}

/** `status --brief` lines for changes that wait for another change (0.12): ⏳ waits, 📥 notes to take in. */
export function waitLines(ni) {
  const out = [];
  for (const x of ni?.waits || []) {
    if (x.for.length) out.push(`⏳ ${x.change} waits for ${x.for.map((f) => `${f.change}${f.state === "gone" ? " (gone: dismiss its notes)" : ""} (${f.notes.join(", ")})`).join(", ")}: no task approval, implement or archive of ${x.change} until then`);
    if (x.amend.length) out.push(`📥 ${x.change} must take in ${x.amend.map((n) => `${n.id} from ${n.source}`).join(", ")} first → ${x.amend[0].apply}`);
  }
  return out;
}

/** `status --brief` notes line, or null. */
export function notesLine(ni) {
  if (!ni?.changes.length) return null;
  const parts = ni.changes.map((c) => `${c.change} ${[c.counts.open ? `${c.counts.open} open` : null, c.counts.reopenPending ? `${c.counts.reopenPending} reopen pending` : null].filter(Boolean).join(", ")}`);
  return `📌 notes: ${parts.join(" · ")} → ${ni.changes[0].first}`;
}

export const OPTS = { brief: { type: "boolean" }, json: { type: "boolean" }, "sync-tags": { type: "boolean" }, "by-prio": { type: "boolean" }, "work-order": { type: "boolean" }, soft: { type: "boolean" }, quiet: { type: "boolean" }, root: { type: "string" } };

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

/**
 * Symbol ids of task T in work order (callees first over `@calls`, then `@prio`, then `### Symbols` row; lib/workorder.mjs).
 * @param {string[]} ids @param {object} index @param {{symbols?:{ref:string,file?:string}[]}} [task] @param {object} [api]
 */
export function taskWorkOrder(ids, index, task, api) {
  const rows = (task?.symbols || []).map((r) => resolveWith(api, index, r.ref, r.file)?.id).filter(Boolean);
  return workOrder(ids, index, { rows });
}

/** Task ids by number (T-2 before T-10); with `prioOf`, by priority first (P0, P1, …; none last). */
export function sortTaskIds(ids, prioOf) {
  const pr = (id) => { const m = /^P(\d+)$/.exec(prioOf?.(id) || ""); return m ? Number(m[1]) : Infinity; };
  return [...ids].sort((a, b) => (prioOf ? pr(a) - pr(b) : 0) || compareTaskIds(a, b));
}

/**
 * Active changes with their computed phase (design v3 §6.4), using the already computed task statuses:
 * [{id, title, phase, next, tasks:{total, done}}]. [] when there are no changes.
 */
export async function changesInfo(root, statuses) {
  let ch; try { ch = await import("../lib/changes.mjs"); } catch { return []; }
  const out = [];
  for (const e of await ch.listChanges(root, { archived: false }).catch(() => [])) {
    const c = await ch.readChange(root, e).catch(() => null);
    if (!c) continue;
    const ts = c.tasksDoc?.tasks || [];
    const done = ts.filter((t) => statuses?.tasks?.[t.id]?.status === "done").length;
    const proposal = c.proposal ? c.proposal.status || "draft" : "missing";
    const design = ch.designState(c);
    const tasks = c.tasksDoc ? c.tasksDoc.status || "draft" : "missing";
    const { artifactDecision } = await import("../lib/specmd.mjs");
    const tasksSkipped = artifactDecision(c.proposal, "tasks") === "skipped" || (!!c.proposal?.noBehaviourChange && !c.deltas.length);
    const phase = ch.changePhase({ archived: false, proposal, design, tasks, tasksSkipped, taskCounts: { total: ts.length, done } });
    out.push({ id: c.id, title: c.proposal?.title ?? null, proposal, design, phase, tasks: { total: ts.length, done } });
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

/** All-scope trace (null on failure) and the optional tickets summary (null when the module is absent or disabled). */
export async function traceAndTickets(ctx, g) {
  let trace = null;
  try { trace = buildTrace(await loadTraceInputs(ctx.root, ctx.config, { index: g.index, lock: g.lock, state: g.state, tasks: g.tasks, statuses: g.statuses }), { kind: "all" }); }
  catch { trace = null; }
  let linear = null;
  try { const m = await import("../lib/tickets.mjs"); linear = await m.ticketsSummary(ctx.root, ctx.config, g.tasks, g.statuses); } catch { linear = null; }
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

/** Line-2 suffix of `status --brief`: trace and tickets hints (no new lines). */
export function briefSuffix(trace, tickets) {
  let out = "";
  const acs = trace?.summary?.acs;
  if (acs?.total > 0) {
    out += ` · trace: AC ${acs.proven}/${acs.total} proven`;
    if (trace.counts.block) out += `, ⛔ ${trace.counts.block}`;
    if (trace.counts.warn) out += `, ⚠️ ${trace.counts.warn}`;
  }
  if (tickets?.enabled && tickets.configured && (tickets.outOfSync || tickets.queued))
    out += ` · ${tickets.provider || "linear"}: ${tickets.outOfSync || 0} out of sync${tickets.queued ? `, ${tickets.queued} queued` : ""}`;
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
    const { index, tasks, statuses, drift, lock, api } = g;
    const byWork = v["work-order"] || v["by-prio"];
    const changes = await changesInfo(ctx.root, statuses);
    const ni = await notesInfo(ctx.root, g);
    let next = computeNext({ tasks, statuses, drift, lock, planning: await planningInfo(ctx.root), changes, notes: ni });
    // 0.13: pre-0.13 ids (T-n, D-n, keyless changes, a hitl.lock/1 with T-n) route to /hitl:migrate first; 0.13.2: so
    // do legacy QT-T<n> quick ids in a keyed project
    const legacy = await (await import("../lib/migrateids.mjs")).legacyIdState(ctx.root).catch(() => ({ legacy: false, reasons: [] }));
    const idsLegacy = legacy.legacy ? { code: "IDS_LEGACY", reasons: legacy.reasons } : null;
    const legacyWhat = legacy.quickOnly ? "legacy quick-task ids" : "pre-0.13 ids";
    if (idsLegacy) next = { ...next, task: null, command: "/hitl:migrate", reason: `IDS_LEGACY: ${legacyWhat} (${legacy.reasons[0]})` };
    const waitOf = (id) => { const c = tmeta(id).change; const x = c && (ni.waits || []).find((y) => y.change === c); return x ? { change: c, for: x.for, amend: x.amend.map((n) => n.id) } : null; };
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
      // with a task: its symbols' status for that task (a symbol shared with an earlier task is judged on T's work)
      const pick = T ? Object.fromEntries(Object.entries(statuses.symbols).filter(([id]) => statuses.tasks[T].symbols.includes(id)).map(([id, st]) => [id, statuses.tasks[T].symbolStatus?.[id] || st])) : statuses.symbols;
      const enrich = (id, st) => { const m = tmeta(id); const items = (drift?.items || []).filter((i) => i.task === id);
        return { ...st, workOrder: taskWorkOrder(st.targets || st.symbols || [], index, m, api), title: m.title || null, prio: m.prio || null, file: m.file || null, blockedBy: m.blockedBy || [],
          drift: { block: items.filter((i) => i.level === "block").length, warn: items.filter((i) => i.level === "warn").length, info: items.filter((i) => i.level === "info").length },
          trace: taskTrace(trace, id), linear: linear?.perTask?.[id] ?? null, notes: (ni.byTask[id] || []).map(({ id: n, title, status, kind, apply, via }) => ({ id: n, title, status, kind, via, apply })),
          ...(waitOf(id) ? { wait: waitOf(id) } : {}) }; };
      const taskOut = Object.fromEntries(Object.entries(statuses.tasks).filter(([id]) => !T || id === T).map(([id, st]) => [id, enrich(id, st)]));
      console.log(JSON.stringify({ symbols: pick, tasks: taskOut, next, changes: changes.map(({ id, phase, tasks: tc }) => ({ id, phase, tasks: tc, notes: ni.changes.find((c) => c.change === id)?.counts ?? null,
        wait: (({ change, ...w }) => w)((ni.waits || []).find((x) => x.change === id) || { change: null }) })).map((c) => (Object.keys(c.wait).length ? c : (({ wait, ...r }) => r)(c))), drift: drift ? drift.summary : null, lockedDrift: ld.length,
        trace: trace ? { block: trace.counts.block, warn: trace.counts.warn, info: trace.counts.info, reqs: trace.summary.reqs, acs: { total: trace.summary.acs.total, tested: trace.summary.acs.tested, proven: trace.summary.acs.proven }, scenarios: trace.summary.scenarios, plannings: trace.plannings.length, changes: (trace.changes || []).length } : null,
        tickets, ...(idsLegacy ? { idsLegacy } : {}),
        ...(sync ? { syncTags: { files: sync.files, tags: sync.tags, tasksFiles: sync.tasksFiles } } : {}) }, null, 2));
      return 0;
    }
    if (v.brief) {
      if (idsLegacy) console.log(`⚠️ HITL: ${legacyWhat} (${idsLegacy.reasons[0]}) — run /hitl:migrate`);
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
      const nl = notesLine(ni);
      if (nl) console.log(nl);
      for (const l of waitLines(ni)) console.log(l);
      return 0;
    }
    const ids = sortTaskIds(Object.keys(statuses.tasks).filter((id) => !T || id === T), byWork ? (id) => tmeta(id).prio : null);
    const rows = ids.map((id) => [id, statuses.tasks[id]]);
    console.log("| task | title | prio | risk | status | next |\n|---|---|---|---|---|---|");
    for (const [id, s] of rows) { const m = tmeta(id); const nb = ni.byTask[id]; console.log(`| ${id} | ${m.title || ""} | ${m.prio || ""} | ${s.risk}${s.override ? " ⚠️ override" : ""} | ${s.status}${nb ? ` 📌 ${nb.map((x) => x.id).join(",")}` : ""}${waitOf(id) ? ` ⏳ ${waitOf(id).for.map((f) => f.change).join(",") || "amend"}` : ""} | ${s.next || "—"} |`); }
    if (byWork) {
      for (const [id] of rows) {
        const syms = statuses.tasks[id].targets || statuses.tasks[id].symbols;
        if (!syms.length) continue;
        console.log(`\n${T ? "" : `### ${id}\n`}| # | prio | symbol | impl | status | reasons |\n|---|---|---|---|---|---|`);
        taskWorkOrder(syms, index, tmeta(id), api).forEach((sid, i) => { const S = index.symbols[sid]; const st = statuses.tasks[id].symbolStatus?.[sid] || statuses.symbols[sid]; console.log(`| ${i + 1} | ${S?.tags?.prio ?? "?"} | ${S?.name || sid} | ${S?.tags?.impl || "?"} | ${st?.status} | ${(st?.reasons || []).join("; ")} |`); });
      }
    } else if (T) {
      console.log("\n| symbol | impl | status | reasons |\n|---|---|---|---|");
      for (const id of statuses.tasks[T].symbols) { const S = index.symbols[id]; const st = statuses.tasks[T].symbolStatus?.[id] || statuses.symbols[id]; console.log(`| ${S?.name || id} | ${S?.tags?.impl || "?"} | ${st?.status} | ${(st?.reasons || []).join("; ")} |`); }
    }
    if (sync) console.log(`\nsync-tags: ${sync.tags.length} @status tag(s) rewritten in ${sync.files.length} file(s); ${sync.tasksFiles.length} tasks file(s) updated`);
    const nl = notesLine(ni);
    if (nl) console.log(`\n${nl}`);
    for (const l of waitLines(ni)) console.log(l);
    console.log(`\n🎯 next: ${next.command} (${next.reason})`);
    return 0;
  } catch (e) {
    if (soft) { console.log(`HITL: status unavailable (${e.message})`); return 0; }
    throw e;
  }
}
