# Brief files (0.14) — sourced by tests/e2e.sh (interface I4).
# The plan interview lives in .hitl/changes/<id>/plan-brief.md: a new change gets round 1 from the template (what
# /hitl:plan writes), the CLI reports it (`brief --json`, `change --json` brief + "answer … then /hitl:plan", status
# --brief 📝 line), Q0 renames the change and key (`brief rename`), the user answers in the file, Claude marks round 1
# and appends round 2 whose accept-all Y answers every recommendation, Notes blocks (one per round and in Close) are
# processed once (pending until marked, never counted as unanswered), spec validate ignores the brief, and the Close
# question approves it.
BR="$W/brief-app"

br_fill() { # br_fill <template> <id> <key>: the template as /hitl:plan writes it (comments kept; they are not content)
  sed -e "s/{change-id}/$2/g" -e "s/{KEY}/$3/g" -e "s/{YYYY-MM-DD}/2026-11-19/" \
      -e "/^{the user's description, verbatim\./,/}$/c\\Admins export the orders of a month to CSV for the accountants." \
      -e "/^{🔗 parent/d" "$1"
}

sBR1() {
  cp -R "$FIX/spec-app" "$BR"
  cd "$BR"
  git init -q
  mkdir -p .hitl/changes/feat-export-csv
  printf '<!-- audience: business -->\n# Export orders\n> change: feat-export-csv | key: FEC | status: draft | created: 2026-11-19 | updated: 2026-11-19\n\n## Why\nAccountants retype orders.\n\n## What changes\n- Admins export the orders of a month.\n' \
    > .hitl/changes/feat-export-csv/proposal.md
  br_fill "$H/shared/templates/plan-brief.md" feat-export-csv FEC > .hitl/changes/feat-export-csv/plan-brief.md
  CLI brief feat-export-csv --json > "$W/br1.json"
  afile "$W/br1.json" 'd.kind === "plan" && d.change === "feat-export-csv" && d.key === "FEC" && d.round === 1 && d.status === "open" && /Admins export the orders/.test(d.description)'
  afile "$W/br1.json" 'd.questions.length === 11 && d.questions[0].id === "Q0" && !!d.questions[0].recommended && d.questions.slice(1).every((q) => q.tag === "R" && q.recommended === null && /^e\.g\./.test(q.hint))'
  afile "$W/br1.json" 'd.counts.unanswered === 11 && !d.rounds[0].acceptAllLine && d.rounds[0].notes && !d.rounds[0].notes.answered && d.counts.notes === 0'
  CLI change feat-export-csv --json | aj 'd.changes[0].brief.unanswered === 11 && d.changes[0].next === "answer .hitl/changes/feat-export-csv/plan-brief.md, then /hitl:plan feat-export-csv"'
  CLI status --brief > "$W/br1.txt"
  contains "$W/br1.txt" "📝 feat-export-csv — plan brief round 1: 11 unanswered → answer .hitl/changes/feat-export-csv/plan-brief.md, then /hitl:plan feat-export-csv"
}
step BR1 "plan brief round 1 from the template: brief --json (Q0 + 10 core questions, hints, no 💡), change next = answer the file, status --brief 📝 line" sBR1

sBR2() {
  cd "$BR"
  # Q0 answered with a new id and key: the folder moves before anything else is written
  expect_exit 1 CLI brief rename feat-export-csv --key PWR --json > "$W/br2a.json"
  afile "$W/br2a.json" 'd.code === "CHANGE_KEY_TAKEN"'
  CLI brief rename feat-export-csv --to feat-csv-export --key FCSV --json | aj 'd.ok && d.to === "feat-csv-export" && d.key === "FCSV"'
  [ ! -e .hitl/changes/feat-export-csv ] || { echo "old folder still there"; return 1; }
  contains .hitl/changes/feat-csv-export/plan-brief.md "# Plan brief — feat-csv-export"
  contains .hitl/changes/feat-csv-export/proposal.md "> change: feat-csv-export | key: FCSV"
  # the user answers every question in the editor (one answer spans two lines)
  node -e '
    const fs = require("fs"), f = ".hitl/changes/feat-csv-export/plan-brief.md";
    let n = 0;
    const answer = (i) => (i === 0 ? "> feat-csv-export / FCSV" : i === 3 ? "> Admins and accountants.\n> Warehouse staff must not see prices." : i === 5 ? "> không biết" : "> ok");
    const t = fs.readFileSync(f, "utf8").replace(/^>[ \t]*$/gm, () => answer(n++));
    fs.writeFileSync(f, t);'
  CLI brief feat-csv-export --json > "$W/br2.json"
  afile "$W/br2.json" 'd.counts.unanswered === 0 && d.questions[3].answer === "Admins and accountants.\nWarehouse staff must not see prices." && d.questions[5].kind === "unknown"'
  CLI change feat-csv-export --json | aj 'd.changes[0].next === "/hitl:plan feat-csv-export" && d.changes[0].brief.unanswered === 0'
}
step BR2 "Q0 rename (brief rename: key taken refused, folder + meta lines moved); answers in the file → 0 unanswered, next = /hitl:plan" sBR2

sBR3() {
  cd "$BR"
  F=.hitl/changes/feat-csv-export/plan-brief.md
  # what /hitl:plan writes after reading the answers: marks, ✅ on round 1, round 2 with an accept-all line
  node -e '
    const fs = require("fs"), f = process.argv[1];
    let t = fs.readFileSync(f, "utf8").replace("## Round 1", "## Round 1 ✅").replace("| round: 1 |", "| round: 2 |");
    t = t.replace(/^(> .*(?:\n(?:> |(?![#>→\n])).*)*)$/gm, (m) => /^> (?:change|next):/.test(m) ? m : m.includes("không biết") ? m + "\n\n→ carried to Round 2" : m + "\n\n→ recorded: FCSV-R1");
    t += "\n## Round 2 — Coverage: Scope ✅ · Actors ✅ · Data ⚠️ · Rules ❌   (🔥 FCSV-R2)\nAccept all recommendations of this round: >\n\n### Q5 [R] Which rules and limits apply?\n💡 Recommended: at most 12 months per file.\n>\n\n### Q11 [R] 🔥 What happens above 10 000 rows?\n💡 Recommended: split into files of ≤ 10 000 rows.\n>\n\n### Notes — anything the questions missed, or a change to an earlier answer\n> sửa Q3: chỉ admin, không có kế toán\n";
    fs.writeFileSync(f, t);' "$F"
  CLI brief feat-csv-export --json > "$W/br3a.json"
  afile "$W/br3a.json" 'd.round === 2 && d.rounds[0].done && d.questions.filter((q) => q.round === 1).every((q) => q.settled) && d.questions.find((q) => q.round === 1 && q.id === "Q5").carried === 2'
  afile "$W/br3a.json" 'd.rounds[1].acceptAllLine && !d.rounds[1].acceptAll && d.counts.unanswered === 2 && d.rounds[1].hot[0] === "FCSV-R2" && d.questions.at(-1).hot'
  # round 1 Notes (filled in BR2) were marked with the round; round 2 Notes wait to be processed, never as a question
  afile "$W/br3a.json" 'd.rounds[0].notes.marked && !d.rounds[0].notes.pending && d.rounds[1].notes.pending && /^sửa Q3/.test(d.rounds[1].notes.text) && d.counts.notes === 1 && !d.questions.some((q) => q.id === "notes")'
  # the user types Y on the accept-all line: both recommendations count as answers
  sed -i 's/^Accept all recommendations of this round: >$/Accept all recommendations of this round: > Y/' "$F"
  CLI brief feat-csv-export --json | aj 'd.rounds[1].acceptAll && d.counts.unanswered === 0 && d.questions.filter((q) => q.round === 2).every((q) => q.acceptedByRound)'
  CLI brief feat-csv-export > "$W/br3c.txt"
  contains "$W/br3c.txt" "Notes (Round 2) — to process: sửa Q3: chỉ admin, không có kế toán"
  printf '\n→ recorded: FCSV-R1 (changed)\n' >> "$F"
  CLI brief feat-csv-export --json | aj 'd.rounds[1].notes.marked && d.counts.notes === 0'
  # the brief is not a spec file
  CLI spec validate feat-csv-export --json > "$W/br3b.json" || true
  ! grep -q "plan-brief" "$W/br3b.json" || { echo "validate looked at the brief"; head -c 800 "$W/br3b.json"; return 1; }
}
step BR3 "round 1 marked (recorded / carried), round 2 with Coverage + 🔥; accept-all Y answers every 💡; spec validate ignores the brief" sBR3

sBR4() {
  cd "$BR"
  F=.hitl/changes/feat-csv-export/plan-brief.md
  sed -i -e 's/^## Round 2 —/## Round 2 ✅ —/' -e 's/| status: open |/| status: closing |/' "$F"
  printf '\n## Close\n📋 feat-csv-export — capabilities: orders (+2) · scenarios: 4 · validate: ✅\n\n### Notes — anything the questions missed, or a change to an earlier answer\n>\n\n### Approve the spec? (Y/n) — then /hitl:design\n>\n' >> "$F"
  CLI brief feat-csv-export --json | aj 'd.status === "closing" && d.close.kind === "empty" && d.counts.unanswered === 1 && d.close.items.length === 1 && d.close.notes && !d.close.notes.answered'
  CLI change feat-csv-export --json | aj 'd.changes[0].next === "answer .hitl/changes/feat-csv-export/plan-brief.md, then /hitl:plan feat-csv-export"'
  sed -i 's/^>$/> Y/' "$F"
  CLI brief feat-csv-export --json | aj 'd.close.kind === "accept" && d.counts.unanswered === 0'
  # approved: header status done → the brief is no longer open
  sed -i 's/| status: closing |/| status: done |/' "$F"
  printf '→ approved 2026-11-19\n' >> "$F"
  CLI change feat-csv-export --json | aj 'd.changes[0].brief.open === false && d.changes[0].next === "/hitl:plan feat-csv-export"'
}
step BR4 "Close section: the approve question counts as unanswered until Y; status done closes the brief" sBR4
