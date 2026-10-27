# 0.4 upgrade — `hitl-index migrate` on a ≤ 0.3 project (state in .claude/custom/) — sourced by tests/e2e.sh (interface I4).
MG="$W/legacy-app"

sM1() {
  cp -R "$FIX/ts-app" "$MG"
  rm -rf "$MG/.hitl/index"
  cd "$MG"
  mkdir -p .claude && mv .hitl .claude/custom
  for f in .claude/custom/*/*.md; do sed -i 's#\.hitl/#.claude/custom/#g' "$f"; done
  printf '{"schema":"hitl.config/1","customAdapters":{"cobol":".claude/custom/adapters/cobol.mjs"}}\n' > .claude/custom/hitl.config.json
  printf 'index/*\n!index/skeleton.lock.json\n' > .claude/custom/.gitignore
  echo keep > .claude/custom/NOTES.txt
  git init -q && git add -A && git -c user.email=e2e@x -c user.name=e2e commit -qm legacy
  hook session-start "$(P="$PWD" js '{session_id:"m1",cwd:process.env.P,hook_event_name:"SessionStart"}')" "$W/m1.out"
  contains "$W/m1.out" "legacy dir .claude/custom/ — run hitl-index migrate"
  expect_exit 1 CLI init --quiet
  [ ! -e .hitl ] || { echo ".hitl created next to a legacy dir"; return 1; }
}
step M1 "legacy .claude/custom/ project: SessionStart notice, init refuses an empty .hitl/" sM1

sM2() {
  cd "$MG"
  CLI migrate --dry-run > "$W/m2a.out"
  contains "$W/m2a.out" "git mv .claude/custom/tasks .hitl/tasks"
  [ ! -e .hitl ] && [ -f .claude/custom/tasks/feat-user-register.md ] || { echo "dry-run changed files"; return 1; }
  CLI migrate > "$W/m2b.out"
  contains "$W/m2b.out" "git add -A -- .claude/custom .hitl"
  contains "$W/m2b.out" "left in place (not hitl's): .claude/custom/NOTES.txt"
  contains .hitl/hitl.config.json '".hitl/adapters/cobol.mjs"'
  contains .hitl/tasks/feat-user-register.md "← Planning: .hitl/planning/feat-user-register.md"
  contains .hitl/.gitignore "!reviews/*/decisions.json"
  CLI index --all --quiet
  CLI tasks --check --quiet
  in=$(P="$PWD" js '{session_id:"m2",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:process.env.P+"/.hitl/index/index.json",old_string:"a",new_string:"b"}}')
  hook pre-tool "$in" "$W/m2c.out"
  is_deny "$W/m2c.out"
  git add -A -- .claude/custom .hitl
  git status --porcelain | grep -q '^R  .claude/custom/tasks/feat-user-register.md -> .hitl/tasks/feat-user-register.md' || { git status --porcelain; return 1; }
}
step M2 "migrate: dry-run is a no-op; move + path rewrite + .gitignore; index/tasks/hooks work on .hitl/; git sees renames" sM2

sM3() {
  local d="$W/legacy-conflict"
  mkdir -p "$d/.claude/custom/tasks" "$d/.hitl/tasks"
  echo '{}' > "$d/.claude/custom/hitl.config.json"; echo a > "$d/.claude/custom/tasks/x.md"; echo b > "$d/.hitl/tasks/x.md"
  cd "$d"
  expect_exit 1 CLI migrate
  [ -f .claude/custom/tasks/x.md ] && grep -qx b .hitl/tasks/x.md || { echo "conflicting migrate moved files"; return 1; }
}
step M3 "migrate refuses when .hitl/ already has conflicting content (nothing moved)" sM3

sM4() {
  local d="$W/specs-migrate"
  cp -R "$FIX/ts-app" "$d"
  rm -rf "$d/.hitl/index"
  cd "$d"
  CLI init --quiet
  CLI index --all --quiet
  hook session-start "$(P="$PWD" js '{session_id:"m4",cwd:process.env.P,hook_event_name:"SessionStart"}')" "$W/m4a.out"
  contains "$W/m4a.out" "v0.5 planning files — run hitl-index migrate --specs"
  CLI migrate --specs --dry-run --json > "$W/m4b.json"
  afile "$W/m4b.json" 'd.dryRun === true && d.plan[0].change === "feat-user-register" && d.plan[0].key === "UR" && d.plan[0].ids["R-1"] === "UR-R1"'
  [ -f .hitl/planning/feat-user-register.md ] && [ ! -e .hitl/changes ] || { echo "dry-run changed files"; return 1; }
  CLI migrate --specs > "$W/m4c.out"
  [ -f .hitl/changes/feat-user-register/.legacy/planning.md ] && [ ! -e .hitl/planning/feat-user-register.md ] || { echo "planning not moved"; return 1; }
  contains .hitl/changes/feat-user-register/tasks.md "← Change: feat-user-register"
  contains .hitl/.gitignore ".spec-review.json"
  CLI spec validate --quiet
  CLI tasks --check --quiet
  CLI trace --check --json > "$W/m4d.json"
  afile "$W/m4d.json" 'd.schema === "hitl.trace/2" && d.counts.block === 0 && d.changes[0].id === "feat-user-register" && d.rows.some((r) => r.req && r.req.id === "UR-R1" && r.scenarios[0].acs.some((a) => a.id === "T-1.AC1"))'
  CLI feature feat-user-register --json > "$W/m4e.json"
  afile "$W/m4e.json" 'd.name === "feat-user-register" && d.file === ".hitl/changes/feat-user-register/tasks.md"'
  hook session-start "$(P="$PWD" js '{session_id:"m4b",cwd:process.env.P,hook_event_name:"SessionStart"}')" "$W/m4f.out"
  ! grep -q "migrate --specs" "$W/m4f.out" || { echo "legacy notice after migration"; return 1; }
  CLI migrate --specs --json > "$W/m4h.json"; afile "$W/m4h.json" 'd.status === "nothing"'
  in=$(P="$PWD" js '{session_id:"m4",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Write",tool_input:{file_path:process.env.P+"/.hitl/specs/user-register/spec.md",content:"x"}}')
  hook pre-tool "$in" "$W/m4g.out"
  is_deny "$W/m4g.out"
}
step M4 "migrate --specs: dry-run no-op; change folder + moved files; validate/tasks/trace clean; feature by change id; living specs hook-protected" sM4
