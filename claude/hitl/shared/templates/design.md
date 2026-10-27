<!-- audience: dev -->
<!-- Adapted from github/spec-kit (MIT) — see NOTICE.md. Source: templates/plan-template.md @ ee94598. Changes: hitl decision table (D-n, serves), module-level components only, risks and test strategy. -->
# Design: {Change title}
> change: {change-id} | status: draft | updated: {YYYY-MM-DD}

## Context
- {fact} (source: {path or doc})

## Goals / Non-goals
- {goal} / {non-goal}

## Constitution check
<!-- only if .hitl/docs/CONSTITUTION.md exists: one line per principle touched: ok | waived (why) -->

## Architecture (C4)
<!-- optional (shared/formats/architecture-c4.md): only when a system boundary, external system or container changes.
     Mermaid C4Context / C4Container (level 1–2), or the flowchart fallback. -->

## Decisions
<!-- the decision log (parsed): serves = requirement/rule ids of the change's spec view;
     status (MADR): proposed | accepted | rejected | deprecated | superseded by D-n. Never edit an approved row: supersede it. -->
| id | decision | why | alternatives | cost if wrong | serves | status |
|----|----------|-----|--------------|---------------|--------|--------|
| D-1 | {decision} | {why} | {alternatives} | {cost if wrong} | — | accepted |

<!-- MADR 4 record (shared/formats/decisions.md) for each decision with ≥ 2 real options or a high cost if wrong -->
### D-1 {short title: problem and solution}
- **Context and problem**: {forces; cite ## Context facts or requirement ids}
- **Decision drivers**: {driver}, {driver}
- **Considered options**: (1) {option} (2) {option}
- **Decision outcome**: chosen ({n}), because {justification tied to the drivers}
- **Consequences**: Good: {…}. Bad: {…}.
- **Confirmation**: {test, review or fitness function that checks it}

## Components
<!-- module/service level only. NO function signatures, NO per-file symbol lists -->
- {component} — {responsibility} — new|changed — (D-1)

## Data model
<!-- or "see data-model.md" -->

## Contracts
<!-- one line per file in contracts/: "- contracts/<file> — <boundary>". Templates: shared/templates/contracts/
     (OpenAPI 3.1 HTTP, AsyncAPI 3 events, JSON Schema 2020-12 payloads, CLI md) — shared/formats/contracts.md -->

## State machines
<!-- optional: technical lifecycles (shared/formats/state-machines.md): stateDiagram-v2 + | from | event | guard | action | to | -->

## Flow / sequence

## Error handling

## Test strategy
<!-- highest seams (endpoint, CLI, module boundary), test kinds, data; per ADDED/MODIFIED requirement -->

## Risks
<!-- concurrency|security|public-api|data|perf; security: one trust-boundary line -->

## Migration / rollout

## Parked from planning

## Open questions

## Changelog
