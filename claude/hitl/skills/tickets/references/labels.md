# hitl labels (every provider)

Names must match exactly: hitl finds labels by name. Colors and descriptions are suggestions (colors only matter where
the tracker shows them; Jira labels have none). Create them at the level the tracker allows (Linear: team or workspace;
GitHub: repository; Jira: labels are free text and need no creation).

| name | color | description | when |
|---|---|---|---|
| `risk:high` | `#EB5757` | High-risk task (money/security, concurrency, public API, domain or data). Goes through every hitl gate with human approval; no fast lane. | `labels.risk` (on) |
| `impl:agent` | `#5E6AD2` | Every function in the task is implemented by the hitl implementer agent; a human reviews it. | `labels.impl` (on) |
| `impl:manual` | `#26B5CE` | The task is implemented by a human. | `labels.impl` (on) |
| `impl:mixed` | `#F2994A` | Some functions are implemented by the agent, others by a human. | `labels.impl` (on) |
| `hitl:skeleton` | `#BEC2C8` | Skeleton (signatures, intent docstrings, TODO flow) drafted, waiting for human review. | `labels.phase` (off) |
| `hitl:approved` | `#5E6AD2` | Skeleton approved and locked; tests come next. | `labels.phase` |
| `hitl:red` | `#EB5757` | Failing tests written and approved; ready to implement. | `labels.phase` |
| `hitl:wip` | `#F2C94C` | Implementation in progress. | `labels.phase` |
| `hitl:green` | `#4CB782` | All the task's tests pass. | `labels.phase` |
| `hitl:review` | `#F2994A` | In hitl review (lens reviewers, findings, fix loop). | `labels.phase` |
| `hitl:verified` | `#0F783C` | Review passed; the task is done and verified. | `labels.phase` |

Other labels on an issue (e.g. a `service` group: `data-plane`, `control-plane`, …) are never touched: hitl only adds
and removes the names above.
