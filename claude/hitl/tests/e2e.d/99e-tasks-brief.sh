# Tasks brief (0.21) — sourced by tests/e2e.sh (interface I4).
# The /hitl:tasks gate lives in tasks-brief.md (a quick file: quick-<slug>-brief.md next to it): a draft set is held
# (TASKS_NOT_APPROVED on skeleton/tests approval and the context pack, status hold, next = the brief), `tasks gate
# --write` writes the generated Current set (wave column) and the round snapshot, the human's own edit of tasks.md
# shows in `tasks diff` and supersedes the approve Y, only `tasks approve` sets the header (the hook refuses Claude's
# own edit of it), an update holds only the new task, and a quick file resolves by its key.
TB="$W/tasks-brief-app"
TBC=.hitl/changes/feat-password-reset

tb_brief() { # tb_brief <title> <meta line>: a round as /hitl:tasks writes it from the template (4 [Q], Notes, approve last)
  printf '# Tasks brief — %s\n\n%s\n> next: answer the `>` lines, then run /hitl:tasks %s\n\n## Current set\n\n## Round 1\n\nAccept all recommendations of this round: >\n\n### Q1 [Q] Slices: is each task one vertical slice that fits one session (merge or split any)?\n\n_Rec:_ keep as drafted.\n\n>\n\n### Q2 [Q] Blocking edges: does each task wait only for tasks that really gate it?\n\n_Rec:_ keep as drafted.\n\n>\n\n### Q3 [Q] Owners: who writes each symbol (agent or you)?\n\n_Rec:_ keep as drafted.\n\n>\n\n### Q4 [Q] Test plan: which ACs get a new test (and the defect it catches), which do not?\n\n_Rec:_ keep as drafted.\n\n>\n\n### Notes — anything the questions missed, or a change to an earlier answer\n\n>\n\n### Q5 Approve the task set? (Y/n) (needs its own Y)\n\nApproves the set as shown in Current set.\n\n>\n' "$1" "$2" "$1"
}
tb_answer() { # tb_answer <brief file>: in the last round, accept-all Y (when empty) and Y under the approve question
  node -e 'const fs = require("fs"), f = process.argv[1]; let t = fs.readFileSync(f, "utf8");
    const i = t.lastIndexOf("this round: >"); if (i >= 0 && t[i + 13] === "\n") t = t.slice(0, i) + "this round: > Y" + t.slice(i + 13);
    const k = t.indexOf("\n\n>", t.lastIndexOf("Approves the set")); t = t.slice(0, k) + "\n\n> Y" + t.slice(k + 3);
    fs.writeFileSync(f, t);' "$1"
}

sTB1() {
  cp -R "$FIX/spec-app" "$TB"
  cd "$TB"
  git init -q
  sed -i 's/^> status: approved$/> status: draft/' $TBC/tasks.md
  tb_brief feat-password-reset "> change: feat-password-reset | key: PWR | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21" > $TBC/tasks-brief.md
  CLI tasks gate feat-password-reset --write --json > "$W/tb1.json"
  afile "$W/tb1.json" 'd.ok && d.round === 1 && /^[0-9a-f]{12}$/.test(d.set) && /\| wave \|/.test(d.markdown)'
  contains $TBC/tasks-brief.md "| PWR-T2 | Set a new password | P1   | high (security) | agent | PWR-T1     | 1    |"
  [ -f $TBC/.tasks-round.json ] || { echo "no snapshot"; return 1; }
  CLI brief feat-password-reset --kind tasks --json | aj 'd.kind === "tasks" && d.questions.length === 5 && d.questions[4].ownY === "approve" && d.set && d.counts.unanswered === 5'
  # a draft set is not built: approval, context pack, status hold, next = the brief
  expect_exit 1 CLI approve PWR-T2 --stage skeleton --by auto --json > "$W/tb1a.json"
  afile "$W/tb1a.json" 'd.code === "TASKS_NOT_APPROVED" && /draft task set/.test(d.reasons[0])'
  expect_exit 1 CLI --json context PWR-T2 --contract > "$W/tb1c.json"
  afile "$W/tb1c.json" 'd.code === "TASKS_NOT_APPROVED"'
  CLI status --json | aj 'd.tasks["PWR-T2"].tasksHold.reason === "draft" && d.next.command === "answer .hitl/changes/feat-password-reset/tasks-brief.md, then /hitl:tasks feat-password-reset"'
  CLI status --brief > "$W/tb1.txt"
  contains "$W/tb1.txt" "_Brief:_ feat-password-reset — tasks brief round 1: 5 unanswered → answer .hitl/changes/feat-password-reset/tasks-brief.md, then /hitl:tasks feat-password-reset"
}
step TB1 "tasks brief round 1: gate --write (Current set with waves, set:, snapshot); a draft set refuses approve skeleton and context (TASKS_NOT_APPROVED), status holds it, next = the brief" sTB1

sTB2() {
  cd "$TB"
  # Claude's own edit of the header is refused (Edit, and sed -i from the shell)
  local f="$TB/$TBC/tasks.md"
  hook pre-tool "$(F="$f" CWD="$TB" js '{session_id:"s1",cwd:process.env.CWD,hook_event_name:"PreToolUse",tool_name:"Edit",tool_input:{file_path:process.env.F,old_string:"> status: draft",new_string:"> status: approved"}}')" "$W/tb2a.json"
  is_deny "$W/tb2a.json"
  contains "$W/tb2a.json" "only \`hitl-index tasks approve"
  hook pre-tool "$(F="$f" CWD="$TB" js '{session_id:"s1",cwd:process.env.CWD,hook_event_name:"PreToolUse",tool_name:"Bash",tool_input:{command:"sed -i s/draft/approved/ "+process.env.F+" # status: approved"}}')" "$W/tb2b.json"
  is_deny "$W/tb2b.json"
  # accept-all Y alone never approves
  node -e 'const fs = require("fs"), f = process.argv[1]; fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("this round: >", "this round: > Y"));' $TBC/tasks-brief.md
  expect_exit 1 CLI tasks approve feat-password-reset --json > "$W/tb2c.json"
  afile "$W/tb2c.json" 'd.code === "TASKS_APPROVE_NO_Y"'
  # Y under the approve question, but the human also edited tasks.md: the diff shows it and the approval is refused
  tb_answer $TBC/tasks-brief.md
  sed -i 's/impl: agent | blocked-by: PWR-T1/impl: manual | blocked-by: PWR-T1/' $TBC/tasks.md
  CLI tasks diff feat-password-reset --json | aj 'd.changed && d.lines[0] === "~ PWR-T2 impl agent → manual"'
  expect_exit 1 CLI tasks approve feat-password-reset --json > "$W/tb2d.json"
  afile "$W/tb2d.json" 'd.code === "TASKS_SET_CHANGED" && d.diff[0] === "~ PWR-T2 impl agent → manual"'
  grep -q '^> status: draft$' $TBC/tasks.md || { echo "header changed"; return 1; }
}
step TB2 "only the CLI approves: the hook refuses Claude's header edit (Edit, sed -i); accept-all Y is not the approval; a human edit shows in tasks diff and refuses the Y (TASKS_SET_CHANGED)" sTB2

sTB3() {
  cd "$TB"
  # what /hitl:tasks writes next: the Y is superseded, round 2 shows the change, a new snapshot
  node -e 'const fs = require("fs"), f = process.argv[1];
    let t = fs.readFileSync(f, "utf8").replace("## Round 1\n", "## Round 1 ✅\n").replace(/(Approves the set[^\n]*\n\n> Y\n)/, "$1\n→ superseded\n").replace("round: 1", "round: 2");
    t += "\n## Round 2\n\n_Changed since Round 1:_ ~ PWR-T2 impl agent → manual (your edit)\n\nAccept all recommendations of this round: >\n\n### Notes — anything the questions missed, or a change to an earlier answer\n\n>\n\n### Q6 Approve the task set? (Y/n) (needs its own Y)\n\nApproves the set as shown in Current set.\n\n>\n";
    fs.writeFileSync(f, t);' $TBC/tasks-brief.md
  CLI tasks gate feat-password-reset --write --json | aj 'd.round === 2'
  CLI tasks diff feat-password-reset --json | aj '!d.changed && d.snapshot.round === 2'
  tb_answer $TBC/tasks-brief.md
  CLI tasks approve feat-password-reset --json > "$W/tb3.json"
  afile "$W/tb3.json" 'd.ok && d.question === "Q6" && d.round === 2 && d.was === "draft"'
  grep -q '^> status: approved$' $TBC/tasks.md || { echo "not approved"; return 1; }
  CLI brief feat-password-reset --kind tasks --json | aj 'd.status === "done" && d.rounds[1].done && /^approved /.test(d.questions.at(-1).recorded[0])'
  CLI status --json | aj '!d.tasks["PWR-T2"].tasksHold'
  CLI --json context PWR-T2 > /dev/null
}
step TB3 "round 2 (superseded Y, _Changed since Round 1:_, new snapshot) → Y → tasks approve sets the header, brief done; the hold is gone" sTB3

sTB4() {
  cd "$TB"
  # an update: baseline, a new task, a new round; tasks.md stays approved, only the new task is held
  CLI tasks baseline feat-password-reset --json | aj 'd.ok'
  printf '\n## PWR-T3 Expire old links\n- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo\n\n### Acceptance criteria\n- [ ] PWR-T3.AC1 (PWR-R2.S1) Given an old link When used Then refused\n\n### Test plan\n| ac | test | kind | oracle | seam | author |\n|----|------|------|--------|------|--------|\n| AC1 | new: an old link still works | example | spec | reset endpoint | test-author |\n' >> $TBC/tasks.md
  node -e 'const fs = require("fs"), f = process.argv[1];
    fs.writeFileSync(f, fs.readFileSync(f, "utf8").replace("status: done", "status: open").replace("round: 2", "round: 3") + "\n## Round 3 — update: expire old links\n\n### Notes — anything the questions missed, or a change to an earlier answer\n\n>\n\n### Q7 Approve the task set? (Y/n) (needs its own Y)\n\nApproves the set as shown in Current set.\n\n>\n");' $TBC/tasks-brief.md
  expect_exit 1 CLI tasks baseline feat-password-reset --json > "$W/tb4a.json"
  afile "$W/tb4a.json" 'd.code === "TASKS_BRIEF_OPEN"'
  CLI tasks gate feat-password-reset --write > /dev/null
  CLI status --json | aj 'd.tasks["PWR-T3"].tasksHold.reason === "update" && !d.tasks["PWR-T2"].tasksHold'
  grep -q '^> status: approved$' $TBC/tasks.md || { echo "header left approved"; return 1; }
  expect_exit 1 CLI approve PWR-T3 --stage skeleton --by auto --json > "$W/tb4b.json"
  afile "$W/tb4b.json" 'd.code === "TASKS_NOT_APPROVED" && /open tasks brief update/.test(d.reasons[0])'
  CLI status --brief > "$W/tb4.txt"
  contains "$W/tb4.txt" "_Brief:_ feat-password-reset — tasks brief round 3 (update): 1 unanswered"
}
step TB4 "update: baseline (refused while a round is open), a new task held (TASKS_NOT_APPROVED), the untouched task goes on, the header stays approved" sTB4

sTB5() {
  cd "$TB"
  # a quick file: its key resolves the brief, the -brief.md file is no tasks doc, next-id reserves -brief slugs
  CLI --json next-id --quick fix-label-typo | aj 'd.key === "QFLT"'
  expect_exit 1 CLI --json next-id --quick label-brief > "$W/tb5a.json"
  afile "$W/tb5a.json" 'd.code === "QUICK_SLUG_RESERVED"'
  mkdir -p .hitl/tasks
  printf '# Label typo Tasks\n\n← Change: none | key: QFLT\n\n> status: draft\n\n## QFLT-T1 Fix the label typo\n\n- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo\n\n### Acceptance criteria\n\n- [ ] QFLT-T1.AC1 Given the sign-in page When it loads Then the label reads Password\n\n### Test plan\n\n| ac | test | kind | oracle | seam | author |\n| --- | --- | --- | --- | --- | --- |\n| AC1 | none: a constant, type-checked | — | — | — | — |\n' > .hitl/tasks/quick-fix-label-typo.md
  tb_brief quick-fix-label-typo "> quick: fix-label-typo | key: QFLT | kind: tasks | set: — | status: open | round: 1 | updated: 2026-11-21" \
    | sed 's#/hitl:tasks quick-fix-label-typo#/hitl:tasks QFLT#' > .hitl/tasks/quick-fix-label-typo-brief.md
  CLI tasks --check --json | aj '!d.errors.some((e) => /QFLT|quick-fix/.test(e.message + e.file))'
  CLI tasks --json | aj 'd.tasks.filter((t) => t.quick).length === 1'
  CLI tasks gate QFLT --write > /dev/null
  [ -f .hitl/tasks/.quick-fix-label-typo-round.json ] || { echo "no quick snapshot"; return 1; }
  CLI brief QFLT --kind tasks --json | aj 'd.kind === "tasks" && d.change === null && d.quick.slug === "fix-label-typo" && d.quick.key === "QFLT"'
  CLI status --json | aj 'd.quick[0].key === "QFLT" && d.quick[0].tasks === "draft" && d.tasks["QFLT-T1"].tasksHold.apply === "answer .hitl/tasks/quick-fix-label-typo-brief.md, then /hitl:tasks QFLT"'
  tb_answer .hitl/tasks/quick-fix-label-typo-brief.md
  CLI tasks approve quick-fix-label-typo --json | aj 'd.ok && d.target === "QFLT"'
  grep -q '^> status: approved$' .hitl/tasks/quick-fix-label-typo.md || { echo "quick not approved"; return 1; }
  CLI status --json | aj '!d.tasks["QFLT-T1"].tasksHold && d.quick[0].tasks === "approved"'
}
step TB5 "quick: next-id reserves -brief slugs, the brief is no tasks doc, QFLT / quick-<slug> resolve it, the snapshot sits next to it, tasks approve QFLT" sTB5
