# Grilling: design-tree interview rounds

Adapted from mattpocock/skills (MIT) — see NOTICE.md
Source: `skills/productivity/grilling/SKILL.md` @ 5c2cbbd5c3342a9ff4a80b7d8530759ca6a98c22.
Changes: round format uses the HITL emoji/(Y/n) style, adds v2 Discussion/Suggestion modes, records answers as `D-n`
decisions in the planning file, caps a round at 7 questions, and folds v2 "go deeper" into the same gate.
v2 additions: a Behaviour-first round producing `R-n` requirements in EARS-lite (EARS pattern keywords after Alistair
Mavin; idea only) and a `serves` link from each decision to the requirements it serves.

## Contents
1. Design tree
2. Frontier rounds
3. Round format
4. Discussion vs Suggestion mode
5. Facts are yours, decisions are theirs
6. Recording answers
7. When it is done

## 1. Design tree
Interview the user until you reach a shared understanding. Map the work as a **design tree**: Level 1 components,
and under each, the decisions that hang off it. Every decision branches into the decisions that depend on it.
Sub-components become Level 2, 3, … only when a component has its own unresolved sub-decisions.

**Behaviour first.** The tree always starts with the pseudo-component **Behaviour** (what the system must do, seen
from outside). Its questions are `[R]` questions and produce `R-n` requirements; every other component produces `[D]`
questions and `D-n` decisions. Round 1 asks only Behaviour:
- actors — who triggers it, who sees the result;
- triggers — "When <event> …";
- states — "While <state> …";
- unwanted behaviour — "If <bad input / failure>, then …";
- optional features — "Where <feature/config> …";
- out of scope — what it explicitly does not do.

**Design-First.** If the user arrives with a design (approach, algorithm, library), record those D rows first, then ask
"which behaviour does this serve?" in the next round to back-fill the R lines and the `serves` column.

## 2. Frontier rounds
Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions
you can ask *now* without guessing at answers you have not heard yet. Ask the whole frontier in one round (max 7;
if more, take the ones that unblock the most), number each question and give your recommended answer. Then STOP.

Each answer reshapes the tree: settled decisions push the frontier outward and unblock dependent questions.
Recompute the frontier and ask the next round. A question whose answer depends on another question still open in
this round belongs to a *later* round, not this one.

## 3. Round format
```
🌳 Round <n> — Level <k>: <component(s)> [R|D]   (settled: R-1…R-<r> · D-1…D-<m> · open: <count>)

❓ **Q1** - **<question title>**: <question body; options if any>
💡 Recommended: <answer>

---

❓ **Q2** - **<question title>**: <body>
💡 Recommended: <answer>

Go deeper? Which item? ('done' to finish)  →  Level 2 candidates: <Component A> → <subs>, <Component B> → <subs>
Reply: "Y" (accept all recommendations) · "Q2: <your answer>" · "<item>" to go deeper · "done"
```
Word each question so "yes" accepts your recommendation. Keep bodies short; one paragraph unless options are needed.

## 4. Discussion vs Suggestion mode
- **Discussion Mode** — several valid approaches. Inside the question body:
  ```
  Option 1: JWT tokens
  ✅ Pros: stateless, scales horizontally
  ❌ Cons: revocation is hard, bigger payload
  Option 2: Server sessions
  ✅ Pros: easy revocation, server control
  ❌ Cons: stateful, sticky sessions or shared store
  💡 My Recommendation: Option 2 — reasoning: <tie to a stated requirement or a fact from the code>
  ```
- **Suggestion Mode** — a clear best practice exists. One line: `💡 Recommended: <answer> (<why, ≤10 words>)`.
- Recommendations follow the anti-hallucination rules: proven tech, link official docs, say "unknown" if unsure.

## 5. Facts are yours, decisions are theirs
Finding *facts* is your job, never the user's. When a frontier question needs a fact from the environment
(existing module, current pattern, library already installed, data shape), dispatch an Explore subagent or use
Grep/Read/`hitl-index context` — do not ask the user anything you could look up yourself.
Do not block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it
wait; ask the rest of the frontier now. The *decisions* are the user's: put each one to them and wait.

## 6. Recording answers
After every reply, before computing the next round, update the planning file:
- Behaviour answer (`[R]`) → a line under `## Requirements`: `- R-n [must|should|could] <EARS-lite sentence>`.
  EARS-lite keywords: `When <trigger>, the system shall …` · `While <state>, …` · `If <unwanted>, then the system
  shall …` · `Where <feature>, …` · plain `The system shall …`. 3–10 per plan; observable behaviour only; no
  class/file/library names; numbers only if the user gave them. Postponed → `(status: deferred)`; removed →
  `(status: dropped)`; replaced → `(status: superseded by R-k)`. Never renumber; new ids are max+1 in the file.
- Design answer (`[D]`) → a row in `## Decisions`:
  `| D-n | <decision> | <why> | <cost if wrong> | <R ids it serves, or —> | accepted |`.
  An accepted recommendation still gets a row. A later reversal sets the old row's status `superseded by D-k`.
- A design answer that implies new behaviour → also add the R line and say `💡 Added R-k`.
- Update the component's `**Approach**: … (D-n)` in the matching Level section.
- Move resolved items out of `## Open questions`; add newly discovered questions there with their recommendation.
- New facts → `## Context & Constraints` with `(source: <path or doc>)`.
- Update `updated:` in the meta line. Never touch other files.

## 7. When it is done
The session is done when the frontier is empty — every branch visited, nothing silently assumed — or the user says
"done". Do not move on to tasks until the user confirms you have reached a shared understanding (the final gate).
