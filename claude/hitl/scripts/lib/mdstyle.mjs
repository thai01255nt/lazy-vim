// Markdown style of the files hitl writes (0.14.1): markdownlint style, so a formatter on save (prettier) changes
// nothing that matters. tidyMarkdown() puts a blank line around every heading and between two different block kinds
// (paragraph, list, table, blockquote, fenced code, HTML comment). That also ends what CommonMark would read as a lazy
// continuation: a `Changed: …` line right under a list item, or a Claude mark right under a `>` answer.
// Tables are padded the way prettier pads them (display width: wide East Asian characters and emoji count 2).

const FENCE = /^\s{0,3}(```|~~~)/;
const kindOf = (l, prev) => {
  if (/^\s{0,3}#{1,6}(\s|$)/.test(l)) return "heading";
  if (/^\s{0,3}>/.test(l)) return "quote";
  if (/^\s*\|/.test(l)) return "table";
  if (/^\s{0,3}(?:[-*+]|\d{1,9}[.)])(\s|$)/.test(l)) return "list";
  if (prev === "list" && /^\s{2,}\S/.test(l)) return "list"; // an indented continuation of a list item
  if (/^\s*<!--/.test(l)) return "html";
  return "para";
};

/** Display width of a string (string-width rules, as prettier measures table cells). */
export function displayWidth(str) {
  let w = 0;
  for (const ch of String(str).normalize("NFC")) {
    if (/[\u0300-\u036f\u200b-\u200f\ufe00-\ufe0f]|\p{Mn}|\p{Me}/u.test(ch)) continue;
    if (/\p{Extended_Pictographic}/u.test(ch) && ch.codePointAt(0) > 0x2000) { w += 2; continue; }
    const c = ch.codePointAt(0);
    if ((c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) ||
      (c >= 0xfe30 && c <= 0xfe4f) || (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x1f300 && c <= 0x1faff) || c >= 0x20000) w += 2;
    else w += 1;
  }
  return w;
}

/** Split a table row into trimmed cells (an escaped `\|` stays inside its cell). */
const rowCells = (l) => l.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "").split(/(?<!\\)\|/).map((c) => c.trim());
const SEP_CELL = /^:?-+:?$/;

/** Pad one table (header, separator, rows) like prettier: every column as wide as its widest cell (min 3). */
export function padTable(rows) {
  const cells = rows.map(rowCells);
  if (cells.length < 2 || !cells[1].every((c) => SEP_CELL.test(c))) return rows;
  const n = Math.max(...cells.map((r) => r.length));
  for (const r of cells) while (r.length < n) r.push("");
  const align = cells[1].map((c) => (c.startsWith(":") && c.endsWith(":") ? "c" : c.endsWith(":") ? "r" : c.startsWith(":") ? "l" : ""));
  const width = Array.from({ length: n }, (_, i) => Math.max(3, ...cells.filter((_, k) => k !== 1).map((r) => displayWidth(r[i]))));
  const pad = (c, i) => {
    const sp = width[i] - displayWidth(c);
    if (align[i] === "r") return " ".repeat(sp) + c;
    if (align[i] === "c") return " ".repeat(Math.floor(sp / 2)) + c + " ".repeat(Math.ceil(sp / 2));
    return c + " ".repeat(sp);
  };
  const sep = (i) => { const a = align[i]; const d = "-".repeat(width[i] - (a === "c" ? 2 : a ? 1 : 0)); return a === "c" ? `:${d}:` : a === "r" ? `${d}:` : a === "l" ? `:${d}` : d; };
  return cells.map((r, k) => `| ${r.map((c, i) => (k === 1 ? sep(i) : pad(c, i))).join(" | ")} |`);
}

/** Blank lines around headings and between different block kinds, tables padded; fenced code and HTML comments kept. */
export function tidyMarkdown(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const out = []; const isFenced = [];
  let prev = null; // kind of the previous non-blank line, null after a blank line
  let fence = null; let comment = false;
  const blankBefore = () => { if (prev !== null && out.length && out[out.length - 1].trim() !== "") out.push(""); };
  for (const l of lines) {
    if (fence) { out.push(l); isFenced[out.length - 1] = true; if (l.trim().startsWith(fence)) { fence = null; prev = "fence"; } continue; }
    if (comment) { out.push(l); isFenced[out.length - 1] = true; if (l.includes("-->")) { comment = false; prev = "html"; } continue; }
    if (!l.trim()) { out.push(l); prev = null; continue; }
    const fm = l.match(FENCE);
    if (fm) { blankBefore(); out.push(l); fence = fm[1]; prev = "fence"; continue; }
    const k = kindOf(l, prev);
    if (k === "html" && !l.includes("-->")) { blankBefore(); out.push(l); comment = true; prev = "html"; continue; }
    if (prev !== null && (k === "heading" || prev === "heading" || k !== prev || k === "html")) blankBefore();
    out.push(l);
    prev = k;
  }
  // pad each run of table rows
  const res = [];
  for (let i = 0; i < out.length; i++) {
    if (!/^\s*\|/.test(out[i]) || isFenced[i]) { res.push(out[i]); continue; }
    let j = i; while (j < out.length && /^\s*\|/.test(out[j]) && !isFenced[j]) j++;
    res.push(...padTable(out.slice(i, j))); i = j - 1;
  }
  return res.join("\n").replace(/\n{3,}/g, "\n\n");
}
