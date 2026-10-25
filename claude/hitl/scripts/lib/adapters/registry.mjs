// Adapter registry: language -> adapter (§E.3.1). Order: customAdapters -> specialized (ts-compiler/ts-lite, py-ast)
// -> ctags (Universal Ctags with JSON output, if installed) -> generic (built-in language table, langs.mjs).
// config.adapters.<lang>: "auto" | "ts-compiler" | "ts-lite" (ts) | "py-ast" (py) | "ctags" | "generic" | "none".
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import tsLite from "./ts-lite.mjs";
import tsCompiler from "./ts-compiler.mjs";
import py from "./py.mjs";
import generic, { GENERIC_ID } from "./generic.mjs";
import ctags, { probeCtags, ctagsSupports, ctagsId } from "./ctags.mjs";
import { LANGS } from "./langs.mjs";

const bind = (adapter, lang, id) => ({ adapter: { ...adapter, parse: (files, ctx) => adapter.parse(files, { ...ctx, lang }) }, id });
const genericFor = (lang) => (LANGS[lang] ? bind(generic, lang, GENERIC_ID) : null);
const ctagsFor = (lang) => (LANGS[lang] && ctagsSupports(lang) ? bind(ctags, lang, ctagsId()) : null);

/** -> {adapter, id} for a language, or null when unavailable. */
export async function adapterFor(lang, root, config) {
  const custom = config.customAdapters?.[lang];
  if (custom) {
    try {
      const mod = (await import(pathToFileURL(resolve(root, custom)).href)).default;
      if (!mod.available || (await mod.available(root, config))) return { adapter: mod, id: mod.id };
    } catch { /* fall through to built-ins */ }
  }
  const want = config.adapters?.[lang] || "auto";
  if (want === "none" || want === "off") return null;
  if (lang === "ts") {
    if (want === "ts-lite" || process.env.HITL_TS_ADAPTER === "ts-lite") return { adapter: tsLite, id: tsLite.id };
    if (await tsCompiler.available(root, config)) return { adapter: tsCompiler, id: tsCompiler.versionId(root) };
    return { adapter: tsLite, id: tsLite.id };
  }
  if (want === "generic") return genericFor(lang);
  if (want === "ctags") return ctagsFor(lang) || genericFor(lang);
  if (lang === "py" && (await py.available())) return { adapter: py, id: py.id };
  return ctagsFor(lang) || genericFor(lang); // py lands here only when python3 is missing
}

/** Explicit adapter by id prefix (for `parse --adapter`). generic/ctags infer the language from the path. */
export async function adapterById(id, root) {
  if (id.startsWith("ts-lite")) return { adapter: tsLite, id: tsLite.id };
  if (id.startsWith("ts-compiler")) return (await tsCompiler.available(root)) ? { adapter: tsCompiler, id: tsCompiler.versionId(root) } : null;
  if (id.startsWith("py")) return { adapter: py, id: py.id };
  if (id.startsWith("generic")) return { adapter: generic, id: GENERIC_ID };
  if (id.startsWith("ctags")) return probeCtags() ? { adapter: ctags, id: ctagsId() } : null;
  return null;
}

/** One-line description of the adapter used for a language, e.g. "kotlin → generic@1 (approx; install universal-ctags …)". */
export function describeAdapter(lang, id) {
  if (!id) return `${lang} → none (no adapter available)`;
  if (id.startsWith("generic")) {
    const hint = probeCtags() ? (ctagsSupports(lang) ? "" : "universal-ctags has no parser for it") : "install universal-ctags for better symbol discovery";
    return `${lang} → ${id} (approx${hint ? "; " + hint : ""})`;
  }
  if (id.startsWith("ctags")) return `${lang} → ${id} (ctags symbols; bodies/calls approx)`;
  if (id.startsWith("ts-lite")) return `${lang} → ${id} (approx; install typescript for the exact adapter)`;
  return `${lang} → ${id}`;
}
