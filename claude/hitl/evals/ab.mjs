#!/usr/bin/env node
// A/B eval runner for the hitl plugin: runs the same cases against several plugin directories with `claude -p`
// and grades every run deterministically. See evals/README.md.
//
//   node evals/ab.mjs <suite> --variant BASE=/path/a --variant NEW=/path/b --out <dir> [--runs n] [-j n]
//                     [--case <substring>] [--max-cost <usd>] [--plugin-key hitl@thai-hitl]
//   suite: trigger | behaviour
// Results: <out>/<suite>/<variant>/<case>/<run>/{out.jsonl,grade.json} and <out>/<suite>/summary.json.
// Re-running skips runs that already have grade.json (resume after a crash or a cost stop).
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gradeRun } from "./grade.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const suite = args[0];
const opt = { variants: [], runs: null, j: 2, out: null, case: null, maxCost: 40, pluginKey: "hitl@thai-hitl" };
for (let i = 1; i < args.length; i++) {
  const a = args[i];
  if (a === "--variant") { const [n, d] = args[++i].split("="); opt.variants.push({ name: n, dir: path.resolve(d) }); }
  else if (a === "--runs") opt.runs = Number(args[++i]);
  else if (a === "-j") opt.j = Number(args[++i]);
  else if (a === "--out") opt.out = path.resolve(args[++i]);
  else if (a === "--case") opt.case = args[++i];
  else if (a === "--max-cost") opt.maxCost = Number(args[++i]);
  else if (a === "--plugin-key") opt.pluginKey = args[++i];
  else { console.error(`unknown option ${a}`); process.exit(2); }
}
if (!["trigger", "behaviour"].includes(suite) || !opt.variants.length || !opt.out) {
  console.error("usage: ab.mjs trigger|behaviour --variant NAME=DIR [...] --out DIR [--runs n] [-j n] [--case s] [--max-cost usd]");
  process.exit(2);
}

const cases = JSON.parse(fs.readFileSync(path.join(HERE, suite === "trigger" ? "trigger.json" : "scenarios.json"), "utf8"))
  .cases.filter((c) => !opt.case || c.id.includes(opt.case));
const root = path.join(opt.out, suite);
fs.mkdirSync(root, { recursive: true });
const costFile = path.join(opt.out, "cost.json");
const spent = () => { try { return JSON.parse(fs.readFileSync(costFile, "utf8")).total; } catch { return 0; } };
function addCost(usd, label) {
  let c = { total: 0, runs: [] };
  try { c = JSON.parse(fs.readFileSync(costFile, "utf8")); } catch {}
  c.total = +(c.total + usd).toFixed(4); c.runs.push({ label, usd });
  fs.writeFileSync(costFile, JSON.stringify(c, null, 1));
}

// Settings for every child: the installed copy of the plugin is disabled so only --plugin-dir is loaded.
const SETTINGS = JSON.stringify({ enabledPlugins: { [opt.pluginKey]: false } });

function jobsFor() {
  const jobs = [];
  for (const c of cases) for (const v of opt.variants) {
    const n = opt.runs ?? c.runs ?? (suite === "trigger" ? 1 : 2);
    for (let r = 1; r <= n; r++) jobs.push({ c, v, r, dir: path.join(root, v.name, c.id, String(r)) });
  }
  // interleave variants so a cost stop leaves comparable partial results
  return jobs.sort((a, b) => a.r - b.r || cases.indexOf(a.c) - cases.indexOf(b.c));
}

function runClaude(job) {
  const { c, v, dir } = job;
  const proj = path.join(dir, "proj");
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  // fixture built with the plugin's own CLI (identical for both variants)
  execFileSync("bash", [path.join(HERE, "fixtures/build.sh"), c.fixture || "plan", proj], { stdio: "ignore" });
  const cli = ["-p", c.prompt, "--plugin-dir", v.dir, "--settings", SETTINGS, "--output-format", "stream-json", "--verbose",
    "--max-turns", String(c.maxTurns ?? (suite === "trigger" ? 2 : 40))];
  if (suite === "trigger") cli.push("--allowedTools", "Skill");
  else cli.push("--permission-mode", "acceptEdits", "--allowedTools", ...(c.allowedTools ?? [
    "Skill", "Read", "Glob", "Grep", "Write", "Edit", "Agent", "Bash(hitl-index *)", "Bash(node *)", "Bash(git *)",
    "Bash(mkdir *)", "Bash(ls *)", "Bash(cat *)"]));
  return new Promise((resolve) => {
    const out = fs.openSync(path.join(dir, "out.jsonl"), "w");
    const err = fs.openSync(path.join(dir, "err.txt"), "w");
    const p = spawn("claude", cli, { cwd: proj, stdio: ["ignore", out, err], env: { ...process.env, HITL_EVAL: "1" } });
    const t = setTimeout(() => p.kill("SIGTERM"), (c.timeoutSeconds ?? 900) * 1000);
    p.on("close", (code) => { clearTimeout(t); resolve(code); });
  });
}

async function runJob(job) {
  const gradeFile = path.join(job.dir, "grade.json");
  if (fs.existsSync(gradeFile)) return JSON.parse(fs.readFileSync(gradeFile, "utf8"));
  if (spent() >= opt.maxCost) { console.log(`⛔ cost cap ${opt.maxCost} reached; skipping ${job.v.name}/${job.c.id}/${job.r}`); return null; }
  const code = await runClaude(job);
  const g = gradeRun({ suite, c: job.c, dir: job.dir, proj: path.join(job.dir, "proj"), pluginDir: job.v.dir, exit: code });
  g.variant = job.v.name; g.case = job.c.id; g.run = job.r;
  fs.writeFileSync(gradeFile, JSON.stringify(g, null, 1));
  addCost(g.cost || 0, `${suite}/${job.v.name}/${job.c.id}/${job.r}`);
  const fails = Object.entries(g.checks).filter(([, x]) => !x.ok).map(([k]) => k);
  console.log(`${g.pass ? "✅" : "❌"} ${suite} ${job.v.name} ${job.c.id} #${job.r} $${(g.cost || 0).toFixed(3)} ${fails.length ? "fail: " + fails.join(",") : ""}`);
  return g;
}

const jobs = jobsFor();
const results = [];
let next = 0;
await Promise.all(Array.from({ length: Math.max(1, opt.j) }, async () => {
  while (next < jobs.length) { const j = jobs[next++]; const g = await runJob(j); if (g) results.push(g); }
}));

// summary over everything on disk (not only this invocation)
const all = [];
for (const v of opt.variants) for (const c of cases) {
  const cd = path.join(root, v.name, c.id);
  if (!fs.existsSync(cd)) continue;
  for (const r of fs.readdirSync(cd)) { const f = path.join(cd, r, "grade.json"); if (fs.existsSync(f)) all.push(JSON.parse(fs.readFileSync(f, "utf8"))); }
}
const summary = {};
for (const g of all) {
  const s = (summary[g.variant] ??= { runs: 0, pass: 0, cost: 0, checks: {}, cases: {}, pluginChars: 0 });
  s.runs++; s.pass += g.pass ? 1 : 0; s.cost += g.cost || 0; s.pluginChars += g.pluginChars || 0;
  const cs = (s.cases[g.case] ??= { runs: 0, pass: 0, got: [] });
  cs.runs++; cs.pass += g.pass ? 1 : 0; if (g.got !== undefined) cs.got.push(g.got);
  for (const [k, x] of Object.entries(g.checks)) { const t = (s.checks[`${g.case}.${k}`] ??= { ok: 0, n: 0 }); t.n++; t.ok += x.ok ? 1 : 0; }
}
for (const s of Object.values(summary)) { s.cost = +s.cost.toFixed(3); s.avgPluginTok = Math.round(s.pluginChars / s.runs / 3.6); }
fs.writeFileSync(path.join(root, "summary.json"), JSON.stringify(summary, null, 1));
for (const [v, s] of Object.entries(summary)) console.log(`${v}: ${s.pass}/${s.runs} runs pass · $${s.cost} · avg plugin-file reads ≈ ${s.avgPluginTok} tok`);
console.log(`total spent (all suites in ${opt.out}): $${spent().toFixed(2)}`);
