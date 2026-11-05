// `hitl-index migrate --ids [--dry-run] [--keys "<change-id>=KEY,…,cap:<capability>=KEY,quick:<slug>=KEY"] [--force] [--json]`
// — 0.13: renumber pre-0.13 ids (T-n, D-n, capability-keyed spec ids) into change-key scoped ids, and (0.13.2) legacy
// `QT-T<n>` quick tasks into a key per quick file (lib/migrateids.mjs); refuses while the
// files it touches have uncommitted git changes unless --force; a second run is a no-op.
// `hitl-index migrate [--dry-run] [--json]` — move a ≤ 0.3 project state dir `.claude/custom/` to `.hitl/` (0.4+).
// `hitl-index migrate --specs [<planning-name>…] [--dry-run] [--map <json|file>] [--archive-done] [--json]` — convert v0.5
// planning/tasks files into v3 change folders (design v3 §8; lib/migratespecs.mjs). Refuses (exit 1, nothing written) on
// any conflict.
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
import { readText, writeTextAtomic } from "../lib/fsutil.mjs";

export const KNOWN_DIRS = ["docs", "planning", "tasks", "index", "reviews", ".inbox", "adapters", "specs", "changes", "archive"];
export const KNOWN_FILES = ["hitl.config.json", "linear.map.json", "jira.map.json", "github.map.json"];
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

/** `migrate --specs`: v0.5 planning/tasks → change folders (design v3 §8). */
async function runSpecs(a, ctx) {
  const json = ctx.json || a.json, dry = !!a["dry-run"];
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const m = await import("../lib/migratespecs.mjs");
  const map = await m.readMapArg(ctx.root, a.map);
  const plan = await m.planMigrateSpecs(ctx.root, ctx.config, { names: a._, map, archiveDone: !!a["archive-done"] });
  const res = { ...plan, dryRun: dry };
  const say = (s) => { if (!json && !ctx.quiet) console.log(s); };
  if (plan.conflicts.length) {
    res.status = "conflict";
    if (json) console.log(JSON.stringify(res, null, 2));
    else for (const c of plan.conflicts) console.error(`❌ ${c.code} ${c.ref}: ${c.message}`);
    if (!json) console.error("hitl migrate --specs: refused — nothing was written");
    return 1;
  }
  if (!plan.plan.length) { res.status = "nothing"; if (json) console.log(JSON.stringify(res, null, 2)); else say(`hitl migrate --specs: no ${HITL_DIR}/planning/*.md to migrate`); return 0; }
  for (const p of plan.plan) {
    say(`${dry ? "would migrate" : "migrating"} ${p.planning} → ${p.target === "archive" ? `${HITL_DIR}/archive/<today>-${p.change}` : `${HITL_DIR}/changes/${p.change}`} · capability ${p.capability} (key ${p.key})`);
    say(`  ids: ${Object.entries(p.ids).map(([o, n]) => `${o}→${n}`).join(", ") || "—"} · scenarios: ${Object.values(p.scenarios).flat().length}`);
  }
  for (const w of plan.warnings) say(`⚠️ ${w}`);
  if (!dry) {
    // --archive-done: the migrated changes are moved to 0.13 ids first (keys = the derived capability keys when free)
    const idsFirst = async () => {
      const mi = await import("../lib/migrateids.mjs");
      const keys = Object.fromEntries(plan.plan.filter((p) => /^[A-Z]{2,5}$/.test(p.key)).map((p) => [p.change, p.key]));
      let ip = await mi.planMigrateIds(ctx.root, ctx.config, { keys });
      if (ip.status === "conflict") ip = await mi.planMigrateIds(ctx.root, ctx.config, {});
      if (ip.status !== "plan") return { status: ip.status, conflicts: ip.conflicts };
      const r = await mi.applyMigrateIds(ctx.root, ip);
      return { status: "applied", keys: Object.fromEntries(ip.keys.map((k) => [k.label, k.key])), tasks: ip.map.tasks, written: r.written };
    };
    const out = await m.applyMigrateSpecs(ctx.root, ctx.config, plan, { idsFirst: a["archive-done"] ? idsFirst : null });
    if (out.ids) { res.ids = out.ids; say(out.ids.status === "applied" ? `🔑 0.13 ids: ${Object.entries(out.ids.keys).map(([c, k]) => `${c}=${k}`).join(", ")}` : `⚠️ migrate --ids ${out.ids.status}: run /hitl:migrate`); }
    res.written = out.written; res.archived = out.archived;
    // scratch files of the spec agents stay out of git (design v3 §4.5)
    const gi = join(ctx.root, HITL_DIR, ".gitignore");
    const giOld = await readText(gi, null);
    if (giOld !== null) { const g = mergeGitignore(giOld); if (g.added.length) await writeTextAtomic(gi, g.text); res.gitignore = { path: `${HITL_DIR}/.gitignore`, added: g.added }; }
    for (const x of out.archived) say(x.ok ? `📦 archived ${x.change} → ${x.to}` : `⚠️ ${x.change} stays in changes/ (archive refused: ${x.error || [...(x.conflicts || []).map((c) => c.code), ...(x.errors || []).map((e) => e.code)].join(", ") || "tasks not done"})`);
    say(`migrated ${plan.plan.length} planning file(s); git is not run — stage the moves with git add -A -- ${HITL_DIR}`);
    say(out.ids?.status === "applied" ? `🎯 next: hitl-index spec validate --json, then review the capability names (/hitl:plan <change-id> amend)`
      : `🎯 next: /hitl:migrate (hitl-index migrate --ids: change keys and 0.13 ids), then hitl-index spec validate --json`);
  }
  res.status = "ok";
  if (json) console.log(JSON.stringify(res, null, 2));
  return 0;
}

/** `migrate --ids` (0.13): pre-0.13 ids → change-key scoped ids (lib/migrateids.mjs). */
async function runIds(a, ctx) {
  const json = ctx.json || a.json, dry = !!a["dry-run"];
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const m = await import("../lib/migrateids.mjs");
  const plan = await m.planMigrateIds(ctx.root, ctx.config, { keys: a.keys });
  const say = (s) => { if (!json && !ctx.quiet) console.log(s); };
  const res = { ...plan, dryRun: dry };
  const done = (code) => { if (json) console.log(JSON.stringify(res, null, 2)); return code; };
  if (plan.status === "current") { say("✅ hitl migrate --ids: ids are current (0.13) — nothing to do"); return done(0); }
  const dirty = m.dirtyFiles(ctx.root, plan.files.code) || [];
  res.dirty = dirty;
  if (!json) {
    say(`${dry ? "🔎 would migrate" : "migrating"} to 0.13 ids:`);
    say("| change | key | source |\n|---|---|---|");
    for (const k of plan.keys) say(`| ${k.label}${k.archived ? " (archived)" : ""} | ${k.key} | ${k.source} |`);
    for (const k of plan.legacyKeys) say(`| cap:${k.capability} (legacy ${k.oldKey ?? "?"}, ${k.ids} id(s)) | ${k.key} | ${k.source} |`);
    for (const k of plan.quickKeys) say(`| quick:${k.slug} (${k.file}) | ${k.key} | ${k.source} |`);
    const show = (name, mp) => { const e = Object.entries(mp); if (e.length) say(`${name} (${e.length}): ${e.slice(0, 40).map(([o, n]) => `${o}→${n}`).join(", ")}${e.length > 40 ? ", …" : ""}`); };
    show("tasks", plan.map.tasks); show("spec ids", plan.map.specs); show("decisions", plan.map.decisions);
    for (const [c, mp] of Object.entries(plan.map.local)) show(`spec ids added by ${c}`, mp);
    say(`files: ${plan.files.hitl.length} in ${HITL_DIR}/, ${plan.files.code.length} source file(s)${plan.files.renamed.length ? `, ${plan.files.renamed.length} review path(s) renamed` : ""} · lock: ${plan.lock.tasks} task(s) re-keyed, ${plan.lock.rebaselined} hash(es) re-baselined${plan.lock.schema ? ` (${plan.lock.schema})` : ""}`);
    for (const f of plan.files.code) say(`  ✏️ ${f}`);
    for (const u of plan.unresolved) say(`⚠️ unresolved ${u.id} ${u.file}:${u.line} — ${u.reason}`);
    for (const w of plan.warnings) say(`⚠️ ${w}`);
  }
  if (plan.status === "conflict") {
    res.status = "conflict";
    if (!json) { for (const c of plan.conflicts) console.error(`❌ ${c.code} ${c.ref ?? ""}: ${c.message}`); console.error("hitl migrate --ids: refused — nothing was written"); }
    return done(1);
  }
  if (dirty.length && !a.force) {
    res.status = "dirty";
    if (!json) console.error(`❌ uncommitted changes in ${dirty.length} file(s) migrate would touch or read: ${dirty.slice(0, 10).join(", ")}${dirty.length > 10 ? ", …" : ""} — commit or stash them first (or --force)`);
    if (!dry) return done(1);
  }
  if (dry) { say(`🎯 apply: hitl-index migrate --ids --keys "${[...plan.keys.filter((k) => k.source !== "proposal").map((k) => `${k.label}=${k.key}`), ...plan.legacyKeys.map((k) => `cap:${k.capability}=${k.key}`), ...plan.quickKeys.map((k) => `quick:${k.slug}=${k.key}`)].join(",")}"`); return done(0); }
  const r = await m.applyMigrateIds(ctx.root, plan);
  Object.assign(res, { status: "applied", written: r.written, renamed: r.renamed, idMap: r.idMap });
  try { const { updateIndex } = await import("../lib/indexer.mjs"); await updateIndex(ctx.root, null, { full: true }); res.reindexed = true; } catch (e) { res.reindexError = e.message; }
  say(`✅ migrated: ${r.written} file(s) written, ${r.renamed} renamed; id map → ${r.idMap}; git is not run — review and commit (chore(hitl): migrate to 0.13 ids)`);
  say("🎯 next: hitl-index spec validate · hitl-index trace --check · hitl-index drift · hitl-index status");
  return done(0);
}

export async function run(argv, ctx) {
  const a = parseArgv(argv, { flags: ["dry-run", "json", "specs", "archive-done", "ids", "force"], values: ["map", "keys"] });
  if (a.ids) return runIds(a, ctx);
  if (a.keys !== undefined || a.force) throw Object.assign(new Error("--keys and --force need --ids"), { usage: true });
  if (a.specs) return runSpecs(a, ctx);
  if (a.map !== undefined || a["archive-done"] || a._.length) throw Object.assign(new Error("--map, --archive-done and planning names need --specs"), { usage: true });
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
