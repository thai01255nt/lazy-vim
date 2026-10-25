---
name: implement
description: Implements an approved task function by function in priority order. Agent-owned (@impl agent) functions go to the implementer subagent with a precise context slice and must turn their locked failing tests green; human-owned (@impl manual) functions are handed to the user with their context and verified after the user writes them. Low-risk tasks run the fast lane (auto skeleton, tests, implementation); the user may force it on a high-risk task with --lane fast (human override, flagged for human review). --feature <file> runs every task of a tasks file in order and ends with one combined review. Use when the user says "implement T-12", "làm T-12", "fill <function>", "implement the whole feature".
argument-hint: "<T-id> [symbol] [--all] [--lane fast] | --feature <planning-or-tasks-file> [--lane fast]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Edit Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:implement

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` (language, CLI invocation, gate protocol, emoji, quality checklist).
Reply in the user's language. Code, tags and identifiers stay English.

Arguments: `$ARGUMENTS` → `<T-id> [symbol] [--all] [--lane fast]` or `--feature <file> [--lane fast]`.
No T-id → take the first frontier task from `hitl-index status --json` (`.next`), say `💡 Assumed: T-n`, continue
(`--lane fast` without a T-id or `--feature` → 🛑 `--lane fast needs an explicit task: /hitl:implement <T> --lane fast`).
`--feature <file>` → follow `references/feature-run.md` instead of the steps below (it calls them per task).

## Iron rules

- **You (main thread) never write the body of an `@impl agent` function.** The `hitl:implementer` subagent does, from a context slice.
- **You never edit an `@impl manual` function body.** The human does (a hook denies it anyway).
- **You never edit tests, `@`-tags, locked signatures or docstrings.** If the contract or the plan looks wrong, stop and print
  the spec change proposal card (step 3). Only exception: after the user picks option 1 there and answers Y to the
  📐 Spec delta, edit per `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md` (planning md, AC text, `@dec` lines — nothing else).
- **No completion claim without a fresh `hitl-index test` run in this turn** (verification-before-completion).
  "Implementer said green" is a claim, not evidence. Re-run.
- One function at a time. Each function ends with a fresh test result printed to the user.
- **`--lane fast` is the user's decision, never yours.** Use it only when the user typed it in `$ARGUMENTS`; never suggest
  it to get past a gate, never add it on a resume the user did not type.

## Lane override (`--lane fast` on a high-risk task)

The user typed `/hitl:implement <T> --lane fast`: the UserPromptSubmit hook issued an override token bound to `<T>`, and
the PreToolUse hook lets `hitl-index approve <T> --stage skeleton|tests --by human-override` through for this run.
1. Print once, before anything else (reasons from `tasks --json` `riskReasons`, plus `hitl-index risk <T> --json` reasons when symbols exist):
   ```
   ⚠️ HUMAN OVERRIDE — fast lane forced on high-risk T-12 (security, public-api)
   Skeleton and tests are approved without gates (recorded as human-override in the lock).
   Manual functions still come to you. The review will route every function to you (L2).
   ```
2. Run `references/fast-lane.md` with `BY = human-override` (it says where). No other gates for agent symbols.
3. Low-risk task + `--lane fast` → no override needed: say `💡 low risk: normal fast lane` and use `BY = auto`.
4. Hook denies with "override is human-only" (token expired after 3 h, or another slash command ended the run) →
   🛑 `Override token missing. Type /hitl:implement <T> --lane fast again.` Stop. Never fall back to `--by human`.

## Step 1 — Load state and route

Run `hitl-index status <T> --json` and `hitl-index tasks --json` (task risk, symbols, `impl`, blocked-by).
If not initialized (exit 3): 🛑 `Run /hitl:setup first.` and stop.

Route on task status (`tasks[T].status`) and risk:

| status | risk low | risk high |
|---|---|---|
| `todo` (no skeleton) | ⚡ fast lane → `references/fast-lane.md` | 🛑 `Run /hitl:skeleton <T> first` |
| `skeleton` (not approved) | ⚡ `hitl-index approve <T> --stage skeleton --by auto`, then as `approved` | 🛑 `Run /hitl:approve <T> first` |
| `approved` (tests not locked) | ⚡ fast lane from the test step | 🛑 `Run /hitl:test <T>, then /hitl:approve <T> tests` |
| `red` / `wip` | go to step 2 | go to step 2 if tests are locked, else 🛑 as `approved` |

High risk **with** `--lane fast` (Lane override above): use the low-risk column with `BY = human-override`.
| `green` | ✅ already green → `🎯 next: /hitl:review <T>` | same |
| `review` / `verified` / `done` | print status and `next` from the CLI; stop | same |

Blocked by unfinished tasks → ⚠️ list them, ⛔ GATE `Continue anyway? (y/N)`, end turn.
When unsure, trust `tasks[T].next` from the CLI over your own reading.

Linear (optional, fail-open): if `status --json` `tasks[T].linear` exists and `onBranch` is false → print
`🎯 branch: git switch -c <branch>` once. Run no git command yourself; `linear` null or missing → print nothing.

## Step 2 — Work list

Task symbols whose status ∈ {skeleton, red, wip}, sorted by `@prio` (the `### Symbols` order breaks ties).
If `symbol` was given, the list is just that symbol (short ref is fine if unambiguous; otherwise ask via a gate).

Print it in the v2 style, then start the first item without asking (the `/hitl:implement` call is the go-ahead):
```
🎯 T-12 — 3 functions (risk high: security, public-api)
1. [ ] UserService.createUser  — agent  — red   — src/services/userService.ts
2. [ ] UserRepo.findByEmail    — manual — red   — src/repo/userRepo.ts
3. [x] PasswordHasher.hash     — agent  — green
💡 Starting with 1. UserService.createUser
```

Pacing:
- **High risk:** one symbol per turn, then the gate in step 4.
- **Low risk, `--lane fast` or `--all`:** loop over all **agent** symbols without gates. Manual symbols still stop at their hand-off gate.

## Step 3 — Per symbol

### `@impl manual` → human writes it
Follow `references/manual-handoff.md`. It ends at the ⛔ GATE
`✍️ Your turn: implement <ref> in <file>. Reply "done" (I'll run its tests) or "agent" to hand it to me (you flip @impl yourself).`
On "done": `hitl-index index <file> --json`, then `hitl-index test --symbol <ref> --json`. Report red/green with the failing
messages (if any), then continue with the next symbol.

### `@impl agent` → implementer subagent
1. `hitl-index context <ref> --out .hitl/index/contracts/<T>.impl.md`
   (current source, locked contract state, callers, declared callees with intents, tests, public types, rules).
2. Spawn **one** `hitl:implementer` agent (Agent tool, `subagent_type: hitl:implementer`). Prompt, nothing else:
   ```
   Task: <T> — implement <symbol id> in <file>.
   Context slice: .hitl/index/contracts/<T>.impl.md (read it first).
   Test command: hitl-index test --symbol <ref> --json
   Max iterations: 3. Return the JSON from your Output section.
   ```
   Never paste this session's history. Never run two implementers on the same file at once.
3. It returns `{symbol, result: "green"|"stuck", iterations, testsPassed, contractIssue?, specConflict?, notes}`.
   - `contractIssue` or `specConflict` → 🛑 stop the loop and print the **spec change proposal card** (spec links from
     `hitl-index context <ref> --json` / `hitl-index trace <T> --json`; omit the `conflicts with` line when none):
     ```
     📐 Spec change proposal — T-12 UserService.createUser
     conflicts with: D-1 "<text>" (planning/feat-auth.md) · R-3 "<text>"
     problem: <…>   proposal: <…>
     1. 💡 amend spec (I draft the delta, you approve it, then you edit the skeleton + /hitl:approve T-12)
     2. you implement it (flip @impl manual)   3. stop
     ```
     ⛔ GATE, end turn. Option 1 → `shared/amend-spec.md` (📐 Spec delta, `Apply? (Y/n/edit)`, then the approve command).
     Never let the agent deviate from the contract, and never re-run it with a "work around it" hint.
   - `stuck` → 🛑 print the last failing output, iterations used, and the implementer's hypothesis.
     💡 Suggest systematic debugging: reproduce with the single failing test, read the full error, check the TODO step it maps to.
     Offer: `1. I retry with your hint  2. you implement it (flip @impl manual)  3. revisit the skeleton`. ⛔ GATE, end turn.
   - `green` → go to step 4 (do not trust it yet).

## Step 4 — Verify (fresh evidence) and report

After each symbol (low risk: after the batch, plus once per symbol in the summary):
1. `hitl-index test --task <T> --json` — **fresh run**. Read `perSymbol` and `runs`. Any `unmatched` → ⚠️ list them.
2. `hitl-index drift --task <T> --json` — surface `warn`/`block` items (e.g. ORPHAN helper without tags, SIG_CHANGED).
   `CALLS_UNDECLARED` (info) is expected when the implementer marked `// REUSE:`; mention it once.
3. `hitl-index status <T> --sync-tags` (tooling rewrites `@status` and the tasks md boxes; you never do).
4. Print:
   ```
   ✅ UserService.createUser green (3/3 tests, fresh)        or   ❌ UserService.createUser red (1/3) — <first failure message>
   📝 steps: 1 normalize ✓ · 2 reject duplicate ✓ · 3 hash+save ✓   (from the `// n.` step comments)
   ♻️ REUSE: PasswordHasher.hash (src/security/hasher.ts)              (only if the implementer reported reuse)
   ```
   Show the new body (or its diff) compactly so the human can glance at it — the v2 "show code" step.
5. High risk: ⛔ GATE `Method done. Continue? (Y/n/<symbol>)`. End turn.
   - Y → next symbol in the list. `<symbol>` → that one. n → stop with the 🎯 line.

Red after a `green` claim → treat as `stuck` (print both claims and evidence; never paper over it).

## Step 5 — Finish

When every task symbol is green in a fresh run **in this turn**: `✅ T-12: all functions green (n tests)` and
`🎯 next: /hitl:review <T>`.
Otherwise list what is left (`manual pending`, `red`, `stuck`) and the next command. Never say "done" without the run.

## Never

- Write an agent body yourself "to save time", or merge two symbols into one implementer call.
- Edit tests to make them pass, skip tests, or weaken assertions.
- Mark checkboxes or `@status` by hand; invent quality scores or metrics.
- Run `hitl-index approve … --by human` (only `/hitl:approve`, typed by the user, does that), or `--by human-override`
  unless the user typed `--lane fast` for this task or feature.
