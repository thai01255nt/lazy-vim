# Elicitation: breadth, depth and the stop rule (`/hitl:plan`)

Own text. Ideas only (no text copied): the coverage taxonomy of github/spec-kit `/clarify` (MIT), the "advanced
elicitation" menu idea of BMAD-METHOD (MIT; "BMad" is a trademark of its owner, not used here), Example Mapping
(Matt Wynne, Cucumber), Five Whys (Toyota), pre-mortem (Gary Klein). See NOTICE.md.

The vendored `hitl:grilling` gives the round mechanics; `shared/interview.md` gives the hitl format. This file makes
the plan interview both **wide** (nothing important forgotten) and **deep** (the risky parts drilled into), without the
old component tree.

## Contents
1. Breadth — coverage
2. Auto-depth — hotspots 🔥
3. User-driven depth — `deep <ID|topic>` (menu in `deep.md`)
4. Stop rule

## 1. Breadth — coverage
Nine categories. Keep their status in the proposal `## Coverage` table (`| category | status | note |`) after every
reply; the CLI reads it (`COVERAGE_GAP`).
| category | clear when | typical question |
|---|---|---|
| Scope & behaviour | every behaviour the user wants is a requirement; out of scope listed | "Does it also …?" |
| Actors & permissions | who triggers, who sees the result, who may NOT | "Can a normal user do this, or only admins?" |
| Data & lifecycle | the business data involved, its states and transitions, what is kept/deleted | "What happens to their orders?" |
| Business rules | every policy (limits, eligibility, pricing, permissions) named, with numbers | "How many attempts before lock?" |
| Edge cases & errors | invalid input, duplicates, concurrency in business terms, partial failure | "What if it is already deactivated?" |
| Integrations | other systems/parties notified or consulted (business view) | "Must billing be told?" |
| Quality (NFR) | speed, availability, privacy, security, compliance, accessibility — only where it matters | "Must it take effect immediately?" |
| Terminology | each concept one name; new terms in the glossary | "Is 'disabled' the same as 'deactivated'?" |
| Success criteria | measurable, technology-free outcome(s) `SC-n` | "How will you know it worked?" |
Status: `✅` clear · `⚠️` partial · `❌` missing · `—` not applicable or deferred (the note says why).
From round 2 on, each round heading of the brief carries one line, e.g.
`## Round 2 — Coverage: Scope ✅ · Actors ✅ · Data ⚠️ · Rules ✅ · Edge ❌ · Integr — · NFR — · Terms ✅ · Success ⚠️`.
Round 1 asks one core question per category instead (`SKILL.md` §3.4); the table gets its first status from the
description before round 1 and is updated after every run.
The next round's frontier takes ❌ first, then ⚠️ (highest impact first). Anything still unresolved is written as
`[NEEDS CLARIFICATION: …]` in the delta or proposal at the place it belongs, plus an `## Open questions` line.

## 2. Auto-depth — hotspots 🔥
Score every requirement and open point by **impact × uncertainty** (H/M/L each):
- impact H: money, security/privacy, data loss, legal, many users, irreversible; M: a main flow; L: cosmetic/rare.
- uncertainty H: the user hesitated, answers conflict, a rule has no number, the scout found surprising current
  behaviour; M: one assumption taken; L: stated plainly.
H×H, H×M and M×H are **hotspots**: mark them `🔥` in the question heading (`### Q12 [R] 🔥 …`) and in the round
heading (`(🔥 ACC-R7, refunds)`). Grilling descends into a hotspot's child decisions first (the frontier rule: its
sub-questions become askable as soon as its parent is answered), before widening to other ❌ categories. A hotspot
cools when its scenarios cover the failure path and its rule has numbers.

## 3. User-driven depth — `deep <ID|topic>`
The user may answer `deep ACC-R7` (or `deep refunds`) under any question of the brief, or under the gap question of
the Close section (§4): then read `deep.md` (same folder) and put its technique menu into the next round as one
question (example mapping, five whys, edge cases, pre-mortem, decision table, stakeholder lenses; results go straight
into the delta/proposal).

## 4. Stop rule
`/hitl:plan` may close (the `### Approve the spec? (Y/n)` question of the brief's Close section) only when:
- every coverage category is `✅` or `—` with a reason, and
- no SHALL/MUST requirement holds `[NEEDS CLARIFICATION]`.
Check it with `hitl-index spec validate <id> --json`: no `COVERAGE_GAP` and no `REQ_UNCLEAR` items. Otherwise the
Close section lists the gaps and asks the gap question instead:
```
## Close
⛔ Not ready for /hitl:design — gaps:
- Edge cases & errors ❌ · Success criteria ⚠️
- ACC-R7 SHALL with [NEEDS CLARIFICATION: end open sessions?]

### Close with gaps? (round · deep <ID> · force)
💡 Recommended: round — one more round on the gaps
>
```
`force` writes `- 💡 Forced: closed with gaps <list> (<date>)` under the proposal's `## Open questions`; validate then
downgrades the gaps (REQ_UNCLEAR and NEEDS_CLARIFICATION warn, COVERAGE_GAP info) and approval proceeds. `done` from
the user is not a force: it ends the rounds and goes to this question.
