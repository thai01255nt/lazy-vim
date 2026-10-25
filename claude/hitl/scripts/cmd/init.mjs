// `hitl-index init [--set key=value]… [--json]` — idempotent project setup (§E.1).
import { promises as fs } from "node:fs";
import { paths, parseArgv } from "../lib/project.mjs";
import { DEFAULTS, deepMerge, setDotted, detectCommands } from "../lib/config.mjs";
import { exists, readJson, readText, writeJsonAtomic, writeTextAtomic } from "../lib/fsutil.mjs";
import { CONFIG_REL, HITL_PREFIX } from "../lib/paths.mjs";

// Canonical .hitl/.gitignore (v2 §A.6.2): generated files ignored; lock, decisions.json, review md, linear.map.json committed.
export const GITIGNORE_HEADER = "# hitl: generated files (rebuildable) — do not commit";
export const GITIGNORE = ["index/*", "!index/skeleton.lock.json", "reviews/*/*", "!reviews/*/decisions.json", ".inbox/"];

/** Pure: existing .gitignore text (or null) -> {text, added[]}. Appends missing canonical lines; never removes or reorders. */
export function mergeGitignore(existing) {
  if (existing === null || existing === undefined) return { text: [GITIGNORE_HEADER, ...GITIGNORE].join("\n") + "\n", added: [...GITIGNORE] };
  const have = new Set(existing.split(/\r?\n/).map((l) => l.trim()));
  const added = GITIGNORE.filter((l) => !have.has(l));
  if (!added.length) return { text: existing, added };
  const base = existing.length && !existing.endsWith("\n") ? existing + "\n" : existing;
  return { text: base + ["# hitl v2", ...added].join("\n") + "\n", added };
}

const parseValue = (v) => { try { return JSON.parse(v); } catch { return v; } };

export async function run(argv, ctx) {
  const a = parseArgv(argv, { multi: ["set"] });
  const root = ctx.root;
  const P = paths(root);
  const created = [];
  for (const d of [P.custom, P.docs, P.planning, P.tasks, P.index, P.reviews]) {
    if (!(await exists(d))) { await fs.mkdir(d, { recursive: true }); created.push(d.slice(root.length + 1) + "/"); }
  }
  const det = await detectCommands(root);
  const existing = await readJson(P.config, null);
  let cfg = existing ? structuredClone(existing) : deepMerge(DEFAULTS, { commands: { ...DEFAULTS.commands, ...det.commands } });
  for (const kv of a.set) {
    const i = kv.indexOf("=");
    if (i < 1) throw Object.assign(new Error(`--set expects key=value, got "${kv}"`), { usage: true });
    setDotted(cfg, kv.slice(0, i), parseValue(kv.slice(i + 1)));
  }
  if (!existing) created.push(CONFIG_REL);
  if (!existing || a.set.length) await writeJsonAtomic(P.config, cfg);
  const gi = `${P.custom}/.gitignore`;
  const giOld = await readText(gi, null);
  const giNew = mergeGitignore(giOld);
  if (giOld === null) { await writeTextAtomic(gi, giNew.text); created.push(`${HITL_PREFIX}.gitignore`); }
  else if (giNew.added.length) await writeTextAtomic(gi, giNew.text);
  const out = { created, config: cfg, detected: det.detected, gitignore: { path: `${HITL_PREFIX}.gitignore`, added: giNew.added } };
  if (ctx.json) console.log(JSON.stringify(out, null, 2));
  else if (!ctx.quiet) {
    console.log(created.length ? `created: ${created.join(", ")}` : "already initialized (nothing created)");
    if (giOld !== null && giNew.added.length) console.log(`updated ${HITL_PREFIX}.gitignore (+${giNew.added.length} lines)`);
    for (const [lang, d] of Object.entries(det.detected)) console.log(`${lang}: ${d.runner} (${d.confidence}) → ${cfg.commands?.test?.[lang] ?? "—"}`);
    console.log(`lint: ${cfg.commands?.lint ?? "—"} · typecheck: ${cfg.commands?.typecheck ?? "—"}`);
  }
  return 0;
}
