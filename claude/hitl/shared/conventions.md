# HITL conventions (shared by every hitl skill)

## Language
- Reply in the user's language (Vietnamese if the user writes Vietnamese). Mixed VN/EN is fine.
- Code, tags, identifiers, file names and CLI flags stay English. Planning/tasks prose may follow the user's language mix.

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

## File confirm
- New file: `Save as \`feat-x.md\`? (Y/n) or enter different name:`
- Existing name conflict: `\`feat-x.md\` exists. (update/new/overwrite)` — 💡 update.

## Naming
- `[type]-[feature].md`, type ∈ feat|fix|refactor|perf|docs|test|chore; feature = short kebab-case slug.
- The tasks file mirrors the planning file name. Quick tasks: `tasks/quick-<slug>.md`.
- Project dir: `.hitl/` → `docs/ planning/ tasks/ index/ reviews/ .inbox/`, `hitl.config.json`, `linear.map.json`.
- Spec ids: `R-n` (requirement) and `D-n` (decision) are numbered max+1 within their planning file; `hitl-index next-id`
  is for task ids only. Decisions are never edited after approval: supersede them (see `amend-spec.md`).

## Anti-hallucination (kept from v2)
- Prefer proven tech (3+ years in production). Verify before suggesting; research if unsure.
- If still unverifiable, write "unknown". Never fabricate APIs, files, versions, metrics or quality scores.
- Link official docs when recommending a library or pattern.

## Quality checklist (kept from v2)
- Structure: single responsibility, clear separation, consistent naming.
- Security: validate input, no secrets in code, parameterized queries, safe paths/shell.
- Async/resources: await everything, cleanup on every path (finally / context managers).
- Errors: structured, typed errors; no swallowed exceptions; structured logging.
- Integration: follow existing patterns (PATTERNS-CONVENTIONS), reuse before creating.

## Never
- Edit generated files: `index/**` (incl. `index/linear.*.json`), `docs/CODEBASE-MAP.md`, `reviews/*.review.md`,
  `reviews/feature-*.md`, `reviews/feature-*.security.json`,
  `skeleton.lock.json`, `state.json`, `linear.map.json` (only `hitl-index tickets record|diff --relink` writes it).
- Edit an `@status` tag or the tasks md `status:` / `[ ]`/`[x]` boxes (only `hitl-index status --sync-tags` does).
- Change a locked signature or docstring without telling the user it needs `/hitl:approve <T>`.
- Run `hitl-index approve … --by human` unless the user typed `/hitl:approve` in this turn.
- Run `hitl-index approve … --by human-override` unless the user typed `/hitl:implement <T> --lane fast` (or
  `--feature <file> --lane fast`) for that task. Never suggest `--lane fast` to get past a gate.
- Use line numbers in ids, docs or tasks. Refer to symbols as `Class.method` or `path#Class.method`.

## References
- Tag grammar: `${CLAUDE_PLUGIN_ROOT}/shared/tag-grammar.md`
- Templates: `${CLAUDE_PLUGIN_ROOT}/shared/templates/`
- Accept + amend spec: `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md`
