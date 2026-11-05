// `hitl-index intents`: read-only intent hygiene report for the symbols of a change or task ("one current contract per
// symbol"). Per symbol: ids in prose (drift proseIds), sentences that restate a collaborator's contract (token overlap),
// growth across tasks/approvals (lock intentLog, else task count) and pseudo-code / dead step comments. Writes nothing.
import { promises as fsp } from "node:fs";
import { join } from "node:path";
import { proseIds } from "./drift.mjs";
import { collaboratorsOf } from "./context.mjs";
import { DEC_ID_SRC, SPECREF_SRC, TASK_ID_RE, TASK_REF_SRC } from "./specids.mjs";
import { taskSymbolIds, lockedTasks, resolveWith, isTest, intentLines, loadApi, readLock } from "./lock.mjs";

export const SCHEMA = "hitl.intents/1";
export const DEFAULT_RESTATE_OVERLAP = 0.3;
/** Fewer content tokens than this and a sentence is too short to call a restatement. */
const MIN_TOKENS = 4;
/** A sentence using a term a collaborator defines (`TERM: …`) restates that definition when it shares this many more
 *  content tokens with it (the term's own tokens not counted) and at least half the overlap threshold. */
const TERM_SHARED = 3;

const STOP = new Set(("a an the and or but nor of to in on at by for with from into onto as is are was were be been being it its this that these those " +
  "there their then than so if else when while which who whom whose what where how not no any each every all both either neither one two only " +
  "also just same other another such own very can could may might must shall should will would do does did done has have had having here " +
  "per via up out off over under about after before again once more most less few many much some there via vs e g i e etc").split(/\s+/));

const ID_TEXT = new RegExp(`\\b(?:${TASK_REF_SRC}|${DEC_ID_SRC}|T-\\d+(?:\\.AC\\d+)?|D-\\d+|${SPECREF_SRC})\\b`, "g");
/** Normalized content tokens of a text: ids removed (reported apart), lower-cased word pieces, stopwords and 1-char
 *  pieces dropped, plural "s" folded. */
export function tokens(text) {
  const out = new Set();
  for (let w of String(text || "").replace(ID_TEXT, " ").toLowerCase().split(/[^a-z0-9]+/)) {
    if (w.length < 2 || STOP.has(w)) continue;
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) w = w.slice(0, -1);
    out.add(w);
  }
  return out;
}

export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Prose sentences of an intent: annotation/tag lines (`@…`) dropped, wrapped lines joined, split at sentence ends. */
export function sentences(intent) {
  const prose = String(intent || "").split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("@")).join(" ");
  return prose.split(/(?<=[.!?;])\s+(?=[A-Z(`"'])/).map((s) => s.trim()).filter(Boolean);
}

/** UPPER_SNAKE terms an intent defines (`TERM: …`), e.g. the statuses of an enum. */
const definedTerms = (intent) => [...String(intent || "").matchAll(/(?<![\w$])([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+|[A-Z]{3,}):\s/g)].map((m) => m[1]);

const STEP_RE = /^\s*(?:#|--|\/\/)\s*(\d+)\.\s+(.*\S)\s*$/;
const PSEUDO = [
  [/(?<![=<>!~])[\w\])]\s*(?:=|\+=|-=|:=)\s*[\w"'({[\-]/, "assignment"],
  [/==|!=|~=|>=|<=|\s[<>]\s/, "comparison"],
  [/[A-Za-z_$][\w$.:]*\(/, "call syntax"],
];
/** A step's label without its bracketed reasons (a bracket after a space, not call parens): "check alive (an ended
 * context wins)" → "check alive". */
const labelOf = (text) => { let t = text, p; do { p = t; t = t.replace(/(^|\s)(?:\([^()]*\)|\[[^\[\]]*\])/g, "$1"); } while (t !== p); return t.trim(); };
/** Why a function-body step comment reads as pseudo-code instead of an intent label; null when it is fine.
 * Only the label is judged: a short reason in brackets after it is allowed. */
export function pseudoReason(text) {
  const label = labelOf(text);
  for (const [re, why] of PSEUDO) if (re.test(label)) return why;
  const words = label.split(/\s+/).filter(Boolean).length;
  return words > 10 ? `${words} words` : null;
}

/**
 * Step comments of a symbol from its file text (1-based lines): numbered `#`/`--`/`//` comments inside its span, outside
 * its doc and outside nested symbols. Inside a class/enum body every numbered comment is dead (bodies there are not
 * flows); inside a function only pseudo-code ones are reported.
 */
export function stepFindings(sym, lines, children = []) {
  if (!sym?.span || !lines) return [];
  const out = [];
  const inside = (n, sp) => sp && n >= sp.start && n <= sp.end;
  const classy = sym.kind === "class";
  for (let n = sym.span.start; n <= Math.min(sym.span.end, lines.length); n++) {
    if (inside(n, sym.docSpan) || children.some((c) => inside(n, c))) continue;
    const m = STEP_RE.exec(lines[n - 1]);
    if (!m) continue;
    const why = classy ? "numbered comment in a class/enum body (dead after implementation)" : pseudoReason(m[2]);
    if (why) out.push({ line: n, text: `${m[1]}. ${m[2]}`, why });
  }
  return out;
}

/**
 * Symbols in scope: for each task, its code symbols (tags + `### Symbols` rows, lock.taskSymbolIds) plus the locked
 * entries that task approved (they survive `hitl-index strip`). Non-test, indexed, with an intent or a span.
 */
export function scopeSymbols(index, lock, tasks, api) {
  const out = new Set();
  for (const t of tasks) {
    for (const id of taskSymbolIds(index, t.id, t, api)) out.add(id);
    for (const [id, l] of Object.entries(lock?.symbols || {})) if (lockedTasks(l).includes(t.id)) out.add(id);
  }
  return [...out].filter((id) => index.symbols[id] && !isTest(index.symbols[id]) && index.symbols[id].kind !== "suite").sort();
}

/** Tasks that touched a symbol: lock approvals, `@task` tags, and every task whose `### Symbols` rows resolve to it. */
function touchingTasks(index, lock, allTasks, id, api) {
  const s = index.symbols[id];
  const out = new Set([...lockedTasks(lock?.symbols?.[id]), ...(s?.tags?.task || [])]);
  for (const t of allTasks) if ((t.symbols || []).some((r) => resolveWith(api, index, r.ref, r.file)?.id === id)) out.add(t.id);
  const num = (t) => Number(/^[A-Z]{2,5}-T(\d+)$/.exec(t)?.[1] ?? Infinity);
  return [...out].sort((a, b) => num(a) - num(b) || a.localeCompare(b));
}

/**
 * Pure report. inputs: {index, lock, tasks (all), scopeTasks, changeIds, allow:[RegExp], overlap, api, files:{[rel]: text}}.
 * Returns [{id, name, kind, file, line, task, ids, restates, growth, steps, signals}] ranked: most signal kinds first,
 * then most hits, then id. Only symbols with ids, restates or steps are listed (growth alone is data, not a finding).
 */
export function intentReport({ index, lock = {}, tasks = [], scopeTasks = tasks, changeIds = [], allow = [], overlap = DEFAULT_RESTATE_OVERLAP, api = null, files = {} }) {
  const S = index.symbols;
  const ids = scopeSymbols(index, lock, scopeTasks, api);
  const linesOf = new Map();
  const fileLines = (f) => { if (!linesOf.has(f)) linesOf.set(f, typeof files[f] === "string" ? files[f].split(/\r?\n/) : null); return linesOf.get(f); };
  const byFile = new Map();
  for (const s of Object.values(S)) { if (!byFile.has(s.file)) byFile.set(s.file, []); byFile.get(s.file).push(s); }
  // enums/classes in scope that define UPPER_SNAKE terms: a symbol naming one of those terms collaborates with it
  const definers = ids.map((id) => [id, definedTerms(S[id].intent)]).filter(([, t]) => t.length);
  const out = [];
  for (const id of ids) {
    const s = S[id];
    const idHits = proseIds([s.intent, ...(s.todos || []), ...(s.flowSteps || [])].join("\n"), { changeIds, allow });

    const collab = new Set(collaboratorsOf(index, [id], [s.file]));
    for (const [d, terms] of definers) if (d !== id && terms.some((t) => new RegExp(`(?<![\\w$])${t}(?![\\w$])`).test(s.intent || ""))) collab.add(d);
    const restates = [];
    const own = sentences(s.intent).map((t) => [t, tokens(t)]).filter(([, k]) => k.size >= MIN_TOKENS);
    for (const c of [...collab].sort()) {
      const theirs = sentences(S[c]?.intent).map((t) => [t, tokens(t), definedTerms(t)]).filter(([, k]) => k.size >= MIN_TOKENS);
      for (const [mine, mk] of own) {
        let best = null;
        for (const [their, tk, terms] of theirs) {
          const j = jaccard(mk, tk);
          const term = terms.find((t) => new RegExp(`(?<![\\w$])${t}(?![\\w$])`).test(mine));
          const skip = term ? tokens(term.replace(/_/g, " ")) : null;
          const termHit = term && j >= overlap / 2 && [...mk].filter((t) => tk.has(t) && !skip.has(t)).length >= TERM_SHARED;
          if ((j >= overlap || termHit) && (!best || j > best.overlap)) best = { overlap: j, their, term: termHit ? term : null };
        }
        if (best) restates.push({ sentence: mine, collaborator: c, collaboratorName: S[c].name, collaboratorSentence: best.their, overlap: Math.round(best.overlap * 100) / 100, ...(best.term ? { term: best.term } : {}) });
      }
    }
    restates.sort((a, b) => b.overlap - a.overlap);

    const l = lock?.symbols?.[id];
    const log = Array.isArray(l?.intentLog) ? l.intentLog : [];
    const touched = touchingTasks(index, lock, tasks, id, api);
    const growth = { tasks: touched.length, taskIds: touched, approvals: log.length, linesFirst: log.length ? log[0].lines : null, linesNow: intentLines(s.intent),
      log: log.map((e) => ({ task: e.task ?? null, stage: e.stage, lines: e.lines, at: e.at })) };

    const children = (byFile.get(s.file) || []).filter((c) => c.id !== id && c.span && s.span && c.span.start >= s.span.start && c.span.end <= s.span.end && (c.span.start > s.span.start || c.span.end < s.span.end)).map((c) => c.span);
    const steps = stepFindings(s, fileLines(s.file), children);

    if (!idHits.length && !restates.length && !steps.length) continue;
    const grew = growth.tasks >= 2 || (growth.linesFirst != null && growth.linesNow > growth.linesFirst);
    const signals = [idHits.length > 0, restates.length > 0, steps.length > 0, grew].filter(Boolean).length;
    out.push({ id, name: s.name, kind: s.kind, file: s.file, line: s.docSpan?.start ?? s.span?.start ?? null, task: l?.task ?? touched.at(-1) ?? null,
      locked: !!l, intentChanged: !!l && l.intentHash !== s.intentHash, openTasks: touched.filter((t) => !lock?.tasks?.[t]?.doneAt),
      impl: l?.impl ?? s.tags?.impl ?? null, ids: idHits, restates, growth, steps, signals });
  }
  const hits = (r) => r.ids.length + r.restates.length + r.steps.length;
  return out.sort((a, b) => b.signals - a.signals || hits(b) - hits(a) || a.id.localeCompare(b.id));
}

/**
 * intents(root, {target: change-id | T-id, config}) → {schema, ok, error?, target, kind, tasks, symbols, overlap, summary}.
 * Reads index, lock, tasks and the source files of the symbols; never writes (no reindex).
 */
export async function intents(root, { target, config } = {}) {
  const api = await loadApi();
  if (!api) throw new Error("hitl-index core (lib/api.mjs) not available");
  config ||= await api.loadConfig(root);
  const index = (await api.readIndex(root)) || { symbols: {}, files: {} };
  const lock = await readLock(root);
  const tasks = (await api.readTasks(root).catch(() => [])) || [];
  const kind = TASK_ID_RE.test(target || "") ? "task" : "change";
  const scopeTasks = tasks.filter((t) => (kind === "task" ? t.id === target : t.change === target));
  const cfg = config.intent || {};
  const overlap = Number.isFinite(cfg.restateOverlap) ? cfg.restateOverlap : DEFAULT_RESTATE_OVERLAP;
  const base = { schema: SCHEMA, target, kind, overlap, tasks: scopeTasks.map((t) => t.id) };
  if (!scopeTasks.length) return { ...base, ok: false, error: `no ${kind} "${target}" in the tasks files`, symbols: [], summary: { symbols: 0, ids: 0, restates: 0, steps: 0 } };
  let changeIds = [];
  try { changeIds = [...new Set((await (await import("./changes.mjs")).listChanges(root)).map((c) => c.id))]; } catch { /* none */ }
  const allow = [];
  for (const a of cfg.idAllow || []) { try { allow.push(new RegExp(a)); } catch { /* bad pattern: ignored */ } }
  const ids = scopeSymbols(index, lock, scopeTasks, api);
  const files = {};
  for (const f of new Set(ids.map((id) => index.symbols[id].file))) { try { files[f] = await fsp.readFile(join(root, f), "utf8"); } catch { /* unreadable: no steps */ } }
  const symbols = intentReport({ index, lock, tasks, scopeTasks, changeIds, allow, overlap, api, files });
  const sum = (k) => symbols.reduce((n, s) => n + s[k].length, 0);
  return { ...base, ok: true, scanned: ids.length, symbols, summary: { symbols: symbols.length, ids: sum("ids"), restates: sum("restates"), steps: sum("steps") } };
}
