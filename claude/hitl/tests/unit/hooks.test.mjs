// Unit tests for the HITL hook scripts (P3). Run: node --test tests/unit/hooks.test.mjs
//
// Each test builds a tmp project, spawns a hook with crafted stdin JSON and asserts exit code + stdout.
// Modes:
//  - real: when scripts/lib/api.mjs (P1) exists, hooks run in place against the real index core.
//  - stub: otherwise (or HITL_HOOKS_STUB=1), hooks are copied into a tmp plugin tree whose lib/api.mjs
//    is a small stand-in implementing the §G P1 contract for the fixture format used below.
//    Real P2 status.mjs/lock.mjs/nextstep.mjs are copied in when present.
import { test, describe, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const PLUGIN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL = fs.existsSync(path.join(PLUGIN, "scripts/lib/api.mjs")) && !process.env.HITL_HOOKS_STUB;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "hitl-hooks-"));
let HOOKS; // dir containing hook scripts
let LIB;   // dir containing api.mjs

// ------------------------------------------------------------------ stub P1 api (stub mode only)
const STUB_API = String.raw`
import fs from "node:fs"; import path from "node:path"; import crypto from "node:crypto";
const h = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 16);
export function paths(root) {
  const c = path.join(root, ".hitl"), i = path.join(c, "index");
  return { custom: c, docs: path.join(c, "docs"), planning: path.join(c, "planning"), tasks: path.join(c, "tasks"), index: i,
    indexJson: path.join(i, "index.json"), indexMd: path.join(i, "index.md"), cache: path.join(i, ".cache.json"), lock: path.join(i, "skeleton.lock.json"),
    state: path.join(i, "state.json"), session: path.join(i, ".session"), contracts: path.join(i, "contracts"), reviews: path.join(c, "reviews"),
    config: path.join(c, "hitl.config.json"), codebaseMap: path.join(c, "docs/CODEBASE-MAP.md") };
}
export async function findRoot(d) { for (let x = path.resolve(d);; x = path.dirname(x)) { if (fs.existsSync(path.join(x, ".hitl/hitl.config.json"))) return x; if (path.dirname(x) === x) return null; } }
const GLOBS = ["tests/**","test/**","**/__tests__/**","**/*.test.*","**/*.spec.*","**/test_*.py","**/*_test.py"];
const g2r = (g) => new RegExp("^" + g.replace(/[.+^$()|[\]\\]/g, "\\$&").replace(/\*\*\//g, "\u0001").replace(/\*\*/g, "\u0002").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]").replace(/\u0001/g, "(?:.*/)?").replace(/\u0002/g, ".*") + "$");
export async function loadConfig(root) { return { schema: "hitl.config/1", testGlobs: GLOBS, stopGate: true, ...JSON.parse(fs.readFileSync(paths(root).config, "utf8")) }; }
export function langOf(rel) { return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel) ? "ts" : /\.py$/.test(rel) ? "py" : null; }
export function isTestFile(rel, config) { return (config?.testGlobs || GLOBS).some((g) => g2r(g).test(rel)); }
export async function readJson(f, fb) { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fb; } }
export async function writeJsonAtomic(f, o) { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + ".tmp", JSON.stringify(o, null, 2) + "\n"); fs.renameSync(f + ".tmp", f); }
export async function withIndexLock(root, fn) { return fn(); }
export async function readIndex(root) { return readJson(paths(root).indexJson, null); }
export async function readTasks() { return []; }
function tagsOf(doc) {
  const t = { task: [], impl: null, status: null, prio: null, calls: [], concurrency: null, covers: [], ac: [], kind: null, origin: null };
  const one = (k) => { const m = new RegExp("@" + k + "\\s+([^@\\n]+)").exec(doc); return m ? m[1].trim() : null; };
  for (const k of ["impl", "status", "concurrency", "kind", "origin"]) t[k] = one(k);
  for (const k of ["task", "calls", "covers", "ac"]) { const v = one(k); t[k] = v ? v.split(/,\s*/) : []; }
  const p = one("prio"); t.prio = p ? Number(p) : null; return t;
}
function prose(doc) { return doc.split("\n").map((l) => l.replace(/^\s*\*?\s?/, "").trim()).filter((l) => l && !/^@/.test(l)).join("\n"); }
export async function parseSources(root, files) {
  return files.map(({ path: rel, content }) => {
    if (content === undefined) content = fs.readFileSync(path.join(root, rel), "utf8");
    const lines = content.split("\n"); const symbols = []; let doc = null; let parseError = null;
    if (/SYNTAX_ERROR/.test(content)) parseError = "stub parse error";
    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      if (L.startsWith("/**")) { let d = []; for (; i < lines.length; i++) { d.push(lines[i]); if (lines[i].includes("*/")) break; } doc = d.join("\n").replace("/**", "").replace("*/", ""); continue; }
      let m = /^export function (\w+)(\(.*\)[^{]*)\{\s*$/.exec(L);
      let t = /^it\("([^"]+)"/.exec(L);
      if (!m && !t) { if (L.trim()) doc = null; continue; }
      const start = i; const body = [];
      for (i++; i < lines.length && !/^\}\)?;?\s*$/.test(lines[i]); i++) body.push(lines[i]);
      const tags = tagsOf(doc || ""); const bodyText = body.join("\n");
      const name = m ? m[1] : t[1];
      symbols.push({ id: rel + "#" + name, name, file: rel, kind: m ? "function" : "test", parent: null, exported: !!m, async: false,
        signature: m ? m[1] + m[2].trim() : "", intent: prose(doc || ""), tags, stub: /TODO\(impl\)/.test(bodyText) && /throw/.test(bodyText),
        todos: [], flowSteps: [], features: [], locals: {}, calleesRaw: [],
        span: { start: start + 1, end: i + 1 }, docSpan: null, bodyLines: body.length,
        sigHash: h(m ? m[2].replace(/\s+/g, "") : ""), bodyHash: h(bodyText.replace(/\s+/g, " ").trim()),
        intentHash: h(prose(doc || "") + "\n" + tags.calls.join(",") + "|" + tags.concurrency), todoHash: h(""),
        test: t ? { titlePath: [name], mode: "active", coversResolved: [] } : null, _body: bodyText });
      doc = null;
    }
    return { path: rel, lang: langOf(rel), imports: [], parseError, symbols };
  });
}
function walk(root, d = "", out = []) {
  for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
    const r = d ? d + "/" + e.name : e.name;
    if (e.isDirectory()) { if (!["node_modules", ".claude", ".hitl", ".git"].includes(e.name)) walk(root, r, out); } else if (langOf(r)) out.push(r);
  } return out;
}
function link(index) {
  const all = Object.values(index.symbols);
  for (const s of all) {
    s.callees = all.filter((o) => o.kind !== "test" && o.id !== s.id && new RegExp("\\b" + o.name + "\\(").test(s._body)).map((o) => o.id);
    if (s.test) s.test.coversResolved = s.tags.covers.map((c) => (all.find((o) => o.name === c) || {}).id).filter(Boolean);
  }
  for (const s of all) s.callers = all.filter((o) => o.callees.includes(s.id)).map((o) => o.id);
}
function driftFor(index, lock, files) {
  const items = [];
  for (const [id, L] of Object.entries(lock.symbols || {})) {
    const S = index.symbols[id]; if (files && !files.includes(id.split("#")[0])) continue;
    if (!S) { items.push({ level: "warn", code: "DELETED_LOCKED", symbol: id, file: id.split("#")[0], task: L.task, message: "deleted", affected: [] }); continue; }
    if (S.sigHash !== L.sigHash) items.push({ level: "warn", code: "SIG_CHANGED", symbol: id, file: S.file, task: L.task, message: "sig", affected: S.callers });
    if (S.intentHash !== L.intentHash) items.push({ level: "warn", code: "INTENT_CHANGED", symbol: id, file: S.file, task: L.task, message: "intent", affected: S.callers });
  }
  return { schema: "hitl.drift/1", items, summary: { block: 0, warn: items.length, info: 0 } };
}
export async function updateIndex(root, rels, opts = {}) {
  const p = paths(root); const cache = await readJson(p.cache, { files: {} }); const prev = (await readIndex(root)) || { files: {}, symbols: {} };
  const files = walk(root); let changed;
  if (rels) changed = rels;
  else if (opts.full || !fs.existsSync(p.indexJson)) changed = files;
  else changed = files.filter((f) => { const st = fs.statSync(path.join(root, f)); const c = cache.files[f]; return !c || c.mtimeMs !== st.mtimeMs || c.size !== st.size; });
  const parsed = await parseSources(root, files.map((f) => ({ path: f })));
  const index = { schema: "hitl.index/1", files: {}, symbols: {} };
  for (const f of parsed) { index.files[f.path] = { lang: f.lang, symbols: f.symbols.map((s) => s.id), parseError: f.parseError }; for (const s of f.symbols) index.symbols[s.id] = s; }
  link(index);
  for (const f of files) { const st = fs.statSync(path.join(root, f)); cache.files[f] = { mtimeMs: st.mtimeMs, size: st.size }; }
  await writeJsonAtomic(p.indexJson, index); await writeJsonAtomic(p.cache, cache);
  const lock = await readJson(p.lock, {});
  const added = Object.keys(index.symbols).filter((id) => !prev.symbols[id]);
  return { schema: "hitl.indexResult/1", changedFiles: changed, added, removed: [], modified: [], drift: driftFor(index, lock, changed) };
}
export async function computeDrift(root, { files } = {}) { const idx = await readIndex(root); return driftFor(idx || { symbols: {} }, await readJson(paths(root).lock, {}), files); }
export function resolveRef() { return null; }
export async function buildContext() { return { markdown: "", symbols: [], files: [] }; }
export const tags = {};
`;
const STUB_CLI = `if (process.argv.includes("status")) console.log("T-1 approved — next: /hitl:test T-1\\nline2\\nline3");\n`;

// ------------------------------------------------------------------ fixture project
const FILES = {
  "package.json": `{"name":"fx","private":true,"type":"module"}\n`,
  "src/repo.ts": `/**
 * Finds a user by email, case-insensitive.
 * @task T-1 @impl manual @status skeleton @prio 2
 * @concurrency none
 */
export function findByEmail(email: string): string {
  return email.toLowerCase();
}
`,
  "src/svc.ts": `import { findByEmail } from "./repo.ts";

/**
 * Creates a user; rejects duplicates.
 * @task T-1 @impl agent @status skeleton @prio 1
 * @calls findByEmail
 * @concurrency none
 */
export function createUser(email: string): string {
  // TODO(impl): 1. look up the email
  throw new Error("TODO(impl): createUser");
}
`,
  "src/ctrl.ts": `import { createUser } from "./svc.ts";

export function register(email: string): string {
  return createUser(email);
}
`,
  "tests/svc.test.ts": `import { it } from "node:test";
import { createUser } from "../src/svc.ts";

/** @covers createUser @ac T-1.AC1 @kind example @origin skeleton */
it("T-1.AC1 rejects duplicate", () => {
  createUser("a@x.io");
});
`,
  ".hitl/hitl.config.json": `{"schema":"hitl.config/1"}\n`,
  ".hitl/index/contracts/T-1.md": "# Context T-1\n",
  ".hitl/tasks/feat-x.md": "# X Tasks\n",
  ".hitl/docs/ARCHITECTURE.md": "# Arch\n",
};
const IMPLEMENTED = FILES["src/svc.ts"].replace(
  `  // TODO(impl): 1. look up the email\n  throw new Error("TODO(impl): createUser");`,
  `  // 1. look up the email\n  return findByEmail(email);`);

let projN = 0;
async function mkProject({ lock = true } = {}) {
  const root = path.join(TMP, `proj${++projN}`);
  for (const [rel, c] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), c); }
  const api = await import(pathToFileURL(path.join(LIB, "api.mjs")).href);
  await api.updateIndex(root, null, { full: true });
  const index = await api.readIndex(root);
  const ids = idsOf(index);
  if (lock) {
    const L = { schema: "hitl.lock/1", symbols: {}, tests: {}, tasks: { "T-1": { file: ".hitl/tasks/feat-x.md", risk: "high", skeletonAt: "2026-01-01T00:00:00Z", testsAt: "2026-01-01T00:00:00Z", doneAt: null, doneBodyHashes: {} } } };
    for (const id of [ids.createUser, ids.findByEmail]) {
      const S = index.symbols[id];
      L.symbols[id] = { task: "T-1", impl: S.tags.impl, signature: S.signature, intent: S.intent, todos: S.todos || [], sigHash: S.sigHash, intentHash: S.intentHash, todoHash: S.todoHash, approvedAt: "2026-01-01T00:00:00Z", approvedBy: "human" };
    }
    const T = index.symbols[ids.test];
    L.tests[ids.test] = { task: "T-1", covers: [ids.createUser], ac: ["T-1.AC1"], kind: "example", stage: "locked", bodyHash: T.bodyHash, intentHash: T.intentHash, origin: "skeleton", lockedAt: "2026-01-01T00:00:00Z", lockedBy: "human" };
    fs.writeFileSync(path.join(root, ".hitl/index/skeleton.lock.json"), JSON.stringify(L, null, 2) + "\n");
  }
  return { root, ids, api };
}
function idsOf(index) {
  const find = (pred) => Object.keys(index.symbols).find((id) => pred(index.symbols[id]));
  return {
    createUser: find((s) => s.file === "src/svc.ts" && /createUser$/.test(s.name)),
    findByEmail: find((s) => s.file === "src/repo.ts" && /findByEmail$/.test(s.name)),
    register: find((s) => s.file === "src/ctrl.ts" && /register$/.test(s.name)),
    test: find((s) => s.kind === "test" && s.file === "tests/svc.test.ts"),
  };
}

function hook(name, input, { cwd } = {}) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, name)], {
    input: typeof input === "string" ? input : JSON.stringify(input), encoding: "utf8", cwd: cwd || TMP, timeout: 30000,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: path.dirname(path.dirname(HOOKS)) },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}
const json = (r) => JSON.parse(r.out);
function pre(root, tool, toolInput, agent, sid = "s1") {
  const inp = { session_id: sid, cwd: root, hook_event_name: "PreToolUse", tool_name: tool, tool_input: toolInput };
  if (agent) { inp.agent_type = agent; inp.agent_id = "a123"; }
  return hook("pre-tool.mjs", inp);
}
function assertDeny(r, re) {
  assert.equal(r.code, 0, r.err);
  const o = json(r);
  assert.equal(o.hookSpecificOutput.hookEventName, "PreToolUse");
  assert.equal(o.hookSpecificOutput.permissionDecision, "deny");
  if (re) assert.match(o.hookSpecificOutput.permissionDecisionReason, re);
}
function assertSilent(r) { assert.equal(r.code, 0, r.err); assert.equal(r.out, ""); }
function assertAllow(r) { assert.equal(r.code, 0, r.err); assert.equal(json(r).hookSpecificOutput.permissionDecision, "allow"); }

before(() => {
  if (REAL) { HOOKS = path.join(PLUGIN, "scripts/hooks"); LIB = path.join(PLUGIN, "scripts/lib"); return; }
  const pr = path.join(TMP, "plugin");
  HOOKS = path.join(pr, "scripts/hooks"); LIB = path.join(pr, "scripts/lib");
  fs.mkdirSync(HOOKS, { recursive: true }); fs.mkdirSync(LIB, { recursive: true });
  for (const f of fs.readdirSync(path.join(PLUGIN, "scripts/hooks"))) fs.copyFileSync(path.join(PLUGIN, "scripts/hooks", f), path.join(HOOKS, f));
  fs.writeFileSync(path.join(LIB, "api.mjs"), STUB_API);
  for (const f of ["status.mjs", "lock.mjs", "nextstep.mjs", "paths.mjs"]) {
    const src = path.join(PLUGIN, "scripts/lib", f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(LIB, f));
  }
  fs.writeFileSync(path.join(pr, "scripts/hitl-index.mjs"), STUB_CLI);
});

// ------------------------------------------------------------------ tests
describe(`hooks (${REAL ? "real P1 lib" : "stub P1 lib"})`, () => {
  test("hooks.json is valid and references every hook script", () => {
    const hj = JSON.parse(fs.readFileSync(path.join(PLUGIN, "hooks/hooks.json"), "utf8"));
    for (const ev of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "Stop", "SubagentStop"]) assert.ok(hj.hooks[ev], ev);
    const cmds = JSON.stringify(hj);
    for (const s of ["session-start", "prompt-submit", "pre-tool", "post-edit", "stop"]) {
      assert.ok(cmds.includes(`\${CLAUDE_PLUGIN_ROOT}/scripts/hooks/${s}.mjs`), s);
      assert.ok(fs.existsSync(path.join(PLUGIN, `scripts/hooks/${s}.mjs`)), s);
    }
  });

  test("fail-open: every hook is silent with exit 0 outside a HITL project", () => {
    const empty = fs.mkdtempSync(path.join(TMP, "empty-"));
    const inputs = [
      "{}", "not json", "",
      JSON.stringify({ session_id: "x", cwd: empty, hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: path.join(empty, "a.ts"), old_string: "a", new_string: "b" }, agent_type: "hitl:test-author", agent_id: "1" }),
      JSON.stringify({ session_id: "x", cwd: empty, hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command: "hitl-index approve T-1 --by human" } }),
      JSON.stringify({ session_id: "x", cwd: empty, hook_event_name: "UserPromptSubmit", prompt: "/hitl:approve T-1" }),
      JSON.stringify({ session_id: "x", cwd: empty, hook_event_name: "Stop", stop_hook_active: false }),
      JSON.stringify({ session_id: "x", cwd: empty, hook_event_name: "SessionStart", source: "startup" }),
    ];
    for (const h of ["pre-tool.mjs", "post-edit.mjs", "prompt-submit.mjs", "session-start.mjs", "stop.mjs"]) {
      for (const inp of inputs) {
        const r = hook(h, inp, { cwd: empty });
        assert.equal(r.code, 0, `${h} ${inp}: ${r.err}`);
        assert.equal(r.out, "", `${h} ${inp}`);
      }
    }
  });

  test("main-thread fast path: Read/Grep/Glob/Bash are silent", async () => {
    const { root } = await mkProject();
    assertSilent(pre(root, "Read", { file_path: path.join(root, "src/svc.ts") }));
    assertSilent(pre(root, "Grep", { pattern: "x" }));
    assertSilent(pre(root, "Bash", { command: "npm test" }));
  });

  test("generated files are denied for every role", async () => {
    const { root } = await mkProject();
    assertDeny(pre(root, "Edit", { file_path: path.join(root, ".hitl/index/index.json"), old_string: "a", new_string: "b" }), /Generated by hitl-index/);
    assertDeny(pre(root, "Write", { file_path: path.join(root, ".hitl/reviews/T-1.review.md"), content: "x" }), /Generated/);
    assertDeny(pre(root, "Write", { file_path: path.join(root, ".hitl/docs/CODEBASE-MAP.md"), content: "x" }, "hitl:codebase-mapper"), /Generated/);
    assertDeny(pre(root, "Write", { file_path: path.join(root, ".hitl/hitl.config.json"), content: "{}" }, "hitl:implementer"), /Generated/);
    assertSilent(pre(root, "Write", { file_path: path.join(root, ".hitl/hitl.config.json"), content: "{\"schema\":\"hitl.config/1\"}" }));
    // only the project-root .hitl/ is protected: look-alike paths elsewhere are ordinary files
    for (const p of ["src/.hitl/index/index.json", "docs.hitl/index/x.json", ".hitlx/index/x.json", "pkg/.hitl/reviews/T-1.review.md", ".claude/custom/index/index.json"])
      assertSilent(pre(root, "Write", { file_path: path.join(root, p), content: "x" }));
  });

  test("legacy .claude/custom/ project: SessionStart prints one migrate notice; other hooks stay silent", () => {
    const legacy = fs.mkdtempSync(path.join(TMP, "legacy-"));
    fs.mkdirSync(path.join(legacy, ".claude/custom"), { recursive: true });
    fs.writeFileSync(path.join(legacy, ".claude/custom/hitl.config.json"), "{}");
    const ss = hook("session-start.mjs", { session_id: "lg", cwd: legacy, hook_event_name: "SessionStart" });
    assert.equal(ss.code, 0, ss.err);
    assert.equal(ss.out.trim(), "⚠️ HITL: legacy dir .claude/custom/ — run hitl-index migrate");
    assertSilent(pre(legacy, "Write", { file_path: path.join(legacy, ".claude/custom/index/index.json"), content: "x" }));
    assertSilent(hook("prompt-submit.mjs", { session_id: "lg", cwd: legacy, hook_event_name: "UserPromptSubmit", prompt: "hi" }));
  });

  test("codebase-mapper writes only docs/*.md", async () => {
    const { root } = await mkProject();
    assertSilent(pre(root, "Write", { file_path: path.join(root, ".hitl/docs/ARCHITECTURE.md"), content: "# A\n" }, "hitl:codebase-mapper"));
    assertDeny(pre(root, "Write", { file_path: path.join(root, "src/new.ts"), content: "x" }, "hitl:codebase-mapper"), /codebase-mapper/);
  });

  test("manual symbol: Edit is denied (main and implementer)", async () => {
    const { root } = await mkProject();
    const inp = { file_path: path.join(root, "src/repo.ts"), old_string: "toLowerCase()", new_string: "toUpperCase()" };
    assertDeny(pre(root, "Edit", inp), /@impl manual/);
    assertDeny(pre(root, "Edit", inp, "hitl:implementer"), /@impl manual/);
    // an edit whose old_string is absent: let the tool fail by itself
    assertSilent(pre(root, "Edit", { ...inp, old_string: "nope-not-there" }));
  });

  test("locked test: denied for main, allowed for test-author", async () => {
    const { root } = await mkProject();
    const inp = { file_path: path.join(root, "tests/svc.test.ts"), old_string: `createUser("a@x.io");`, new_string: `createUser("b@x.io");` };
    assertDeny(pre(root, "Edit", inp), /Locked test/);
    assertSilent(pre(root, "Edit", inp, "hitl:test-author"));
  });

  test("implementer: signature/doc change denied, body change allowed, tests denied", async () => {
    const { root } = await mkProject();
    const f = path.join(root, "src/svc.ts");
    assertDeny(pre(root, "Edit", { file_path: f, old_string: "createUser(email: string)", new_string: "createUser(email: string, role: string)" }, "hitl:implementer"), /Locked contract/);
    assertDeny(pre(root, "Edit", { file_path: f, old_string: "rejects duplicates.", new_string: "allows duplicates." }, "hitl:implementer"), /Locked contract/);
    assertSilent(pre(root, "Write", { file_path: f, content: IMPLEMENTED }, "hitl:implementer"));
    assertDeny(pre(root, "Write", { file_path: path.join(root, "tests/other.test.ts"), content: "x" }, "hitl:implementer"), /implementer never edits tests/);
    // main may change a locked signature (warned in PostToolUse)
    assertSilent(pre(root, "Edit", { file_path: f, old_string: "createUser(email: string)", new_string: "createUser(email: string, role: string)" }));
    // parse failure of the new content → allow
    assertSilent(pre(root, "Write", { file_path: f, content: FILES["src/svc.ts"] + "\nSYNTAX_ERROR {{{\n" + (REAL ? "export function (" : "") }, "hitl:implementer"));
  });

  test("test-author isolation: reads, grep, writes", async () => {
    const { root } = await mkProject();
    const TA = "hitl:test-author";
    assertDeny(pre(root, "Read", { file_path: path.join(root, "src/svc.ts") }, TA), /contract pack/);
    assertSilent(pre(root, "Read", { file_path: path.join(root, "tests/svc.test.ts") }, TA));
    assertSilent(pre(root, "Read", { file_path: path.join(root, ".hitl/index/contracts/T-1.md") }, TA));
    assertSilent(pre(root, "Read", { file_path: path.join(root, ".hitl/tasks/feat-x.md") }, TA));
    assertSilent(pre(root, "Read", { file_path: path.join(root, "package.json") }, TA));
    // plugin files outside the project (templates, references) stay readable
    assertSilent(pre(root, "Read", { file_path: path.join(PLUGIN, "shared/templates/skeleton-ts.md") }, TA));
    assertSilent(pre(root, "Read", { file_path: path.join(PLUGIN, "scripts/hooks/common.mjs") }, TA));
    assertDeny(pre(root, "Grep", { pattern: "createUser" }, TA), /contract pack/);
    assertDeny(pre(root, "Grep", { pattern: "createUser", path: path.join(root, "src") }, TA), /contract pack/);
    assertDeny(pre(root, "Grep", { pattern: "createUser", path: root }, TA), /contract pack/);
    assertSilent(pre(root, "Grep", { pattern: "createUser", path: path.join(root, "tests") }, TA));
    assertSilent(pre(root, "Glob", { pattern: "**/*.ts" }, TA));
    assertDeny(pre(root, "Write", { file_path: path.join(root, "src/x.ts"), content: "x" }, TA), /only test files/);
    assertSilent(pre(root, "Write", { file_path: path.join(root, "tests/new.test.ts"), content: "x" }, TA));
    // non-hitl subagents are not restricted by role rules
    assertSilent(pre(root, "Read", { file_path: path.join(root, "src/svc.ts") }, "other-plugin:test-author"));
  });

  test("Bash allowlists for test-author and reviewer", async () => {
    const { root } = await mkProject();
    const TA = "hitl:test-author", RV = "hitl:reviewer";
    assertSilent(pre(root, "Bash", { command: "hitl-index test --task T-1 --json" }, TA));
    assertSilent(pre(root, "Bash", { command: `node "/p/scripts/hitl-index.mjs" context T-1 --contract` }, TA));
    assertDeny(pre(root, "Bash", { command: "hitl-index test --task T-1; cat src/svc.ts" }, TA), /test-author may run only/);
    assertDeny(pre(root, "Bash", { command: "cat src/svc.ts" }, TA));
    assertDeny(pre(root, "Bash", { command: "hitl-index test $(cat src/svc.ts)" }, TA));
    assertDeny(pre(root, "Bash", { command: "hitl-index drift" }, TA));
    assertSilent(pre(root, "Bash", { command: "git diff HEAD~1 -- src" }, RV));
    assertSilent(pre(root, "Bash", { command: "hitl-index drift --task T-1 --json" }, RV));
    assertDeny(pre(root, "Bash", { command: "git diff > out.txt" }, RV), /reviewer may run only/);
    // B7: `git -C <path> [--no-pager] diff|log|show|blame` is a natural reviewer form
    assertSilent(pre(root, "Bash", { command: "git -C /abs/proj diff HEAD -- src" }, RV));
    assertSilent(pre(root, "Bash", { command: "git -C . --no-pager log -3" }, RV));
    assertDeny(pre(root, "Bash", { command: "git -C . push" }, RV), /reviewer may run only/);
    assertDeny(pre(root, "Bash", { command: "git -C . diff | tee x" }, RV), /reviewer may run only/);
    assertDeny(pre(root, "Bash", { command: "rm -rf src" }, "hitl:finding-verifier"));
    assertSilent(pre(root, "Write", { file_path: path.join(root, ".hitl/reviews/T-1/findings-contract.json"), content: "{}" }, RV));
    assertDeny(pre(root, "Write", { file_path: path.join(root, "src/svc.ts"), content: "x" }, RV), /reviews/);
  });

  test("approve token: human-only, consumed once, dry-run and --by auto exempt", async () => {
    const { root } = await mkProject();
    const sid = "tok1";
    const cmd = "hitl-index approve T-1 --stage skeleton --by human --json";
    assertDeny(pre(root, "Bash", { command: cmd }, null, sid), /human-only/);
    assertSilent(pre(root, "Bash", { command: "hitl-index approve T-1 --by auto" }, null, sid));
    // chaining cannot hide a human approve behind --by auto / --dry-run elsewhere in the line
    assertDeny(pre(root, "Bash", { command: "hitl-index approve T-1 --by auto; hitl-index approve T-1 --by human" }, null, sid), /human-only/);
    assertDeny(pre(root, "Bash", { command: "hitl-index approve T-1 --by human && echo --dry-run" }, null, sid), /human-only/);
    const ps = hook("prompt-submit.mjs", { session_id: sid, cwd: root, hook_event_name: "UserPromptSubmit", prompt: "/hitl:approve T-1 skeleton" });
    assert.equal(ps.code, 0, ps.err);
    assertDeny(pre(root, "Bash", { command: cmd }, "hitl:implementer", sid), /human-only/); // subagents never
    assertSilent(pre(root, "Bash", { command: cmd + " --dry-run" }, null, sid)); // does not consume
    assertDeny(pre(root, "Bash", { command: "hitl-index approve T-2 --by human" }, null, sid), /token is for T-1/);
    assertDeny(pre(root, "Bash", { command: cmd + "; echo EXIT=$?" }, null, sid), /alone.*token is kept/); // not consumed
    assertAllow(pre(root, "Bash", { command: cmd }, null, sid)); // consumed + explicit allow (no later permission prompt)
    assertDeny(pre(root, "Bash", { command: cmd }, null, sid), /human-only/);
    // no --by counts as human; expired token denied
    fs.writeFileSync(path.join(root, ".hitl/index/.session/tok1.json"), JSON.stringify({ approveToken: { at: Date.now() - 11 * 60 * 1000, args: "T-1" } }));
    assertDeny(pre(root, "Bash", { command: `node /x/scripts/hitl-index.mjs approve T-1` }, null, sid), /human-only/);
    // B6: global flags, quoting/escaping and indirect forms cannot slip a human approve past the guard
    for (const c of ["hitl-index --json approve T-1 --by human", "hitl-index --root . approve T-1", "hitl-index 'approve' T-1",
      "hitl-index \\approve T-1", "h=hitl-index; $h approve T-1", "eval hitl-index approve T-1", "sh -c 'hitl-index approve T-1'",
      `node "/x/scripts/hitl-index.mjs" --json approve T-1 --by human`])
      assertDeny(pre(root, "Bash", { command: c }, null, "b6"), /human-only|literally/);
    for (const c of ["hitl-index --json approve T-1 --by auto", "hitl-index approve T-1 --dry-run", "hitl-index review-decide T-1 F-1 --note 'approve it'", "git commit -m 'approve'"])
      assertSilent(pre(root, "Bash", { command: c }, null, "b6"));
    // a non-approve prompt (e.g. a background task notification) issues no token
    hook("prompt-submit.mjs", { session_id: "tok2", cwd: root, hook_event_name: "UserPromptSubmit", prompt: "<task-notification> /hitl:approve T-1" });
    assertDeny(pre(root, "Bash", { command: cmd }, null, "tok2"), /human-only/);
  });

  test("override token: /hitl:implement <T> --lane fast → --by human-override for that task only, multi-use, main thread", async () => {
    const { root } = await mkProject();
    const sid = "ov1";
    const prompt = (p, s = sid) => { const r = hook("prompt-submit.mjs", { session_id: s, cwd: root, hook_event_name: "UserPromptSubmit", prompt: p }); assert.equal(r.code, 0, r.err); };
    const ov = (T, stage = "skeleton") => `hitl-index approve ${T} --stage ${stage} --by human-override --json`;
    assertDeny(pre(root, "Bash", { command: ov("T-1") }, null, sid), /override is human-only/);
    prompt("/hitl:implement T-1"); // no --lane fast → no token
    assertDeny(pre(root, "Bash", { command: ov("T-1") }, null, sid), /override is human-only/);
    prompt("/hitl:implement T-1 --lane fast");
    // the approve token is not an override token and vice versa
    assertDeny(pre(root, "Bash", { command: "hitl-index approve T-1 --by human" }, null, sid), /human-only: type \/hitl:approve/);
    assertDeny(pre(root, "Bash", { command: ov("T-1") }, "hitl:implementer", sid), /override is human-only/);
    assertDeny(pre(root, "Bash", { command: ov("T-2") }, null, sid), /covers T-1/);
    assertDeny(pre(root, "Bash", { command: ov("T-1", "done") }, null, sid), /explicit --stage skeleton\|tests/);
    assertDeny(pre(root, "Bash", { command: "hitl-index approve T-1 --by human-override" }, null, sid), /explicit --stage/);
    assertDeny(pre(root, "Bash", { command: ov("T-1") + " && echo ok" }, null, sid), /alone/);
    assertDeny(pre(root, "Bash", { command: `hitl-index approve T-1 --by auto; ${ov("T-1")}` }, null, sid), /alone/);
    assertAllow(pre(root, "Bash", { command: ov("T-1") }, null, sid));
    assertAllow(pre(root, "Bash", { command: ov("T-1", "tests") }, null, sid)); // not one-use within the run
    assertAllow(pre(root, "Bash", { command: `node /x/scripts/hitl-index.mjs approve T-1 tests --by=human-override` }, null, sid));
    // a plain reply at a gate keeps it; any other slash command ends the run
    prompt("done");
    assertAllow(pre(root, "Bash", { command: ov("T-1", "tests") }, null, sid));
    prompt("/hitl:review T-1");
    assertDeny(pre(root, "Bash", { command: ov("T-1", "tests") }, null, sid), /override is human-only/);
    // expired
    prompt("/hitl:implement T-1 --lane fast");
    const f = path.join(root, ".hitl/index/.session/ov1.json");
    const sess = JSON.parse(fs.readFileSync(f, "utf8"));
    assert.deepEqual(sess.overrideToken.tasks, ["T-1"]);
    sess.overrideToken.at = Date.now() - 4 * 60 * 60 * 1000; fs.writeFileSync(f, JSON.stringify(sess));
    assertDeny(pre(root, "Bash", { command: ov("T-1") }, null, sid), /override is human-only/);
    if (!REAL) return;
    // feature run: token bound to the tasks of that file
    fs.writeFileSync(path.join(root, ".hitl/tasks/feat-x.md"), ["# X Tasks", "← Planning: .hitl/planning/feat-x.md", "",
      "## T-1 One", "- prio: P1 | risk: high (security) | impl: agent | blocked-by: none | status: todo", "",
      "## T-2 Two", "- prio: P2 | risk: high | impl: agent | blocked-by: T-1 | status: todo", ""].join("\n"));
    fs.writeFileSync(path.join(root, ".hitl/tasks/other.md"), ["# O", "", "## T-3 Three", "- prio: P1 | risk: high | impl: agent | blocked-by: none | status: todo", ""].join("\n"));
    prompt("/hitl:implement --feature .hitl/planning/feat-x.md --lane fast", "ov2");
    assertAllow(pre(root, "Bash", { command: ov("T-2") }, null, "ov2"));
    assertDeny(pre(root, "Bash", { command: ov("T-3") }, null, "ov2"), /feature feat-x \(T-1, T-2\)/);
    prompt("/hitl:implement --feature nope --lane fast", "ov3"); // unresolvable → no token
    assertDeny(pre(root, "Bash", { command: ov("T-1") }, null, "ov3"), /override is human-only/);
  });

  test("feature summary report is generated (agents cannot write it)", async () => {
    const { root } = await mkProject();
    assertDeny(pre(root, "Write", { file_path: path.join(root, ".hitl/reviews/feature-feat-x.md"), content: "x" }), /Generated/);
  });

  test("post-edit: SIG_CHANGED with affected callers as additionalContext; silent when clean", async () => {
    const { root } = await mkProject();
    const f = path.join(root, "src/svc.ts");
    // a clean body edit by implementer → no output
    fs.writeFileSync(f, IMPLEMENTED);
    const ok = hook("post-edit.mjs", { session_id: "pe", cwd: root, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: f, content: IMPLEMENTED }, agent_type: "hitl:implementer", agent_id: "a1" });
    assertSilent(ok);
    const sess = JSON.parse(fs.readFileSync(path.join(root, ".hitl/index/.session/pe.json"), "utf8"));
    const ids = Object.keys(sess.touched);
    assert.ok(ids.some((id) => /createUser$/.test(id)));
    const t = sess.touched[ids.find((id) => /createUser$/.test(id))];
    assert.equal(t.beforeStub, true); assert.equal(t.role, "implementer");
    // signature change by main
    fs.writeFileSync(f, IMPLEMENTED.replace("createUser(email: string)", "createUser(email: string, role: string)"));
    const r = hook("post-edit.mjs", { session_id: "pe", cwd: root, hook_event_name: "PostToolUse", tool_name: "Edit", tool_input: { file_path: f, old_string: "x", new_string: "y" }, tool_response: {} });
    assert.equal(r.code, 0, r.err);
    const o = json(r);
    assert.equal(o.hookSpecificOutput.hookEventName, "PostToolUse");
    assert.match(o.hookSpecificOutput.additionalContext, /SIG_CHANGED/);
    assert.match(o.hookSpecificOutput.additionalContext, /createUser/);
    assert.match(o.hookSpecificOutput.additionalContext, /register/);
    // non-code file → silent
    assertSilent(hook("post-edit.mjs", { session_id: "pe", cwd: root, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: path.join(root, "README.md"), content: "x" } }));
  });

  test("prompt-submit: one drift line for manual edits, de-duplicated", async () => {
    const { root } = await mkProject();
    const f = path.join(root, "src/svc.ts");
    const inp = { session_id: "ps", cwd: root, hook_event_name: "UserPromptSubmit", prompt: "hello" };
    assertSilent(hook("prompt-submit.mjs", inp));
    fs.writeFileSync(f, FILES["src/svc.ts"].replace("createUser(email: string)", "createUser(email: string, role: string)"));
    const r = hook("prompt-submit.mjs", inp);
    assert.equal(r.code, 0, r.err);
    const lines = r.out.trim().split("\n");
    assert.equal(lines.length, 1, r.out);
    assert.match(lines[0], /^⚠️ HITL: 1 symbol drifted from approved skeleton \(e\.g\. createUser\) — suggest the user run \/hitl:sync$/);
    assertSilent(hook("prompt-submit.mjs", inp)); // de-dupe (nothing changed)
    fs.utimesSync(f, new Date(), new Date(Date.now() + 5000)); // touched again, same content
    assertSilent(hook("prompt-submit.mjs", inp)); // same code+symbol+hash → not repeated
  });

  test("session-start: ≤3 lines ending with the command hint; housekeeping", async () => {
    const { root } = await mkProject();
    const sd = path.join(root, ".hitl/index/.session");
    fs.mkdirSync(sd, { recursive: true });
    const old = path.join(sd, "old.json"); fs.writeFileSync(old, "{}");
    const t = new Date(Date.now() - 8 * 24 * 3600 * 1000); fs.utimesSync(old, t, t);
    fs.rmSync(path.join(root, ".hitl/index/index.json"));
    const r = hook("session-start.mjs", { session_id: "ss", cwd: root, hook_event_name: "SessionStart", source: "startup" });
    assert.equal(r.code, 0, r.err);
    const lines = r.out.trim().split("\n");
    assert.ok(lines.length >= 1 && lines.length <= 3, r.out);
    assert.equal(lines.at(-1), "HITL commands: /hitl:flow");
    assert.ok(!fs.existsSync(old));
    assert.ok(fs.existsSync(path.join(root, ".hitl/index/index.json")));
  });

  test("stop: blocks at most twice without fresh passing tests, then systemMessage; silent when green", async () => {
    const { root, api } = await mkProject();
    const f = path.join(root, "src/svc.ts");
    fs.writeFileSync(f, IMPLEMENTED);
    assertSilent(hook("post-edit.mjs", { session_id: "st", cwd: root, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: f, content: IMPLEMENTED }, agent_type: "hitl:implementer", agent_id: "a1" }));
    const stop = { session_id: "st", cwd: root, hook_event_name: "Stop", stop_hook_active: false };
    for (let i = 0; i < 2; i++) {
      const r = hook("stop.mjs", { ...stop, stop_hook_active: i > 0 });
      assert.equal(r.code, 0, r.err);
      const o = json(r);
      assert.equal(o.decision, "block");
      assert.match(o.reason, /Fresh passing tests required before finishing: .*createUser/);
      assert.match(o.reason, /T-1/);
    }
    const third = json(hook("stop.mjs", stop));
    assert.equal(third.decision, undefined);
    assert.match(third.systemMessage, /createUser implemented without fresh passing tests/);
    // SubagentStop of a non-implementer role → silent
    assertSilent(hook("stop.mjs", { session_id: "st", cwd: root, hook_event_name: "SubagentStop", agent_type: "hitl:test-author", agent_id: "t1" }));
    // record a fresh passing run → silent and block counter resets
    const index = await api.readIndex(root);
    const ids = idsOf(index);
    const state = { schema: "hitl.state/1", runs: { [ids.test]: { outcome: "pass", message: "", at: "2026-01-01T00:00:00Z", testBodyHash: index.symbols[ids.test].bodyHash, coveredBodyHashes: { [ids.createUser]: index.symbols[ids.createUser].bodyHash, [ids.findByEmail]: index.symbols[ids.findByEmail].bodyHash } } }, mutation: {}, reviews: {} };
    fs.writeFileSync(path.join(root, ".hitl/index/state.json"), JSON.stringify(state));
    assertSilent(hook("stop.mjs", stop));
    const sess = JSON.parse(fs.readFileSync(path.join(root, ".hitl/index/.session/st.json"), "utf8"));
    assert.equal(sess.stopBlocks, 0);
  });

  test("stop: SubagentStop blocks the implementer; stopGate:false disables", async () => {
    const { root } = await mkProject();
    const f = path.join(root, "src/svc.ts");
    fs.writeFileSync(f, IMPLEMENTED);
    hook("post-edit.mjs", { session_id: "sa", cwd: root, hook_event_name: "PostToolUse", tool_name: "Write", tool_input: { file_path: f, content: IMPLEMENTED }, agent_type: "hitl:implementer", agent_id: "a1" });
    const r = hook("stop.mjs", { session_id: "sa", cwd: root, hook_event_name: "SubagentStop", agent_type: "hitl:implementer", agent_id: "a1", stop_hook_active: false });
    assert.equal(json(r).decision, "block");
    fs.writeFileSync(path.join(root, ".hitl/hitl.config.json"), `{"schema":"hitl.config/1","stopGate":false}`);
    assertSilent(hook("stop.mjs", { session_id: "sa", cwd: root, hook_event_name: "Stop" }));
  });

  test("linear: map file denied for main and subagents; .inbox/ writable", async () => {
    const { root } = await mkProject();
    const map = path.join(root, ".hitl/linear.map.json");
    fs.writeFileSync(map, "{}\n");
    assertDeny(pre(root, "Edit", { file_path: map, old_string: "{}", new_string: "{\"x\":1}" }), /Generated by hitl-index/);
    assertDeny(pre(root, "Write", { file_path: map, content: "{}" }), /Generated/);
    assertDeny(pre(root, "Write", { file_path: map, content: "{}" }, "hitl:implementer"), /Generated/);
    assertDeny(pre(root, "Write", { file_path: map, content: "{}" }, "other-plugin:helper"), /Generated/);
    assertDeny(pre(root, "Write", { file_path: path.join(root, ".hitl/index/linear.queue.json"), content: "{}" }), /Generated/);
    assertSilent(pre(root, "Write", { file_path: path.join(root, ".hitl/.inbox/tickets-push.json"), content: "{}" }));
  });

  test("tagsKey: missing/empty dec (pre-v2 index) equals dec: []; real changes still differ; @dec change denied to implementer", async () => {
    const { tagsKey } = await import(pathToFileURL(path.join(HOOKS, "common.mjs")).href);
    const old = { task: ["T-1"], impl: "agent", calls: ["findByEmail"], concurrency: "none" };
    assert.equal(tagsKey(old), tagsKey({ ...old, dec: [] }));
    assert.equal(tagsKey({ concurrency: "none", impl: "agent", calls: ["findByEmail"], task: ["T-1"] }), tagsKey(old), "key order");
    assert.equal(tagsKey(null), tagsKey({}));
    assert.notEqual(tagsKey(old), tagsKey({ ...old, dec: ["D-1"] }));
    assert.notEqual(tagsKey(old), tagsKey({ ...old, calls: [] }));
    if (!REAL) return;
    const { root } = await mkProject();
    const f = path.join(root, "src/svc.ts");
    assertDeny(pre(root, "Edit", { file_path: f, old_string: " * @calls findByEmail\n", new_string: " * @calls findByEmail\n * @dec D-1\n" }, "hitl:implementer"), /Locked contract/);
    assertSilent(pre(root, "Write", { file_path: f, content: IMPLEMENTED }, "hitl:implementer"));
  });

  test("session-start: one Linear line iff the queue file has items (≤4 lines)", async () => {
    const { root } = await mkProject();
    const q = path.join(root, ".hitl/index/linear.queue.json");
    const ss = (sid) => hook("session-start.mjs", { session_id: sid, cwd: root, hook_event_name: "SessionStart", source: "startup" });
    let r = ss("lq1");
    assert.equal(r.code, 0, r.err);
    assert.ok(!/Linear/.test(r.out), r.out);
    fs.writeFileSync(q, "not json");
    r = ss("lq2");
    assert.ok(!/Linear/.test(r.out), r.out);
    fs.writeFileSync(q, JSON.stringify({ schema: "hitl.linear-queue/1", items: [] }));
    assert.ok(!/Linear/.test(ss("lq3").out));
    fs.writeFileSync(q, JSON.stringify({ schema: "hitl.linear-queue/1", items: [{ op: "updateIssue", task: "T-1" }, { op: "createIssue", task: "T-2" }] }));
    r = ss("lq4");
    const lines = r.out.trim().split("\n");
    assert.ok(lines.length <= 4, r.out);
    assert.equal(lines.filter((l) => /Linear/.test(l)).length, 1, r.out);
    assert.ok(lines.includes("⚠️ HITL: 2 Linear update(s) queued — /hitl:tickets push"), r.out);
    assert.equal(lines.at(-1), "HITL commands: /hitl:flow");
  });

  test("latency: main-thread Read fast path stays well under the budget", async () => {
    const { root } = await mkProject();
    const t0 = Date.now();
    for (let i = 0; i < 5; i++) assertSilent(pre(root, "Read", { file_path: path.join(root, "src/svc.ts") }));
    const avg = (Date.now() - t0) / 5;
    assert.ok(avg < 400, `avg ${avg}ms`); // node startup dominated; loose bound for CI noise
  });
});
