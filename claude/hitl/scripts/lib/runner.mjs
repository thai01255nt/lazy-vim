// P2 — test selection, runner invocation, JUnit recording (§E.1 `test`).
import { spawn } from "node:child_process";
import { promises as fsp } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadApi, resolveWith, taskSymbolIds, taskTestIds, coversOf, isTest, CODE_KINDS } from "./lock.mjs";
import { calleeClosure, testsFor, directCoverage, isFresh } from "./status.mjs";
import { parseJUnit, matchCases } from "./junit.mjs";
import { recordRuns } from "./state.mjs";

export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const shq = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";

const EXT_LANG = { ts: "ts", tsx: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts", mts: "ts", cts: "ts", py: "py" };
export function langOfFile(rel, config, api) {
  try { if (api?.langOf) return api.langOf(rel, config); } catch { /* fallback */ }
  const m = /\.([^.\/]+)$/.exec(rel); return m ? EXT_LANG[m[1]] || null : null;
}

/** Substitute {junit} {files} {root} {plugin} / ${PLUGIN} / ${CLAUDE_PLUGIN_ROOT} placeholders. */
export function buildCommand(tpl, { junit = "", files = [], root = "", plugin = PLUGIN_ROOT, mutate = "" } = {}) {
  return String(tpl)
    .replace(/\{junit\}/g, shq(junit))
    .replace(/\{files\}/g, files.map(shq).join(" "))
    .replace(/\{root\}/g, shq(root))
    .replace(/\{mutate\}/g, shq(mutate))
    .replace(/\$\{(PLUGIN|CLAUDE_PLUGIN_ROOT)\}|\{plugin\}/g, plugin);
}

export function runShell(cmd, { cwd, env = {}, timeoutMs = 600000 } = {}) {
  return new Promise((res) => {
    let out = ""; let err = ""; let timedOut = false;
    let child;
    try { child = spawn("sh", ["-c", cmd], { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e) { res({ code: 127, stdout: "", stderr: String(e.message), timedOut }); return; }
    const cap = (s, d) => (s.length > 200000 ? s.slice(-200000) : s) + d;
    child.stdout.on("data", (d) => { out = cap(out, d.toString()); });
    child.stderr.on("data", (d) => { err = cap(err, d.toString()); });
    const t = setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs);
    child.on("error", (e) => { clearTimeout(t); res({ code: 127, stdout: out, stderr: err + e.message, timedOut }); });
    child.on("close", (code) => { clearTimeout(t); res({ code: code ?? 1, stdout: out, stderr: err, timedOut }); });
  });
}

/**
 * Select tests + target symbols.
 * target: {task?, symbol?, files?:[rel]} ; returns {testIds, symbolIds, errors}
 */
export function selectTests(index, target, { tasks = [], api } = {}) {
  const errors = [];
  let symbolIds = []; let testIds = [];
  const cov = directCoverage(index);
  const testsOf = (ids) => { const s = new Set(); for (const id of ids) for (const t of testsFor(index, id, cov).tests) s.add(t); return s; };
  if (target.task) {
    const task = tasks.find((t) => t.id === target.task);
    if (!task && !Object.values(index.symbols).some((s) => (s.tags?.task || []).includes(target.task))) errors.push(`task ${target.task} not found`);
    symbolIds = taskSymbolIds(index, target.task, task, api).filter((id) => CODE_KINDS.has(index.symbols[id].kind));
    const s = testsOf(symbolIds); for (const t of taskTestIds(index, target.task, symbolIds)) s.add(t);
    testIds = [...s];
  } else if (target.symbol) {
    const r = resolveWith(api, index, target.symbol);
    if (!r) errors.push(`symbol ${target.symbol} not found`);
    else if (r.ambiguous) errors.push(`symbol ${target.symbol} is ambiguous: ${r.ambiguous.join(", ")}`);
    else {
      const S = index.symbols[r.id];
      symbolIds = S.kind === "class" ? Object.values(index.symbols).filter((m) => m.parent === r.id && CODE_KINDS.has(m.kind)).map((m) => m.id) : [r.id];
      testIds = [...testsOf(symbolIds)];
    }
  } else if (target.files?.length) {
    const fs = new Set(target.files.map((f) => f.replace(/^\.\//, "")));
    const direct = Object.values(index.symbols).filter((s) => fs.has(s.file));
    testIds = direct.filter(isTest).map((s) => s.id);
    symbolIds = direct.filter((s) => CODE_KINDS.has(s.kind)).map((s) => s.id);
    for (const t of testsOf(symbolIds)) if (!testIds.includes(t)) testIds.push(t);
    for (const t of testIds) for (const c of coversOf(index, index.symbols[t])) if (!symbolIds.includes(c)) symbolIds.push(c);
  } else {
    testIds = Object.values(index.symbols).filter(isTest).map((s) => s.id);
    symbolIds = Object.values(index.symbols).filter((s) => CODE_KINDS.has(s.kind) && ((s.tags?.task || []).length)).map((s) => s.id);
  }
  return { testIds: testIds.sort(), symbolIds: symbolIds.sort(), errors };
}

/** Build state run records for matched results. */
export function buildRunRecords(index, matched) {
  return matched.map((m) => {
    const t = index.symbols[m.testId];
    const covered = calleeClosure(index, coversOf(index, t));
    const coveredBodyHashes = {};
    for (const id of covered) if (index.symbols[id]) coveredBodyHashes[id] = index.symbols[id].bodyHash;
    return { testId: m.testId, outcome: m.outcome, message: m.message, testBodyHash: t?.bodyHash ?? null, coveredBodyHashes };
  });
}

/** Per-symbol summary {status,pass,fail,skip,stale}. */
export function perSymbolSummary(index, state, symbolIds, statuses) {
  const out = {}; const cov = directCoverage(index);
  for (const id of symbolIds) {
    const c = { status: statuses?.symbols?.[id]?.status || null, pass: 0, fail: 0, skip: 0, stale: 0 };
    for (const t of testsFor(index, id, cov).tests) {
      const r = state.runs?.[t];
      if (!r) { c.skip++; continue; }
      if (!isFresh(index, state, t, id)) { c.stale++; continue; }
      if (r.outcome === "pass") c.pass++; else if (r.outcome === "skip") c.skip++; else c.fail++;
    }
    out[id] = c;
  }
  return out;
}

/**
 * Run the configured test command(s) for testIds, parse JUnit, match.
 * @returns {{matched, unmatched, errors:[], commands:[{lang, cmd, code}]}}
 */
export async function runTestIds(root, { index, config, testIds, api, junitFile }) {
  const errors = []; const commands = []; let matched = []; let unmatched = [];
  const byLang = new Map();
  for (const id of testIds) {
    const t = index.symbols[id]; const lang = langOfFile(t.file, config, api);
    if (!byLang.has(lang)) byLang.set(lang, new Set());
    byLang.get(lang).add(t.file);
  }
  const ingest = async (xml, files) => {
    const r = matchCases(parseJUnit(xml), index, { root, files });
    matched = matched.concat(r.matched); unmatched = unmatched.concat(r.unmatched);
  };
  if (junitFile) {
    let xml; try { xml = await fsp.readFile(resolve(root, junitFile), "utf8"); } catch (e) { errors.push(`cannot read ${junitFile}: ${e.message}`); return { matched, unmatched, errors, commands, fatal: true }; }
    await ingest(xml, null);
    return { matched, unmatched, errors, commands };
  }
  let fatal = false;
  for (const [lang, fileSet] of [...byLang.entries()].sort()) {
    const tpl = config?.commands?.test?.[lang];
    if (!tpl) { errors.push(`no test command configured for ${lang} (hitl-index init --set commands.test.${lang}="…")`); fatal = true; continue; }
    const dir = await fsp.mkdtemp(join(tmpdir(), "hitl-junit-"));
    const junit = join(dir, "junit.xml");
    const files = [...fileSet].sort();
    const cmd = buildCommand(tpl, { junit, files, root });
    const r = await runShell(cmd, { cwd: root, env: { JEST_JUNIT_OUTPUT_FILE: junit, HITL_JUNIT: junit }, timeoutMs: config?.commands?.testTimeoutMs || 600000 });
    commands.push({ lang, cmd, code: r.code, timedOut: r.timedOut });
    let xml = null; try { xml = await fsp.readFile(junit, "utf8"); } catch { /* none */ }
    await fsp.rm(dir, { recursive: true, force: true });
    if (!xml) {
      fatal = true;
      errors.push(`${lang} test command produced no JUnit report (exit ${r.code}${r.timedOut ? ", timed out" : ""}): ${cmd}\n${(r.stderr || r.stdout).trim().split("\n").slice(-15).join("\n")}`);
      continue;
    }
    await ingest(xml, files);
  }
  return { matched, unmatched, errors, commands, fatal };
}

/**
 * Full `test` flow: reindex changed, select, run, record, compute statuses.
 * opts: {task?, symbol?, files?, junit?, recordOnly?}
 */
export async function executeTest(root, config, opts = {}) {
  const api = await loadApi();
  if (!api) throw new Error("hitl-index core (lib/api.mjs) not available");
  try { await api.updateIndex(root, null, { changedOnly: true }); } catch { /* best effort */ }
  const index = await api.readIndex(root);
  if (!index) return { error: "index missing: run hitl-index index --all", fatal: true };
  const tasks = (await api.readTasks(root).catch(() => [])) || [];
  const sel = selectTests(index, { task: opts.task, symbol: opts.symbol, files: opts.files }, { tasks, api });
  if (sel.errors.length && !sel.testIds.length) return { error: sel.errors.join("; "), fatal: true };
  const r = await runTestIds(root, { index, config, testIds: sel.testIds, api, junitFile: opts.junit });
  const records = buildRunRecords(index, r.matched);
  if (records.length) await recordRuns(root, records);
  const { readState } = await import("./state.mjs");
  const { readLock } = await import("./lock.mjs");
  const { computeStatuses } = await import("./status.mjs");
  const state = await readState(root); const lock = await readLock(root);
  const statuses = computeStatuses(index, lock, state, config, tasks);
  return {
    runs: r.matched.map(({ testId, outcome, message }) => ({ testId, outcome, message })),
    perSymbol: perSymbolSummary(index, state, sel.symbolIds, statuses),
    unmatched: r.unmatched, errors: [...sel.errors, ...r.errors], commands: r.commands,
    fatal: !!r.fatal && !r.matched.length, selected: sel.testIds, statuses, index, tasks, state, lock,
  };
}
