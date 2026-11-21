# Interview overlay (hitl rounds on top of `hitl:grilling`)

Uses the vendored `hitl:grilling` technique (mattpocock/skills, MIT — see NOTICE.md): frontier rounds, numbered
questions with a recommended answer, "yes" accepts the recommendation, facts are the agent's job, decisions are the
user's, done when the frontier is empty and the user confirms. This file only says how hitl **formats and records**
those rounds. Where this file and the grilling skill differ, this file wins (format, caps, recording, **where** a
round happens — in a brief file, never in chat — and **when** facts are gathered: plan waits for the spec-scout and
design for Explore before writing round 1). Own text, except § Shared language:
<!-- Adapted from mattpocock/skills (MIT) — see NOTICE.md. Source: skills/engineering/domain-modeling/SKILL.md @ 4ae2317 (§ During the session). Changes: writes the change's glossary.md delta, not GLOSSARY.md; no ADR files (<KEY>-D<n> rows); term questions are a [T] tag with a cap; code checks go through spec-scout / Explore. -->

Used by `/hitl:plan` (tags `[R]`, `[S]`, `[A]`, `[T]`), `/hitl:design` (tags `[D]`, `[A]`), the amend brief of
either (0.17; tags `[R]`, `[D]`, `[X]`, `[K]`; format and runs in `shared/amend-spec.md` §3–§4) and the tasks brief of
`/hitl:tasks` (0.21; tags `[Q]`, `[C]`; a review of a set already written to tasks.md: format and runs in
`skills/tasks/SKILL.md` §6, `skills/tasks/references/slicing-and-risk.md` §9).

## Contents
1. Loading
2. What a round may ask (per skill)
3. Breadth and depth (plan)
4. The brief file and the round format
5. Discussion vs Suggestion mode
6. Answer grammar and processing
7. Recording (after every run)
8. Parking and cross-overs
9. Done and close
10. Shared language

## 1. Loading
The first interview step of `/hitl:plan` and `/hitl:design` invokes the Skill tool with `hitl:grilling` (the user never
calls it). If the Skill tool is unavailable or the call fails, Read `${CLAUDE_PLUGIN_ROOT}/skills/grilling/SKILL.md`
instead and say nothing about it. Then apply this overlay. Load the grilling skill and this file once per conversation.

## 2. What a round may ask
There is **no design tree of components and no levels**. The frontier is a set of open topics:
| tag | asked by | about | becomes |
|---|---|---|---|
| `[R]` | plan | observable behaviour: actors, triggers, states, unwanted behaviour, optional features, out of scope | requirement + scenarios in a spec delta |
| `[S]` | plan | scope mapping: which capability (business area) a behaviour belongs to, new vs existing capability | delta file + proposal `## Capabilities` row |
| `[A]` | plan, design | whether to add an optional artifact (`shared/artifacts.md`); max 2 per round | proposal / design `## Artifacts` row |
| `[D]` | design | how: components (module level), data, contracts, errors, test strategy, risks, rollout | `<KEY>-D<n>` row in design.md |
| `[T]` | plan (design: `_Needs term:_`) | a term: the canonical word, what it IS, its boundary with a neighbour term; max 2 per round | `### Term:` block in glossary.md with `_Avoid_` (§10) |
| `[X]` | amend brief | an out-of-scope candidate: accept into this change's scope · own change (`--before` or after) · drop | part of the amendment, a `--before` hint, or an `## Out of scope` line |
| `[K]` | amend brief | a half-done task: keep and adapt · revert to the base and redo | an edit in place, or a `revert` task (`shared/task-changes.md`) |
| `[Q]` | tasks brief | one review area of the set: slices, blocking edges, owners, test plan (with Claude's own check as evidence) | an edit of tasks.md, or kept |
| `[C]` | tasks brief | one finding code (trace warn/info, a semantic check), its ids grouped: fix or accept | an edit of tasks.md, or `→ recorded: accepted` |
- Plan never asks `[D]`. Design never asks `[R]`: a design answer that needs new behaviour becomes `_Needs spec:_ …`
  (a question of the next round with the `_Delta:_` preview, §8).
- `[S]` questions need the spec-scout result (`.scout.json`); the scout runs before the plan brief is written, so they
  start in round 2 with a recommendation (an obvious capability is `_Assumed:_` instead).

## 3. Breadth and depth (plan)
Mechanics in `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/elicitation.md` (plan reads it with this file; design does not):
- **Coverage** (idea from github/spec-kit `/clarify`, MIT): nine categories — Scope & behaviour · Actors &
  permissions · Data & lifecycle · Business rules · Edge cases & errors · Integrations · Quality (NFR) · Terminology ·
  Success criteria — each `✅ clear · ⚠️ partial · ❌ missing · — n/a (reason)`, kept in the proposal `## Coverage`
  table. The frontier takes ❌ then ⚠️ first; a ✅ or — category asks nothing. Never ask about technology.
- **Hotspots (`_Hot_`)**: impact × uncertainty (H/M/L); hotspots are drilled into (their child questions) before widening.
- **`deep <ID|topic>`**: the user opens a technique menu (example mapping, five whys, edge cases, pre-mortem,
  decision table, stakeholder lenses); results go straight into the delta/proposal.

## 4. The brief file and the round format
Rounds are written into a **brief file** in the change folder and answered there, in the user's editor. There is no
chat round mode. Files: `.hitl/changes/<id>/plan-brief.md` (`/hitl:plan`), `design-brief.md` (`/hitl:design`),
one `amend-<KEY>-A<n>-brief.md` per amendment (0.17) and `tasks-brief.md` (0.21, `/hitl:tasks`; a quick file's:
`.hitl/tasks/quick-<slug>-brief.md`), from `${CLAUDE_PLUGIN_ROOT}/shared/templates/{plan,design,amend,tasks}-brief.md`. They move with the change at archive. The user
edits them too; Claude never deletes or rewrites the user's text (`## Description`, `>` lines, Notes).
```
# Plan brief — feat-export-csv

> change: feat-export-csv | key: FEC | kind: plan | status: open | round: 2 | updated: 2026-11-19
> next: answer the `>` lines, then run /hitl:plan feat-export-csv

## Description

<the user's description, verbatim; the user may extend it before the first run, never after>

## Round 1 ✅

### Q3 [R] Who may do this, and who must not?

_e.g. "accountants and admins; warehouse staff must not see prices"_

> Accountants and admins.
> Warehouse staff must not.

→ recorded: FEC-R1, FEC-R1.S1

### Q2 [R] What is out of scope?

_e.g. "no Excel files"_

> Why not Excel?

_Disc:_ Excel files need an extra library; CSV opens in Excel too. Option 1: CSV only. Option 2: CSV and Excel.
_Rec:_ CSV only.

→ carried to Round 2

### Notes — anything the questions missed, or a change to an earlier answer

> Q3: also the auditors, read-only.

→ recorded: FEC-R1 (changed)

## Round 2 — Coverage: Scope ✅ · Actors ✅ · Data ⚠️ · Rules ✅ · Edge ❌ · NFR — · … (_Hot_ FEC-R2)

Accept all recommendations of this round: >

### Q8 [R] _Hot_ What happens above 10 000 rows?

<one context sentence; options if any>
_Rec:_ split into several files of ≤ 10 000 rows.

>

### Notes — anything the questions missed, or a change to an earlier answer

>
```
- **Markdown style** (markdownlint, stable under prettier, which many editors run on save): a blank line around
  every heading, the meta lines, paragraphs, lists, tables and `>` answer blocks. **A Claude mark (`→ …`) or a `_Disc:_`
  line never sits directly under a `>` line**: put a blank line first, else markdown reads it as part of the answer
  (a lazy continuation) and a formatter rewrites it to `> → …`. The parser tolerates that form, but never write it.
- **Header**: the title line `# Plan brief — <id>` / `# Design brief — <id>`, then one meta line
  `> change | key | kind | status | round | updated` (status `open` while rounds run, `closing` once `## Close` is
  written, `done` after approval) and the `> next:` line. Update `round`, `status` and `updated` on every run.
- **Round heading** `## Round <n>`; a finished round gets ` ✅` right after the number (`## Round 1 ✅`). Plan rounds
  from 2 on carry the coverage line and the hotspots: `— Coverage: <categories> (_Hot_ <ids or topics>)` (category labels
  may be shortened). Design rounds: `— D: <KEY>-D1…<KEY>-D<k> settled · open: <n>`.
- Info lines (`_Parent:_ …`, `_Overlap?_ …`, `_Assumed:_ …`, `_Parked:_ … (for /hitl:design)`, `_Forced:_ …`) go
  right under the round heading, before the questions, one per line.
- **Accept-all line** `Accept all recommendations of this round: >` under the heading of every round whose questions
  carry recommendations (not plan round 1). `Y` there accepts the `_Rec:_` of every question of that round
  whose answer is empty, except a **`(needs its own Y)` question**. A written answer always wins over accept-all.
- **`(needs its own Y)` questions** act outside the brief, so only a `Y` (or another answer) under the question itself
  answers them; their heading ends with the visible text `(needs its own Y)`:
  - `### Q0 …` — renames the change id and/or key (§6 Rename);
  - `### Q<n> _To <P>:_ …` — writes a note into another change P (`shared/other-changes.md` §3);
  - `### Q<n> _Needs spec:_ …` — applies a spec delta and its Impact classes (§8).
  - design: the test-strategy question when the risks name security, concurrency or data (its answer decides whether
    `/hitl:tasks` must keep an automated test per AC, `TEST_PLAN_NONE_RISK`);
  - tasks brief (0.21): `### Q<n> _Override:_ <AC> none!: …` (writes a `!` test-plan row; parser `ownY: override`)
    and `### Q<n> Approve the task set? (Y/n)` (`ownY: approve`), the last question of every round, after the Notes
    block: the approval lives inside the round (no `## Close`), and only `hitl-index tasks approve` acts on its Y.
  The parser recognises them from the heading (`ownY` in `hitl-index brief --json`) and never counts the accept-all
  `Y` as their answer: an empty answer under one is carried to the next round (same number) even when the round's
  accept-all line says `Y`.
- **Question** `### Q<n> [TAG] [_Hot_] <title>`: then one context sentence (an id in it carries its title the first time,
  Plain replies in `conventions.md`), options if any, then `_Rec:_ …` (or the Discussion Mode block, §5) or,
  in plan round 1 only, a one-line `_e.g. "…"_` hint; then an empty `>` line for the answer. Word each question so
  "yes" accepts the recommendation. Numbers never restart: a new question takes the next free number of the file.
- **Notes block** `### Notes — anything the questions missed, or a change to an earlier answer` with an empty `>`
  line ends every round (round 1 from the templates, and every round Claude appends) and the Close section (before
  its last question). It is the place for free text after the first run: `## Description` is the initial description
  only (editable until the first run, read once then); later information goes into the Notes of the open round.
- **Prose language**: the question text follows the user's language (English or Vietnamese); headings, tags,
  keywords (`Round`, `Accept all…`, `_Rec:_`, `→ recorded:`) stay English (the CLI parses them).
- **Caps**: ≤ 7 questions per round; if more, take the ones that unblock the most. A question that depends on another
  open question of the round goes to a later round. Exceptions: plan round 1 (Q0 + the core set + ≤ 5 tailored,
  `skills/plan/SKILL.md` §3) and design round 1 (parked ideas + the core set + tailored, `skills/design/SKILL.md` §3).
- Plan questions use business words only (no code names, file paths, libraries). Design questions may name code.
- **Chat output** of a run that writes a round: at most 3 lines — what was recorded (counts, e.g. `✅ recorded: 3
  requirements, 5 scenarios, 1 term`), `Round <n>: <k> questions in <path> (_Hot_ <m>)` and nothing else. Then END THE
  TURN: the user answers in the file and runs the skill again (or says "continue", "next", "xong" in this
  conversation). Never repeat the questions in chat.

## 5. Discussion vs Suggestion mode (design rounds, and plan rounds with real business alternatives)
- **Discussion Mode** — several valid approaches. In the question body:
  ```
  Option 1: <approach>
  ✅ Pros: … ❌ Cons: …
  Option 2: <approach>
  ✅ Pros: … ❌ Cons: …
  _Rec:_ Option 2 — reasoning: <tie to a requirement id or a fact with its source>
  ```
- **Suggestion Mode** — a clear best practice exists: `_Rec:_ <answer> (<why, ≤ 10 words>)`.
- The anti-hallucination rules of `conventions.md` apply (proven tech, official docs, "unknown" when unsure).

## 6. Answer grammar and processing
`hitl-index brief <id> [--kind plan|design] --json` parses the file: every question with its `answer`, `kind`,
`answered` (also true when the round's accept-all line says Y, the question has a recommendation and is not a
`(needs its own Y)` question — `ownY` null), `recorded`, `carried`, `dropped`. Use it; never guess from memory. Answers are the `>` lines under a question (several lines allowed, every
one starting with `>`); a blank line ends the answer. Keywords, English and Vietnamese, case-insensitive:
| answer | kind | effect |
|---|---|---|
| `Y` · `yes` · `ok` · `được` · `đồng ý` · `ừ` · `có` | accept | take the `_Rec:_` recommendation (on the accept-all line: the recommendation of every question of the round left empty, except `(needs its own Y)` questions, §4) |
| `?` · `don't know` · `không biết` · `chưa biết` | unknown | carried to the next round with a recommendation (plan round 1: a new one) |
| empty `>` | empty | carried to the next round unchanged (the accept-all Y counts as its answer when the question has a `_Rec:_` line and is not a `(needs its own Y)` question) |
| `n` · `no` · `không` · `ko`, alone or followed by text | decline (the parser's count, for a bare one) | no fixed effect: read the meaning of the whole answer — "Decline answers" below |
| `deep` · `deep <ID\|topic>` (plan) | deep | the next round holds the technique menu of `skills/plan/references/deep.md` as one question. In a design brief `deep` is not a keyword: treat it as text (a discussion). |
| `done` · `xong` | done | stop asking: every open question goes to `## Open questions` with its recommendation, then close (§9) |
| `add <artifact>` · `drop <artifact>` | text | change the artifact decision (`asked → included\|skipped`), record it |
| anything else | text | an answer, new information, or a question/doubt — decide with the rule below |
- Free text that states a decision or a fact → record what it settles (§7). It may settle other open questions too:
  mark those `→ recorded: … (from Q<n>)`.
- **A question is never an answer.** A reply that asks ("?", why, what if, "tại sao", "khác gì", "nghĩa là gì",
  "nếu … thì sao"), doubts ("not sure", "chưa chắc", "để nghĩ") or argues an option → a **discussion**:
  1. Record nothing for that question; it stays open.
  2. Under the user's answer, after a blank line, write `_Disc:_ <answer>`: answer the question directly first (a fact →
     look it up, never guess), then the options with pros/cons, one concrete example, what each choice changes, and
     end with the updated `_Rec:_ …`. Never start a line of it with `>`; a blank line between it and the mark.
  3. Carry the question into the next round with the **same number** (the updated recommendation); mark the old place
     `→ carried to Round <n>`.
- Not sure whether a reply is an answer or a question → treat it as a question (`_Disc:_ You mean <answer>, right?`) and
  carry it. Never record a guess.
- **Decline answers** (`n`, `no`, `không`, `ko`). The parser classifies a bare one as `decline` for its counts; the
  effect comes from the meaning of the whole answer, never from the word alone:
  - `n` + an edit or an alternative ("n, 5 per hour", "không, chỉ admin") → that edit or alternative is the answer:
    record it (§7).
  - `n` + "later", "not now", "để sau", "chưa cần" → postpone: plan → a line in the proposal's `## Deferred` (never in
    a delta); design → a `- [ ] Q<n> <topic> (deferred: <the user's words>)` line under design.md `## Open questions`.
    Mark `→ recorded: deferred`.
  - A bare `n` with nothing else → a discussion: `_Disc:_ What should it be instead?` with the options (the recommendation
    and the alternatives you know); the question is carried with the **same number**; nothing is recorded.
  - A bare `n` under a `(needs its own Y)` question (§4) → nothing is written (no rename, no note, no delta); mark
    `→ recorded: declined`.
  - Under the last question of the Close section: §9.
- **Rename** (change id and/or key). Until the change has its first task (no task in `tasks.md`), the user may rename
  the change id and/or key in `Q0` or in any later answer or Notes, in a plan or a design brief. A new key →
  `hitl-index spec key --check <KEY> --change <id>`; then `hitl-index brief rename <id> [--to <new-id>] [--key <KEY>]
  --json`. It moves the folder and rewrites the meta lines, every id with the old key in the change's own files
  (proposal, spec deltas, glossary delta, design.md, data-model, contracts, briefs, notes.md) and the `source:` of
  notes other changes hold from it. From then on use the new id and key. Exit 1 (`CHANGE_KEY_TAKEN`, `CHANGE_EXISTS`,
  `ID_BAD_FORMAT`, or `BRIEF_RENAME_LATE` once a task exists) → `_Disc:_` under the answer with the CLI message and the
  next free key (the JSON's `suggestion`, else `hitl-index spec key <id>`), and carry the question (a rename asked in
  Notes → a new `### Q<n> Change id and key: … (needs its own Y)` question in the next round). Nothing else waits for
  it: process the rest of the round under the current name.
- **Scope change**: an answer or Notes that widens, narrows or redirects the change (a new goal, a part removed, a
  different user group). Then rebuild the whole frontier from all answers so far, not only the next questions:
  1. every open question that no longer applies → `→ dropped (scope changed)`;
  2. every open question that still applies → rewritten for the new scope in the next round (same number);
  3. recorded requirements, scenarios, terms and decisions that no longer hold → edited or removed in place (normal
     editing before approval; a REMOVED block only for living behaviour, i.e. a requirement already in
     `.hitl/specs/`);
  4. plan: the proposal's `## Why`, `## What changes`, `## Out of scope` and `## Coverage` updated to the new scope;
     design: `## Context`, `## Components` and the affected D rows.
  A change id or key that no longer fits the new scope → a rename question (Rename above).
- Marks Claude appends (one line each, after a blank line, never inside or directly under the user's `>` lines).
  Under a round question: `→ recorded: <ids>` · `→ recorded: no change (<why>)` for an answer that settles nothing new
  · `→ recorded: kept` (`Q0`) · `→ recorded: deferred` · `→ recorded: declined` · `→ carried to Round <n>` ·
  `→ parked for design` · `→ dropped (scope changed)` · `→ open question` (moved to the proposal's / design's
  `## Open questions` at close). Under a Close question: `→ approved <date>` · `→ continued in Round <n>` ·
  `→ superseded` (the Close section was written again). Every question of a processed round gets exactly one; then
  the round heading gets ` ✅`.
- **Notes** (the parser's `round.notes` / `close.notes`: `text`, `marked`, `pending`) are free text, read with the
  "anything else" rule. Only an unmarked, non-empty Notes block is processed (`pending: true`, in any round), so
  nothing is recorded twice; it gets exactly one mark line, like a question. An empty Notes block gets no mark.
  - A settled fact or decision → record it (§7), mark `→ recorded: <ids> (new|changed)`.
  - Vague → a question in the next round; mark `→ carried to Round <n>`.
  - A question or doubt → `_Disc:_ <answer>` under it (nothing recorded); its topic becomes a question in the next round;
    mark `→ carried to Round <n>`.
  - A correction of an earlier recorded answer (`Q5: …`, `sửa Q5: …`, `change Q5: …`) → edit the requirement or
    decision recorded from Q5 in place (before approval; after approval it is an amend, `shared/amend-spec.md`, as
    today), mark `→ recorded: <ids> (changed)`.
  - A design idea in a plan brief → parked (§8), `→ parked for design`.
- Text after the change id on the command line (`/hitl:plan <id> <text>`, `/hitl:design <id> <text>`) → write it into
  the Notes of the open round (as a new `>` line), then process it like Notes. Never into `## Description`.
- A run with no answer at all (every `>` empty, no accept-all Y, no pending Notes; `hitl-index brief` `counts.answered`
  is 0) → change nothing: print `Round <n> in <path> has no answers yet.` and END THE TURN. A round with only its
  Notes filled is processed: the empty questions are carried.

## 7. Recording (settled answers only, after the run reads the file, before the next round; a discussion records nothing)
Plan writes only the change's business files; design writes only its dev files (see each SKILL.md):
- `[R]` → a requirement block in `specs/<capability>/spec.md` (ADDED, or MODIFIED with the full block + `Changed:`),
  id from `hitl-index spec next-id <change-id> --kind R` (the change key prefixes it: `PWR-R1`). Statement = one EARS sentence with one RFC 2119 keyword in
  English (`When <trigger>, the system SHALL …` · `While <state>, …` · `If <unwanted>, then the system SHALL …` ·
  `Where <feature>, …`). ≥ 1 scenario each (`spec next-id --scenario <REQ-ID>`), and ≥ 1 failure/edge scenario when it
  validates input or handles errors. Numbers only if the user gave them or accepted a recommended number.
- `[S]` → the delta file header (`> capability: … | change: …`), `## Purpose` for a new capability, the
  proposal `## Capabilities` row.
- `[A]` → the `## Artifacts` row (`assumed`, `asked → included`, `asked → skipped`).
- `[T]` → a `### Term:` block in the change's `glossary.md` (ADDED; MODIFIED with the full text when a living term
  changes; REMOVED + `Reason:`) with `_Avoid_:`, written the moment the term is settled (never batched at close). Reword
  every requirement and scenario of the change that used an avoided word.
- `[D]` → `| <KEY>-D<n> | decision | why | alternatives | cost if wrong | serves | accepted |` in design.md (id from `hitl-index spec next-id <change-id> --kind D`). An accepted
  recommendation still gets a row. A reversal before approval: edit the row; after approval: supersede
  (`shared/amend-spec.md`).
- Unknown → `[NEEDS CLARIFICATION: <question>]` inline + a `- [ ] Qn …` line under the proposal's `## Open questions`;
  resolved questions leave that list.
- Facts → plan: proposal `## Assumptions` (business words); design: `## Context` with `(source: <path or doc>)`.
- Then the brief: `→ recorded: <ids>` under each settled question (§6). Set `updated:` to today in every meta line you
  touched.

## 8. Parking and cross-overs
- A **design idea** during `/hitl:plan` ("use Redis", "add a column", "call service X") is never discussed there. Append
  it to `design.md ## Parked from planning` (create design.md from `${CLAUDE_PLUGIN_ROOT}/shared/templates/design.md`
  with `status: draft` if missing), mark the question `→ parked for design` and add the info line
  `_Parked:_ <idea> (for /hitl:design)` to the next round. Keep only its business effect, if any, as an `[R]` question.
- A **new behaviour** during `/hitl:design` → a question `### Q<n> _Needs spec:_ <behaviour> (needs its own Y)` in
  the next round whose body is the `_Delta:_` preview of `shared/amend-spec.md` §2; its own `Y` applies it (the
  accept-all line does not, §4). A missing term → `### Q<n> _Needs term:_ <term> — <definition>` the same way; it
  writes only the change's `glossary.md`, so the accept-all line may take it.

## 9. Done and close
The frontier is empty (every category ✅ or —, no hotspot left open, every artifact and `[T]` decided) or the user
answered `done`. Then the skill's close step runs (validate, review) and appends `## Close` to the brief instead of a
new round: the summary block of the skill, then one `### <question>` per decision with an empty `>` line — first
`### O<n> ⚠️ Overlap with <P> — … (1/2/3)` per overlap finding (other-changes.md §4), then the Notes block (§4), last
`### Approve the spec? (Y/n)` (design: `### Approve the design? (Y/n)`). Plan applies the **stop rule** (elicitation.md §4): with
`COVERAGE_GAP` / `REQ_UNCLEAR` from `spec validate` the last question is `### Close with gaps? (round · deep <ID> ·
force)` instead, with the gap list above it; `force` is recorded as `_Forced:_`. Header `status: closing`; chat:
`<path>: ready to approve — answer the Close section, then /hitl:plan <id>` (one line). END THE TURN.
On the next run, in this order (each skill adds only its own steps to it):
1. Pending Close Notes (§6). A Notes text that changes the spec or design → record it, mark `→ superseded` on the old
   Close question and write a new `## Close` after the old one (no approval on a summary the user has not seen); END
   THE TURN. Notes that change nothing → `→ recorded: no change (<why>)`, then go on.
2. Each `### O<n>` overlap answer (other-changes.md §4).
3. The last question: `Y` → approve (the skill's step), header `status: done`, `→ approved <date>` under it. `n` +
   text, `round`, `deep <ID>` → `→ continued in Round <n>` under it, header `status: open`, a new round after
   `## Close`. A bare `n` → `_Disc:_ What should change?` under it, header stays `closing`, END THE TURN. Empty →
   `<path>: waits for your answer`, END THE TURN.
Never move to the next phase before the user's `Y` in the file.

## 10. Shared language (plan; design uses it through `_Needs term:_`)
The glossary = living `.hitl/specs/GLOSSARY.md` + the change's `glossary.md`. Ask a `[T]` question when:
- **Challenge**: the user uses a word the glossary defines differently, or a word in some term's `_Avoid_` list. Quote
  the definition: "Glossary: *Account* = … You wrote 'user record'. Same thing?" Recommend the glossary word.
- **Sharpen**: a noun that could name two concepts ("account": the Customer or the User?). Recommend one canonical word.
- **Boundary**: two terms are close → one concrete example in the question body that separates them.
- **Check against code**: the user says how the system works today and a scout `behaviourFacts` or `vocabulary` row
  disagrees → "The code says …; you said …. Which is right?" No fact yet → plan: one follow-up spec-scout question
  (never read code here); design: Explore. Never hold the rest of the round for it.
- Ask only about avoided words, conflicting definitions and new nouns used in a requirement; never about every noun. A
  new noun with one obvious word → record it and add the info line `_Assumed:_ term <Term>` instead of asking.
- Term rules (what a definition may hold): `shared/templates/glossary.md`.
