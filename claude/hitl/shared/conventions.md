# HITL conventions (core, shared by every hitl skill)

Parts read only by the skills that need them: `conventions-spec.md` (names, ids, `.hitl/` layout, audience,
anti-hallucination — plan, design, tasks, archive, sync, overview) and `conventions-code.md` (anti-hallucination,
quality checklist — skeleton, test, implement, review).

## Language
- Reply in the user's language (Vietnamese if the user writes Vietnamese). Mixed VN/EN is fine.
- Code, tags, identifiers, file names and CLI flags stay English. Spec/design/tasks prose may follow the user's language mix.

## CLI
- Call `hitl-index <cmd>`. If it is not on PATH, use `node ${CLAUDE_PLUGIN_ROOT}/scripts/hitl-index.mjs <cmd>`
  (unquoted path so it matches the skills' `Bash(node *hitl-index.mjs *)` permission; quote only if the path has spaces).
- Always pass `--json` when you parse the output. Exit codes: 0 ok, 1 precondition/drift fail, 2 usage, 3 not initialized.
- Exit 3 or "not initialized" → print `❌ HITL not initialized here. Run /hitl:setup` and stop (unless the skill says otherwise).
- Never write index/lock/state JSON yourself. Tooling owns them.

## Gate protocol (Universal Stop Protocol)
A step marked `⛔ GATE` is a real stop:
1. Print a compact summary (tables over prose).
2. Print numbered options or a `(Y/n)` question. Mark the recommended option with 💡.
3. END THE TURN. No tool calls after the question. Do not answer for the user.
- A bare "y", "yes", "ok", "được", "ừ", "có" accepts the recommended option. "n"/"không" declines.
- Missing required input at a gate (file, task id) → show the error and stop; do not guess.

## No over-questioning
- Outside gates, never ask. Decide with the stated default and say it in one line: `💡 Assumed: …`.
- Facts (what the code does, which file/symbol exists, test framework) are YOUR job: Read/Grep/Glob,
  `hitl-index context`, or an Explore subagent. Only decisions go to the user.

## Status prefixes
🔍 searching · 📝 writing · ✅ done/ok · ❌ failed/missing · ⚠️ drift/warning · 🛑 blocked ·
⚡ fast-lane/auto step · 💡 recommendation/assumption · 🎯 next step · ⛔ gate

## Ids (details: `conventions-spec.md`)
Change id `[type]-[slug]`; spec ids `ACC-R3`, `ACC-R3.S1`, `ACC-BR1`, `ACC-UC1`; decisions `D-n` per change; tasks `T-n`.
Ids come from `hitl-index` (`spec next-id`, `next-id`) and are never renumbered or reused.

## Never
- Edit `.hitl/specs/**`, `.hitl/archive/**` (except tooling-written status in archived `tasks.md`) or `**/.base.json`:
  only `hitl-index spec merge|archive` writes them; behaviour changes go through a change (`amend-spec.md`).
- Edit generated files: `index/**` (incl. `index/<provider>.*.json`), `docs/CODEBASE-MAP.md`, `reviews/*.review.md`,
  `reviews/feature-*.md`, `reviews/feature-*.security.json`,
  `skeleton.lock.json`, `state.json`, `<provider>.map.json` — linear|jira|github (only `hitl-index tickets record|diff --relink` writes it).
- Edit an `@status` tag or the tasks md `status:` / `[ ]`/`[x]` boxes (only `hitl-index status --sync-tags` does).
- Change a locked signature or docstring without telling the user it needs `/hitl:approve <T>`.
- Run `hitl-index approve … --by human` unless the user typed `/hitl:approve` in this turn.
- Run `hitl-index approve … --by human-override` unless the user typed `/hitl:implement <T> --lane fast` (or
  `--feature <change-id> --lane fast`) for that task. Never suggest `--lane fast` to get past a gate.
- Use line numbers in ids, docs or tasks. Refer to symbols as `Class.method` or `path#Class.method`.
