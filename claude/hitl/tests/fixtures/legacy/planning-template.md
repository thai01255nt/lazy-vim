# {Mission Name} - Planning
> status: draft | tasks: .hitl/tasks/{type}-{feature}.md | updated: {YYYY-MM-DD}

<!-- Part A — WHAT / WHY: behaviour only. No file names, signatures, classes or libraries here. -->
## Goal
{1–3 sentences: problem, who benefits, success signal}

## Requirements
<!-- 3–10 lines. EARS-lite: When <trigger> / While <state> / If <unwanted>, then / Where <feature> / plain "shall". -->
- R-1 [must] When {trigger}, the system shall {observable response}.
- R-2 [must] The system shall {always-true rule}.
- R-3 [should] If {unwanted condition}, then the system shall {safe response}.
- R-4 [could] Where {optional feature} is enabled, the system shall {response}. (status: deferred)

## Out of scope
- {…}

<!-- Part B — HOW -->
## Context & Constraints
- {fact from code/docs} (source: {path or doc})

## Level 1 - Components
1. {Component} → {keywords}

## Level 1 Component Details
### {Component} (Level 1 Item)
**Problem**: {…}
**Approach**: {chosen approach} (D-{n})
### Level 2 - {Component} Sub-Components
1. {Sub} → {keywords}
#### Level 2 Component Details
##### {Sub} (Level 2 Item)
**Problem**: {…}
**Approach**: {…} (D-{n})

### Other Components (Not Yet Brainstormed)
**{k}. {Component}** → {keywords}

## Decisions
| id | decision | why | cost if wrong | serves | status |
|----|----------|-----|---------------|--------|--------|
| D-1 | {…} | {…} | {…} | R-1 | accepted |

## Test seams
- {public function / endpoint / module boundary} — {why this seam}

## Risks
- {concurrency|security|public-api|data|perf}: {…}

## Open questions
- [ ] Q{n} {question} — 💡 recommended: {answer}

## Changelog
<!-- one line per amendment after approval: date, what, why, source -->
