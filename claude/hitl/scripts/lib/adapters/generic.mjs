// generic@1: dependency-free, language-table driven adapter for any language (see langs.mjs).
// Pipeline per file: scan (comments/strings, masked copy) -> declaration candidates (per-language regexes, or
// ctags tags) + tagged-doc fallbacks -> header/body via brace | end-keyword | indentation | sql matching ->
// containment (Class.method ids, locals dropped) -> AdapterFileResult symbols. Calls are name( scans (approx).
import { isTestFile } from "../config.mjs";
import { parseDoc } from "../tags.mjs";
import { lineIndex, finishCalls } from "./ts-lite.mjs";
import { LANGS, GENERIC_EXT, GENERIC_FILES, KEYWORDS } from "./langs.mjs";

export const GENERIC_ID = "generic@1";

/** lang id for a path (generic table + python fallback). */
export function genericLangOf(path) {
  const base = path.split("/").at(-1);
  if (GENERIC_FILES[base]) return GENERIC_FILES[base];
  const ext = (base.match(/\.[^.]+$/) || [""])[0].toLowerCase();
  if (ext === ".py") return "py";
  return GENERIC_EXT[ext] || null;
}

// ---------------------------------------------------------------- scanner
const IDC = /[\w$]/;
const CLOSER = { "(": ")", "[": "]", "{": "}", "<": ">" };

/** scan(src, spec) -> {masked, comments:[{s,e,open,close,line?}], strings:[{s,e,cs,ce}], approx} */
export function scan(src, spec) {
  const n = src.length;
  const comments = [], strings = [];
  let approx = false;
  const pending = []; // heredocs waiting for the next newline: {id, indent, s}
  const bol = (p) => p === 0 || src[p - 1] === "\n";
  const lineOk = (p, pre) => {
    if (pre === "#" && spec.hashGuard === "shell") return p === 0 || /[\s;|&()]/.test(src[p - 1]);
    if (pre === "#" && spec.hashGuard === "php") return src[p + 1] !== "[";
    if (pre === "#" && spec === LANGS.nim) return src[p + 1] !== "[";
    return true;
  };
  const sticky = (re, p) => { re.lastIndex = p; return re.exec(src); };

  const skipInterp = (p, open, close) => { // p after the interpolation opener; returns index after its closer
    let d = 1;
    while (p < n) {
      const st = strAt(p);
      if (st) { p = st.e; continue; }
      const c = src[p];
      if (c === open) d++;
      else if (c === close && --d === 0) return p + 1;
      p++;
    }
    approx = true;
    return n;
  };
  const quoted = (p, k) => { // generic open/close string starting at p
    let j = p + k.open.length;
    const ic = k.interp ? (k.interp === "\\(" ? ["(", ")"] : k.interp === "$(" ? ["(", ")"] : ["{", "}"]) : null;
    for (;;) {
      if (j >= n) { approx = true; return { e: n, cs: p + k.open.length, ce: n }; }
      const c = src[j];
      if (c === "\n" && !k.ml) { approx = true; return { e: j, cs: p + k.open.length, ce: j }; }
      if (k.dbl && src.startsWith(k.close, j) && src.startsWith(k.close, j + k.close.length)) { j += 2 * k.close.length; continue; }
      if (k.esc && c === "\\") {
        if (k.interp === "\\(" && src[j + 1] === "(") { j = skipInterp(j + 2, "(", ")"); continue; }
        j += 2; continue;
      }
      if (src.startsWith(k.close, j)) {
        let e = j + k.close.length;
        if (k.greedy) while (src[e] === k.close[0]) { e++; j++; }
        return { e, cs: p + k.open.length, ce: j };
      }
      if (ic && k.interp !== "\\(" && src.startsWith(k.interp, j)) { j = skipInterp(j + k.interp.length, ic[0], ic[1]); continue; }
      j++;
    }
  };
  const until = (p, open, close, nest = false) => { // find close for a bracketed literal, returns {e, cs, ce}
    let d = 1, j = p;
    while (j < n) {
      if (src[j] === "\\") { j += 2; continue; }
      if (nest && src[j] === open && open !== close) d++;
      else if (src[j] === close && --d === 0) return { e: j + 1, cs: p, ce: j };
      j++;
    }
    approx = true;
    return { e: n, cs: p, ce: n };
  };
  function strAt(p) {
    for (const k of spec.strings) {
      if (k.raw) {
        let m;
        if (k.raw === "rust" && (m = sticky(/b?r(#*)"/y, p)) && !(p > 0 && IDC.test(src[p - 1]))) {
          const close = '"' + m[1], k2 = src.indexOf(close, p + m[0].length);
          if (k2 < 0) { approx = true; return { e: n, cs: p + m[0].length, ce: n }; }
          return { e: k2 + close.length, cs: p + m[0].length, ce: k2 };
        }
        if (k.raw === "cpp" && (m = sticky(/(?:u8|[uUL])?R"([^ ()\\\t\n]{0,16})\(/y, p)) && !(p > 0 && IDC.test(src[p - 1]))) {
          const close = ")" + m[1] + '"', k2 = src.indexOf(close, p + m[0].length);
          if (k2 < 0) { approx = true; return { e: n, cs: p + m[0].length, ce: n }; }
          return { e: k2 + close.length, cs: p + m[0].length, ce: k2 };
        }
        if (k.raw === "swift" && (m = sticky(/(#+)("""|")/y, p))) {
          const close = m[2] + m[1], k2 = src.indexOf(close, p + m[0].length);
          if (k2 < 0) { approx = true; return { e: n, cs: p + m[0].length, ce: n }; }
          return { e: k2 + close.length, cs: p + m[0].length, ce: k2 };
        }
        if (k.raw === "lualong" && (m = sticky(/\[(=*)\[/y, p))) {
          const close = "]" + m[1] + "]", k2 = src.indexOf(close, p + m[0].length);
          if (k2 < 0) { approx = true; return { e: n, cs: p + m[0].length, ce: n }; }
          return { e: k2 + close.length, cs: p + m[0].length, ce: k2 };
        }
        if (k.raw === "dollar" && (m = sticky(/\$([A-Za-z_]\w*)?\$/y, p)) && !(p > 0 && IDC.test(src[p - 1]))) {
          const k2 = src.indexOf(m[0], p + m[0].length);
          if (k2 < 0) { approx = true; return { e: n, cs: p + m[0].length, ce: n }; }
          return { e: k2 + m[0].length, cs: p + m[0].length, ce: k2 };
        }
        if (k.raw === "sigil" && (m = sticky(/~[a-zA-Z]+(?=[/|"'(\[{<])/y, p))) {
          const q = p + m[0].length;
          if (src.startsWith('"""', q) || src.startsWith("'''", q)) {
            const close = src.slice(q, q + 3), k2 = src.indexOf(close, q + 3);
            return k2 < 0 ? (approx = true, { e: n, cs: q + 3, ce: n }) : { e: k2 + 3, cs: q + 3, ce: k2 };
          }
          const o = src[q], c = CLOSER[o] || o;
          return until(q + 1, o, c, o !== c);
        }
        if (k.raw === "percent" && (m = sticky(/%[qQwWiIrsx]([(\[{<|!/])/y, p)) && (p === 0 || /[\s(,=\[{]/.test(src[p - 1]))) {
          const o = m[1], c = CLOSER[o] || o;
          return until(p + m[0].length, o, c, o !== c);
        }
        if (k.raw === "phpheredoc" && (m = sticky(/<<<[ \t]*(["']?)([A-Za-z_]\w*)\1\r?\n/y, p))) {
          const rx = new RegExp(`^[ \\t]*${m[2]}\\b`, "m");
          rx.lastIndex = 0;
          const rest = src.slice(p + m[0].length), mm = rx.exec(rest);
          if (!mm) { approx = true; return { e: n, cs: p + m[0].length, ce: n }; }
          const ce = p + m[0].length + mm.index;
          return { e: ce + mm[0].length, cs: p + m[0].length, ce };
        }
        if ((k.raw === "rubyheredoc" && (m = sticky(/<<([~-]?)(["'`]?)([A-Za-z_]\w*)\2/y, p)) && !(p > 0 && /[\w)\]]/.test(src[p - 1])))
          || (k.raw === "shellheredoc" && (m = sticky(/<<(-?)[ \t]*(["']?)([A-Za-z_]\w*)\2/y, p)) && src[p + 2] !== "<")) {
          pending.push({ id: m[3], indent: k.raw === "rubyheredoc" ? !!m[1] : true });
          return { e: p + m[0].length, cs: p + m[0].length, ce: p + m[0].length, opener: true };
        }
        continue;
      }
      if (k.char) {
        const m = sticky(/'(?:\\(?:u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{1,4}|[0-7]{1,3}|.)|[^\\'\n])'/y, p);
        if (m) return { e: p + m[0].length, cs: p + 1, ce: p + m[0].length - 1 };
        continue;
      }
      if (src.startsWith(k.open, p)) return quoted(p, k);
    }
    return null;
  }
  const consumeHeredocs = (p) => {
    while (pending.length) {
      const h = pending.shift();
      const s = p;
      let found = false;
      while (p < n) {
        let eol = src.indexOf("\n", p);
        if (eol < 0) eol = n;
        const line = src.slice(p, eol).replace(/\r$/, "");
        if ((h.indent ? line.trim() : line) === h.id) { strings.push({ s, e: eol, cs: s, ce: p }); p = eol; found = true; break; }
        p = eol + 1;
      }
      if (!found) { approx = true; strings.push({ s, e: n, cs: s, ce: n }); p = n; }
      if (pending.length && p < n) p++;
    }
    return p;
  };

  let i = 0;
  outer: while (i < n) {
    const c = src[i];
    if (c === "\n") { i++; if (pending.length) i = consumeHeredocs(i); continue; }
    if (c === " " || c === "\t" || c === "\r") { i++; continue; }
    if (c === "#" && i === 0 && src[1] === "!") { const e = src.indexOf("\n"); i = e < 0 ? n : e; continue; }
    if (spec === LANGS.lua && src.startsWith("--[", i)) {
      const m = sticky(/--\[(=*)\[/y, i);
      if (m) {
        const close = "]" + m[1] + "]", k = src.indexOf(close, i + m[0].length);
        const e = k < 0 ? (approx = true, n) : k + close.length;
        comments.push({ s: i, e, open: m[0], close }); i = e; continue;
      }
    }
    for (const [o, cl, needBol] of spec.block) {
      if (!src.startsWith(o, i) || (needBol && !bol(i))) continue;
      let e;
      if (spec.nest) {
        let d = 1, j = i + o.length;
        while (j < n && d) {
          if (src.startsWith(o, j)) { d++; j += o.length; } else if (src.startsWith(cl, j)) { d--; j += cl.length; } else j++;
        }
        if (d) approx = true;
        e = j;
      } else {
        const k = src.indexOf(cl, i + o.length);
        e = k < 0 ? (approx = true, n) : k + cl.length;
      }
      comments.push({ s: i, e, open: o, close: cl });
      i = e;
      continue outer;
    }
    for (const p of spec.line) {
      if (!src.startsWith(p, i) || !lineOk(i, p)) continue;
      let e = src.indexOf("\n", i);
      if (e < 0) e = n;
      comments.push({ s: i, e, open: p, close: "", line: true });
      i = e;
      continue outer;
    }
    const st = strAt(i);
    if (st && st.e > i) { if (!st.opener) strings.push({ s: i, e: st.e, cs: st.cs, ce: st.ce }); i = st.e; continue; }
    i++;
  }
  strings.sort((a, b) => a.s - b.s);
  // masked copy: comments -> spaces; strings -> `"` + spaces + `"`; newlines kept
  const buf = new Uint16Array(n);
  for (let k = 0; k < n; k++) buf[k] = src.charCodeAt(k);
  const blank = (s, e) => { for (let k = s; k < e; k++) if (buf[k] !== 10 && buf[k] !== 13) buf[k] = 32; };
  for (const cm of comments) blank(cm.s, cm.e);
  for (const st of strings) { blank(st.s, st.e); if (st.e - st.s >= 2) { if (buf[st.s] !== 10) buf[st.s] = 34; if (buf[st.e - 1] !== 10) buf[st.e - 1] = 34; } }
  let masked = "";
  for (let k = 0; k < n; k += 8192) masked += String.fromCharCode.apply(null, buf.subarray(k, Math.min(n, k + 8192)));
  return { masked, comments, strings, approx };
}

/** Comment stripping for hashing (comments -> one space), mirrors stripTsComments. */
export function stripCommentsGeneric(text, lang) {
  const spec = LANGS[lang];
  if (!spec || !text) return text;
  const { comments } = scan(text, spec);
  let out = "", last = 0;
  for (const c of comments) { out += text.slice(last, c.s) + " "; last = c.e; }
  return out + text.slice(last);
}

// ---------------------------------------------------------------- helpers
const CLASS_WORDS = new Set(["class", "record", "struct", "object", "module", "defmodule", "union", "mixin", "actor", "extension", "extension type", "@interface"]);
const TYPE_WORDS = new Set(["interface", "trait", "protocol", "enum", "defprotocol", "enum class"]);
const DECL_BAD = new Set(["if", "else", "elif", "elsif", "for", "foreach", "while", "do", "switch", "case", "when", "match", "catch", "try", "finally", "return",
  "throw", "new", "sizeof", "typeof", "delete", "unless", "until", "super", "this", "self", "and", "or", "not", "in"]);
const BAD_TYPES = new Set(["return", "new", "throw", "else", "case", "await", "yield", "goto", "delete", "sizeof", "typeof", "in", "is", "as", "not", "and", "or",
  "var", "let", "val", "const", "do", "if", "while", "for", "switch", "using", "lock", "import", "package", "throws", "extends", "implements", "where", "with", "when"]);
const TEST_ANN = /@(?:Test|ParameterizedTest|RepeatedTest|TestFactory|TestTemplate|Property|Theory)\b|#\[(?:[\w:]+::)?test\b|\[(?:Test|Fact|Theory|TestMethod|TestCase)\b/;
const SKIP_ANN = /@(?:Disabled|Ignore|Ignored|Pending)\b|#\[ignore\b|\[Ignore\b|Skip\s*=/;
const FN_CTAGS = new Set(["function", "method", "constructor", "procedure", "subroutine", "func", "singletonMethod", "fun", "def", "macro_function", "test", "proc"]);
const CLASS_CTAGS = new Set(["class", "struct", "object", "record", "module", "union", "actor", "mixin", "singletonClass"]);
const TYPE_CTAGS = new Set(["interface", "trait", "protocol", "enum", "typealias", "type", "typedef", "talias", "annotation", "enumClass", "alias"]);
const IMPL_CTAGS = new Set(["implementation", "extension", "impl"]);
const TAG_HINT = /(^|\s)@(task|impl|status|prio|calls|concurrency|covers|ac|kind|origin|risk|dec)\b/;

const hasTags = (doc) => {
  if (!doc || !TAG_HINT.test(doc)) return false;
  const { tags, errors } = parseDoc(doc);
  return errors.length > 0 || Object.entries(tags).some(([k, v]) => k !== "extra" && (Array.isArray(v) ? v.length : v !== null));
};
const indentOf = (s) => s.match(/^[ \t]*/)[0].length;
const splitTop = (s) => { // split by commas at bracket depth 0
  const out = [];
  let d = 0, a = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ("([{<".includes(c)) d++;
    else if (")]}>".includes(c)) d--;
    else if (c === "," && d === 0) { out.push(s.slice(a, i)); a = i + 1; }
  }
  out.push(s.slice(a));
  return out.map((x) => x.trim()).filter(Boolean);
};

function paramLocals(style, text) {
  const out = {};
  if (!style || !text) return out;
  for (const p of splitTop(text)) {
    let m;
    if (style === "typeName" && (m = p.match(/(?:^|\s)([A-Z][\w.]*)(?:\s*<[^>]*>)?(?:\[\])*\??[\s&*]+(\w+)\s*(?:=.*)?$/))) out[m[2]] = m[1];
    else if (style === "nameColonType" && (m = p.match(/(\w+)\s*:\s*&?(?:'\w+\s+)?(?:mut\s+)?(?:dyn\s+|impl\s+)?([A-Z][\w.]*)/))) out[m[1]] = m[2];
    else if (style === "swift" && (m = p.match(/(?:(\w+)\s+)?(\w+)\s*:\s*(?:inout\s+)?([A-Z][\w.]*)/))) out[m[2]] = m[3];
    else if (style === "go" && (m = p.match(/^(\w+)\s+\*?([A-Z][\w.]*)/))) out[m[1]] = m[2];
    else if (style === "php" && (m = p.match(/([A-Z][\w\\]*)\s+&?\$(\w+)/))) out["$" + m[2]] = m[1].split("\\").at(-1);
  }
  return out;
}
const FIELD_RX = {
  typeName: /^\s*(?:@\w+(?:\([^)]*\))?\s+)*(?:(?:private|public|protected|internal|static|final|readonly|late|const|volatile|transient|required|mutable)\s+)*([A-Z][\w.]*)(?:\s*<[^;=]*>)?(?:\[\])*\??\s+(\w+)\s*(?:=|;|$)/,
  valColonType: /\b(?:val|var|let)\s+(\w+)\s*:\s*([A-Z][\w.]*)/g,
  rustStruct: /^\s*(?:pub(?:\([^)]*\))?\s+)?(\w+)\s*:\s*&?(?:'\w+\s+)?(?:mut\s+)?(?:(?:Box|Arc|Rc|RefCell|Mutex)<)*([A-Z]\w*)/,
  goStruct: /^\s*(\w+)\s+\*?(?:\[\])?([A-Z][\w.]*)\s*(?:"|$)/,
};

// ---------------------------------------------------------------- analysis
/** parseGeneric(file, lang, config, {decls?}) -> AdapterFileResult. decls: ctags-style [{name, kind, line, end?, scope?}] */
export function parseGeneric(file, lang, config, opts = {}) {
  const res = { path: file.path, lang, imports: [], symbols: [], warnings: [], parseError: null };
  const spec = LANGS[lang];
  if (!spec) { res.parseError = `generic: no language table for ${lang}`; return res; }
  try {
    const r = analyze(file.content, spec, lang, isTestFile(file.path, config), opts);
    res.symbols = r.symbols;
    res.imports = r.imports;
    const why = [r.approx && "unbalanced brackets/blocks or unterminated literal", r.fallbacks && `${r.fallbacks} tagged declaration(s) not matched by the ${lang} rules`].filter(Boolean);
    if (r.symbols.length || why.length)
      res.warnings.push({ code: "GENERIC_APPROX", message: `${opts.decls ? "ctags+generic adapter: bodies" : "generic adapter: declarations, bodies"} and calls are approximate (${lang})${why.length ? "; " + why.join("; ") : ""}`, line: null });
  } catch (e) {
    res.parseError = `generic: ${e.message}`;
  }
  return res;
}

function analyze(src, spec, lang, isTest, opts) {
  const { masked: M, comments: C, strings: S, approx: scanApprox } = scan(src, spec);
  const n = src.length;
  let approx = scanApprox;
  const lineOf = lineIndex(src); // 1-based
  const starts = [0];
  for (let i = 0; i < n; i++) if (src[i] === "\n") starts.push(i + 1);
  const L = starts.length;
  const lineEnd = (li) => (li + 1 < L ? starts[li + 1] - 1 : n);
  const mLine = (li) => M.slice(starts[li], lineEnd(li));
  const oLine = (li) => src.slice(starts[li], lineEnd(li));
  const li0 = (pos) => lineOf(pos) - 1;
  const stringAt = (pos) => { // string record starting at pos
    let lo = 0, hi = S.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (S[mid].s === pos) return S[mid]; if (S[mid].s < pos) lo = mid + 1; else hi = mid - 1; }
    return null;
  };

  // comment-only lines -> comment index
  const lineComment = new Int32Array(L).fill(-1);
  C.forEach((c, k) => { for (let l = li0(c.s); l <= li0(Math.max(c.s, c.e - 1)); l++) lineComment[l] = k; });
  const commentOnly = (li) => lineComment[li] >= 0 && !mLine(li).trim() && !!oLine(li).trim();
  const blankLine = (li) => !oLine(li).trim();

  // braces
  const bracePair = new Map();
  {
    const st = [];
    for (let i = 0; i < n; i++) {
      const c = M[i];
      if (c === "{") st.push(i);
      else if (c === "}") { if (st.length) bracePair.set(st.pop(), i); else if (spec.style === "brace") approx = true; }
    }
    if (st.length && spec.style === "brace") approx = true;
  }

  // end-keyword blocks
  const endPair = new Map(), openers = [];
  if (spec.style === "end" || spec.style === "sql") {
    const kw = spec.style === "sql" ? { open: ["begin", "case"], stmtOpen: [], close: ["end"] } : spec.endKw;
    const OPEN = new Set(kw.open), STMT = new Set(kw.stmtOpen), CLOSE = new Set(kw.close);
    const rx = /[A-Za-z_][\w]*[?!]?/g;
    const st = [];
    let loopLine = -1, m;
    while ((m = rx.exec(M))) {
      let w = m[0];
      if (spec.ci) w = w.toLowerCase();
      if (!OPEN.has(w) && !STMT.has(w) && !CLOSE.has(w)) continue;
      const p = m.index, prev = M[p - 1], next = M[p + w.length];
      if (prev === "." && M[p - 2] !== ".") continue;
      if (prev === ":" && M[p - 2] !== ":") continue;
      if (next === ":" && M[p + w.length + 1] !== ":") continue;
      if (prev === "@" || prev === "$") continue;
      const li = li0(p);
      if (CLOSE.has(w)) {
        if (spec.style === "sql" && /^\s+(?:if|loop|while|repeat|for)\b/i.test(M.slice(p + 3, p + 12))) continue; // END IF / END LOOP
        if (st.length) endPair.set(st.pop(), p); else approx = true;
        continue;
      }
      if (STMT.has(w)) {
        const before = M.slice(starts[li], p).trimEnd();
        if (before && !/(?:[=(,;[{|&!?]|\breturn|\bthen|\bdo|\belse|\bbegin)$/.test(before)) continue;
        if (w === "while" || w === "until" || w === "for") loopLine = li;
      }
      if (w === "do" && lang === "ruby" && loopLine === li) continue;
      if (w === "def" && lang === "ruby" && /^\s+(?:self\.)?[\w]+[?!]?(?:\([^)]*\)\s*|\s+)=(?![=~>])/.test(M.slice(p + 3, lineEnd(li)))) continue;
      st.push(p);
      openers.push({ p, w });
    }
    if (st.length) approx = true;
  }
  const closers = new Set(endPair.values());
  const firstOpener = (from, words, limit = n) => {
    let lo = 0, hi = openers.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (openers[mid].p < from) lo = mid + 1; else hi = mid; }
    for (let k = lo; k < openers.length && openers[k].p < limit; k++) if (words.includes(openers[k].w)) return openers[k];
    return null;
  };

  const annLine = (t) => {
    switch (spec.ann) {
      case "at": return /^@[\w.]+/.test(t) && !/^@interface\b/.test(t);
      case "hash": return /^#!?\[/.test(t);
      case "bracket": return /^\[[^\]]*\]?\s*$/.test(t) || /^\[\w+(?:\(.*\))?\]/.test(t) && !/\]\s*\w/.test(t);
      case "phpattr": return /^#\[/.test(t);
      case "cpp": return /^template\s*</.test(t) || /^\[\[/.test(t);
      case "elixir": return /^@(?!doc\b|moduledoc\b|typedoc\b)\w+/.test(t) || /^@doc\s+false\b/.test(t);
      default: return false;
    }
  };

  // ---- doc blocks: block comments, contiguous line-comment runs, elixir @doc strings
  const docBlocks = []; // {startLine, endLine, text, adj:boolean (must be adjacent)}
  {
    let k = 0;
    while (k < C.length) {
      const c = C[k];
      const sl = li0(c.s), el = li0(Math.max(c.s, c.e - 1));
      const ownLine = !M.slice(starts[sl], c.s).trim();
      if (!c.line) {
        if (ownLine && !M.slice(c.e, lineEnd(el)).trim()) {
          let body = src.slice(c.s + c.open.length, c.e - c.close.length);
          if (c.open === "/*" && /^[*!]/.test(body)) body = body.slice(1);
          docBlocks.push({ startLine: sl, endLine: el, text: body, adj: !src.startsWith("/**", c.s) });
        }
        k++;
        continue;
      }
      if (!ownLine) { k++; continue; }
      const lines = [];
      let j = k, last = sl;
      while (j < C.length && C[j].line && li0(C[j].s) === (j === k ? sl : last + 1) && !M.slice(starts[li0(C[j].s)], C[j].s).trim()) {
        last = li0(C[j].s);
        lines.push(src.slice(C[j].s, C[j].e).replace(/\r$/, ""));
        j++;
      }
      const strip = (t) => t.replace(/^(?:\/\/[/!]?|#+|--+|;+)\s?/, "");
      docBlocks.push({ startLine: sl, endLine: last, text: lines.map(strip).join("\n"), adj: true });
      k = j;
    }
    if (spec.docAttr) {
      for (let li = 0; li < L; li++) {
        const m = spec.docAttr.exec(mLine(li));
        if (!m) continue;
        const st = stringAt(starts[li] + m[0].length) || stringAt(starts[li] + m[0].length + 2);
        if (!st) continue;
        docBlocks.push({ startLine: li, endLine: li0(Math.max(st.s, st.e - 1)), text: src.slice(st.cs, st.ce).replace(/^\n/, ""), adj: true });
      }
    }
    docBlocks.sort((a, b) => a.endLine - b.endLine);
  }
  const docByEnd = new Map(docBlocks.map((d) => [d.endLine, d]));

  /** walk up from decl line: annotations (included in signature) then doc. */
  const above = (li) => {
    let sigLine = li, k = li - 1;
    const annos = [];
    while (k >= 0) {
      if (docByEnd.has(k) && spec.docAttr) break;
      const t = mLine(k).trim();
      if (t && annLine(t)) { annos.push(t); sigLine = k; k--; continue; }
      if (t && spec.ann === "at" && /\)\s*$/.test(t) && !/^\w/.test(t)) { // tail of a multi-line annotation
        let bal = 0, q = k;
        for (; q >= 0 && q > k - 12; q--) {
          const tt = mLine(q);
          bal += (tt.match(/\)/g) || []).length - (tt.match(/\(/g) || []).length;
          if (bal <= 0) break;
        }
        if (q >= 0 && bal <= 0 && annLine(mLine(q).trim())) { for (let z = q; z <= k; z++) annos.push(mLine(z).trim()); sigLine = q; k = q - 1; continue; }
      }
      break;
    }
    let d = k, sawBlank = false;
    while (d >= 0 && blankLine(d)) { d--; sawBlank = true; }
    const doc = d >= 0 ? docByEnd.get(d) : null;
    const ok = doc && (!sawBlank || !doc.adj);
    return { sigLine, annos: annos.join("\n"), doc: ok ? doc : null };
  };

  // ---- candidates
  const cands = [];
  const byLine = new Map();
  const addCand = (c) => { if (byLine.has(c.line)) return; byLine.set(c.line, c); cands.push(c); };
  const catOfWord = (w) => (TYPE_WORDS.has(w) ? "type" : CLASS_WORDS.has(w) ? "class" : "class");

  const fromRule = (li, rule, m) => {
    const ls = starts[li], text = mLine(li);
    const pos = ls + indentOf(text);
    const end = ls + m.index + m[0].length;
    const scanFrom = text[m.index + m[0].length - 1] === "(" ? end - 1 : end;
    const g = (k) => (k != null ? m[k] : undefined);
    const lastGroup = () => { for (let k = m.length - 1; k > 0; k--) if (m[k] !== undefined) return m[k]; return null; };
    switch (rule.kind) {
      case "classword": {
        const w = m[1].replace(/\s+/g, " ");
        let name = m[2];
        if (lang === "ruby" || lang === "cpp") name = name.replace(/::/g, ".");
        if (DECL_BAD.has(name)) return null;
        return { line: li, pos, scanFrom, name, cat: w === "enum" && lang === "rust" ? "type" : catOfWord(w.replace(/^enum class$/, "class")), word: w, kwPos: ls + m.index + m[0].indexOf(m[1]) };
      }
      case "class": return { line: li, pos, scanFrom, name: m[1], cat: "class", word: "class", kwPos: pos };
      case "gotype": return { line: li, pos, scanFrom, name: m[1], cat: m[2] === "struct" ? "class" : "type", word: m[2] };
      case "type": return { line: li, pos, scanFrom, name: g(rule.nameGroup) ?? lastGroup(), cat: "type", word: "type", noBodyOk: true };
      case "impl": {
        let name = m[1];
        name = lang === "rust" ? name.split("::").at(-1) : name;
        return { line: li, pos, scanFrom, name, cat: "impl" };
      }
      case "ns": return { line: li, pos, scanFrom, name: m[1] || null, cat: "ns", kwPos: pos };
      case "sqlword": {
        const w = m[1].toLowerCase(), name = m[2].replace(/["`[\]]/g, "");
        return { line: li, pos, scanFrom, name, cat: /function|procedure|trigger/.test(w) ? "fn" : "type", word: w, noBodyOk: true };
      }
      case "gtest": return { line: li, pos, scanFrom: end, name: `${m[2]}.${m[3]}`, cat: "fn", forceTest: true, flatName: true };
      case "dsl": {
        if (!isTest) return null;
        const word = rule.word || m[1];
        const st = stringAt(end);
        const cm = st ? null : /^[A-Z][\w:.]*/.exec(M.slice(end, lineEnd(li)));
        if (!st && !cm) return null;
        const title = st ? src.slice(st.cs, st.ce) : cm[0].replace(/::/g, ".");
        if (!st) return { line: li, pos, scanFrom: end + cm[0].length, name: title, cat: "dsl", suite: true, word, dslMode: "active", kwPos: pos };
        const suite = /^(?:x?describe|x?context|feature|group)$/.test(word);
        return { line: li, pos, scanFrom: st.e, name: title, cat: "dsl", suite, word, dslMode: /^(?:x\w+|skip|pending|ignore)$/.test(word) ? "skip" : "active", kwPos: pos };
      }
      case "fn": {
        let name = rule.nameGroup ? m[rule.nameGroup] : lastGroup();
        if (!name) return null;
        name = name.replace(/^`|`$/g, "");
        const c = { line: li, pos, scanFrom, cat: "fn", name, kwPos: pos, header0: text.slice(0, m.index + m[0].length) };
        if (rule.goRecv && m[2]) { c.name = `${m[2]}.${m[3]}`; c.recvVar = m[1] || null; c.recvType = m[2]; c.qualified = true; }
        if (rule.recvGroup && m[rule.recvGroup]) {
          if (lang === "ruby" && m[rule.recvGroup] !== "self") { c.name = `${m[rule.recvGroup]}.${name}`; c.qualified = true; }
        }
        if (lang === "lua" && /[.:]/.test(name)) { c.name = name.replace(/:/g, "."); c.qualified = true; }
        if (lang === "cpp" && name.includes("::")) { c.name = name.replace(/::/g, "."); c.qualified = true; }
        if (rule.localGroup && m[rule.localGroup]) c.local = true;
        if (rule.privGroup && /p$/.test(m[rule.privGroup])) c.private = true;
        if (lang === "ruby" || lang === "elixir" || lang === "lua") { const kwm = /\b(def\w*|function)\b/.exec(text); if (kwm) c.kwPos = ls + kwm.index; }
        const last = c.name.split(".").at(-1);
        if (DECL_BAD.has(last) || /^\s*(?:return|else|case|goto|throw|new|await|yield|delete)\s/.test(text)) return null;
        if (rule.typed) {
          const type = m[1];
          if (type && BAD_TYPES.has(type.trim())) return null;
          if (!type) c.needCtor = rule.cpp ? !(c.qualified || name.startsWith("~")) : true;
          if (!type && rule.untypedTop) c.untypedTop = true;
        }
        return c;
      }
      default: return null;
    }
  };

  if (opts.decls) {
    for (const t of opts.decls) {
      const li = (t.line || 0) - 1;
      if (li < 0 || li >= L) continue;
      const kind = t.kind;
      const text0 = mLine(li);
      const cat = /\bcompanion\s+object\b/.test(text0) && lang === "kotlin" ? "ns" : FN_CTAGS.has(kind) ? "fn" : CLASS_CTAGS.has(kind) ? "class" : TYPE_CTAGS.has(kind) ? "type" : IMPL_CTAGS.has(kind) ? "impl" : null;
      if (!cat) continue;
      const text = mLine(li);
      const ls = starts[li];
      const short = String(t.name).split(/::|\./).at(-1);
      let at = text.search(new RegExp(`(?<![\\w$])${short.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w$])`));
      if (at < 0) at = indentOf(text);
      let name = cat === "impl" ? short : String(t.name);
      if (lang === "ruby" || lang === "cpp" || lang === "rust") name = name.replace(/::/g, ".");
      if (lang === "lua") name = name.replace(/:/g, ".");
      const c = { line: li, pos: ls + indentOf(text), scanFrom: ls + at + short.length, name, cat, word: kind, kwPos: ls + indentOf(text), ctags: t, header0: text };
      if (lang === "ruby" || lang === "elixir" || lang === "lua") { const kwm = /\b(def\w*|class|module|defmodule|function)\b/.exec(text); if (kwm) c.kwPos = ls + kwm.index; }
      if (lang === "elixir" && /^\s*def[a-z]*p\b/.test(text)) c.private = true;
      if (lang === "lua" && /^\s*local\b/.test(text)) c.local = true;
      if (cat === "fn" && lang === "go") {
        const gm = /^func\s+\(\s*(?:(\w+)\s+)?\*?\s*(\w+)/.exec(text);
        if (gm) { c.name = `${gm[2]}.${short}`; c.recvVar = gm[1] || null; c.recvType = gm[2]; c.qualified = true; }
      }
      if (cat === "type") c.noBodyOk = true;
      addCand(c);
    }
    // test DSL calls and namespaces are not ctags symbols
    for (let li = 0; li < L; li++) {
      const text = mLine(li);
      for (const rule of spec.decls) {
        if (rule.kind !== "dsl" && rule.kind !== "ns" && rule.kind !== "gtest") continue;
        const m = rule.re.exec(text);
        if (!m) continue;
        const c = fromRule(li, rule, m);
        if (c) addCand(c);
        break;
      }
    }
  } else {
    for (let li = 0; li < L; li++) {
      const text = mLine(li);
      if (!text.trim()) continue;
      for (const rule of spec.decls) {
        const m = rule.re.exec(text);
        if (!m) continue;
        const c = fromRule(li, rule, m);
        if (c) { addCand(c); break; }
      }
    }
  }

  // tagged docs whose declaration no rule recognized -> fallback candidates
  let fallbacks = 0;
  for (const d of docBlocks) {
    if (!hasTags(d.text)) continue;
    let li = d.endLine + 1;
    while (li < L && (blankLine(li) || commentOnly(li) || annLine(mLine(li).trim()))) li++;
    if (li >= L || byLine.has(li)) continue;
    const text = mLine(li), ls = starts[li];
    let m, c = null;
    if (opts.decls) for (const rule of spec.decls) { // ctags missed it: try the language rules first
      const mm = rule.re.exec(text);
      if (mm) { const rc = fromRule(li, rule, mm); if (rc) { rc.fallback = true; addCand(rc); fallbacks++; } break; }
    }
    if (byLine.has(li)) continue;
    const callRx = /([A-Za-z_$][\w$]*[?!]?)\s*(?:<[^<>()]*>)?\s*\(/g;
    let cm;
    while ((cm = callRx.exec(text)) && KEYWORDS.has(cm[1]));
    if ((m = /\b(class|struct|interface|trait|object|enum|module|record|protocol|type|defmodule)\s+([A-Za-z_][\w.]*)/.exec(text)))
      c = { cat: catOfWord(m[1]), name: m[2], scanFrom: ls + m.index + m[0].length, word: m[1] };
    else if ((m = cm))
      c = { cat: "fn", name: m[1], scanFrom: ls + m.index + m[0].length - 1 };
    else if ((m = /(?:^|\s)([A-Za-z_$][\w$]*)\s*[:=]/.exec(text)) && !KEYWORDS.has(m[1]))
      c = { cat: "fn", name: m[1], scanFrom: ls + m.index + m[0].length - 1 };
    if (!c) continue;
    Object.assign(c, { line: li, pos: ls + indentOf(text), kwPos: ls + indentOf(text), fallback: true, header0: text });
    if (lang === "ruby" || lang === "elixir" || lang === "lua") { const kwm = /\b(def\w*|class|module|defmodule|function)\b/.exec(text); if (kwm) c.kwPos = ls + kwm.index; }
    fallbacks++;
    addCand(c);
  }
  cands.sort((a, b) => a.pos - b.pos);

  // ---- header / body per style
  const contLine = (j) => { // j at "\n": does the header continue on the next line?
    const cur = M.slice(starts[li0(j)], j).trim();
    let k = li0(j) + 1;
    while (k < L && !mLine(k).trim()) k++;
    const next = k < L ? mLine(k).trim() : "";
    if (/[,(\[:=|&+\-*/.<]$|->$|=>$|\b(?:throws|extends|implements|where|with|async|override)$/.test(cur)) return true;
    return /^(?:[{:,.)\]]|->|=>|where\b|throws\b|extends\b|implements\b|with\b|async\b|const\b|noexcept\b|override\b|final\b|requires\b|permits\b)/.test(next);
  };
  const braceHeader = (from, fnLike) => {
    let dp = 0;
    const lim = Math.min(n, from + 8000);
    for (let j = from; j < lim; j++) {
      const ch = M[j];
      if (ch === "(" || ch === "[") { dp++; continue; }
      if (ch === ")" || ch === "]") { if (--dp < 0) return { end: j }; continue; }
      if (dp > 0) continue;
      if (ch === "{") return { open: j };
      if (ch === "}" || ch === ";") return { end: j };
      if (fnLike && spec.exprArrow && ch === "=" && M[j + 1] === ">") return { expr: j + 2, sigEnd: j };
      if (fnLike && spec.exprEq && ch === "=" && M[j + 1] !== "=" && M[j + 1] !== ">" && !"=!<>".includes(M[j - 1])) return { expr: j + 1, sigEnd: j };
      if (ch === "\n" && !contLine(j)) return { end: j };
    }
    return { end: lim };
  };
  const exprBody = (from, declIndent, allowBrace = true) => {
    let j = from;
    while (j < n && (M[j] === " " || M[j] === "\t")) j++;
    if (allowBrace && M[j] === "{" && bracePair.has(j)) return { open: j };
    const s = j;
    let dp = 0;
    for (; j < n; j++) {
      const ch = M[j];
      if ("([{".includes(ch)) dp++;
      else if (")]}".includes(ch)) { if (dp === 0) break; dp--; }
      else if (ch === ";" && dp === 0) break;
      else if (ch === "\n" && dp === 0) {
        const so = M.slice(s, j).trim();
        let k = li0(j) + 1;
        while (k < L && !mLine(k).trim()) k++;
        if (k >= L) break;
        const nt = mLine(k), more = indentOf(nt) > declIndent;
        const lastLine = so.split("\n").at(-1);
        if (more && (!so || /[=+\-*/&|,.(?:]$|->$/.test(lastLine) || /^\s*(?:[.?:+\-*/&|]|->)/.test(nt))) continue;
        break;
      }
    }
    let e = j;
    while (e > s && /\s/.test(M[e - 1])) e--;
    return { exprS: s, exprE: e };
  };
  const matchParen = (j) => { // j at "(" in M -> index of ")"
    let d = 0;
    for (; j < n; j++) { if (M[j] === "(") d++; else if (M[j] === ")" && --d === 0) return j; }
    return n;
  };

  const shape = (c) => { // -> {sigEnd, bodyS, bodyE, endPos, bodyLine0, bodyLine1} (bodyS<0: no body)
    const fnLike = c.cat === "fn" || c.cat === "dsl";
    const none = (end) => ({ sigEnd: end, bodyS: -1, bodyE: -1, endPos: end });
    const declIndent = indentOf(mLine(c.line));
    if (c.cat === "dsl") {
      const lim = lineEnd(c.line);
      if (spec.style === "end") {
        const o = firstOpener(c.scanFrom, lang === "lua" ? ["function"] : ["do"], lang === "lua" ? lineEnd(Math.min(L - 1, c.line + 1)) : lim + 1);
        if (o && endPair.has(o.p)) { const bs = o.p + o.w.length, be = endPair.get(o.p); return { sigEnd: o.p, bodyS: bs, bodyE: be, endPos: be + 3, open: o.p }; }
      }
      for (let j = c.scanFrom; j < Math.min(n, lim + 400); j++) {
        if (M[j] === "{" && bracePair.has(j)) return { sigEnd: j, bodyS: j + 1, bodyE: bracePair.get(j), endPos: bracePair.get(j) + 1, brace: j };
        if (M[j] === "\n" && j >= lim && !/[,(]\s*$/.test(M.slice(starts[li0(j)], j))) break;
      }
      return none(lim);
    }
    if (spec.style === "brace" || (spec.style === "end" && false)) {
      const hd = braceHeader(c.scanFrom, fnLike);
      if (hd.open !== undefined) {
        const close = bracePair.get(hd.open);
        if (close === undefined) { approx = true; return { sigEnd: hd.open, bodyS: hd.open + 1, bodyE: n, endPos: n, brace: hd.open }; }
        return { sigEnd: hd.open, bodyS: hd.open + 1, bodyE: close, endPos: close + 1, brace: hd.open };
      }
      if (hd.expr !== undefined) {
        const ex = exprBody(hd.expr, declIndent);
        if (ex.open !== undefined) { const close = bracePair.get(ex.open); return { sigEnd: hd.sigEnd, bodyS: ex.open + 1, bodyE: close, endPos: close + 1, brace: ex.open }; }
        return { sigEnd: hd.sigEnd, bodyS: ex.exprS, bodyE: ex.exprE, endPos: ex.exprE, expr: true };
      }
      return none(hd.end);
    }
    if (spec.style === "end") {
      let lineE = lineEnd(c.line);
      if (lang === "elixir") {
        // header up to `do` (block) or `, do:` (one-liner)
        let dp = 0;
        for (let j = c.scanFrom; j < Math.min(n, c.scanFrom + 4000); j++) {
          const ch = M[j];
          if (ch === "(" || ch === "[" || ch === "{") dp++;
          else if (ch === ")" || ch === "]" || ch === "}") dp--;
          if (dp > 0) continue;
          if (M.startsWith("do:", j) && !IDC.test(M[j - 1] || "")) {
            let sigEnd = j;
            const comma = M.lastIndexOf(",", j);
            if (comma > c.scanFrom - 1 && !M.slice(comma + 1, j).trim()) sigEnd = comma;
            const ex = exprBody(j + 3, indentOf(mLine(c.line)), false);
            return { sigEnd, bodyS: ex.exprS, bodyE: ex.exprE, endPos: ex.exprE, expr: true };
          }
          if (M.startsWith("do", j) && !IDC.test(M[j - 1] || "") && !IDC.test(M[j + 2] || "") && endPair.has(j)) {
            const be = endPair.get(j);
            return { sigEnd: j, bodyS: j + 2, bodyE: be, endPos: be + 3, open: j };
          }
          if (ch === "\n" && !contLine(j) && !/\bwhen\b|,\s*$/.test(M.slice(starts[li0(j)], j))) break;
        }
        if (c.ctags?.end) return ctagsEnd(c);
        return none(lineE);
      }
      // ruby / lua: the decl keyword opens the block
      let kp = c.kwPos;
      if (lang === "lua") { const f = M.indexOf("function", c.pos); kp = f >= 0 && f < lineE + 1 ? f : kp; }
      // header end: after balanced params, at end of line or `;`
      let sigEnd = lineE;
      const paren = M.indexOf("(", c.scanFrom - 1);
      let hs = c.scanFrom;
      if (paren >= 0 && paren <= lineE && !M.slice(c.scanFrom, paren).trim()) hs = matchParen(paren) + 1;
      for (let j = hs; j < n; j++) { if (M[j] === "\n" || M[j] === ";") { sigEnd = j; break; } if (j === n - 1) sigEnd = n; }
      if (lang === "lua") sigEnd = Math.min(sigEnd, hs);
      if (endPair.has(kp)) {
        const be = endPair.get(kp);
        return { sigEnd, bodyS: Math.min(sigEnd + (M[sigEnd] === ";" ? 1 : 0), be), bodyE: be, endPos: be + 3, open: kp };
      }
      if (lang === "ruby" && c.cat === "fn") { // endless def
        const eq = M.slice(c.scanFrom, lineE).search(/(?<![=!<>])=(?![=~>])/);
        if (eq >= 0) { const ex = exprBody(c.scanFrom + eq + 1, indentOf(mLine(c.line)), false); return { sigEnd: c.scanFrom + eq, bodyS: ex.exprS, bodyE: ex.exprE, endPos: ex.exprE, expr: true }; }
      }
      if (c.ctags?.end) return ctagsEnd(c);
      return none(sigEnd);
    }
    if (spec.style === "indent") {
      let dp = 0, colon = -1;
      for (let j = c.scanFrom; j < Math.min(n, c.scanFrom + 4000); j++) {
        const ch = M[j];
        if ("([{".includes(ch)) dp++;
        else if (")]}".includes(ch)) dp--;
        else if (dp <= 0 && ch === spec.colon && (spec.colon !== "=" || (M[j + 1] !== "=" && !"=!<>".includes(M[j - 1])))) { colon = j; if (!M.slice(j + 1, lineEnd(li0(j))).trim()) break; else break; }
        else if (dp <= 0 && ch === "\n") break;
      }
      if (colon < 0) return none(lineEnd(c.line));
      const restLine = M.slice(colon + 1, lineEnd(li0(colon)));
      if (restLine.trim()) return { sigEnd: colon, bodyS: colon + 1, bodyE: lineEnd(li0(colon)), endPos: lineEnd(li0(colon)), expr: true };
      let k = li0(colon) + 1, lastNb = li0(colon);
      while (k < L) {
        const t = mLine(k);
        if (!t.trim()) { k++; continue; }
        if (indentOf(t) <= declIndent && !commentOnly(k)) break;
        lastNb = k; k++;
      }
      return { sigEnd: colon, bodyS: colon + 1, bodyE: lineEnd(lastNb), endPos: lineEnd(lastNb), indent: true };
    }
    if (spec.style === "sql") {
      let dp = 0, sigEnd = -1, depth = 0;
      const rx = /[A-Za-z_]+/y;
      for (let j = c.scanFrom; j < n; j++) {
        const ch = M[j];
        if (ch === "(") { if (dp === 0 && sigEnd < 0 && c.cat === "type") sigEnd = j; dp++; continue; }
        if (ch === ")") { dp--; continue; }
        if (dp > 0) continue;
        if (/[A-Za-z_]/.test(ch) && !/[\w]/.test(M[j - 1] || "")) {
          rx.lastIndex = j;
          const w = rx.exec(M)[0].toLowerCase();
          if (sigEnd < 0 && (w === "as" || w === "is" || w === "begin")) sigEnd = j;
          if (endPair.has(j)) depth++;
          else if (closers.has(j)) depth--;
          j += w.length - 1;
          continue;
        }
        if (ch === ";" && depth === 0) {
          if (sigEnd < 0) sigEnd = j;
          return { sigEnd, bodyS: sigEnd, bodyE: j, endPos: j + 1, sql: true };
        }
      }
      if (sigEnd < 0) sigEnd = n;
      return { sigEnd, bodyS: sigEnd, bodyE: n, endPos: n, sql: true };
    }
    return none(lineEnd(c.line));
  };
  const ctagsEnd = (c) => {
    const el = Math.min(L - 1, c.ctags.end - 1);
    const sigEnd = lineEnd(c.line);
    const m = /\bend\b/.exec(M.slice(starts[el], lineEnd(el)));
    const be = m ? starts[el] + m.index : starts[el];
    return { sigEnd, bodyS: Math.min(sigEnd, be), bodyE: be, endPos: lineEnd(el) };
  };

  for (const c of cands) Object.assign(c, shape(c));

  // ---- containment
  const kept = [];
  const stack = [];
  const dslHolders = new Set();
  for (const c of cands) {
    while (stack.length && !(c.pos > stack.at(-1).bodyS - 1 && c.pos < stack.at(-1).bodyE)) stack.pop();
    const par = stack.at(-1) || null;
    const inFn = stack.some((x) => x.cat === "fn" && !x.dropped);
    const inDsl = stack.some((x) => x.cat === "dsl");
    if (c.cat === "dsl") { if (inFn && !isTest) c.dropped = true; }
    else if (inFn || (inDsl && c.cat === "fn")) c.dropped = true;
    if (c.cat === "ns" || c.cat === "impl") {
      if (c.cat === "impl") { const near = stack.filter((x) => x.cat !== "ns" && !x.dropped).at(-1); c.qname = near && lang !== "rust" ? `${near.qname}.${c.name}` : c.name; }
      if (c.bodyS >= 0) stack.push(c);
      continue;
    }
    // qualified name
    const chain = stack.filter((x) => x.cat !== "ns" && !x.dropped);
    const near = chain.at(-1) || null;
    if (c.cat === "dsl") {
      const ps = [...chain].reverse().find((x) => x.cat === "dsl" || x.cat === "class");
      c.titlePath = ps ? [...(ps.titlePath || [ps.qname]), c.name] : [c.name];
      c.qname = c.titlePath.join(" > ");
      c.parentQ = ps ? ps.qname : null;
      if (ps?.cat === "class") dslHolders.add(ps.qname);
    } else {
      c.qname = near && !c.qualified ? `${near.qname}.${c.name}` : c.name;
      c.parentQ = near && !c.qualified ? (near.cat === "impl" ? near.qname : near.qname) : null;
      c.container = near;
    }
    if (c.needCtor) {
      const simple = near ? near.qname.split(".").at(-1) : null;
      const ok = (simple && c.name === simple) || (c.untypedTop && !near && c.bodyS >= 0) || (lang === "dart" && simple && c.name.startsWith(simple + "."));
      if (!ok) c.dropped = true;
    }
    const abstractOk = c.cat === "fn" && ((near && near.cat === "type") || /\babstract\b/.test(M.slice(c.pos, c.scanFrom)));
    if (c.bodyS < 0 && !c.noBodyOk && !c.fallback && !abstractOk && c.cat !== "dsl" && !c.forceTest && !((c.cat === "class" || c.cat === "type") && lang !== "c" && lang !== "cpp")) {
      if (!above(c.line).doc || !hasTags(above(c.line).doc.text)) c.dropped = true;
    }
    if (c.bodyS >= 0) stack.push(c);
    if (!c.dropped) kept.push(c);
  }

  // ---- class fields (for locals)
  const fieldsOf = new Map(); // qname -> {name: type}
  if (spec.fields) {
    for (const c of kept) {
      if ((c.cat !== "class" && c.cat !== "type") || c.bodyS < 0) continue;
      const inner = kept.filter((x) => x !== c && x.pos > c.bodyS && x.pos < c.bodyE && x.bodyS >= 0).map((x) => [x.pos, x.endPos]);
      let text = "";
      let p = c.bodyS;
      for (const [s, e] of inner.sort((a, b) => a[0] - b[0])) { if (s > p) text += M.slice(p, s); p = Math.max(p, e); }
      text += M.slice(p, c.bodyE);
      const f = {};
      if (spec.fields === "valColonType") {
        const hdr = M.slice(c.scanFrom, c.sigEnd);
        for (const t of [hdr, text]) for (const m of t.matchAll(FIELD_RX.valColonType)) f[m[1]] = m[2];
      } else {
        const rx = FIELD_RX[spec.fields];
        for (const line of text.split("\n")) { const m = rx.exec(line); if (m && !KEYWORDS.has(m[2] || m[1])) { if (spec.fields === "typeName") f[m[2]] = m[1]; else f[m[1]] = m[2]; } }
      }
      fieldsOf.set(c.qname, f);
    }
  }

  // ---- emit
  const classNames = new Set(kept.filter((c) => c.cat === "class" || c.cat === "type").map((c) => c.qname));
  const noComments = (() => { let out = "", last = 0; for (const c of C) { out += src.slice(last, c.s) + src.slice(c.s, c.e).replace(/[^\n]/g, " "); last = c.e; } return out + src.slice(last); })();
  const symbols = [];
  const testish = new Set(dslHolders);
  for (const c of kept) {
    const fnLike = c.cat === "fn" || c.cat === "dsl";
    const { sigLine, annos, doc: d0 } = above(c.line);
    let doc = d0 ? d0.text : null, docSpan = d0 ? { start: d0.startLine + 1, end: d0.endLine + 1 } : null;
    const sigStart = starts[sigLine] + indentOf(mLine(sigLine));
    const hasBody = c.bodyS >= 0;
    let bodyText = hasBody ? src.slice(c.bodyS, c.bodyE) : "";
    if (c.expr || c.sql) bodyText = bodyText.trim();
    if (spec.docInBody && hasBody && !doc) {
      const st = S.find((s) => s.s >= c.bodyS && s.s < c.bodyE);
      if (st && !M.slice(c.bodyS, st.s).trim()) { doc = src.slice(st.cs, st.ce); docSpan = { start: lineOf(st.s), end: lineOf(st.e - 1) }; }
    }
    const header = M.slice(c.pos, c.sigEnd), mods = M.slice(c.pos, Math.max(c.pos, Math.min(c.scanFrom, c.sigEnd)));
    let kind;
    if (c.cat === "dsl") kind = c.suite ? "suite" : "test";
    else if (c.cat === "fn") kind = c.forceTest ? "test" : (c.qname.includes(".") ? "method" : "function");
    else kind = c.cat === "type" ? "type" : "class";
    let test = null;
    if (c.cat === "dsl") test = { titlePath: c.titlePath, mode: hasBody ? c.dslMode : "todo" };
    else if (c.cat === "fn") {
      const tagsDoc = doc && /(^|\s)@(covers|ac|origin)\b/.test(doc);
      const annTest = TEST_ANN.test(annos) || TEST_ANN.test(c.header0 || "");
      const rustTest = lang === "rust" && /#\[(?:[\w:]+::)?test\b/.test(annos);
      const nameTest = /^(?:test[A-Z_0-9]|Test[A-Z_0-9])/.test(c.name.split(".").at(-1)) && (lang !== "go" || /\*testing\.[TB]\b/.test(header));
      if (c.forceTest || rustTest || (isTest && (annTest || nameTest || tagsDoc))) {
        kind = "test";
        const skip = SKIP_ANN.test(annos) || /\bt\.Skip(?:Now|f)?\(|\bmarkTestSkipped\(|\bXCTSkip\b/.test(M.slice(Math.max(0, c.bodyS), Math.max(0, c.bodyE)));
        test = { titlePath: c.qname.split("."), mode: skip ? "skip" : !hasBody ? "todo" : "active" };
        if (c.container) testish.add(c.container.qname);
      }
    }
    let exported = true;
    const last = c.name.split(".").at(-1);
    if (lang === "go") exported = /^[A-Z]/.test(last);
    else if (lang === "rust") exported = /\bpub\b/.test(mods);
    else if (lang === "elixir") exported = !c.private;
    else if (lang === "lua") exported = !c.local;
    else if ((lang === "c" || lang === "cpp") && /\bstatic\b/.test(mods) && !c.container) exported = false;
    else if (lang === "ruby" && c.container && c.cat === "fn" && /^\s*(?:private|protected)\s*$/m.test(M.slice(c.container.bodyS, c.pos))) exported = false;
    else if (lang === "py") exported = !last.startsWith("_");
    else exported = !/\b(?:private|fileprivate)\b/.test(mods);
    const async = fnLike && /\b(?:async|suspend)\b/.test(header);

    // locals
    let locals = {};
    if (fnLike && c.cat === "fn") {
      const fq = c.container ? fieldsOf.get(c.container.qname) : c.recvType ? null : null;
      const fields = fq || (c.recvType ? fieldsOf.get(c.recvType) : null) || (c.container?.cat === "impl" ? fieldsOf.get(c.container.qname) : null);
      if (fields) for (const [k, v] of Object.entries(fields)) {
        locals[`this.${k}`] = v;
        locals[`self.${k}`] = v;
        if (c.recvVar) locals[`${c.recvVar}.${k}`] = v;
        locals[k] = v;
      }
      const po = M.indexOf("(", c.scanFrom - 1);
      if (po >= 0 && po < c.sigEnd) Object.assign(locals, paramLocals(spec.params, M.slice(po + 1, matchParen(po))));
      if (c.recvVar && c.recvType) locals[c.recvVar] = c.recvType;
      locals = Object.fromEntries(Object.entries(locals).sort(([a], [b]) => (a < b ? -1 : 1)));
    }

    // comment lines + stub + calls
    let commentLines = [], stub = false, calleesRaw = [];
    if (fnLike && hasBody && kind !== "suite") {
      for (const cm of C) {
        if (cm.s < c.bodyS || cm.e > c.bodyE) continue;
        const raw = src.slice(cm.s, cm.e);
        if (cm.line) { commentLines.push({ line: lineOf(cm.s), text: raw.slice(cm.open.length).trim() }); continue; }
        raw.slice(cm.open.length, raw.length - cm.close.length).split("\n").forEach((l, k) => {
          const text = l.replace(/^\s*\*(?!\/)\s?/, "").trim();
          if (text) commentLines.push({ line: lineOf(cm.s) + k, text });
        });
      }
      stub = /["'`]{1,3}\s*TODO\(impl\)/.test(noComments.slice(c.bodyS, c.bodyE));
      if (c.cat === "fn") calleesRaw = finishCalls(callsIn(M, c.bodyS, c.bodyE, lang));
    }
    const endPos = Math.max(c.endPos, c.sigEnd);
    const bodySpan = hasBody ? { start: lineOf(c.brace ?? c.open ?? c.bodyS), end: lineOf(Math.max(c.bodyS, (c.brace !== undefined || c.open !== undefined ? c.bodyE : c.bodyE - 1))) } : null;
    symbols.push({
      name: c.qname, kind, parentName: c.parentQ && (classNames.has(c.parentQ) || c.cat === "dsl") ? c.parentQ : null,
      exported, async,
      sigText: src.slice(sigStart, c.sigEnd).trim(),
      doc, bodyText, commentLines, stub, locals, calleesRaw,
      span: { start: lineOf(sigStart), end: lineOf(Math.max(sigStart, endPos - 1)) }, docSpan, bodySpan,
      test,
    });
  }
  // classes holding tests (in test files) are suites; qualified methods attach to classes defined in the file
  for (const s of symbols) {
    if (isTest && s.kind === "class" && testish.has(s.name)) { s.kind = "suite"; s.test = { titlePath: s.name.split("."), mode: "active" }; }
    if (!s.parentName && s.kind !== "test" && s.kind !== "suite" && s.name.includes(".")) {
      let parts = s.name.split(".");
      if (lang === "cpp") while (parts.length > 2 && !classNames.has(parts.slice(0, -1).join("."))) parts = parts.slice(1); // ns::Class::m
      const pre = parts.slice(0, -1).join(".");
      if (classNames.has(pre)) { s.parentName = pre; s.name = parts.join("."); }
    }
  }

  // imports
  const imports = [];
  if (spec.imports) {
    const rx = new RegExp(spec.imports.source, spec.imports.flags.includes("g") ? spec.imports.flags : spec.imports.flags + "g");
    for (const m of src.matchAll(rx)) {
      const at = m.index + m[0].search(/\S/);
      if (M[at] === " " && !/^\s*"/.test(m[0])) continue; // inside a comment/string
      const from = m[1] || m[2];
      if (from) imports.push({ from, names: [] });
    }
  }
  return { symbols, imports, approx, fallbacks };
}

/** best-effort `name(` call scan in masked text [s,e). */
function callsIn(M, s, e, lang) {
  const out = [];
  const rx = /([A-Za-z_$][\w$]*[!?]?)\s*\(/g;
  rx.lastIndex = s;
  let m;
  while ((m = rx.exec(M)) && m.index < e) {
    let name = m[1];
    const p = m.index;
    if (p > 0 && /[\w$]/.test(M[p - 1])) continue;
    if (name.endsWith("!")) continue; // rust macros
    if (KEYWORDS.has(name)) continue;
    const before = M.slice(Math.max(0, p - 12), p);
    if (/\b(?:new|fun|def|fn|func|function|proc|class|struct|void)\s+$|\bnew\s+[\\\w.]+$/.test(before)) continue;
    // qualifier chain
    const q = [];
    let k = p, expr = false;
    for (;;) {
      let b = k - 1;
      while (b >= 0 && (M[b] === " " || M[b] === "\t" || M[b] === "\n" || M[b] === "\r")) b--;
      let sep = 0;
      if (M[b] === "." && M[b - 1] !== ".") { sep = 1; if (M[b - 1] === "?" || M[b - 1] === "!") sep = M[b - 2] === "!" ? 3 : 2; }
      else if (M[b] === ":" && M[b - 1] === ":") sep = 2;
      else if (M[b] === ">" && M[b - 1] === "-") sep = 2;
      else if (M[b] === ":" && lang === "lua") sep = 1;
      if (!sep) break;
      b -= sep;
      while (b >= 0 && (M[b] === " " || M[b] === "\t")) b--;
      let a = b;
      while (a >= 0 && /[\w$@]/.test(M[a])) a--;
      if (a === b) { expr = true; break; }
      q.unshift(M.slice(a + 1, b + 1));
      k = a + 1;
    }
    out.push({ name: name.replace(/[?]$/, lang === "ruby" || lang === "elixir" ? "?" : ""), qualifier: expr ? "(expr)" : q.length ? q.join(".") : null, pos: p });
  }
  return out;
}

export default {
  id: GENERIC_ID,
  approx: true,
  langs: Object.values(LANGS).flatMap((s) => s.exts),
  available: async () => true,
  parse: async (files, ctx) => files.map((f) => parseGeneric(f, ctx?.lang || genericLangOf(f.path), ctx?.config)),
};
