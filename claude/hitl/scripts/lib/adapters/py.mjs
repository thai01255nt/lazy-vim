// py-ast@1: runs scripts/adapters/py_index.py with `python3 -I` once per batch (§E.3.3).
import { spawn, spawnSync } from "node:child_process";
import { join } from "node:path";
import { PLUGIN_DIR, isTestFile } from "../config.mjs";

const SCRIPT = join(PLUGIN_DIR, "scripts/adapters/py_index.py");
let avail = null;

function runPy(input, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const p = spawn("python3", ["-I", SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    const timer = setTimeout(() => { p.kill("SIGKILL"); reject(new Error("python adapter timed out")); }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e) => { clearTimeout(timer); reject(e); });
    p.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`python adapter exited ${code}: ${err.trim().split("\n").at(-1) || ""}`));
      try { resolve(JSON.parse(out).results); } catch (e) { reject(new Error(`python adapter output: ${e.message}`)); }
    });
    p.stdin.end(JSON.stringify(input));
  });
}

export default {
  id: "py-ast@1",
  langs: ["py"],
  available: async () => (avail ??= spawnSync("python3", ["-I", "-c", "import ast,sys; sys.exit(0 if sys.version_info >= (3,9) else 1)"], { stdio: "ignore", timeout: 10000 }).status === 0),
  parse: async (files, ctx) => {
    if (!files.length) return [];
    try {
      return await runPy({ files, testFiles: files.filter((f) => isTestFile(f.path, ctx?.config)).map((f) => f.path) });
    } catch (e) {
      return files.map((f) => ({ path: f.path, lang: "py", imports: [], symbols: [], warnings: [], parseError: `py-ast: ${e.message}` }));
    }
  },
};
