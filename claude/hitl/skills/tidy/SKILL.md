---
name: tidy
description: Tidies the intent docstrings and step comments of a done hitl change (one current contract per symbol: no ids in prose, name the callee or enum instead of restating it, no pseudo-code or dead step comments), then stops for the human intent re-approval. Use before archiving or stripping a change, or for "tidy", "clean intents", "dọn docstring", "dọn intent".
argument-hint: "<change-id>"
allowed-tools: Read Glob Grep Agent Bash(hitl-index *) Bash(node *hitl-index.mjs *) Bash(git status *) Bash(git diff *) Bash(git checkout -- *)
---

# /hitl:tidy — one current contract per symbol

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-code.md`.
Rules: `${CLAUDE_PLUGIN_ROOT}/shared/tag-grammar.md` (intent prose) and the step wording in
`${CLAUDE_PLUGIN_ROOT}/shared/templates/skeleton-<lang>.md` (ts, py, lua).

Arguments: `$ARGUMENTS` — `<change-id>` (required; missing → `❌ Usage: /hitl:tidy <change-id>`, stop).
Run it on a change whose tasks are all done, **before** `hitl-index strip <id>` (strip is the last clean-up step;
tidy does not need the `@task` tags).

Only docstring/intent prose and step comments change. Bodies, signatures, tags and tests never do. The locked
contracts stay locked: the edits show up as drift `INTENT_CHANGED`, and only the human's `/hitl:approve <id> intent`
re-locks them. This skill never runs that approve and never adds `--force`.

## 1. Report (read-only)
`hitl-index intents <id> --json`. Exit 1 → print its `error`, stop. Exit 3 → per conventions.
- `symbols` empty → `✅ intents tidy: <id>` (+ `💡 next: hitl-index strip <id> --dry-run`), stop.
- Keep only symbols with `locked: true`, `openTasks` empty and `impl` ≠ `manual`. List the others in one line each and
  leave them alone: open task → `⏭ <name>: <T> is not done (fix it in /hitl:skeleton <T>)`; `impl: manual` →
  `⏭ <name>: human-owned (@impl manual), edit it yourself`; not locked → `⏭ <name>: not locked`. None left → stop.
- Files = the distinct `file` of the kept symbols. `git status --porcelain -- <files>`: any output →
  `🛑 Commit or stash the changes in <files> first (tidy needs a clean revert point).` Stop.
- Baseline: `hitl-index drift --json`; keep its items for those files.

## 2. Rewrite (one subagent)
Spawn one `general-purpose` subagent with: the kept symbols from the report (JSON as is: `file`, `line`, `ids`,
`restates` with both sentences, `steps`, `growth`), the rule paths above, and this brief:

> Rewrite ONLY the intent docstring prose and the numbered step comments of the listed symbols. Rules:
> 1. One current contract per symbol: what it guarantees now, not a sentence per task. Keep every rule that only this
>    symbol states; drop or shorten only what a collaborator already states.
> 2. RESTATES → replace the restated sentence by naming the collaborator (`already settled → checkAlreadySettled`,
>    `refusals: SettleStatusEnum`); an orchestrator lists the outcome order, the callee states its own rules, an enum
>    alone defines each status. Never delete the enum's or callee's own definition.
> 3. ids (`<KEY>-T<n>`, `<KEY>-T<n>.AC<k>`, `<KEY>-D<n>`, spec ids like `KEY-R3.S1`, change ids) leave the prose; do not touch tag lines
>    (`@task`, `@dec`, `@calls`, `@concurrency`, …) nor LuaLS/JSDoc annotations (`@class`, `@field`, `@param`, `@return`).
> 4. steps: inside a function body reword a pseudo-code step into a short intent label (≤ 8 words, keep `n.`); delete
>    numbered comments inside a class/enum body.
> 5. Never edit code lines, signatures, tags, tests, other symbols or other files. No new comments. Use Edit only.
> Report per symbol: `name — what you changed` (one line).

The PreToolUse hook still applies: a `@impl manual` locked symbol is refused (you excluded those); any other edit to a
locked docstring is allowed and becomes `INTENT_CHANGED` drift, which is the point of the gate below.

## 3. Verify (else revert)
1. `hitl-index index <files> --json`.
2. `hitl-index drift --json`: compared with the baseline, the only new items on the kept symbols may be
   `INTENT_CHANGED` (and `INTENT_TASK_REF` going away). Any new `SIG_CHANGED`, `TODO_FLOW_CHANGED`, `BODY_CHANGED`,
   `PARSE_ERROR`, `RENAMED`, `MOVED`, `DELETED_*`, `ORPHAN` or a change outside the kept symbols → revert.
3. `hitl-index approve --change <id> --stage intent --dry-run --json` (a preview: writes nothing, needs no token).
   `ok: false` with any reason other than "no locked symbol … has an intent that differs" → revert.
   That reason alone means only step comments changed: nothing to approve (say so at the gate).
4. `hitl-index intents <id> --json` again: findings left → list them at the gate (no second rewrite round).
Revert = `git checkout -- <files>`, then `hitl-index index <files> --json`, print `🛑 tidy reverted: <reason>` and stop.

## 4. ⛔ GATE — the new contracts
```
🧹 Tidied <id>: <n> intent(s) · <m> step comment(s) · <k> left (see below)
### <Symbol> — <file>
approved: <drift INTENT_CHANGED approved.intent>
new:      <drift INTENT_CHANGED current.intent>
steps: <old → new / deleted, one per line>
<⏭ skipped symbols, findings left>
Review/edit in your editor. Run before hitl-index strip <id>.
Then: /hitl:approve <id> intent  •  or tell me what to change.
```
Only step comments changed → replace the `Then:` line with `✅ nothing to re-approve (steps are not part of the
contract). 💡 next: hitl-index strip <id> --dry-run`.
END THE TURN. Never self-approve. On change requests: apply them yourself within the same rules, redo step 3, show the
gate again.

## Rules
- Never edit `.hitl/**`, tests, signatures, bodies or tags; never run `hitl-index approve` without `--dry-run`.
- Never `git checkout` anything but the kept files, and only to revert this skill's own edits (clean before step 2).
