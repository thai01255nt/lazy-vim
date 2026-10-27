# v0.5 planning migration (`/hitl:plan` §1, only when `.hitl/planning/*.md` exists)

v0.5 `.hitl/planning/*.md` files are legacy and read-only; they are migrated to changes (spec + design + tasks).

1. Run 🔍 `hitl-index migrate --specs --dry-run --json`.
2. Result:
   - `status: nothing` → ignore. `conflicts[]` not empty → show them in one ⚠️ line each, no migration offer.
   - Else add the migration block to the gate below (asked on every run until migrated or the user skips it):
     ```
     💡 v0.5 planning files found — migrate them to changes (spec + design + tasks):
     | # | planning | → change | capability | key | target |
     |---|----------|----------|------------|-----|--------|
     | 1 | feat-user-register.md | feat-user-register | user-register | UR | changes |
     ⚠️ <warnings, max 5 + count>
     ```
     Capability = a business area (kebab case, e.g. `accounts`), key = 2–6 capitals (`ACC`), never changed later.
     Recommend a better name than the derived slug when the planning title suggests one (`💡 1 → accounts / ACC`).
   - Resuming a legacy file by name without migrating → `🛑 v0.5 planning files are read-only — migrate first.`
3. On an `M` reply (accept or rename): `hitl-index migrate --specs --map '<json>' --json` with `{"<planning name>":{"capability":"<cap>","key":"<KEY>"}}`
     for every row (renamed or recommended). Exit 1 → show its conflicts and ask again. Print
     `✅ migrated <n> → .hitl/changes/` + the warnings. Then a **rename round** (round format of SKILL.md §5, tag `[S]`, ≤ 7 questions)
     when migrated titles are crude (requirement/scenario titles cut at 60 chars, placeholder steps
     `(not stated in the v0.5 acceptance criterion)`, appended `(SHALL)`): recommend better titles and wording per id;
     on Y edit those migrated deltas (ids never change). It may share a gate with round 1 of the new change
     (number its questions `M1…`).
