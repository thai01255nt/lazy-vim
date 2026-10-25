// `hitl-index migrate [--dry-run] [--json]` — move a ≤ 0.3 project state dir `.claude/custom/` to `.hitl/` (0.4+).
// Moves only hitl's own entries; unknown files stay where they are and are listed. Refuses (exit 1, nothing moved)
// when `.hitl/` already holds a conflicting entry. Rewrites `.claude/custom/` path references inside the moved
// .md/.json files (config customAdapters + trace.mdOut, tasks/planning headers, state report paths, …).
// Git: files are moved with plain fs renames — git is never run to change anything. Inside a work tree the command
// prints how to stage the move (`git add -A`, which git records as renames, same result as `git mv`), and with
// --dry-run the equivalent `git mv` lines for the entries git tracks.
import { promises as fs } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { parseArgv } from "../lib/project.mjs";
import { HITL_DIR, LEGACY_DIR } from "../lib/paths.mjs";
import { mergeGitignore } from "./init.mjs";

export const KNOWN_DIRS = ["docs", "planning", "tasks", "index", "reviews", ".inbox", "adapters"];
export const KNOWN_FILES = ["hitl.config.json", "linear.map.json"];
const REWRITE_EXT = /\.(?:md|json)$/;
const MAX_REWRITE = 4 << 20;
const LEGACY_PREFIX = `${LEGACY_DIR}/`;

const stat = (p) => fs.lstat(p).catch(() => null);
const isEmptyDir = async (p) => ((await fs.readdir(p).catch(() => null)) || []).length === 0;

/** Pure: rewrite `.claude/custom/` path prefixes in text. */
export const rewriteRefs = (text) => text.split(LEGACY_PREFIX).join(`${HITL_DIR}/`);

/** Plan the move without touching anything: {src, dst, moves[], gitignore, unknown[], conflicts[]}. */
export async function planMigration(root) {
  const src = join(root, LEGACY_DIR), dst = join(root, HITL_DIR);
  const out = { src: LEGACY_DIR, dst: HITL_DIR, moves: [], gitignore: null, unknown: [], conflicts: [], legacy: false };
  const names = await fs.readdir(src).catch(() => null);
  if (!names) return out;
  out.legacy = true;
  for (const n of names.sort()) {
    const s = await stat(join(src, n));
    const dir = KNOWN_DIRS.includes(n), file = KNOWN_FILES.includes(n);
    if (n === ".gitignore" && s?.isFile()) { out.gitignore = n; continue; }
    if (!((dir && s?.isDirectory()) || (file && s?.isFile()))) { out.unknown.push(`${LEGACY_DIR}/${n}${s?.isDirectory() ? "/" : ""}`); continue; }
    const d = await stat(join(dst, n));
    if (d && !(dir && d.isDirectory() && (await isEmptyDir(join(dst, n))))) out.conflicts.push(`${HITL_DIR}/${n}${d.isDirectory() ? "/" : ""}`);
    out.moves.push(n);
  }
  return out;
}

async function rewriteTree(p) {
  const s = await stat(p); let n = 0;
  if (!s) return 0;
  if (s.isDirectory()) { for (const e of await fs.readdir(p)) n += await rewriteTree(join(p, e)); return n; }
  if (!s.isFile() || !REWRITE_EXT.test(p) || s.size > MAX_REWRITE) return 0;
  const t = await fs.readFile(p, "utf8");
  if (!t.includes(LEGACY_PREFIX)) return 0;
  await fs.writeFile(p, rewriteRefs(t));
  return 1;
}

async function move(from, to) {
  try { await fs.rename(from, to); }
  catch (e) {
    if (e.code === "ENOTEMPTY" || e.code === "EEXIST") { await fs.rmdir(to); await fs.rename(from, to); return; } // empty target dir
    if (e.code !== "EXDEV") throw e;
    await fs.cp(from, to, { recursive: true, errorOnExist: true, force: false });
    await fs.rm(from, { recursive: true, force: true });
  }
}

function gitInfo(root) {
  const r = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0 || r.stdout.trim() !== "true") return null;
  const ls = spawnSync("git", ["ls-files", "-z", "--", LEGACY_DIR], { cwd: root, encoding: "utf8", maxBuffer: 1 << 26 });
  return { tracked: ls.status === 0 ? ls.stdout.split("\0").filter(Boolean) : [] };
}

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["dry-run", "json"] });
  const json = ctx.json || a.json, dry = !!a["dry-run"];
  const root = ctx.root || process.cwd();
  const plan = await planMigration(root);
  const git = plan.legacy ? gitInfo(root) : null;
  const tracked = git?.tracked || [];
  const trackedEntries = plan.moves.filter((n) => tracked.some((f) => f.startsWith(`${LEGACY_DIR}/${n}/`) || f === `${LEGACY_DIR}/${n}`));
  const res = { ...plan, dryRun: dry, moved: [], rewritten: 0, git: git ? { tracked: tracked.length } : null, status: "ok" };
  const say = (s) => { if (!json && !ctx.quiet) console.log(s); };
  const done = (code) => { if (json) console.log(JSON.stringify(res, null, 2)); return code; };

  if (!plan.legacy) { res.status = "nothing"; say(`hitl migrate: no ${LEGACY_DIR}/ here — nothing to migrate`); return done(0); }
  if (plan.conflicts.length) {
    res.status = "conflict";
    if (!json) console.error(`hitl migrate: refused — ${HITL_DIR}/ already has: ${plan.conflicts.join(", ")}. Nothing was moved; merge or remove them by hand, then rerun.`);
    return done(1);
  }
  const giSrc = plan.gitignore ? await fs.readFile(join(root, LEGACY_DIR, ".gitignore"), "utf8") : null;
  const giDstOld = await fs.readFile(join(root, HITL_DIR, ".gitignore"), "utf8").catch(() => null);
  // Union: target lines first, then the legacy file's extra lines, then any missing canonical line.
  let gi = giDstOld;
  if (giSrc !== null) {
    if (gi === null) gi = giSrc;
    else {
      const have = new Set(gi.split(/\r?\n/).map((l) => l.trim()));
      const extra = giSrc.split(/\r?\n/).filter((l) => l.trim() && !have.has(l.trim()));
      if (extra.length) gi = (gi.endsWith("\n") || !gi ? gi : gi + "\n") + extra.join("\n") + "\n";
    }
  }
  const giNew = mergeGitignore(gi);
  res.gitignore = { path: `${HITL_DIR}/.gitignore`, from: giSrc !== null ? `${LEGACY_DIR}/.gitignore` : null, added: giNew.added };

  say(`${dry ? "would move" : "moving"} ${LEGACY_DIR}/ → ${HITL_DIR}/: ${[...plan.moves.map((n) => n + (KNOWN_DIRS.includes(n) ? "/" : "")), ...(plan.gitignore ? [".gitignore (merged)"] : [])].join(", ") || "(nothing)"}`);
  if (dry) {
    if (git && trackedEntries.length) {
      say("inside git; equivalent git commands for the tracked entries:");
      say(`  mkdir -p ${HITL_DIR}`);
      for (const n of trackedEntries) say(`  git mv ${LEGACY_DIR}/${n} ${HITL_DIR}/${n}`);
    }
  } else {
    await fs.mkdir(join(root, HITL_DIR), { recursive: true });
    for (const n of plan.moves) {
      await move(join(root, LEGACY_DIR, n), join(root, HITL_DIR, n));
      res.moved.push(n);
      res.rewritten += await rewriteTree(join(root, HITL_DIR, n));
    }
    await fs.writeFile(join(root, HITL_DIR, ".gitignore"), giNew.text);
    if (giSrc !== null) await fs.rm(join(root, LEGACY_DIR, ".gitignore"), { force: true });
    if (await isEmptyDir(join(root, LEGACY_DIR))) await fs.rmdir(join(root, LEGACY_DIR)).catch(() => {});
    say(`moved ${res.moved.length} entr${res.moved.length === 1 ? "y" : "ies"}; rewrote ${LEGACY_DIR}/ paths in ${res.rewritten} file(s)`);
    if (git && tracked.length) say(`inside git: stage the move with  git add -A -- ${LEGACY_DIR} ${HITL_DIR}  (git records renames, same as git mv)`);
  }
  if (plan.unknown.length) say(`left in place (not hitl's): ${plan.unknown.join(", ")}`);
  return done(0);
}
