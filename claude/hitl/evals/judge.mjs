#!/usr/bin/env node
// Suite C: blind pairwise LLM judge of plan / design outputs (variant A vs B), both presentation orders.
//   node evals/judge.mjs <out> BASE NEW [--cases plan-vi,plan-en,design-auto] [--model opus]
// Reads <out>/behaviour/<variant>/<case>/<run>/ (grade.json lastText + written files), pairs run i of A with run i of B,
// asks the judge twice (A first, then B first) and writes <out>/judge/<case>-<run>-<order>.json + <out>/judge/summary.json.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [out, A, B, ...rest] = process.argv.slice(2);
let cases = ["plan-vi", "plan-en", "design-auto"], model = "opus";
for (let i = 0; i < rest.length; i++) {
  if (rest[i] === "--cases") cases = rest[++i].split(",");
  else if (rest[i] === "--model") model = rest[++i];
}
const jdir = path.join(out, "judge"); fs.mkdirSync(jdir, { recursive: true });
const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return ""; } };
const walk = (p) => !fs.existsSync(p) ? [] : fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((x) => walk(path.join(p, x))) : [p];

function artefact(runDir, c) {
  const g = JSON.parse(read(path.join(runDir, "grade.json")) || "{}");
  const proj = path.join(runDir, "proj");
  let files = [];
  if (c.startsWith("plan")) {
    const chDir = path.join(proj, ".hitl/changes");
    const ids = fs.existsSync(chDir) ? fs.readdirSync(chDir).filter((x) => x !== "feat-password-reset") : [];
    files = ids.flatMap((id) => walk(path.join(chDir, id)).filter((f) => f.endsWith(".md")));
  } else {
    const d = path.join(proj, ".hitl/changes/feat-password-reset");
    files = [path.join(d, "design.md"), path.join(d, "data-model.md"), ...walk(path.join(d, "contracts"))].filter((f) => fs.existsSync(f));
  }
  const body = files.map((f) => `--- file: ${path.relative(proj, f)}\n${read(f)}`).join("\n\n");
  return `### What the user saw (final message)\n${g.lastText ?? ""}\n\n### Files written\n${body}`.slice(0, 60000);
}

const RUBRIC = {
  plan: `This is round 1 of a requirements interview (/hitl:plan): the assistant drafted a business-readable change
(proposal + spec delta) and asked the first round of numbered questions with recommended answers.
Criteria:
1. question_sharpness — are the questions specific, decision-oriented, non-redundant, each with a sensible recommendation; do they ask what matters most first?
2. hotspot_depth — does it find and drill into the risky/uncertain parts (security, data, conflicts with existing behaviour), marked 🔥?
3. spec_completeness — does the draft capture everything the user said, as testable requirements with scenarios, without inventing unrequested behaviour?
4. format_correctness — business-readable (no code names), EARS-style SHALL statements, GIVEN/WHEN/THEN scenarios, coverage line/table, round format.`,
  design: `This is a technical design written in --auto mode (/hitl:design): decisions D-n with alternatives, components,
data model, contracts, test strategy, risks — module level, no function signatures.
Criteria:
1. question_sharpness — are the decisions the right ones, with real alternatives and reasons tied to requirements?
2. hotspot_depth — depth on the risky parts (security of reset links, token storage, enumeration, expiry, concurrency).
3. spec_completeness — does the design cover every requirement/rule of the spec (ACC-R5, ACC-R6, ACC-R1 change, ACC-BR1, ACC-UC1, removal of ACC-R2)?
4. format_correctness — MADR records, D table with serves, contracts in a standard format, no function signatures.`,
};

function judge(c, first, second) {
  const kind = c.startsWith("plan") ? "plan" : "design";
  const prompt = `You are a strict senior reviewer comparing two outputs of the same AI workflow step on the same input.
${RUBRIC[kind]}
Judge only quality; ignore length unless it hurts clarity. Do not favour an output for its position.

<output id="X">
${first}
</output>

<output id="Y">
${second}
</output>

Reply with ONLY a JSON object:
{"question_sharpness":"X|Y|tie","hotspot_depth":"X|Y|tie","spec_completeness":"X|Y|tie","format_correctness":"X|Y|tie","overall":"X|Y|tie","rationale":"<= 120 words"}`;
  const r = spawnSync("claude", ["-p", "--model", model, "--tools", "", "--max-turns", "1", "--output-format", "json",
    "--setting-sources", "user", "--settings", JSON.stringify({ enabledPlugins: { "hitl@thai-hitl": false } }), "--strict-mcp-config"],
  { input: prompt, encoding: "utf8", maxBuffer: 1 << 26, cwd: jdir });
  let res = null; try { res = JSON.parse(r.stdout); } catch {}
  const text = res?.result ?? r.stdout;
  const m = /\{[\s\S]*\}/.exec(text ?? "");
  let v = null; try { v = JSON.parse(m[0]); } catch {}
  return { verdict: v, cost: res?.total_cost_usd ?? 0, raw: v ? undefined : String(text).slice(0, 500) };
}

const tally = {}; let cost = 0;
for (const c of cases) {
  const runs = (d) => fs.existsSync(d) ? fs.readdirSync(d).filter((r) => fs.existsSync(path.join(d, r, "grade.json"))).sort() : [];
  const ra = runs(path.join(out, "behaviour", A, c)), rb = runs(path.join(out, "behaviour", B, c));
  for (let i = 0; i < Math.min(ra.length, rb.length); i++) {
    const a = artefact(path.join(out, "behaviour", A, c, ra[i]), c), b = artefact(path.join(out, "behaviour", B, c, rb[i]), c);
    for (const order of ["AB", "BA"]) {
      const f = path.join(jdir, `${c}-${i + 1}-${order}.json`);
      let j = fs.existsSync(f) ? JSON.parse(read(f)) : null;
      if (!j) {
        const r = order === "AB" ? judge(c, a, b) : judge(c, b, a);
        const map = (x) => x === "tie" ? "tie" : (order === "AB" ? (x === "X" ? A : B) : (x === "X" ? B : A));
        j = { case: c, pair: i + 1, order, cost: r.cost, raw: r.raw, verdict: r.verdict && Object.fromEntries(Object.entries(r.verdict).map(([k, v]) => [k, k === "rationale" ? v : map(v)])) };
        fs.writeFileSync(f, JSON.stringify(j, null, 1));
      }
      cost += j.cost || 0;
      if (!j.verdict) continue;
      for (const [k, v] of Object.entries(j.verdict)) {
        if (k === "rationale") continue;
        const t = (tally[k] ??= { [A]: 0, [B]: 0, tie: 0 }); t[v] = (t[v] ?? 0) + 1;
      }
      console.log(`${c} #${i + 1} ${order}: overall ${j.verdict.overall} — ${String(j.verdict.rationale).slice(0, 160)}`);
    }
  }
}
fs.writeFileSync(path.join(jdir, "summary.json"), JSON.stringify({ tally, cost: +cost.toFixed(3) }, null, 1));
console.log(JSON.stringify(tally, null, 1), `judge cost $${cost.toFixed(3)}`);
