// Shared language (0.8): the effective glossary of a change (living + its delta) and the one avoided-word matcher used by
// `spec validate` (TERM_AVOIDED in business files) and `l0` (TERM_AVOIDED in the task's intent docstrings). Pure.
import { scanLines } from "./specmd.mjs";

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fold = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
const W = "[\\p{L}\\p{N}_$]";

/** Case-insensitive whole-word regex for a word or phrase (Unicode letters, any whitespace between words). A dotted
 *  neighbour (`order.user`, `user.id`) is code, not a word. */
export function phraseRx(phrase, flags = "iu") {
  const body = esc(String(phrase).trim()).replace(/\s+/g, "\\s+");
  return new RegExp(`(?<!${W}|${W}\\.)${body}(?!${W}|\\.${W})`, flags);
}

/** The glossary a task sees: living terms, then the change's delta applied (ADDED/MODIFIED replace by key, REMOVED drops).
 *  -> [{term, key, text, avoid}] with `text` = the definition only (no `### Term:` header, no `_Avoid_:` line). */
export function effectiveTerms(living, delta) {
  const out = new Map();
  const def = (t) => (t.text || "").split("\n").filter((l) => !/^###\s+Term:/.test(l) && !/^_Avoid_:/.test(l)).join(" ").replace(/\s+/g, " ").trim();
  for (const t of living?.terms || []) out.set(t.key, { term: t.term, key: t.key, text: def(t), avoid: t.avoid || [] });
  for (const t of delta?.terms || []) {
    if (t.op === "REMOVED") out.delete(t.key);
    else out.set(t.key, { term: t.term, key: t.key, text: def(t), avoid: t.avoid || [] });
  }
  return [...out.values()];
}

/** Avoided words of a glossary, longest first: [{word, term}]. A word avoided by two terms counts for the first; a word
 *  that is itself a term's name is never avoided. */
export function avoidList(terms) {
  const names = new Set((terms || []).map((t) => fold(t.term)));
  const seen = new Set(); const out = [];
  for (const t of terms || []) for (const w of t.avoid || []) {
    const k = fold(w);
    if (!k || names.has(k) || seen.has(k)) continue;
    seen.add(k); out.push({ word: w.trim(), term: t.term });
  }
  return out.sort((a, b) => b.word.length - a.word.length);
}

/** findAvoided(text, terms) -> [{line, word, term, count}]: avoided words used in markdown prose, one item per word (first
 *  line, `count` uses). Skips fences, comments, code spans, `> ` meta lines and `_Avoid_:` lines; a match inside a term's
 *  own name ("Customer account" when "account" is avoided) or inside a longer avoided phrase counts once. */
export function findAvoided(text, terms) {
  const avoid = avoidList(terms).map((a) => ({ ...a, rx: phraseRx(a.word, "giu") }));
  if (!avoid.length) return [];
  const names = (terms || []).map((t) => phraseRx(t.term, "giu"));
  const byWord = new Map();
  for (const L of scanLines(text)) {
    if (L.fenced || L.comment || /^\s*>\s/.test(L.text) || /^\s*_Avoid_:/.test(L.text)) continue;
    const line = L.text.replace(/`[^`]*`/g, (m) => " ".repeat(m.length));
    const named = names.flatMap((rx) => [...line.matchAll(rx)].map((m) => [m.index, m.index + m[0].length]));
    const taken = [];
    for (const a of avoid) for (const m of line.matchAll(a.rx)) {
      const s = m.index, e = s + m[0].length;
      if (named.some(([x, y]) => x <= s && e <= y) || taken.some(([x, y]) => s < y && x < e)) continue;
      taken.push([s, e]);
      const k = fold(a.word);
      const hit = byWord.get(k);
      if (hit) hit.count++;
      else byWord.set(k, { line: L.n, col: s, word: m[0].replace(/\s+/g, " "), term: a.term, count: 1 });
    }
  }
  return [...byWord.values()].sort((a, b) => a.line - b.line || a.col - b.col).map(({ col, ...x }) => x);
}

/** `"user record" → use Account (glossary)`, with the number of uses when more than one. */
export const avoidedMessage = (x) => `"${x.word}" → use ${x.term} (glossary)${x.count > 1 ? ` · ${x.count} uses` : ""}`;

/** TERM_AVOIDED items for the intent docstrings of `ids` (warn, never blocks):
 *  [{level, code, ref: symbol name, symbol, file, word, term, message}] in id order. */
export function avoidedInIntents(index, ids, terms) {
  const out = [];
  if (!avoidList(terms).length) return out;
  for (const id of ids || []) {
    const s = index?.symbols?.[id];
    if (!s?.intent) continue;
    for (const x of findAvoided(s.intent, terms))
      out.push({ level: "warn", code: "TERM_AVOIDED", ref: s.name, symbol: id, file: s.file, word: x.word, term: x.term, message: `intent of ${s.name}: ${avoidedMessage(x)}` });
  }
  return out;
}
