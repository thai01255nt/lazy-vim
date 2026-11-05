# Accept + amend spec (shared procedure, v3)

Used by `/hitl:sync` (option 4), `/hitl:review` (`amend F-n`), `/hitl:implement` (spec change proposal, option 1),
`/hitl:plan <change-id> amend [N-k]` and `/hitl:design` (`amend [N-k]`, `💡 Needs spec`). Purpose: when approved behaviour or an
approved design must change, record *what* and *why* in the change (spec delta, superseded decision, Changelog)
instead of letting code and spec silently diverge. No new phase: it runs inside the caller's gate. What it does to
locked work (done tasks, locked tests, a locked skeleton) is listed in the Impact block and unlocked only by the
human's `/hitl:approve <id> reopen`.

Ideas adapted (no code): OpenSpec delta specs (ADDED/MODIFIED/REMOVED) and Nygard ADR supersede rule. See NOTICE.md.

## 1. Inputs
- The symbol or finding that triggered it, and its `spec` block: drift item `spec` (`hitl-index drift --json`),
  `l0.trace.spec[<symbol>]` (`reviews/<T>/l0.json`), or `approve --json` `specLinks`. Shape for change tasks:
  `{ change, archived, capability, design, decisions: [{id, text, status, via}], requirements: [{id, scenario, title, text, via}] }`.
  Legacy v0.5 tasks carry `{ planning, decisions, requirements: [{id, text, via}] }`: say
  `💡 v0.5 planning — migrate first (hitl-index migrate --specs)` and fall back to plain accept.
- The change (`spec.change`; `hitl-index change <id> --json`), its effective view
  (`hitl-index spec show --change <id> --json`) and the task's tasks file.
- What changed: the drift diff, the finding text, the implementer's `specConflict.proposal`, the user's request, or a
  note from the inbox (`<id> amend N-k` → `hitl-index note show --change <id> N-k --json`: its text and refs).
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
Then the **Impact block** (0.9) — what the edit does to locked work. Pick one class per changed id, then run
`hitl-index note apply --change <id> [N-k] --impact "<id>=<class>,…" --dry-run --json` and print its result:
```
🔁 Impact (human confirms the classes):
  ACC-R3.S2  behaviour   → reopens 2 tests in T-12 (T-12.AC2)
  D-1        contract    → reopens skeleton ResetService.request in T-14 + 1 test
  ACC-R7     requirement → nothing reopens; then /hitl:tasks <id> update
  T-13 not locked yet: nothing to reopen
  Total: reopens 3 tests in 2 tasks, 1 skeleton symbol
```
| class | when | reopens |
|---|---|---|
| wording | same behaviour, clearer words | nothing |
| behaviour | WHEN/THEN, a number, a removed scenario | the locked tests whose AC maps to it |
| contract | a contract decision, a signature or intent, a new error | the skeleton symbols named through `@dec`/covers, plus their tests |
| scenario | a new scenario on a done task's requirement | a new AC; its tests |
| requirement | a new requirement | nothing; a new task via `/hitl:tasks <id> update` |
- When unsure between wording and behaviour, pick behaviour. Name the AC and test titles so the human can judge.
- `suggestFollowUp` (more than 3 locked tasks, or any contract class) → add
  `💡 This touches <n> tasks / a contract: a follow-up change may be cleaner (/hitl:plan <new>; the human defers the
  note with /hitl:approve <id> defer N-k <new>).` as a numbered option in the gate.
- The human may change a class with `edit` (e.g. `edit ACC-R3.S2=wording`); re-run the dry run and show it again.

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
2. Never write `.hitl/specs/**`, `.hitl/archive/**`, `.base.json`, `notes.md` (only `hitl-index note`), the lock, `index/**`, `state.json`, review md,
   `<provider>.map.json` (linear|jira|github), `status:` fields or boxes.
3. Validate: `hitl-index spec validate <id> --json`, `hitl-index tasks --check --json` and `hitl-index trace <id> --json`.
   Any error or `block` item (`REQ_UNKNOWN`, `SCN_UNKNOWN`, `REQ_INACTIVE`, `DEC_UNKNOWN`, `AC_UNKNOWN`, …) → fix it in
   the same turn (max 3 loops), then report what is left.
4. `warn`/`info` items (e.g. `DEC_SUPERSEDED_REF` on a symbol still tagged with the old D, `SCN_NO_AC` for a new
   scenario) → list them, one line each.
5. Record the impact (active change only): `hitl-index note apply --change <id> [N-k] --impact "<the confirmed
   classes>" --from "<skill> <symbol|F-n|N-k>" --json`. It marks `N-k` applied and, when a touched task has locked
   work, writes a `recheck` note (`reopen pending`). It refuses a note whose refs did not change: fix the edit first.
   Never pass classes the human did not see.

## 5. Then
Print the command the human must type — the amendment never approves anything itself:
- a recheck note was written → `📌 N-k waits for you → 🎯 next: /hitl:approve <id> reopen N-k` (it reopens what the
  Impact block listed, or closes as "nothing to unlock" for wording only). Only the human runs it.
- changed contract → `🎯 next: /hitl:approve <T> skeleton <symbols>`
- spec change proposal from implement → `🎯 next: edit the skeleton, then /hitl:approve <T> skeleton <symbols>`
- review finding → continue the review's decision flow (the finding is already `accept` with note `amend spec`).
- a new scenario without an AC → `🎯 next: /hitl:tasks <id> (update)`.
