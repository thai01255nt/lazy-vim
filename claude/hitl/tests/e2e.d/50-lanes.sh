# Fast-lane human override + feature-level run — sourced by tests/e2e.sh (interface I4).
# Works on its own copy of the ts-app fixture (T-1 high risk) plus an appended low-risk T-2 blocked by T-1.
LN="$W/lanes-app"
FEAT=.hitl/planning/feat-user-register.md

ov_pre() { # ov_pre <sid> <command> <out> [agent]
  local in
  in=$(P="$PWD" S="$1" C="$2" A="${4:-}" js '(() => { const o = {session_id:process.env.S,cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:process.env.C}}; if (process.env.A) { o.agent_type = process.env.A; o.agent_id = "a1"; } return o; })()')
  hook pre-tool "$in" "$3"
}
ov_prompt() { # ov_prompt <sid> <prompt>
  local in
  in=$(P="$PWD" S="$1" T="$2" js '{session_id:process.env.S,cwd:process.env.P,hook_event_name:"UserPromptSubmit",prompt:process.env.T}')
  hook prompt-submit "$in" "$W/ovp.out"
}

sV1() {
  cp -R "$FIX/ts-app" "$LN"
  rm -rf "$LN/.hitl/index"
  cd "$LN"
  git init -q
  CLI init --quiet
  printf '\n## T-2 Show the registered user\n- prio: P2 | risk: low | impl: agent | blocked-by: T-1 | status: todo\n**Why**: follow-up\n\n### Acceptance criteria\n- [ ] T-2.AC1 Given a user When shown Then it prints the email\n' >> .hitl/tasks/feat-user-register.md
  CLI index --all --quiet
  expect_exit 1 CLI approve T-1 --stage skeleton --by auto
  ov_pre v1 "hitl-index approve T-1 --stage skeleton --by human-override --json" "$W/v1a.out"
  is_deny "$W/v1a.out"
  contains "$W/v1a.out" "override is human-only"
  ov_prompt v1 "/hitl:implement T-1 --lane fast"
  ov_pre v1 "hitl-index approve T-1 --stage skeleton --by human-override --json" "$W/v1b.out" hitl:implementer
  is_deny "$W/v1b.out"
  ov_pre v1 "hitl-index approve T-2 --stage skeleton --by human-override --json" "$W/v1c.out"
  is_deny "$W/v1c.out"
  ov_pre v1 "hitl-index approve T-1 --stage skeleton --by human-override --json" "$W/v1d.out"
  is_allow "$W/v1d.out"
}
step V1 "lane override: /hitl:implement T-1 --lane fast issues a token for T-1 only (main thread)" sV1

sV2() {
  cd "$LN"
  CLI approve T-1 --stage skeleton --by human-override --json > "$W/v2a.json"
  afile "$W/v2a.json" 'd.ok === true && d.by === "human-override" && d.override === true'
  afile "$LOCK" 'd.tasks["T-1"].override === true && Object.values(d.symbols).filter((s) => s.task === "T-1").every((s) => s.approvedBy === "human-override")'
  CLI status --json > "$W/v2s.json"
  afile "$W/v2s.json" 'd.tasks["T-1"].override === true && d.tasks["T-1"].status === "approved"'
  CLI risk T-1 --json > "$W/v2r.json"
  afile "$W/v2r.json" 'd.override === true && Object.values(d.symbols).length > 0 && Object.values(d.symbols).every((s) => s.route === "HUMAN")'
  expect_exit 1 CLI approve T-1 --stage done --by human-override
  expect_exit 2 CLI approve T-1 --by robot
}
step V2 "approve --by human-override: lock records it, status override:true, risk routes HUMAN, never done" sV2

sV3() {
  cd "$LN"
  CLI feature "$FEAT" --json > "$W/v3a.json"
  afile "$W/v3a.json" 'd.name === "feat-user-register" && d.items.map((i) => i.id).join() === "T-1,T-2" && d.items[0].lane === "normal" && d.items[0].action === "test" && d.items[1].lane === "fast" && d.current.id === "T-1"'
  CLI feature feat-user-register --lane fast --json > "$W/v3b.json"
  afile "$W/v3b.json" 'd.items[0].lane === "override" && d.items[0].action === "implement" && d.items[0].override === true && d.overrideTasks.join() === "T-1"'
  expect_exit 1 CLI feature nope.md
  ov_prompt v3 "/hitl:implement --feature $FEAT --lane fast"
  ov_pre v3 "hitl-index approve T-2 --stage tests --by human-override" "$W/v3c.out"
  is_allow "$W/v3c.out"
  ov_prompt v3 "/hitl:status"
  ov_pre v3 "hitl-index approve T-2 --stage tests --by human-override" "$W/v3d.out"
  is_deny "$W/v3d.out"
}
step V3 "feature plan: topological order, lanes (normal/override/fast), token bound to the feature's tasks" sV3

sV4() {
  cd "$LN"
  CLI feature "$FEAT" --report --json > "$W/v4.json"
  afile "$W/v4.json" 'd.feature === "feat-user-register" && d.report === ".hitl/reviews/feature-feat-user-register.md" && d.verdict === "not reviewed" && d.humanRequired >= 1'
  contains .hitl/reviews/feature-feat-user-register.md "# Feature feat-user-register: 2 tasks"
  contains .hitl/reviews/feature-feat-user-register.md "| T-1 | Register user with unique email | high (security) | ⚠️ yes |"
  contains .hitl/reviews/feature-feat-user-register.md "human-override (fast lane forced; risk: security)"
  local in
  in=$(P="$PWD" js '{session_id:"v4",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:process.env.P+"/.hitl/reviews/feature-feat-user-register.md",content:"x"}}')
  hook pre-tool "$in" "$W/v4w.out"
  is_deny "$W/v4w.out"
  # full security audit link: needs --report and an existing <dir>/REPORT.md; persists across later --report runs
  expect_exit 2 CLI feature "$FEAT" --security-audit "$W/audit"
  expect_exit 1 CLI feature "$FEAT" --report --security-audit "$W/audit"
  mkdir -p "$W/audit" && printf '# Security audit\n' > "$W/audit/REPORT.md"
  CLI feature "$FEAT" --report --security-audit "$W/audit" --json > "$W/v4s.json"
  CLI feature "$FEAT" --report --json > "$W/v4t.json"
  contains .hitl/reviews/feature-feat-user-register.md "- full audit: $W/audit/REPORT.md"
  in=$(P="$PWD" js '{session_id:"v4",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:process.env.P+"/.hitl/reviews/feature-feat-user-register.security.json",content:"x"}}')
  hook pre-tool "$in" "$W/v4x.out"
  is_deny "$W/v4x.out"
}
step V4 "feature --report: one-screen summary in reviews/feature-<name>.md (generated, flags override, security audit link)" sV4
