---
name: plan
description: Spec-only planning (WHAT and WHY) for a hitl change: grill-style interview → business-readable proposal + spec deltas (requirements, scenarios); also "<change-id> amend". Use when the user describes something to build or fix, or says "plan", "spec", "requirements", "lên plan", "yêu cầu", "viết spec". Not for architecture or implementation choices (/hitl:design).
argument-hint: "[description | <change-id> [amend]]"
allowed-tools: Read Glob Grep Write Edit Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:plan — the spec (WHAT / WHY)

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-spec.md`.
Templates: `${CLAUDE_PLUGIN_ROOT}/shared/templates/{proposal,spec-delta,glossary}.md`.
Interview: the `hitl:grilling` skill + `${CLAUDE_PLUGIN_ROOT}/shared/interview.md` + `${CLAUDE_SKILL_DIR}/references/elicitation.md`
(coverage, hotspots 🔥, stop rule). Artifacts: `${CLAUDE_PLUGIN_ROOT}/shared/artifacts.md`. Step 4.1 says when to read them.
**Read only when needed** (not up front):
- `${CLAUDE_PLUGIN_ROOT}/shared/formats/<file>` — before writing the first instance of that artifact in this change:
  `requirement-quality.md` (first requirement or NFR), `decision-tables.md`, `state-machines.md` (lifecycle),
  `use-cases.md` (Flow).
- `${CLAUDE_PLUGIN_ROOT}/shared/spec-format.md` (parser rules, all validate codes) — when `spec validate` reports an
  error whose fix is not clear from its message, or for a MODIFIED/REMOVED block of a living spec.
- `${CLAUDE_SKILL_DIR}/references/deep.md` — when the user replies `deep <ID|topic>`.
- `${CLAUDE_SKILL_DIR}/references/migrate.md` — only when `.hitl/planning/*.md` (v0.5 legacy) exists.
- `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md` — amend mode (§7) only.

Arguments: `$ARGUMENTS` — a description, a change id, `<change-id> amend`, or empty.
`<change-id> amend` → section 7 only. Empty and no work described in this conversation → ⛔ GATE
`Please describe what you want to build or fix (or a change id):` END THE TURN.

**Audience rule.** Everything this skill writes is business-readable (b): a BA or PO must understand it. No code names,
file paths, class/function/library names, SQL, HTTP verbs or field names, and nothing in backticks (`BIZ_CODE_TOKEN`;
name another change in plain words). No component breakdown,
no test strategy, no function design — those belong to `/hitl:design` and later. Prose follows the user's language;
keywords (`SHALL`, `GIVEN/WHEN/THEN`, `Requirement:`, `Scenario:`) stay English.

## 1. Resolve the change (no questions when unambiguous)
Not initialized → per conventions (`/hitl:setup`), stop.
1. 🔍 Glob `.hitl/changes/*/proposal.md`; match the arguments on change id, `#` title and capability names.
   - The argument is an existing change id → resume it, no gate. A proposal with `status: approved` (not amend) →
     `💡 Spec is approved. Editing sets it back to draft (💡 small change: /hitl:plan <id> amend).`
   - The argument starts with a valid **new** change id (`feat-…`, `fix-…`, …; ≤ 48 chars, kebab case) → create that
     id, no name question.
   - Partial matches → they go into the gate below as `Continue with existing change? (1/2/new)`.
   - Otherwise propose `<type>-<slug>` (type from the request: feat/fix/refactor/perf/docs/test/chore; slug ≤ 4 words).
2. **Legacy v0.5 planning** (`.hitl/planning/*.md` exists): read `references/migrate.md` and follow its steps 1–2 (dry
   run, conflicts, the migration block `M.` in the gate below). None → skip.
3. ⛔ GATE — one gate for everything still open (skip it when nothing is open):
   ```
   📋 /hitl:plan
   <migration block, if any>
   M. 💡 migrate with these names (Y) · rename: "M 1 accounts ACC" · "M skip"
   C. Create change `feat-deactivate-user`? (Y/n) or enter a different id      (or: Continue with existing change? (1/2/new))
   Reply e.g. "Y" (all recommendations) · "M skip, C Y" · "M 1 accounts ACC".
   ```
   END THE TURN.
4. On the reply:
   - Migrate (`M` reply): per `references/migrate.md` step 3.
   - Create the change: `.hitl/changes/<id>/proposal.md` from the template (`status: draft`, today, title from the
     request), then step 2.

## 2. Load (no questions)
- `.hitl/docs/BUSINESS-CONTEXT.md`, `.hitl/specs/GLOSSARY.md` (if present), `hitl-index spec list --json`
  (capabilities, keys, requirement titles), `hitl-index change --json` (other active changes).
- A resumed change: its proposal, deltas, glossary delta and `## Open questions`.
- Do **not** load ARCHITECTURE, PATTERNS-CONVENTIONS or CODEBASE-MAP, and do not read source code yourself: the scout
  does. Missing BUSINESS-CONTEXT → `❌ BUSINESS-CONTEXT missing (💡 /hitl:overview)` and continue.

## 3. Scout (subagent; keeps code out of this conversation)
Spawn one `hitl:spec-scout` (Agent tool, `subagent_type: hitl:spec-scout`) and wait for it (it is short: ≤ 25 reads).
Meanwhile load the technique (§4.1). Prompt:
```
Change: <id>. Summary: <2–4 business sentences>. Candidate capabilities: <from spec list, or "none yet">.
Behaviour questions: <what the system does today that the interview depends on, ≤ 6>.
Output: .hitl/changes/<id>/.scout.json   CLI: <hitl-index | node …/hitl-index.mjs>
```
**Never read source code or tests yourself, and never write `.scout.json`** — that is the scout's job and keeps this
conversation small. When it reports: facts → proposal `## Assumptions` in business words (never the `source` path);
`unknowns` → frontier questions; `overlaps` → one `⚠️ overlaps <change>: <ids>` line in round 1. Scout failed or
unavailable → one ⚠️ line, ask the `[S]` and current-behaviour questions from `spec list` alone (the user may answer
"don't know"; record it as an assumption).

## 4. Load the technique, draft, choose artifacts
1. **Grilling, automatically**: invoke the Skill tool with `hitl:grilling` (once per conversation; the user never
   calls it). If the Skill tool is unavailable, Read `${CLAUDE_PLUGIN_ROOT}/skills/grilling/SKILL.md`. Then Read
   `${CLAUDE_PLUGIN_ROOT}/shared/interview.md` (the hitl overlay; it wins on format and recording),
   `${CLAUDE_SKILL_DIR}/references/elicitation.md` and `${CLAUDE_PLUGIN_ROOT}/shared/artifacts.md` (all three, every
   new conversation). The other files of the header list are read only at the moment it names.
2. **Draft only what the user already said** (new change): proposal `## Why` and `## What changes`; a delta per
   capability that is already clear (write `> capability: … | key: … | change: <id>` and `## Purpose` for a new
   capability **before** `hitl-index spec next-id <cap> --kind R`); one requirement per behaviour the user stated, each
   with ≥ 1 scenario (`hitl-index spec next-id --scenario <REQ-ID>`). A guess → `[NEEDS CLARIFICATION: …]` + a round-1
   question. Behaviour the user did not ask for is never written: it becomes a question with a recommendation.
   Add the proposal `## Coverage` table with a first status per category (elicitation.md §1); score hotspots (§2).
3. **Artifacts** (artifacts.md): decide the (b) rows and the design row. High confidence → act, print
   `💡 Assumed: …`, record the `## Artifacts` row. Uncertain → `[A]` question (max 2 per round).

## 5. Round loop (one ⛔ GATE per round, interview.md format)
- Round 1: `[R]` behaviour — actors, triggers, states, unwanted behaviour (errors, abuse), optional features, out of
  scope — plus `[S]` capability mapping once the scout answered (existing capability → MODIFIED; new business area →
  new capability + key, recommended from `spec list`).
- Later rounds: ❌ then ⚠️ coverage categories, hotspots 🔥 drilled into first (elicitation.md §1–2). A ✅ or —
  category asks nothing. `deep <ID|topic>` → the technique menu (`references/deep.md`).
- Header `🌳 Round <n> — [R][S][A]   (settled: <ids> · S: <scenarios> · open: <n> · 🔥 <hotspots>)` + the coverage
  line `Độ phủ: Scope ✅ · Data ⚠️ · Edge ❌ · NFR — · …` (user's language). END THE TURN after `Reply:`.
- On the reply, record per interview.md §7 — only `proposal.md`, `specs/<cap>/spec.md`, `glossary.md`; a design
  idea is parked (interview.md §8) — then recompute the frontier. Recording rules:
  - EARS statement with exactly one `SHALL|MUST|SHOULD|MAY` and a named actor (ISO 29148 / INCOSE: singular,
    unambiguous, verifiable — no vague words like "fast", "easy", "nhanh", "dễ dùng", "v.v."; ask for the number
    instead); ≥ 1 scenario per requirement; ≥ 1 failure or edge scenario when it validates input or handles errors;
    every step observable from outside the system.
  - NFR → `Quality: <ISO 25010:2023 characteristic> (<sub-characteristic>)` + `Fit: <measurable criterion>` (metric,
    threshold, how measured). No number from the user → a `[Q]`/`[R]` question with a recommended value, never invented.
  - Changing living behaviour → MODIFIED with the **full** block (`hitl-index spec show <ID> --json`) + `Changed:`;
    removing → REMOVED + `Reason:`; behaviour that must keep working (fix/refactor/perf) → `## Unchanged behaviour`.
  - A policy shared by requirements → `### Rule: <KEY>-BR<n>`, referenced by `Rules:`; a decision table inside it uses
    DMN form (`Hit policy: U` by default, `(in)`/`(out)` columns, rules that never overlap under U); a business
    lifecycle is a Rule with `stateDiagram-v2` + a `from | event | guard | action | to` table. A use case is a
    `### Flow:` in Cockburn lite form (Primary actor, Trigger, Success guarantee, numbered steps, extensions `2a.`).
    A new domain noun (also a lifecycle state) → a `glossary.md` term with `_Avoid_:` synonyms.
  - Postponed → proposal `## Deferred` (never in a delta). Excluded → `## Out of scope`.
  - Update the `## Coverage` table and the hotspot scores after every reply.

## 6. Close
When the frontier is empty or the user said `done`:
1. `hitl-index spec validate <id> --json`. Fix every error yourself and reword `BIZ_CODE_TOKEN` hits (max 3 loops).
   Standards warnings (`REQ_VAGUE`, `REQ_COMPOUND`, `REQ_PASSIVE_NO_ACTOR`, `NFR_NO_FIT`, `DT_*`, `SM_*`, `UC_*`):
   fix the wording/structure yourself when the fix adds no new behaviour (split a compound requirement, name the actor,
   add the hit policy); a missing number or a real rule overlap becomes a question in the next round.
   Warnings you keep are listed at the gate. **Stop rule** (elicitation.md §4): any `COVERAGE_GAP` or `REQ_UNCLEAR`
   → show the gap gate instead of step 3 (one more round · `deep <ID>` · force → `💡 Forced:` line). END THE TURN.
2. `spec.reviewOnClose` (config, default true) and ≥ 3 requirements in the change → spawn `hitl:spec-reviewer`
   (`Change: <id>. Dir: .hitl/changes/<id>/. Output: .hitl/changes/<id>/.spec-review.json. CLI: …`). Apply `kind:
   wording` findings yourself and re-validate; `kind: behaviour` findings become one more round. Failure → one ⚠️ line.
3. ⛔ GATE:
   ```
   📋 feat-password-reset — capabilities: accounts (+2 ~1 -1) · scenarios: 7 · rules: 1 · terms: 1
   artifacts: design ✅ · decision table 💡 assumed · use-case flow ⏭️ skipped · open: 0
   validate: ✅ (warn 1: BIZ_CODE_TOKEN ACC-R4) · spec review: 2 wording fixes applied
   Spec complete? Mark approved and continue to /hitl:design? (Y/n)
   ```
   Design skipped → `… continue to /hitl:tasks? (Y/n)`. END THE TURN.
4. On Y: proposal `status: approved`, `updated:` today, re-run validate (an unforced `NEEDS_CLARIFICATION` is now an
   error: resolve it with the user first). Print `✅ Spec approved.` and `🎯 next: /hitl:design <id>` (or `/hitl:tasks <id>`
   when design is skipped). On n: continue the round loop with what they name.

## 7. Amend mode (`/hitl:plan <change-id> amend`)
A small change to an approved or archived spec, through `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md`.
1. Load the change, `hitl-index spec show --change <id> --json` and `hitl-index trace <id> --json`. Proposal still
   draft → `💡 Spec is draft; editing normally.` and use the round loop.
2. One ⛔ GATE round: the user's change as questions (which ids to modify, remove or add), each with `💡 Recommended`,
   then the 📐 Spec delta preview (amend-spec.md §2) and `Apply? (Y/n/edit)`. END THE TURN.
3. On Y apply per amend-spec.md (active change → its delta; archived → a mini change `fix-<slug>`). New behaviour or a
   new capability → proposal `status: draft` and `🎯 next: /hitl:tasks <id> (update)`; else `✅ Amended (<n> changes).`
   and the next step from amend-spec.md §5.

## Rules
- Write only inside `.hitl/changes/<id>/`: `proposal.md`, `specs/*/spec.md`, `glossary.md`, and design.md
  `## Parked from planning` (parking only). Never `.hitl/specs/**` or `.hitl/archive/**` (only `hitl-index spec
  merge|archive` writes them), never code, never a v0.5 `.hitl/planning/` file.
- Ids only from `hitl-index spec next-id`; ids never change. Keep the template headings exactly (the CLI parses them).
- No invented metrics, estimates or scores. Numbers in requirements only when the user gave or accepted them.
