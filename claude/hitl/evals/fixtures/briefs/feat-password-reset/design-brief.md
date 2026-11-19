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

# Design brief — feat-password-reset

> change: feat-password-reset | key: PWR | kind: design | status: open | round: 1 | updated: 2026-11-19
> next: answer the `>` lines, then run /hitl:design feat-password-reset

## Description

## Round 1

Accept all recommendations of this round: > Y

### Q1 [D] Technology constraints: what must be used, and what must not?

The service is plain TypeScript on node:test with no web framework and no mail library yet.
_Rec:_ no new runtime dependency except a mail port with one adapter; Node's crypto for tokens (no extra library for randomness or hashing).

>

### Q2 [D] Which existing modules should this reuse or extend?

Sign-in lives in the auth controller and the user service; users live in the user repository.
_Rec:_ extend the auth controller with the two reset endpoints and the user repository with a lower-case email lookup; a new reset service holds the reset logic.

>

### Q3 [D] Where is the reset link stored, and does stored data need a migration?

PWR-BR1 (Reset link validity) needs the link's age and whether it was used.
_Rec:_ a reset-token store keyed by a SHA-256 hash of the token with user id, created-at and used-at; nothing existing is migrated (the store is new).

>

### Q4 [D] Which external interfaces does this add or change?

PWR-R1 (Reset password by email) and PWR-R2 (Set a new password) need two entry points and one email.
_Rec:_ two HTTP endpoints described in contracts/password-reset.openapi.yaml (OpenAPI 3.1: request a reset, set a new password) and the reset email as contracts/reset-email.md.

>

### Q5 [D] How do errors reach the caller or the user, and is anything retried?

PWR-R1.S2 (Unknown email reveals nothing) forbids telling an unknown email apart.
_Rec:_ the request endpoint always answers 202 with the same message; an expired or used link answers 410 with "link expired" or "link already used"; mail failures are logged and not retried.

>

### Q6 [D] At which boundaries do we test, and which test doubles are acceptable?

_Rec:_ HTTP endpoint tests per requirement through the auth controller, with a fake mail port and an in-memory token store; a fixed clock for the 30-minute rule.

>

### Q7 [D] Which risk areas need care?

_Rec:_ security — anonymous client → reset endpoints → account store (token guessing, account enumeration, token leaks in logs); concurrency — two uses of one link at once must succeed only once.

>

### Q8 [D] How is it rolled out?

LACC-R2 (Remember me) is removed by this change.
_Rec:_ ship in one release; remove the remember-me cookie handling in the same release; no feature flag.

>

### Notes — anything the questions missed, or a change to an earlier answer

>
