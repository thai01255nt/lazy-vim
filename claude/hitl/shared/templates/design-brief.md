<!-- hitl brief file. Answer on the `>` line under each question (more lines: each starts with `>`), save,
     then run the command in the `next:` line. Y on the "Accept all" line = take the recommendation (_Rec:_) of every
     question of the round you left empty (an answer you write still wins), except questions marked
     "(needs its own Y)" (_Needs spec:_, _To <change>:_, a rename): they act outside this brief and take only a Y
     under themselves · Y under one question = take its recommendation · ? or "don't know" = keep it open with the
     recommendation · n + what you want instead = that is your answer · n + "later" = postponed (an open question)
     · n alone = Claude asks what it should be instead · a question or a doubt instead of an answer = Claude answers
     it here (_Disc:_) and asks again · done = stop asking. Vietnamese works too: được / đồng ý / ừ · không biết /
     chưa biết · không / để sau · xong.
     Notes (the last block of each round): anything the questions missed, or a change to an earlier answer
     ("Q5: …" / "sửa Q5: …"). Description is read once, at the first run; after that new information goes into the
     Notes of the open round. Lines that start with → or _Disc:_ are Claude's; leave them as they are. -->

# Design brief — {change-id}

> change: {change-id} | key: {KEY} | kind: design | status: open | round: 1 | updated: {YYYY-MM-DD}
> next: answer the `>` lines, then run /hitl:design {change-id}

## Description

{optional: constraints or preferences for the design, in your words, before the first run. Leave empty if none.
Later information goes into the Notes of the open round.}

## Round 1

{_Assumed:_ lines (artifacts chosen with high confidence), one per line, before the questions}
Accept all recommendations of this round: >

<!-- Q1…: one [D] question per idea in design.md ## Parked from planning. -->

### Q{n} [D] Technology constraints: what must be used, and what must not?

{context sentence: what the code and docs use today (from ## Context)}
_Rec:_ {answer} ({why, ≤ 10 words})

>

### Q{n} [D] Which existing modules should this reuse or extend?

_Rec:_ {modules by their names in the code}

>

### Q{n} [D] Where is the data stored, and does stored data need a migration?

_Rec:_ {answer}

>

### Q{n} [D] Which external interfaces does this add or change? (HTTP, events, CLI, files)

_Rec:_ {answer; the contract format, e.g. OpenAPI 3.1}

>

### Q{n} [D] How do errors reach the caller or the user, and is anything retried?

_Rec:_ {answer}

>

### Q{n} [D] At which boundaries do we test, and which test doubles are acceptable?

<!-- risks name security, concurrency or data → the heading ends "(needs its own Y)" and the _Rec:_ says that
     /hitl:tasks refuses none:/manual: on those tasks (TEST_PLAN_NONE_RISK) -->

_Rec:_ {highest seams: endpoint, CLI, module boundary; doubles}

>

### Q{n} [D] Which risk areas need care? (security, performance, concurrency)

_Rec:_ {areas with why; for security the trust boundaries}

>

### Q{n} [D] How is it rolled out? (flag, migration order, backward compatibility)

_Rec:_ {answer}

>

<!-- then one [D] question per ADDED/MODIFIED `must` requirement whose HOW is still open:
### Q{n} [D] How is {REQ-ID} ({title}) built?
Option 1: … ✅ Pros: … ❌ Cons: …
Option 2: … ✅ Pros: … ❌ Cons: …
_Rec:_ Option 2 — reasoning: {tie to a requirement id or a ## Context fact}
>
-->

### Notes — anything the questions missed, or a change to an earlier answer

>
