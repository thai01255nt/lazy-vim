# Accept + amend spec (shared procedure, v3)

Used by `/hitl:sync` (option 4), `/hitl:review` (`amend F-n`), `/hitl:implement` (spec change proposal, option 1),
`/hitl:plan <change-id> amend` and `/hitl:design` (`amend`, `💡 Needs spec`). Purpose: when approved behaviour or an
approved design must change, record *what* and *why* in the change (spec delta, superseded decision, Changelog)
instead of letting code and spec silently diverge. No new phase, no new approval gate: it runs inside the caller's gate.

Ideas adapted (no code): OpenSpec delta specs (ADDED/MODIFIED/REMOVED) and Nygard ADR supersede rule. See NOTICE.md.

## 1. Inputs
- The symbol or finding that triggered it, and its `spec` block: drift item `spec` (`hitl-index drift --json`),
  `l0.trace.spec[<symbol>]` (`reviews/<T>/l0.json`), or `approve --json` `specLinks`. Shape for change tasks:
  `{ change, archived, capability, design, decisions: [{id, text, status, via}], requirements: [{id, scenario, title, text, via}] }`.
  Legacy v0.5 tasks carry `{ planning, decisions, requirements: [{id, text, via}] }`: say
  `💡 v0.5 planning — migrate first (hitl-index migrate --specs)` and fall back to plain accept.
- The change (`spec.change`; `hitl-index change <id> --json`), its effective view
  (`hitl-index spec show --change <id> --json`) and the task's tasks file.
- What changed: the drift diff, the finding text, the implementer's `specConflict.proposal`, or the user's request.
- No `spec` block and no change (quick task) → nothing to amend; say `💡 No linked spec — plain accept.` and continue
  with the caller's plain accept path.

## 2. Draft the delta and show it in the same gate turn (never write first)
```
📐 Spec delta — change feat-password-reset (active)
  ~ ACC-R3.S2  THEN "same confirmation" → THEN "same confirmation within 1 s"     (specs/accounts/spec.md, MODIFIED)
  + ACC-R7 "When …, the system SHALL …" + ACC-R7.S1                               (specs/accounts/spec.md, ADDED)
  ~ D-1 accepted → superseded by D-5 ; + D-5 | … | serves ACC-R3 | accepted       (design.md)
  ~ tasks.md T-12.AC2 text → "…"                                                  (text and ref group only)
  + Changelog (design.md): 2026-11-01 D-5 supersedes D-1 — … (source: /hitl:sync, ResetService.request)
  ~ src/reset/service.ts @dec D-1 → D-5
Apply? (Y/n/edit)
```
- `+` added, `~` changed, `-` removed. Keep it minimal: only the ids the change really touches. If no requirement,
  scenario or decision changed (an implementation detail), say so and fall back to plain accept.
- ⛔ GATE: END THE TURN after `Apply? (Y/n/edit)`. `edit` → apply the user's corrections, show the delta again.

## 3. Rules
- **Active change** → edit its delta `specs/<cap>/spec.md`:
  - an ADDED or MODIFIED block of this change → rewrite it in place (a MODIFIED block keeps an updated `Changed:` line);
  - a living requirement the change does not touch yet → add it under `## MODIFIED Requirements` as the **full** block
    (`hitl-index spec show <ID> --json`) with the edit and a `Changed:` line;
  - removing behaviour → `## REMOVED Requirements` + `Reason:`; new behaviour → `## ADDED` with ids from
    `hitl-index spec next-id <cap> --kind R` / `--scenario <REQ-ID>`. Ids never change and are never reused.
- **Archived change, or a quick task** → living specs are never edited directly. Create a mini change `fix-<slug>`
  (proposal + delta only; `## Artifacts` rows `design | skipped | spec-only amendment` and `tasks | skipped |
  spec-only amendment`), run `hitl-index spec validate fix-<slug> --json`, print `🎯 next: /hitl:archive fix-<slug>`.
- **Decisions are never edited in place** once the design is approved: the old row's status → `superseded by D-k`, a
  new row is appended with `serves` and `alternatives`. A rejected alternative may be recorded with status `rejected`.
  New D ids: max+1 within that design.md.
- One Changelog line per decision change, in design.md `## Changelog`:
  `- <YYYY-MM-DD> <what> — <why> (source: <skill>, <symbol|F-n>)`. Spec changes are recorded by the delta itself
  (`Changed:` / `Reason:`) and by `## Change History` at archive.
- Status: proposal and design stay `approved`; set `updated:` to today. Exception: the amendment adds a requirement or a
  capability → proposal `status: draft` and `🎯 next: /hitl:tasks <id> (update)`.
- Business files stay business-readable (no code names: `BIZ_CODE_TOKEN`).
- AC edits in the tasks md: only the text after the id and its ref group `(ACC-R3.S2)`. Never boxes, never task `status:`.

## 4. Apply (after Y)
1. 📝 Edit the delta, design.md (Decisions, Changelog, `updated:`), the proposal (`updated:`, Capabilities row ids), the
   tasks md AC text, and `@dec` tag lines on the affected code symbols. `@dec` is not hashed → no re-approval.
2. Never write `.hitl/specs/**`, `.hitl/archive/**`, `.base.json`, the lock, `index/**`, `state.json`, review md,
   `linear.map.json`, `status:` fields or boxes.
3. Validate: `hitl-index spec validate <id> --json`, `hitl-index tasks --check --json` and `hitl-index trace <id> --json`.
   Any error or `block` item (`REQ_UNKNOWN`, `SCN_UNKNOWN`, `REQ_INACTIVE`, `DEC_UNKNOWN`, `AC_UNKNOWN`, …) → fix it in
   the same turn (max 3 loops), then report what is left.
4. `warn`/`info` items (e.g. `DEC_SUPERSEDED_REF` on a symbol still tagged with the old D, `SCN_NO_AC` for a new
   scenario) → list them, one line each.

## 5. Then
Print the command the human must type — the amendment never approves anything itself:
- changed contract → `🎯 next: /hitl:approve <T> skeleton <symbols>`
- spec change proposal from implement → `🎯 next: edit the skeleton, then /hitl:approve <T> skeleton <symbols>`
- review finding → continue the review's decision flow (the finding is already `accept` with note `amend spec`).
- a new scenario without an AC → `🎯 next: /hitl:tasks <id> (update)`.
