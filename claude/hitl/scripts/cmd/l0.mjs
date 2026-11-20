// P2 — `hitl-index l0 <T> [--json]`: deterministic gates → reviews/<T>/l0.json (§E.8)
import { parseArgs } from "node:util";
import { join } from "node:path";
import { loadApi, p2paths, writeJsonSorted, CODE_KINDS, readLock, taskSymbolIds, taskTestIds, testOwner } from "../lib/lock.mjs";
import { mutationRequiredFor } from "../lib/config.mjs";
import { testBudget } from "../lib/testplan.mjs";
import { executeTest, runShell, buildCommand } from "../lib/runner.mjs";
import { readState } from "../lib/state.mjs";
import { buildTrace, loadTraceInputs, specLinksFor } from "../lib/trace.mjs";
import { taskGlossary } from "../lib/changes.mjs";
import { avoidList, avoidedInIntents, effectiveTerms } from "../lib/glossary.mjs";
import { historyItems } from "../lib/history.mjs";

const OPTS = { json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };
const lastLine = (s) => (String(s || "").trim().split("\n").filter(Boolean).pop() || "").slice(0, 200);

async function cmdGate(name, tpl, root) {
  if (!tpl) return { name, result: "skip", detail: "not configured" };
  const r = await runShell(buildCommand(tpl, { root }), { cwd: root, timeoutMs: 600000 });
  return { name, result: r.code === 0 ? "pass" : "fail", detail: r.code === 0 ? "" : `exit ${r.code}${r.timedOut ? " (timeout)" : ""}: ${lastLine(r.stderr) || lastLine(r.stdout)}` };
}

export async function computeL0(root, config, T) {
  const api = await loadApi(); if (!api) throw new Error("hitl-index core not available");
  const gates = [];
  gates.push(await cmdGate("lint", config?.commands?.lint, root));
  gates.push(await cmdGate("typecheck", config?.commands?.typecheck, root));
  const t = await executeTest(root, config, { task: T });
  const tests = { pass: 0, fail: 0, error: 0, skip: 0, stale: 0 };
  if (!t.error) {
    for (const r of t.runs) tests[r.outcome] = (tests[r.outcome] || 0) + 1;
    tests.stale = Object.values(t.perSymbol).reduce((a, c) => a + (c.stale || 0), 0);
  }
  const total = tests.pass + tests.fail + tests.error;
  gates.push(t.error || t.fatal ? { name: "tests", result: "fail", detail: t.error || t.errors.join("; ").slice(0, 300) }
    : !total ? { name: "tests", result: "skip", detail: "no active tests ran" }
    : { name: "tests", result: tests.fail + tests.error ? "fail" : "pass", detail: tests.fail + tests.error ? `${tests.fail} fail, ${tests.error} error` : "fresh for current bodies" });
  let drift = null;
  try { drift = await api.computeDrift(root, { task: T, spec: true }); } catch (e) { drift = { schema: "hitl.drift/1", items: [], summary: { block: 0, warn: 0, info: 0 }, error: e.message }; }
  const items = drift.items || [];
  const lockedish = items.filter((i) => i.level !== "info");
  gates.push({ name: "drift", result: drift.summary?.block ? "fail" : "pass", detail: lockedish.slice(0, 3).map((i) => `${i.code} ${i.symbol || i.file}`).join("; ") });
  const state = await readState(root);
  const index = t.index || (await api.readIndex(root));
  const symIds = t.statuses?.tasks?.[T]?.symbols || Object.keys(index?.symbols || {}).filter((id) => (index.symbols[id].tags?.task || []).includes(T) && CODE_KINDS.has(index.symbols[id].kind));
  let trace = null; let inputs = null;
  try {
    inputs = await loadTraceInputs(root, config, { index: index || undefined, state, statuses: t.statuses, tasks: t.tasks });
    const tr = buildTrace(inputs, { kind: "task", id: T });
    const acs = tr.rows.flatMap((r) => r.acs).filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i)
      .map((a) => ({ id: a.id, reqs: a.reqs, proven: a.proven, tests: a.tests.length, test: a.test || "new", ...(a.testDetail ? { testDetail: a.testDetail } : {}) }));
    const spec = {};
    for (const id of symIds) {
      const sp = specLinksFor(inputs, id);
      // design v3 §5.5: change tasks carry {change, archived, capability, design}; requirements list scenario ids when the AC refs one
      if (sp && (sp.decisions.length || sp.requirements.length)) spec[id] = { ...(sp.change ? { change: sp.change, archived: sp.archived, capability: sp.capability, design: sp.design } : {}),
        decisions: sp.decisions.map((d) => d.id), requirements: sp.requirements.map((r) => r.scenario || r.id) };
    }
    trace = { counts: tr.counts, items: tr.items, acs, spec };
    const bw = tr.items.filter((i) => i.level !== "info");
    gates.push({ name: "trace", result: tr.counts.block ? "fail" : tr.counts.warn ? "warn" : "pass", detail: bw.slice(0, 3).map((i) => `${i.code} ${i.ref}`).join("; ") });
  } catch (e) { trace = null; gates.push({ name: "trace", result: "skip", detail: String(e.message || e) }); }
  // shared language: intent docstrings of the task's symbols that use a glossary _Avoid_ word (warn, never blocks)
  const glossary = taskGlossary(inputs?.spec, (inputs?.tasks || t.tasks || []).find((x) => x.id === T));
  const eff = effectiveTerms(glossary.living, glossary.delta);
  const terms = { items: avoidedInIntents(index, symIds, eff) };
  gates.push(!avoidList(eff).length ? { name: "terms", result: "skip", detail: "no _Avoid_ words in the glossary" }
    : { name: "terms", result: terms.items.length ? "warn" : "pass", detail: terms.items.slice(0, 3).map((i) => i.message).join("; ") });
  // 0.18 INTENT_HISTORY: history wording in the task's intents and step comments (warn, never blocks)
  const history = { items: config?.intent?.history === "off" ? [] : historyItems(index, symIds) };
  gates.push(config?.intent?.history === "off" ? { name: "history", result: "skip", detail: "intent.history is off" }
    : { name: "history", result: history.items.length ? "warn" : "pass", detail: history.items.slice(0, 3).map((i) => i.message).join("; ") });
  const configured = Object.values(config?.commands?.mutation || {}).some(Boolean);
  const perSymbol = {}; let missing = 0; let low = 0; const thr = config?.mutationThreshold ?? 0.8;
  for (const id of symIds) {
    const m = state.mutation[id];
    if (m && m.bodyHash === index.symbols[id]?.bodyHash) { perSymbol[id] = { score: m.score, survivors: m.survivors }; if (m.score < thr) low++; }
    else if (!index.symbols[id]?.stub) missing++;
  }
  // 0.16: required per task risk (mutationRequiredFor: default "high" = high-risk tasks when a mutation command is set)
  const taskObj = (inputs?.tasks || t.tasks || []).find((x) => x.id === T);
  const risk = taskObj?.risk || t.lock?.tasks?.[T]?.risk || "high";
  const required = mutationRequiredFor(config, risk);
  const req = required ? " (required: high risk)" : "";
  gates.push(!configured && !Object.keys(perSymbol).length ? { name: "mutation", result: "skip", detail: "not configured" }
    : low ? { name: "mutation", result: required ? "fail" : "pass", detail: `${low} symbol(s) below ${thr}${req}` }
    : missing ? { name: "mutation", result: required ? "fail" : "skip", detail: `${missing} symbol(s) not mutated for current body (hitl-index mutate --task ${T})${req}` }
    : { name: "mutation", result: "pass", detail: "" });
  // 0.16 test economy: the task's test budget (active own tests vs new rows + 2), shown in the review report
  let budget = null;
  if (taskObj && index) {
    const syms = taskSymbolIds(index, T, taskObj).filter((id) => CODE_KINDS.has(index.symbols[id]?.kind));
    const lock = t.lock || (await readLock(root));
    const own = taskTestIds(index, T, syms).filter((id) => [null, T].includes(testOwner(index, lock, id)) && index.symbols[id].test?.mode === "active");
    const b = testBudget(index, lock, taskObj, own);
    budget = { newRows: b.newRows, limit: b.limit, tests: b.tests, over: b.over };
  }
  if (trace) trace.budget = budget;
  return { schema: "hitl.l0/1", task: T, gates, tests, drift, trace, terms, history, mutation: { configured, perSymbol } };
}

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const T = positionals[0];
  if (!T) { console.error("usage: hitl-index l0 <T-id> [--json]"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const l0 = await computeL0(ctx.root, ctx.config, T);
  await writeJsonSorted(join(p2paths(ctx.root).reviews, T, "l0.json"), l0);
  if (ctx.json || v.json) console.log(JSON.stringify(l0, null, 2));
  else for (const g of l0.gates) console.log(`${g.result === "pass" ? "✅" : g.result === "skip" ? "_Skip:_" : g.result === "warn" ? "⚠️" : "❌"} ${g.name}: ${g.result}${g.detail ? " — " + g.detail : ""}`);
  return 0;
}
