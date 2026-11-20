<!-- hitl amend brief (one per amendment). Answer on the `>` line under each question (more lines: each starts
     with `>`), save, then run the command in the `next:` line. Y on the "Accept all" line = take the recommendation
     (_Rec:_) of every question of the round you left empty (an answer you write still wins), except questions marked
     "(needs its own Y)" · Y under one question = take its recommendation · ? or "don't know" = keep it open with the
     recommendation · n + what you want instead = that is your answer · a question or a doubt instead of an answer =
     Claude answers it here (_Disc:_) and asks again · done = stop asking. Vietnamese works too: được / đồng ý / ừ ·
     không biết · không / để sau · xong.
     Notes (the last block of each round): anything the questions missed, or a change to an earlier answer.
     "Where the change stands" and "Affected" are written by hitl-index amend start (facts, not questions).
     Lines that start with → or _Disc:_ are Claude's; leave them as they are. -->

# Amend brief — {change-id} · {KEY}-A{n}

> change: {change-id} | key: {KEY} | kind: amend | amend: {KEY}-A{n} | from: {N-k, …} | refs: {ids the amendment changes} | transition: — | skill: plan | status: open | round: 1 | updated: {YYYY-MM-DD}
> next: answer the `>` lines, then run /hitl:plan {change-id} amend

## Description

{the change in the user's words: the note texts verbatim, or what the user said. Later information goes into the
Notes of the open round.}

## Where the change stands

| task    | title                   | status | locked                | touched via | rule                                                 |
| ------- | ----------------------- | ------ | --------------------- | ----------- | ---------------------------------------------------- |
| PWR-T12 | Request a reset link    | done   | skeleton, tests, done | PWR-R3.S2   | done: never reopened; a new task takes over          |
| PWR-T13 | Reset with a valid link | wip    | skeleton, tests       | PWR-D2      | in progress: reopen in place, refresh its TODO steps |
| PWR-T14 | Lock out after failures | todo   | —                     | PWR-R3      | todo: edit in place or drop                          |

## Affected

- Spec: PWR-R3.S2 (Reset link expires) — in the change's view
- Decision: PWR-D2 (Token hashed, valid 1 hour) — accepted
- AC: PWR-T12.AC2 of PWR-T12 — via PWR-R3.S2
- Symbol: ResetService.request — @dec PWR-D2
- Test: issues a link valid for one hour — locked by PWR-T12 (done); PWR-T12.AC2

### Reached through calls (1 hop)

Code index call graph, from the symbols the amendment changes or removes. It sees static calls the code index resolves (plus @calls tags); not dynamic calls (callbacks, injected objects, string dispatch), reflection, calls from other services, or files of languages the indexer does not parse.

- Changed: ResetService.request — @dec PWR-D2
- Caller: ResetController.post — calls ResetService.request; 1 test(s)
- Caller test: posts a reset request — covers ResetController.post; locked by PWR-T12
- Data: ResetToken (data-model.md) — named in ResetService.request (signature)

## Round 1

Accept all recommendations of this round: >

### Q1 [R] What changes, in business words?

{one context sentence: the requirement or scenario as approved now, with its id and title}
_Rec:_ {the change as the notes state it, as a GIVEN/WHEN/THEN difference}

>

### Q2 [D] Transition: is the old behaviour only in this branch, merged, or released?

Options: 1 = only in this branch · 2 = merged, not released · 3 = released (stored data or clients use it).
_Rec:_ 1 — {fact: the branch is not merged; or what is known}

>

<!-- one [X] question per out-of-scope candidate (shared/other-changes.md §1 size rule for the recommendation):
### Q{n} [X] Accept "{work}" into this change's scope?
Options: 1 = accept (adds {a requirement / about one task}) · 2 = own change (/hitl:go {work} --before {change-id}, or after) · 3 = drop.
_Rec:_ 2 — {new capability or more than one task: big}
>

one [K] question per half-done task (skeleton or tests locked, or code, not done):
### Q{n} [K] {T} ({title}) is half done: keep and adapt it, or revert it to the base and redo?
_Rec:_ keep — {why}
>

only when the transition answer is merged or released (shared/formats/parallel-change.md §4), in the round after it:
### Q{n} [D] Who depends on the old form?
Consumers of the API or events, stored data, other services, scheduled jobs, reports.
_Rec:_ {the callers of "Reached through calls"} and {what the code cannot show: other services, stored rows}
>

### Q{n} [D] How long does the old form keep working (deprecation window), and who is told?
_Rec:_ {one release for in-house callers; the window the consumers' contract states for external ones}
>

### Q{n} [D] Does the switch go behind a feature flag?
_Rec:_ {yes — risky behaviour or a gradual rollout; no — a rename or an additive field}
>
-->

### Notes — anything the questions missed, or a change to an earlier answer

>
