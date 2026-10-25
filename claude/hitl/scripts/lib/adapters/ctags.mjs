// ctags@1: Universal Ctags (JSON output) for symbol discovery + the generic adapter's body/doc/tag/hash logic.
// Used automatically for non-TS/Python languages when `universal-ctags` / `ctags` is Universal Ctags with +json.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { parseGeneric, genericLangOf } from "./generic.mjs";
import { CTAGS_LANG } from "./langs.mjs";

const probes = new Map();

/** -> {cmd, version, languages:Set} | null. Cached per PATH / HITL_CTAGS. */
export function probeCtags() {
  const key = `${process.env.HITL_CTAGS || ""}\0${process.env.PATH || ""}`;
  if (probes.has(key)) return probes.get(key);
  let found = null;
  for (const cmd of [process.env.HITL_CTAGS, "universal-ctags", "ctags"].filter(Boolean)) {
    const v = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 10000 });
    if (v.status !== 0 || !v.stdout) continue;
    const m = v.stdout.match(/Universal Ctags\s+([\w.+~-]+)/);
    if (!m || !/[+]json\b/.test(v.stdout)) continue;
    const l = spawnSync(cmd, ["--list-languages"], { encoding: "utf8", timeout: 10000 });
    const languages = new Set((l.stdout || "").split("\n").map((s) => s.trim()).filter((s) => s && !/\[disabled\]/.test(s)));
    found = { cmd, version: m[1].replace(/[(),]+$/, ""), languages };
    break;
  }
  probes.set(key, found);
  return found;
}

/** ctags supports this lang id? */
export function ctagsSupports(lang) {
  const p = probeCtags();
  return !!(p && CTAGS_LANG[lang] && p.languages.has(CTAGS_LANG[lang]));
}

export const ctagsId = () => { const p = probeCtags(); return p ? `ctags@1+${p.version}` : null; };

/** Run ctags over in-memory files (written to a temp dir) -> Map(path -> tags[]) or throws. */
function runCtags(files) {
  const p = probeCtags();
  const dir = mkdtempSync(join(tmpdir(), "hitl-ctags-"));
  try {
    for (const f of files) {
      const abs = join(dir, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.content);
    }
    const r = spawnSync(p.cmd, ["--output-format=json", "--fields=+nKSse", "--sort=no", "-f", "-", "-L", "-"], {
      cwd: dir, input: files.map((f) => f.path).join("\n") + "\n", encoding: "utf8", maxBuffer: 1 << 28, timeout: 120000,
    });
    if (r.status !== 0) throw new Error(`ctags exited ${r.status}: ${(r.stderr || "").trim().split("\n").at(-1) || ""}`);
    const out = new Map();
    for (const line of r.stdout.split("\n")) {
      if (!line.trim()) continue;
      let t;
      try { t = JSON.parse(line); } catch { continue; }
      if (t._type && t._type !== "tag") continue;
      const path = String(t.path || "").replace(/^\.\//, "");
      if (!out.has(path)) out.set(path, []);
      out.get(path).push({ name: t.name, kind: t.kind, line: t.line, end: t.end || null, scope: t.scope || null, signature: t.signature || null });
    }
    return out;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export default {
  id: "ctags@1",
  approx: true,
  langs: [],
  available: async () => !!probeCtags(),
  parse: async (files, ctx) => {
    if (!files.length) return [];
    let tags;
    try { tags = runCtags(files); } catch (e) {
      return files.map((f) => {
        const r = parseGeneric(f, ctx?.lang || genericLangOf(f.path), ctx?.config);
        r.warnings.push({ code: "CTAGS_FAILED", message: `ctags failed (${e.message}); used generic discovery`, line: null });
        return r;
      });
    }
    return files.map((f) => parseGeneric(f, ctx?.lang || genericLangOf(f.path), ctx?.config, { decls: tags.get(f.path) || [] }));
  },
};
