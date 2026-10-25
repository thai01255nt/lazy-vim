// Builds hitl.index/1 from adapter output: hashes, tags, todos, features, graph; incremental updates (§E.2, §E.3).
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { loadConfig, langOf, enabledLanguages } from "./config.mjs";
import { paths, listFiles, toRel } from "./project.mjs";
import { readJson, writeJsonAtomic, withIndexLock } from "./fsutil.mjs";
import { matchGlob } from "./glob.mjs";
import { parseDoc, canonicalIntentTags } from "./tags.mjs";
import { h, normalize, stripComments } from "./hash.mjs";
import { features } from "./features.mjs";
import { buildGraph } from "./graph.mjs";
import { adapterFor, describeAdapter } from "./adapters/registry.mjs";
import { stripCommentsGeneric } from "./adapters/generic.mjs";
import { LANGS } from "./adapters/langs.mjs";

export const TOOL = "hitl-index@1.0.0";
export const SCHEMA = "hitl.index/1";
const GRAPH_CODES = new Set(["AMBIGUOUS_REF", "UNRESOLVED_CALLS_TAG", "UNRESOLVED_COVERS_TAG"]);
const FN_KINDS = new Set(["function", "method", "test"]);
// languages hashed with the generic comment stripper (ts/py keep their own, unchanged)
const genericLang = (lang) => lang !== "ts" && lang !== "py" && !!LANGS[lang];
const lastSeg = (name) => String(name).split(/\.| > /).at(-1);

/** AdapterFileResult -> {symbols: IndexSymbol[], warnings} (no graph fields yet). */
export function toIndexSymbols(res, lang) {
  const symbols = [], warnings = [], seen = new Map();
  const gen = genericLang(lang);
  const strip = (t) => (gen ? stripCommentsGeneric(t, lang) : stripComments(t, lang));
  const norm = (t) => (gen ? normalize(stripCommentsGeneric(String(t ?? ""), lang)) : normalize(t, lang));
  for (const s of res.symbols || []) {
    let name = s.name;
    if (seen.has(name)) {
      const n = seen.get(name) + 1;
      seen.set(name, n);
      warnings.push({ code: "DUP_ID", file: res.path, symbol: `${res.path}#${name}`, message: `duplicate symbol ${name}; renamed to ${name}~${n}` });
      name = `${name}~${n}`;
    } else seen.set(name, 1);
    const id = `${res.path}#${name}`;
    const { prose, tags, errors } = parseDoc(s.doc);
    for (const e of errors) warnings.push({ code: "BAD_TAG", file: res.path, symbol: id, message: e.message });
    const lines = (s.commentLines || []).map((c) => c.text);
    const todos = lines.map((t) => t.match(/TODO\(impl\):\s*(.*)/)).filter(Boolean).map((m) => m[1].trim());
    const flowSteps = lines.filter((t) => !/TODO\(impl\)/.test(t)).map((t) => t.match(/^\s*(\d+)\.\s+(.+)/)).filter(Boolean).map((m) => `${m[1]}. ${m[2].trim()}`);
    const body = norm(s.bodyText);
    const fnLike = FN_KINDS.has(s.kind);
    symbols.push({
      id, name, file: res.path, kind: s.kind,
      parent: s.parentName ? `${res.path}#${s.parentName}` : null,
      exported: !!s.exported, async: !!s.async,
      signature: strip(s.sigText || "").replace(/\s+/g, " ").trim(),
      intent: prose, tags, todos, flowSteps, stub: !!s.stub,
      features: fnLike && s.kind !== "test" ? features(body, lang) : [],
      locals: s.locals || {}, calleesRaw: s.calleesRaw || [],
      callees: [], callers: [], unresolvedCalls: [], approxCalls: false,
      span: s.span, docSpan: s.docSpan || null, bodySpan: s.bodySpan || null,
      bodyLines: strip(s.bodyText || "").split("\n").filter((l) => l.trim()).length,
      sigHash: h(norm(s.sigText)), bodyHash: h(body),
      intentHash: h(normalize(prose) + "\n" + canonicalIntentTags(tags)), todoHash: h(todos.join("\n")),
      test: s.test ? { titlePath: s.test.titlePath, mode: s.test.mode, coversResolved: [] } : null,
    });
  }
  return { symbols, warnings };
}

/** parseSources(root, [{path, content?}], config?, {adapterOverride?, knownNames?}) -> IndexedFile[] (no write).
 *  Approximate adapters (generic/ctags) scan `name(` calls; those are kept only when `name` is a symbol name parsed
 *  in this batch or listed in knownNames (the previous index), so unresolved noise like println() is dropped. */
export async function parseSources(root, files, config, { adapterOverride, knownNames } = {}) {
  config ||= await loadConfig(root);
  const groups = new Map();
  for (const f of files) {
    const lang = langOf(f.path, config);
    if (!lang) continue;
    const content = f.content ?? (await fs.readFile(join(root, f.path), "utf8").catch(() => null));
    if (content === null) continue;
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push({ path: f.path, content });
  }
  const out = [], batches = [];
  for (const [lang, list] of groups) {
    const ad = adapterOverride || (await adapterFor(lang, root, config));
    let results;
    if (!ad) results = list.map((f) => ({ path: f.path, lang, imports: [], symbols: [], warnings: [], parseError: `no adapter available for ${lang}` }));
    else results = await ad.adapter.parse(list, { root, config, lang });
    batches.push({ lang, list, ad, results });
  }
  const known = new Set(knownNames || []);
  for (const b of batches) for (const r of b.results) for (const s of r.symbols || []) known.add(lastSeg(s.name));
  for (const { lang, list, ad, results } of batches) {
    if (ad?.adapter?.approx) for (const r of results) for (const s of r.symbols || []) s.calleesRaw = (s.calleesRaw || []).filter((c) => known.has(c.name));
    const byPath = new Map(results.map((r) => [r.path, r]));
    if (ad && genericLang(lang) && list.length) { // once per language: which adapter is in use
      const first = [...list].sort((a, b) => (a.path < b.path ? -1 : 1))[0].path;
      const r = byPath.get(first);
      if (r) (r.warnings ||= []).push({ code: "ADAPTER_LANG", message: describeAdapter(lang, ad.id) });
    }
    for (const f of list) {
      const r = byPath.get(f.path) || { path: f.path, imports: [], symbols: [], warnings: [], parseError: "adapter returned no result" };
      const { symbols, warnings } = toIndexSymbols(r, lang);
      out.push({
        path: f.path, lang, adapter: ad?.id || null, fileHash: h(f.content), imports: r.imports || [], parseError: r.parseError || null,
        symbols, warnings: [...(r.warnings || []).map((w) => ({ code: w.code, file: f.path, symbol: null, message: w.message })), ...warnings],
        raw: r,
      });
    }
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export async function readIndex(root) {
  const idx = await readJson(paths(root).indexJson, null);
  return idx && idx.schema === SCHEMA ? idx : null;
}

const cmpWarn = (a, b) => [a.file, a.symbol || "", a.code, a.message].join("\0") < [b.file, b.symbol || "", b.code, b.message].join("\0") ? -1 : 1;

/** updateIndex(root, rels|null, {full?, changedOnly?, budgetMs?}) -> hitl.indexResult/1 */
export async function updateIndex(root, rels = null, opts = {}) {
  const r = await withIndexLock(root, () => updateLocked(root, rels, opts));
  // drift is computed outside the lock: it may call into P2's status module
  const { computeDriftFrom } = await import("./drift.mjs");
  const drift = await computeDriftFrom(root, r.index, { files: r.result.changedFiles, prevIndex: r.prev, config: r.config });
  if (!opts.full) return { ...r.result, drift };
  const { languageSummary } = await import("./project.mjs");
  return { ...r.result, languages: await languageSummary(root, r.config, r.index), drift };
}

async function updateLocked(root, rels, opts) {
  {
    const config = await loadConfig(root);
    const P = paths(root);
    const prev = await readIndex(root);
    const cache = (await readJson(P.cache, null)) || { files: {} };
    cache.files ||= {};
    const t0 = Date.now();

    const adapters = {};
    const enabled = enabledLanguages(config);
    const explicit = (config.languages || []).filter((l) => enabled.has(l));
    const present = Object.values(prev?.files || {}).map((f) => f.lang).filter((l) => l && enabled.has(l));
    for (const lang of new Set([...["ts", "py"].filter((l) => enabled.has(l)), ...explicit, ...present])) { const ad = await adapterFor(lang, root, config); if (ad) adapters[lang] = ad.id; }
    for (const lang of Object.keys(config.customAdapters || {})) { const ad = await adapterFor(lang, root, config); if (ad) adapters[lang] = ad.id; }
    const adapterChanged = prev && Object.keys(adapters).some((l) => prev.adapters?.[l] && prev.adapters[l] !== adapters[l]);
    const full = opts.full || !prev || adapterChanged;

    let candidates = [], removed = [];
    if (full || !rels) {
      const all = await listFiles(root, config);
      const allSet = new Set(all);
      removed = prev ? Object.keys(prev.files).filter((f) => !allSet.has(f)) : [];
      if (full) candidates = all;
      else for (const f of all) {
        const st = await fs.stat(join(root, f)).catch(() => null);
        const c = cache.files[f];
        if (!st) continue;
        if (!prev.files[f] || !c || c.mtimeMs !== st.mtimeMs || c.size !== st.size) candidates.push(f);
        if (opts.budgetMs && Date.now() - t0 > opts.budgetMs) break;
      }
    } else {
      for (const r of rels.map((x) => toRel(root, x))) {
        if (!langOf(r, config) || matchGlob(r, config.exclude)) continue;
        if (await fs.stat(join(root, r)).catch(() => null)) candidates.push(r);
        else if (prev?.files[r]) removed.push(r);
      }
    }

    // read + skip files whose content hash is unchanged
    const toParse = [];
    for (const f of [...new Set(candidates)].sort()) {
      const content = await fs.readFile(join(root, f), "utf8").catch(() => null);
      if (content === null) { if (prev?.files[f]) removed.push(f); continue; }
      const st = await fs.stat(join(root, f)).catch(() => null);
      if (st) cache.files[f] = { mtimeMs: st.mtimeMs, size: st.size, fileHash: h(content) };
      if (!full && prev?.files[f] && prev.files[f].fileHash === h(content) && !prev.files[f].parseError) continue;
      toParse.push({ path: f, content });
    }
    const knownNames = full || !prev ? [] : [...new Set(Object.values(prev.symbols).map((s) => lastSeg(s.name)))];
    const parsed = await parseSources(root, toParse, config, { knownNames });
    for (const pf of parsed) if (pf.adapter && !adapters[pf.lang]) adapters[pf.lang] = pf.adapter;

    const index = full ? { schema: SCHEMA, tool: TOOL, adapters, files: {}, symbols: {}, warnings: [] } : structuredClone(prev);
    index.schema = SCHEMA; index.tool = TOOL; index.adapters = adapters;
    const changed = new Set([...parsed.map((p) => p.path), ...removed]);
    const dropFile = (f) => {
      for (const id of index.files[f]?.symbols || []) delete index.symbols[id];
      delete index.files[f];
    };
    for (const f of removed) { dropFile(f); delete cache.files[f]; }
    index.warnings = (index.warnings || []).filter((w) => !GRAPH_CODES.has(w.code) && !changed.has(w.file));
    for (const pf of parsed) {
      const keep = pf.parseError && prev?.files[pf.path] && !full ? prev.files[pf.path] : null;
      if (keep) { // keep the last good symbols, flag the error
        index.files[pf.path] = { ...keep, fileHash: pf.fileHash, parseError: pf.parseError };
      } else {
        dropFile(pf.path);
        index.files[pf.path] = { lang: pf.lang, adapter: pf.adapter, fileHash: pf.fileHash, imports: pf.imports, symbols: pf.symbols.map((s) => s.id).sort(), parseError: pf.parseError };
        for (const s of pf.symbols) index.symbols[s.id] = s;
      }
      index.warnings.push(...pf.warnings);
      if (pf.parseError) index.warnings.push({ code: "PARSE_ERROR", file: pf.path, symbol: null, message: pf.parseError });
    }
    index.warnings.push(...buildGraph(index));
    index.warnings = dedupeWarnings(index.warnings).sort(cmpWarn);
    { const seen = new Set(); index.warnings = index.warnings.filter((w) => w.code !== "ADAPTER_LANG" || (!seen.has(w.message) && seen.add(w.message))); }
    // canonical key order for files/symbols maps
    index.files = Object.fromEntries(Object.entries(index.files).sort(([a], [b]) => (a < b ? -1 : 1)));
    await writeJsonAtomic(P.indexJson, index);
    cache.stamp = new Date().toISOString();
    await writeJsonAtomic(P.cache, cache);

    const added = [], gone = [], modified = [];
    for (const f of changed) {
      const before = new Set(prev?.files[f]?.symbols || []), after = new Set(index.files[f]?.symbols || []);
      for (const id of after) {
        if (!before.has(id)) { added.push(id); continue; }
        const a = prev.symbols[id], b = index.symbols[id];
        const d = { id, sig: a.sigHash !== b.sigHash, intent: a.intentHash !== b.intentHash, body: a.bodyHash !== b.bodyHash };
        if (d.sig || d.intent || d.body) modified.push(d);
      }
      for (const id of before) if (!after.has(id)) gone.push(id);
    }
    const result = { schema: "hitl.indexResult/1", changedFiles: [...changed].sort(), added: added.sort(), removed: gone.sort(), modified: modified.sort((a, b) => (a.id < b.id ? -1 : 1)) };
    return { index, prev, config, result };
  }
}

function dedupeWarnings(ws) {
  const seen = new Set();
  return ws.filter((w) => {
    const k = [w.code, w.file, w.symbol, w.message].join("\0");
    if (seen.has(k)) return false;
    seen.add(k);
    w.symbol ??= null;
    return true;
  });
}
