// ts-lite@1: dependency-free TS/JS lexer + recognizer (§E.3.2). Also exports the shared helpers that
// ts-compiler uses, so both adapters slice docs, comments and stub markers identically.
import { isTestFile } from "../config.mjs";

// ---------------------------------------------------------------- lexer
const PUNCTS = [">>>=", "...", "===", "!==", "**=", "<<=", ">>=", ">>>", "&&=", "||=", "??=", "=>", "==", "!=", "<=", ">=", "&&", "||", "??", "?.",
  "++", "--", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "**", "<<", ">>"];
const REGEX_AFTER_KW = new Set(["return", "typeof", "case", "do", "else", "in", "of", "new", "delete", "void", "throw", "instanceof", "yield", "await"]);
const ID_START = /[A-Za-z_$\u0080-￿#]/;
const ID_PART = /[\w$\u0080-￿]/;

/** lex(src) -> {tokens:[{t:"id"|"num"|"str"|"tmpl"|"regex"|"p", v, s, e}], comments:[{s,e}], balanced} */
export function lex(src) {
  const tokens = [], comments = [], stack = [];
  const n = src.length;
  let i = 0, balanced = true;
  const push = (t, s, e) => tokens.push({ t, v: src.slice(s, e), s, e });
  const regexOk = () => {
    const p = tokens.at(-1);
    if (!p) return true;
    if (p.t === "p") return p.v !== ")" && p.v !== "]";
    return p.t === "id" && REGEX_AFTER_KW.has(p.v);
  };
  const template = (s) => { // s = index of "`" or "}" that opens this template chunk
    let j = s + 1;
    while (j < n) {
      const c = src[j];
      if (c === "\\") { j += 2; continue; }
      if (c === "`") { push("tmpl", s, j + 1); return j + 1; }
      if (c === "$" && src[j + 1] === "{") { push("tmpl", s, j + 2); stack.push("tmpl"); return j + 2; }
      j++;
    }
    balanced = false;
    push("tmpl", s, n);
    return n;
  };
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f" || c === "\v" || c === "﻿") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") { const e = src.indexOf("\n", i); const end = e < 0 ? n : e; comments.push({ s: i, e: end }); i = end; continue; }
    if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); const end = e < 0 ? n : e + 2; comments.push({ s: i, e: end }); i = end; continue; }
    if (c === "#" && i === 0 && src[1] === "!") { const e = src.indexOf("\n"); i = e < 0 ? n : e; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      push("str", i, Math.min(j + 1, n)); i = j + 1; continue;
    }
    if (c === "`") { i = template(i); continue; }
    if (c === "}" && stack.at(-1) === "tmpl") { stack.pop(); i = template(i); continue; }
    if (ID_START.test(c)) {
      let j = i + 1;
      while (j < n && ID_PART.test(src[j])) j++;
      push("id", i, j); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(src[i + 1] || ""))) {
      let j = i + 1;
      while (j < n && /[\w.]/.test(src[j])) j++;
      push("num", i, j); i = j; continue;
    }
    if (c === "/" && regexOk()) {
      let j = i + 1, cls = false;
      while (j < n && src[j] !== "\n") {
        if (src[j] === "\\") { j += 2; continue; }
        if (src[j] === "[") cls = true; else if (src[j] === "]") cls = false;
        else if (src[j] === "/" && !cls) break;
        j++;
      }
      if (src[j] === "/") {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        push("regex", i, j); i = j; continue;
      }
    }
    const p = PUNCTS.find((x) => src.startsWith(x, i)) || c;
    if (p === "{") stack.push("{");
    else if (p === "}") stack.pop();
    push("p", i, i + p.length);
    i += p.length;
  }
  return { tokens, comments, balanced };
}

export function lineIndex(src) {
  const starts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === "\n") starts.push(i + 1);
  return (pos) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
}

// ---------------------------------------------------------------- shared helpers (also used by ts-compiler)
/** Last JSDoc comment fully inside [from, to). Returns {doc, docSpan} or {doc:null, docSpan:null}. */
export function docFor(src, comments, from, to, lineOf) {
  let best = null;
  for (const c of comments) {
    if (c.s >= to) break;
    if (c.s >= from && c.e <= to && src.startsWith("/**", c.s) && c.e - c.s >= 5) best = c;
  }
  return best ? { doc: src.slice(best.s + 3, best.e - 2), docSpan: { start: lineOf(best.s), end: lineOf(best.e - 1) } } : { doc: null, docSpan: null };
}

export function commentLinesIn(src, comments, s, e, lineOf) {
  const out = [];
  for (const c of comments) {
    if (c.s < s || c.e > e) continue;
    const raw = src.slice(c.s, c.e);
    if (raw.startsWith("//")) { out.push({ line: lineOf(c.s), text: raw.slice(2).trim() }); continue; }
    raw.slice(2, -2).split("\n").forEach((l, k) => {
      const text = l.replace(/^\s*\*(?!\/)\s?/, "").trim();
      if (text) out.push({ line: lineOf(c.s) + k, text });
    });
  }
  return out;
}

export function stripTsComments(text) {
  const { comments } = lex(text);
  let out = "", last = 0;
  for (const c of comments) { out += text.slice(last, c.s) + " "; last = c.e; }
  return out + text.slice(last);
}

const STUB_TS = /throw\s+new\s+Error\s*\(\s*["'`]TODO\(impl\)/;
export const isStubTs = (bodyText) => STUB_TS.test(stripTsComments(bodyText));

export const TEST_FNS = new Set(["describe", "suite", "it", "test"]);
export const TEST_MODS = new Set(["skip", "todo", "only", "each", "concurrent"]);

export function unquote(raw) {
  const body = raw.slice(1, -1);
  return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|\r?\n|.)/g, (_, e) => {
    if (e[0] === "u") return String.fromCodePoint(parseInt(e.replace(/[u{}]/g, ""), 16));
    if (e[0] === "x") return String.fromCharCode(parseInt(e.slice(1), 16));
    return { n: "\n", t: "\t", r: "\r", b: "\b", f: "\f", v: "\v", 0: "\0" }[e] ?? (/\n/.test(e) ? "" : e);
  });
}

/** Sort raw calls by position and de-duplicate by (qualifier,name). */
export function finishCalls(calls) {
  const seen = new Set(), out = [];
  for (const c of calls.sort((a, b) => a.pos - b.pos)) {
    const k = `${c.qualifier}\0${c.name}`;
    if (!seen.has(k)) { seen.add(k); out.push({ name: c.name, qualifier: c.qualifier }); }
  }
  return out;
}

// ---------------------------------------------------------------- recognizer
const KW = new Set(["if", "for", "while", "switch", "catch", "function", "return", "typeof", "void", "await", "delete", "new", "super", "import",
  "yield", "with", "do", "else", "in", "of", "instanceof", "case", "throw", "class", "const", "let", "var", "export", "default", "extends", "this"]);
const STMT_MODS = new Set(["export", "default", "declare", "abstract", "async"]);
const MEMBER_MODS = new Set(["public", "private", "protected", "static", "readonly", "abstract", "async", "override", "declare", "accessor"]);
const CONT_PREV = new Set(["=", ",", ":", "|", "&", "?", "(", "[", "{", "+", "-", "*", "/", "%", ".", "?.", "=>", "&&", "||", "??", "!", "...", "==", "===", "!=", "!=="]);
const CONT_NEXT = new Set([".", "?.", "?", ":", "|", "&", "=", "=>", ")", "]", "}", "&&", "||", "??", "+", "*", "/", ",", "as", "satisfies", "extends", "==", "===", "!=", "!=="]);
export const PRIMITIVES = new Set(["string", "number", "boolean", "any", "unknown", "void", "never", "object", "symbol", "bigint", "undefined", "null"]);
const TYPE_BRACE_PREV = new Set([":", "|", "&", "<", ",", "(", "=>", "?", "=", "extends", "keyof", "typeof"]);

function recognizer(src, path, isTest) {
  const { tokens: T, comments: C, balanced } = lex(src);
  const lineOf = lineIndex(src);
  const M = new Int32Array(T.length).fill(-1);
  let approx = !balanced;
  const st = [];
  T.forEach((t, k) => {
    if (t.t !== "p") return;
    if (t.v === "(" || t.v === "[" || t.v === "{") st.push(k);
    else if (t.v === ")" || t.v === "]" || t.v === "}") {
      const want = { ")": "(", "]": "[", "}": "{" }[t.v];
      while (st.length && T[st.at(-1)].v !== want) { st.pop(); approx = true; }
      if (st.length) { const o = st.pop(); M[o] = k; M[k] = o; } else approx = true;
    }
  });
  if (st.length) approx = true;

  const is = (k, v) => T[k] && T[k].v === v && (T[k].t === "p" || T[k].t === "id");
  const isId = (k) => T[k] && T[k].t === "id";
  const close = (k) => (M[k] >= 0 ? M[k] : T.length - 1);
  const line = (k) => lineOf(T[k].s);
  const symbols = [], imports = [];

  const skipAngles = (k) => { // k at "<" -> index after matching ">"
    let d = 0;
    for (; k < T.length; k++) {
      const v = T[k].v;
      if (T[k].t !== "p") continue;
      if (v === "(" || v === "[" || v === "{") { k = close(k); continue; }
      if (v === "<") d++;
      else if (/^>+=?$/.test(v)) { d -= v.replace("=", "").length; if (d <= 0) return k + 1; }
      else if (v === ";") return k;
    }
    return k;
  };
  const stmtStart = (k, from) => {
    if (k === from) return true;
    const p = T[k - 1];
    if (p.t === "p" && (p.v === ";" || p.v === "}" || p.v === "{")) return true;
    return line(k - 1) < line(k) && !CONT_PREV.has(p.v);
  };
  const endOfExpr = (k, to, type = false) => { // returns index after the expression (consumes a trailing ";")
    for (let j = k; j < to; j++) {
      const t = T[j];
      if (type && t.t === "p" && t.v === "<") { j = skipAngles(j) - 1; continue; }
      if (j > k && line(j) > line(j - 1) && !CONT_PREV.has(T[j - 1].v) && !CONT_NEXT.has(t.v)) return j;
      if (t.t === "p" && (t.v === "(" || t.v === "[" || t.v === "{")) { j = close(j); continue; }
      if (t.t === "p" && (t.v === ";" )) return j + 1;
      if (t.t === "p" && (t.v === ")" || t.v === "]" || t.v === "}" || t.v === ",")) return j;
    }
    return to;
  };
  const lastBefore = (end) => { // last token index before `end` that is not ";"
    let j = end - 1;
    if (T[j] && T[j].v === ";") j--;
    return j;
  };
  const findBody = (k, to) => { // after params/heritage -> index of body "{" or -1 (with .end)
    for (let j = k; j < to; j++) {
      const t = T[j];
      if (t.t === "p" && t.v === "{") {
        const p = T[j - 1];
        if (j > k && TYPE_BRACE_PREV.has(p.v)) { j = close(j); continue; }
        return { open: j, end: close(j) + 1 };
      }
      if (t.t === "p" && (t.v === "(" || t.v === "[")) { j = close(j); continue; }
      if (t.t === "p" && t.v === "<") { j = skipAngles(j) - 1; continue; }
      if (t.t === "p" && (t.v === ";" || t.v === "}")) return { open: -1, end: t.v === ";" ? j + 1 : j };
      if (j > k && line(j) > line(j - 1) && isId(j) && ["function", "export", "async", "declare"].includes(t.v)) return { open: -1, end: j };
    }
    return { open: -1, end: to };
  };
  const typeRef = (a, b) => { // tokens [a,b) form a simple TypeReference? -> name text
    if (!isId(a) || KW.has(T[a].v) || PRIMITIVES.has(T[a].v)) return null;
    let j = a + 1, name = T[a].v;
    while (j + 1 < b && is(j, ".") && isId(j + 1)) { name += "." + T[j + 1].v; j += 2; }
    if (j < b && is(j, "<")) j = skipAngles(j);
    return j === b ? name : null;
  };
  const params = (open) => { // -> {locals, props}
    const locals = {}, props = {};
    const end = close(open);
    let a = open + 1;
    const one = (s, e) => {
      let j = s, prop = false;
      while (j < e && isId(j) && ["public", "private", "protected", "readonly", "override"].includes(T[j].v) && isId(j + 1)) { prop = true; j++; }
      if (is(j, "...")) j++;
      if (!isId(j) || T[j].v === "this") return;
      const name = T[j].v;
      j++;
      if (is(j, "?")) j++;
      if (!is(j, ":")) return;
      let k = j + 1, stop = e;
      for (let q = k; q < e; q++) { if (T[q].t === "p" && (T[q].v === "(" || T[q].v === "[" || T[q].v === "{")) { q = close(q); continue; } if (is(q, "=")) { stop = q; break; } }
      const ty = typeRef(k, stop);
      if (ty) { locals[name] = ty; if (prop) props["this." + name] = ty; }
    };
    for (let j = a; j <= end; j++) {
      if (j === end || is(j, ",")) { if (j > a) one(a, j); a = j + 1; continue; }
      if (T[j].t === "p" && (T[j].v === "(" || T[j].v === "[" || T[j].v === "{")) j = close(j);
      else if (is(j, "<")) j = skipAngles(j) - 1;
    }
    return { locals, props };
  };
  const callsIn = (s, e) => { // token index range [s,e)
    const out = [];
    for (let k = s; k < e; k++) {
      const dotted = k > 0 && (is(k - 1, ".") || is(k - 1, "?."));
      if (!isId(k) || (KW.has(T[k].v) && !dotted) || !is(k + 1, "(")) continue;
      const after = close(k + 1) + 1;
      if (is(after, "{") || is(after, "=>")) continue; // method definition / arrow params
      if (k > s && is(k - 1, "function")) continue;
      let m = k, q = [], expr = false;
      while (m - 2 >= 0 && (is(m - 1, ".") || is(m - 1, "?."))) {
        const p = T[m - 2];
        const pDotted = m - 3 >= 0 && (is(m - 3, ".") || is(m - 3, "?."));
        if (p.t === "id" && (!KW.has(p.v) || p.v === "this" || p.v === "super" || pDotted)) { q.unshift(p.v); m -= 2; }
        else { expr = true; break; }
      }
      if (!expr && m > 0 && is(m - 1, "new")) continue;
      out.push({ name: T[k].v, qualifier: expr ? "(expr)" : q.length ? q.join(".") : null, pos: T[k].s });
    }
    return out;
  };
  const extras = (bodyS, bodyE, kind) => {
    const bodyText = bodyS < 0 ? "" : src.slice(bodyS, bodyE);
    const fnLike = kind === "function" || kind === "method" || kind === "test";
    return {
      bodyText,
      commentLines: fnLike && bodyS >= 0 ? commentLinesIn(src, C, bodyS, bodyE, lineOf) : [],
      stub: fnLike && bodyS >= 0 ? isStubTs(bodyText) : false,
    };
  };
  const tokIdxAt = (pos) => { // first token index with s >= pos
    let lo = 0, hi = T.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (T[mid].s < pos) lo = mid + 1; else hi = mid; }
    return lo;
  };
  const emit = (o) => {
    const { doc, docSpan } = docFor(src, C, o.docFrom, o.sigStart, lineOf);
    const ex = o.block ? extras(T[o.block].e, T[close(o.block)].s, o.kind)
      : o.expr ? extras(T[o.expr[0]].s, T[o.expr[1]].e, o.kind) : extras(-1, -1, o.kind);
    const bodyTok = o.block ? [o.block + 1, close(o.block)] : o.expr ? [o.expr[0], o.expr[1] + 1] : null;
    const fnLike = o.kind === "function" || o.kind === "method" || o.kind === "test";
    symbols.push({
      name: o.name, kind: o.kind, parentName: o.parentName ?? null, exported: !!o.exported, async: !!o.async,
      sigText: src.slice(o.sigStart, o.sigEnd).trim(),
      doc, bodyText: ex.bodyText, commentLines: ex.commentLines, stub: ex.stub,
      locals: o.locals || {}, calleesRaw: fnLike && bodyTok ? finishCalls(callsIn(bodyTok[0], bodyTok[1])) : [],
      span: { start: lineOf(o.sigStart), end: lineOf(o.endPos - 1) }, docSpan,
      bodySpan: o.block ? { start: line(o.block), end: line(close(o.block)) } : o.expr ? { start: line(o.expr[0]), end: line(o.expr[1]) } : null,
      test: o.test || null,
    });
  };

  let pending = null; // overload: {name, sigStart, docFrom}
  const withOverload = (name, sigStart, docFrom, hasBody) => {
    if (!hasBody) { if (!pending || pending.name !== name) pending = { name, sigStart, docFrom }; return null; }
    const r = pending && pending.name === name ? pending : { sigStart, docFrom };
    pending = null;
    return r;
  };

  function parseImport(k) {
    let j = k + 1;
    const from = (q) => (T[q] && T[q].t === "str" ? unquote(T[q].v) : null);
    if (T[j]?.t === "str") { imports.push({ from: from(j), names: [] }); return endOfExpr(j + 1, T.length); }
    let typeOnly = false;
    if (is(j, "type") && !is(j + 1, "from") && !is(j + 1, ",")) { typeOnly = true; j++; }
    const names = [];
    if (isId(j) && !is(j, "from")) { names.push({ name: "default", alias: T[j].v, typeOnly }); j++; if (is(j, ",")) j++; }
    if (is(j, "*") && is(j + 1, "as")) { names.push({ name: "*", alias: T[j + 2].v, typeOnly }); j += 3; }
    else if (is(j, "{")) {
      const end = close(j);
      let q = j + 1;
      while (q < end) {
        let t = typeOnly;
        if (is(q, "type") && isId(q + 1) && !is(q + 1, "as")) { t = true; q++; }
        else if (is(q, "type") && is(q + 1, "as") && is(q + 2, "as")) { t = true; q++; }
        const name = T[q].t === "str" ? unquote(T[q].v) : T[q].v;
        q++;
        let alias = null;
        if (is(q, "as")) { alias = T[q + 1].v; q += 2; }
        names.push({ name, alias, typeOnly: t });
        while (q < end && !is(q, ",")) q++;
        q++;
      }
      j = end + 1;
    }
    if (is(j, "from") && T[j + 1]?.t === "str") { imports.push({ from: from(j + 1), names }); return endOfExpr(j + 2, T.length); }
    return j;
  }

  function parseClass(start, k, mods, docFrom, to) {
    let j = k + 1;
    const name = isId(j) && !["extends", "implements"].includes(T[j].v) ? T[j++].v : "default";
    const { open } = findBody(j, to);
    if (open < 0) return j;
    const exported = mods.includes("export");
    const cls = { name, kind: "class", exported, sigStart: T[start].s, sigEnd: T[open].s, docFrom, block: open, endPos: T[close(open)].e, locals: {} };
    emit(cls);
    const classLocals = {}, members = [];
    const end = close(open);
    let i = open + 1;
    while (i < end) {
      if (is(i, ";")) { i++; continue; }
      const mStart = i, mDocFrom = T[i - 1].e;
      while (is(i, "@")) { i++; while (isId(i) && is(i + 1, ".")) i += 2; i++; if (is(i, "(")) i = close(i) + 1; }
      const mods2 = [];
      for (;;) {
        const v = T[i]?.v;
        if (isId(i) && (MEMBER_MODS.has(v) || v === "get" || v === "set") && !["(", ":", "=", ";", "?", "!", "<"].includes(T[i + 1]?.v) && line(i + 1) === line(i)) { mods2.push(v); i++; }
        else break;
      }
      if (is(i, "*")) i++;
      let mname;
      if (is(i, "[")) { mname = src.slice(T[i].s, T[close(i)].e); i = close(i) + 1; }
      else if (T[i]) { mname = T[i].t === "str" ? unquote(T[i].v) : T[i].v; i++; }
      if (is(i, "?") || is(i, "!")) i++;
      if (is(i, "(") || is(i, "<")) {
        let p = i;
        if (is(p, "<")) p = skipAngles(p);
        const { locals, props } = params(p);
        const body = findBody(close(p) + 1, end);
        const nm = mods2.includes("set") ? `${mname}$set` : mname;
        const ov = withOverload(`${name}.${nm}`, T[mStart].s, mDocFrom, body.open >= 0);
        if (ov) {
          Object.assign(classLocals, props);
          if (nm === "constructor") for (let q = body.open; q < close(body.open); q++) {
            if (is(q, "this") && is(q + 1, ".") && isId(q + 2) && is(q + 3, "=") && is(q + 4, "new")) {
              let r = q + 5, ty = isId(r) ? T[r].v : null;
              while (ty && is(r + 1, ".") && isId(r + 2)) { ty += "." + T[r + 2].v; r += 2; }
              if (ty && (is(r + 1, "(") || is(r + 1, "<"))) classLocals["this." + T[q + 2].v] = ty;
            }
          }
          members.push({ name: `${name}.${nm}`, kind: "method", parentName: name, exported: exported && !mods2.includes("private") && !String(mname).startsWith("#"),
            async: mods2.includes("async"), sigStart: ov.sigStart, sigEnd: T[body.open].s, docFrom: ov.docFrom, block: body.open, endPos: T[close(body.open)].e, locals });
        }
        i = body.end;
      } else {
        if (is(i, ":")) {
          let stop = endOfExpr(i + 1, end), e = stop;
          for (let q = i + 1; q < stop; q++) if (is(q, "=")) { e = q; break; }
          const ty = typeRef(i + 1, e < stop ? e : lastBefore(stop) + 1);
          if (ty && mname) classLocals["this." + mname] = ty;
          i = stop;
        } else i = is(i, "=") ? endOfExpr(i + 1, end) : Math.max(i, mStart + 1);
      }
    }
    pending = null;
    for (const m of members) { m.locals = { ...classLocals, ...m.locals }; emit(m); }
    return end + 1;
  }

  function parseVar(start, k, mods, docFrom, to) {
    let j = k + 1;
    if (!isId(j)) return endOfExpr(j, to);
    const name = T[j].v;
    j++;
    if (is(j, "!")) j++;
    if (is(j, ":")) { while (j < to && !is(j, "=") && !is(j, ";")) { if (T[j].t === "p" && "([{".includes(T[j].v)) j = close(j); else if (is(j, "<")) { j = skipAngles(j); continue; } j++; } }
    if (!is(j, "=")) return endOfExpr(j, to);
    j++;
    let async = false;
    if (is(j, "async") && !is(j + 1, "=>")) { async = true; j++; }
    const base = { name, kind: "function", exported: mods.includes("export"), async, sigStart: T[start].s, docFrom };
    if (is(j, "function")) {
      let p = j + 1;
      if (is(p, "*")) p++;
      if (isId(p)) p++;
      if (is(p, "<")) p = skipAngles(p);
      if (!is(p, "(")) return endOfExpr(j, to);
      const { locals } = params(p);
      const body = findBody(close(p) + 1, to);
      if (body.open < 0) return body.end;
      const end = endOfExpr(close(body.open) + 1, to);
      emit({ ...base, sigEnd: T[body.open].s, block: body.open, endPos: T[lastBefore(end)].e, locals: locals });
      return end;
    }
    let p = j, arrow = -1, locals = {};
    if (is(p, "<")) p = skipAngles(p);
    if (is(p, "(")) {
      locals = params(p).locals;
      let q = close(p) + 1;
      if (is(q, ":")) { for (; q < to; q++) { if (is(q, "=>")) break; if (T[q].t === "p" && "([{".includes(T[q].v)) q = close(q); else if (is(q, ";")) break; } }
      if (is(q, "=>")) arrow = q;
    } else if (isId(p) && is(p + 1, "=>")) arrow = p + 1;
    if (arrow < 0) return endOfExpr(j, to);
    let o;
    let end;
    if (is(arrow + 1, "{")) {
      end = endOfExpr(close(arrow + 1) + 1, to);
      o = { ...base, sigEnd: T[arrow].s, block: arrow + 1, endPos: T[lastBefore(end)].e, locals };
    } else {
      end = endOfExpr(arrow + 1, to);
      const last = lastBefore(end);
      o = { ...base, sigEnd: T[arrow].s, expr: [arrow + 1, last], endPos: T[last].e, locals };
    }
    emit(o);
    return end;
  }

  function parseTest(k, scope, docFrom, to) {
    const fn = T[k].v;
    let j = k + 1, mode = "active";
    const tmods = [];
    while (is(j, ".") && isId(j + 1) && TEST_MODS.has(T[j + 1].v)) { tmods.push(T[j + 1].v); j += 2; }
    if (tmods.includes("each")) { if (!is(j, "(")) return j; j = close(j) + 1; }
    if (!is(j, "(")) return j;
    const open = j, cl = close(open);
    const args = [];
    let a = open + 1;
    for (let q = a; q <= cl; q++) {
      if (q === cl || is(q, ",")) { if (q > a) args.push([a, q]); a = q + 1; continue; }
      if (T[q].t === "p" && "([{".includes(T[q].v)) q = close(q);
    }
    if (!args.length) return cl + 1;
    const [t0, t1] = args[0];
    const single = t1 - t0 === 1 ? T[t0] : null;
    const title = single && single.t === "str" ? unquote(single.v)
      : single && single.t === "tmpl" && single.v.endsWith("`") && single.v.startsWith("`") ? unquote(single.v) : src.slice(T[t0].s, T[t1 - 1].e);
    let block = -1, expr = null;
    for (const [s, e] of args.slice(1)) {
      let q = s;
      if (is(q, "async")) q++;
      if (is(q, "function")) { q++; if (is(q, "*")) q++; if (isId(q)) q++; if (is(q, "(")) { const b = findBody(close(q) + 1, e); if (b.open >= 0) { block = b.open; break; } } }
      let arrow = -1;
      if (is(q, "(")) { let r = close(q) + 1; if (is(r, ":")) while (r < e && !is(r, "=>")) r++; if (is(r, "=>")) arrow = r; }
      else if (isId(q) && is(q + 1, "=>")) arrow = q + 1;
      if (arrow >= 0) { if (is(arrow + 1, "{")) block = arrow + 1; else expr = [arrow + 1, e - 1]; break; }
    }
    const isSuite = fn === "describe" || fn === "suite";
    if (tmods.includes("todo") || (block < 0 && !expr)) mode = "todo";
    else if (tmods.includes("skip")) mode = "skip";
    const titlePath = [...scope.path, title];
    const name = titlePath.join(" > ");
    const end = is(cl + 1, ";") ? cl + 2 : cl + 1;
    emit({ name, kind: isSuite ? "suite" : "test", parentName: scope.parent, sigStart: T[k].s, sigEnd: T[t1 - 1].e, docFrom,
      block: block >= 0 ? block : null, expr, endPos: T[cl].e, test: { titlePath, mode } });
    if (isSuite && block >= 0) statements(block + 1, close(block), { path: titlePath, parent: name });
    return end;
  }

  function statements(from, to, scope) {
    let i = from;
    while (i < to) {
      const start = i;
      if (!stmtStart(i, from)) { i = T[i].t === "p" && "([{".includes(T[i].v) ? close(i) + 1 : i + 1; continue; }
      const docFrom = i > 0 ? T[i - 1].e : 0;
      while (is(i, "@")) { i++; while (isId(i) && is(i + 1, ".")) i += 2; i++; if (is(i, "(")) i = close(i) + 1; }
      const mods = [];
      while (isId(i) && STMT_MODS.has(T[i].v) && isId(i + 1) && line(i + 1) === line(i)) mods.push(T[i++].v);
      const v = isId(i) ? T[i].v : null;
      let next = -1;
      if (v === "function" && scope.top) {
        let j = i + 1;
        if (is(j, "*")) j++;
        const name = isId(j) && !is(j, "(") ? T[j++].v : "default";
        if (is(j, "<")) j = skipAngles(j);
        if (is(j, "(")) {
          const { locals } = params(j);
          const body = findBody(close(j) + 1, to);
          const ov = withOverload(name, T[start].s, docFrom, body.open >= 0);
          if (ov) emit({ name, kind: "function", exported: mods.includes("export"), async: mods.includes("async"), sigStart: ov.sigStart, sigEnd: T[body.open].s,
            docFrom: ov.docFrom, block: body.open, endPos: T[close(body.open)].e, locals });
          next = body.end;
        }
      } else if (v === "class" && scope.top) next = parseClass(start, i, mods, docFrom, to);
      else if ((v === "interface" || v === "enum" || (v === "const" && is(i + 1, "enum"))) && scope.top && isId(i + (v === "const" ? 2 : 1))) {
        const nk = i + (v === "const" ? 2 : 1);
        const { open } = findBody(nk + 1, to);
        if (open >= 0) {
          emit({ name: T[nk].v, kind: "type", exported: mods.includes("export"), sigStart: T[start].s, sigEnd: T[open].s, docFrom, block: open, endPos: T[close(open)].e });
          next = close(open) + 1;
        }
      } else if (v === "type" && scope.top && isId(i + 1) && (is(i + 2, "=") || is(i + 2, "<"))) {
        let j = i + 2;
        if (is(j, "<")) j = skipAngles(j);
        const end = endOfExpr(j + 1, to, true);
        emit({ name: T[i + 1].v, kind: "type", exported: mods.includes("export"), sigStart: T[start].s, sigEnd: T[lastBefore(end)].e, docFrom, endPos: T[end - 1].e });
        next = end;
      } else if ((v === "const" || v === "let" || v === "var") && scope.top) next = parseVar(start, i, mods, docFrom, to);
      else if (v === "import" && scope.top && !is(i + 1, "(") && !is(i + 1, ".")) next = parseImport(i);
      else if (v && isTest && TEST_FNS.has(v) && !mods.length) next = parseTest(i, scope, docFrom, to);
      if (pending && v !== "function" && next >= 0) pending = null;
      i = next > i ? next : i === start ? (T[i].t === "p" && "([{".includes(T[i].v) ? close(i) + 1 : i + 1) : i;
    }
  }

  statements(0, T.length, { top: true, path: [], parent: null });
  return { symbols, imports, approx };
}

export function parseTsLite(file, config) {
  const res = { path: file.path, lang: "ts", imports: [], symbols: [], warnings: [], parseError: null };
  try {
    const r = recognizer(file.content, file.path, isTestFile(file.path, config));
    res.imports = r.imports;
    res.symbols = r.symbols;
    if (r.approx) res.warnings.push({ code: "LITE_APPROX", message: "unbalanced brackets or unterminated literal; ts-lite results are approximate", line: null });
  } catch (e) {
    res.parseError = `ts-lite: ${e.message}`;
  }
  return res;
}

export default {
  id: "ts-lite@1",
  langs: ["ts", "tsx", "mts", "cts", "js", "jsx", "mjs", "cjs"],
  available: async () => true,
  parse: async (files, ctx) => files.map((f) => parseTsLite(f, ctx?.config)),
};
