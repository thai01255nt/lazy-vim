# Linear tickets (package C) — sourced by tests/e2e.sh after step 24 (interface I4). No network: the MCP side is
# simulated by writing hitl.tickets-results/1 / hitl.tickets-remote/1 files like the tickets skill would.
LIN="$W/lin-app"
LINF="$H/tests/fixtures/linear"
LMAP=.hitl/linear.map.json
LPLAN=.hitl/index/linear.plan.json
LQUEUE=.hitl/index/linear.queue.json

# results for every op of the current plan: ok, createIssue → ENG-1 / issue-uuid-1 / eng-1-register
lin_results() { # lin_results <out-file> [unreachable-reason] [planId-override]
  node -e '
    const fs = require("fs"); const [out, reason, pid] = process.argv.slice(1);
    const p = JSON.parse(fs.readFileSync(".hitl/index/linear.plan.json", "utf8"));
    const results = reason ? [] : p.ops.map((o) => o.op === "ensureProject"
      ? { opId: o.opId, ok: true, id: "proj-uuid-1", url: "https://linear.app/acme/project/user-register" }
      : o.op === "createIssue"
        ? { opId: o.opId, ok: true, id: "issue-uuid-1", issue: "ENG-1", url: "https://linear.app/acme/issue/ENG-1/register", branch: "eng-1-register" }
        : { opId: o.opId, ok: true });
    fs.writeFileSync(out, JSON.stringify({ schema: "hitl.tickets-results/1", kind: "push", planId: pid || p.planId,
      unreachable: reason ? { reason } : null, results }));' "$@"
}

sL1() {
  cp -R "$FIX/ts-app" "$LIN"
  rm -rf "$LIN/.hitl/index"
  cd "$LIN"
  git init -q
  CLI init --quiet
  CLI index --all --quiet
  CLI tickets status --json > "$W/l1s.json"
  afile "$W/l1s.json" 'd.schema === "hitl.tickets-status/1" && d.enabled === false && d.configured === false'
  CLI tickets plan --json > "$W/l1p.json"
  afile "$W/l1p.json" 'd.enabled === false && d.ops.length === 0'
  [ ! -e "$LMAP" ] || { echo "map file must not exist"; return 1; }
  [ ! -e "$LPLAN" ] || { echo "plan file must not be written when disabled"; return 1; }
}
step L1 "tickets: disabled by default — status enabled:false, plan has no ops, no map" sL1

sL2() {
  cd "$LIN"
  CLI init --quiet --set linear.enabled=true --set linear.team=ENG
  CLI tickets plan --json > "$W/l2p.json"
  afile "$W/l2p.json" 'd.enabled === true && d.configured === false && d.ops.length === 0'
  mkdir -p .hitl/.inbox
  cp "$LINF/init.json" .hitl/.inbox/tickets-init.json
  CLI tickets record --in .hitl/.inbox/tickets-init.json --json > "$W/l2r.json"
  afile "$W/l2r.json" 'd.schema === "hitl.tickets-record/1" && d.applied === 1'
  afile "$LMAP" 'd.schema === "hitl.linear-map/1" && d.team.key === "ENG" && d.states.started.id === "st-progress"'
  [ ! -e .hitl/.inbox/tickets-init.json ] || { echo "inbox file not deleted"; return 1; }
}
step L2 "tickets: enable + init record → map has team ENG, inbox file deleted" sL2

sL3() {
  cd "$LIN"
  CLI tickets plan --json > "$W/l3p.json"
  afile "$W/l3p.json" 'd.configured === true && d.ops.length === 2 && d.ops[0].op === "ensureProject"'
  afile "$W/l3p.json" '(() => { const c = d.ops.find((o) => o.op === "createIssue" && o.task === "T-1"); return c && c.needsGate === true && c.payload.priority === 2 && c.payload.description.includes("hitl:task=T-1") && c.payload.stateType === "started"; })()'
  [ -f "$LPLAN" ] || { echo "plan file missing"; return 1; }
}
step L3 "tickets plan: ensureProject + gated createIssue T-1 (P1 → 2, started, marker)" sL3

sL4() {
  cd "$LIN"
  lin_results .hitl/.inbox/tickets-push.json
  CLI tickets record --in .hitl/.inbox/tickets-push.json --json > "$W/l4r.json"
  afile "$W/l4r.json" 'd.applied === 2 && d.failed === 0'
  afile "$LMAP" 'd.tasks["T-1"].issue === "ENG-1" && d.tasks["T-1"].branch === "eng-1-register" && d.planning["feat-user-register.md"].id === "proj-uuid-1"'
  CLI tickets plan --json > "$W/l4p.json"
  afile "$W/l4p.json" 'd.ops.length === 0'
  CLI status --json > "$W/l4s.json"
  afile "$W/l4s.json" 'd.tasks["T-1"].linear && d.tasks["T-1"].linear.issue === "ENG-1" && d.tickets.mapped === 1'
  CLI tickets status --json > "$W/l4t.json"
  afile "$W/l4t.json" 'd.tasks[0].synced === true && d.tasks[0].prLine === "Part of ENG-1"'
}
step L4 "tickets record push → T-1 mapped to ENG-1; plan again is empty; status --json shows linear" sL4

sL5() {
  cd "$LIN"
  sed -i.bak -E 's/^(- \[ \] T-1\.AC2 .*)$/\1 (edited)/' .hitl/tasks/feat-user-register.md && rm -f .hitl/tasks/feat-user-register.md.bak
  grep -q '(edited)$' .hitl/tasks/feat-user-register.md || { echo "AC2 edit failed"; return 1; }
  CLI tickets plan --json > "$W/l5p.json"
  afile "$W/l5p.json" 'd.ops.length === 1 && d.ops[0].op === "updateIssue" && d.ops[0].task === "T-1" && "description" in d.ops[0].payload.fields && !("stateId" in d.ops[0].payload.fields)'
  lin_results .hitl/.inbox/tickets-push.json "MCP not connected"
  CLI tickets record --in .hitl/.inbox/tickets-push.json --json > "$W/l5r.json"
  afile "$W/l5r.json" 'd.queued === 1'
  afile "$LQUEUE" 'd.schema === "hitl.linear-queue/1" && d.items.length === 1 && d.items[0].op === "updateIssue"'
  local in; in=$(P="$PWD" js '{session_id:"e2e-L5",cwd:process.env.P,hook_event_name:"SessionStart",source:"startup"}')
  hook session-start "$in" "$W/hL5.txt"
  contains "$W/hL5.txt" "Linear update(s) queued"
  [ "$(wc -l < "$W/hL5.txt")" -le 4 ] || { echo "session-start printed > 4 lines"; cat "$W/hL5.txt"; return 1; }
}
step L5 "AC edit → one updateIssue; unreachable record queues it; session-start shows the queued line" sL5

sL6() {
  cd "$LIN"
  local in; in=$(P="$PWD" js '{session_id:"e2e-L6",cwd:process.env.P,hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:process.env.P+"/.hitl/linear.map.json",old_string:"ENG-1",new_string:"ENG-2"}}')
  hook pre-tool "$in" "$W/hL6.json"
  is_deny "$W/hL6.json"
}
step L6 "pre-tool: main-thread Edit of linear.map.json is denied" sL6

sL7() {
  cd "$LIN"
  cp .hitl/tasks/feat-user-register.md "$W/l7-before.md"
  CLI tickets diff --in "$LINF/remote.json" --json > "$W/l7d.json"
  afile "$W/l7d.json" 'd.schema === "hitl.tickets-diff/1" && d.items.some((i) => i.code === "LINEAR_DONE_EARLY") && d.items.some((i) => i.code === "LINEAR_DRIFT" && i.field === "priority")'
  afile "$W/l7d.json" 'd.remote["T-1"].assignee === "Thai"'
  cmp .hitl/tasks/feat-user-register.md "$W/l7-before.md"
  [ -f "$LINF/remote.json" ] || { echo "fixture outside .inbox must not be deleted"; return 1; }
  afile .hitl/index/linear.remote.json 'd.schema === "hitl.linear-remote/1" && !!d.tasks["T-1"]'
}
step L7 "tickets diff: LINEAR_DONE_EARLY + priority drift; tasks md unchanged" sL7

sL8() {
  cd "$LIN"
  CLI tickets plan --json > /dev/null
  lin_results .hitl/.inbox/tickets-push.json "" "0000000000000000"
  expect_exit 1 CLI tickets record --in .hitl/.inbox/tickets-push.json
  [ -f .hitl/.inbox/tickets-push.json ] || { echo "inbox file must be kept on a failed record"; return 1; }
}
step L8 "tickets record with a wrong planId: exit 1" sL8

sL9() {
  cd "$LIN"
  afile "$LMAP" 'd.repo === "lin-app" && d.workspace.urlKey === "acme"'
  mkdir -p .hitl/.inbox
  printf '%s' '{"schema":"hitl.tickets-identity/1","server":"linear-personal","workspace":{"urlKey":"personal"},"team":{"id":"team-uuid-me","key":"ME"}}' > .hitl/.inbox/tickets-identity.json
  cp "$LMAP" "$W/l9-map-before.json"
  expect_exit 4 CLI tickets verify --in .hitl/.inbox/tickets-identity.json --json
  cmp "$LMAP" "$W/l9-map-before.json"
  printf '%s' '{"schema":"hitl.tickets-identity/1","server":"linear-work","workspace":{"url":"https://linear.app/acme/team/ENG"},"team":{"id":"team-uuid-eng","key":"ENG"}}' > .hitl/.inbox/tickets-identity.json
  CLI tickets verify --in .hitl/.inbox/tickets-identity.json --json > "$W/l9v.json"
  afile "$W/l9v.json" 'd.ok === true && d.status === "match"'
  CLI tickets server linear-work linear-personal --init --json > "$W/l9s.json"
  afile "$W/l9s.json" 'd.action === "pick" && d.candidates.length === 2'
}
step L9 "tickets verify: wrong workspace/team → exit 4, map unchanged; match → ok; server pick with 2 servers" sL9
