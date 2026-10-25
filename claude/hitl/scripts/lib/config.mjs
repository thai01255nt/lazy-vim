// hitl.config/1 defaults, loading, language/test-file classification and runner detection (§E.11, §E.1 init).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { readJson, exists } from "./fsutil.mjs";
import { matchGlob } from "./glob.mjs";
import { LANGS, GENERIC_EXT, GENERIC_FILES } from "./adapters/langs.mjs";
import { CONFIG_REL, HITL_PREFIX } from "./paths.mjs";

export const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export { CONFIG_REL };

export const DEFAULTS = Object.freeze({
  schema: "hitl.config/1",
  // "*" = every built-in language (ts, py + the generic table); "!lang" excludes one. Explicit lists stay as-is.
  languages: ["*"],
  exclude: ["node_modules/**", "dist/**", "build/**", "out/**", "coverage/**", ".venv/**", "venv/**", "**/__pycache__/**", ".git/**", ".claude/**", ".hitl/**",
    "target/**", "vendor/**", ".gradle/**", ".dart_tool/**", "_build/**", "Pods/**"],
  testGlobs: ["tests/**", "test/**", "**/__tests__/**", "**/*.test.*", "**/*.spec.*", "**/test_*.py", "**/*_test.py",
    "**/src/test/**/*.{java,kt,kts,scala,groovy}", "**/*_test.go", "**/*_spec.{rb,lua}", "**/*_test.{rb,exs,dart,lua,sh,c,cc,cpp,rs}", "**/test/**/*_test.exs",
    "**/*{Test,Tests,Spec}.{java,kt,scala,groovy,cs,swift,php}", "**/*.bats"],
  adapters: { ts: "auto", py: "py-ast" },
  customAdapters: {},
  commands: { test: { ts: null, py: null }, lint: null, typecheck: null, mutation: { ts: null, py: null } },
  review: { confidenceThreshold: 80, maxFixRounds: 2 },
  risk: { securityPaths: ["**/auth/**", "**/security/**", "**/crypto/**", "**/payment*/**"], corePaths: [], fanInThreshold: 5, bodyLinesThreshold: 60, weights: {} },
  mutationRequired: false,
  mutationThreshold: 0.8,
  orphanScope: "tracked-files",
  stopGate: true,
  trace: { precommit: false, mdOut: `${HITL_PREFIX}index/trace.md` },
  linear: {
    enabled: false,
    server: null, // MCP server name: the <server> in mcp__<server>__<tool> (one OAuth per Linear workspace)
    team: null,
    project: null, // null = one project per planning file; {id, name} = put every issue into that existing project
    planningAs: "project",
    pushTodoAs: "unstarted",
    pushQuick: true,
    titlePrefix: false,
    labels: { risk: true, impl: true, phase: false },
    stateNames: {},
    autoPush: { onTasksApproved: false, onApprove: false, onReview: false },
    reviewComment: true,
    maxCreatePerPush: 50,
  },
});

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

export function deepMerge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over || {})) out[k] = isObj(v) && isObj(out[k]) ? deepMerge(out[k], v) : structuredClone(v);
  return out;
}

export function setDotted(obj, key, value) {
  const parts = key.split(".");
  let o = obj;
  for (const p of parts.slice(0, -1)) o = isObj(o[p]) ? o[p] : (o[p] = {});
  o[parts.at(-1)] = value;
  return obj;
}

export const EXT_LANG = { ".ts": "ts", ".tsx": "ts", ".mts": "ts", ".cts": "ts", ".js": "ts", ".jsx": "ts", ".mjs": "ts", ".cjs": "ts", ".py": "py", ...GENERIC_EXT };
/** Every built-in language id (ts, py first). */
export const ALL_LANGS = ["ts", "py", ...Object.keys(LANGS).filter((l) => l !== "py")];

/** config.languages -> Set of enabled language ids ("*"/"auto" = all built-ins, "!x" excludes x). */
export function enabledLanguages(config = DEFAULTS) {
  const list = config.languages || [];
  const all = list.includes("*") || list.includes("auto");
  const out = new Set(all ? ALL_LANGS : list.filter((l) => !String(l).startsWith("!")));
  for (const l of list) if (String(l).startsWith("!")) out.delete(l.slice(1));
  return out;
}
const enabledCache = new WeakMap();
const isEnabled = (lang, config) => {
  if (!config || typeof config !== "object") return enabledLanguages(DEFAULTS).has(lang);
  let set = enabledCache.get(config);
  if (!set || set.key !== JSON.stringify(config.languages || [])) { set = enabledLanguages(config); set.key = JSON.stringify(config.languages || []); enabledCache.set(config, set); }
  return set.has(lang);
};

/** Built-in language of a path ignoring config.languages (null for unknown). */
export function knownLangOf(rel) {
  if (/\.d\.[mc]?ts$/.test(rel)) return null;
  const ext = (rel.match(/\.[^./]+$/) || [""])[0];
  return EXT_LANG[ext] || EXT_LANG[ext.toLowerCase()] || GENERIC_FILES[rel.split("/").at(-1)] || null;
}

export async function loadConfig(root) {
  const raw = await readJson(join(root, CONFIG_REL), {});
  const major = Number(String(raw.schema || "hitl.config/1").split("/")[1]);
  if (major > 1) throw new Error(`config schema ${raw.schema} is newer than this hitl-index supports`);
  const cfg = deepMerge(DEFAULTS, raw);
  // custom adapters: {lang: "./adapter.mjs"}; their `langs` are file extensions without the dot
  const customExts = {};
  for (const [lang, rel] of Object.entries(cfg.customAdapters || {})) {
    try {
      const mod = (await import(pathToFileURL(resolve(root, rel)).href)).default;
      for (const ext of mod.langs || []) customExts["." + ext.replace(/^\./, "")] = lang;
    } catch { /* broken custom adapter: ignored, files stay unindexed */ }
  }
  Object.defineProperty(cfg, "_customExts", { value: customExts, enumerable: false });
  return cfg;
}

export function langOf(rel, config = DEFAULTS) {
  if (/\.d\.[mc]?ts$/.test(rel)) return null;
  const ext = (rel.match(/\.[^./]+$/) || [""])[0];
  const custom = config._customExts?.[ext];
  if (custom) return custom;
  const lang = knownLangOf(rel);
  return lang && isEnabled(lang, config) ? lang : null;
}

export const isTestFile = (rel, config = DEFAULTS) => matchGlob(rel, config.testGlobs || []);

// --- runner detection for `init` ---
export async function detectCommands(root) {
  const pkg = await readJson(join(root, "package.json"), null);
  const deps = { ...(pkg?.dependencies || {}), ...(pkg?.devDependencies || {}) };
  const has = (n) => n in deps;
  let ts;
  if (has("vitest")) ts = { runner: "vitest", confidence: "high", cmd: "npx vitest run --reporter=junit --outputFile={junit} {files}" };
  else if (has("jest")) ts = { runner: "jest", confidence: has("jest-junit") ? "high" : "low", cmd: "JEST_JUNIT_OUTPUT_FILE={junit} npx jest --ci --reporters=default --reporters=jest-junit {files}" };
  else ts = { runner: "node:test", confidence: /node\s+--test/.test(pkg?.scripts?.test || "") ? "high" : pkg ? "medium" : "low", cmd: "node --test --test-reporter=junit --test-reporter-destination={junit} {files}" };
  const pytest = spawnSync("python3", ["-c", "import pytest"], { cwd: root, stdio: "ignore", timeout: 10000 }).status === 0;
  const py = pytest
    ? { runner: "pytest", confidence: "high", cmd: "python3 -m pytest -q --junitxml={junit} {files}" }
    : { runner: "py_unittest_junit", confidence: "medium", cmd: 'python3 -I "{plugin}/scripts/runners/py_unittest_junit.py" --root {root} --junit {junit} {files}' }; // {plugin} resolved at run time (plugin cache path changes per version)
  const typescript = has("typescript") || (await exists(join(root, "node_modules/typescript")));
  // solution-style tsconfig (`files: []` + `references`): `tsc -p .` checks nothing, so use build mode
  let tsRaw = ""; try { tsRaw = readFileSync(join(root, "tsconfig.json"), "utf8"); } catch { /* none */ }
  const solution = /"references"\s*:/.test(tsRaw) && /"files"\s*:\s*\[\s*\]/.test(tsRaw);
  return {
    detected: { ts: { runner: ts.runner, confidence: ts.confidence }, py: { runner: py.runner, confidence: py.confidence } },
    commands: { test: { ts: ts.cmd, py: py.cmd }, lint: pkg?.scripts?.lint ? "npm run lint" : null, typecheck: typescript ? (solution ? "npx tsc -b --noEmit" : "npx tsc --noEmit -p .") : null },
  };
}
