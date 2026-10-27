# Interview overlay (hitl rounds on top of `hitl:grilling`)

Uses the vendored `hitl:grilling` technique (mattpocock/skills, MIT — see NOTICE.md): frontier rounds, numbered
questions with a recommended answer, "yes" accepts the recommendation, facts are the agent's job, decisions are the
user's, done when the frontier is empty and the user confirms. This file only says how hitl **formats and records**
those rounds. Where this file and the grilling skill differ, this file wins (format, caps, recording). Own text.

Used by `/hitl:plan` (tags `[R]`, `[S]`, `[A]`) and `/hitl:design` (tags `[D]`, `[A]`).

## Contents
1. Loading
2. What a round may ask (per skill)
3. Coverage taxonomy (plan)
4. Round format
5. Discussion vs Suggestion mode
6. Reply grammar
7. Recording (after every reply)
8. Parking and cross-overs
9. Done

## 1. Loading
The first interview step of `/hitl:plan` and `/hitl:design` invokes the Skill tool with `hitl:grilling` (the user never
calls it). If the Skill tool is unavailable or the call fails, Read `${CLAUDE_PLUGIN_ROOT}/skills/grilling/SKILL.md`
instead and say nothing about it. Then apply this overlay. Load it once per conversation.

## 2. What a round may ask
There is **no design tree of components and no levels**. The frontier is a set of open topics:
| tag | asked by | about | becomes |
|---|---|---|---|
| `[R]` | plan | observable behaviour: actors, triggers, states, unwanted behaviour, optional features, out of scope | requirement + scenarios in a spec delta |
| `[S]` | plan | scope mapping: which capability (business area) a behaviour belongs to, new vs existing capability, its key | delta file + proposal `## Capabilities` row |
| `[A]` | plan, design | whether to add an optional artifact (`shared/artifacts.md`); max 2 per round | proposal / design `## Artifacts` row |
| `[D]` | design | how: components (module level), data, contracts, errors, test strategy, risks, rollout | `D-n` row in design.md |
- Plan never asks `[D]`. Design never asks `[R]`: a design answer that needs new behaviour becomes `💡 Needs spec: …`
  (amend the delta in the same gate, `shared/amend-spec.md`).
- `[S]` questions wait for the spec-scout result (`.scout.json`); every other question does not.

## 3. Breadth and depth (plan)
Mechanics in `${CLAUDE_PLUGIN_ROOT}/skills/plan/references/elicitation.md` (plan reads it with this file; design does not):
- **Coverage** (idea from github/spec-kit `/clarify`, MIT): nine categories — Scope & behaviour · Actors &
  permissions · Data & lifecycle · Business rules · Edge cases & errors · Integrations · Quality (NFR) · Terminology ·
  Success criteria — each `✅ clear · ⚠️ partial · ❌ missing · — n/a (reason)`, kept in the proposal `## Coverage`
  table. The frontier takes ❌ then ⚠️ first; a ✅ or — category asks nothing. Never ask about technology.
- **Hotspots 🔥**: impact × uncertainty (H/M/L); hotspots are drilled into (their child questions) before widening.
- **`deep <ID|topic>`**: the user opens a technique menu (example mapping, five whys, edge cases, pre-mortem,
  decision table, stakeholder lenses); results go straight into the delta/proposal.

## 4. Round format
```
🌳 Round 2 — [R][A]   (settled: ACC-R3…R4 · S: 5 · open: 2 · 🔥 ACC-R4)
Độ phủ: Scope ✅ · Actors ✅ · Data ⚠️ · Rules ✅ · Edge ❌ · Integr — · NFR — · Terms ✅ · Success ⚠️

❓ **Q1** [R] - **<question title>**: <body; options if any>
💡 Recommended: <answer>

---

❓ **Q2** [A] - **<question title>**: <body>
💡 Recommended: <answer>

Reply: "Y" (accept all) · "Q2: <your answer>" · "deep <ID|topic>" · "add <artifact>" / "drop <artifact>" · "done"
```
- ≤ 7 questions per round; if more, take the ones that unblock the most. A question that depends on another open
  question of this round goes to a later round.
- `💡 Recommended:` replaces upstream's `➡️`. Word each question so "yes" accepts the recommendation.
- Header counts: plan → `settled: <first…last requirement id> · S: <scenario count> · open: <open questions> · 🔥 <hotspots>`
  plus the coverage line (category labels may be shortened; written in the user's language);
  design → `settled: D-1…D-<n> · open: <n>`.
- Plan questions use business words only (no code names, file paths, libraries). Design questions may name code.
- Each round is one ⛔ GATE: END THE TURN after the `Reply:` line.

## 5. Discussion vs Suggestion mode (design rounds, and plan rounds with real business alternatives)
- **Discussion Mode** — several valid approaches. In the question body:
  ```
  Option 1: <approach>
  ✅ Pros: … ❌ Cons: …
  Option 2: <approach>
  ✅ Pros: … ❌ Cons: …
  💡 My Recommendation: Option 2 — reasoning: <tie to a requirement id or a fact with its source>
  ```
- **Suggestion Mode** — a clear best practice exists: `💡 Recommended: <answer> (<why, ≤ 10 words>)`.
- Anti-hallucination rules from `conventions.md` apply (proven tech, official docs, "unknown" when unsure).

## 6. Reply grammar
- `Y` / `y` / `ok` / `được` / `ừ` → accept every recommendation of the round.
- `Qn: <answer>` (several allowed, one per line or `;`-separated) → that answer; the other questions keep their
  recommendation only when the user also wrote `Y`, else they stay open.
- `add <artifact>` / `drop <artifact>` → change the artifact decision (`asked → included|skipped`), record it.
- `deep <ID|topic>` (plan) → the technique menu of elicitation.md §3 as the next gate.
- `done` → stop asking; unanswered questions go to `## Open questions` with their recommendation (plan: then the
  stop rule decides whether the spec may close).
- Free text that answers no question → treat it as new information: record what it settles, then recompute.

## 7. Recording (after every reply, before the next round)
Plan writes only the change's business files; design writes only its dev files (see each SKILL.md):
- `[R]` → a requirement block in `specs/<capability>/spec.md` (ADDED, or MODIFIED with the full block + `Changed:`),
  id from `hitl-index spec next-id <capability> --kind R`. Statement = one EARS sentence with one RFC 2119 keyword in
  English (`When <trigger>, the system SHALL …` · `While <state>, …` · `If <unwanted>, then the system SHALL …` ·
  `Where <feature>, …`). ≥ 1 scenario each (`spec next-id --scenario <REQ-ID>`), and ≥ 1 failure/edge scenario when it
  validates input or handles errors. Numbers only if the user gave them or accepted a recommended number.
- `[S]` → the delta file header (`> capability: … | key: … | change: …`), `## Purpose` for a new capability, the
  proposal `## Capabilities` row.
- `[A]` → the `## Artifacts` row (`assumed`, `asked → included`, `asked → skipped`).
- `[D]` → `| D-n | decision | why | alternatives | cost if wrong | serves | accepted |` in design.md. An accepted
  recommendation still gets a row. A reversal before approval: edit the row; after approval: supersede
  (`shared/amend-spec.md`).
- Unknown → `[NEEDS CLARIFICATION: <question>]` inline + a `- [ ] Qn …` line under `## Open questions`; resolved
  questions leave that list.
- Facts → plan: proposal `## Assumptions` (business words); design: `## Context` with `(source: <path or doc>)`.
- Set `updated:` to today in every meta line you touched.

## 8. Parking and cross-overs
- A **design idea** during `/hitl:plan` ("use Redis", "add a column", "call service X") is never discussed there. Append
  it to `design.md ## Parked from planning` (create design.md from `${CLAUDE_PLUGIN_ROOT}/shared/templates/design.md`
  with `status: draft` if missing) and print `💡 Parked for /hitl:design: <idea>`. Keep only its business effect, if any,
  as an `[R]` question.
- A **new behaviour** during `/hitl:design` → `💡 Needs spec: <behaviour>` + the 📐 delta preview in the same gate.

## 9. Done
The frontier is empty (every category ✅ or —, no hotspot left open, every artifact decided) or the user said `done`.
Then the skill's close step runs (validate, summary gate). Plan applies the **stop rule** (elicitation.md §4): close
only without `COVERAGE_GAP` / `REQ_UNCLEAR` from `spec validate`, else a gap gate with "force" recorded as
`💡 Forced:`. Never move to the next phase before the user confirms at that gate.
