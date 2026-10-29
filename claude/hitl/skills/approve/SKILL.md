---
name: approve
description: Human approval gate that locks a task's reviewed skeleton (signatures, intents, TODO flow, test stubs), its red tests, or its final verified result into skeleton.lock.json and advances its status. Only the human runs this.
argument-hint: "<T-id> [skeleton|tests|done] [symbols...]"
disable-model-invocation: true
allowed-tools: Read Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:approve — human approval

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`.

The user typing `/hitl:approve` IS the approval. There is no extra question. The UserPromptSubmit hook has issued a
one-time approve token for this turn; the PreToolUse hook lets exactly one `--by human` approve through.

Arguments: `$ARGUMENTS`

## 1. Build the command
Parse the arguments (whitespace or comma separated):
- first token `T-<n>` → task (required; missing → `❌ Usage: /hitl:approve <T-id> [skeleton|tests|done] [symbols...]`, stop);
- next token ∈ {skeleton, tests, done} → `--stage <it>` (omitted → the CLI picks the first stage not yet done);
- tokens starting with `--` (e.g. `--force`) → passed through as flags;
- remaining tokens → `--symbols a,b` (short refs).
`CMD = hitl-index approve <T> [--stage S] [--symbols a,b] --by human`

## 2. Lock (one call)
Run `CMD --json` once, as a plain single command (no `;`, `&&`, pipes, `2>&1` or `echo $?`: the hook refuses chained
approve commands). No separate `--dry-run` preview is needed: the real call returns the same `changes`, and the
CLI checks preconditions before writing and writes nothing when they fail. (`--dry-run` does not consume the token.)
- Exit 1 (preconditions failed) → print `🛑 Cannot approve <T> <stage>:` + each reason + the CLI's suggested command
  (e.g. `/hitl:skeleton T-12`, `/hitl:test T-12`, `/hitl:review T-12`). Stop.
- Exit 3 → not initialized, per conventions. Stop.
- Denied by the hook with "Approval is human-only" → the token is missing (expired after 10 min, or already used).
  Print `🛑 Approval token missing or used. Type /hitl:approve <args> again.` Stop. Never retry or work around it.
- Never add `--force` unless the user typed `--force` in the arguments.
- A preview without locking is available to the user as `hitl-index approve <T> --dry-run` in their own shell.

## 3. Sync tags
On success: `hitl-index status <T> --sync-tags`.

## 4. Report
```
✅ Approved <T> — stage: <stage> (by human)
🔒 Locked: <n> symbols (<new> new, <changed> re-approved) · <m> tests (<stage: stub|locked>)
<re-approved items: Symbol — sig ⚠️→✅ / intent ⚠️→✅>
📐 <symbol> linked D-1, ACC-R1.S1 — if the decision changed, amend the spec (/hitl:sync offers it)
```
The `📐` line: one per entry of the JSON `specLinks` (skeleton re-approvals only); no `specLinks` → no line.
🎯 next:
- skeleton → `/hitl:test <T>`
- tests → `/hitl:implement <T>`
- done → the next frontier task from `hitl-index status --json` (`.next`), e.g. `/hitl:skeleton T-13`

## 5. Ticket tracker (optional, fail-open; Linear, Jira or GitHub)
`hitl-index tickets status --json`. If `enabled && configured && autoPush.onApprove` → invoke the Skill `hitl:tickets`
with `push <T> --auto`. Its output is informational; any error or missing command → skip silently. It never changes
this skill's result.

Do not edit any file in this skill. Do not run anything else except the optional tickets push above.
`--by human-override` is not this skill: it belongs to `/hitl:implement <T> --lane fast` (separate token). An override
task's `done` still comes here, after its review.
