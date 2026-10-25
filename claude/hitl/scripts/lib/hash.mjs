// Language-agnostic normalization + hashing (§E.3.1).
import { createHash } from "node:crypto";
import { stripTsComments } from "./adapters/ts-lite.mjs";

export const h = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Strip Python `#` comments while respecting (triple-)quoted strings. */
export function stripPyComments(text) {
  let out = "", i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === "#") { while (i < n && text[i] !== "\n") i++; out += " "; continue; }
    if (c === '"' || c === "'") {
      const q = text.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
      let j = i + q.length;
      while (j < n && !text.startsWith(q, j) && !(q.length === 1 && text[j] === "\n")) j += text[j] === "\\" ? 2 : 1;
      j = Math.min(n, j + q.length);
      out += text.slice(i, j);
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

export function stripComments(text, lang) {
  if (lang === "ts") return stripTsComments(text);
  if (lang === "py") return stripPyComments(text);
  return text;
}

/** normalize(text): strip comments (per lang), collapse whitespace, drop spaces next to punctuation, trim. */
export function normalize(text, lang = null) {
  return stripComments(String(text ?? ""), lang)
    .replace(/\s+/g, " ")
    .replace(/ ?([()[\]{},:;<>=|&?.]) ?/g, "$1")
    .trim();
}
