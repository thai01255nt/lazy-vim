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

// ---- Lua skeleton helpers (case.luaTargets: [{file, name, kind: "new"|"modify"|"existing", keep?: [lines]}])
const LUALS = process.env.LUALS ?? path.join(process.env.HOME ?? "", ".local/share/nvim/mason/bin/lua-language-server");
const reEsc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** {line, doc: [comment lines directly above], body: [lines up to the closing top-level `end`]} or null */
function luaFn(src, name) {
  const L = src.split("\n");
  const re = new RegExp(`^(local\\s+)?(function\\s+${reEsc(name)}\\s*\\(|${reEsc(name)}\\s*=\\s*function\\s*\\()`);
  const i = L.findIndex((l) => re.test(l));
  if (i < 0) return null;
  const doc = []; for (let k = i - 1; k >= 0 && /^\s*--/.test(L[k]); k--) doc.unshift(L[k]);
  let e = i + 1; while (e < L.length && !/^end\b/.test(L[e])) e++;
  return { line: i, doc, body: L.slice(i + 1, e) };
}
const luaTargets = (P, c, kinds = ["new", "modify"]) => (c.luaTargets ?? []).filter((t) => kinds.includes(t.kind))
  .map((t) => ({ ...t, src: read(path.join(P, t.file)) ?? "" }));
const norm = (x) => x.replace(/\s+/g, " ").trim();
/** LuaLS probe (all luaTargets): does a caller still see the declared @return type? A docstring broken by text between
 *  `---@field` and `---@param` makes LuaLS drop the signature silently; `--check` alone reports nothing. */
function luaSignatures(P, c) {
  const res = {};
  const byFile = {};
  for (const t of c.luaTargets ?? []) (byFile[t.file] ??= []).push(t);
  for (const [file, ts] of Object.entries(byFile)) {
    const src = read(path.join(P, file)); if (src == null) { for (const t of ts) res[t.name] = "file missing"; continue; }
    const L = src.split("\n");
    let at = -1; for (let k = L.length - 1; k >= 0; k--) if (/^return\b/.test(L[k])) { at = k; break; }
    if (at < 0) at = L.length;
    const probe = ["---@class __HitlProbe", "---@field __hitlProbe true"]; const lineOf = {};
    for (const t of ts) { probe.push("---@type __HitlProbe"); lineOf[t.name] = at + probe.length + 1; probe.push(`local __probe_${t.name.replace(/\W/g, "_")} = ${t.name}()`); }
    L.splice(at, 0, ...probe);
    const d = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "hitl-luals-"));
    const f = path.join(d, path.basename(file)); fs.writeFileSync(f, L.join("\n"));
    const outJson = path.join(d, "check.json");
    try { execFileSync(LUALS, [`--check=${d}`, "--checklevel=Warning", `--check_out_path=${outJson}`], { stdio: "ignore", timeout: 120000 }); } catch {}
    const diags = Object.values(json(read(outJson) ?? "{}") ?? {}).flat();
    for (const t of ts) {
      const fn = luaFn(src, t.name);
      const ret = fn?.doc.map((l) => /^\s*---@return\s+([\w.]+)/.exec(l)?.[1]).find(Boolean);
      const hit = diags.find((x) => x.code === "assign-type-mismatch" && x.range.start.line + 1 === lineOf[t.name]);
      if (!fn) res[t.name] = "function not found";
      else if (!ret) res[t.name] = "no ---@return";
      else if (!hit) res[t.name] = `signature lost (callers see no @return ${ret})`;
      else if (!hit.message.includes(ret)) res[t.name] = `caller sees ${hit.message.split("\n")[0]}, declared ${ret}`;
    }
    fs.rmSync(d, { recursive: true, force: true });
  }
  return res;
}
const STEP_RE = /^\s*--\s*TODO\(impl(?: T-\d+)?\):\s*(\d+)\.\s*(.*)$/;

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
  // ---- skeleton (Lua): case.luaTargets, task T-1
  lua_signatures_bound: (S, P, c) => { const bad = Object.entries(luaSignatures(P, c)); return ok(!bad.length, bad.map(([k, v]) => `${k}: ${v}`).join("; ")); },
  lua_sentinel: (S, P, c) => {
    const bad = luaTargets(P, c, ["new"]).filter((t) => {
      const fn = luaFn(t.src, t.name); const ref = `${t.file}#${t.name}`;
      return !fn || !fn.body.some((l) => l.includes(`error("TODO(impl): ${ref}")`) || l.includes(`error('TODO(impl): ${ref}')`));
    });
    return ok(!bad.length, `no full-ref sentinel in: ${bad.map((t) => t.name).join(", ")}`);
  },
  lua_steps: (S, P, c) => {
    const why = [];
    for (const t of luaTargets(P, c)) {
      const fn = luaFn(t.src, t.name); if (!fn) { why.push(`${t.name}: missing`); continue; }
      const steps = fn.body.map((l) => STEP_RE.exec(l)).filter(Boolean);
      if (!steps.length) { why.push(`${t.name}: no numbered TODO(impl) steps`); continue; }
      if (steps.some((m, k) => Number(m[1]) !== k + 1)) why.push(`${t.name}: steps not numbered 1..n`);
      for (const m of steps) {
        const label = m[2].replace(/\([^)]*\)/g, "").trim();
        if (label.split(/\s+/).length > 10 || /[=<>~]|\w\(|:\w+\(/.test(label)) why.push(`${t.name}: pseudo-code/long step "${m[2]}"`);
      }
    }
    return ok(!why.length, why.join("; "));
  },
  lua_tags: (S, P, c) => {
    const bad = luaTargets(P, c).filter((t) => {
      const fn = luaFn(t.src, t.name); if (!fn) return true;
      return !fn.doc.some((l) => /^\s*--\s+@task\s.*\bT-1\b.*@impl\s+\w+.*@status\s+skeleton.*@prio\s+\d/.test(l))
        || fn.doc.some((l) => /^\s*---@\w+.*@(task|impl|status|prio|calls|concurrency|dec)\b/.test(l));
    });
    return ok(!bad.length, `bad/missing tags line: ${bad.map((t) => t.name).join(", ")}`);
  },
  lua_modify_kept: (S, P, c) => {
    const miss = [];
    for (const t of luaTargets(P, c, ["modify", "existing"]).filter((x) => x.keep)) {
      const all = norm(t.src);
      for (const k of t.keep) if (!all.includes(norm(k))) miss.push(`${t.name}: ${k}`);
    }
    return ok(!miss.length, `existing code removed: ${miss.join(" | ")}`);
  },
  lua_drift_clean: (S, P) => {
    cli(P, "index", "--all");
    const r = json(cli(P, "drift", "--task", "T-1", "--json").out);
    const bad = (r?.items ?? []).filter((i) => /BAD_TAG|ORPHAN|PARSE_ERROR/.test(i.code ?? ""));
    return ok(r && !bad.length, `drift: ${JSON.stringify(bad).slice(0, 300)}`);
  },
  lua_test_stubs: (S, P) => {
    const specs = walk(path.join(P, "spec")).filter((f) => f.endsWith(".lua")).map(read).join("\n");
    const miss = [1, 2, 3, 4].filter((k) => !new RegExp(`@ac T-1\\.AC${k}\\b`).test(specs) || !new RegExp(`["']T-1\\.AC${k}\\b`).test(specs));
    return ok(!miss.length, `ACs without a stub: ${miss.join(",")}`);
  },
  skeleton_gate: (S) => {
    const b = bashCalls(S).find((x) => /\bapprove\b/.test(x));
    return ok(/\/hitl:approve T-1/.test(S.text) && !b, b ? `ran: ${b}` : "no /hitl:approve T-1 gate");
  },
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
