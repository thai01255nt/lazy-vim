// SessionStart hook (design §D.6): housekeeping, cheap reindex, ≤5 plain-stdout lines (brief, drift, linear queue, v0.5 planning notice, commands).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { run, projectRootOrExit, emit, api, sessionDir, newLockedDrift, driftLine, SCRIPTS_DIR } from "./common.mjs";
import { HITL_DIR } from "../lib/paths.mjs";

const WEEK_MS = 7 * 24 * 3600 * 1000;

function housekeeping(root) {
  const dir = sessionDir(root);
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return; }
  const now = Date.now();
  for (const n of names) {
    if (!n.endsWith(".json") && !n.endsWith(".lock") && !n.endsWith(".tmp")) continue;
    const f = path.join(dir, n);
    try { if (now - fs.statSync(f).mtimeMs > WEEK_MS) fs.rmSync(f, { force: true }); } catch {}
  }
}

function briefLine(root) {
  try {
    const out = execFileSync(process.execPath, [path.join(SCRIPTS_DIR, "hitl-index.mjs"), "status", "--brief", "--soft", "--root", root],
      { cwd: root, encoding: "utf8", timeout: 4000, stdio: ["ignore", "pipe", "ignore"] });
    return out.split(/\r?\n/).map((l) => l.trim()).find(Boolean) || "";
  } catch { return ""; }
}

/** One line when Linear updates are queued (design v2 §A.5.6): a plain file read, no module import, no network. */
function linearQueueLine(root) {
  try {
    const q = JSON.parse(fs.readFileSync(path.join(root, HITL_DIR, "index", "linear.queue.json"), "utf8"));
    const n = q && Array.isArray(q.items) ? q.items.length : 0;
    return n > 0 ? `⚠️ HITL: ${n} Linear update(s) queued — /hitl:tickets push` : "";
  } catch { return ""; }
}

/** design v3 §5.3: one line while v0.5 planning files remain (plain readdir, no module import). */
function legacyPlanningLine(root) {
  try {
    return fs.readdirSync(path.join(root, HITL_DIR, "planning")).some((n) => n.endsWith(".md"))
      ? "⚠️ HITL: v0.5 planning files — run hitl-index migrate --specs" : "";
  } catch { return ""; }
}

async function main(input) {
  const root = projectRootOrExit(input, { useToolPath: false, legacyNotice: true });
  housekeeping(root);
  const a = await api();
  let res = null;
  try {
    const hasIndex = fs.existsSync(a.paths(root).indexJson);
    res = hasIndex
      ? await a.updateIndex(root, null, { changedOnly: true, budgetMs: 4000 })
      : await a.updateIndex(root, null, { full: true, budgetMs: 10000 });
  } catch { res = null; }

  const lines = [];
  const brief = briefLine(root);
  if (brief) lines.push(brief);
  let drift = null;
  try { drift = await a.computeDrift(root, {}); } catch { drift = res && res.drift; }
  if (drift) {
    try {
      const lock = await a.readJson(a.paths(root).lock, {});
      const index = await a.readIndex(root);
      const fresh = await newLockedDrift(root, input.session_id, drift, lock, index);
      if (fresh.length) lines.push(driftLine(fresh));
    } catch {}
  }
  const lq = linearQueueLine(root);
  if (lq) lines.push(lq);
  const lp = legacyPlanningLine(root);
  if (lp) lines.push(lp);
  lines.push("HITL commands: /hitl:flow");
  emit(lines.join("\n"));
}

run(main, { watchdogMs: 14000 });
