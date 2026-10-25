// Drift report hitl.drift/1 (§E.8): current index vs skeleton.lock.json (+ previous index when given).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { paths } from "./project.mjs";
import { readJson } from "./fsutil.mjs";
import { resolveRef, fileOfId, nameOfId } from "./graph.mjs";

export const SCHEMA = "hitl.drift/1";
const LEVEL = { block: 0, warn: 1, info: 2 };
const ORDER = ["skeleton", "red", "wip", "green", "verified", "done"];
const FN = new Set(["function", "method", "class"]);
const SPEC_CODES = new Set(["SIG_CHANGED", "INTENT_CHANGED", "DELETED_LOCKED", "TODO_FLOW_CHANGED", "TEST_CHANGED", "TEST_DELETED", "TEST_SKIPPED"]);

async function loadStatus() {
  const p = new URL("./status.mjs", import.meta.url);
  if (!existsSync(fileURLToPath(p))) return null;
  try { return (await import(p.href)).computeStatuses || null; } catch { return null; }
}

export async function computeDrift(root, opts = {}) {
  const { readIndex } = await import("./indexer.mjs");
  const index = await readIndex(root);
  if (!index) return { schema: SCHEMA, items: [], summary: { block: 0, warn: 0, info: 0 } };
  return computeDriftFrom(root, index, opts);
}

/** computeDriftFrom(root, index, {files?, task?, precommit?, prevIndex?, config?, lock?, state?, spec?}) */
export async function computeDriftFrom(root, index, opts = {}) {
  const P = paths(root);
  const config = opts.config || (await loadConfig(root));
  const lock = opts.lock || (await readJson(P.lock, null)) || { symbols: {}, tests: {}, tasks: {} };
  const state = opts.state || (await readJson(P.state, null)) || { runs: {}, mutation: {}, reviews: {} };
  const L = { symbols: lock.symbols || {}, tests: lock.tests || {}, tasks: lock.tasks || {} };
  const S = index.symbols;
  const items = [];
  const add = (level, code, id, message, extra = {}) => {
    const s = S[id];
    items.push({ level, code, symbol: id, file: s?.file ?? (id && id.includes("#") ? fileOfId(id) : id), line: s?.span?.start ?? null,
      task: extra.task ?? L.symbols[id]?.task ?? L.tests[id]?.task ?? s?.tags?.task?.[0] ?? null, message, affected: [], ...extra });
  };
  const ref = (id) => S[id]?.name || nameOfId(id);
  const cur = (s) => ({ signature: s.signature, intent: s.intent });

  // locked symbols
  const bySigIntent = new Map();
  for (const [id, s] of Object.entries(S)) bySigIntent.set(`${s.sigHash}:${s.intentHash}`, id);
  for (const [id, l] of Object.entries(L.symbols)) {
    const s = S[id];
    if (!s) {
      const moved = bySigIntent.get(`${l.sigHash}:${l.intentHash}`);
      if (moved) add("info", "MOVED", id, `${nameOfId(id)} (locked ${l.task}) moved to ${moved}`, { affected: [moved] });
      else add("warn", "DELETED_LOCKED", id, `${nameOfId(id)} (locked ${l.task}) no longer exists`);
      continue;
    }
    const approved = { signature: l.signature, intent: l.intent };
    if (l.sigHash && s.sigHash !== l.sigHash)
      add("warn", "SIG_CHANGED", id, `${ref(id)} (locked ${l.task}) signature changed since approval${s.callers.length ? ` — affected callers: ${s.callers.map(ref).join(", ")}` : ""}. Needs human re-approval (/hitl:approve ${l.task}).`, { affected: s.callers, approved, current: cur(s) });
    if (l.intentHash && s.intentHash !== l.intentHash)
      add("warn", "INTENT_CHANGED", id, `${ref(id)} (locked ${l.task}) intent changed since approval${s.callers.length ? ` — affected callers: ${s.callers.map(ref).join(", ")}` : ""}. Needs human re-approval (/hitl:approve ${l.task}).`, { affected: s.callers, approved, current: cur(s) });
    if (s.stub && l.todoHash && s.todoHash !== l.todoHash) add("info", "TODO_FLOW_CHANGED", id, `${ref(id)} TODO(impl) steps changed since approval`);
    if (l.impl && s.tags.impl && s.tags.impl !== l.impl) add("info", "IMPL_CHANGED", id, `${ref(id)} @impl ${l.impl} → ${s.tags.impl}`);
    const done = L.tasks[l.task]?.doneBodyHashes?.[id];
    const rv = state.reviews?.[l.task]?.bodyHashes?.[id];
    if ((done && done !== s.bodyHash) || (!done && rv && rv !== s.bodyHash)) add("info", "BODY_CHANGED", id, `${ref(id)} body changed since the last ${done ? "done record" : "review"}`);
  }

  // orphans
  const tracked = new Set();
  for (const s of Object.values(S)) if (s.tags?.task?.length || L.symbols[s.id]) tracked.add(s.file);
  const taggedClass = new Set();
  for (const s of Object.values(S)) if (s.parent && (s.tags?.task?.length || L.symbols[s.id])) taggedClass.add(s.parent);
  for (const [id, s] of Object.entries(S)) {
    if (!FN.has(s.kind) || L.symbols[id] || s.tags?.task?.length) continue;
    if (config.orphanScope !== "all" && !tracked.has(s.file)) continue;
    if (s.kind === "class" && taggedClass.has(id)) continue;
    if (s.name.endsWith(".constructor")) continue;
    add("warn", "ORPHAN", id, `${ref(id)} has no @task — add @task T-<n> @impl agent @status skeleton.`, { task: null });
  }

  // deleted but referenced (vs lock and previous index)
  const removed = new Set(Object.keys(L.symbols).filter((id) => !S[id]));
  if (opts.prevIndex) for (const id of Object.keys(opts.prevIndex.symbols || {})) if (!S[id] && !["test", "suite"].includes(opts.prevIndex.symbols[id].kind)) removed.add(id);
  for (const r of removed) {
    const name = nameOfId(r), last = name.split(".").at(-1);
    const refs = new Set();
    for (const [id, s] of Object.entries(S)) {
      const tagRefs = [...(s.tags?.calls || []), ...(s.tags?.covers || [])];
      const hitTag = tagRefs.some((t) => !resolveRef(index, t, s.file) && (t === r || t === name || name.endsWith("." + t)));
      const hitCall = (s.unresolvedCalls || []).some((u) => u.split(".").at(-1) === last);
      if (hitTag || hitCall) refs.add(id);
    }
    if (refs.size) add("block", "DELETED_REFERENCED", r, `${name} was removed but is still referenced by ${[...refs].map(ref).join(", ")}`, { affected: [...refs].sort(), task: L.symbols[r]?.task ?? null });
  }

  // locked tests
  for (const [id, l] of Object.entries(L.tests)) {
    const s = S[id];
    if (!s) { add("warn", "TEST_DELETED", id, `locked test ${nameOfId(id)} (${l.task}) is missing`); continue; }
    if (l.stage !== "locked") continue;
    if ((l.bodyHash && s.bodyHash !== l.bodyHash) || (l.intentHash && s.intentHash !== l.intentHash))
      add("warn", "TEST_CHANGED", id, `locked test "${s.test?.titlePath?.at(-1) ?? s.name}" (${l.task}) changed since it was locked`);
    if (s.test && s.test.mode !== "active") add("warn", "TEST_SKIPPED", id, `locked test "${s.test.titlePath.at(-1)}" (${l.task}) is now ${s.test.mode}`);
  }

  // declared vs actual calls (task-tagged, non-stub)
  for (const [id, s] of Object.entries(S)) {
    if (s.stub || !(s.kind === "function" || s.kind === "method") || !(s.tags?.task?.length || L.symbols[id])) continue;
    const declared = new Set((s.tags.calls || []).map((t) => resolveRef(index, t, s.file)?.id).filter(Boolean));
    for (const c of s.callees) if (!declared.has(c)) add("info", "CALLS_UNDECLARED", id, `${ref(id)} calls ${ref(c)} which is not in @calls`, { affected: [c] });
    for (const d of declared) if (!s.callees.includes(d)) add("info", "CALLS_MISSING", id, `${ref(id)} declares @calls ${ref(d)} but does not call it`, { affected: [d] });
  }

  // status tags (needs P2 status.mjs)
  const computeStatuses = await loadStatus();
  if (computeStatuses) {
    try {
      const { readTasks } = await import("./tasksmd.mjs");
      const tasks = await readTasks(root).catch(() => []);
      const st = computeStatuses(index, lock, state, config, tasks)?.symbols || {};
      for (const [id, s] of Object.entries(S)) {
        const c = st[id]?.status, t = s.tags?.status;
        if (!c || !t || c === t || c === "none") continue;
        if ((t === "verified" || t === "done") && ORDER.indexOf(c) < ORDER.indexOf(t) && wasRecorded(L, state, s, id, t))
          add("warn", "STATUS_TAG_STALE", id, `${ref(id)} @status ${t} was recorded, but the code changed since (computed: ${c}); run /hitl:sync, then /hitl:review`);
        else if ((t === "verified" || t === "done") && ORDER.indexOf(c) < ORDER.indexOf(t))
          add(opts.precommit ? "block" : "warn", "STATUS_FORGED", id, `${ref(id)} says @status ${t} but computed status is ${c}`);
        else add("info", "STATUS_TAG_STALE", id, `${ref(id)} @status ${t} is stale (computed: ${c}); run hitl-index status --sync-tags`);
      }
    } catch { /* status module failure: skip STATUS_* codes */ }
  }

  // index-level warnings
  for (const w of index.warnings || []) {
    if (w.code === "PARSE_ERROR") items.push({ level: "warn", code: "PARSE_ERROR", symbol: null, file: w.file, line: null, task: null, message: w.message, affected: [] });
    if (w.code === "AMBIGUOUS_REF" || w.code === "UNRESOLVED_CALLS_TAG") add("warn", w.code, w.symbol, w.message);
  }

  // spec links (C3): only on request (CLI drift / l0); hooks never pass `spec`
  if (opts.spec) {
    try {
      const { loadTraceInputs, specLinksFor } = await import("./trace.mjs");
      const inputs = await loadTraceInputs(root, config, { index, lock, state });
      for (const i of items) {
        if (!SPEC_CODES.has(i.code) || !i.symbol) continue;
        const sp = specLinksFor(inputs, i.symbol);
        if (sp && (sp.decisions.length || sp.requirements.length)) i.spec = sp;
      }
    } catch { /* no spec field */ }
  }

  // filters
  let out = items;
  if (opts.files?.length) { const fs = new Set(opts.files); out = out.filter((i) => fs.has(i.file) || i.affected.some((a) => fs.has(fileOfId(a)))); }
  if (opts.task) {
    const taskFiles = new Set(Object.values(S).filter((s) => s.tags?.task?.includes(opts.task) || L.symbols[s.id]?.task === opts.task).map((s) => s.file));
    out = out.filter((i) => i.task === opts.task || (i.task === null && taskFiles.has(i.file)) || (S[i.symbol]?.tags?.task || []).includes(opts.task));
  }
  out.sort((a, b) => LEVEL[a.level] - LEVEL[b.level] || String(a.file).localeCompare(String(b.file)) || String(a.symbol).localeCompare(String(b.symbol)) || a.code.localeCompare(b.code));
  const summary = { block: 0, warn: 0, info: 0 };
  for (const i of out) summary[i.level]++;
  return { schema: SCHEMA, items: out, summary };
}

/** True when tooling legitimately recorded `@status <t>` for this symbol (done approval / review), i.e. not forged by hand. */
export function wasRecorded(lock, state, sym, id, t) {
  const T = (sym?.tags?.task || [])[0] || lock?.symbols?.[id]?.task;
  if (!T) return false;
  if (t === "done") return !!(lock?.tasks?.[T]?.doneAt && lock.tasks[T].doneBodyHashes?.[id]);
  if (t === "verified") return !!state?.reviews?.[T]?.bodyHashes?.[id];
  return false;
}
