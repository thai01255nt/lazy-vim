# HITL conventions — spec layer (plan, design, tasks, archive, sync, overview)

Read with `conventions.md` (core).

## Confirm a name
- New change: `Create change \`feat-x\`? (Y/n) or enter a different id:`
- Existing file conflict: `\`tasks.md\` exists. (update/overwrite)` — 💡 update.

## Naming and layout
- Change id: `[type]-[slug]`, type ∈ feat|fix|refactor|perf|docs|test|chore; slug = short kebab case; ≤ 48 chars.
- Capability = a business area (`accounts`), flat kebab case; key = 2–6 capitals (`ACC`), unique, never changed.
- Spec ids (`shared/spec-format.md`): requirement `ACC-R3`, scenario `ACC-R3.S1`, rule `ACC-BR1`, flow `ACC-UC1`, from
  `hitl-index spec next-id`; ids are identity, never renumbered or reused. Decisions `D-n` are local to one change's
  `design.md`, max+1, never edited after approval (supersede, `amend-spec.md`). Task ids from `hitl-index next-id`.
- Project dir `.hitl/`:
  `docs/` (steering: BUSINESS-CONTEXT, ARCHITECTURE, PATTERNS-CONVENTIONS, CODEBASE-MAP, optional CONSTITUTION) ·
  `specs/<capability>/spec.md` + `specs/GLOSSARY.md` (living specs) ·
  `changes/<id>/` (proposal, spec deltas, glossary, design, data-model, contracts, tasks.md) ·
  `archive/<date>-<id>/` (finished changes) · `tasks/quick-<slug>.md` · `index/ reviews/ .inbox/` ·
  `hitl.config.json`, `linear.map.json`. A v0.5 `planning/` dir is legacy, read-only (migrate: `hitl-index migrate --specs`).
- Audience: proposal, spec deltas and glossary are business-readable (no code names); design, data-model, contracts and
  tasks are for developers. Prose may follow the user's language; spec keywords stay English.

## Anti-hallucination (kept from v2)
- Prefer proven tech (3+ years in production). Verify before suggesting; research if unsure.
- If still unverifiable, write "unknown". Never fabricate APIs, files, versions, metrics or quality scores.
- Link official docs when recommending a library or pattern.
