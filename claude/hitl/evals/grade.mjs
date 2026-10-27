// Deterministic graders for evals/ab.mjs. Each check returns {ok, why}. A run passes when every check passes.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CLI_JS = path.join(path.dirname(fileURLToPath(import.meta.url)), "../scripts/hitl-index.mjs");

export function parseStream(file) {
  const msgs = [];
  for (const l of fs.readFileSync(file, "utf8").split("\n")) { if (!l.trim()) continue; try { msgs.push(JSON.parse(l)); } catch {} }
  const tools = []; let text = ""; let result = null;
  for (const m of msgs) {
    if (m.type === "assistant") {
      const main = !m.parent_tool_use_id;
      for (const c of m.message?.content ?? []) {
        if (c.type === "tool_use") tools.push({ name: c.name, input: c.input ?? {}, main });
        if (c.type === "text" && main) text = c.text; // last main-thread text block = what the user sees last
      }
    }
    if (m.type === "result") result = m;
  }
  return { msgs, tools, text: result?.result ?? text, cost: result?.total_cost_usd ?? 0, turns: result?.num_turns, subtype: result?.subtype };
}

const cli = (proj, ...a) => {
  try { return { code: 0, out: execFileSync(process.execPath, [CLI_JS, ...a], { cwd: proj, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }) }; }
  catch (e) { return { code: e.status ?? 1, out: String(e.stdout ?? "") }; }
};
const json = (s) => { try { return JSON.parse(s); } catch { return null; } };
const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch { return null; } };
const ok = (cond, why = "") => ({ ok: !!cond, why: cond ? "" : why });
const newChanges = (proj) => {
  const d = path.join(proj, ".hitl/changes");
  return fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x !== "feat-password-reset") : [];
};
const walk = (p) => !fs.existsSync(p) ? [] : fs.statSync(p).isDirectory() ? fs.readdirSync(p).flatMap((x) => walk(path.join(p, x))) : [p];
const gitDirty = (proj, pathspec) => {
  try { return execFileSync("git", ["status", "--porcelain", "--", ...pathspec], { cwd: proj, encoding: "utf8" }).trim(); } catch { return "?"; }
};
const skillCalls = (S) => S.tools.filter((t) => t.name === "Skill").map((t) => String(t.input.skill || t.input.command || ""));
const bashCalls = (S) => S.tools.filter((t) => t.name === "Bash").map((t) => String(t.input.command || ""));
// a function signature or code-body line in a design doc (module level only is allowed)
const SIG_RE = /(^|\s)(function\s+\w+\s*\(|(async\s+)?\w+\s*\([^()\n]*:\s*[\w<>\[\]|]+[^()\n]*\)\s*:\s*[\w<>\[\]|]+|def\s+\w+\s*\(|\bclass\s+\w+\s*\{)/m;

function questions(text) {
  const qs = text.match(/\*\*Q\d+\*\*/g) ?? [];
  const recs = text.match(/💡\s*(\*\*)?(Recommended|Đề xuất|Khuyến nghị|My Recommendation)/gi) ?? [];
  return { q: new Set(qs).size, rec: recs.length };
}

const CHECKS = {
  // ---- plan (round 1 of a new change)
  plan_change_created: (S, P) => { const ch = newChanges(P); return ok(ch.length === 1 && fs.existsSync(path.join(P, ".hitl/changes", ch[0], "proposal.md")), `new changes: ${ch.join(",") || "none"}`); },
  plan_delta_written: (S, P) => { const ch = newChanges(P)[0]; return ok(ch && walk(path.join(P, ".hitl/changes", ch, "specs")).some((f) => f.endsWith("spec.md")), "no spec delta"); },
  plan_validate_0_errors: (S, P) => {
    const ch = newChanges(P)[0]; if (!ch) return ok(false, "no change");
    const r = json(cli(P, "spec", "validate", ch, "--json").out);
    const errs = (r?.items ?? []).filter((i) => (i.level ?? i.severity) === "error");
    return ok(r && r.counts?.error === 0, `errors: ${JSON.stringify(errs).slice(0, 300)}`);
  },
  plan_no_code_names: (S, P) => {
    const ch = newChanges(P)[0]; if (!ch) return ok(false, "no change");
    const r = cli(P, "spec", "validate", ch, "--json").out;
    return ok(!/BIZ_CODE_TOKEN/.test(r), "BIZ_CODE_TOKEN in business files");
  },
  plan_coverage_line: (S) => ok(/(Độ phủ|Coverage)\s*:.*(✅|⚠️|❌)/.test(S.text), "no coverage line"),
  plan_coverage_table: (S, P) => { const ch = newChanges(P)[0]; const t = ch && read(path.join(P, ".hitl/changes", ch, "proposal.md")); return ok(t && /## Coverage/.test(t), "no ## Coverage in proposal"); },
  plan_hotspot: (S) => ok(/🔥/.test(S.text), "no 🔥"),
  plan_questions: (S) => { const { q, rec } = questions(S.text); return ok(q >= 2 && q <= 7 && rec >= q, `Q=${q} rec=${rec}`); },
  plan_round_header: (S) => ok(/🌳\s*(Round|Vòng)\s*1/.test(S.text), "no round-1 header"),
  plan_reply_line: (S) => ok(/Reply:|Trả lời:/.test(S.text), "no Reply: line"),
  grilling_loaded: (S) => ok(skillCalls(S).some((s) => /grilling/.test(s)) || S.tools.some((t) => t.name === "Read" && /grilling\/SKILL\.md/.test(t.input.file_path || "")), "grilling not loaded"),
  scout_spawned: (S) => ok(S.tools.some((t) => t.name === "Agent" && /spec-scout/.test(JSON.stringify(t.input))), "no spec-scout"),
  no_main_source_reads: (S) => ok(!S.tools.some((t) => t.main && t.name === "Read" && /\/src\/|\/tests\//.test(t.input.file_path || "")), "main thread read source"),
  // ---- amend (gate only, nothing written)
  amend_gate: (S) => ok(/📐/.test(S.text) && /Apply\?|Áp dụng\?/.test(S.text), "no 📐 delta preview + Apply? gate"),
  amend_no_write: (S, P) => { const d = gitDirty(P, [".hitl/changes", ".hitl/specs"]); return ok(d === "", `files changed before the gate: ${d}`); },
  amend_mentions_rule: (S) => ok(/ACC-BR1/.test(S.text), "ACC-BR1 not named"),
  // ---- design --auto
  design_written: (S, P) => ok(fs.existsSync(path.join(P, ".hitl/changes/feat-password-reset/design.md")), "no design.md"),
  design_validate_0_errors: (S, P) => {
    const r = json(cli(P, "spec", "validate", "feat-password-reset", "--json").out);
    const errs = (r?.items ?? []).filter((i) => (i.level ?? i.severity) === "error");
    return ok(r && r.counts?.error === 0, `errors: ${JSON.stringify(errs).slice(0, 300)}`);
  },
  design_madr: (S, P) => {
    const t = read(path.join(P, ".hitl/changes/feat-password-reset/design.md")) ?? "";
    const rec = /###\s*D-\d+/.test(t) && /Considered options/i.test(t) && /Decision outcome/i.test(t) && /Consequences/i.test(t);
    const rows = (t.match(/^\|\s*D-\d+\s*\|/gm) ?? []).length;
    const warn = cli(P, "spec", "validate", "feat-password-reset", "--json").out;
    return ok(rec && rows >= 2 && !/DESIGN_DEC_INCOMPLETE/.test(warn), `madr=${rec} rows=${rows} incomplete=${/DESIGN_DEC_INCOMPLETE/.test(warn)}`);
  },
  design_serves: (S, P) => {
    const t = read(path.join(P, ".hitl/changes/feat-password-reset/design.md")) ?? "";
    const rows = t.split("\n").filter((l) => /^\|\s*D-\d+\s*\|/.test(l));
    return ok(rows.length && rows.every((l) => /ACC-(R|BR|UC)\d+/.test(l)), "a D row serves nothing");
  },
  design_no_signatures: (S, P) => { const t = read(path.join(P, ".hitl/changes/feat-password-reset/design.md")) ?? ""; const m = t.match(SIG_RE); return ok(!m, `signature-like: ${m?.[0]}`); },
  design_contracts: (S, P) => {
    const t = read(path.join(P, ".hitl/changes/feat-password-reset/design.md")) ?? "";
    const sec = t.split(/^## /m).find((s) => s.startsWith("Contracts")) ?? "";
    return ok(/contracts\/[\w.-]+/.test(sec), "## Contracts lists no contracts/ file");
  },
  design_test_strategy: (S, P) => { const t = read(path.join(P, ".hitl/changes/feat-password-reset/design.md")) ?? ""; return ok(/## Test strategy\s*\n[\s\S]*?ACC-R5/.test(t), "test strategy misses ACC-R5"); },
  design_risk_security: (S, P) => { const t = read(path.join(P, ".hitl/changes/feat-password-reset/design.md")) ?? ""; return ok(/## Risks[\s\S]*security/i.test(t), "no security risk"); },
  design_gate: (S) => ok(/Design complete\?|approved|Y\/n/i.test(S.text), "no close gate"),
  // ---- tasks
  tasks_written: (S, P) => ok(fs.existsSync(path.join(P, ".hitl/changes/feat-password-reset/tasks.md")), "no tasks.md"),
  tasks_check: (S, P) => { const r = cli(P, "tasks", "--check", "--json"); return ok(r.code === 0, `tasks --check exit ${r.code}: ${r.out.slice(0, 300)}`); },
  tasks_trace_no_block: (S, P) => { const r = json(cli(P, "trace", "feat-password-reset", "--json").out); return ok(r && r.counts?.block === 0, `trace: ${JSON.stringify(r?.counts)}`); },
  tasks_ac_scenarios: (S, P) => {
    // every AC carries a spec ref; scenario-level refs are preferred (ratio reported), requirement-level is allowed (AC_REQ_LEVEL info)
    const t = read(path.join(P, ".hitl/changes/feat-password-reset/tasks.md")) ?? "";
    const acs = t.split("\n").filter((l) => /^- \[[ x]\] T-\d+\.AC\d+/.test(l));
    const withRef = acs.filter((l) => /\(ACC-(R|BR|UC)\d+/.test(l));
    const withScn = acs.filter((l) => /\(ACC-R\d+\.S\d+/.test(l));
    return { ok: acs.length >= 3 && withRef.length === acs.length && withScn.length >= 1, why: `ACs ${acs.length}, ref ${withRef.length}, scenario-level ${withScn.length}`, ratio: acs.length ? +(withScn.length / acs.length).toFixed(2) : 0 };
  },
  tasks_all_scenarios: (S, P) => { const r = json(cli(P, "trace", "feat-password-reset", "--json").out); const n = (r?.items ?? []).filter((i) => i.code === "SCN_NO_AC").length; return ok(r && n === 0, `SCN_NO_AC: ${n}`); },
  tasks_why_decisions: (S, P) => { const t = read(path.join(P, ".hitl/changes/feat-password-reset/tasks.md")) ?? ""; return ok(/\*\*Why\*\*.*\(D-\d+/.test(t), "Why does not cite D-n"); },
  tasks_quiz_gate: (S) => ok(/\| *T-\d+/.test(S.text) && /Granularity|Y\b/.test(S.text), "no quiz gate table"),
  tasks_not_approved: (S, P) => { const t = read(path.join(P, ".hitl/changes/feat-password-reset/tasks.md")) ?? ""; return ok(!/> status: approved/.test(t), "self-approved tasks"); },
  // ---- review
  review_l0: (S, P) => ok(fs.existsSync(path.join(P, ".hitl/reviews/T-1/l0.json")), "no l0.json"),
  review_report: (S, P) => ok(fs.existsSync(path.join(P, ".hitl/reviews/T-1.review.md")), "no T-1.review.md"),
  review_no_self_approve: (S) => { const b = bashCalls(S).find((c) => /approve\b.*--by\s+human/.test(c)); return ok(!b, `ran: ${b}`); },
  review_verdict: (S) => ok(/PASS|FAIL|NEEDS|verdict|Verdict|human/i.test(S.text), "no verdict"),
  review_lens_agents: (S) => ok(S.tools.some((t) => t.name === "Agent" && /reviewer/.test(JSON.stringify(t.input))), "no reviewer subagent"),
  // ---- flow / tickets
  flow_next_design: (S) => ok(/\/hitl:design\s+feat-password-reset/.test(S.text), "next is not /hitl:design feat-password-reset"),
  flow_help_table: (S) => ok(/\/hitl:archive/.test(S.text) && /\/hitl:skeleton/.test(S.text) && /fast/i.test(S.text) && /\|/.test(S.text), "help block incomplete"),
  flow_next_plan: (S) => ok(/\/hitl:plan/.test(S.text), "next is not /hitl:plan"),
  flow_no_edits: (S, P) => ok(gitDirty(P, ["src", "tests", ".hitl/changes"]) === "", "flow edited files"),
  tickets_off: (S) => ok(/off|tắt|init/i.test(S.text), "no 'Linear off / init' message"),
  tickets_no_linear_calls: (S) => ok(!S.tools.some((t) => /linear/i.test(t.name) && t.name.startsWith("mcp__")), "called a Linear MCP tool"),
  tickets_no_inbox_write: (S, P) => ok(!fs.existsSync(path.join(P, ".hitl/.inbox/tickets-push.json")), "wrote a push result"),
};

/** Sum of plugin files loaded into the MAIN conversation: invoked skill bodies + Read of plugin files. */
function pluginChars(S, pluginDir, c) {
  const seen = new Set(); let n = 0;
  const add = (f) => { if (seen.has(f)) return; seen.add(f); try { n += fs.readFileSync(f, "utf8").length; } catch {} };
  const cmd = /^\/hitl:([\w-]+)/.exec(c.prompt ?? ""); if (cmd) add(path.join(pluginDir, "skills", cmd[1], "SKILL.md"));
  for (const t of S.tools) {
    if (!t.main) continue;
    if (t.name === "Skill") { const m = /hitl:([\w-]+)/.exec(String(t.input.skill || "")); if (m) add(path.join(pluginDir, "skills", m[1], "SKILL.md")); }
    if (t.name === "Read" && String(t.input.file_path || "").startsWith(pluginDir)) add(t.input.file_path);
  }
  return { n, files: [...seen].map((f) => path.relative(pluginDir, f)) };
}

export function gradeRun({ suite, c, dir, proj, pluginDir, exit }) {
  const S = parseStream(path.join(dir, "out.jsonl"));
  const pc = pluginChars(S, pluginDir, c);
  const base = { exit, cost: S.cost, turns: S.turns, subtype: S.subtype, pluginChars: pc.n, pluginFiles: pc.files };
  if (suite === "trigger") {
    const first = skillCalls(S)[0] ?? null;
    const got = first ? (first.includes(":") ? first : `hitl:${first}`) : null;
    const want = c.expect ?? null;
    const one = (w) => w === "nohitl" ? !(got ?? "").startsWith("hitl:") : got === w;
    const okk = Array.isArray(want) ? want.some(one) : one(want);
    return { ...base, got, want, pass: okk, checks: { trigger: ok(okk, `got ${got}, want ${JSON.stringify(want)}`) } };
  }
  const checks = {};
  for (const name of c.checks) {
    try { checks[name] = CHECKS[name] ? CHECKS[name](S, proj, c) : ok(false, "unknown check"); }
    catch (e) { checks[name] = ok(false, `threw: ${e.message}`); }
  }
  return { ...base, pass: Object.values(checks).every((x) => x.ok), checks, lastText: S.text.slice(0, 6000) };
}
