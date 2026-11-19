# Amend brief + amend task set (0.17) — sourced by tests/e2e.sh (interface I4).
# A change feat-reset (key RST) with RST-T1 done (issueLink + sweepExpired, 2 locked tests), RST-T2 in progress (useLink:
# skeleton and tests locked, red) and RST-T3 todo (lock-out). The requirement changes: links last 15 minutes, expired
# links are refused on use (no hourly sweep), no lock-out. `amend start` routes it to an amend brief with the facts;
# touched tasks are held; the approved amendment writes the amend task set (RST-T2 reopened in place, RST-T3 dropped,
# RST-T4 switch takes over RST-T1's test, RST-T5 contract removes sweepExpired and deletes its test, superseded ACs on
# RST-T1); the checks pass; `note apply --amend` keeps RST-T1 done and lists the take-overs; the human reopens; RST-T4
# and RST-T5 go to done while RST-T1 stays done.
AM="$W/amend-app"
AMT=.hitl/changes/feat-reset/tasks.md
AMB=.hitl/changes/feat-reset/amend-RST-A1-brief.md

am_src() { # am_src <issueLink body> <useLink body> [with-sweep]
  {
    printf '/**\n * Issues a reset link for an email.\n * @task RST-T1%s @impl agent @status skeleton @prio 1\n */\nexport function issueLink(email: string): { email: string; ttlMinutes: number } {\n%s\n}\n\n' "${4:-}" "$1"
    printf '/**\n * Accepts a link younger than its time to live.\n * @task RST-T2 @impl agent @status skeleton @prio 1\n */\nexport function useLink(ttlMinutes: number, ageMinutes: number): boolean {\n%s\n}\n' "$2"
    if [ -n "${3:-}" ]; then
      printf '\n/**\n * Drops expired links.\n * @task RST-T1 @impl agent @status skeleton @prio 2\n */\nexport function sweepExpired(links: { ttlMinutes: number }[]): number {\n%s\n}\n' "$3"
    fi
  } > src/reset.ts
}
AM_ISSUE_STUB='  // TODO(impl): 1. build the link
  throw new Error("TODO(impl): issueLink");'
AM_USE_STUB='  // TODO(impl): 1. compare the age with the time to live
  throw new Error("TODO(impl): useLink");'
AM_SWEEP_STUB='  // TODO(impl): 1. count the links to drop
  throw new Error("TODO(impl): sweepExpired");'

am_tests() { # am_tests <issue ac> <issue ttl> [with-sweep]
  {
    printf 'import { describe, it } from "node:test";\nimport assert from "node:assert/strict";\nimport { issueLink, useLink%s } from "../src/reset.ts";\n\ndescribe("reset links", () => {\n' "${3:+, sweepExpired}"
    printf '  /**\n   * @covers issueLink @ac %s @kind example @origin test-author\n   * @catches the link lives longer than the rule allows\n   */\n  it("issues a link with the time to live of the rule", () => { assert.equal(issueLink("a@x.io").ttlMinutes, %s); });\n' "$1" "$2"
    printf '  /**\n   * @covers useLink @ac RST-T2.AC1 @kind example @origin test-author\n   * @catches an expired link still resets the password\n   */\n  it("refuses an expired link", () => { assert.equal(useLink(15, 20), false); });\n'
    if [ -n "${3:-}" ]; then
      printf '  /**\n   * @covers sweepExpired @ac RST-T1.AC2 @kind example @origin test-author\n   * @catches expired links stay stored\n   */\n  it("sweeps expired links", () => { assert.equal(sweepExpired([{ ttlMinutes: 0 }]), 1); });\n'
    fi
    printf '});\n'
  } > tests/reset.test.ts
}

sAM1() {
  mkdir -p "$AM/src" "$AM/tests" "$AM/.hitl/changes/feat-reset/specs/accounts"
  cd "$AM"
  git init -q
  printf '{"name":"amend-app","private":true,"type":"module","scripts":{"test":"node --test"}}\n' > package.json
  cat > .hitl/changes/feat-reset/proposal.md <<'EOF'
<!-- audience: business -->
# Password reset links
> change: feat-reset | key: RST | status: approved | created: 2026-11-20 | updated: 2026-11-20

## Why
Users who forget their password call support.

## What changes
- A user gets a reset link by email and sets a new password with it.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| accounts | RST | new | +RST-R1 +RST-R2 +RST-R3 |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | skipped | small change |
EOF
  cat > .hitl/changes/feat-reset/specs/accounts/spec.md <<'EOF'
<!-- audience: business -->
# Delta: Accounts
> capability: accounts | change: feat-reset

## Purpose
How users get back into their account.

## ADDED Requirements
### Requirement: RST-R1 Issue a reset link
When a user asks for a password reset, the system SHALL email a reset link.

#### Scenario: RST-R1.S1 Link lifetime
- GIVEN a registered user
- WHEN a reset is requested
- THEN the link is valid for 60 minutes

#### Scenario: RST-R1.S2 Expired links are swept
- GIVEN an expired link
- WHEN the hourly sweep runs
- THEN the link is deleted

### Requirement: RST-R2 Use a reset link
When a user opens a reset link, the system SHALL refuse it once it is older than its lifetime.

#### Scenario: RST-R2.S1 Old link refused
- GIVEN a link older than its lifetime
- WHEN the user opens it
- THEN the reset is refused

### Requirement: RST-R3 Lock out after failures
When a user fails five resets in a row, the system SHALL lock the account.

#### Scenario: RST-R3.S1 Fifth failure locks
- GIVEN four failed resets
- WHEN a fifth reset fails
- THEN the account is locked
EOF
  cat > "$AMT" <<'EOF'
# Password reset links Tasks

← Change: feat-reset

> status: approved

## RST-T1 Issue a reset link

- prio: P0 | risk: high (security) | impl: agent | blocked-by: none | status: todo

**Why**: users get back in (RST-R1)

### Acceptance criteria

- [ ] RST-T1.AC1 (RST-R1.S1) Given a user When a reset is requested Then the link is valid for 60 minutes
- [ ] RST-T1.AC2 (RST-R1.S2) Given an expired link When the sweep runs Then it is deleted

### Symbols

1. [ ] `issueLink` | new | `src/reset.ts` | impl: agent | issues the link
2. [ ] `sweepExpired` | new | `src/reset.ts` | impl: agent | drops expired links

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | new: the link lives longer than the rule allows | example | spec | issueLink | test-author |
| AC2 | new: expired links stay stored | example | spec | sweepExpired | test-author |

## RST-T2 Use a reset link

- prio: P1 | risk: high (security) | impl: agent | blocked-by: RST-T1 | status: todo

### Acceptance criteria

- [ ] RST-T2.AC1 (RST-R2.S1) Given a link older than its lifetime When it is opened Then the reset is refused

### Symbols

1. [ ] `useLink` | new | `src/reset.ts` | impl: agent | checks the age

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | new: an expired link still resets the password | example | spec | useLink | test-author |

## RST-T3 Lock out after failures

- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo

### Acceptance criteria

- [ ] RST-T3.AC1 (RST-R3.S1) Given four failures When a fifth fails Then the account locks

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | new: the account stays open after five failures | example | spec | lockout | test-author |
EOF
  am_src "$AM_ISSUE_STUB" "$AM_USE_STUB" "$AM_SWEEP_STUB"
  am_tests RST-T1.AC1 60 sweep
  CLI init --quiet
  CLI index --all --quiet
  CLI spec validate feat-reset --json > "$W/am1v.json" || { cat "$W/am1v.json"; return 1; }
  # RST-T1: skeleton → red tests → code → done
  CLI approve RST-T1 --stage skeleton --by human > /dev/null
  CLI test --task RST-T1 --json > /dev/null
  CLI approve RST-T1 --stage tests --by human > /dev/null
  am_src '  // 1. build the link
  return { email, ttlMinutes: 60 };' "$AM_USE_STUB" '  // 1. count the links to drop
  return links.filter((l) => l.ttlMinutes <= 0).length;'
  CLI index > /dev/null
  CLI test --task RST-T1 --json > /dev/null
  CLI approve RST-T1 --stage done --by human --force > /dev/null
  # RST-T2: skeleton and tests locked, still red (in progress)
  CLI approve RST-T2 --stage skeleton --by human > /dev/null
  CLI test --task RST-T2 --json > /dev/null
  CLI approve RST-T2 --stage tests --by human > /dev/null
  CLI status --json > "$W/am1.json"
  afile "$W/am1.json" 'taskStatus(d, "RST-T1") === "done" && taskStatus(d, "RST-T2") === "red" && taskStatus(d, "RST-T3") === "todo"'
}
step AM1 "amend: change feat-reset with RST-T1 done, RST-T2 in progress (tests locked, red), RST-T3 todo" sAM1

sAM2() {
  cd "$AM"
  CLI note add --change feat-reset --kind spec --refs RST-R1.S1,RST-R1.S2,RST-R2.S1,RST-R3.S1 --text "Links last 15 minutes. An expired link is refused on use, so the hourly sweep goes. No lock-out." > /dev/null
  # wording only → chat gate; a behaviour class → the amend brief
  CLI amend start feat-reset --from N-1 --impact "RST-R1.S1=wording,RST-R1.S2=wording,RST-R2.S1=wording,RST-R3.S1=wording" --json | aj 'd.route === "chat" && d.chat === "gate"'
  CLI amend start feat-reset --from N-1 --impact "RST-R1.S1=behaviour" --json > "$W/am2.json"
  afile "$W/am2.json" 'd.route === "brief" && d.amend === "RST-A1" && d.file === ".hitl/changes/feat-reset/amend-RST-A1-brief.md"'
  afile "$W/am2.json" 'JSON.stringify(d.tasks.map((t) => [t.id, t.rule])) === JSON.stringify([["RST-T1", "keep-done"], ["RST-T2", "reopen"], ["RST-T3", "edit"]])'
  afile "$W/am2.json" 'd.affected.acs.length === 4 && d.affected.tests.length === 3 && d.affected.tests.every((t) => t.owner) && d.affected.tests.filter((t) => t.done).length === 2'
  CLI amend start feat-reset --from N-1 --impact "RST-R1.S1=behaviour" --write --json | aj 'd.written === true'
  contains "$AMB" "> change: feat-reset | key: RST | kind: amend | amend: RST-A1 | from: N-1 | refs: RST-R1.S1, RST-R1.S2, RST-R2.S1, RST-R3.S1"
  contains "$AMB" "done: never reopened; a new task takes over"
  # touched, not-done tasks are held; the done task is not; next points at the brief once only held tasks are left
  CLI status --json > "$W/am2s.json"
  afile "$W/am2s.json" 'd.tasks["RST-T2"].amendHold.amend === "RST-A1" && d.tasks["RST-T3"].amendHold && !d.tasks["RST-T1"].amendHold'
  afile "$W/am2s.json" 'd.next.command === "answer .hitl/changes/feat-reset/amend-RST-A1-brief.md, then /hitl:plan feat-reset amend" || d.next.command === "/hitl:plan feat-reset amend"'
  CLI status > "$W/am2t.txt"
  contains "$W/am2t.txt" "_Held:_ RST-A1"
}
step AM2 "amend: amend start routes (wording → chat, behaviour → brief), writes the brief with the facts; touched tasks are held" sAM2

sAM3() {
  cd "$AM"
  # what the skill writes after the Y under the amend brief's Close question (shared/amend-spec.md §4.4)
  node -e '
    const fs = require("fs");
    const d = ".hitl/changes/feat-reset/specs/accounts/spec.md";
    let s = fs.readFileSync(d, "utf8");
    s = s.replace("THEN the link is valid for 60 minutes", "THEN the link is valid for 15 minutes");
    s = s.replace(/#### Scenario: RST-R1\.S2[\s\S]*?(?=### Requirement: RST-R2)/, "");
    s = s.replace(/### Requirement: RST-R3[\s\S]*$/, "");
    fs.writeFileSync(d, s);
    const t = ".hitl/changes/feat-reset/tasks.md";
    let x = fs.readFileSync(t, "utf8");
    x = x.replace(/(- \[[ x]\] RST-T1\.AC2 [^\n]*)/, "$1\n- superseded: RST-T1.AC1 → RST-T4.AC1 (RST-A1)\n- superseded: RST-T1.AC2 → RST-T5 (RST-A1)");
    x = x.replace("blocked-by: RST-T1 | status:", "blocked-by: RST-T1 | amend: RST-A1 | kind: switch | status:");
    x = x.replace("Given a link older than its lifetime When it is opened Then the reset is refused", "Given a link 20 minutes old When it is opened Then the reset is refused");
    x += `
## RST-T4 Links last 15 minutes

- prio: P0 | risk: high (security) | impl: agent | blocked-by: none | amend: RST-A1 | kind: switch | status: todo

### Acceptance criteria

- [ ] RST-T4.AC1 (RST-R1.S1) Given a user When a reset is requested Then the link is valid for 15 minutes

### Symbols

1. [ ] \`issueLink\` | modify | \`src/reset.ts\` | impl: agent | 15 minute lifetime

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | rewrite: RST-T1.AC1 | example | spec | issueLink | test-author |

## RST-T5 Remove the hourly sweep

- prio: P2 | risk: low | impl: agent | blocked-by: RST-T2, RST-T4 | amend: RST-A1 | kind: contract | status: todo

### Acceptance criteria

- [ ] RST-T5.AC1 Given the switch to refusal on use When the code is read Then no sweep exists and its test is gone

### Symbols

1. [ ] \`sweepExpired\` | remove | \`src/reset.ts\` | impl: agent | dead after refusal on use

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | rewrite: RST-T1.AC2 | — | — | — | test-author |
`;
    fs.writeFileSync(t, x);
    const b = ".hitl/changes/feat-reset/amend-RST-A1-brief.md";
    let y = fs.readFileSync(b, "utf8").replace("| transition: — |", "| transition: branch |").replace("| status: open |", "| status: done |");
    y += "\n## Round 1 ✅\n\n### Q1 [R] What changes?\n\n_Rec:_ 15 minutes; refuse on use; no lock-out\n\n> Y\n\n→ recorded: settled (applies at approval)\n\n### Q2 [D] Transition: only in this branch, merged, or released?\n\n_Rec:_ 1\n\n> Y\n\n→ recorded: settled (applies at approval)\n\n## Close\n\n### Approve the amendment? (Y/n) (needs its own Y)\n\n> Y\n\n→ approved 2026-11-20\n";
    fs.writeFileSync(b, y);'
  CLI tasks drop RST-T3 --reason "lock-out is no longer wanted" --amend RST-A1 --json | aj 'd.ok && d.status === "dropped"'
  CLI index > /dev/null
  CLI spec validate feat-reset --json > "$W/am3v.json" || { cat "$W/am3v.json"; return 1; }
  CLI tasks --check --json > "$W/am3c.json" || { cat "$W/am3c.json" | head -c 2000; return 1; }
  CLI amend check feat-reset --amend RST-A1 --json > "$W/am3a.json" || { cat "$W/am3a.json"; return 1; }
  afile "$W/am3a.json" 'd.errors.length === 0 && d.amends[0].transition === "branch" && d.amends[0].tasks.join() === "RST-T2,RST-T4,RST-T5"'
  CLI trace feat-reset --json > "$W/am3t.json"
  afile "$W/am3t.json" 'd.counts.block === 0 && d.items.some((i) => i.code === "AC_SUPERSEDED" && i.ref === "RST-T1.AC1") && d.items.some((i) => i.code === "TASK_DROPPED")'
  # an out-of-order contract (not blocked by the switch) is refused by both checks
  sed -i 's/blocked-by: RST-T2, RST-T4 | amend: RST-A1 | kind: contract/blocked-by: RST-T2 | amend: RST-A1 | kind: contract/' "$AMT"
  expect_exit 1 CLI amend check feat-reset --json > "$W/am3o.json"
  contains "$W/am3o.json" "AMEND_ORDER: RST-T5 (contract) must come after RST-T4 (switch) in RST-A1: add blocked-by RST-T4"
  sed -i 's/blocked-by: RST-T2 | amend: RST-A1 | kind: contract/blocked-by: RST-T2, RST-T4 | amend: RST-A1 | kind: contract/' "$AMT"
  # record: the note is applied; RST-T1 stays done; RST-T2's tests reopen; RST-T4 and RST-T5 take over RST-T1's tests
  CLI note apply --change feat-reset --amend RST-A1 --impact "RST-R1.S1=behaviour,RST-R1.S2=behaviour,RST-R2.S1=behaviour,RST-R3.S1=behaviour" --json > "$W/am3n.json"
  afile "$W/am3n.json" 'd.ok && d.notes.join() === "N-1" && d.recheck === "N-2" && d.tasks.find((x) => x.task === "RST-T1").kept === "done" && d.tasks.find((x) => x.task === "RST-T2").reopen === "tests"'
  afile "$W/am3n.json" 'd.takeovers.map((x) => x.task + "<" + x.from.join()).join(" ") === "RST-T4<RST-T1 RST-T5<RST-T1"'
  contains .hitl/changes/feat-reset/notes.md "RST-T4 takes over 1 test(s) from RST-T1"
  CLI status --json | aj '!d.tasks["RST-T2"].amendHold && d.next.command === "/hitl:approve feat-reset reopen N-2"'
}
step AM3 "amend: the approved amend set (reopen in place, drop, superseded, switch + contract with rewrite: rows) passes the checks; note apply keeps the done task and lists take-overs" sAM3

sAM4() {
  cd "$AM"
  CLI approve --change feat-reset --stage reopen --note N-2 --by human --json > "$W/am4.json"
  afile "$W/am4.json" 'd.ok && d.reopened.map((r) => r.task + ":" + r.stage).join() === "RST-T4:takeover,RST-T5:takeover,RST-T2:tests"'
  afile "$LOCK" 'd.tasks["RST-T1"].doneAt && d.tasks["RST-T1"].takenOver.length === 2 && Object.values(d.tests).filter((t) => t.takenFrom && t.takenFrom.task === "RST-T1" && t.stage === "reopened").map((t) => t.task).sort().join() === "RST-T4,RST-T5"'
  CLI status --json > "$W/am4s.json"
  afile "$W/am4s.json" 'taskStatus(d, "RST-T1") === "done" && taskStatus(d, "RST-T2") === "reopened" && d.tasks["RST-T2"].next === "/hitl:test RST-T2" && taskStatus(d, "RST-T3") === "dropped"'
  CLI context RST-T4 > "$W/am4c.md"
  contains "$W/am4c.md" "## Amendment RST-A1 — switch"
  contains "$W/am4c.md" "## Taken over"
  contains "$W/am4c.md" "history words"
}
step AM4 "amend: the human's reopen moves RST-T1's tests to RST-T4/RST-T5 (RST-T1 stays done) and reopens RST-T2's test; the contract pack shows the take-over" sAM4

sAM5() {
  cd "$AM"
  # RST-T4: claim issueLink with a step of its own, approve the skeleton, rewrite the taken-over test (red), lock, build
  am_src '  // 1. build the link
  // TODO(impl RST-T4): 2. use the 15 minute lifetime
  return { email, ttlMinutes: 60 };' '  // TODO(impl): 1. compare the age with the time to live
  throw new Error("TODO(impl): useLink");' '  // 1. count the links to drop
  return links.filter((l) => l.ttlMinutes <= 0).length;' ", RST-T4"
  CLI index > /dev/null
  CLI approve RST-T4 --stage skeleton --by human --json > "$W/am5a.json" || { cat "$W/am5a.json"; return 1; }
  CLI test --task RST-T4 --json > /dev/null
  expect_exit 1 CLI approve RST-T4 --stage tests --by human --json > "$W/am5b.json"
  contains "$W/am5b.json" "RST-T4.AC1 rewrite: the taken-over test(s) still carry the old @ac"
  am_tests RST-T4.AC1 15 sweep
  CLI index > /dev/null
  CLI test --task RST-T4 --json > /dev/null
  CLI approve RST-T4 --stage tests --by human --json > "$W/am5c.json" || { cat "$W/am5c.json"; return 1; }
  afile "$W/am5c.json" 'd.ok && d.red.some((r) => r.ac.includes("RST-T4.AC1") && r.result === "assertion-failed")'
  am_src '  // 1. build the link
  // 2. use the 15 minute lifetime
  return { email, ttlMinutes: 15 };' '  // TODO(impl): 1. compare the age with the time to live
  throw new Error("TODO(impl): useLink");' '  // 1. count the links to drop
  return links.filter((l) => l.ttlMinutes <= 0).length;' ", RST-T4"
  CLI index > /dev/null
  CLI test --task RST-T4 --json > /dev/null
  CLI approve RST-T4 --stage done --by human --force --json | aj 'd.ok'
  CLI status --json | aj 'taskStatus(d, "RST-T4") === "done" && taskStatus(d, "RST-T1") === "done"'
}
step AM5 "amend: RST-T4 (switch) rewrites the taken-over test to its AC (old @ac refused), locks it red, builds, done; RST-T1 stays done" sAM5

sAM6() {
  cd "$AM"
  CLI status --json | aj 'taskStatus(d, "RST-T5") === "todo" && d.tasks["RST-T5"].removePending.length === 1'
  expect_exit 1 CLI approve RST-T5 --stage done --by human --json > "$W/am6a.json"
  contains "$W/am6a.json" "REMOVE_STILL_PRESENT: sweepExpired (a remove row of RST-T5) still exists in src/reset.ts"
  # the contract task deletes the symbol and the taken-over test of the removed scenario
  am_src '  // 1. build the link
  // 2. use the 15 minute lifetime
  return { email, ttlMinutes: 15 };' '  // TODO(impl): 1. compare the age with the time to live
  throw new Error("TODO(impl): useLink");' "" ", RST-T4"
  am_tests RST-T4.AC1 15
  CLI index > /dev/null
  CLI drift --json > "$W/am6d.json" || true
  afile "$W/am6d.json" 'd.items.some((i) => i.code === "REMOVED_BY_TASK" && i.task === "RST-T5") && !d.items.some((i) => i.code === "DELETED_LOCKED")'
  CLI status --json | aj 'taskStatus(d, "RST-T5") === "green" && !d.tasks["RST-T5"].removePending'
  CLI approve RST-T5 --stage skeleton --by human --json | aj 'd.ok'
  CLI approve RST-T5 --stage tests --by human --json | aj 'd.ok'
  CLI approve RST-T5 --stage done --by human --json | aj 'd.ok'
  afile "$LOCK" '!Object.keys(d.symbols).some((k) => k.endsWith("#sweepExpired")) && !Object.values(d.tests).some((t) => t.task === "RST-T5")'
  CLI status --json > "$W/am6s.json"
  afile "$W/am6s.json" '["RST-T1", "RST-T4", "RST-T5"].every((T) => taskStatus(d, T) === "done") && taskStatus(d, "RST-T3") === "dropped" && taskStatus(d, "RST-T2") === "reopened"'
  CLI tasks --check > /dev/null
}
step AM6 "amend: RST-T5 (contract) refused at done while sweepExpired exists; deleted with its test (planned removal is info, not drift) → done; lock pruned" sAM6
