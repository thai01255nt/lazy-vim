# HITL conventions — spec layer (plan, design, tasks, archive, sync, overview)

Read with `conventions.md` (core).

## Confirm a name
- New change: `Create change \`feat-x\`? (Y/n) or enter a different id:`
- Existing file conflict: `\`tasks.md\` exists. (update/overwrite)` — 💡 update.

## Naming and layout
- Change id: `[type]-[slug]`, type ∈ feat|fix|refactor|perf|docs|test|chore; slug = short kebab case; ≤ 48 chars.
- Change key = 2–5 capitals (`PWR`) in the proposal meta, unique forever (active and archived changes, legacy keys,
  quick-file keys, reserved `QT`; `CHANGE_KEY_TAKEN`); suggested by `hitl-index spec key <change-id> --title "…"`, never changed.
- Capability = a business area (`accounts`), flat kebab case; it is the folder of the spec, not part of any id.
- Spec ids (`shared/spec-format.md`) carry the key of the change that created them: requirement `PWR-R1`, scenario
  `PWR-R1.S1`, rule `PWR-BR1`, flow `PWR-UC1`, from `hitl-index spec next-id <change-id>`; MODIFIED/REMOVED keep the
  original id; ids are identity, never renumbered or reused. Decisions `PWR-D1` (`spec next-id <change-id> --kind D`),
  max+1 within the change, never edited after approval (supersede, `amend-spec.md`). Task ids `PWR-T3` from
  `hitl-index next-id <change-id>`. A quick file (`tasks/quick-<slug>.md`) has its own key (0.13.2):
  `hitl-index next-id --quick <slug>` → `QFLKM-T1`, header `← Change: none | key: QFLKM` (no gate; unique across
  branches by hash). A quick key used twice, or also a change's key → `QUICK_KEY_TAKEN`; a task not under its file's
  key → `TASK_KEY_MISMATCH`; a legacy shared `QT-T<n>` in a keyed project → `IDS_LEGACY` (`/hitl:migrate`).
- Project dir `.hitl/`:
  `docs/` (steering: BUSINESS-CONTEXT, ARCHITECTURE, PATTERNS-CONVENTIONS, CODEBASE-MAP, optional CONSTITUTION) ·
  `specs/<capability>/spec.md` + `specs/GLOSSARY.md` (living specs) ·
  `changes/<id>/` (proposal, spec deltas, glossary, design, data-model, contracts, tasks.md) ·
  `archive/<date>-<id>/` (finished changes) · `tasks/quick-<slug>.md` · `index/ reviews/ .inbox/` ·
  `hitl.config.json`, `<provider>.map.json` (linear|jira|github). A v0.5 `planning/` dir is legacy, read-only (migrate: `hitl-index migrate --specs`).
- Audience: proposal, spec deltas and glossary are business-readable (no code names); design, data-model, contracts and
  tasks are for developers. Prose may follow the user's language; spec keywords stay English.

## Anti-hallucination (kept from v2)
- Prefer proven tech (3+ years in production). Verify before suggesting; research if unsure.
- If still unverifiable, write "unknown". Never fabricate APIs, files, versions, metrics or quality scores.
- Link official docs when recommending a library or pattern.
