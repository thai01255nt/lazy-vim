// PreToolUse hook (design §D.3). Rules in order; first deny wins; otherwise exit 0 silently.
import fs from "node:fs";
import path from "node:path";
import {
  run, role, toolPath, findRootSync, relPath, silent, deny, allow, api, readSession, updateSession, shortName, tagsKey, CONFIG_REL, OVERRIDE_TTL_MS,
} from "./common.mjs";
import { HITL_PREFIX, HITL_RE } from "../lib/paths.mjs";

const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const READ_TOOLS = new Set(["Read", "Grep", "Glob"]);
// Matches `hitl-index [global flags…] approve` after shell-quote removal (see unquote), e.g. `hitl-index --json approve`.
const APPROVE_RE = /hitl-index(?:\.mjs)?(?:\s+-\S+(?:\s+(?!approve\b)[^\s;&|-]\S*)?)*\s+approve\b/;
// Indirect invocation (`$h approve`, `${X} approve`, `eval …approve`) cannot be judged; refuse it when hitl is involved.
const INDIRECT_APPROVE_RE = /(?:\$\{?\w+\}?|\beval\b|\bxargs\b|\bsh\s+-c\b|\bbash\s+-c\b)[^;&|]*\bapprove\b/;
const unquote = (c) => c.replace(/\\(.)/g, "$1").replace(/["']/g, "");
const CHAIN_RE = /[;&|`<>\n\r]|\$\(/;
const TOKEN_TTL_MS = 10 * 60 * 1000;

function safeBash(cmd, re) { return typeof cmd === "string" && re.test(cmd) && !CHAIN_RE.test(cmd); }
const TEST_AUTHOR_BASH = /^\s*(?:hitl-index|node\s+["']?\S*hitl-index\.mjs["']?)\s+(?:test|context|status)\b/;
const REVIEWER_BASH = /^\s*(?:(?:hitl-index|node\s+["']?\S*hitl-index\.mjs["']?)\s+(?:context|status|drift|test)\b|git\s+(?:-C\s+\S+\s+)?(?:--no-pager\s+)?(?:diff|log|show|blame)\b)/;

const CUSTOM = HITL_PREFIX; // ".hitl/"
const REVIEW_MD_RE = new RegExp(`^${HITL_RE}reviews/[^/]+\\.review\\.md$`);
const FEATURE_SUMMARY_RE = new RegExp(`^${HITL_RE}reviews/feature-[^/]+\\.(?:md|security\\.json)$`);
const MAPPER_DOC_RE = new RegExp(`^${HITL_RE}docs/[^/]+\\.md$`);
function isGenerated(rel) {
  return rel.startsWith(CUSTOM + "index/") ||
    rel === CUSTOM + "docs/CODEBASE-MAP.md" ||
    rel === CUSTOM + "linear.map.json" ||
    REVIEW_MD_RE.test(rel) || FEATURE_SUMMARY_RE.test(rel);
}

/** Paths the test-author may read: tests, contract pack, tasks/planning, conventions, non-code files. */
function testAuthorMayRead(rel, a, config) {
  if (rel === null) return true; // outside the project
  if (rel === "") return false;
  if (a.isTestFile(rel, config)) return true;
  if (rel.startsWith(CUSTOM + "index/contracts/") || rel.startsWith(CUSTOM + "tasks/") || rel.startsWith(CUSTOM + "planning/")) return true;
  if (rel === CUSTOM + "docs/PATTERNS-CONVENTIONS.md") return true;
  return !a.langOf(rel, config);
}
function testAuthorMayGrepDir(rel, a, config) {
  if (rel === null) return true;
  if (rel === "") return false;
  for (const d of ["index/contracts", "tasks", "planning"]) {
    const p = CUSTOM + d;
    if (rel === p || rel.startsWith(p + "/")) return true;
  }
  // a directory counts as a test location when a file inside it is a test file
  // (a plain name, so suffix globs like **/*.test.* do not turn src/ into a test dir)
  return a.isTestFile(rel + "/__hitl_probe__", config);
}

function applyEdit(old, ti, toolName) {
  if (toolName === "Write") return typeof ti.content === "string" ? ti.content : null;
  const edits = toolName === "MultiEdit" ? (Array.isArray(ti.edits) ? ti.edits : []) : [ti];
  let cur = old;
  for (const e of edits) {
    const from = e.old_string, to = e.new_string;
    if (typeof from !== "string" || typeof to !== "string") return null;
    if (from === "") { if (cur !== "") return null; cur = to; continue; }
    const at = cur.indexOf(from);
    if (at < 0) return null; // let the tool fail by itself
    cur = e.replace_all ? cur.split(from).join(to) : cur.slice(0, at) + to + cur.slice(at + from.length);
  }
  return cur;
}

const byOf = (seg) => { const m = /--by(?:=|\s+)["']?(human-override|human|auto)(?![\w-])/.exec(seg); return m ? m[1] : /--by\b/.test(seg) ? "?" : "human"; };
const stageOf = (seg) => {
  const m = /--stage(?:=|\s+)["']?(skeleton|tests|done)\b/.exec(seg) || /\bapprove\s+["']?T-\d+["']?\s+(skeleton|tests|done)\b/.exec(seg);
  return m ? m[1] : null;
};

/**
 * `--by human-override`: the user typed `/hitl:implement <T> --lane fast` (or `--feature <file> --lane fast`).
 * Multi-use within OVERRIDE_TTL_MS for the bound task(s), skeleton/tests stages only, main thread, plain single command.
 */
function overrideGate(root, input, R, cmd, seg) {
  const how = "type /hitl:implement <T> --lane fast";
  if (R !== "main") deny(`Fast-lane override is human-only: ${how}`);
  const tok = readSession(root, input.session_id).overrideToken;
  const fresh = tok && typeof tok.at === "number" && Date.now() - tok.at < OVERRIDE_TTL_MS && Date.now() >= tok.at - 1000;
  if (!fresh || !Array.isArray(tok.tasks)) deny(`Fast-lane override is human-only: ${how}`);
  if (CHAIN_RE.test(cmd)) deny("Run the approve command alone (no chaining, pipes or redirection)");
  const T = (/\bT-\d+\b/.exec(seg.replace(/^[\s\S]*?\bapprove\b/, "")) || [])[0];
  if (!T || !tok.tasks.includes(T)) deny(`Override token covers ${tok.feature ? `feature ${tok.feature} (${tok.tasks.join(", ")})` : tok.tasks.join(", ")}; ${how} for another task`);
  const stage = stageOf(seg);
  if (stage !== "skeleton" && stage !== "tests") deny("--by human-override needs an explicit --stage skeleton|tests (done stays a human /hitl:approve)");
  allow(`HITL fast-lane override for ${T} (${stage}) from the user's /hitl:implement --lane fast`);
}

async function approveGate(root, input, R, rawCmd) {
  const cmd = unquote(rawCmd);
  if (!APPROVE_RE.test(cmd)) {
    if (/hitl/.test(cmd) && INDIRECT_APPROVE_RE.test(cmd)) deny("Run hitl-index approve literally (no variables, eval or sh -c)");
    return;
  }
  // Judge every approve invocation separately, so `approve --by auto; approve --by human` cannot hide the human one.
  const segs = cmd.split(/[;&|\n\r`#]|\$\(/).filter((s) => APPROVE_RE.test(s));
  const human = segs.filter((s) => {
    if (byOf(s) === "auto") return false; // the CLI enforces low risk
    return !/--dry-run\b/.test(s); // preview only; does not consume the token
  });
  if (!human.length) return;
  if (human.length > 1) deny("One human approval per command: run each /hitl:approve separately");
  if (byOf(human[0]) === "human-override") overrideGate(root, input, R, cmd, human[0]);
  if (R !== "main") deny("Approval is human-only: type /hitl:approve <T>");
  const sid = input.session_id;
  const s = readSession(root, sid);
  const tok = s.approveToken;
  const fresh = tok && typeof tok.at === "number" && Date.now() - tok.at < TOKEN_TTL_MS && Date.now() >= tok.at - 1000;
  if (!fresh) deny("Approval is human-only: type /hitl:approve <T>");
  // The token is consumed here and the call is allowed outright, so a later permission check cannot swallow it.
  // Hence only a plain single command qualifies (checked before consuming; the token is kept on this deny).
  if (CHAIN_RE.test(cmd)) deny("Run the approve command alone (no chaining, pipes or redirection); the approval token is kept");
  const tokTask = /\bT-\d+\b/.exec(tok.args || "");
  const cmdTask = /\bT-\d+\b/.exec(human[0].replace(/^[\s\S]*?\bapprove\b/, ""));
  if (tokTask && (!cmdTask || cmdTask[0] !== tokTask[0])) deny(`Approval token is for ${tokTask[0]}; type /hitl:approve <T> for another task`);
  await updateSession(root, sid, (x) => { x.approveToken = null; return x; });
  allow("HITL approve token for this /hitl:approve (one use)");
}

async function main(input) {
  const tool = input.tool_name;
  if (!tool) silent();
  const R = role(input);
  const cmd = tool === "Bash" ? String((input.tool_input || {}).command || "") : "";

  // Fast path (no module loading): main-thread reads, and Bash without approve.
  if (R === "main" && READ_TOOLS.has(tool)) silent();
  if (R === "main" && tool === "Bash" && !/\bapprove\b/.test(cmd)) silent();
  if (R === "other" && (READ_TOOLS.has(tool) || (tool === "Bash" && !/\bapprove\b/.test(cmd)))) silent();
  if (!EDIT_TOOLS.has(tool) && !READ_TOOLS.has(tool) && tool !== "Bash") silent();

  const abs = toolPath(input);
  const cwd = input.cwd || process.cwd();
  const root = findRootSync(abs ? path.dirname(abs) : cwd) || (abs ? findRootSync(cwd) : null);
  if (!root) silent();
  const rel = relPath(root, abs);

  // 1. Generated files
  if (EDIT_TOOLS.has(tool) && rel) {
    if (isGenerated(rel) || (rel === CONFIG_REL && R !== "main")) deny("Generated by hitl-index; use the CLI (see /hitl:sync)");
  }

  // 5. Approve token (checked for every role so subagents cannot self-approve)
  if (tool === "Bash") await approveGate(root, input, R, cmd);

  const a = await api();
  const config = await a.loadConfig(root);

  // 2. test-author isolation
  if (R === "test-author") {
    if (tool === "Read") { if (!testAuthorMayRead(rel, a, config)) deny("test-author sees only the contract pack"); }
    else if (tool === "Grep") {
      const p = (input.tool_input || {}).path;
      if (!p) deny(`test-author sees only the contract pack: Grep needs a path inside tests or ${CUSTOM}{index/contracts,tasks,planning}`);
      let isDir = false;
      try { isDir = fs.statSync(abs).isDirectory(); } catch {}
      const ok = isDir ? testAuthorMayGrepDir(rel, a, config) : testAuthorMayRead(rel, a, config);
      if (!ok) deny("test-author sees only the contract pack");
    } else if (tool === "Glob") { /* names only */ }
    else if (EDIT_TOOLS.has(tool)) { if (!(rel && a.isTestFile(rel, config))) deny("test-author writes only test files"); }
    else if (tool === "Bash") { if (!safeBash(cmd, TEST_AUTHOR_BASH)) deny("test-author may run only: hitl-index test|context|status (no chaining or redirection)"); }
  }

  // 3. reviewer / finding-verifier: read-only except reviews/
  if (R === "reviewer" || R === "finding-verifier") {
    if (EDIT_TOOLS.has(tool) && !(rel && rel.startsWith(CUSTOM + "reviews/"))) deny(`${R} may write only under ${CUSTOM}reviews/`);
    if (tool === "Bash" && !safeBash(cmd, REVIEWER_BASH)) deny(`${R} may run only: hitl-index context|status|drift|test, git diff|log|show|blame (no chaining or redirection)`);
  }

  // 4. codebase-mapper: only docs/*.md except CODEBASE-MAP.md
  if (R === "codebase-mapper" && EDIT_TOOLS.has(tool)) {
    const ok = rel && MAPPER_DOC_RE.test(rel) && rel !== CUSTOM + "docs/CODEBASE-MAP.md";
    if (!ok) deny(`codebase-mapper may write only ${CUSTOM}docs/*.md (not CODEBASE-MAP.md)`);
  }

  // 6. Edit simulation
  if (!(tool === "Edit" || tool === "Write" || tool === "MultiEdit") || !rel) silent();
  const isTest = a.isTestFile(rel, config);
  if (R === "implementer" && isTest) deny("implementer never edits tests; report the problem instead");
  if (!a.langOf(rel, config)) silent();

  let oldText = "";
  try { oldText = fs.readFileSync(abs, "utf8"); } catch { oldText = ""; }
  const newText = applyEdit(oldText, input.tool_input || {}, tool);
  if (newText === null || newText === oldText) silent();

  const lock = await a.readJson(a.paths(root).lock, {});
  const lsyms = (lock && lock.symbols) || {};
  const ltests = (lock && lock.tests) || {};
  if (!Object.keys(lsyms).length && !Object.keys(ltests).length) silent();

  let before, after;
  try {
    [before] = await a.parseSources(root, [{ path: rel, content: oldText }], config);
    [after] = await a.parseSources(root, [{ path: rel, content: newText }], config);
  } catch { silent(); }
  if (!before || !after || after.parseError) silent(); // PostToolUse reports PARSE_ERROR
  const afterById = new Map((after.symbols || []).map((s) => [s.id, s]));

  for (const S of before.symbols || []) {
    const N = afterById.get(S.id);
    const ref = S.name || shortName(S.id);
    const changed = !N || N.sigHash !== S.sigHash || N.intentHash !== S.intentHash || N.bodyHash !== S.bodyHash;
    if (S.tags && S.tags.impl === "manual" && lsyms[S.id] && changed) {
      deny(`${ref} is @impl manual (human-owned). Ask the user to edit it, or the user flips @impl to agent.`);
    }
    if (S.kind === "test" && ltests[S.id] && R !== "test-author" && (!N || N.bodyHash !== S.bodyHash || N.intentHash !== S.intentHash)) {
      deny(`Locked test ${ref}; tests change only via /hitl:test + /hitl:approve <T> tests`);
    }
    if (R === "implementer" && lsyms[S.id] && (!N || N.sigHash !== S.sigHash || N.intentHash !== S.intentHash || tagsKey(N.tags) !== tagsKey(S.tags))) {
      deny(`Locked contract ${ref}: signature, docstring and @tags are frozen; report contractIssue instead`);
    }
  }
  // R = main with sig/intent change on a locked symbol → allowed (PostToolUse warns)
  silent();
}

run(main, { watchdogMs: 18000 });
