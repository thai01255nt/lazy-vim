// Project layout, root discovery, file discovery and a small argv parser shared by cmd modules.
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve, relative, sep } from "node:path";
import { CONFIG_REL, langOf, knownLangOf, enabledLanguages } from "./config.mjs";
import { matchGlob } from "./glob.mjs";
import { exists } from "./fsutil.mjs";
import { HITL_DIR } from "./paths.mjs";

export function paths(root) {
  const custom = join(root, HITL_DIR);
  const index = join(custom, "index");
  return {
    custom, index,
    docs: join(custom, "docs"), planning: join(custom, "planning"), tasks: join(custom, "tasks"), reviews: join(custom, "reviews"),
    indexJson: join(index, "index.json"), indexMd: join(index, "index.md"), cache: join(index, ".cache.json"),
    lock: join(index, "skeleton.lock.json"), state: join(index, "state.json"), session: join(index, ".session"),
    contracts: join(index, "contracts"), config: join(root, CONFIG_REL), codebaseMap: join(custom, "docs/CODEBASE-MAP.md"),
  };
}

export async function findRoot(startDir) {
  if (!startDir) return null;
  let dir = resolve(startDir);
  const st = await fs.stat(dir).catch(() => null);
  if (st && !st.isDirectory()) dir = dirname(dir);
  for (;;) {
    if (await exists(join(dir, CONFIG_REL))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

export const toRel = (root, p) => relative(root, resolve(root, p)).split(sep).join("/");

const PRUNE = new Set(["node_modules", ".git", ".venv", "venv", "__pycache__", "dist", "build", "coverage", "target", ".gradle", ".dart_tool", "_build", "Pods"]);

async function walk(root, dir = "", out = []) {
  for (const e of await fs.readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (e.isDirectory()) { if (!PRUNE.has(e.name) && rel !== ".claude" && rel !== HITL_DIR) await walk(root, rel, out); }
    else if (e.isFile()) out.push(rel);
  }
  return out;
}

/** Indexable project files (root-relative, sorted): git ls-files -co --exclude-standard, else a walk. */
export async function listFiles(root, config) {
  let files = null;
  const git = spawnSync("git", ["ls-files", "-co", "--exclude-standard", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 });
  if (git.status === 0) {
    const all = [...new Set(git.stdout.split("\0").filter(Boolean))];
    files = [];
    for (const f of all) if (langOf(f, config) && !matchGlob(f, config.exclude) && (await exists(join(root, f)))) files.push(f);
  } else files = (await walk(root)).filter((f) => langOf(f, config) && !matchGlob(f, config.exclude));
  return files.sort();
}

/** parseArgv(argv, {flags:["json"], values:["task"], multi:["files"]}) -> {_:[positional], json:true, task:"T-1", files:[…]} */
export function parseArgv(argv, { flags = [], values = [], multi = [] } = {}) {
  const out = { _: [] };
  for (const m of multi) out[m] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    let [k, v] = a.slice(2).split(/=(.*)/s);
    if (flags.includes(k)) out[k] = true;
    else if (values.includes(k)) out[k] = v ?? argv[++i];
    else if (multi.includes(k)) {
      if (v !== undefined) out[k].push(v);
      else while (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[k].push(argv[++i]);
    } else throw Object.assign(new Error(`unknown flag --${k}`), { usage: true });
  }
  return out;
}

/** Languages present in the project (any built-in language, enabled or not) with their adapter:
 *  {lang: {files, enabled, adapter, note}}. `note` reads like "kotlin → generic@1 (approx; install universal-ctags …)". */
export async function languageSummary(root, config, index = null) {
  const { adapterFor, describeAdapter } = await import("./adapters/registry.mjs");
  const all = Object.assign(Object.create(Object.getPrototypeOf(config)), config, { languages: ["*"] });
  Object.defineProperty(all, "_customExts", { value: config._customExts || {}, enumerable: false });
  const counts = {};
  for (const f of await listFiles(root, all)) { const l = langOf(f, all) || knownLangOf(f); if (l) counts[l] = (counts[l] || 0) + 1; }
  const enabled = enabledLanguages(config);
  const out = {};
  for (const lang of Object.keys(counts).sort()) {
    const on = enabled.has(lang) || !!config.customAdapters?.[lang];
    const id = on ? index?.adapters?.[lang] || (await adapterFor(lang, root, config))?.id || null : null;
    out[lang] = { files: counts[lang], enabled: on, adapter: id, note: on ? describeAdapter(lang, id) : `${lang} → disabled (config.languages); enable with init --set 'languages=["*"]'` };
  }
  return out;
}
