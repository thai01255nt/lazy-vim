<!-- hitl tasks brief (one per task set). Answer on the `>` line under each question (more lines: each starts with
     `>`), save, then run the command in the `next:` line. Y on the "Accept all" line = take the recommendation (_Rec:_)
     of every question of the round you left empty (an answer you write still wins), except questions marked
     "(needs its own Y)": a test override and the approval take only a Y under themselves · Y under one question = take
     its recommendation · n + what you want instead = that is your answer · a question or a doubt instead of an answer =
     Claude answers it here (_Disc:_) and asks again. Vietnamese works too: được / đồng ý / ừ · không / để sau.
     Notes (before the approval): anything else ("merge PWR-T3 and PWR-T4", "Q2: …"). You may also edit tasks.md
     directly: the next run reads your edits as answers. "Current set" is generated from tasks.md each round; edit
     tasks.md, not that section. The approval counts only when the set is still what this round showed; otherwise you
     get a new round that lists what changed. A Y typed in chat is not an answer. Lines that start with → or _Disc:_
     are Claude's; leave them as they are. -->

# Tasks brief — {change-id | quick-<slug>}

> change: {change-id} | key: {KEY} | kind: tasks | set: — | status: open | round: 1 | updated: {YYYY-MM-DD}
> next: answer the `>` lines, then run /hitl:tasks {change-id | KEY}

<!-- A quick file: the meta line is `> quick: {slug} | key: {QKEY} | kind: tasks | set: — | status: open | round: 1 |
     updated: {YYYY-MM-DD}` (no change:), the file .hitl/tasks/quick-{slug}-brief.md, the command /hitl:tasks {QKEY}. -->

## Current set

<!-- written by `hitl-index tasks gate {change-id | KEY} --write` after the round below; never by hand -->

## Round 1

{_Warn:_ lines, only if any: spec still draft · design still draft · no design yet}
Accept all recommendations of this round: >

### Q1 [Q] Slices: is each task one vertical slice that fits one session (merge or split any)?

{evidence, your own check: sizes over ≤ 6 symbols / ≤ 3 files, AC counts outside 2–6, a layer-only task, or "all
within the rules". One task (quick): merge — (1 task); split stays live: too big or high risk → "/hitl:plan"}
_Rec:_ {keep as drafted | a concrete merge or split (changes the set) | quick, too big: move to /hitl:plan <description>}

>

### Q2 [Q] Blocking edges: does each task wait only for tasks that really gate it?

{evidence: waves (the wave column) · cross-change edges · a symbol listed in two tasks: none}
_Rec:_ {keep as drafted | the edge to add or remove (changes the set)}

>

<!-- one task (quick) with no blocked-by: write the question already settled, the text "— (1 task)" and the mark
     "→ recorded: n/a (1 task)" instead of the evidence, the _Rec:_ and the `>` line -->

### Q3 [Q] Owners: who writes each symbol (agent or you)?

{evidence: high-risk core logic owned by agent; your "I will write it" from earlier briefs}
_Rec:_ {keep as drafted | the owner change (changes the set)}

>

### Q4 [Q] Test plan: which ACs get a new test (and the defect it catches), which do not?

{evidence: the non-new rows with their reason; the budget; ACs where an automated test looks hard}
_Rec:_ {keep as drafted | the row change (changes the set)}

>

<!-- then one [C] question per finding code (trace warn/info items, the semantic checks of slicing-and-risk.md §8),
     grouped: all ids of one code in one question:
### Q{n} [C] SCN_NO_AC: PWR-R3.S4 (Expired link shows a clear message) has no AC
_Rec:_ fix: add PWR-T2.AC5 for it (changes the set) | accept: <reason>
>

then one _Override:_ question per AC (a security, concurrency or data task where an automated test looks
unreasonable; slicing-and-risk.md §7):
### Q{n} _Override:_ PWR-T2.AC3 none!: {reason}? (needs its own Y)
PWR-T2 has risk security. Without your Y under this question the row keeps an automated test (new: …).
>
-->

### Notes — anything the questions missed, or a change to an earlier answer

>

### Q{n} Approve the task set? (Y/n) (needs its own Y)

Approves the set as shown in Current set. It counts only if this run changes nothing else in the set.

>
