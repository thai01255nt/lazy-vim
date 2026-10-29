# Ticket format (every provider)

hitl mirrors one **task** to one issue, one-way (repo → tracker). The CLI renders everything; the skill sends it
byte-for-byte. Sources: Linear Method "Write issues not user stories" (short title that states the task, short optional
description), Linear docs (labels, priority, sub-issues, relations), Atlassian issue types / links, GitHub issue
types, sub-issues and dependencies (research 2026-10-29).

## Body (description)
```
**Why**: <1–2 lines> (D-1, D-3)
Risk reasons: security, concurrency          ← only for high risk

### Acceptance criteria
- T-1.AC1 (BILL-R9.S1) Given … When … Then …   ← plain bullets: a box ticked in the tracker would be overwritten

<!-- hitl:task=T-1 repo=<owner/name> file=.hitl/changes/<id>/tasks.md -->
_Managed by hitl — edit .hitl/changes/<id>/tasks.md in the repo, not this issue._
```
The marker lets `pull --relink` find the task again; never remove it.

## Field mapping (native fields first; never repeat them as body text)
| hitl | Linear | Jira | GitHub |
|---|---|---|---|
| title (behaviour) | title | summary | title |
| change | project (or parent issue) | epic (or parent issue) | milestone (or parent issue = sub-issues) |
| prio P0–P3 → 1–4 | priority Urgent/High/Medium/Low | priority Highest/High/Medium/Low (`jira.priorityNames`) | issue field `Priority` (`github.priorityField`), else `priority:*` label when `github.priorityLabels` |
| risk / impl / phase | labels `risk:high`, `impl:*`, `hitl:*` | labels (free text) | labels |
| blocked-by | `blockedBy` relation | issue link "Blocks" (this issue *is blocked by*) | issue dependency "blocked by" |
| hitl status | workflow state by type | status via a transition | open / closed (completed · not planned) |
| review verdict | comment | comment | comment |
| branch | `gitBranchName` | — (fallback `<project>-<n>-<slug>`) | — (fallback `<owner-repo>-<n>-<slug>`) |

Never: one issue per AC or per symbol, source paths or code in issues, assignee or agent delegation (agents would
bypass the HITL gates), estimates or story points.
