---
name: plan
description: Interviews the user grill-style about a task or feature (behaviour first, then a design tree; one frontier of numbered questions per round with recommended answers) and records requirements R-n (EARS-lite) and decisions D-n level by level in .hitl/planning/[type]-[feature].md, plus test seams, risks and out-of-scope. Also amends an approved plan (supersede D-n, amend R-n, Changelog). Use when the user describes something to build or fix, says "planning", "brainstorm", "lên plan", "thiết kế", wants to continue a planning file, or types "<file> amend".
argument-hint: "[mission description | planning-file-name [amend]]"
allowed-tools: Read Glob Grep Write Edit Agent Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:plan — grill-style planning

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. Interview technique: read
`${CLAUDE_SKILL_DIR}/references/grilling.md` before the first round. Template: `${CLAUDE_PLUGIN_ROOT}/shared/templates/planning.md`.

Arguments: `$ARGUMENTS` — a mission description, a planning file name, `<planning-file> amend`, or empty.
`<file> amend` → amend mode (section 7); skip steps 3–6.
Empty and no mission in this conversation → ⛔ GATE `Please describe the new mission or a planning file name:` END THE TURN.

## 1. Load context (no questions)
- Read `.hitl/docs/BUSINESS-CONTEXT.md` and `ARCHITECTURE.md`. Read `CODEBASE-MAP.md` only if the work touches existing code.
- Missing doc → one line `❌ <doc> missing (💡 /hitl:overview)` and continue.
- Not initialized → per conventions (`/hitl:setup`), stop.

## 2. Pick the file
🔍 Glob `.hitl/planning/*.md`; match file names and `#` titles / Level 1 component names against the arguments.
- Arguments name an existing file exactly (with or without `.md`) → resume it, no gate.
- Matches → ⛔ GATE:
  ```
  🔍 Found existing planning files:
  1. feat-user-auth.md — "User Authentication" — progress: Level 2, requirements 4, decisions 5, open questions 3, status draft
  2. feat-session-mgmt.md — "Session Management" — progress: Level 1, open questions 0, status approved
  Continue with existing file? (1/2/new)
  ```
  Progress = deepest `Level N` heading, count of `R-` lines and `D-` rows, count of `- [ ]` under `## Open questions`, meta `status`.
- No match → suggest `[type]-[slug].md` (type from the mission: feat/fix/refactor/perf/docs/test/chore) → ⛔ GATE
  `Save as \`feat-<slug>.md\`? (Y/n) or enter different name:`
- END THE TURN at either gate.
- Resuming a file with `status: approved` (not amend mode) → `💡 Planning is approved. Editing sets it back to draft
  (💡 for a small change use /hitl:plan <file> amend).` and continue.

## 3. Facts first
Dispatch an Explore subagent (thoroughness: medium) with the questions the code can answer: existing modules and
patterns in the area, reusable services, data shapes, constraints, test setup. Use `hitl-index context <ref> --json`
for known symbols. Record results in `## Context & Constraints` with `(source: …)`. Never ask the user for facts.

## 4. Design tree + file
- Build the design tree: pseudo-component **Behaviour** first, then Level 1 components → the decisions under each
  (see grilling.md §1). Behaviour is never written under `## Level 1 - Components`; its answers become `## Requirements`.
- New file: write it from the template with `status: draft`, today's date, the `tasks:` path (same name under `tasks/`).
  Part A: `## Goal`, `## Requirements` (empty), `## Out of scope`. Part B: `## Context & Constraints`,
  `## Level 1 - Components`, every component under `### Other Components (Not Yet Brainstormed)`, and the remaining
  headings (Decisions, Test seams, Risks, Open questions, Changelog) with the template rows removed.
- Part A holds behaviour only: no file names, signatures, classes or libraries.
- Resumed file: rebuild the tree from its Requirements, Levels, Decisions and Open questions; continue from the deepest
  unresolved level. A legacy file without `## Requirements` → add the heading after `## Goal` and run one Behaviour round.

## 5. Round loop (one ⛔ GATE per round)
1. Compute the frontier (≤7 questions). Round 1 = Behaviour only (actors, triggers, states, unwanted behaviour,
   optional features, out of scope); design rounds follow. Tag the round header `[R]` or `[D]`
   (`🌳 Round 1 — Behaviour [R]`). Use the round format in grilling.md §3: numbered `❓ Q`, `💡 Recommended`,
   Discussion Mode (✅ Pros / ❌ Cons / 💡 My Recommendation + reasoning) when several approaches are valid,
   Suggestion Mode (one line) when a best practice is clear.
2. Append the `Go deeper? Which item? ('done' to finish)` line with the Level N+1 candidates.
3. END THE TURN.
4. On the reply: record per grilling.md §6 (R-n lines, D-n rows with `serves`, Approach lines, Open questions, Context), move a brainstormed
   component from "Other Components" into `## Level 1 Component Details` (or the deeper level), then compute the next round.
   - "Y" / "ok" / "được" → accept every recommendation in the round.
   - An item name → open the next level for it (`### Level 2 - <Component> Sub-Components`, numbered `Sub → keywords`).
   - "done" → go to step 6 (unanswered questions stay in `## Open questions` with their recommendation).
   - Text that is a new component → add it to the tree and say `💡 Added <x> to Level <k>`.
   - A design answer or text that implies new behaviour → add an R line and say `💡 Added R-<k>`.

## 6. Close the plan
When the frontier is empty or the user said "done", fill (from the decisions; no new questions):
- `## Requirements` check — 3–10 lines, each observable and EARS-lite, priority set; every active `must` R has a D that
  `serves` it or needs none (trivial behaviour). Fix wording only; new behaviour → ask in one more round.
- `## Test seams` — the highest public seams to test (endpoint, exported function, module boundary), each with a one-line
  "catches / misses". Prefer existing seams; fewer is better.
- `## Risks` — concurrency, security, public-api, data, perf (only the ones that apply; state why). For security, one
  line naming the trust boundaries crossed (`security: anonymous client → upload parser → tenant storage`); the review's
  security lens reads it.
- `## Out of scope`.
Then ⛔ GATE:
```
📋 <Mission> — R: <n> (<m> must) · D: <k> · open: <j> · R without serving D: <ids|none>
components: <c> · Test seams: <list> · Risks: <tags>
Planning complete? Mark approved and continue to /hitl:tasks? (Y/n)
```
END THE TURN. On yes: set `> status: approved` (meta line), update `updated:`, print
`✅ Approved. 🎯 next: /hitl:tasks <file-name>`. On no: continue the round loop with what they name.

## 7. Amend mode (`/hitl:plan <file> amend`)
For a small change to an approved plan, keeping `status: approved`. Follow `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md`.
1. Load the planning file, its tasks file and `hitl-index trace <file> --json` (current links). Not approved → say
   `💡 Planning is draft; editing normally.` and use the round loop instead.
2. One ⛔ GATE round: the user's change as questions (which D-n to supersede, which R-n to amend/drop/add), each with
   `💡 Recommended`, followed by the **📐 Spec delta** preview (amend-spec.md §2) and `Apply? (Y/n/edit)`. END THE TURN.
3. On Y: apply per amend-spec.md (supersede, never edit decisions in place; Changelog line per change; `updated:` today).
   New components or new `must` R → `status: draft` and `🎯 next: /hitl:tasks <file> (update)`.
   Otherwise stays approved; print `✅ Amended (<n> changes).` and the next step from amend-spec.md §5.

## Rules
- Write only the planning file (amend mode: also tasks md AC text and `@dec` lines, per amend-spec.md). No code, no
  signatures in the plan.
- Keep the template headings exactly (other skills parse them). Prose may follow the user's language.
- No invented metrics, estimates or scores.
