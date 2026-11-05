// Shared helpers for HITL hook scripts (design §D.2).
// Contract: every hook is fail-open. Outside a HITL project (no .hitl/hitl.config.json
// above the target dir / cwd) a hook exits 0 with no output. Unexpected errors exit 0 silently
// (one stderr line only when HITL_DEBUG=1). Only deliberate decisions print JSON.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CONFIG_REL, HITL_DIR, LEGACY_NOTICE, findLegacyRootSync } from "../lib/paths.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.dirname(HERE); // <plugin>/scripts
export { CONFIG_REL };

/** Write synchronously to fd 1 and exit (pipes may be async on some platforms). */
export function emit(text) {
  if (text) fs.writeSync(1, text.endsWith("\n") ? text : text + "\n");
  process.exit(0);
}
export function silent() { process.exit(0); }

export function readStdin() {
  try {
    const raw = fs.readFileSync(0, "utf8");
    if (!raw.trim()) return {};
    const o = JSON.parse(raw);
    return o && typeof o === "object" ? o : {};
  } catch { return {}; }
}

/**
 * Role of the agent the hook fires in. Verified (Claude Code 2.1.310): inside a plugin subagent,
 * PreToolUse/PostToolUse/SubagentStop carry agent_type "<plugin>:<name>" (e.g. "hitl:test-author")
 * plus agent_id; on the main thread both are absent.
 * Returns "main" | one of HITL_ROLES | "other" (a subagent that is not ours).
 */
export const HITL_ROLES = ["test-author", "implementer", "reviewer", "finding-verifier", "codebase-mapper", "spec-scout", "spec-reviewer", "work-router"];
export function role(input) {
  const t = typeof input.agent_type === "string" ? input.agent_type.trim() : "";
  if (!t) return "main";
  const i = t.lastIndexOf(":");
  const suffix = i >= 0 ? t.slice(i + 1) : t;
  const prefix = i >= 0 ? t.slice(0, i) : "";
  if (HITL_ROLES.includes(suffix) && (prefix === "" || prefix === "hitl")) return suffix;
  // `claude --agent X` sets agent_type on the main thread too; agent_id is only set inside subagents.
  if (!input.agent_id) return "main";
  return "other";
}

/** Cheap root search (no module loading): nearest ancestor containing .hitl/hitl.config.json. */
export function findRootSync(startDir) {
  if (!startDir || typeof startDir !== "string") return null;
  let dir = path.resolve(startDir);
  try { if (fs.statSync(dir).isFile()) dir = path.dirname(dir); } catch { /* may not exist yet */ }
  for (;;) {
    try { if (fs.statSync(path.join(dir, CONFIG_REL)).isFile()) return dir; } catch { /* keep walking */ }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/** Absolute path of the tool target (file_path | notebook_path | path), or null. */
export function toolPath(input) {
  const ti = input.tool_input || {};
  const p = ti.file_path || ti.notebook_path || ti.path;
  if (!p || typeof p !== "string") return null;
  return path.isAbsolute(p) ? p : path.resolve(input.cwd || process.cwd(), p);
}

/** Project root for this hook input, or exit 0 silently (fail-open). */
export function projectRootOrExit(input, { useToolPath = true, legacyNotice = false } = {}) {
  const abs = useToolPath ? toolPath(input) : null;
  const start = abs ? path.dirname(abs) : (input.cwd || process.cwd());
  const root = findRootSync(start) || (abs ? findRootSync(input.cwd || process.cwd()) : null);
  // ≤ 0.3 project (.claude/custom/ only): never auto-move; SessionStart prints one notice line.
  if (!root && legacyNotice && findLegacyRootSync(start)) emit(LEGACY_NOTICE);
  if (!root) silent();
  return root;
}

/** Project-relative POSIX path, or null if outside the root. */
export function relPath(root, abs) {
  if (!abs) return null;
  const r = path.relative(root, abs);
  if (!r || r.startsWith("..") || path.isAbsolute(r)) return r === "" ? "" : null;
  return r.split(path.sep).join("/");
}

let _api = null;
export async function api() {
  if (!_api) _api = await import(pathToFileURL(path.join(SCRIPTS_DIR, "lib", "api.mjs")).href);
  return _api;
}
export async function optionalLib(name) {
  try { return await import(pathToFileURL(path.join(SCRIPTS_DIR, "lib", name)).href); } catch { return null; }
}

export function deny(reason) {
  emit(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } }));
}
export function allow(reason) {
  emit(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: reason } }));
}

export function context(event, text) {
  if (!text) silent();
  const t = text.length > 2000 ? text.slice(0, 1997) + "..." : text;
  emit(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: t } }));
}

/** Wrap a hook: watchdog (exit 0 before Claude's timeout), try/catch fail-open. */
export function run(main, { watchdogMs = 8000 } = {}) {
  const wd = setTimeout(() => process.exit(0), watchdogMs);
  wd.unref();
  Promise.resolve()
    .then(() => main(readStdin()))
    .then(() => process.exit(0))
    .catch((e) => {
      if (process.env.HITL_DEBUG) { try { fs.writeSync(2, `hitl hook: ${e && e.stack || e}\n`); } catch {} }
      process.exit(0);
    });
}

// ---------------------------------------------------------------- session file
// .hitl/index/.session/<session_id>.json
// {touched:{[id]:{beforeBodyHash, beforeStub, role}}, stopBlocks, approveToken:{at,args}|null, reportedDrift:{[key]:at},
//  overrideToken:{at,args,tasks:[T-ids],feature:name|null}|null}  (fast-lane override: `/hitl:implement … --lane fast`)
export function sessionDir(root) { return path.join(root, HITL_DIR, "index", ".session"); }
function safeSid(sid) { return String(sid || "nosession").replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120) || "nosession"; }
export function sessionFile(root, sid) { return path.join(sessionDir(root), safeSid(sid) + ".json"); }

export function emptySession() { return { touched: {}, stopBlocks: 0, approveToken: null, reportedDrift: {}, overrideToken: null }; }

/** Fast-lane override token lifetime: one run of /hitl:implement (a feature run may take a while; resume re-issues it). */
export const OVERRIDE_TTL_MS = 3 * 60 * 60 * 1000;

export function readSession(root, sid) {
  try {
    const o = JSON.parse(fs.readFileSync(sessionFile(root, sid), "utf8"));
    return { ...emptySession(), ...o };
  } catch { return emptySession(); }
}

function writeAtomic(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

/** Read-modify-write the session under a small lock file (subagents may run in parallel). */
export async function updateSession(root, sid, fn) {
  const file = sessionFile(root, sid);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = file + ".lock";
  let fd = null;
  const deadline = Date.now() + 2000;
  while (fd === null) {
    try { fd = fs.openSync(lock, "wx"); }
    catch {
      try { if (Date.now() - fs.statSync(lock).mtimeMs > 5000) { fs.rmSync(lock, { force: true }); continue; } } catch {}
      if (Date.now() > deadline) break; // proceed without lock rather than hang
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  try {
    const s = readSession(root, sid);
    const out = (await fn(s)) || s;
    writeAtomic(file, out);
    return out;
  } finally {
    if (fd !== null) { try { fs.closeSync(fd); fs.rmSync(lock, { force: true }); } catch {} }
  }
}

/**
 * Order-independent key of a symbol's @tags. Missing keys, null and empty lists compare equal, so a tag added to the
 * grammar later (e.g. `dec: []` in v2) never looks like a tag change on symbols parsed by an older index.
 */
export function tagsKey(t) {
  if (!t || typeof t !== "object") return "{}";
  const o = {};
  for (const k of Object.keys(t).sort()) {
    const v = t[k];
    if (v === undefined || v === null || (Array.isArray(v) && v.length === 0)) continue;
    o[k] = v;
  }
  return JSON.stringify(o);
}

// ---------------------------------------------------------------- drift helpers (D.4–D.6)
export function shortName(id) {
  if (!id) return "?";
  const i = String(id).indexOf("#");
  return i >= 0 ? String(id).slice(i + 1) : String(id);
}

/** warn/block drift items that concern locked symbols/tests. */
export function lockedDriftItems(drift, lock) {
  const items = (drift && Array.isArray(drift.items)) ? drift.items : [];
  const ls = (lock && lock.symbols) || {};
  const lt = (lock && lock.tests) || {};
  return items.filter((it) => it && (it.level === "warn" || it.level === "block") &&
    (ls[it.symbol] || lt[it.symbol] || it.code === "DELETED_REFERENCED"));
}

export function driftKey(item, index) {
  const s = index && index.symbols && index.symbols[item.symbol];
  const h = s ? `${s.sigHash || ""}.${s.intentHash || ""}.${s.bodyHash || ""}` : "gone";
  return `${item.code}|${item.symbol}|${h}`;
}

/** The single safety-net line (D.5 step 4). */
export function driftLine(items) {
  const syms = [...new Set(items.map((i) => i.symbol))];
  const n = syms.length;
  return `⚠️ HITL: ${n} symbol${n === 1 ? "" : "s"} drifted from approved skeleton (e.g. ${shortName(syms[0])}) — suggest the user run /hitl:sync`;
}

/**
 * Filter locked drift items not yet reported in this session; mark them reported.
 * Returns the new items (possibly empty).
 */
export async function newLockedDrift(root, sid, drift, lock, index) {
  const items = lockedDriftItems(drift, lock);
  if (!items.length) return [];
  let fresh = [];
  await updateSession(root, sid, (s) => {
    s.reportedDrift = s.reportedDrift || {};
    fresh = items.filter((it) => !s.reportedDrift[driftKey(it, index)]);
    for (const it of fresh) s.reportedDrift[driftKey(it, index)] = new Date().toISOString();
    return s;
  });
  return fresh;
}

// ---------------------------------------------------------------- approve token binding
const STAGE_WORDS = new Set(["skeleton", "tests", "done", "intent", "accept", "reopen", "dismiss", "defer"]);
const CHANGE_STAGE_WORDS = new Set(["intent", "accept", "reopen", "dismiss", "defer"]);
/**
 * What a `/hitl:approve <args>` token authorizes, from its raw args (first token decides):
 * `T-n …` → {kind:"task", task}; `<change-id> intent|accept|reopen|dismiss|defer …` → {kind:"change", change, stage},
 * plus `note` (the `N-k` after reopen/dismiss/defer) and `to` (defer's target change); anything else (no args, flags only) →
 * {kind:"any"} (any one task approve, never a --change approve). A change id is never a T-id.
 */
export function approveBinding(args) {
  const toks = String(args || "").trim().split(/[\s,]+/).filter(Boolean);
  const first = toks[0] || "";
  if (/^T-\d+$/.test(first)) return { kind: "task", task: first };
  if (CHANGE_STAGE_WORDS.has(toks[1]) && /^[A-Za-z0-9][\w.-]*$/.test(first) && !STAGE_WORDS.has(first) && !first.startsWith("-")) {
    const b = { kind: "change", change: first, stage: toks[1] };
    if (["reopen", "dismiss", "defer"].includes(b.stage) && /^N-\d+$/.test(toks[2] || "")) b.note = toks[2];
    if (b.stage === "defer" && b.note && toks[3]) b.to = toks[3];
    return b;
  }
  if (/\bT-\d+\b/.test(args || "")) return { kind: "task", task: /\bT-\d+\b/.exec(args)[0] }; // legacy: a T-id anywhere binds to it
  return { kind: "any" };
}

// ---------------------------------------------------------------- post-edit drift lines
// An item carrying a `fix` (archived change: claim or accept) or no task shows that instead of a rebuilt command.
const fixOr = (it, f) => (it.fix ? `Ask the user to choose — ${it.fix}.` : it.task ? f(it) : it.message || f(it));
const HINT = {
  SIG_CHANGED: (it) => fixOr(it, (x) => `Needs human re-approval (/hitl:approve ${x.task || "<T>"}).`),
  INTENT_CHANGED: (it) => fixOr(it, (x) => `Needs human re-approval (/hitl:approve ${x.task || "<T>"}).`),
  TODO_FLOW_CHANGED: (it) => fixOr(it, () => "TODO(impl) steps changed since approval."),
  ARCHIVED_BODY_CHANGED: (it) => fixOr(it, () => "Body of an archived change's symbol changed; the user claims it into an open task or accepts it (/hitl:sync)."),
  ORPHAN: (it) => `add @task ${it.task || "T-n"} @impl agent @status skeleton.`,
  DELETED_REFERENCED: () => "Restore it or update the referencing symbols.",
  DELETED_LOCKED: () => "Locked symbol removed; the user must re-approve or restore it.",
  RENAMED: (it) => `Locked symbol renamed to ${it.affected?.[0]?.split("#")[1] || "?"}; update the tasks md ### Symbols row and @covers, then the user re-approves (/hitl:approve ${it.task || "<T>"} skeleton).`,
  TEST_CHANGED: (it) => (it.fix ? fixOr(it, () => "") : "Locked test changed; tests change only via /hitl:test + /hitl:approve <T> tests."),
  TEST_DELETED: (it) => (it.fix ? fixOr(it, () => "") : "Locked test removed."),
  TEST_SKIPPED: (it) => (it.fix ? fixOr(it, () => "") : "Locked test is now skipped/todo."),
  PARSE_ERROR: () => "Fix the syntax error; the index keeps the last good parse.",
};

/** One PostToolUse drift line: code, symbol, owner, callers and the hint (an item's `fix` when it has one). */
export function formatDriftItem(it) {
  const name = shortName(it.symbol) || it.file || "?";
  const locked = it.task && it.code !== "ORPHAN" ? ` (locked ${it.task})` : it.change ? ` (archived ${it.change})` : "";
  const aff = Array.isArray(it.affected) && it.affected.length ? ` — affected callers: ${it.affected.map(shortName).join(", ")}.` : "";
  const hint = HINT[it.code] ? HINT[it.code](it) : (it.message || "");
  const sep = it.code === "ORPHAN" ? " has no @task —" : "";
  return `⚠️ ${it.code} ${name}${locked}${sep}${aff} ${hint}`.replace(/\s+/g, " ").trim();
}
