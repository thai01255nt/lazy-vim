---
name: migrate
description: Upgrades a hitl project from pre-0.13 ids (T-n, D-n, capability keys like ACC-R3) to change-key ids (PWR-T1, PWR-R1, PWR-D1), and 0.13.0–0.13.1 quick tasks (QT-T7) to a key per quick file — one key table, a full rename map, then one apply. Use when a hitl command reports IDS_LEGACY, after upgrading the plugin from 0.12, or for "migrate ids", "upgrade hitl ids", "nâng cấp id", "chuyển id". Not for a ≤ 0.3 `.claude/custom/` dir (/hitl:setup); v0.5 planning files go through `hitl-index migrate --specs` first.
argument-hint: "[--force]"
allowed-tools: Read Glob Bash(hitl-index *) Bash(node *hitl-index.mjs *) Bash(git status *)
---

# /hitl:migrate — change-key ids (0.13)

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. Id grammar: `${CLAUDE_PLUGIN_ROOT}/shared/spec-format.md` ("Names and
ids"). Only the CLI rewrites files here; you never edit an id by hand.

Arguments: `$ARGUMENTS` — empty, or `--force` (only when the user typed it, or picked it at the gate below: it skips the
uncommitted-changes check).

**What changes.** Every change gets a key of 2–5 capitals (unique forever, archived changes included). Every id is
renumbered under the key of the change that created it: tasks `T-12` → `PWR-T1` (ACs `PWR-T1.AC2`), requirements
`ACC-R3` → `PWR-R1` (scenarios `PWR-R1.S1`), rules `PWR-BR1`, flows `PWR-UC1`, decisions `D-1` → `PWR-D1`. Living ids
whose creating change is unknown (written before hitl) get a legacy key per capability: `L` + the old capability key
(`LACC-R1`). Each quick file (`.hitl/tasks/quick-<slug>.md`) gets a key of its own in its header
(`← Change: none | key: QFLKM`; `Q` + slug letters + hash letters, the same in the dry run and the apply): its `T-20` or
legacy shared `QT-T7` becomes `QFLKM-T1` — 0.13.0–0.13.1 projects run `/hitl:migrate` once more for this alone.
Notes `N-k`, findings `F-n` and glossary terms do not change.
The CLI rewrites active changes, archives, living specs (their meta lines lose `| key:`), quick tasks, notes, code
tags (`@task`, `@ac`, `@dec`, `TODO(impl …)`), the lock (`hitl.lock/2`, hashes of tag-only edits re-baselined so no
drift appears), state, ticket maps and review dirs, and writes the old → new map to `.hitl/index/id-map.json`.

## 1. Dry run (no writes)
🔍 `hitl-index migrate --ids --dry-run --json`. Exit 3 → per conventions.
- `.hitl/planning/*.md` present (v0.5) → first `hitl-index migrate --specs --dry-run`, show it, apply on Y, then go on.
- `status: "current"` (nothing to migrate) → `✅ ids are already 0.13 (change keys).` + `🎯 next: /hitl:flow`. Stop.
- `status: "dirty"` (`.hitl/` or tagged source files have uncommitted changes, listed in `dirty[]`) → show the files, then ⛔ GATE
  `1. 💡 commit or stash them first, then /hitl:migrate again · 2. migrate anyway (--force)` END THE TURN. Never choose
  `--force` yourself.
- `status: "conflict"` (taken or invalid keys) → one ❌ line per `conflicts[]` item; nothing was written. Stop.
JSON fields used below: `keys[]` {label, change, archived, key, source}, `legacyKeys[]` {capability, oldKey, key, ids},
`quickKeys[]` {file, slug, key, source, tasks},
`map` {tasks, specs, decisions, local}, `counts`, `files` {hitl, code, renamed}, `lock` {tasks, rebaselined, schema},
`unresolved[]` {file, line, id, reason}.

## 2. ⛔ GATE — the key table (accept or edit all at once)
One table for every change (active and archived) plus the legacy capability keys and the quick files; `source` is
`suggested` (from the change id and title; a quick file's from its slug and a hash), `proposal` (already set) or `given`:
```
🔑 Change keys (2–5 capitals, unique forever)
| # | change | state | key | source |
|---|--------|-------|-----|--------|
| 1 | feat-password-reset | archived 2026-10-20 | PWR | suggested |
| 2 | feat-fee | active | FEE | suggested |
| 3 | accounts (living ids of unknown origin) | legacy | LACC | suggested |
| 4 | tasks/quick-fix-label.md (quick, QT-T7) | quick | QFLKM | suggested |
Keys OK? (Y) · or edit rows: "2 FEES, 3 LACT"
```
END THE TURN. On edits: re-run the dry run with
`--keys "<change-id>=<KEY>,…,cap:<capability>=<KEY>,quick:<slug>=<KEY>"` holding the **whole** table (every row, edited or not) and show
the table again only when the CLI refuses a key (`CHANGE_KEY_TAKEN`, not 2–5 capitals: say why, keep the rest).

## 3. ⛔ GATE — rename map and files
From the (re-)run dry run:
```
🔁 Rename map — tasks 14 · spec ids 12 · decisions 6 (ACs and scenarios follow their task / requirement)
   T-12 → PWR-T1 · T-12.AC2 → PWR-T1.AC2 · ACC-R3 → PWR-R1 · ACC-R3.S1 → PWR-R1.S1 · D-1 (feat-password-reset) → PWR-D1 · QT-T7 → QFLKM-T1 · …
📝 Files: .hitl/changes/ 12 · .hitl/archive/ 18 · .hitl/specs/ 3 · .hitl/tasks/ 1 · source files with tags 9
   lock: hitl.lock/2, 31 entries re-keyed, 4 hashes re-baselined · tickets map 1 · review dirs 3
⚠️ unresolved: <one line each, e.g. a `@dec D-2` whose change cannot be found> (they stay as they are)
Apply? (Y/n)
```
Show up to 8 sample renames, then counts; `full` → print the whole map from the JSON. `unresolved` items never block:
say they stay unchanged and must be fixed by hand afterwards (`hitl-index trace --json` lists them). END THE TURN.

## 4. Apply
On Y: 📝 `hitl-index migrate --ids --keys "<the exact table>" [--force] --json` (`--force` only per the rule above).
Exit 1 → print its reasons; nothing was written. Stop. Then verify, each must be clean:
1. `hitl-index index --all --json`
2. `hitl-index spec validate --json` (0 errors)
3. `hitl-index trace --check --json` (no `block` items)
4. `hitl-index drift --json` (no new drift: tag-only hashes were re-baselined)
5. `hitl-index status --json`
Print:
```
✅ Migrated to change-key ids: <n> files rewritten · map: .hitl/index/id-map.json
🔍 index ok · spec validate ok · trace ok · drift ok
💡 Commit it as one commit: chore(hitl): migrate to 0.13 ids
```
Any check not clean → ❌ one line per item and `🎯 next: /hitl:sync` (never undo by hand; the git diff is the undo).
Ticket trackers: markers in remote issues are rewritten on the next `/hitl:tickets push` (old markers are still read
through the map). Old ids in chat or commits: `hitl-index context <old-id>` resolves them through `id-map.json`.
🎯 next: `hitl-index status --json` `.next`.

## Rules
- Running it again is a no-op (`status: "current"`).
- Never edit ids, the lock, `id-map.json` or tag lines by hand; never pass `--force` or `--keys` the user did not see
  at the gates.
- Do not run any other hitl phase between the dry run and the apply.
