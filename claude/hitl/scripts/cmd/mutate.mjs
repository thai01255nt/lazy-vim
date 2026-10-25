// P2 — `hitl-index mutate [--task T] [--all] [--json]`: mutation testing on changed functions, via the project's own tool.
// Stryker (TS/JS): reads reports/mutation/mutation.json (mutation-testing-report-schema) and maps mutants by line to symbol spans.
// mutmut 3 (Python): parses `mutmut results --all true` lines `<module>.x_<func>__mutmut_<n>: <status>` (methods: `xǁClassǁmethod`).
// Not configured → exit 0 with {configured:false} and a hint (never installs anything).
import { parseArgs } from "node:util";
import { promises as fsp } from "node:fs";
import { join, resolve } from "node:path";
import { loadApi, taskSymbolIds, CODE_KINDS } from "../lib/lock.mjs";
import { readState, recordMutation } from "../lib/state.mjs";
import { buildCommand, runShell, langOfFile } from "../lib/runner.mjs";

const OPTS = { task: { type: "string" }, all: { type: "boolean" }, json: { type: "boolean" }, root: { type: "string" }, quiet: { type: "boolean" }, soft: { type: "boolean" } };

const KILLED = new Set(["Killed", "Timeout", "killed", "timeout"]);
const COUNTED = new Set(["Killed", "Timeout", "Survived", "NoCoverage", "killed", "timeout", "survived", "no tests"]);
const SURV = new Set(["Survived", "NoCoverage", "survived", "no tests"]);

function innermost(index, file, line, ids) {
  let best = null;
  for (const id of ids) {
    const S = index.symbols[id];
    if (S.file !== file || !S.span || line < S.span.start || line > S.span.end) continue;
    if (!best || S.span.end - S.span.start < index.symbols[best].span.end - index.symbols[best].span.start) best = id;
  }
  return best;
}
function tally(per, id, status) {
  const c = per[id] || (per[id] = { killed: 0, survivors: 0, total: 0 });
  if (!COUNTED.has(status)) return;
  c.total++; if (KILLED.has(status)) c.killed++; if (SURV.has(status)) c.survivors++;
}
const finish = (per) => { for (const c of Object.values(per)) c.score = c.total ? Math.round((c.killed / c.total) * 1000) / 1000 : 0; return per; };

/** Stryker mutation.json → {perSymbol:{id:{score,survivors,killed,total}}, unmapped} */
export function parseStryker(report, index, ids, root = "") {
  const per = {}; let unmapped = 0;
  for (const [f, data] of Object.entries(report?.files || {})) {
    let rel = f.replace(/\\/g, "/"); if (root && rel.startsWith(root + "/")) rel = rel.slice(root.length + 1); rel = rel.replace(/^\.\//, "");
    for (const m of data.mutants || []) {
      const id = innermost(index, rel, m.location?.start?.line ?? -1, ids);
      if (!id) { unmapped++; continue; }
      tally(per, id, m.status);
    }
  }
  return { perSymbol: finish(per), unmapped };
}

/** mutmut 3 `results` text → {perSymbol, unmapped} */
export function parseMutmut(text, index, ids) {
  const per = {}; let unmapped = 0;
  const re = /^\s*([\w.]+?)\.(x_(\w+?)|xǁ(\w+)ǁ(\w+?))__mutmut_\d+\s*:\s*([\w ]+?)\s*$/;
  for (const line of String(text).split(/\r?\n/)) {
    const m = re.exec(line); if (!m) continue;
    const mod = m[1]; const name = m[3] ? m[3] : `${m[4]}.${m[5]}`; const status = m[6].trim();
    const path = mod.replace(/\./g, "/") + ".py";
    const id = ids.find((i) => { const S = index.symbols[i]; return S.name === name && (S.file === path || S.file.endsWith("/" + path)); })
      || ids.find((i) => { const S = index.symbols[i]; return S.name === name && S.file.endsWith(".py"); });
    if (!id) { unmapped++; continue; }
    tally(per, id, status);
  }
  return { perSymbol: finish(per), unmapped };
}

async function detectTools(root) {
  const out = {};
  try {
    const pkg = JSON.parse(await fsp.readFile(join(root, "package.json"), "utf8"));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    out.ts = deps["@stryker-mutator/core"] ? "stryker" : null;
  } catch { out.ts = null; }
  const r = await runShell('python3 -c "import mutmut"', { cwd: root, timeoutMs: 10000 });
  out.py = r.code === 0 ? "mutmut" : null;
  return out;
}

const HINT = {
  ts: `hitl-index init --set commands.mutation.ts="npx stryker run --mutate {mutate} --reporters json,clear-text"  (needs @stryker-mutator/core in devDependencies)`,
  py: `hitl-index init --set commands.mutation.py="mutmut run"  (needs mutmut>=3 in the project env; results read via "mutmut results --all true")`,
};

export async function run(argv, ctx) {
  const { values: v } = parseArgs({ args: argv, options: OPTS, allowPositionals: true, strict: false });
  const json = ctx.json || v.json;
  const say = (o, text) => { if (json) console.log(JSON.stringify(o, null, 2)); else console.log(text); };
  if (!ctx.root) { console.error("not initialized: run /hitl:setup"); return 3; }
  const api = await loadApi(); if (!api) { console.error("hitl-index core not available"); return 1; }
  try { await api.updateIndex(ctx.root, null, { changedOnly: true }); } catch { /* best effort */ }
  const index = await api.readIndex(ctx.root);
  if (!index) { console.error("index missing: run hitl-index index --all"); return 1; }
  const tasks = (await api.readTasks(ctx.root).catch(() => [])) || [];
  const state = await readState(ctx.root);
  let ids = v.task ? taskSymbolIds(index, v.task, tasks.find((t) => t.id === v.task), api)
    : Object.keys(index.symbols).filter((id) => (index.symbols[id].tags?.task || []).length);
  ids = ids.filter((id) => CODE_KINDS.has(index.symbols[id]?.kind) && !index.symbols[id].stub);
  const changed = v.all ? ids : ids.filter((id) => state.mutation[id]?.bodyHash !== index.symbols[id].bodyHash);
  const byLang = {};
  for (const id of changed) { const l = langOfFile(index.symbols[id].file, ctx.config, api); (byLang[l] || (byLang[l] = [])).push(id); }
  const cmds = ctx.config?.commands?.mutation || {};
  const langs = Object.keys(byLang);
  const configuredLangs = langs.filter((l) => cmds[l]);
  if (!changed.length) { say({ configured: Object.values(cmds).some(Boolean), perSymbol: {}, message: "no changed implemented functions to mutate" }, "✅ no changed implemented functions to mutate"); return 0; }
  if (!configuredLangs.length) {
    const detected = await detectTools(ctx.root);
    const hints = (langs.length ? langs : ["ts", "py"]).filter((l) => HINT[l]).map((l) => `${detected[l] ? `(${detected[l]} detected) ` : ""}${HINT[l]}`);
    say({ configured: false, detected, hint: hints }, `💡 Mutation testing not configured. To enable:\n${hints.map((h) => "  " + h).join("\n")}`);
    return 0;
  }
  const result = { configured: true, perSymbol: {}, unmapped: 0, errors: [], skippedLangs: langs.filter((l) => !cmds[l]) };
  for (const lang of configuredLangs) {
    const lids = byLang[lang];
    const files = [...new Set(lids.map((id) => index.symbols[id].file))].sort();
    const mutate = lids.map((id) => { const S = index.symbols[id]; return S.span ? `${S.file}:${S.span.start}-${S.span.end}` : S.file; }).join(",");
    const cmd = buildCommand(cmds[lang], { files, mutate, root: ctx.root });
    const r = await runShell(cmd, { cwd: ctx.root, timeoutMs: ctx.config?.commands?.mutationTimeoutMs || 1800000 });
    let parsed = null;
    if (/stryker/.test(cmds[lang]) || lang === "ts") {
      const rp = resolve(ctx.root, ctx.config?.commands?.mutationReport?.[lang] || "reports/mutation/mutation.json");
      try { parsed = parseStryker(JSON.parse(await fsp.readFile(rp, "utf8")), index, lids, ctx.root); }
      catch (e) { result.errors.push(`${lang}: no Stryker JSON report at ${rp} (exit ${r.code}); add the "json" reporter. ${(r.stderr || "").trim().split("\n").slice(-5).join(" ")}`); }
    } else {
      const rc = ctx.config?.commands?.mutationResults?.[lang] || "mutmut results --all true";
      const rr = await runShell(rc, { cwd: ctx.root, timeoutMs: 120000 });
      if (rr.code !== 0) result.errors.push(`${lang}: "${rc}" failed (exit ${rr.code}): ${(rr.stderr || "").trim().split("\n").slice(-3).join(" ")}`);
      else parsed = parseMutmut(rr.stdout, index, lids);
    }
    if (!parsed) continue;
    result.unmapped += parsed.unmapped;
    for (const [id, c] of Object.entries(parsed.perSymbol)) {
      await recordMutation(ctx.root, id, { score: c.score, survivors: c.survivors, bodyHash: index.symbols[id].bodyHash, details: { killed: c.killed, total: c.total } });
      result.perSymbol[id] = { score: c.score, survivors: c.survivors, total: c.total };
    }
  }
  if (json) console.log(JSON.stringify(result, null, 2));
  else {
    for (const [id, c] of Object.entries(result.perSymbol)) console.log(`${c.survivors ? "⚠️" : "✅"} ${index.symbols[id].name}: ${Math.round(c.score * 100)}% (${c.survivors} survivors / ${c.total})`);
    for (const e of result.errors) console.log(`❌ ${e}`);
    if (result.skippedLangs.length) console.log(`💡 not configured for: ${result.skippedLangs.join(", ")}`);
  }
  return result.errors.length && !Object.keys(result.perSymbol).length ? 1 : 0;
}
