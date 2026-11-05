// Notes inbox of a change (0.9): `.hitl/changes/<id>/notes.md`, written only by hitl-index (note add|apply and the
// /hitl:approve forms --ack, reopen, dismiss, defer). A requirement or design change stated mid-change is noted here
// first; an open note blocks the approvals of the tasks it touches until it is applied, acked, dismissed or deferred.
// Pure parse/render/match helpers + small IO. Never imports lock.mjs (lock.mjs imports this module).
import { createHash } from "node:crypto";
import { join } from "node:path";
import { readText, writeTextAtomic, withIndexLock } from "./fsutil.mjs";
import { parseId } from "./specids.mjs";

export const NOTE_KINDS = ["spec", "design", "order", "recheck"];
/** Kinds a person (or Claude after the user's Y) may add; `recheck` is written only by `note apply`. */
export const ADD_KINDS = ["spec", "design", "order"];
export const IMPACT_CLASSES = ["wording", "behaviour", "contract", "scenario", "requirement"];
/** Statuses that block approvals (and archive). */
export const BLOCKING = new Set(["open", "reopen pending"]);
export const NOTES_FILE = "notes.md";
const HEADER_NOTE = "> Written by hitl-index (note add, note apply, /hitl:approve). Do not edit by hand.";

export const isNoteId = (s) => /^N-\d+$/.test(String(s || ""));
const noteNum = (id) => Number(/^N-(\d+)$/.exec(id)?.[1] ?? 0);
export const shortHash = (s) => createHash("sha256").update(String(s)).digest("hex").slice(0, 12);

/** Kind of a ref: task | ac | spec | decision | symbol. */
export function refKind(ref) {
  const r = String(ref || "");
  if (/^T-\d+$/.test(r)) return "task";
  if (/^T-\d+\.AC\d+$/.test(r)) return "ac";
  if (/^D-\d+$/.test(r)) return "decision";
  if (parseId(r)) return "spec";
  return "symbol";
}

// ---------------------------------------------------------------- parse / render
const clean = (s) => String(s ?? "").replace(/[()]/g, "").replace(/\s+/g, " ").trim();

/** parseNotes(text) -> {title, notes:[note]}; note = {id, title, kind, refs, refTitles, status, deferredTo, from, at, acks, reason, resolved, text, meta}. */
export function parseNotes(text) {
  const out = { title: null, notes: [] };
  let cur = null, body = null;
  const flush = () => { if (cur) { cur.text = body.join("\n").trim(); out.notes.push(cur); } cur = null; body = null; };
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/\s+$/, "");
    let m;
    if (!cur && out.title === null && (m = line.match(/^# (.+)$/))) { out.title = m[1].trim(); continue; }
    if ((m = line.match(/^## (N-\d+)(?: (.*))?$/))) {
      flush();
      cur = { id: m[1], title: (m[2] || "").trim(), kind: null, refs: [], refTitles: {}, status: "open", deferredTo: null, from: null, at: null, acks: [], reason: null, resolved: null, text: "", meta: {} };
      body = [];
      continue;
    }
    if (!cur) continue;
    if ((m = line.match(/^<!-- hitl (\{.*\}) -->$/))) { try { cur.meta = JSON.parse(m[1]); } catch { cur.meta = {}; } continue; }
    if ((m = line.match(/^- ([a-z]+): ?(.*)$/)) && !body.some((l) => l.trim())) {
      const [, k, v] = m;
      if (k === "kind") cur.kind = v.trim();
      else if (k === "refs") {
        for (const x of v.matchAll(/([^\s,()]+)(?:\s*\(([^)]*)\))?/g)) {
          if (x[1] === "none" || x[1] === "—") continue;
          cur.refs.push(x[1]);
          if (x[2]) cur.refTitles[x[1]] = x[2].trim();
        }
      } else if (k === "status") {
        const d = v.match(/^deferred → (\S+)(?: \((N-\d+) there\))?/);
        if (d) { cur.status = "deferred"; cur.deferredTo = { change: d[1], note: d[2] || null }; }
        else cur.status = v.trim();
      } else if (k === "from") {
        const i = v.lastIndexOf(" · ");
        if (i >= 0) { cur.from = v.slice(0, i).trim(); cur.at = v.slice(i + 3).trim(); } else cur.from = v.trim();
      } else if (k === "acked") {
        const [task, at] = v.split(" · ").map((s) => s.trim());
        if (/^T-\d+$/.test(task)) cur.acks.push({ task, at: at || null });
      } else if (k === "reason") cur.reason = v.trim();
      else if (k === "resolved") cur.resolved = v.trim();
      // `impact:` and `reopens:` are rendered from meta; they are read back from meta only
      continue;
    }
    body.push(line);
  }
  flush();
  return out;
}

/** Readable `reopens:` line of a recheck note. */
export function reopensLine(reopen) {
  if (!reopen?.length) return "nothing (confirm no impact)";
  return reopen.map((r) => {
    if (!r.stage) return `${r.task} nothing to unlock`;
    const what = r.stage === "skeleton" ? [...(r.symbols || []).map((s) => s.slice(s.indexOf("#") + 1)), ...(r.acs || [])] : (r.acs || []);
    const extra = r.newAc?.length ? `new AC for ${r.newAc.join(", ")}` : "";
    return `${r.task} ${r.stage} (${[...what, extra].filter(Boolean).join(", ") || "—"})`;
  }).join(" · ");
}

/** renderNotes(changeId, notes) -> notes.md text. */
export function renderNotes(changeId, notes) {
  const L = [`# Notes — ${changeId}`, "", HEADER_NOTE];
  for (const n of [...notes].sort((a, b) => noteNum(a.id) - noteNum(b.id))) {
    L.push("", `## ${n.id} ${clean(n.title) || "(untitled)"}`);
    L.push(`- kind: ${n.kind}`);
    L.push(`- refs: ${n.refs.length ? n.refs.map((r) => (n.refTitles?.[r] ? `${r} (${clean(n.refTitles[r])})` : r)).join(", ") : "none"}`);
    const st = n.status === "deferred" && n.deferredTo ? `deferred → ${n.deferredTo.change}${n.deferredTo.note ? ` (${n.deferredTo.note} there)` : ""}` : n.status;
    L.push(`- status: ${st}`);
    L.push(`- from: ${n.from || "unknown"}${n.at ? ` · ${n.at}` : ""}`);
    for (const a of n.acks || []) L.push(`- acked: ${a.task}${a.at ? ` · ${a.at}` : ""}`);
    if (n.reason) L.push(`- reason: ${n.reason.replace(/\s+/g, " ")}`);
    if (n.resolved) L.push(`- resolved: ${n.resolved.replace(/\s+/g, " ")}`);
    if (n.meta?.impact?.length) L.push(`- impact: ${n.meta.impact.map((x) => `${x.ref} ${x.class}`).join(", ")}`);
    if (n.kind === "recheck") L.push(`- reopens: ${reopensLine(n.meta?.reopen)}`);
    if (n.text) L.push("", n.text.trim());
    const meta = Object.fromEntries(Object.entries(n.meta || {}).filter(([, v]) => v && (typeof v !== "object" || Object.keys(v).length)));
    if (Object.keys(meta).length) L.push("", `<!-- hitl ${JSON.stringify(meta)} -->`);
  }
  return L.join("\n") + "\n";
}

export function nextNoteId(notes) { return `N-${Math.max(0, ...notes.map((n) => noteNum(n.id))) + 1}`; }

/** Title from the text: first sentence, max 60 chars. */
export function titleOf(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  const first = (s.match(/^(.+?[.!?])(\s|$)/)?.[1] || s).replace(/[.!?]$/, "");
  return first.length > 60 ? first.slice(0, 59).trimEnd() + "…" : first;
}

// ---------------------------------------------------------------- refs: validation + base hashes
/**
 * validateRefs(refs, {view, resolveSpecRef, design, tasks, index, resolve}) -> {errors:[msg], titles:{ref:title}, symbols:{ref:id}}.
 * Spec ids resolve in the change's effective view; D-n in its design; T-n / T-n.ACk in its tasks; anything else is a
 * symbol ref that must resolve to exactly one index symbol.
 */
export function validateRefs(refs, ctx) {
  const errors = [], titles = {}, symbols = {};
  const tasks = ctx.tasks || [];
  for (const ref of refs) {
    const k = refKind(ref);
    if (k === "spec") {
      const r = ctx.resolveSpecRef(ctx.view, ref);
      if (r.status !== "ok") errors.push(`${ref}: ${r.status === "unknown" ? "unknown spec id" : `${r.status} spec id`} in this change`);
      else titles[ref] = (r.scenario || r.block)?.title ?? null;
    } else if (k === "decision") {
      const d = (ctx.design?.decisions || []).find((x) => x.id === ref);
      if (!d) errors.push(`${ref}: no such decision in this change's design.md`);
      else titles[ref] = d.decision;
    } else if (k === "task") {
      const t = tasks.find((x) => x.id === ref);
      if (!t) errors.push(`${ref}: not a task of this change`); else titles[ref] = t.title;
    } else if (k === "ac") {
      const t = tasks.find((x) => ref.startsWith(x.id + "."));
      const ac = t?.acs.find((a) => a.id === ref);
      if (!ac) errors.push(`${ref}: not an AC of this change`); else titles[ref] = ac.text.length > 50 ? ac.text.slice(0, 49) + "…" : ac.text;
    } else {
      const r = ctx.resolve ? ctx.resolve(ref) : null;
      if (!r) errors.push(`${ref}: not a spec id, D-n, task, AC or known symbol`);
      else if (r.ambiguous) errors.push(`${ref}: ambiguous symbol (${r.ambiguous.join(", ")})`);
      else symbols[ref] = r.id;
    }
  }
  return { errors, titles, symbols };
}

/** Hash of the doc block behind a spec or decision ref (null for other refs or unknown ids). */
export function refHash(ref, { view, findInView, design }) {
  const k = refKind(ref);
  if (k === "decision") {
    const d = (design?.decisions || []).find((x) => x.id === ref);
    return d ? shortHash([d.decision, d.status, d.supersededBy || ""].join("|")) : null;
  }
  if (k !== "spec" || !view) return null;
  const hit = findInView(view, ref);
  if (!hit) return null;
  if (hit.scenario) return shortHash(hit.scenario.title + "\n" + JSON.stringify(hit.scenario.steps || []));
  return shortHash(hit.block.text || "");
}

/** Base hashes of a note's spec/decision refs. */
export function refHashes(refs, ctx) {
  const out = {};
  for (const r of refs) { const h = refHash(r, ctx); if (h) out[r] = h; }
  return out;
}

/**
 * Apply guard: a spec/design note may be applied only when one of its spec or decision refs changed since it was noted
 * (a removed block counts as changed). Order notes and refs that are symbols, tasks or ACs are not checked.
 * Returns {checked, changed:[refs]}.
 */
export function changedSinceNoted(note, ctx) {
  if (!["spec", "design"].includes(note.kind)) return { checked: false, changed: [] };
  const base = note.meta?.base || {};
  const refs = note.refs.filter((r) => ["spec", "decision"].includes(refKind(r)) && base[r]);
  if (!refs.length) return { checked: false, changed: [] };
  return { checked: true, changed: refs.filter((r) => refHash(r, ctx) !== base[r]) };
}

// ---------------------------------------------------------------- blocking
/** True when spec ref `a` (from a note) and spec ref `b` (from an AC) touch: same id, or a requirement and its scenario. */
export function specRefsTouch(a, b) {
  if (a === b) return true;
  const x = parseId(a), y = parseId(b);
  if (!x || !y) return false;
  if (x.kind === "R" && y.kind === "S") return y.req === a;
  if (x.kind === "S" && y.kind === "R") return x.req === b;
  return false;
}

/**
 * Refs of `note` that touch a task. ctx: {task:{id, acs:[{id, reqs}], decisions}, symIds:Set|[], index, resolve?}.
 * `symIds` = the task's symbols (### Symbols rows, @task tags) plus the symbols it locked.
 */
export function noteHitsTask(note, ctx) {
  const t = ctx.task;
  if (!t) return [];
  // a recheck note blocks exactly the tasks its computed set lists (the amend's impact on locked work)
  if (note.kind === "recheck" && Array.isArray(note.meta?.reopen)) return note.meta.reopen.some((r) => r.task === t.id) ? ["recheck"] : [];
  const syms = ctx.symIds instanceof Set ? ctx.symIds : new Set(ctx.symIds || []);
  const acIds = new Set((t.acs || []).map((a) => a.id));
  const acRefs = (t.acs || []).flatMap((a) => a.reqs || []);
  const decs = new Set(t.decisions || []);
  const via = [];
  for (const ref of note.refs || []) {
    const k = refKind(ref);
    let hit = false;
    if (k === "task") hit = ref === t.id;
    else if (k === "ac") hit = acIds.has(ref);
    else if (k === "spec") hit = acRefs.some((r) => specRefsTouch(ref, r));
    else if (k === "decision") hit = decs.has(ref) || [...syms].some((id) => (ctx.index?.symbols?.[id]?.tags?.dec || []).includes(ref));
    else {
      const id = note.meta?.symbols?.[ref] || ctx.resolve?.(ref)?.id;
      hit = !!id && syms.has(id);
    }
    if (hit) via.push(ref);
  }
  return via;
}

/**
 * Notes that block a task's approvals: [{note, via}] (status open or reopen pending, refs touch the task, not acked for
 * it); `acked`: [{note, via}] touched but acked; `warn`: open notes without refs (warn only).
 */
export function blockingNotes(notes, ctx) {
  const block = [], acked = [], warn = [];
  for (const n of notes || []) {
    if (!BLOCKING.has(n.status)) continue;
    if (!n.refs.length) { warn.push({ note: n, via: [] }); continue; }
    const via = noteHitsTask(n, ctx);
    if (!via.length) continue;
    if ((n.acks || []).some((a) => a.task === ctx.task.id) && n.status === "open") acked.push({ note: n, via });
    else block.push({ note: n, via });
  }
  return { block, acked, warn };
}

/** Command that resolves a note (apply path), for messages and routing. */
export function applyCommand(changeId, note) {
  if (note.status === "reopen pending") return `/hitl:approve ${changeId} reopen ${note.id}`;
  if (note.kind === "design") return `/hitl:design ${changeId} amend ${note.id}`;
  if (note.kind === "order") return `/hitl:tasks ${changeId} update`;
  return `/hitl:plan ${changeId} amend ${note.id}`;
}

/** Counts by status. */
export function noteCounts(notes) {
  const c = { open: 0, reopenPending: 0, applied: 0, dismissed: 0, deferred: 0, total: 0 };
  for (const n of notes || []) {
    c.total++;
    if (n.status === "open") c.open++;
    else if (n.status === "reopen pending") c.reopenPending++;
    else if (n.status === "applied") c.applied++;
    else if (n.status === "dismissed") c.dismissed++;
    else if (n.status === "deferred") c.deferred++;
  }
  return c;
}

// ---------------------------------------------------------------- IO
export const notesRel = (changeDir) => `${changeDir}/${NOTES_FILE}`;

/** Notes of a change folder ({dir}); [] when the file does not exist. */
export async function readNotes(root, changeDir) {
  const text = await readText(join(root, notesRel(changeDir)), null);
  return text === null ? [] : parseNotes(text).notes;
}

/** Read-modify-write notes.md of a change under the index lock. fn(notes) returns the value to return. */
export async function updateNotes(root, changeDir, changeId, fn) {
  return withIndexLock(root, async () => {
    const notes = await readNotes(root, changeDir);
    const out = await fn(notes);
    await writeTextAtomic(join(root, notesRel(changeDir)), renderNotes(changeId, notes));
    return out;
  });
}

/** Notes of every active change: [{change, dir, notes}] (changes without notes.md are omitted). */
export async function readActiveNotes(root) {
  const { listChanges } = await import("./changes.mjs");
  const out = [];
  for (const e of await listChanges(root, { archived: false }).catch(() => [])) {
    const notes = await readNotes(root, e.dir);
    if (notes.length) out.push({ change: e.id, dir: e.dir, notes });
  }
  return out;
}

export const todayIso = (d = new Date()) => d.toISOString().slice(0, 10);
