# Mid-change churn (0.9) — sourced by tests/e2e.sh (interface I4).
# A change feat-fee: T-1 (settle) done with locked tests. The fee rule changes mid-change: a note blocks T-2, the amend is
# applied, a recheck note waits, the human reopens (CLI --by human; the hook is tested in unit tests), the test-author's
# rewritten test is red, re-locked, implemented, reviewed and done again. Then archive is refused while a note is open.
CH="$W/churn-app"

ch_src() { # ch_src <body>
  printf '/**\n * Settles a charge: the amount plus the fee.\n * @task T-1 @impl agent @status skeleton @prio 1\n */\nexport function settle(amount: number): number {\n%s\n}\n' "$1" > src/settle.ts
}
ch_tests() { # ch_tests <expected fee for AC2>
  printf 'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { settle } from "../src/settle.ts";\n\ndescribe("settle", () => {\n' > tests/settle.test.ts
  printf '  /** @covers settle @ac T-1.AC1 @kind example @origin test-author */\n  it("T-1.AC1 keeps the amount", () => { assert.equal(settle(0) >= 0, true); });\n' >> tests/settle.test.ts
  printf '  /** @covers settle @ac T-1.AC2 @kind example @origin test-author */\n  it("T-1.AC2 adds the fee", () => { assert.equal(settle(10), %s); });\n});\n' "$1" >> tests/settle.test.ts
}

sC1() {
  mkdir -p "$CH/src" "$CH/tests" "$CH/.hitl/changes/feat-fee/specs/billing"
  cd "$CH"
  git init -q
  printf '{"name":"churn-app","private":true,"type":"module","scripts":{"test":"node --test"}}\n' > package.json
  cat > .hitl/changes/feat-fee/proposal.md <<'EOF'
<!-- audience: business -->
# Settlement fee
> change: feat-fee | status: approved | created: 2026-11-01 | updated: 2026-11-01

## Why
Each settlement costs the business a fixed fee that customers do not pay today.

## What changes
- A settlement adds a fee to the amount.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| billing | BIL | new | +BIL-R1 |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | skipped | one function, no new dependency |
EOF
  cat > .hitl/changes/feat-fee/specs/billing/spec.md <<'EOF'
<!-- audience: business -->
# Delta: Billing
> capability: billing | key: BIL | change: feat-fee

## Purpose
How a charge is settled.

## ADDED Requirements
### Requirement: BIL-R1 Settle with a fee
When a charge is settled, the system SHALL add the settlement fee to the amount.

#### Scenario: BIL-R1.S1 Zero amount
- GIVEN an amount of 0
- WHEN it is settled
- THEN the result is at least 0

#### Scenario: BIL-R1.S2 Fee added
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

## T-1 Settle with a fee
- prio: P0 | risk: high (money) | impl: agent | blocked-by: none | status: todo
**Why**: fee on every settlement

### Acceptance criteria
- [ ] T-1.AC1 (BIL-R1.S1) Given 0 When settle Then at least 0
- [ ] T-1.AC2 (BIL-R1.S2) Given 10 When settle Then 11

### Symbols
1. [ ] `settle` | new | `src/settle.ts` | impl: agent | settle with the fee

## T-2 Record a receipt
- prio: P1 | risk: high (money) | impl: agent | blocked-by: T-1 | status: todo
**Why**: audit

### Acceptance criteria
- [ ] T-2.AC1 (BIL-R2.S1) Given 10 When settle Then one receipt
EOF
  ch_src '  // TODO(impl): 1. add the fee
  throw new Error("TODO(impl): settle");'
  ch_tests 11
  CLI init --quiet
  CLI index --all --quiet
  CLI spec validate feat-fee --json > "$W/c1v.json" || { cat "$W/c1v.json"; return 1; }
  CLI approve T-1 --stage skeleton --by human > /dev/null
  CLI test --task T-1 --json > /dev/null
  CLI approve T-1 --stage tests --by human > /dev/null
  ch_src '  // 1. add the fee
  return amount + 1;'
  CLI index > /dev/null
  CLI test --task T-1 --json > /dev/null
  CLI approve T-1 --stage done --by human --force > /dev/null
  CLI status --json > "$W/c1.json"
  afile "$W/c1.json" 'taskStatus(d, "T-1") === "done" && d.changes[0].notes === null'
}
step CH1 "churn: change feat-fee, T-1 done with 2 locked tests; no notes yet" sC1

sC2() {
  cd "$CH"
  expect_exit 1 CLI note add --change feat-fee --kind spec --refs BIL-R9 --text "x"
  CLI note add --change feat-fee --kind spec --refs BIL-R1.S2 --text "The fee is 2, not 1. Finance changed it." --json > "$W/c2.json"
  afile "$W/c2.json" 'd.note.id === "N-1" && d.blocks.join() === "T-1"'
  contains .hitl/changes/feat-fee/notes.md "- refs: BIL-R1.S2 (Fee added)"
  CLI note add --change feat-fee --kind spec --refs BIL-R2.S1 --text "A receipt also shows the fee." > /dev/null
  CLI approve T-2 --stage skeleton --by human --json > "$W/c2b.json" && { echo "T-2 approval should be refused"; return 1; } || true
  afile "$W/c2b.json" 'd.ok === false && d.blockedBy[0].note === "N-2"'
  CLI status --json > "$W/c2c.json"
  afile "$W/c2c.json" 'd.tasks["T-2"].notes[0].id === "N-2" && d.changes[0].notes.open === 2'
  CLI status --brief > "$W/c2d.txt"
  contains "$W/c2d.txt" "📌 notes: feat-fee 2 open"
  expect_exit 1 CLI note apply --change feat-fee N-1 --impact BIL-R1.S2=behaviour
}
step CH2 "churn: note add (unknown ref refused), T-2 approval blocked by N-2, counts in status; apply refused before the amend" sC2

sC3() {
  cd "$CH"
  sed -i 's/- THEN the result is 11/- THEN the result is 12/' .hitl/changes/feat-fee/specs/billing/spec.md
  sed -i 's/T-1.AC2 (BIL-R1.S2) Given 10 When settle Then 11/T-1.AC2 (BIL-R1.S2) Given 10 When settle Then 12/' .hitl/changes/feat-fee/tasks.md
  CLI note apply --change feat-fee N-1 --impact BIL-R1.S2=behaviour --dry-run --json > "$W/c3a.json"
  afile "$W/c3a.json" 'd.counts.tests === 1 && d.tasks[0].task === "T-1" && d.tasks[0].acs.join() === "T-1.AC2"'
  CLI note apply --change feat-fee N-1 --impact BIL-R1.S2=behaviour --json > "$W/c3b.json"
  afile "$W/c3b.json" 'd.recheck === "N-3"'
  contains .hitl/changes/feat-fee/notes.md "- status: reopen pending"
  CLI status --json > "$W/c3c.json"
  afile "$W/c3c.json" 'd.next.command === "/hitl:approve feat-fee reopen N-3"'
  CLI approve --change feat-fee --stage reopen --note N-3 --by human --json > "$W/c3d.json"
  afile "$W/c3d.json" 'd.ok && d.reopened[0].task === "T-1" && d.reopened[0].tests.length === 1 && d.next === "/hitl:test T-1"'
  afile "$LOCK" 'Object.values(d.tests).filter((t) => t.stage === "reopened").length === 1 && d.tasks["T-1"].doneAt === null && d.tasks["T-1"].reopened[0].prev.doneAt'
  CLI status T-1 --json > "$W/c3e.json"
  afile "$W/c3e.json" 'taskStatus(d, "T-1") === "reopened" && d.tasks["T-1"].next === "/hitl:test T-1" && d.tasks["T-1"].reopen.acs.join() === "T-1.AC2"'
  CLI context T-1 --contract > "$W/c3f.md"
  contains "$W/c3f.md" "## Reopened (N-3)"
  CLI drift --json > "$W/c3g.json"
  afile "$W/c3g.json" '!d.items.some((i) => ["TEST_CHANGED", "TEST_DELETED"].includes(i.code))'
}
step CH3 "churn: amend + note apply → recheck N-3; the human reopens: AC2's test only, done record into history, T-1 reopened → /hitl:test" sC3

sC4() {
  cd "$CH"
  # the test-author rewrites AC2 (12); a rewrite that still passes is refused
  ch_tests 11
  sed -i 's/adds the fee", () => { assert.equal(settle(10), 11)/adds the fee", () => { assert.equal(settle(10) > 10, true)/' tests/settle.test.ts
  CLI index > /dev/null; CLI test --task T-1 --json > /dev/null
  CLI approve T-1 --stage tests --by human --json > "$W/c4a.json" && { echo "a passing rewrite must be refused"; return 1; } || true
  afile "$W/c4a.json" 'd.reasons.some((r) => /passes against the current code/.test(r))'
  ch_tests 12
  CLI index > /dev/null; CLI test --task T-1 --json > /dev/null
  CLI approve T-1 --stage tests --by human --json > "$W/c4b.json"
  afile "$W/c4b.json" 'd.ok === true'
  CLI status T-1 --json > "$W/c4c.json"
  afile "$W/c4c.json" 'taskStatus(d, "T-1") === "red" && d.tasks["T-1"].next === "/hitl:implement T-1"'
  ch_src '  // 1. add the fee
  return amount + 2;'
  CLI index > /dev/null; CLI test --task T-1 --json > /dev/null
  CLI approve T-1 --stage done --by human --force > /dev/null
  afile "$LOCK" 'd.tasks["T-1"].doneAt && d.tasks["T-1"].reopened[0].closedAt && Object.values(d.tests).every((t) => t.stage === "locked")'
  CLI status T-1 --json > "$W/c4d.json"
  afile "$W/c4d.json" 'taskStatus(d, "T-1") === "done"'
}
step CH4 "churn: rewritten test must be red to re-lock; red → implement → done closes the reopen" sC4

sC5() {
  cd "$CH"
  CLI spec archive feat-fee --dry-run --force --json > "$W/c5a.json" && { echo "archive must be refused with an open note"; return 1; } || true
  afile "$W/c5a.json" 'd.ok === false && d.preconditions.notes.open.map((n) => n.id).join() === "N-2"'
  CLI approve --change feat-fee --stage dismiss --note N-2 --reason "Receipts stay as they are" --by human > /dev/null
  contains .hitl/changes/feat-fee/notes.md "- reason: Receipts stay as they are"
  CLI spec archive feat-fee --dry-run --force --json > "$W/c5b.json" || true
  afile "$W/c5b.json" '!d.preconditions.notes || d.preconditions.notes.open.length === 0'
}
step CH5 "churn: an open note blocks archive (even --force); the human dismisses it" sC5
