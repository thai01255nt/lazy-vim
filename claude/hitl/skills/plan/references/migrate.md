# v0.5 planning migration (`/hitl:plan` §1, only when `.hitl/planning/*.md` exists)

v0.5 `.hitl/planning/*.md` files are legacy and read-only; they are migrated to changes (spec + design + tasks).

1. Run `hitl-index migrate --specs --dry-run --json`.
2. Result:
   - `status: nothing` → ignore. `conflicts[]` not empty → show them in one ⚠️ line each, no migration offer.
   - Else GATE in chat (it comes before the new change's brief exists; asked on every run until migrated or the
     user skips it), then END THE TURN:
     ```
     _Tip:_ v0.5 planning files found — migrate them to changes (spec + design + tasks):
     | # | planning | → change | capability | key | target |
     |---|----------|----------|------------|-----|--------|
     | 1 | feat-user-register.md | feat-user-register | user-register | UR | changes |
     ⚠️ <warnings, max 5 + count>
     ```
     Capability = a business area (kebab case, e.g. `accounts`), key = 2–5 capitals (`ACC`), never changed later.
     Recommend a better name than the derived slug when the planning title suggests one (`_Rec:_ 1 → accounts / ACC`).
     Reply line: `M. _Rec:_ migrate with these names (Y) · rename: "M 1 accounts ACC" · "M skip"`.
   - Resuming a legacy file by name without migrating → `_Stop:_ v0.5 planning files are read-only — migrate first.`
3. On an `M` reply (accept or rename): `hitl-index migrate --specs --map '<json>' --json` with `{"<planning name>":{"capability":"<cap>","key":"<KEY>"}}`
     for every row (renamed or recommended). Exit 1 → show its conflicts and ask again. Print
     `✅ migrated <n> → .hitl/changes/` + the warnings. Then a **rename gate** in chat (≤ 7 numbered questions `M1…`,
     each with `_Rec:_`; reply `Y` or `M2: <title>`) when migrated titles are crude (requirement/scenario titles
     cut at 60 chars, placeholder steps `(not stated in the v0.5 acceptance criterion)`, appended `(SHALL)`): recommend
     better titles and wording per id; on Y edit those migrated deltas (ids never change). `M skip` or done → continue
     with the new change (SKILL.md §1.3).
4. The migrated change folders still carry pre-0.13 ids (capability keys, `T-n`, `D-n`): finish with `/hitl:migrate`
   (0.13 change keys) before planning further.
