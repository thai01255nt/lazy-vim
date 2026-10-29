// `hitl-index strip`: remove the hitl bookkeeping tags (@task @impl @status @prio @dec @risk) from the docs of done tasks.
// None of them is in the locked contract (intentHash = prose + @calls + @concurrency), and task membership survives through
// the task's `### Symbols` rows, so lock, drift and statuses stay the same. Every write is verified by a reindex and rolled
// back on any hash or status change. Tests are never touched (their @ac/@covers are the AC coverage).
import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { tagLine } from "./tags.mjs";
import { loadApi, readLock, writeFileAtomic, taskSymbolIds, resolveWith, isTest } from "./lock.mjs";
import { readState } from "./state.mjs";
import { computeStatuses } from "./status.mjs";

export const STRIP_TAGS = new Set(["task", "impl", "status", "prio", "dec", "risk"]);
const PREFIX = /^\s*(?:\*(?!\/)\s?|#\s?|\/\/\/?\s?)?/; // JSDoc " * ", "# ", "// "
const DELIM = /\/\*\*|\*\/|"""|'''/;
const EMPTY = /^\s*(?:\/\*\*|\*\/|\*|"""|'''|#|\/\/\/?|\s)*$/;

function splitLines(text) {
  const out = []; const re = /([^\r\n]*)(\r\n|\n|\r|$)/g; let m;
  while ((m = re.exec(text))) { out.push([m[1], m[2]]); if (!m[2]) break; }
  return out;
}

/**
 * Strip the bookkeeping tags inside one doc span (1-based inclusive lines). A tag line keeps its other tags
 * (`@calls`, `@concurrency`); a line left empty is removed. `dropBlock` (doc comment before the symbol, not a Python
 * docstring, which is part of the body): a doc left with only delimiters is removed whole.
 * Returns {text, removed:[tag…], skipped:string|null}.
 */
export function stripDocTags(text, docSpan, { dropBlock = false } = {}) {
  const lines = splitLines(text);
  const lo = docSpan.start, hi = Math.min(lines.length, docSpan.end);
  const removed = []; const drop = new Set(); let skipped = null;
  for (let n = lo; n <= hi; n++) {
    const l = lines[n - 1][0];
    const pre = PREFIX.exec(l)[0];
    const pairs = tagLine(l.slice(pre.length));
    if (!pairs || !pairs.some(([t]) => STRIP_TAGS.has(t))) continue;
    if (DELIM.test(l)) { skipped = `line ${n}: tags share a line with the comment delimiters`; continue; }
    const keep = pairs.filter(([t]) => !STRIP_TAGS.has(t));
    removed.push(...pairs.filter(([t]) => STRIP_TAGS.has(t)).map(([t]) => t));
    if (keep.length) lines[n - 1][0] = pre + keep.map(([t, v]) => `@${t} ${v}`).join(" ");
    else drop.add(n);
  }
  if (!removed.length) return { text, removed, skipped };
  if (dropBlock && lines.slice(lo - 1, hi).every(([l], i) => drop.has(lo + i) || EMPTY.test(l))) for (let n = lo; n <= hi; n++) drop.add(n);
  return { text: lines.filter((_, i) => !drop.has(i + 1)).map(([l, e]) => l + e).join(""), removed, skipped };
}

async function snapshot(api, root, config) {
  const index = (await api.readIndex(root)) || { symbols: {} };
  const lock = await readLock(root); const state = await readState(root);
  const tasks = (await api.readTasks(root).catch(() => [])) || [];
  return { index, lock, state, tasks, statuses: computeStatuses(index, lock, state, config, tasks) };
}

/**
 * strip(root, {target: T-id | change-id, dryRun, config}) →
 * {ok, error?, tasks:[ids], notDone:[{id,status}], symbols:[{id,file,removed}], skipped:[{id,reason}], files:[rel], verified}
 * Only tasks whose computed status is `done`. A symbol is skipped when another of its @task ids is not done, or when
 * it is reachable only through its @task tag (not in the task's `### Symbols` rows, not a class): stripping would drop it.
 */
export async function strip(root, { target, dryRun = false, config } = {}) {
  const api = await loadApi();
  if (!api) throw new Error("hitl-index core (lib/api.mjs) not available");
  config ||= await api.loadConfig(root);
  await api.updateIndex(root, null, { changedOnly: true });
  const before = await snapshot(api, root, config);
  const { index, statuses } = before;
  const st = (id) => statuses.tasks[id]?.status ?? "todo";
  const scope = before.tasks.filter((t) => t.id === target || t.change === target);
  const out = { ok: false, tasks: [], notDone: [], symbols: [], skipped: [], files: [], verified: false };
  if (!scope.length) return { ...out, error: `no task or change "${target}"` };
  const done = scope.filter((t) => st(t.id) === "done");
  out.tasks = done.map((t) => t.id);
  out.notDone = scope.filter((t) => st(t.id) !== "done").map((t) => ({ id: t.id, status: st(t.id) }));
  if (!done.length) return { ...out, error: `nothing to strip: ${out.notDone.map((t) => `${t.id} is ${t.status}`).join(", ")} (only done tasks)` };

  const picks = new Map(); // id -> task
  for (const task of done) {
    const rows = new Set((task.symbols || []).map((s) => resolveWith(api, index, s.ref, s.file)?.id).filter(Boolean));
    for (const id of taskSymbolIds(index, task.id, task, api)) {
      const S = index.symbols[id];
      if (!S?.docSpan || isTest(S) || picks.has(id) || !Object.entries(S.tags || {}).some(([k, v]) => STRIP_TAGS.has(k) && (Array.isArray(v) ? v.length : v != null))) continue;
      const open = (S.tags.task || []).filter((t) => st(t) !== "done");
      if (open.length) { out.skipped.push({ id, reason: `also @task ${open.map((t) => `${t} (${st(t)})`).join(", ")}` }); continue; }
      if (!rows.has(id) && S.kind !== "class") { out.skipped.push({ id, reason: `not in ### Symbols of ${task.id}: removing @task would drop it from the task` }); continue; }
      picks.set(id, task.id);
    }
  }

  const byFile = new Map();
  for (const id of picks.keys()) { const S = index.symbols[id]; if (!byFile.has(S.file)) byFile.set(S.file, []); byFile.get(S.file).push(S); }
  const originals = new Map();
  for (const [rel, list] of byFile) {
    const abs = join(root, rel);
    const text = await fsp.readFile(abs, "utf8");
    let cur = text;
    for (const S of list.sort((a, b) => b.docSpan.start - a.docSpan.start)) {
      const r = stripDocTags(cur, S.docSpan, { dropBlock: S.docSpan.end < S.span.start });
      if (r.skipped) out.skipped.push({ id: S.id, reason: r.skipped });
      if (r.removed.length) { cur = r.text; out.symbols.push({ id: S.id, file: rel, removed: [...new Set(r.removed)] }); }
    }
    if (cur !== text) { originals.set(rel, text); if (!dryRun) await writeFileAtomic(abs, cur); }
  }
  out.files = [...originals.keys()].sort();
  if (dryRun || !out.files.length) return { ...out, ok: true };

  // verify: same contract hashes for every stripped symbol, same status for every task; else roll back
  await api.updateIndex(root, out.files, {});
  const after = await snapshot(api, root, config);
  const problems = [];
  for (const { id } of out.symbols) {
    const a = index.symbols[id], b = after.index.symbols[id];
    if (!b) { problems.push(`${id} not found after reindex`); continue; }
    for (const k of ["sigHash", "intentHash", "bodyHash"]) if (a[k] !== b[k]) problems.push(`${id} ${k} changed`);
  }
  for (const [id, s] of Object.entries(statuses.tasks)) if (after.statuses.tasks[id]?.status !== s.status) problems.push(`${id} status ${s.status} → ${after.statuses.tasks[id]?.status}`);
  if (problems.length) {
    for (const [rel, text] of originals) await writeFileAtomic(join(root, rel), text);
    await api.updateIndex(root, out.files, {});
    return { ...out, error: `rolled back, nothing changed: ${problems.join("; ")}` };
  }
  return { ...out, ok: true, verified: true };
}
