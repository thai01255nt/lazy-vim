# Accept + amend spec (shared procedure)

Used by `/hitl:sync` (option 4), `/hitl:review` (`amend F-n`), `/hitl:implement` (spec change proposal, option 1) and
`/hitl:plan <file> amend`. Purpose: when an approved contract or plan must change, record *why* in the planning file
(ADR-style supersede + Changelog) instead of letting code and plan silently diverge. No new phase, no new approval gate:
it runs inside the caller's gate.

Ideas adapted (no code): OpenSpec delta specs (ADDED/MODIFIED/REMOVED, applied here in place), Nygard ADR supersede
rule. See NOTICE.md.

## 1. Inputs
- The symbol or finding that triggered it, and its `spec` block: drift item `spec` (`hitl-index drift --json`),
  `l0.trace.spec[<symbol>]` (`reviews/<T>/l0.json`), or `approve --json` `specLinks`. Shape:
  `{ planning, decisions: [{id, text, status, via}], requirements: [{id, text, via}] }`.
- The planning file (`spec.planning`) and the tasks file of the task (`> status:` / `← Planning:` lines).
- What changed: the drift diff, the finding text, or the implementer's `specConflict.proposal`.
- No `spec` block and no planning (quick task) → nothing to amend; say `💡 No linked spec — plain accept.` and continue
  with the caller's plain accept path.

## 2. Draft the delta and show it in the same gate turn (never write first)
```
📐 Spec delta — planning/feat-auth.md
  ~ D-1  accepted → superseded by D-7
  + D-7 | <decision> | <why (source)> | <cost if wrong> | R-3 | accepted
  ~ R-3  "<old>" → "<new>"
  ~ tasks/feat-auth.md T-12.AC3 text → "<new AC text>"     (text after the id only; never boxes/status)
  + Changelog: <YYYY-MM-DD> D-7 supersedes D-1 — <reason> (source: /hitl:sync, UserService.createUser)
  ~ src/services/userService.ts @dec D-1 → D-7
Apply? (Y/n/edit)
```
- `+` added line/row, `~` changed, `-` dropped (an R gets `(status: dropped)`; nothing is deleted).
- Keep it minimal: only the decisions/requirements the change really touches. If none of them changed (the code change
  is an implementation detail), say so and fall back to plain accept.
- ⛔ GATE: END THE TURN after `Apply? (Y/n/edit)`. `edit` → apply the user's corrections, show the delta again.

## 3. Rules
- **Decisions are never edited in place** after approval: old row status → `superseded by D-k`, new row appended with
  `serves`. A rejected alternative may be recorded as a row with status `rejected`.
- **Requirements may be amended in place** (they are the current contract); each amendment gets a Changelog line.
  Removing behaviour → `(status: dropped)`; replacing → new R + `(status: superseded by R-k)` on the old one.
- New ids: max+1 within that planning file (`hitl-index next-id` is for task ids only). Never renumber.
- One Changelog line per change: `- <YYYY-MM-DD> <what> — <why> (source: <skill>, <symbol|F-n>)`.
- Planning meta: `> status:` stays `approved`; set `updated:` to today. Exception: the amendment adds a component or
  a new `must` requirement → set `status: draft` and print `🎯 next: /hitl:tasks <file> (update)`.
- AC edits in the tasks md: only the text after the id (and its `(R-n)` group). Never boxes, never task `status:`.

## 4. Apply (after Y)
1. 📝 Edit the planning md (Requirements, Decisions, Changelog, `updated:`), the tasks md AC text, and `@dec` tag lines
   on the affected code symbols. `@dec` is not hashed → changing it needs no re-approval.
2. Never write the lock, `index/**`, `state.json`, review md, `linear.map.json`, `status:` fields or boxes.
3. Validate: `hitl-index tasks --check --json` and `hitl-index trace <planning-file> --json`. Any `block` item
   (REQ_UNKNOWN, REQ_INACTIVE, DEC_UNKNOWN, AC_UNKNOWN, …) → fix it in the same turn (max 3 loops), then report what is left.
4. `warn`/`info` items (e.g. `DEC_SUPERSEDED_REF` on a symbol still tagged with the old D) → list them, one line each.

## 5. Then
Print the command the human must type, as before — the amendment never approves anything itself:
- changed contract → `🎯 next: /hitl:approve <T> skeleton <symbols>`
- spec change proposal from implement → `🎯 next: edit the skeleton, then /hitl:approve <T> skeleton <symbols>`
- review finding → continue the review's decision flow (the finding is already `accept` with note `amend spec`).
