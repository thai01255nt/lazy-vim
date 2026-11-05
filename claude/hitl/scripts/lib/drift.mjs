// Drift report hitl.drift/1 (§E.8): current index vs skeleton.lock.json (+ previous index when given).
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.mjs";
import { paths } from "./project.mjs";
import { readJson } from "./fsutil.mjs";
import { resolveRef, fileOfId, nameOfId } from "./graph.mjs";
import { referencesTo, renamePairs, currentTask, lockedTasks, bodyBaseline, testOwner } from "./lock.mjs";
import { SPECREF_G } from "./specids.mjs";
import { changeOfFile, archivedChangeOf, readTasks } from "./tasksmd.mjs";

export const SCHEMA = "hitl.drift/1";
const LEVEL = { block: 0, warn: 1, info: 2 };
const ORDER = ["skeleton", "red", "wip", "green", "verified", "done"];
const FN = new Set(["function", "method", "class"]);
const SPEC_CODES = new Set(["SIG_CHANGED", "INTENT_CHANGED", "DELETED_LOCKED", "RENAMED", "TODO_FLOW_CHANGED", "ARCHIVED_BODY_CHANGED", "TEST_CHANGED", "TEST_DELETED", "TEST_SKIPPED"]);

/** The `fix` of a drift item on an archived change's symbol or test: claim it into an open task, or accept it (not for a signature). */
export function archivedFix(change, ref, { accept = true, test = false } = {}) {
  const claim = test
    ? `claim: tag the test @ac <T>.ACn (or @task <T>) of an open task, then /hitl:approve <T> tests`
    : `claim: add a modify row + @task <T> to an open task, then /hitl:approve <T> skeleton ${ref}`;
  return accept ? `${claim} · accept: /hitl:approve ${change} accept` : claim;
}

async function loadStatusModule() {
  const p = new URL("./status.mjs", import.meta.url);
  if (!existsSync(fileURLToPath(p))) return null;
  try { return await import(p.href); } catch { return null; }
}

export async function computeDrift(root, opts = {}) {
  const { readIndex } = await import("./indexer.mjs");
  const index = await readIndex(root);
  if (!index) return { schema: SCHEMA, items: [], summary: { block: 0, warn: 0, info: 0 } };
  return computeDriftFrom(root, index, opts);
}

/** computeDriftFrom(root, index, {files?, task?, precommit?, prevIndex?, config?, lock?, state?, spec?, tasks?}) */
export async function computeDriftFrom(root, index, opts = {}) {
  const P = paths(root);
  const config = opts.config || (await loadConfig(root));
  const lock = opts.lock || (await readJson(P.lock, null)) || { symbols: {}, tests: {}, tasks: {} };
  const state = opts.state || (await readJson(P.state, null)) || { runs: {}, mutation: {}, reviews: {} };
  const L = { symbols: lock.symbols || {}, tests: lock.tests || {}, tasks: lock.tasks || {} };
  const S = index.symbols;
  const tasks = opts.tasks || (await readTasks(root).catch(() => []));
  const statusMod = await loadStatusModule();
  const items = [];
  const add = (level, code, id, message, extra = {}) => {
    const s = S[id];
    items.push({ level, code, symbol: id, file: s?.file ?? (id && id.includes("#") ? fileOfId(id) : id), line: s?.span?.start ?? null,
      task: extra.task ?? L.symbols[id]?.task ?? L.tests[id]?.task ?? currentTask(s, L, id) ?? null, message, affected: [], ...extra });
  };
  const ref = (id) => S[id]?.name || nameOfId(id);
  const cur = (s) => ({ signature: s.signature, intent: s.intent });

  // locked symbols
  const bySigIntent = new Map();
  for (const [id, s] of Object.entries(S)) bySigIntent.set(`${s.sigHash}:${s.intentHash}`, id);
  const renamed = new Map(renamePairs(index, L).map((p) => [p.from, p.to]));
  // archived change of a done task (frozen history), memoized
  const archMemo = new Map();
  const archivedOf = (T) => { if (!archMemo.has(T)) archMemo.set(T, L.tasks[T]?.doneAt ? archivedChangeOf(L, tasks, T) : null); return archMemo.get(T); };
  const testWord = (id) => {
    const ts = statusMod?.testState?.(index, state, id);
    return !ts ? "tests unknown" : ts.state === "fresh pass" ? "tests pass fresh" : ts.state === "failing" ? "tests failing" : ts.state === "stale" ? "test runs stale (run hitl-index test)" : "no covering tests";
  };
  for (const [id, l] of Object.entries(L.symbols)) {
    const s = S[id];
    const to = renamed.get(id);
    if (!s && to) {
      const n = S[to];
      const what = [l.sigHash !== n.sigHash && "sig", l.intentHash !== n.intentHash && "intent", l.todoHash !== n.todoHash && "todo"].filter(Boolean);
      const diff = what.length ? { changed: what, approved: { signature: l.signature, intent: l.intent }, current: cur(n) } : {};
      add("warn", "RENAMED", id, `${nameOfId(id)} → ${ref(to)} (locked ${l.task}) renamed${what.length ? `, ${what.join("/")} changed` : ""}. Update the tasks md ### Symbols row and any @covers/@calls naming the old ref, then re-approve (/hitl:approve ${l.task} skeleton ${ref(to)}).`, { affected: [to], ...diff });
      continue;
    }
    if (!s) {
      const moved = bySigIntent.get(`${l.sigHash}:${l.intentHash}`);
      if (moved) add("info", "MOVED", id, `${nameOfId(id)} (locked ${l.task}) moved to ${moved}`, { affected: [moved] });
      else add("warn", "DELETED_LOCKED", id, `${nameOfId(id)} (locked ${l.task}) no longer exists`);
      continue;
    }
    const approved = { signature: l.signature, intent: l.intent };
    // re-approval goes to the task now working on it (a later task's skeleton changing a done task's symbol)
    const owner = currentTask(s, L, id) || l.task;
    const open = [...new Set([...(s.tags?.task || []), ...lockedTasks(l)])].filter((t) => !L.tasks[t]?.doneAt);
    // every lock owner done and archived, no open task tags it: frozen history; changes are claimed or accepted
    const lockOwners = lockedTasks(l);
    const arch = !open.length && lockOwners.length && lockOwners.every((t) => archivedOf(t)) ? archivedOf(l.task) || archivedOf(lockOwners.at(-1)) : null;
    if (arch) {
      const at = `(archived ${arch}, done in ${l.task})`;
      const nm = ref(id), unique = Object.values(S).filter((o) => o.name === nm).length === 1;
      const x = (accept) => ({ task: null, change: arch, fix: archivedFix(arch, unique ? nm : id, { accept }) });
      if (l.sigHash && s.sigHash !== l.sigHash)
        add("warn", "SIG_CHANGED", id, `${ref(id)} ${at} signature changed${s.callers.length ? ` — affected callers: ${s.callers.map(ref).join(", ")}` : ""}. Claim it into an open task (a signature change cannot be accepted).`, { affected: s.callers, approved, current: cur(s), ...x(false) });
      if (l.intentHash && s.intentHash !== l.intentHash)
        add("warn", "INTENT_CHANGED", id, `${ref(id)} ${at} intent changed${s.callers.length ? ` — affected callers: ${s.callers.map(ref).join(", ")}` : ""}. Claim it into an open task, or accept it (/hitl:approve ${arch} accept).`, { affected: s.callers, approved, current: cur(s), ...x(true) });
      if ((s.stub || s.todos?.length) && l.todoHash && s.todoHash !== l.todoHash)
        add("warn", "TODO_FLOW_CHANGED", id, `${ref(id)} ${at} TODO(impl) steps changed. Claim it into an open task, or accept it (/hitl:approve ${arch} accept).`, x(true));
      if (l.impl && s.tags.impl && s.tags.impl !== l.impl) add("info", "IMPL_CHANGED", id, `${ref(id)} @impl ${l.impl} → ${s.tags.impl}`, { task: null, change: arch });
      const base = bodyBaseline(L, id, lockOwners);
      if (base && base.hash !== s.bodyHash)
        add("warn", "ARCHIVED_BODY_CHANGED", id, `${ref(id)} ${at} body changed since ${base.accepted ? "it was accepted" : "the done record"}; ${testWord(id)}. Claim it into an open task, or accept it (/hitl:approve ${arch} accept).`, x(true));
      continue;
    }
    // 0.9: a symbol reopened by the human (contract change) is expected to change: info until /hitl:approve <T> skeleton
    const lvl = l.reopen ? "info" : "warn";
    const reo = l.reopen ? ` Reopened by ${l.reopen.note}: re-approve with /hitl:approve ${owner} skeleton.` : "";
    if (l.sigHash && s.sigHash !== l.sigHash)
      add(lvl, "SIG_CHANGED", id, `${ref(id)} (locked ${l.task}) signature changed since approval${s.callers.length ? ` — affected callers: ${s.callers.map(ref).join(", ")}` : ""}.${reo || ` Needs human re-approval (/hitl:approve ${owner}).`}`, { affected: s.callers, approved, current: cur(s), task: owner });
    // every owning task done (e.g. after /hitl:tidy): the change-level intent re-approval, which needs no @task tags
    const doneChange = !open.length && changeOfFile(L.tasks[owner]?.file || "").change;
    const reapprove = doneChange ? `/hitl:approve ${doneChange} intent` : `/hitl:approve ${owner}`;
    if (l.intentHash && s.intentHash !== l.intentHash)
      add(lvl, "INTENT_CHANGED", id, `${ref(id)} (locked ${l.task}) intent changed since approval${s.callers.length ? ` — affected callers: ${s.callers.map(ref).join(", ")}` : ""}.${reo || ` Needs human re-approval (${reapprove}).`}`, { affected: s.callers, approved, current: cur(s), task: owner });
    if ((s.stub || s.todos?.length) && l.todoHash && s.todoHash !== l.todoHash) add("info", "TODO_FLOW_CHANGED", id, `${ref(id)} TODO(impl) steps changed since approval`);
    if (l.impl && s.tags.impl && s.tags.impl !== l.impl) add("info", "IMPL_CHANGED", id, `${ref(id)} @impl ${l.impl} → ${s.tags.impl}`);
    const done = bodyBaseline(L, id, [l.task])?.hash;
    const rv = state.reviews?.[l.task]?.bodyHashes?.[id];
    if (open.some((t) => t !== l.task)) continue; // a later open task owns the body changes
    if ((done && done !== s.bodyHash) || (!done && rv && rv !== s.bodyHash)) add("info", "BODY_CHANGED", id, `${ref(id)} body changed since the last ${done ? "done record" : "review"}`);
  }

  // intent hygiene (one current contract per symbol): ids in prose; never blocks
  await intentLints(root, S, L, config.intent || {}, add, ref);

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
    const refs = referencesTo(index, r, (t, f) => resolveRef(index, t, f));
    if (refs.length) add("block", "DELETED_REFERENCED", r, `${nameOfId(r)} was removed but is still referenced by ${refs.map(ref).join(", ")}`, { affected: refs, task: L.symbols[r]?.task ?? null });
  }

  // locked tests
  for (const [id, l] of Object.entries(L.tests)) {
    const s = S[id];
    // owner (its @ac/@task tags, else the lock) done and archived: frozen history; claimed by tagging it into an open task
    const owner = s ? testOwner(index, L, id) || l.task : l.task;
    const arch = archivedOf(owner) && archivedOf(l.task) ? archivedOf(l.task) : null;
    const tx = (accept) => (arch ? { task: null, change: arch, fix: archivedFix(arch, nameOfId(id), { accept, test: true }) } : {});
    const at = arch ? `(archived ${arch}, locked by ${l.task})` : `(${l.task})`;
    if (!s && l.stage === "reopened") continue; // 0.9: a reopened test may be deleted (removed scenario); the tests re-lock drops it
    if (!s) { add("warn", "TEST_DELETED", id, `locked test ${nameOfId(id)} ${at} is missing${arch ? `. Restore it, or accept it (/hitl:approve ${arch} accept drops it from the lock).` : ""}`, tx(true)); continue; }
    if (l.stage !== "locked") continue;
    if ((l.bodyHash && s.bodyHash !== l.bodyHash) || (l.intentHash && s.intentHash !== l.intentHash))
      add("warn", "TEST_CHANGED", id, `locked test "${s.test?.titlePath?.at(-1) ?? s.name}" ${at} changed since it was locked${arch ? `. Claim it into an open task, or accept it (/hitl:approve ${arch} accept).` : ""}`, tx(true));
    if (s.test && s.test.mode !== "active") add("warn", "TEST_SKIPPED", id, `locked test "${s.test.titlePath.at(-1)}" ${at} is now ${s.test.mode}`, tx(false));
  }

  // declared vs actual calls (task-tagged, non-stub)
  for (const [id, s] of Object.entries(S)) {
    if (s.stub || !(s.kind === "function" || s.kind === "method") || !(s.tags?.task?.length || L.symbols[id])) continue;
    const declared = new Set((s.tags.calls || []).map((t) => resolveRef(index, t, s.file)?.id).filter(Boolean));
    for (const c of s.callees) if (!declared.has(c)) add("info", "CALLS_UNDECLARED", id, `${ref(id)} calls ${ref(c)} which is not in @calls`, { affected: [c] });
    for (const d of declared) if (!s.callees.includes(d)) add("info", "CALLS_MISSING", id, `${ref(id)} declares @calls ${ref(d)} but does not call it`, { affected: [d] });
  }

  // status tags (needs P2 status.mjs)
  const computeStatuses = statusMod?.computeStatuses;
  if (computeStatuses) {
    try {
      const st = computeStatuses(index, lock, state, config, tasks)?.symbols || {};
      for (const [id, s] of Object.entries(S)) {
        const c = st[id]?.status, t = s.tags?.status;
        if (!c || !t || c === t || c === "none") continue;
        const by = Object.entries(st[id]?.byTask || {});
        const had = by.filter(([, x]) => ORDER.indexOf(x) >= ORDER.indexOf(t)).map(([T]) => T), behind = by.filter(([, x]) => ORDER.indexOf(x) < ORDER.indexOf(t)).map(([T]) => T);
        if ((t === "verified" || t === "done") && had.length && behind.length) // e.g. done in T-2, T-3 now modifies it
          add("info", "STATUS_TAG_STALE", id, `${ref(id)} @status ${t} is ${had.join(", ")}'s; ${behind.join(", ")} now works on it (computed: ${c}); run hitl-index status --sync-tags`, { task: behind[0] });
        else if ((t === "verified" || t === "done") && ORDER.indexOf(c) < ORDER.indexOf(t) && wasRecorded(L, state, s, id, t))
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

const TASK_REF_RE = /\b(?:[A-Z]{2,5}-T\d+|T-\d+)(?:\.AC\d+)?\b/g; // PWR-T3, PWR-T3.AC2 (and pre-0.13 T-3)
const DEC_REF_RE = /\b(?:[A-Z]{2,5}-D\d+|D-\d+)\b/g;
const escRe = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Ids that do not belong in intent prose (T-n, T-n.ACk, D-n, spec ids, known change ids); text in backticks is ignored. */
export function proseIds(text, { changeIds = [], allow = [] } = {}) {
  const t = String(text || "").replace(/`[^`\n]*`/g, " ");
  const rxs = [TASK_REF_RE, DEC_REF_RE, SPECREF_G()];
  if (changeIds.length) rxs.push(new RegExp(`(?<![\\w-])(?:${changeIds.map(escRe).join("|")})(?![\\w-])`, "g"));
  const out = [];
  for (const rx of rxs) for (const m of t.matchAll(new RegExp(rx.source, "g"))) if (!out.includes(m[0]) && !allow.some((a) => a.test(m[0]))) out.push(m[0]);
  return out;
}

async function intentLints(root, S, L, cfg, add, ref) {
  const idRefs = cfg.idRefs ?? "warn";
  if (idRefs === "off") return;
  let changeIds = [];
  try { changeIds = [...new Set((await (await import("./changes.mjs")).listChanges(root)).map((c) => c.id))]; } catch { /* no change ids */ }
  const allow = [];
  for (const a of cfg.idAllow || []) { try { allow.push(new RegExp(a)); } catch { /* bad pattern: ignored */ } }
  for (const [id, s] of Object.entries(S)) {
    if (s.test || s.kind === "test" || s.kind === "suite" || !(s.tags?.task?.length || L.symbols[id])) continue;
    const l = L.symbols[id];
    const draft = !l || l.intentHash !== s.intentHash;
    const ids = proseIds([s.intent, ...(s.todos || []), ...(s.flowSteps || [])].join("\n"), { changeIds, allow });
    if (ids.length) add(idRefs === "info" || !draft ? "info" : "warn", "INTENT_TASK_REF", id, `${ref(id)} intent/steps mention ${ids.join(", ")}: ids live in tags (@task, @dec, tests' @ac), not prose; rewrite as the current contract.`, { ids });
  }
}

/** True when tooling legitimately recorded `@status <t>` for this symbol (done approval / review), i.e. not forged by hand. */
export function wasRecorded(lock, state, sym, id, t) {
  const ts = [...new Set([...(sym?.tags?.task || []), ...lockedTasks(lock?.symbols?.[id])])];
  if (t === "done") return ts.some((T) => !!(lock?.tasks?.[T]?.doneAt && lock.tasks[T].doneBodyHashes?.[id]));
  if (t === "verified") return ts.some((T) => !!state?.reviews?.[T]?.bodyHashes?.[id]);
  return false;
}
