---
name: archive
description: Finishes a hitl change: merges its spec deltas into the living specs and moves it to .hitl/archive, showing conflicts first. Use when all tasks of a change are done, or for "archive", "merge spec", "đóng change", "lưu trữ".
argument-hint: "<change-id> [--force]"
allowed-tools: Read Glob Grep Edit Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:archive — merge deltas into the living specs

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-spec.md`. Merge rules: `${CLAUDE_PLUGIN_ROOT}/shared/spec-format.md`
("Merge and archive"). Only the CLI writes `.hitl/specs/**` and `.hitl/archive/**`; you never edit them.

Arguments: `$ARGUMENTS` — `<change-id>` (empty → the active changes with `phase: archive-ready` from
`hitl-index change --json`: one → `💡 Assumed: <id>`; several → ⛔ GATE `Archive which change? (1/2/…)` END THE TURN;
none → `🛑 No change is ready to archive.` + each active change with its phase). `--force` is passed to the CLI only when
the user typed it **or** picked it at the gate below.

## 1. Preview (no writes)
`hitl-index spec archive <id> --dry-run --json` (add `--force` only per the rule above). Exit 3 → per conventions.

## 2. ⛔ GATE — the diff
```
📦 Archive feat-password-reset → .hitl/archive/2026-11-02-feat-password-reset
| capability | file | new? | added | modified | removed | already applied |
|------------|------|------|-------|----------|---------|-----------------|
| accounts | .hitl/specs/accounts/spec.md | no | ACC-R5 ACC-R6 ACC-BR1 ACC-UC1 | ACC-R1 | ACC-R2 | — |
glossary: +Reset link · validate: ok · tasks: 2/2 done
<conflicts / failed preconditions with options, see below>
Apply? (Y/n)
```
- `renumbered` non-empty (dry run with `--renumber`) → one line per id `ACC-R5 → ACC-R7 (change folder rewritten)`.
- `warnings` → ⚠️ lines. Nothing to merge (all `alreadyApplied`) → say so; Y only moves the folder.

**When `ok: false`**, replace `Apply? (Y/n)` with numbered options; recommend one with 💡:
| cause | options |
|---|---|
| `preconditions.tasks.notDone` | 1. 💡 finish them first (`🎯 /hitl:flow`) · 2. archive anyway (`--force`; the tasks stay in the archived tasks.md as not done) |
| `preconditions.validate` failed / `errors[]` | list them; 1. 💡 fix the spec (`/hitl:plan <id>`) — no force option |
| `DELTA_ID_TAKEN` (another branch archived the same new id) | 1. 💡 renumber inside this change (`--renumber`; rewrites deltas, design `serves`, task AC refs in the change folder only; code is never touched) · 2. stop |
| `BASE_CHANGED` (a living requirement changed after this change copied it) | show the living text vs the delta text; 1. 💡 update the delta to include the living change (I edit `specs/<cap>/spec.md` of this change, re-run validate and the preview) · 2. keep the delta as is (`--accept-base <IDs>`) · 3. stop |
| `CROSS_CHANGE_CONFLICT` / `DELTA_TARGET_MISSING` / `CAP_*` / `ARCHIVE_EXISTS` | explain in one line each; 1. 💡 stop and fix (`/hitl:plan <id> amend`) |
END THE TURN.

## 3. Apply
On Y (or the chosen option):
- Option "update the delta" → edit only this change's delta (full MODIFIED block + `Changed:`), run
  `hitl-index spec validate <id> --json`, then back to step 1 (new preview, new gate).
- Else run `hitl-index spec archive <id> [--force] [--renumber] [--accept-base <IDs>] --json` (exactly the flags the
  user chose). Exit 1 → print the conflicts; nothing was written. Stop.
- Success: print
  ```
  ✅ Archived feat-password-reset → .hitl/archive/2026-11-02-feat-password-reset
  📝 specs/accounts/spec.md (+4 ~1 -1) · GLOSSARY.md (+1) · written: <n> files
  ```
  then `hitl-index trace --capability <cap> --json` per capability and one line
  `🔗 <cap>: R <covered>/<total> covered · scenarios <withAc>/<total> with AC` (no percentages).
- Ticket tracker: archive never pushes and never closes the change's container (project, epic or milestone). Mapped tasks get their new `file=` marker on the next
  `/hitl:tickets push` (say so in one line only when `hitl-index tickets status --json` shows `enabled`).
- One line: `💡 Clean code (optional, yours to run): hitl-index strip <id> --dry-run, then hitl-index strip <id>` (removes
  @task/@impl/@status/@prio/@dec/@risk from the change's done functions; lock, drift and statuses unchanged). Never run it yourself.
- 🎯 next: `hitl-index status --json` `.next` (another change, or `/hitl:plan <description>`).

## Rules
- Never edit `.hitl/specs/**`, `.hitl/archive/**` or `.base.json` yourself; never move folders by hand.
- Never add `--force`, `--renumber` or `--accept-base` that the user did not choose at the gate (or type).
- A spec-only mini change (`fix-<slug>` from amend, no tasks.md) archives like any other change.
