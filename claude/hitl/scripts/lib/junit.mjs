// P2 — minimal JUnit XML ingestion (§E.6.1). No dependencies.
import { isAbsolute, relative, sep } from "node:path";

const ENT = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'" };
function decodeOnce(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|lt|gt|amp|quot|apos);/g, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e]);
}
// node:test double-escapes quotes in names (&amp;quot;); a second pass only for quote/apos entities fixes it.
export const decode = (s) => decodeOnce(s).replace(/&(quot|apos);/g, (m, e) => ENT[e]);

function attrs(src) {
  const o = {};
  const re = /([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src))) o[m[1]] = decode(m[3] ?? m[4] ?? "");
  return o;
}

/**
 * Parse JUnit XML into flat cases.
 * @returns {{name, classname, file, suites:string[], outcome:"pass"|"fail"|"error"|"skip", message}[]}
 */
export function parseJUnit(xml) {
  const cases = [];
  const suites = [];
  let cur = null; let child = null; let text = "";
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
  let m; let last = 0;
  const flushText = (upto) => { if (child) text += decode(xml.slice(last, upto)); };
  while ((m = re.exec(xml))) {
    flushText(m.index); last = re.lastIndex;
    if (m[1] !== undefined) { if (child) text += m[1]; continue; }
    if (!m[3]) continue; // comment / PI
    const closing = m[2] === "/"; const tag = m[3]; const selfClose = m[5] === "/";
    const a = closing ? {} : attrs(m[4] || "");
    if (tag === "testsuite") {
      if (closing) suites.pop(); else if (!selfClose) suites.push(a.name || "");
    } else if (tag === "testcase") {
      if (closing) { if (cur) cases.push(finish(cur)); cur = null; }
      else {
        cur = { name: a.name || "", classname: a.classname || "", file: a.file || null, suites: suites.slice(), outcome: "pass", message: "", _detail: "" };
        if (selfClose) { cases.push(finish(cur)); cur = null; }
      }
    } else if (cur && (tag === "failure" || tag === "error" || tag === "skipped")) {
      if (closing) { if (child) applyChild(cur, child, text); child = null; text = ""; }
      else {
        const c = { tag, message: a.message || "" };
        if (selfClose) applyChild(cur, c, ""); else { child = c; text = ""; }
      }
    }
  }
  return cases;
}
const SEV = { pass: 0, skip: 1, fail: 2, error: 3 };
function applyChild(cur, c, text) {
  const outcome = c.tag === "failure" ? "fail" : c.tag === "error" ? "error" : "skip";
  if (SEV[outcome] < SEV[cur.outcome]) return;
  cur.outcome = outcome;
  let msg = c.message && c.message !== "true" ? c.message : "";
  const t = text.trim();
  if (!msg) msg = t.split("\n").find((l) => l.trim()) || "";
  if (!msg.includes("TODO(impl)") && t.includes("TODO(impl)")) msg = (msg ? msg + " | " : "") + t.split("\n").find((l) => l.includes("TODO(impl)")).trim();
  cur.message = msg;
}
function finish(c) { delete c._detail; c.message = c.message.replace(/\s+/g, " ").trim().slice(0, 200); return c; }

const AGG = { skip: 0, pass: 1, fail: 2, error: 3 };
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const stripParam = (s) => s.replace(/\[.*\]$/, "");

function relFile(f, root) {
  if (!f) return null;
  let p = String(f).replace(/^file:\/\//, "");
  if (isAbsolute(p) && root) p = relative(root, p);
  return p.split(sep).join("/").replace(/^\.\//, "");
}

/**
 * Match parsed cases to index test symbols (rules 1–3 of §E.6.1).
 * @param cases parseJUnit output; @param index hitl.index/1; @param opts {root, files?: rel test files that were run}
 * @returns {{matched:[{testId, outcome, message}], unmatched:[{name, classname, file}]}}
 */
export function matchCases(cases, index, { root, files } = {}) {
  const tests = Object.entries(index?.symbols || {}).filter(([, s]) => s.kind === "test");
  const byFile = new Map();
  for (const [id, s] of tests) { if (!byFile.has(s.file)) byFile.set(s.file, []); byFile.get(s.file).push([id, s]); }
  const ranSet = files ? new Set(files) : null;
  const tp = (s) => (s.test?.titlePath || [s.name]).map(norm);
  const leaf = (s) => { const p = tp(s); return p[p.length - 1]; };
  const nameMatches = (c, s) => {
    const n = norm(c.name); const p = tp(s);
    if (n === p[p.length - 1] || n === p.join(" > ") || n === p.join(" ")) return true;
    const full = c.suites.map(norm).filter(Boolean).concat(n);
    for (let k = 0; k < full.length; k++) if (full.slice(k).join("\u0000") === p.join("\u0000")) return true;
    return false;
  };
  const agg = new Map(); const unmatched = [];
  for (const c of cases) {
    let hit = null;
    // rule 1: file attr (or classname that is a path) + name
    const f = relFile(c.file, root) || (/[\\/]|\.(m?[jt]sx?|cjs|py)$/.test(c.classname) ? relFile(c.classname, root) : null);
    if (f && byFile.has(f)) {
      const cand = byFile.get(f).filter(([, s]) => nameMatches(c, s));
      if (cand.length === 1) hit = cand[0][0];
      else if (cand.length > 1) { const exact = cand.filter(([, s]) => c.suites.map(norm).concat(norm(c.name)).join(" > ").endsWith(tp(s).join(" > "))); if (exact.length >= 1) hit = exact[0][0]; }
    }
    // rule 2: python dotted classname -> path.py (+ optional class)
    const pyLike = c.classname && /^[\w.]+$/.test(c.classname) && !/\.(m?[jt]sx?|cjs)$/.test(c.classname);
    if (!hit && pyLike) {
      const parts = c.classname.split(".");
      const fn = stripParam(norm(c.name));
      for (let k = parts.length; k >= 1 && !hit; k--) {
        const base = parts.slice(0, k).join("/") + ".py";
        const candFiles = [...byFile.keys()].filter((p) => p === base || p.endsWith("/" + base));
        const cls = parts[k] || null;
        for (const pf of candFiles) {
          const cand = byFile.get(pf).filter(([, s]) => { const p = tp(s); return p[p.length - 1] === fn && (!cls || p[0] === cls || (p.length === 1 && k === parts.length)); });
          if (cand.length === 1) { hit = cand[0][0]; break; }
        }
      }
    }
    // rule 3: project-wide unique title match (leaf, or joined title path); prefer files that were run
    if (!hit) {
      const pool = ranSet ? tests.filter(([, s]) => ranSet.has(s.file)) : tests;
      for (const P of ranSet ? [pool, tests] : [tests]) {
        const n = norm(c.name);
        let cand = P.filter(([, s]) => { const p = tp(s); return n === p.join(" > ") || n === p.join(" "); });
        if (cand.length !== 1) cand = P.filter(([, s]) => leaf(s) === n || leaf(s) === stripParam(n));
        if (cand.length === 1) { hit = cand[0][0]; break; }
      }
    }
    if (!hit) { unmatched.push({ name: c.name, classname: c.classname, file: c.file, outcome: c.outcome }); continue; }
    const prev = agg.get(hit);
    if (!prev || AGG[c.outcome] > AGG[prev.outcome]) agg.set(hit, { testId: hit, outcome: c.outcome, message: c.message });
  }
  return { matched: [...agg.values()].sort((a, b) => (a.testId < b.testId ? -1 : 1)), unmatched };
}
