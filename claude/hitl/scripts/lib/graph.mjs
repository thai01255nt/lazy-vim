// Import resolution, call graph (callees/callers), @covers/@calls resolution and ref lookup (§G P1 graph rules).
import { posix } from "node:path";

const TEST_KINDS = new Set(["test", "suite"]);
const GLOBALS = new Set(["console", "Math", "JSON", "Object", "Array", "Promise", "String", "Number", "Date", "process", "assert", "expect", "Reflect",
  "Symbol", "Buffer", "window", "document", "globalThis", "os", "sys", "re", "json", "math", "str", "list", "dict", "set", "tuple", "super"]);
const TS_EXTS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];

export const fileOfId = (id) => id.slice(0, id.indexOf("#"));
export const nameOfId = (id) => id.slice(id.indexOf("#") + 1);

export function resolveImport(from, spec, lang, has) {
  if (!spec) return null;
  if (lang === "py") {
    const level = spec.match(/^\.*/)[0].length;
    const mod = spec.slice(level).replace(/\./g, "/");
    let bases;
    if (level) {
      let dir = posix.dirname(from);
      for (let i = 1; i < level; i++) dir = posix.dirname(dir);
      dir = dir === "." ? "" : dir;
      bases = [mod ? (dir ? `${dir}/${mod}` : mod) : dir];
    } else {
      const d = posix.dirname(from);
      bases = [mod, `src/${mod}`, d === "." ? null : `${d}/${mod}`].filter(Boolean);
    }
    for (const b of bases) for (const c of [`${b}.py`, b ? `${b}/__init__.py` : "__init__.py"]) if (has(c)) return c;
    return null;
  }
  if (!spec.startsWith(".")) return null;
  const base = posix.normalize(posix.join(posix.dirname(from), spec));
  const stem = base.replace(/\.(m|c)?jsx?$/, "");
  const cands = [base, ...TS_EXTS.map((e) => base + e), ...[".ts", ".tsx", ".mts", ".cts"].map((e) => stem + e), ...TS_EXTS.map((e) => `${base}/index${e}`)];
  return cands.find(has) || null;
}

const maps = new WeakMap();
function nameMaps(index) {
  if (maps.has(index)) return maps.get(index);
  const byName = new Map(), bySuffix = new Map(), tests = new Map();
  const add = (m, k, id) => { if (!m.has(k)) m.set(k, []); m.get(k).push(id); };
  for (const [id, s] of Object.entries(index.symbols)) {
    if (TEST_KINDS.has(s.kind)) { add(tests, s.name, id); continue; }
    add(byName, s.name, id);
    const parts = s.name.split(".");
    for (let i = 1; i < parts.length; i++) add(bySuffix, parts.slice(i).join("."), id);
  }
  const m = { byName, bySuffix, tests };
  maps.set(index, m);
  return m;
}

/** resolveRef(index, ref, fromFile?) -> {id} | {ambiguous:[ids]} | null */
export function resolveRef(index, ref, fromFile) {
  if (!index || !ref) return null;
  ref = String(ref).trim();
  if (ref.includes("#")) return index.symbols[ref] ? { id: ref } : null;
  const { byName, bySuffix, tests } = nameMaps(index);
  const c = byName.get(ref) || bySuffix.get(ref) || tests.get(ref) || [];
  if (c.length === 1) return { id: c[0] };
  if (!c.length) return null;
  if (fromFile) {
    const same = c.filter((id) => fileOfId(id) === fromFile);
    if (same.length === 1) return { id: same[0] };
    const imported = new Set((index.files[fromFile]?.imports || []).map((i) => i.resolved).filter(Boolean));
    const imp = c.filter((id) => imported.has(fileOfId(id)));
    if (imp.length === 1) return { id: imp[0] };
  }
  return { ambiguous: [...c].sort() };
}

/** Mutates index: imports[].resolved, symbols callees/callers/unresolvedCalls/approxCalls/test.coversResolved. Returns graph warnings. */
export function buildGraph(index) {
  maps.delete(index);
  const { files, symbols } = index;
  const has = (f) => f in files;
  const warnings = [];
  const top = new Map(), bind = new Map(), ns = new Map();
  const classes = new Map(), methods = new Map(), fns = new Map();
  const push = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };

  for (const [rel, f] of Object.entries(files)) {
    top.set(rel, new Map());
    const b = new Map(), n = new Map();
    for (const imp of f.imports || []) {
      imp.resolved = resolveImport(rel, imp.from, f.lang, has);
      for (const nm of imp.names || []) {
        const local = nm.alias ?? (nm.name === "*" ? imp.from : nm.name);
        if (nm.name === "*") { if (imp.resolved) n.set(local, imp.resolved); continue; }
        if (f.lang === "py") { // `from pkg import module`
          const sub = resolveImport(rel, `${imp.from}${imp.from.endsWith(".") ? "" : "."}${nm.name}`, "py", has);
          if (sub && sub !== imp.resolved) { n.set(local, sub); continue; }
        }
        if (imp.resolved) b.set(local, { file: imp.resolved, name: nm.name });
      }
    }
    bind.set(rel, b);
    ns.set(rel, n);
  }
  for (const [id, s] of Object.entries(symbols)) {
    if (!s.parent && !TEST_KINDS.has(s.kind)) top.get(s.file)?.set(s.name, id);
    if (s.kind === "class" || s.kind === "type") push(classes, s.name.split(".").at(-1), id);
    if (s.kind === "method") push(methods, s.name.split(".").at(-1), id);
    if (s.kind === "function" && !s.parent) push(fns, s.name, id);
  }
  const resolveClass = (type, file) => {
    if (!type) return null;
    const dot = type.lastIndexOf(".");
    if (dot > 0) {
      const target = ns.get(file)?.get(type.slice(0, dot));
      const id = target && `${target}#${type.slice(dot + 1)}`;
      return id && symbols[id] ? id : null;
    }
    const t = top.get(file)?.get(type);
    if (t && (symbols[t].kind === "class" || symbols[t].kind === "type")) return t;
    const b = bind.get(file)?.get(type);
    if (b && symbols[`${b.file}#${b.name}`]) return `${b.file}#${b.name}`;
    const c = classes.get(type);
    return c && c.length === 1 ? c[0] : null;
  };
  const member = (cls, name) => (cls && symbols[`${cls}.${name}`] ? `${cls}.${name}` : null);
  const unique = (m, name) => { const c = m.get(name); return c && c.length === 1 ? c[0] : null; };

  const resolveCall = (s, { name, qualifier: q }) => {
    const F = s.file;
    if (q === null) {
      const t = top.get(F)?.get(name);
      if (t) return { id: t };
      const b = bind.get(F)?.get(name);
      if (b && symbols[`${b.file}#${b.name}`]) return { id: `${b.file}#${b.name}` };
      const u = unique(fns, name);
      return u ? { id: u, approx: true } : null;
    }
    let id = null;
    if (q === "this" || q === "self") id = s.kind === "method" ? member(s.parent, name) : null;
    else if (s.locals?.[q]) id = member(resolveClass(s.locals[q], F), name);
    if (!id && ns.get(F)?.get(q)) { const cand = `${ns.get(F).get(q)}#${name}`; id = symbols[cand] ? cand : null; }
    if (!id && /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*$/.test(q) && !/^(this|self)\./.test(q)) id = member(resolveClass(q, F), name);
    if (id) return { id };
    if (GLOBALS.has(q.split(".")[0])) return null;
    const u = unique(methods, name);
    return u ? { id: u, approx: true } : null;
  };

  for (const s of Object.values(symbols)) { s.callers = []; s.callees = []; s.unresolvedCalls = []; s.approxCalls = false; }
  for (const [id, s] of Object.entries(symbols)) {
    if (TEST_KINDS.has(s.kind)) continue;
    const callees = new Set(), unresolved = new Set();
    for (const c of s.calleesRaw || []) {
      const r = resolveCall(s, c);
      if (r) { callees.add(r.id); if (r.approx) s.approxCalls = true; }
      else unresolved.add(c.qualifier ? `${c.qualifier}.${c.name}` : c.name);
    }
    callees.delete(id);
    s.callees = [...callees].sort();
    s.unresolvedCalls = [...unresolved].sort();
    for (const ref of s.tags?.calls || []) {
      const r = resolveRef(index, ref, s.file);
      if (!r) warnings.push({ code: "UNRESOLVED_CALLS_TAG", file: s.file, symbol: id, message: `@calls ${ref} does not resolve to an indexed symbol` });
      else if (r.ambiguous) warnings.push({ code: "AMBIGUOUS_REF", file: s.file, symbol: id, message: `@calls ${ref} matches ${r.ambiguous.length} symbols: ${r.ambiguous.join(", ")}` });
    }
  }
  for (const [id, s] of Object.entries(symbols)) for (const c of s.callees) symbols[c]?.callers.push(id);
  for (const s of Object.values(symbols)) s.callers.sort();

  for (const [id, s] of Object.entries(symbols)) {
    if (!s.test) continue;
    let covers = s.tags?.covers || [];
    for (let p = s.parent; !covers.length && p && symbols[p]; p = symbols[p].parent) covers = symbols[p].tags?.covers || [];
    const out = new Set();
    for (const ref of covers) {
      const r = resolveRef(index, ref, s.file);
      if (r?.id) out.add(r.id);
      else warnings.push(r ? { code: "AMBIGUOUS_REF", file: s.file, symbol: id, message: `@covers ${ref} matches ${r.ambiguous.length} symbols: ${r.ambiguous.join(", ")}` }
        : { code: "UNRESOLVED_COVERS_TAG", file: s.file, symbol: id, message: `@covers ${ref} does not resolve to an indexed symbol` });
    }
    s.test.coversResolved = [...out].sort();
  }
  maps.delete(index);
  return warnings;
}
