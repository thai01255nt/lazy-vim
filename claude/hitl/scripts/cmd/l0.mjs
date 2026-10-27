// P2 — `hitl-index l0 <T> [--json]`: deterministic gates → reviews/<T>/l0.json (§E.8)
import { parseArgs } from "node:util";
import { join } from "node:path";
import { loadApi, p2paths, writeJsonSorted, CODE_KINDS } from "../lib/lock.mjs";
import { executeTest, runShell, buildCommand } from "../lib/runner.mjs";
import { readState } from "../lib/state.mjs";
import { buildTrace, loadTraceInputs, specLinksFor } from "../lib/trace.mjs";

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
  let trace = null;
  try {
    const inputs = await loadTraceInputs(root, config, { index: index || undefined, state, statuses: t.statuses, tasks: t.tasks });
    const tr = buildTrace(inputs, { kind: "task", id: T });
    const acs = tr.rows.flatMap((r) => r.acs).filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i)
      .map((a) => ({ id: a.id, reqs: a.reqs, proven: a.proven, tests: a.tests.length }));
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
  const configured = Object.values(config?.commands?.mutation || {}).some(Boolean);
  const perSymbol = {}; let missing = 0; let low = 0; const thr = config?.mutationThreshold ?? 0.8;
  for (const id of symIds) {
    const m = state.mutation[id];
    if (m && m.bodyHash === index.symbols[id]?.bodyHash) { perSymbol[id] = { score: m.score, survivors: m.survivors }; if (m.score < thr) low++; }
    else if (!index.symbols[id]?.stub) missing++;
  }
  gates.push(!configured && !Object.keys(perSymbol).length ? { name: "mutation", result: "skip", detail: "not configured" }
    : low ? { name: "mutation", result: config?.mutationRequired ? "fail" : "pass", detail: `${low} symbol(s) below ${thr}` }
    : missing ? { name: "mutation", result: config?.mutationRequired ? "fail" : "skip", detail: `${missing} symbol(s) not mutated for current body (hitl-index mutate --task ${T})` }
    : { name: "mutation", result: "pass", detail: "" });
  return { schema: "hitl.l0/1", task: T, gates, tests, drift, trace, mutation: { configured, perSymbol } };
}

export async function run(argv, ctx) {
  const { values: v, positionals } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const T = positionals[0];
  if (!T) { console.error("usage: hitl-index l0 <T-id> [--json]"); return 2; }
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const l0 = await computeL0(ctx.root, ctx.config, T);
  await writeJsonSorted(join(p2paths(ctx.root).reviews, T, "l0.json"), l0);
  if (ctx.json || v.json) console.log(JSON.stringify(l0, null, 2));
  else for (const g of l0.gates) console.log(`${g.result === "pass" ? "✅" : g.result === "skip" ? "⏭️" : g.result === "warn" ? "⚠️" : "❌"} ${g.name}: ${g.result}${g.detail ? " — " + g.detail : ""}`);
  return 0;
}
