---
name: design
description: Technical design (HOW) of an approved hitl change: grill-style developer interview → design.md (decisions, components, data model, contracts, test strategy, risks); "--auto" decides alone. Use after /hitl:plan or for "design", "thiết kế", "architecture", "how should we build", "kiến trúc". Not for requirements (/hitl:plan) or function signatures.
argument-hint: "<change-id> [--auto] | <change-id> amend"
allowed-tools: Read Glob Grep Write Edit Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:design — the design (HOW)

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-spec.md`.
Templates: `${CLAUDE_PLUGIN_ROOT}/shared/templates/{design,data-model}.md` and `shared/templates/contracts/*`.
Interview: the `hitl:grilling` skill + `${CLAUDE_PLUGIN_ROOT}/shared/interview.md`. Artifacts:
`${CLAUDE_PLUGIN_ROOT}/shared/artifacts.md` (step 3.1 reads them).
**Read only when needed** (not up front):
- `${CLAUDE_PLUGIN_ROOT}/shared/formats/<file>` — before writing the first instance of that artifact in this change:
  `decisions.md` (the first MADR record `### D-n`), `contracts.md` (OpenAPI 3.1 / AsyncAPI 3 / JSON Schema 2020-12 /
  CLI md), `architecture-c4.md`, `state-machines.md`.
- `${CLAUDE_PLUGIN_ROOT}/shared/spec-format.md` (§ Design: the D table and contract rules the CLI checks) — when
  `spec validate` reports an error whose fix is not clear from its message.
- `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md` — for a `💡 Needs spec` delta preview (§4) or amend mode (§7).
Ideas adapted (no text): obra/superpowers brainstorming ("look before you ask", lay out approaches, scale the ceremony
to the change) and the github/spec-kit plan artifact set — see NOTICE.md.

Arguments: `$ARGUMENTS` — `<change-id> [--auto]`, `<change-id> amend` (supersede decisions, `shared/amend-spec.md`), or
empty (then the change from this conversation, else the active change with `phase: design` from `hitl-index change
--json`; several → ⛔ GATE `Design which change? (1/2/…)` END THE TURN; none → `🛑 No change to design. Run /hitl:plan first.`).

**Granularity limit (normative).** Modules/services/components, external interfaces (contracts), entities and fields,
component-level sequence, error strategy, test strategy and seams, risks, rollout. **Never** function signatures,
per-file symbol lists or code bodies: those belong to `/hitl:tasks` (`### Symbols`) and `/hitl:skeleton`.

## 1. Preconditions and load (no questions)
- `hitl-index change <id> --json`. Unknown → `🛑` + the list of active ids. Archived → `🛑 archived; use /hitl:plan <new id>`.
- Proposal `status: draft` → `⚠️ spec still draft` and continue (repeated at the gate).
- Proposal `## Artifacts` says `design | skipped` → `💡 Design was skipped in the spec (<why>). Continue anyway? (y/N)`
  ⛔ GATE END THE TURN; on y change that row to `asked → included`.
- Load: `hitl-index spec show --change <id> --json` (the effective spec view), the proposal, `.hitl/docs/ARCHITECTURE.md`,
  `PATTERNS-CONVENTIONS.md`, `CODEBASE-MAP.md`, `CONSTITUTION.md` (if present), and the existing `design.md` (resume;
  its `## Parked from planning` ideas are frontier items).
- New design: write `design.md` from the template (`status: draft`, today); drop the template rows; remove the
  `## Constitution check` section when there is no CONSTITUTION.md.

## 2. Facts (subagent; keeps code reading out of this conversation)
Dispatch **one Explore subagent** (thoroughness: medium) with the code questions the design depends on: existing
modules in the area, reusable services, data shapes and persistence, external interfaces, test setup and seams,
patterns to follow. Ask it for ≤ 20 bullet facts each with a path. Record them in `## Context` as
`- <fact> (source: <path>)`. Use `hitl-index context <ref> --json` for a single known symbol. Never ask the user a fact.
Only the questions that depend on a pending fact wait; ask the rest of the frontier now.

## 3. Technique and artifacts
1. **Grilling, automatically**: invoke the Skill tool with `hitl:grilling` unless it is already loaded in this
   conversation (the user never calls it). If the Skill tool is unavailable, Read
   `${CLAUDE_PLUGIN_ROOT}/skills/grilling/SKILL.md`. Then Read `${CLAUDE_PLUGIN_ROOT}/shared/interview.md` (overlay; it
   wins on format) and `${CLAUDE_PLUGIN_ROOT}/shared/artifacts.md`.
2. Decide the (a) artifacts (data-model, contracts, sequence, migration/rollout, research notes) per artifacts.md:
   high confidence → `💡 Assumed: …` + a row in the proposal `## Artifacts` table; uncertain → `[A]` question.
3. Constitution (if present): one line per principle the design touches in `## Constitution check`
   (`ok` | `waived (why)`); a waiver is always a `[D]` question.

## 4. Round loop `[D]` (one ⛔ GATE per round, interview.md format)
- Header `🌳 Round <n> — [D][A]   (settled: D-1…D-<k> · open: <n>)`.
- Frontier order: parked ideas and decisions that unblock others first (boundaries and components → data and contracts
  → errors → test strategy → risks → rollout). Discussion Mode when several approaches are valid (tie the
  recommendation to a requirement id or a `## Context` fact); Suggestion Mode for clear best practice.
- Record after every reply (interview.md §7): D rows (`serves` = requirement/rule ids from the spec view; `alternatives`
  filled; status `proposed` until the developer agrees, then `accepted`) plus a MADR record `### D-n <title>` (Context
  and problem, Considered options, Decision outcome, Consequences good/bad, optional Decision drivers/Confirmation) for
  every decision with ≥ 2 real options or a high cost if wrong, `## Architecture (C4)` (Context/Container mermaid, only
  per artifacts.md), `## Components` (`- <component> — <responsibility> — new|changed — (D-n)`), `## Data model` or
  `data-model.md`, `contracts/<file>` from the matching skeleton (HTTP `*.openapi.yaml`, events `*.asyncapi.yaml`, payloads
`*.schema.json`, CLI `cli-*.md`; only what the change adds or changes) + its `## Contracts` line
(`- contracts/<file> — <boundary>`), `## State machines` (technical lifecycles: `stateDiagram-v2` + transition table), `## Flow / sequence`
  (mermaid `sequenceDiagram` at component level, optional), `## Error handling`, `## Test strategy` (highest seams:
  endpoint, CLI, module boundary; test kinds; data — one line per ADDED/MODIFIED requirement), `## Risks`
  (`concurrency|security|public-api|data|perf` with why; for security one line naming the trust boundaries:
  `security: anonymous client → reset endpoint → account store`), `## Migration / rollout`. Parked ideas that were
  decided leave `## Parked from planning`.
- A decision that needs **new behaviour** → `💡 Needs spec: <behaviour>` + the 📐 delta preview of
  `shared/amend-spec.md` §2 in the same gate (the change's delta gets the requirement; proposal back to draft only for
  a new capability or a new `must` requirement).
- `done` → unanswered questions go to `## Open questions` with their recommendation.

## 5. `--auto` (build-then-review users)
No rounds. Decide every frontier item with its recommendation, write all artifacts, then one ⛔ GATE listing every
decision as `💡 Assumed: D-n <decision> (<why>)` plus the artifacts chosen, followed by the close summary (§6).
The user may reply with changes (`D-3: …`); apply them and show the gate again.

## 6. Close
1. `hitl-index spec validate <id> --json` (it also checks the D table, `serves` refs and contracts). Fix every error
   (`DESIGN_SERVES_UNKNOWN`, `DESIGN_DEC_STATUS`, `CONTRACT_MISSING`, …) yourself, max 3 loops, and the standards
   warnings (`DESIGN_DEC_INCOMPLETE`, `DESIGN_DEC_SUPERSEDE_UNKNOWN`, `CONTRACT_PARSE|VERSION|STRUCTURE`, `SM_*`).
   No `proposed` decision is left at the gate: each is accepted or rejected.
2. Coverage: every ADDED/MODIFIED `must` requirement has an accepted D that serves it, or is trivially covered
   (say which in one line). The trace reports `REQ_NO_DEC` later; fix it now.
3. ⛔ GATE:
   ```
   🏗️ Design feat-password-reset — D: 5 (accepted 5) · components: 3 (2 new) · contracts: 1 · data-model ✅
   risks: security (anonymous client → reset endpoint → account store) · test seams: reset endpoint, mail port
   must requirements without a serving D: none · open: 0 · validate: ✅ · spec: approved
   Design complete? Mark approved and continue to /hitl:tasks? (Y/n)
   ```
   END THE TURN. On Y: design `status: approved`, `updated:` today, print `✅ Design approved.` and
   `🎯 next: /hitl:tasks <id>`. On n: continue the rounds with what they name.

## 7. Amend (`<change-id> amend`)
Approved design: decisions are never edited in place — supersede per `shared/amend-spec.md` (new D row, old row
`superseded by D-k`, Changelog line), in one ⛔ GATE with the 📐 delta and `Apply? (Y/n/edit)`.

## Rules
- Write only in `.hitl/changes/<id>/`: `design.md`, `data-model.md`, `contracts/*`, and the proposal `## Artifacts`
  rows for (a) artifacts. Spec deltas only through the `💡 Needs spec` path. Never code, never `.hitl/specs/**`.
- No function signatures, no per-file symbol lists, no line numbers. Name existing modules as they are in the code.
- Anti-hallucination: proven tech, official docs linked for a new library, "unknown" when unsure.
