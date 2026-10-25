// P2 — `status --sync-tags`: rewrite @status values in source docs + tasks md status/checkboxes (§E.6, §B.5).
import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { loadApi, readLock, writeFileAtomic } from "./lock.mjs";
import { readState } from "./state.mjs";
import { computeStatuses, isFresh } from "./status.mjs";

const TAG_STATUSES = new Set(["skeleton", "wip", "red", "green", "verified", "done"]);

/** Split into [line, eol] pairs, preserving line endings. */
function splitLines(text) {
  const out = []; const re = /([^\r\n]*)(\r\n|\n|\r|$)/g; let m;
  while ((m = re.exec(text))) { out.push([m[1], m[2]]); if (!m[2]) break; }
  return out;
}
const join2 = (lines) => lines.map(([l, e]) => l + e).join("");

/**
 * Replace the @status value inside docSpan (1-based inclusive lines). Searches the span, then ±1 line.
 * Returns the new text, or null if no @status token was found.
 */
export function rewriteStatusTag(text, docSpan, newStatus) {
  if (!docSpan) return null;
  const lines = splitLines(text);
  const lo = Math.max(1, docSpan.start), hi = Math.min(lines.length, docSpan.end);
  const order = [];
  for (let n = lo; n <= hi; n++) order.push(n);
  order.push(lo - 1, hi + 1);
  for (const n of order) {
    if (n < 1 || n > lines.length) continue;
    const [l] = lines[n - 1];
    const re = /(^|\s)@status(\s+)([A-Za-z-]+)/;
    if (re.test(l)) {
      const nl = l.replace(re, (m, a, ws, v) => `${a}@status${ws}${newStatus}`);
      if (nl === l) return text;
      lines[n - 1][0] = nl;
      return join2(lines);
    }
  }
  return null;
}

/**
 * Rewrite one tasks md text: meta `status:` per task and checkboxes.
 * info: {[T]: {status, acDone:{[acId]:bool}, symDone:{[order]:bool}}}
 */
export function rewriteTasksMd(text, info) {
  const lines = splitLines(text);
  let T = null; let section = null;
  for (const ln of lines) {
    const l = ln[0];
    let m;
    if ((m = /^## (T-\d+) /.exec(l))) { T = m[1]; section = null; continue; }
    if (/^## /.test(l)) { T = null; section = null; continue; }
    if ((m = /^### (.+)$/.exec(l))) { section = m[1].trim().toLowerCase(); continue; }
    if (!T || !info[T]) continue;
    const I = info[T];
    if (/^- prio: P[0-3] \|/.test(l) && I.status) { ln[0] = l.replace(/\| status: [a-z-]+$/, `| status: ${I.status}`); continue; }
    if (section === "acceptance criteria" && (m = /^- \[( |x)\] (T-\d+\.AC\d+) /.exec(l)) && I.acDone && m[2] in I.acDone) {
      ln[0] = l.replace(/^- \[( |x)\]/, `- [${I.acDone[m[2]] ? "x" : " "}]`); continue;
    }
    if (section === "symbols" && (m = /^(\d+)\. \[( |x)\] /.exec(l)) && I.symDone && m[1] in I.symDone) {
      ln[0] = l.replace(/^(\d+)\. \[( |x)\]/, `$1. [${I.symDone[m[1]] ? "x" : " "}]`);
    }
  }
  return join2(lines);
}

/** Compute per-task checkbox info from statuses. Pure. */
export function tasksInfo(index, state, statuses, tasks, resolve) {
  const info = {};
  for (const task of tasks) {
    const st = statuses.tasks?.[task.id]; if (!st) continue;
    const I = { status: st.status, acDone: {}, symDone: {} };
    for (const ac of task.acs || []) {
      const tests = Object.values(index.symbols).filter((s) => s.kind === "test" && (s.tags?.ac || []).includes(ac.id));
      I.acDone[ac.id] = tests.length > 0 && tests.every((t) => {
        const r = state.runs?.[t.id];
        if (!r || r.outcome !== "pass" || r.testBodyHash !== t.bodyHash) return false;
        const covered = t.test?.coversResolved || [];
        return covered.every((c) => !index.symbols[c] || isFresh(index, state, t.id, c));
      });
    }
    for (const sym of task.symbols || []) {
      const id = resolve(sym.ref, sym.file);
      I.symDone[String(sym.order)] = !!id && ["verified", "done"].includes(statuses.symbols?.[id]?.status);
    }
    info[task.id] = I;
  }
  return info;
}

/**
 * synctags(root, {task?, config?}) → {files:[rel], tags:[{id, from, to}], tasksFiles:[rel]}
 */
export async function synctags(root, opts = {}) {
  const api = await loadApi();
  if (!api) throw new Error("hitl-index core (lib/api.mjs) not available");
  const config = opts.config || (await api.loadConfig(root));
  let index = await api.readIndex(root);
  if (!index) return { files: [], tags: [], tasksFiles: [] };
  const lock = await readLock(root); const state = await readState(root);
  const tasks = (await api.readTasks(root).catch(() => [])) || [];
  const statuses = computeStatuses(index, lock, state, config, tasks);
  const inScope = (s) => !opts.task || (s.tags?.task || []).includes(opts.task) || lock.symbols?.[s.id]?.task === opts.task;

  const byFile = new Map(); const changes = [];
  for (const [id, st] of Object.entries(statuses.symbols)) {
    const S = index.symbols[id];
    if (!S || !S.tags?.status || !TAG_STATUSES.has(st.status) || S.tags.status === st.status || !inScope(S)) continue;
    if (!byFile.has(S.file)) byFile.set(S.file, []);
    byFile.get(S.file).push({ S, to: st.status });
  }
  const touched = [];
  for (const [rel, list] of byFile) {
    const abs = join(root, rel);
    let text; try { text = await fsp.readFile(abs, "utf8"); } catch { continue; }
    let cur = text;
    for (const { S, to } of list.sort((a, b) => (b.S.docSpan?.start || 0) - (a.S.docSpan?.start || 0))) {
      const nt = rewriteStatusTag(cur, S.docSpan, to);
      if (nt !== null && nt !== cur) { cur = nt; changes.push({ id: S.id, from: S.tags.status, to }); }
    }
    if (cur !== text) { await writeFileAtomic(abs, cur); touched.push(rel); }
  }

  const resolve = (ref, file) => { try { const r = api.resolveRef(index, ref, file); return r?.id || null; } catch { return null; } };
  const info = tasksInfo(index, state, statuses, opts.task ? tasks.filter((t) => t.id === opts.task) : tasks, resolve);
  const tasksFiles = [];
  const files = [...new Set(tasks.filter((t) => info[t.id]).map((t) => t.file))];
  for (const rel of files) {
    const abs = rel.startsWith("/") ? rel : join(root, rel);
    let text; try { text = await fsp.readFile(abs, "utf8"); } catch { continue; }
    const nt = rewriteTasksMd(text, info);
    if (nt !== text) { await writeFileAtomic(abs, nt); tasksFiles.push(rel); }
  }
  if (touched.length) { try { await api.updateIndex(root, touched, {}); } catch { /* reported by next index */ } }
  return { files: touched, tags: changes, tasksFiles, statuses };
}
