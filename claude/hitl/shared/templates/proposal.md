<!-- audience: business -->
<!-- Adapted from github/spec-kit (MIT) and mattpocock/skills (MIT) — see NOTICE.md. Source: templates/spec-template.md @ ee94598, to-spec @ 5beb35b. Changes: business-only proposal with capabilities, artifacts and deferred sections. -->
# {Change title}
> change: {change-id} | key: {KEY} | status: draft | created: {YYYY-MM-DD} | updated: {YYYY-MM-DD}

<!-- {KEY}: 2–5 upper-case letters, unique forever (hitl-index spec key <change-id>: type letter + 3 initials of the id); every id of this
     change starts with it ({KEY}-R1, {KEY}-T1, {KEY}-D1). -->
<!-- WHAT / WHY only, in the user's words. No file names, code names, libraries, SQL or HTTP verbs (BIZ_CODE_TOKEN). -->
## Why
{1–5 sentences: the problem, who is affected, why now}

## What changes
- {business-level change; prefix "BREAKING:" when existing behaviour is removed or changed incompatibly}

## Capabilities
<!-- one row per capability with a delta in specs/<capability>/spec.md; change: new | modified | retired.
     A docs/chore/refactor/test/perf change with no observable behaviour change writes the single line
     "none (no behaviour change)" instead of the table. -->
| capability | change | requirements |
|---|---|---|
| {capability} | modified | +{KEY}-R{n} ~{OTHER}-R{m} |

## Unchanged behaviour
<!-- fix/refactor/perf only: what must keep working -->
- {behaviour that must not change}

## Success criteria
- SC-1 {measurable, technology-agnostic outcome}

## Out of scope
- {what this change will not do}

## Assumptions
- {assumption taken instead of asking}

## Coverage
<!-- written by /hitl:plan (shared/interview.md §3); status ✅ clear · ⚠️ partial · ❌ missing · — n/a (note says why).
     spec validate: COVERAGE_GAP for ⚠️/❌/unmarked/— without a note (error once approved unless "💡 Forced:" in Open questions) -->
| category | status | note |
|---|---|---|
| Scope & behaviour | ✅ | |
| Actors & permissions | ✅ | |
| Data & lifecycle | ✅ | |
| Business rules | ✅ | |
| Edge cases & errors | ✅ | |
| Integrations | — | {why not applicable} |
| Quality (NFR) | ✅ | |
| Terminology | ✅ | |
| Success criteria | ✅ | |

## Artifacts
<!-- decision: included | skipped | assumed → included | assumed → skipped | asked → included | asked → skipped -->
| artifact | decision | why |
|---|---|---|
| spec delta | included | always |
| design | included | {why} |

## Deferred
- {behaviour postponed; it never enters a delta}

## Open questions
- [ ] Q1 {question} — 💡 recommended: {answer}
