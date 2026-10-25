# Manual hand-off (`@impl manual`)

The human owns this function. You prepare everything they need, stop, and verify afterwards.
You never edit its body, signature or docstring (the PreToolUse hook denies it).

## 1. Build the slice

`hitl-index context <ref> --json` → use `.markdown`. Do not write it to a file unless the user asks.

## 2. Print a compact hand-off card (≤25 lines)

```
✍️ <ref> — manual — <status> — <file>   (open it in your editor; search for "TODO(impl): <ref>")
Intent: <one-line intent from the docstring>
Steps (keep them as "// n. …" comments when done):
  1. normalize email to lower case
  2. return the first user whose email matches
Calls (@calls): UserRepo.save(user: User): User — "Persists a user." [agent, green]
Called by: UserService.createUser — "Registers a user; rejects duplicates." (expects: undefined when absent)
Tests (locked): tests/userRepo.test.ts — "T-12.AC1 …" [red], "T-12.AC3 …" [red]
Run: hitl-index test --symbol <ref>      (or reply "done" and I run it)
♻️ Reuse hints: <existing helpers found with Grep that fit a step, e.g. normalizeEmail (src/util/email.ts)>
⚠️ Watch: <only real risks from @concurrency, security features, or AC edge cases>
```

Rules for the card:
- Facts only, from the slice or Grep. No invented helpers. Mark unknowns as "unknown".
- Reuse hints: search the codebase (Grep/Glob, or `hitl-index context` on a candidate) for existing functions that
  fit a TODO step. List at most 3 with file paths. Never propose new modules.
- Quality reminders only when relevant (one line each): input validation, parameterized queries, resource release on
  every path, structured errors, existing patterns (from `docs/PATTERNS-CONVENTIONS.md`).

## 3. ⛔ GATE

`✍️ Your turn: implement <ref> in <file>. Reply "done" (I'll run its tests) or "agent" to hand it to me (you flip @impl yourself).`
End the turn. No tool calls after this line.

## 4. On the reply

| reply | action |
|---|---|
| `done` (or "xong", "ok") | `hitl-index index <file> --json` → `hitl-index test --symbol <ref> --json`. Print ✅ green (n/n) or ❌ red with the first 1–3 failure messages and the step they likely map to. Red → ⛔ GATE `Fix and reply "done" again, or "skip" to move on.` Green → `hitl-index status <T> --sync-tags`, continue the work list. |
| `agent` | Tell the user: change `@impl manual` → `@impl agent` in the docstring yourself, then reply "done". (Agents cannot edit human-owned functions; the flip is the human's decision.) After "done", reindex and check `tags.impl == "agent"` via `hitl-index context <ref> --json`, then treat it as an agent symbol. Note: the lock still says manual → `IMPL_CHANGED` (info); mention that `/hitl:approve <T> skeleton <ref>` records the new owner. |
| `skip` | Leave it; continue with the next symbol; list it as `manual pending` in the summary. |
| a question | Answer from the slice/code (Read/Grep). Repeat the gate line. |

If the user's edit changed the signature or docstring, the PostToolUse hook does not fire (edit made outside Claude).
Run `hitl-index drift --files <file> --json`; on `SIG_CHANGED`/`INTENT_CHANGED` print ⚠️ with affected callers and
suggest `/hitl:sync` or `/hitl:approve <T> skeleton <ref>`.

Never tell the user a manual function is "done" or "correct" without the fresh test run.
