# Amend step 2 (0.18): a released amendment — sourced by tests/e2e.sh (interface I4).
# A change feat-ttl (key TTL) with TTL-T1 done: saveReset (@dec TTL-D1, "a reset record keeps its lifetime in hours")
# has two callers outside the change, postReset (tested) and resendAll, and main calls postReset. The design changes:
# the record stores an expiry timestamp, and the hour field is released (stored rows exist). `amend start` lists the
# callers (dependency pass, 1 hop; 2 hops with --depth 2) and the data-model entity; the released amend set (expand →
# migrate → switch → contract, **Temp**: items, deploy groups) is checked: a caller without a task or an Unchanged line,
# a temp item no contract removes, and a contract in the same deploy as the expand are refused; history wording in the
# rewritten docstring is a warning in drift, intents, l0 and amend check, never a block.
RL="$W/released-app"
RLT=.hitl/changes/feat-ttl/tasks.md
RLB=.hitl/changes/feat-ttl/amend-TTL-A1-brief.md

rl_src() { # rl_src <saveReset intent> <saveReset body> [task list]
  {
    printf '/**\n * %s\n * @task %s @impl agent @status skeleton @prio 1 @dec TTL-D1\n */\nexport function saveReset(email: string): ResetRecord {\n%s\n}\n\n' "$1" "${3:-TTL-T1}" "$2"
    printf 'export type ResetRecord = { email: string; ttlHours: number };\n'
  } > src/store.ts
  printf 'import { saveReset } from "./store.ts";\n\n/** Handles a reset request from the web form. */\nexport function postReset(email: string): boolean {\n  return saveReset(email).email === email;\n}\n' > src/http.ts
  printf 'import { saveReset } from "./store.ts";\n\n/** Sends every pending reset again. */\nexport function resendAll(emails: string[]): number {\n  return emails.map((e) => saveReset(e)).length;\n}\n' > src/cron.ts
  printf 'import { postReset } from "./http.ts";\n\n/** Starts the app. */\nexport function main(): boolean {\n  return postReset("a@x.io");\n}\n' > src/app.ts
}
RL_STUB='  // TODO(impl): 1. build the record
  throw new Error("TODO(impl): saveReset");'

sRL1() {
  mkdir -p "$RL/src" "$RL/tests" "$RL/.hitl/changes/feat-ttl/specs/accounts"
  cd "$RL"
  git init -q
  printf '{"name":"released-app","private":true,"type":"module","scripts":{"test":"node --test"}}\n' > package.json
  cat > .hitl/changes/feat-ttl/proposal.md <<'EOF'
<!-- audience: business -->
# Reset records
> change: feat-ttl | key: TTL | status: approved | created: 2026-11-20 | updated: 2026-11-20

## Why
Reset links must expire.

## What changes
- A reset request is stored with its lifetime.

## Capabilities
| capability | key | change | requirements |
|---|---|---|---|
| accounts | TTL | new | +TTL-R1 |

## Artifacts
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | included | stored data |
EOF
  cat > .hitl/changes/feat-ttl/specs/accounts/spec.md <<'EOF'
<!-- audience: business -->
# Delta: Accounts
> capability: accounts | change: feat-ttl

## Purpose
How users get back into their account.

## ADDED Requirements
### Requirement: TTL-R1 Store a reset request
When a user asks for a password reset, the system SHALL store the request with its lifetime.

#### Scenario: TTL-R1.S1 Stored lifetime
- GIVEN a registered user
- WHEN a reset is requested
- THEN the stored request lives for one hour
EOF
  cat > .hitl/changes/feat-ttl/design.md <<'EOF'
<!-- audience: dev -->
# Design: Reset records
> change: feat-ttl | status: approved | updated: 2026-11-20

## Decisions
| id | decision | why | alternatives | cost if wrong | serves | status |
|----|----------|-----|--------------|---------------|--------|--------|
| TTL-D1 | A reset record keeps its lifetime in hours | simple | an expiry timestamp | wrong expiry | TTL-R1 | accepted |

## Changelog
EOF
  cat > .hitl/changes/feat-ttl/data-model.md <<'EOF'
<!-- audience: dev -->

# Data model: Reset records

> change: feat-ttl | updated: 2026-11-20

## Entities

### Reset record

| field    | type   | constraints | notes          |
| -------- | ------ | ----------- | -------------- |
| email    | string | required    |                |
| ttlHours | number | required    | lifetime hours |
EOF
  cat > "$RLT" <<'EOF'
# Reset records Tasks

← Change: feat-ttl

> status: approved

## TTL-T1 Store a reset request

- prio: P0 | risk: high (data) | impl: agent | blocked-by: none | status: todo

**Why**: a record per request (TTL-D1)

### Acceptance criteria

- [ ] TTL-T1.AC1 (TTL-R1.S1) Given a user When a reset is requested Then the stored request lives for one hour

### Symbols

1. [ ] `saveReset` | new | `src/store.ts` | impl: agent | stores the request

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | new: the stored request lives longer than an hour | example | spec | saveReset | test-author |
EOF
  rl_src "Stores a reset request with its lifetime in hours." "$RL_STUB"
  cat > tests/store.test.ts <<'EOF'
import { it } from "node:test";
import assert from "node:assert/strict";
import { saveReset } from "../src/store.ts";
import { postReset } from "../src/http.ts";

/**
 * @covers saveReset @ac TTL-T1.AC1 @kind example @origin test-author
 * @catches the stored request lives longer than an hour
 */
it("stores a one hour lifetime", () => { assert.equal(saveReset("a@x.io").ttlHours, 1); });
/**
 * @covers postReset @kind regression @origin human
 * @catches the web form no longer stores the request
 */
it("posts a reset from the web form", () => { assert.equal(postReset("a@x.io"), true); });
EOF
  CLI init --quiet
  CLI index --all --quiet
  CLI spec validate feat-ttl --json > "$W/rl1v.json" || { cat "$W/rl1v.json"; return 1; }
  CLI approve TTL-T1 --stage skeleton --by human > /dev/null
  CLI test --task TTL-T1 --json > /dev/null
  CLI approve TTL-T1 --stage tests --by human > /dev/null
  rl_src "Stores a reset request with its lifetime in hours." '  // 1. build the record
  return { email, ttlHours: 1 };'
  CLI index > /dev/null
  CLI test --task TTL-T1 --json > /dev/null
  CLI approve TTL-T1 --stage done --by human --force > /dev/null
  CLI status --json | aj 'taskStatus(d, "TTL-T1") === "done"'
}
step RL1 "released amend: change feat-ttl with TTL-T1 done; saveReset (@dec TTL-D1) has callers postReset (tested) and resendAll; main calls postReset" sRL1

sRL2() {
  cd "$RL"
  CLI note add --change feat-ttl --kind design --refs TTL-D1 --text "Store an expiry timestamp instead of hours; stored rows with hours exist (released)." > /dev/null
  CLI amend start feat-ttl --from N-1 --impact "TTL-D1=contract" --json > "$W/rl2.json"
  afile "$W/rl2.json" 'd.route === "brief" && d.amend === "TTL-A1" && d.affected.calls.depth === 1'
  afile "$W/rl2.json" 'JSON.stringify(d.affected.calls.seeds.map((s) => [s.name, s.via])) === JSON.stringify([["saveReset", ["@dec TTL-D1"]]])'
  afile "$W/rl2.json" 'JSON.stringify(d.affected.calls.callers.map((c) => [c.name, c.via])) === JSON.stringify([["resendAll", "calls saveReset"], ["postReset", "calls saveReset"]])'
  afile "$W/rl2.json" 'd.affected.calls.tests.some((t) => t.title === "posts a reset from the web form" && t.via === "covers postReset")'
  afile "$W/rl2.json" 'd.affected.calls.entities.length === 1 && d.affected.calls.entities[0].name === "Reset record" && /saveReset \(signature/.test(d.affected.calls.entities[0].via)'
  # depth is a parameter: 2 hops reach main through postReset
  CLI amend start feat-ttl --from N-1 --impact "TTL-D1=contract" --depth 2 --json | aj 'd.affected.calls.callers.some((c) => c.name === "main" && c.hop === 2 && /2 hops from saveReset/.test(c.via))'
  expect_exit 2 CLI amend start feat-ttl --depth 0
  CLI amend start feat-ttl --from N-1 --impact "TTL-D1=contract" --write --json | aj 'd.written === true'
  contains "$RLB" "### Reached through calls (1 hop)"
  contains "$RLB" "- Caller: postReset — calls saveReset; 1 test(s)"
  contains "$RLB" "- Caller: resendAll — calls saveReset; no test covers it"
  contains "$RLB" "- Data: Reset record (data-model.md) — named in saveReset (signature"
  if [ -x "$HOME/.local/share/nvim/mason/bin/prettier" ]; then "$HOME/.local/share/nvim/mason/bin/prettier" --check --no-config --ignore-path "" "$RLB"; fi
}
step RL2 "released amend: amend start lists the callers of the changed symbol (1 hop; main at --depth 2), their test and the data-model entity in ### Reached through calls" sRL2

sRL3() {
  cd "$RL"
  # what the skill writes after the Y under the Close question: a released set (shared/formats/parallel-change.md §2.1)
  node -e '
    const fs = require("fs");
    const t = ".hitl/changes/feat-ttl/tasks.md";
    let x = fs.readFileSync(t, "utf8");
    x += `
## TTL-T2 Store the expiry timestamp beside the hours

- prio: P1 | risk: high (data) | impl: agent | blocked-by: none | amend: TTL-A1 | kind: expand | deploy: 1 | status: todo

**Temp**: dual-write-expiry (data) — saveReset writes expiresAt and ttlHours both
**Temp**: ttl-hours-field (data) — the hour field, read until the switch

### Acceptance criteria

- [ ] TTL-T2.AC1 Given a reset request When it is stored Then both forms hold the same expiry

### Symbols

1. [ ] \`saveReset\` | modify | \`src/store.ts\` | impl: agent | writes both forms

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | new: the two forms disagree | example | spec | saveReset | test-author |

## TTL-T3 Backfill the expiry of stored records

- prio: P1 | risk: high (data) | impl: agent | blocked-by: TTL-T2 | amend: TTL-A1 | kind: migrate | deploy: 1 | status: todo

### Acceptance criteria

- [ ] TTL-T3.AC1 Given records with only hours When the backfill runs twice Then every record has an expiry and the second run changes nothing

### Symbols

1. [ ] \`backfillExpiry\` | new | \`src/store.ts\` | impl: agent | fills expiresAt

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | new: a second run changes stored records | example | spec | backfillExpiry | test-author |

## TTL-T4 Read the expiry timestamp

- prio: P1 | risk: high | impl: agent | blocked-by: TTL-T3 | amend: TTL-A1 | kind: switch | deploy: 2 | status: todo

### Acceptance criteria

- [ ] TTL-T4.AC1 (TTL-R1.S1) Given a user When a reset is requested Then the stored request lives for one hour

### Symbols

1. [ ] \`isExpired\` | new | \`src/store.ts\` | impl: agent | reads expiresAt

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | rewrite: TTL-T1.AC1 | example | spec | saveReset | test-author |

## TTL-T5 Drop the hour field

- prio: P2 | risk: high (data) | impl: agent | blocked-by: TTL-T4 | amend: TTL-A1 | kind: contract | deploy: 3 | status: todo

**Removes**: dual-write-expiry, ttl-hours-field

### Acceptance criteria

- [ ] TTL-T5.AC1 Given the stored records after this deploy Then no record has the hour field

### Test plan

| ac | test | kind | oracle | seam | author |
|----|------|------|--------|------|--------|
| AC1 | new: the hour field is still written | example | spec | saveReset | test-author |
`;
    x = x.replace(/(- \[[ x]\] TTL-T1\.AC1 [^\n]*)/, "$1\n- superseded: TTL-T1.AC1 → TTL-T4.AC1 (TTL-A1)");
    fs.writeFileSync(t, x);
    const b = ".hitl/changes/feat-ttl/amend-TTL-A1-brief.md";
    let y = fs.readFileSync(b, "utf8").replace("| transition: — |", "| transition: released |").replace("| skill: plan |", "| skill: design |").replace("| status: open |", "| status: done |");
    y += "\n## Unchanged\n\n- postReset — signature-compatible: it reads only the email\n\n## Close\n\n### Approve the amendment? (Y/n) (needs its own Y)\n\n> Y\n\n→ approved 2026-11-20\n";
    fs.writeFileSync(b, y);'
  CLI index > /dev/null
  # resendAll calls saveReset and is in no task and not under ## Unchanged
  expect_exit 1 CLI amend check feat-ttl --amend TTL-A1 --json > "$W/rl3a.json"
  afile "$W/rl3a.json" 'd.amends[0].transition === "released" && d.errors.length === 1 && d.errors[0].code === "AMEND_UNCOVERED" && d.errors[0].kind === "caller" && d.errors[0].ref === "resendAll"'
  contains "$W/rl3a.json" "list it under ## Unchanged in .hitl/changes/feat-ttl/amend-TTL-A1-brief.md with a reason (e.g. \\\"signature-compatible\\\")"
  sed -i 's/^- postReset — signature-compatible: it reads only the email$/- postReset — signature-compatible: it reads only the email\n- resendAll — signature-compatible: it counts the records/' "$RLB"
  CLI amend check feat-ttl --amend TTL-A1 --json > "$W/rl3b.json" || { cat "$W/rl3b.json"; return 1; }
  afile "$W/rl3b.json" 'd.errors.length === 0 && d.calls["TTL-A1"].callers.length === 2'
  CLI tasks --check --json > "$W/rl3c.json" || { head -c 2000 "$W/rl3c.json"; return 1; }
  # the Impact block counts the callers and says they are handled
  CLI note apply --change feat-ttl --amend TTL-A1 --impact "TTL-D1=contract" --dry-run --json > "$W/rl3n.json"
  afile "$W/rl3n.json" '/reached through calls: 2 caller\(s\) of 1 changed symbol\(s\) \(each handled by a task or ## Unchanged\)/.test(d.line) && d.calls.open.length === 0'
}
step RL3 "released amend: the expand → migrate → switch → contract set with temp items and deploy groups; a caller with no task or Unchanged line is AMEND_UNCOVERED until listed" sRL3

sRL4() {
  cd "$RL"
  # the contract no longer removes the hour field → AMEND_TEMP_NO_REMOVAL (amend check and tasks --check)
  sed -i 's/^\*\*Removes\*\*: dual-write-expiry, ttl-hours-field$/**Removes**: dual-write-expiry/' "$RLT"
  expect_exit 1 CLI amend check feat-ttl --json > "$W/rl4a.json"
  contains "$W/rl4a.json" "AMEND_TEMP_NO_REMOVAL: temporary item ttl-hours-field (data) of TTL-T2 has no contract task in TTL-A1 that removes it"
  expect_exit 1 CLI tasks --check --json > "$W/rl4b.json"
  contains "$W/rl4b.json" "AMEND_TEMP_NO_REMOVAL"
  sed -i 's/^\*\*Removes\*\*: dual-write-expiry$/**Removes**: dual-write-expiry, ttl-hours-field/' "$RLT"
  # the drop in the expand's deploy group → AMEND_CONTRACT_SAME_DEPLOY; released and no deploy group → the same code
  sed -i 's/kind: contract | deploy: 3/kind: contract | deploy: 1/' "$RLT"
  expect_exit 1 CLI amend check feat-ttl --json > "$W/rl4c.json"
  contains "$W/rl4c.json" "AMEND_CONTRACT_SAME_DEPLOY: TTL-T5 (deploy: 1) removes dual-write-expiry (data) that TTL-T2 adds in deploy 1"
  afile "$W/rl4c.json" 'd.errors.some((e) => e.code === "AMEND_ORDER" && /TTL-T5 \(deploy: 1\) is blocked by TTL-T4 \(deploy: 2\)/.test(e.message))'
  sed -i 's/kind: contract | deploy: 1/kind: contract/' "$RLT"
  expect_exit 1 CLI amend check feat-ttl --json > "$W/rl4d.json"
  contains "$W/rl4d.json" "of released behaviour (TTL-A1): name its deploy group in the meta line (deploy: 2 or later; TTL-T2 is deploy 1)"
  sed -i 's/kind: contract | status: todo/kind: contract | deploy: 3 | status: todo/' "$RLT"
  CLI amend check feat-ttl --json | aj 'd.errors.length === 0'
  # the same set with transition branch: expand and migrate are refused (in-branch shape), no temp rule applies
  sed -i 's/| transition: released |/| transition: branch |/' "$RLB"
  expect_exit 1 CLI amend check feat-ttl --json > "$W/rl4e.json"
  afile "$W/rl4e.json" 'd.errors.every((e) => e.code === "AMEND_ORDER") && d.errors.some((e) => /TTL-T2 kind expand is for old behaviour that is merged or released/.test(e.message))'
  sed -i 's/| transition: branch |/| transition: released |/' "$RLB"
  # the contract packs name the temporary items, the removals and the deploy group
  CLI context TTL-T2 > "$W/rl4p.md"
  contains "$W/rl4p.md" "## Temporary items"
  contains "$W/rl4p.md" "- dual-write-expiry (data): saveReset writes expiresAt and ttlHours both"
  CLI context TTL-T5 > "$W/rl4q.md"
  contains "$W/rl4q.md" "Deploy group 3: ship only this group's work"
  contains "$W/rl4q.md" "- temporary item ttl-hours-field: delete it and every use of it"
}
step RL4 "released amend: AMEND_TEMP_NO_REMOVAL, AMEND_CONTRACT_SAME_DEPLOY (same deploy; released without a deploy group), deploy order; an in-branch set gets no temp rule" sRL4

sRL5() {
  cd "$RL"
  # TTL-T2's skeleton rewrites saveReset's docstring with history wording → INTENT_HISTORY warns, never blocks
  rl_src "Stores a reset request. No longer stores the lifetime in hours; previously the TTL was fixed." '  // 1. build the record
  // TODO(impl TTL-T2): 2. now also write the expiry timestamp
  return { email, ttlHours: 1 };' "TTL-T1, TTL-T2"
  CLI index > /dev/null
  CLI drift --json > "$W/rl5d.json" || true
  afile "$W/rl5d.json" 'd.items.some((i) => i.code === "INTENT_HISTORY" && i.level === "warn" && /saveReset intent: "No longer stores"/.test(i.message)) && !d.items.some((i) => i.code === "INTENT_HISTORY" && i.level === "block")'
  CLI intents feat-ttl --json > "$W/rl5i.json"
  afile "$W/rl5i.json" 'd.summary.history === 3 && d.symbols.find((s) => s.name === "saveReset").history.map((h) => h.where).join() === "intent,intent,todo"'
  CLI intents feat-ttl > "$W/rl5i.txt"
  contains "$W/rl5i.txt" "INTENT_HISTORY (warning): state the current contract only"
  CLI amend check feat-ttl --amend TTL-A1 --json > "$W/rl5a.json" || { cat "$W/rl5a.json"; return 1; }
  afile "$W/rl5a.json" 'd.errors.length === 0 && d.warnings.length === 1 && d.warnings[0].code === "INTENT_HISTORY" && d.warnings[0].name === "saveReset"'
  CLI l0 TTL-T2 --json > "$W/rl5l.json"
  afile "$W/rl5l.json" 'd.gates.find((g) => g.name === "history").result === "warn" && d.history.items[0].hits.length === 3'
  # the opt-out marker on its own line silences the docstring; the TODO step keeps its warning
  rl_src "Stores a reset request. No longer stores the lifetime in hours; previously the TTL was fixed.
 * hitl: history-ok" '  // 1. build the record
  // TODO(impl TTL-T2): 2. now also write the expiry timestamp
  return { email, ttlHours: 1 };' "TTL-T1, TTL-T2"
  CLI index > /dev/null
  CLI intents feat-ttl --json | aj 'd.summary.history === 1 && d.symbols[0].history[0].where === "todo"'
}
step RL5 "released amend: history wording in the rewritten docstring is INTENT_HISTORY — warn in drift, listed by intents, l0 and amend check (exit 0); the opt-out marker silences the docstring" sRL5
