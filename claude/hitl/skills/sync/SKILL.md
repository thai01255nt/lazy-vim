---
name: sync
description: Reconciles manual edits with the HITL index — reindexes the project, shows the full drift report against approved skeletons (signature/intent changes with affected callers, orphan symbols, deleted-but-referenced symbols, edited locked tests, stale @status tags), flags broken requirement/decision links (trace), walks the user through re-reviewing each change (accept, revert, defer, or accept + amend the planning spec), regenerates CODEBASE-MAP, and offers approval. Run by the user after editing code outside Claude.
argument-hint: "[--files <paths...>] [<T-id>]"
disable-model-invocation: true
allowed-tools: Read Glob Grep Edit Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:sync

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. Reply in the user's language.

Arguments: `$ARGUMENTS` → `[--files <paths...>] [<T-id>]`, or `context <T-id|ref>`.
- `context <ref>` → run `hitl-index context <ref>` and print its markdown as-is. Done (no gate).

## Iron rules

- The user's code is the source of truth. You only **report**, then act on the user's explicit choice.
- Approval stays human-only: for "accept" you tell the user to type `/hitl:approve …`. You never run `approve --by human`.
- Never edit generated files (index, lock, state, CODEBASE-MAP AUTO block, review reports).
- A revert touches only the signature and docstring of the named symbol, never its body.

## Step 1 — Reindex and diff

1. `hitl-index index [<files>] --json` (no files → incremental over all changed files). Print
   `🔍 reindexed n files: +a added, -r removed, ~m modified`.
2. `hitl-index drift --json [--task <T>] [--files <files>]` (items on locked symbols may carry a `spec` block).
3. `hitl-index trace --json` (all; `trace <T> --json` when a task was given). Keep its `block` items and
   `DEC_SUPERSEDED_REF` warns; ignore the other gaps here.
4. `hitl-index map-md` (regenerates CODEBASE-MAP AUTO block + index.md).
Not initialized (exit 3) → 🛑 `Run /hitl:setup first.`

## Step 2 — Drift report (grouped by task)

```
## T-12 Register user with unique email
⛔ DELETED_REFERENCED UserRepo.findByEmail — src/repo/userRepo.ts — still called by UserService.createUser
⚠️ SIG_CHANGED UserService.createUser — src/services/userService.ts — callers: AuthController.register
   approved: createUser(email: string, passwordHash: string): User
   current : createUser(email: string, passwordHash: string, role: string): User
   spec: D-1 (Duplicate check in UserService.createUser) · R-1, R-2
⚠️ INTENT_CHANGED …   approved: "<intent>"  →  current: "<intent>"
⚠️ TEST_CHANGED tests/userService.test.ts "T-12.AC2 …"
⚠️ ORPHAN UserService.helper — no @task
ℹ️ STATUS_TAG_STALE UserService.createUser — source says green, computed red
⛔ DEC_UNKNOWN D-9 — UserService.createUser @dec D-9 not in planning/feat-user-register.md   (trace)
⚠️ DEC_SUPERSEDED_REF D-1 — superseded by D-4                                                  (trace)
## (no task)
⚠️ ORPHAN src/util/email.ts#normalize
```
- Order: ⛔ block, ⚠️ warn, ℹ️ info. Collapse info rows into one count line per task unless there are ≤5.
- For SIG_CHANGED / INTENT_CHANGED show `approved → current` from the drift item's `approved`/`current` fields.
- For DELETED_LOCKED with a MOVED info item, say where it moved.
- Items with `spec` → one extra line `   spec: D-1 (<decision text, ≤60 chars>) · R-1, R-2`.
- Trace items go under their `task` group (no task → `## (no task)`), marked `(trace)`.

No drift warn/block items and no trace block items → `✅ in sync` plus `hitl-index status --brief` output, then run `hitl-index status --sync-tags`
(fixes stale `@status` tags) and stop.

## Step 3 — ⛔ GATE

```
For each changed contract: 1. accept (re-approve)  2. revert (I restore the approved signature/doc)  3. defer
                            4. accept + amend spec (only items with spec: <symbols>)
Orphans: tag with task? (T-id / ignore). Locked tests changed: accept (re-lock) / revert by hand / defer.
Trace ⛔ items: I fix the reference (R-/D-/@dec/@ac/@covers) unless you say otherwise.
Reply e.g. "1 all", "2 UserService.createUser", "4 UserService.createUser", "orphans T-12".
```
💡 Recommend per item in one line (e.g. revert when callers would break and no caller was updated; accept when the user
clearly intended the change and callers were updated too; accept + amend spec when the change contradicts a linked
decision or requirement). End turn.

## Step 4 — Apply the reply

| choice | action |
|---|---|
| accept (contract) | Print the exact command for the user to type: `/hitl:approve <T> skeleton <symbols…>`. Mention affected callers that may need updating first. |
| accept (locked test) | Print `/hitl:approve <T> tests` for the user to type. |
| revert | For each symbol: show a compact diff `current → approved` of the signature/docstring (from the lock's `signature`/`intent`), then Edit only those lines back (no second gate). Keep the body and the `@task/@impl/@status/@prio` tags. Then `hitl-index index <file> --json` and confirm the item disappeared from `hitl-index drift --files <file> --json`. If the body no longer fits the old signature, say so (it will show as red tests). |
| accept + amend spec | Follow `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md` with the item's `spec` block: show the 📐 Spec delta, ⛔ GATE `Apply? (Y/n/edit)`, END THE TURN. On Y apply it, then print `/hitl:approve <T> skeleton <symbols…>` for the user to type. |
| defer | Leave it; it stays in drift and in `/hitl:flow`. |
| orphan → T-id | Add `@task <T> @impl <agent|manual> @status skeleton` to the symbol's docstring (create a minimal docstring if none; ask nothing — default `@impl manual` because the human wrote it). Reindex. Tell the user it joins the task at the next `/hitl:approve <T> skeleton <symbol>`. |
| orphan → ignore | Nothing (orphans are warnings only). |
| trace ⛔ (DEC_UNKNOWN, REQ_UNKNOWN, AC_UNKNOWN, …) | Fix the dangling reference: Edit the `@dec`/`@ac`/`@covers` tag line or the tasks md `(R-n)`/Why text to an existing id (never status or boxes). `@dec` is not hashed. Reindex, re-run `hitl-index trace --json`; if drift now shows TEST_CHANGED/INTENT_CHANGED for it, print the matching `/hitl:approve` command. |
| DELETED_REFERENCED | Not auto-fixable. Show the referencing symbols; the user restores the symbol or updates the callers/@calls/@covers. |

Finally: `hitl-index status --sync-tags`, re-run `hitl-index drift --json [--task <T>]` and print the remaining counts
(`⛔ b · ⚠️ w · ℹ️ i`) plus `🎯 next:` (the approve command the user must type, or `hitl-index status --json` `.next`).
