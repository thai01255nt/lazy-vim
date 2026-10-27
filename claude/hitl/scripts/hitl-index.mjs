#!/usr/bin/env node
// hitl-index CLI dispatcher (§E.1). Exit codes: 0 ok, 1 precondition/drift-fail, 2 usage, 3 not initialized.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { findRoot } from "./lib/project.mjs";
import { loadConfig } from "./lib/config.mjs";
import { LEGACY_NOTICE, findLegacyRootSync } from "./lib/paths.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const VERSION = "1.1.0";
const P1 = new Set(["index", "parse", "drift", "context", "map-md", "tasks", "next-id", "trace", "tickets", "spec", "change"]);
const USAGE = `usage: hitl-index <cmd> [args] [--root dir] [--json] [--quiet] [--soft]
commands: init migrate index parse drift context map-md tasks next-id approve status test record-mutation mutate l0 risk report review-decide precommit install-git-hook trace tickets feature spec change`;

async function main(args) {
  const g = { json: false, quiet: false, soft: false, root: null };
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--json") g.json = true;
    else if (a === "--quiet") g.quiet = true;
    else if (a === "--soft") g.soft = true;
    else if (a === "--root") g.root = args[++i];
    else if (a.startsWith("--root=")) g.root = a.slice(7);
    else if (a === "--version") { console.log(`hitl-index@${VERSION}`); return 0; }
    else if (a === "--help" || a === "-h") { console.log(USAGE); return 0; }
    else rest.push(a);
  }
  const sub = rest.shift();
  if (!sub || !/^[a-z0-9-]+$/.test(sub) || !existsSync(join(HERE, "cmd", `${sub}.mjs`))) {
    if (g.soft) { console.log(sub ? `unknown command ${sub}` : USAGE); return 0; }
    console.error(sub ? `unknown command: ${sub}\n${USAGE}` : USAGE);
    return 2;
  }
  let root = g.root ? resolve(g.root) : await findRoot(process.cwd());
  // migrate runs on a ≤ 0.3 project (legacy .claude/custom/) that findRoot does not see.
  if ((sub === "init" || sub === "migrate") && !root) root = g.root ? resolve(g.root) : findLegacyRootSync(process.cwd()) || process.cwd();
  const legacy = !root || sub === "init" ? findLegacyRootSync(root || process.cwd()) : null;
  if (legacy && sub === "init") {
    // Do not start an empty .hitl/ next to a ≤ 0.3 project by accident; `init --fresh` does it on purpose.
    const i = rest.indexOf("--fresh");
    if (i < 0) {
      const msg = `${LEGACY_NOTICE} (or hitl-index init --fresh to start an empty .hitl/)`;
      console.log(g.json ? JSON.stringify({ initialized: false, legacy: true, message: msg }) : msg);
      return 1;
    }
    rest.splice(i, 1);
  }
  if (!root && (g.soft || P1.has(sub))) {
    const msg = legacy ? LEGACY_NOTICE : "hitl: not initialized here — run /hitl:setup (hitl-index init)";
    if (g.soft) { console.log(g.json ? JSON.stringify({ initialized: false, message: msg }) : msg); return 0; }
    console.error(msg);
    return 3;
  }
  if (!root && legacy) console.error(LEGACY_NOTICE);
  const config = root ? await loadConfig(root) : null;
  const ctx = { root, config, json: g.json, quiet: g.quiet, soft: g.soft };
  const mod = await import(pathToFileURL(join(HERE, "cmd", `${sub}.mjs`)).href);
  try {
    const code = (await mod.run(rest, ctx)) ?? 0;
    return g.soft ? 0 : code;
  } catch (e) {
    if (g.soft) { console.log(`hitl: ${e.message}`); return 0; }
    console.error(`hitl-index ${sub}: ${e.message}`);
    if (process.env.HITL_DEBUG) console.error(e.stack);
    return e.usage ? 2 : typeof e.code === "number" ? e.code : 1;
  }
}

main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => { console.error(e.stack || e); process.exitCode = 1; });
