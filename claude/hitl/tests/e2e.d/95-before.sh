# Prerequisite changes (0.12) — sourced by tests/e2e.sh (interface I4).
# A = feat-fee in implement (BIL-T1 settle done with locked tests, BIL-T2 todo). B = feat-report is created `--before feat-fee`:
# the CLI writes an order note (source: feat-report) into A, and all of A waits (task approvals, --force/--ack too, the
# archive). B's plan finds that A's fee rule must change: a spec note (source: feat-report) goes into A, never into A's
# files. B is archived → A no longer waits, but the unapplied note forces A's amend first → recheck → the human reopens →
# the test is rewritten, re-locked, implemented and done. Last: a source change that is gone keeps A blocked until the
# human dismisses its note.
BF="$W/before-app"

bf_src() { printf '/**\n * Settles a charge: the amount plus the fee.\n * @task BIL-T1 @impl agent @status skeleton @prio 1\n */\nexport function settle(amount: number): number {\n%s\n}\n' "$1" > src/settle.ts; }
bf_tests() { # bf_tests <expected for 10>
  printf 'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { settle } from "../src/settle.ts";\n\ndescribe("settle", () => {\n' > tests/settle.test.ts
  printf '  /** @covers settle @ac BIL-T1.AC1 @kind example @origin test-author */\n  it("BIL-T1.AC1 adds the fee", () => { assert.equal(settle(10), %s); });\n});\n' "$1" >> tests/settle.test.ts
}
bf_proposal() { # bf_proposal <id> <title> <cap> <key> <meta-extra> <tasks-decision>
  cat <<EOF
<!-- audience: business -->
# $2
> change: $1 | key: $4 | status: approved | created: 2026-11-01 | updated: 2026-11-01$5

## Why
The business needs it.

## What changes
- $2.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| $3 | $4 | new | +$4-R1 |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | skipped | small |
| tasks | $6 | small |
EOF
}

sB1() {
  mkdir -p "$BF/src" "$BF/tests" "$BF/.hitl/changes/feat-fee/specs/billing"
  cd "$BF"
  git init -q
  printf '{"name":"before-app","private":true,"type":"module","scripts":{"test":"node --test"}}\n' > package.json
  bf_proposal feat-fee "Settlement fee" billing BIL "" included > .hitl/changes/feat-fee/proposal.md
  cat > .hitl/changes/feat-fee/specs/billing/spec.md <<'EOF'
<!-- audience: business -->
# Delta: Billing
> capability: billing | change: feat-fee

## Purpose
How a charge is settled.

## ADDED Requirements
### Requirement: BIL-R1 Settle with a fee
When a charge is settled, the system SHALL add the settlement fee to the amount.

#### Scenario: BIL-R1.S1 Fee added
- GIVEN an amount of 10
- WHEN it is settled
- THEN the result is 11

### Requirement: BIL-R2 Settlement receipt
When a charge is settled, the system SHALL record a receipt.

#### Scenario: BIL-R2.S1 Receipt recorded
- GIVEN an amount of 10
- WHEN it is settled
- THEN one receipt is recorded
EOF
  cat > .hitl/changes/feat-fee/tasks.md <<'EOF'
# Settlement fee Tasks
← Change: feat-fee
> status: approved

## BIL-T1 Settle with a fee
- prio: P0 | risk: high (money) | impl: agent | blocked-by: none | status: todo
**Why**: fee on every settlement

### Acceptance criteria
- [ ] BIL-T1.AC1 (BIL-R1.S1) Given 10 When settle Then 11

### Symbols
1. [ ] `settle` | new | `src/settle.ts` | impl: agent | settle with the fee

## BIL-T2 Record a receipt
- prio: P1 | risk: high (money) | impl: agent | blocked-by: BIL-T1 | status: todo
**Why**: audit

### Acceptance criteria
- [ ] BIL-T2.AC1 (BIL-R2.S1) Given 10 When settle Then one receipt
EOF
  bf_src '  // TODO(impl): 1. add the fee
  throw new Error("TODO(impl): settle");'
  bf_tests 11
  CLI init --quiet
  CLI index --all --quiet
  CLI spec validate feat-fee --json > "$W/b1v.json" || { cat "$W/b1v.json"; return 1; }
  CLI approve BIL-T1 --stage skeleton --by human > /dev/null
  CLI test --task BIL-T1 --json > /dev/null
  CLI approve BIL-T1 --stage tests --by human > /dev/null
  bf_src '  // 1. add the fee
  return amount + 1;'
  CLI index > /dev/null; CLI test --task BIL-T1 --json > /dev/null
  CLI approve BIL-T1 --stage done --by human --force > /dev/null
  # B = feat-report, created with --before feat-fee (what /hitl:plan does: proposal, then one order note per parent)
  mkdir -p .hitl/changes/feat-report/specs/reporting
  bf_proposal feat-report "Monthly settlement report" reporting REP " | before: feat-fee" skipped > .hitl/changes/feat-report/proposal.md
  cat > .hitl/changes/feat-report/specs/reporting/spec.md <<'EOF'
<!-- audience: business -->
# Delta: Reporting
> capability: reporting | change: feat-report

## Purpose
Reports for finance.

## ADDED Requirements
### Requirement: REP-R1 Monthly report
When a month ends, the system SHALL list every settlement of that month.

#### Scenario: REP-R1.S1 Month listed
- GIVEN two settlements in May
- WHEN the May report is made
- THEN it lists two settlements
EOF
  CLI spec validate feat-report --json > "$W/b1w.json" || { cat "$W/b1w.json"; return 1; }
  expect_exit 1 CLI note add --change feat-fee --source feat-fee --kind order --text "self"
  CLI note add --change feat-fee --source feat-report --kind order --text "Monthly settlement report: feat-fee waits until it is archived." \
    --from "/hitl:plan feat-report --before feat-fee" > "$W/b1a.txt"
  contains "$W/b1a.txt" "⏳ feat-fee now waits for feat-report"
  contains .hitl/changes/feat-fee/notes.md "- source: feat-report"
  # all of A waits: every stage and approver, --force and --ack included
  CLI approve BIL-T2 --stage skeleton --by human --force --json > "$W/b1b.json" && { echo "BIL-T2 approval must be refused"; return 1; } || true
  afile "$W/b1b.json" 'd.ok === false && /⏳ feat-fee waits for feat-report \(N-1\)/.test(d.reasons[0]) && d.blockedBy[0].source === "feat-report"'
  CLI approve BIL-T2 --stage skeleton --by human --ack N-1 --json > "$W/b1c.json" && { echo "--ack must not release a wait"; return 1; } || true
  afile "$W/b1c.json" 'd.reasons.some((r) => /cannot be acked/.test(r))'
  CLI status --json > "$W/b1d.json"
  afile "$W/b1d.json" 'd.tasks["BIL-T2"].wait.for[0].change === "feat-report" && d.next.command === "/hitl:archive feat-report"'
  CLI status --brief > "$W/b1e.txt"
  contains "$W/b1e.txt" "⏳ feat-fee waits for feat-report (N-1)"
  CLI change --json > "$W/b1f.json"
  afile "$W/b1f.json" 'd.changes.find((c) => c.id === "feat-report").blocks[0].change === "feat-fee" && d.changes.find((c) => c.id === "feat-fee").wait.for.length === 1'
  CLI spec archive feat-fee --dry-run --force --json > "$W/b1g.json" && { echo "archive of A must be refused"; return 1; } || true
  afile "$W/b1g.json" 'd.ok === false && /waits for feat-report/.test(d.preconditions.notes.wait[0])'
}
step BF1 "before: B created --before A → order note in A; all of A waits (approvals with --force/--ack, archive); status/brief/change show it" sB1

sB2() {
  cd "$BF"
  # B's plan: the fee rule of A changes → a note in A (A's ids), never an edit of A's files
  local before; before="$(cat .hitl/changes/feat-fee/specs/billing/spec.md .hitl/changes/feat-fee/tasks.md .hitl/changes/feat-fee/proposal.md | sha256sum)"
  CLI note add --change feat-fee --source feat-report --kind spec --refs BIL-R1.S1 \
    --text "The report shows fees of 2. The settlement fee must be 2, not 1." --from "/hitl:plan feat-report" --json > "$W/b2a.json"
  afile "$W/b2a.json" 'd.note.id === "N-2" && d.note.source === "feat-report" && d.blocks.join() === "BIL-T1,BIL-T2"'
  [ "$before" = "$(cat .hitl/changes/feat-fee/specs/billing/spec.md .hitl/changes/feat-fee/tasks.md .hitl/changes/feat-fee/proposal.md | sha256sum)" ] || { echo "A's files changed"; return 1; }
  CLI spec archive feat-report --json > "$W/b2c.json" || { cat "$W/b2c.json"; return 1; }
  afile "$W/b2c.json" 'd.archive.moved && d.archive.unblocked.length === 1 && d.archive.unblocked[0].change === "feat-fee" && d.archive.unblocked[0].amend.map((n) => n.id).join() === "N-2" && d.archive.unblocked[0].stillBlocked === true'
  # the wait is over (the order note cleared), but the unapplied note forces A's amend first
  CLI note list --change feat-fee --status all --json > "$W/b2d.json"
  afile "$W/b2d.json" 'd.changes[0].notes.find((n) => n.id === "N-1").wait === null && d.changes[0].notes.find((n) => n.id === "N-2").wait === "amend"'
  CLI status --json > "$W/b2e.json"
  afile "$W/b2e.json" 'd.next.command === "/hitl:plan feat-fee amend N-2"'
  CLI approve BIL-T2 --stage skeleton --by human --json > "$W/b2f.json" && { echo "BIL-T2 must wait for the amend"; return 1; } || true
  afile "$W/b2f.json" 'd.reasons.some((r) => /📥 N-2 from feat-report \(archived\) is not applied yet/.test(r))'
}
step BF2 "before: B's plan writes a source note into A (A's files untouched); B archived → wait lifts, N-2 forces A's amend" sB2

sB3() {
  cd "$BF"
  sed -i 's/- THEN the result is 11/- THEN the result is 12/' .hitl/changes/feat-fee/specs/billing/spec.md
  sed -i 's/BIL-T1.AC1 (BIL-R1.S1) Given 10 When settle Then 11/BIL-T1.AC1 (BIL-R1.S1) Given 10 When settle Then 12/' .hitl/changes/feat-fee/tasks.md
  CLI note apply --change feat-fee N-2 --impact BIL-R1.S1=behaviour --json > "$W/b3a.json"
  afile "$W/b3a.json" 'd.recheck === "N-3" && d.counts.tests === 1'
  CLI status --json > "$W/b3b.json"
  afile "$W/b3b.json" 'd.next.command === "/hitl:approve feat-fee reopen N-3" && !(d.changes.find((c) => c.id === "feat-fee").wait)'
  CLI approve --change feat-fee --stage reopen --note N-3 --by human --json > "$W/b3c.json"
  afile "$W/b3c.json" 'd.ok && d.reopened[0].task === "BIL-T1" && d.next === "/hitl:test BIL-T1"'
  bf_tests 12
  CLI index > /dev/null; CLI test --task BIL-T1 --json > /dev/null
  CLI approve BIL-T1 --stage tests --by human --json > "$W/b3d.json"
  afile "$W/b3d.json" 'd.ok === true'
  bf_src '  // 1. add the fee
  return amount + 2;'
  CLI index > /dev/null; CLI test --task BIL-T1 --json > /dev/null
  CLI approve BIL-T1 --stage done --by human --force > /dev/null
  CLI status BIL-T1 --json > "$W/b3e.json"
  afile "$W/b3e.json" 'taskStatus(d, "BIL-T1") === "done" && !d.tasks["BIL-T1"].wait'
  CLI approve BIL-T2 --stage skeleton --by human --dry-run --json > "$W/b3f.json" || true
  afile "$W/b3f.json" '!d.reasons.some((r) => /waits for|📥/.test(r))'
}
step BF3 "before: A amends N-2 → recheck → the human reopens → rewritten test red → re-locked → done; BIL-T2 no longer waits" sB3

sB4() {
  cd "$BF"
  mkdir -p .hitl/changes/feat-gone
  bf_proposal feat-gone "Dropped idea" other OTH "" skipped > .hitl/changes/feat-gone/proposal.md
  CLI note add --change feat-fee --source feat-gone --kind order --text "wait for feat-gone" > /dev/null
  rm -rf .hitl/changes/feat-gone
  CLI approve BIL-T2 --stage skeleton --by human --json > "$W/b4a.json" && { echo "a gone source still blocks"; return 1; } || true
  afile "$W/b4a.json" 'd.reasons.some((r) => /feat-gone is gone/.test(r))'
  CLI status --json > "$W/b4b.json"
  afile "$W/b4b.json" 'd.next.command === "/hitl:approve feat-fee dismiss N-4 <reason>"'
  CLI approve --change feat-fee --stage dismiss --note N-4 --reason "feat-gone was dropped" --by human > /dev/null
  CLI status --json > "$W/b4c.json"
  afile "$W/b4c.json" '!d.changes.find((c) => c.id === "feat-fee").wait'
}
step BF4 "before: a source change that is gone keeps A blocked until the human dismisses its note" sB4

sB5() {
  cd "$BF"
  # 0.13.1 /hitl:overlap: feat-fee against two unlinked changes — feat-waive (a task on the same settle) and feat-audit
  # (nothing shared). --with filters the targets; the code section names the shared symbol and file, and drift on
  # feat-fee's locked settle once its body changes.
  mkdir -p .hitl/changes/feat-waive/specs/billing .hitl/changes/feat-audit/specs/audit
  bf_proposal feat-waive "Premium settles free" billing WAV "" included > .hitl/changes/feat-waive/proposal.md
  printf '%s\n' '<!-- audience: business -->' '# Delta: Billing' '> capability: billing | change: feat-waive' '' '## ADDED Requirements' \
    '### Requirement: WAV-R1 Premium settles free' "When a premium customer's charge is settled, the system SHALL NOT add the fee." '' \
    '#### Scenario: WAV-R1.S1 No fee' '- GIVEN a premium amount of 10' '- WHEN it is settled' '- THEN the result is 10' > .hitl/changes/feat-waive/specs/billing/spec.md
  printf '%s\n' '# Premium settles free Tasks' '← Change: feat-waive' '> status: approved' '' '## WAV-T1 Premium settles free' \
    '- prio: P1 | risk: high (money) | impl: agent | blocked-by: none | status: todo' '' '### Acceptance criteria' \
    '- [ ] WAV-T1.AC1 (WAV-R1.S1) Given a premium 10 When settle Then 10' '' '### Symbols' \
    '1. [ ] `settle` | modify | `src/settle.ts` | impl: agent | no fee for premium' > .hitl/changes/feat-waive/tasks.md
  bf_proposal feat-audit "Audit log" audit AUD "" skipped > .hitl/changes/feat-audit/proposal.md
  printf '%s\n' '<!-- audience: business -->' '# Delta: Audit' '> capability: audit | change: feat-audit' '' '## Purpose' 'Who did what.' '' '## ADDED Requirements' \
    '### Requirement: AUD-R1 Sign-in audit' 'When a user signs in, the system SHALL record it.' '' \
    '#### Scenario: AUD-R1.S1 Recorded' '- GIVEN a user' '- WHEN they sign in' '- THEN one audit entry is recorded' > .hitl/changes/feat-audit/specs/audit/spec.md
  CLI overlap feat-fee --with feat-waive,feat-audit --json > "$W/b5a.json"
  afile "$W/b5a.json" 'd.with && d.targets.join() === "feat-audit,feat-waive" && d.candidates.length === 1 && d.candidates[0].other === "feat-waive" && !d.candidates[0].linked'
  afile "$W/b5a.json" '((c) => c.symbols[0].ref === "settle" && c.symbols[0].a.join() === "BIL-T1" && c.symbols[0].b.join() === "WAV-T1" && c.files[0].file === "src/settle.ts" && c.drift.length === 0)(d.candidates[0].code)'
  CLI overlap feat-fee --with feat-audit > "$W/b5b.txt"
  contains "$W/b5b.txt" "✅ feat-fee: no overlap with feat-audit"
  expect_exit 1 CLI overlap feat-fee --with feat-nope
  expect_exit 1 CLI overlap feat-fee --with feat-report        # archived in BF2
  bf_src '  // 1. add the fee
  return amount + 3;'
  CLI index > /dev/null
  CLI overlap feat-fee --with feat-waive --json > "$W/b5c.json"
  afile "$W/b5c.json" '((x) => x.ref === "settle" && x.changed.includes("body") && x.tasks.join() === "BIL-T1" && x.b.join() === "WAV-T1")(d.candidates[0].code.drift[0])'
  CLI overlap feat-fee --with feat-waive > "$W/b5d.txt"
  contains "$W/b5d.txt" "🧩 code: symbols settle (feat-fee BIL-T1 · feat-waive WAV-T1)"
  # the judge's verdict → gate lines; "both sides" writes a source note through the CLI
  mkdir -p .hitl/.inbox
  printf '%s' '{"schema":"hitl.overlap-review/1","change":"feat-fee","targets":["feat-waive"],"findings":[{"id":"O-1","changes":["feat-fee","feat-waive"],"type":"contradiction","given":"a premium amount of 10","when":"it is settled","then":"feat-fee adds the fee, feat-waive does not","quotes":{"feat-fee":"THEN the result is 12","feat-waive":"SHALL NOT add the fee"},"refs":{"feat-fee":["BIL-R1.S1"],"feat-waive":["WAV-R1"]},"source":"feat-waive","affected":["feat-fee"],"adjust":"feat-waive","kind":"spec","confidence":90},{"id":"O-2","changes":["feat-fee","feat-waive"],"given":"x","when":"y","then":"z","quotes":{"feat-fee":"made up text here"},"confidence":95}]}' > .hitl/.inbox/overlap-review.json
  CLI overlap feat-fee --with feat-waive --review --json > "$W/b5e.json"
  afile "$W/b5e.json" 'd.findings.length === 1 && d.findings[0].id === "O-1" && d.dropped[0].id === "O-2" && /^⚠️ 1\. feat-fee \+ feat-waive — .* 3\. not an overlap$/.test(d.findings[0].line) && d.findings[0].notes[0].change === "feat-fee"'
  [ ! -f .hitl/.inbox/overlap-review.json ] || { echo "verdict not removed"; return 1; }
  CLI note add --change feat-fee --source feat-waive --kind spec --refs BIL-R1.S1 --text "Premium settlements pay no fee." --from "/hitl:overlap feat-fee" > "$W/b5f.txt"
  contains "$W/b5f.txt" "⏳ feat-fee now waits for feat-waive"
}
step BF5 "overlap (0.13.1): --with B,C filters targets; code section (shared symbol/file, drift on A's locked symbol); --review keeps witnessed findings; both sides → source note" sB5
