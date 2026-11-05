---
name: approve
description: Human approval gate that locks a task's reviewed skeleton (signatures, intents, TODO flow, test stubs), its red tests, or its final verified result into skeleton.lock.json and advances its status; "<change-id> intent" re-locks the tidied intents of a done change; "<change-id> accept" accepts later drift on an archived change; "<change-id> reopen" unlocks what an amendment changed; "dismiss|defer N-k" and "--ack N-k" decide a blocking note; "<change-id> skip RC-n <reason>" skips reconcile findings. Only the human runs this.
argument-hint: "<T-id> [skeleton|tests|done] [symbols...] [--ack N-k] | <change-id> intent|accept [symbols...] | <change-id> reopen [N-k] | <change-id> dismiss N-k <reason> | <change-id> defer N-k <change> | <change-id> skip [<other>] RC-n[,RC-m] <reason>"
disable-model-invocation: true
allowed-tools: Read Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:approve — human approval

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`.

The user typing `/hitl:approve` IS the approval. There is no extra question. The UserPromptSubmit hook has issued a
one-time approve token for this turn; the PreToolUse hook lets exactly one `--by human` approve through. The token is
bound to what the user typed: a `T-<n>` token never approves a change, a `<change-id> intent|accept|reopen|dismiss|defer|skip`
token never approves a task, and one change stage never runs another. `--ack`, `reopen`, `dismiss` and `defer` are bound
to the note ids (and defer target) the user typed; `skip` to the exact `RC-n` ids (and other change) the user typed.

Arguments: `$ARGUMENTS`

## 1. Build the command
Parse the arguments (whitespace or comma separated). The first token decides the form:
- first token not `T-<n>` and second token `intent` → **change form** (intent re-approval of a done change, e.g. after
  `/hitl:tidy <id>`): change id = first token; remaining tokens → `--symbols a,b`.
  `CMD = hitl-index approve --change <id> --stage intent [--symbols a,b] --by human` (exactly this shape; never `--force`,
  never `--by auto` or `human-override`: the hook refuses them). Go to step 2, skip step 3 and step 5.
- first token not `T-<n>` and second token `accept` → **change form, accept** (later drift on an archived change, from
  `/hitl:sync`): change id = first token; remaining tokens → `--symbols a,b` (symbols or locked test titles).
  `CMD = hitl-index approve --change <id> --stage accept [--symbols a,b] --by human` (same shape rules as intent: never
  `--force`, never `--by auto` or `human-override`). Go to step 2, skip step 3 and step 5.
- first token not `T-<n>` and second token `reopen` → **change form, reopen** (0.9: the human confirms what an amendment
  reopens — the recheck note's list): optional third token `N-k` → `--note N-k`.
  `CMD = hitl-index approve --change <id> --stage reopen [--note N-k] --by human`. Go to step 2, skip step 3; step 5
  pushes each reopened task.
- first token not `T-<n>` and second token `dismiss` → **note decision**: third token `N-k` (required), the rest is the
  reason (required; drop `` ` ``, `$`, `;`, `&`, `|`, `<`, `>` and quotes from it).
  `CMD = hitl-index approve --change <id> --stage dismiss --note N-k --reason "<reason>" --by human`. Step 2 only.
- first token not `T-<n>` and second token `defer` → **note decision**: third token `N-k`, fourth token the target change
  id (both required). `CMD = hitl-index approve --change <id> --stage defer --note N-k --to <target> --by human`. Step 2 only.
- first token not `T-<n>` and second token `skip` → **reconcile decision** (0.11.1: findings of `/hitl:plan <id> reconcile
  <other>` the human does not take in): an optional third token that is not `RC-<n>` is the other change (`--from`);
  then the `RC-<n>` ids (one or more, comma or space separated; required); the rest is the reason (required; clean it
  as for dismiss). `CMD = hitl-index approve --change <id> --stage skip --findings RC-1,RC-3 [--from <other>] --reason
  "<reason>" --by human` — exactly the ids typed, `--from` only when typed. Step 2 only.
- first token `T-<n>` → task (required; missing → `❌ Usage: /hitl:approve <T-id> [skeleton|tests|done] [symbols...] [--ack N-k] | <change-id> intent|accept|reopen|dismiss|defer|skip …`, stop);
- next token ∈ {skeleton, tests, done} → `--stage <it>` (omitted → the CLI picks the first stage not yet done);
- `--ack` and the token after it (`N-k` or `N-k,N-m`) → `--ack <ids>` (releases those notes for this task: all its
  stages; the note stays open for other tasks and archive). Never add `--ack` yourself;
- other tokens starting with `--` (e.g. `--force`) → passed through as flags;
- remaining tokens → `--symbols a,b` (short refs).
`CMD = hitl-index approve <T> [--stage S] [--symbols a,b] --by human`

## 2. Lock (one call)
Run `CMD --json` once, as a plain single command (no `;`, `&&`, pipes, `2>&1` or `echo $?`: the hook refuses chained
approve commands). No separate `--dry-run` preview is needed: the real call returns the same `changes`, and the
CLI checks preconditions before writing and writes nothing when they fail. (`--dry-run` does not consume the token.)
- Exit 1 (preconditions failed) → print `🛑 Cannot approve <T> <stage>:` + each reason + the CLI's suggested command
  (e.g. `/hitl:skeleton T-12`, `/hitl:test T-12`, `/hitl:review T-12`). Stop. Change form: the CLI refuses unless every
  owning task is done and only intents moved (signature, TODO steps and the done or accepted body unchanged); print the
  reasons. Accept: the CLI refuses unless the change is archived, no open task owns, tags or lists the symbol, the
  signature is unchanged and the covering tests ran fresh and passed (else `hitl-index test`); print the reasons.
- Exit 3 → not initialized, per conventions. Stop.
- Denied by the hook with "Approval is human-only" → the token is missing (expired after 10 min, or already used).
  Print `🛑 Approval token missing or used. Type /hitl:approve <args> again.` Stop. Never retry or work around it.
- Never add `--force` unless the user typed `--force` in the arguments.
- Refused with `📌 N-k (…) touches <T> via …` → print each reason and the three ways out from it: apply the note
  (`/hitl:plan <id> amend N-k`), `/hitl:approve <T> <stage> --ack N-k`, or `/hitl:approve <id> dismiss|defer N-k …`. Stop.
- A preview without locking is available to the user as `hitl-index approve <T> --dry-run` in their own shell.

## 3. Sync tags
On success: `hitl-index status <T> --sync-tags`.

## 4. Report
```
✅ Approved <T> — stage: <stage> (by human)
🔒 Locked: <n> symbols (<new> new, <changed> re-approved) · <m> tests (<stage: stub|locked>)
<re-approved items: Symbol — sig ⚠️→✅ / intent ⚠️→✅>
🗑️ Removed from lock: <ids>
✏️ Renamed in lock: <old → new>
📐 <symbol> linked D-1, ACC-R1.S1 — if the decision changed, amend the spec (/hitl:sync offers it)
```
The `🗑️` line: only when the JSON `changes.symbols.removed` / `changes.tests.removed` is non-empty (locked items of the task deleted or renamed in code).
The `✏️` line: one entry per JSON `changes.symbols.renamed` item (`from → to`); empty → no line.
The `📐` line: one per entry of the JSON `specLinks` (skeleton re-approvals only); no `specLinks` → no line.
Change form:
```
✅ Re-approved intents of <change-id> (by human): <n> symbol(s)
<Symbol — intent ⚠️→✅, one per JSON changes.symbols.changed>
```
Accept form:
```
✅ Accepted drift on <change-id> (by human): <n> symbol(s), <m> test(s)
<Symbol — intent/todo/body ⚠️→✅, one per JSON changes.symbols.changed; test — re-recorded / dropped (deleted)>
```
Reopen form (JSON `reopened`, `nothing`, `empty`):
```
✅ N-4 reopened (confirmed by human):
🔁 T-12 tests: 2 test(s) (T-12.AC2) — rewrite them to the new AC
🔁 T-14 skeleton: 1 symbol (ResetService.request) + 1 test
```
`empty: true` → exactly `✅ N-4 closed: wording only, nothing to unlock (confirmed by human)` (it confirms no impact; it
reopens nothing). 🎯 next: the JSON `next` (`/hitl:skeleton <T>` or `/hitl:test <T>`).
Dismiss / defer: `✅ N-3 (<title>) dismissed: <reason>` · `✅ N-3 (<title>) deferred → <target> N-k (open there)`, plus a
`⚠️` line for refs dropped because the target change does not have them. 🎯 next: `hitl-index status --json` `.next`.
Skip: `✅ RC-1, RC-3 (reconcile from <other>) skipped: <reason>`, then the JSON `pending` (`⏳ still pending: RC-2 — add
it (/hitl:plan <id> reconcile <other>) or skip it`) or, when `reconciled` is true, `✅ reconcile from <other> complete`.
Refused with "has reconcile findings from a, b" → print it: the user retypes with the other change named. Stop.
Task approvals print `📌 acked for <T>: N-k` (JSON `acked`) and one `⚠️` line per JSON `warnings` item.
🎯 next (change form): `hitl-index strip <change-id> --dry-run` (the user runs it; then `hitl-index strip <change-id>`).
🎯 next (accept): `hitl-index status --json` `.next`.
🎯 next:
- skeleton → `/hitl:test <T>`
- tests → `/hitl:implement <T>`
- done → the next frontier task from `hitl-index status --json` (`.next`), e.g. `/hitl:skeleton T-13`

## 5. Ticket tracker (optional, fail-open; Linear, Jira or GitHub)
`hitl-index tickets status --json`. If `enabled && configured && autoPush.onApprove` → invoke the Skill `hitl:tickets`
with `push <T> --auto` (reopen: once per task in the JSON `reopened`, so its ticket goes back to started). Its output is informational; any error or missing command → skip silently. It never changes
this skill's result.

Do not edit any file in this skill. Do not run anything else except the optional tickets push above.
`--by human-override` is not this skill: it belongs to `/hitl:implement <T> --lane fast` (separate token). An override
task's `done` still comes here, after its review.
