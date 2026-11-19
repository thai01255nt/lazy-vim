---
name: design
description: Technical design (HOW) of an approved hitl change: grill-style developer interview in a brief file answered in the editor → design.md (decisions, components, data model, contracts, test strategy, risks); "Y" on a round's accept-all line takes every recommendation except questions marked "(needs its own Y)". Use after /hitl:plan or for "design", "thiết kế", "architecture", "how should we build", "kiến trúc". Not for requirements (/hitl:plan) or function signatures.
argument-hint: "<change-id> | <change-id> amend [N-k]"
allowed-tools: Read Glob Grep Write Edit Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:design — the design (HOW)

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-spec.md`.
Templates: `${CLAUDE_PLUGIN_ROOT}/shared/templates/{design,data-model,design-brief}.md` and `shared/templates/contracts/*`.
Interview: the `hitl:grilling` skill + `${CLAUDE_PLUGIN_ROOT}/shared/interview.md` (the brief file: format, answer
grammar, recording). Artifacts: `${CLAUDE_PLUGIN_ROOT}/shared/artifacts.md` (step 3.1 reads them).
**Read only when needed** (not up front):
- `${CLAUDE_PLUGIN_ROOT}/shared/formats/<file>` — before writing the first instance of that artifact in this change:
  `decisions.md` (the first MADR record `### <KEY>-D<n>`), `contracts.md` (OpenAPI 3.1 / AsyncAPI 3 / JSON Schema 2020-12 /
  CLI md), `architecture-c4.md`, `state-machines.md`.
- `${CLAUDE_PLUGIN_ROOT}/shared/spec-format.md` (§ Design: the D table and contract rules the CLI checks) — when
  `spec validate` reports an error whose fix is not clear from its message.
- `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md` — for a `💡 Needs spec` delta preview (§4) or amend mode (§7).
- `${CLAUDE_PLUGIN_ROOT}/shared/other-changes.md` — when a decision changes what another active change owns (owner
  check §3), when `hitl-index overlap` reports new contract or file evidence (§4), or when work turns out to be out of
  this change's scope (§1).
Ideas adapted (no text): obra/superpowers brainstorming ("look before you ask", lay out approaches, scale the ceremony
to the change) and the github/spec-kit plan artifact set — see NOTICE.md.

Arguments: `$ARGUMENTS` — `<change-id>`, `<change-id> amend` (supersede decisions, `shared/amend-spec.md`), or
empty (then the change from this conversation, else the active change with `phase: design` from `hitl-index change
--json`; several → ⛔ GATE `Design which change? (1/2/…)` END THE TURN; none → `🛑 No change to design. Run /hitl:plan first.`).

**The interview happens in a brief file** (`.hitl/changes/<id>/design-brief.md`, interview.md §4), never in chat: the
developer answers in the editor, then runs `/hitl:design <id>` again (or says "continue", "next", "xong" here). Every
question carries a `💡 Recommended`; `Y` on a round's accept-all line takes them all (the build-then-review shortcut),
except the `(needs its own Y)` questions (`💡 Needs spec`, `📥 For <P>`, a rename; interview.md §4). Amend (§7) and the
approved-design gate (§1) stay chat gates.

**Granularity limit (normative).** Modules/services/components, external interfaces (contracts), entities and fields,
component-level sequence, error strategy, test strategy and seams, risks, rollout. **Never** function signatures,
per-file symbol lists or code bodies: those belong to `/hitl:tasks` (`### Symbols`) and `/hitl:skeleton`.

## 1. Preconditions and load (no questions)
- `hitl-index change <id> --json`. Unknown → `🛑` + the list of active ids. Archived → `🛑 archived; use /hitl:plan <new id>`.
- Proposal `status: draft` → `⚠️ spec still draft` and continue (repeated in the Close summary).
- Proposal `## Artifacts` says `design | skipped` → `💡 Design was skipped in the spec (<why>). Continue anyway? (y/N)`
  ⛔ GATE END THE TURN; on y change that row to `asked → included`.
- Load: `hitl-index spec show --change <id> --json` (the effective spec view), the proposal, `.hitl/specs/GLOSSARY.md`
  and the change's `glossary.md` (if present; the project's words), `.hitl/docs/ARCHITECTURE.md`,
  `PATTERNS-CONVENTIONS.md`, `CODEBASE-MAP.md`, `CONSTITUTION.md` (if present), the existing `design.md` (resume;
  its `## Parked from planning` ideas are frontier items) and the brief (`hitl-index brief <id> --kind design --json`
  + the file) when it exists.
- New design: write `design.md` from the template (`status: draft`, today); drop the template rows; remove the
  `## Constitution check` section when there is no CONSTITUTION.md.
- design.md `status: approved` and no `amend` argument → ⛔ GATE (chat):
  `Design is approved. 1. small edit: /hitl:design <id> amend · 2. reopen the design: design back to draft, a new round in the design brief`
  END THE TURN. Reply `1` → §7 (amend). Reply `2` → design.md `status: draft`, `updated:` today; the design brief gets
  a new `## Round <n>` after its last section (header `status: open`, the text after the id, if any, in its Notes) and
  §4 runs on it.
- Otherwise: `design-brief.md` exists → §4 (a later run); no `design-brief.md` → §2–§3 (round 1).

## 2. Facts (subagent; keeps code reading out of this conversation)
Dispatch **one Explore subagent** (thoroughness: medium) with the code questions the design depends on: existing
modules in the area, reusable services, data shapes and persistence, external interfaces, test setup and seams,
patterns to follow, and the accepted decisions in `.hitl/archive/*/design.md` (D table) that touch these modules (id,
archived change, decision). Ask it for ≤ 20 bullet facts each with a path, and wait for it: every round-1 question
needs a recommendation based on these facts. Record them in `## Context` as `- <fact> (source: <path>)`; an archived
decision as `- <archived change> <KEY>-D<n>: <decision> (source: …)`. A new decision that contradicts one →
Discussion Mode that quotes it ("Contradicts <change> PWR-D3 (…); reopen because …"). Use `hitl-index context <ref>
--json` for a single known symbol. Never ask the user a fact. Later runs: a question that needs a new fact → Explore
again before writing the next round.

## 3. Technique, artifacts, the brief (round 1)
1. **Grilling, automatically**: invoke the Skill tool with `hitl:grilling` unless it is already loaded in this
   conversation (the user never calls it). If the Skill tool is unavailable, Read
   `${CLAUDE_PLUGIN_ROOT}/skills/grilling/SKILL.md`. Then Read `${CLAUDE_PLUGIN_ROOT}/shared/interview.md` (overlay; it
   wins on format) and `${CLAUDE_PLUGIN_ROOT}/shared/artifacts.md`.
2. Decide the (a) artifacts (data-model, contracts, sequence, migration/rollout, research notes) per artifacts.md:
   high confidence → a `💡 Assumed: …` info line in the round + a row in the proposal `## Artifacts` table; uncertain
   → `[A]` question (max 2 per round).
3. Constitution (if present): one line per principle the design touches in `## Constitution check`
   (`ok` | `waived (why)`); a waiver is always a `[D]` question.
4. **Write `design-brief.md`** from `${CLAUDE_PLUGIN_ROOT}/shared/templates/design-brief.md`: header (change, key,
   `kind: design`), `## Description` empty for the developer's own notes before the first run (later notes go into the
   open round's Notes), then `## Round 1` with the info lines, the accept-all line, and:
   - one `[D]` question per idea in design.md `## Parked from planning`, first;
   - the 8 core `[D]` questions of the template (technology constraints must / must not · existing modules to reuse ·
     data storage and migration · external interfaces and contracts · error handling · test seams and doubles · risk
     areas security / performance / concurrency · rollout), each made concrete with the Context facts;
   - tailored `[D]` questions: one per ADDED/MODIFIED `must` requirement whose HOW the core questions leave open
     (max 8), and the `[A]` questions.
   **Every question carries `💡 Recommended`** (Suggestion Mode) or the Discussion Mode block (interview.md §5), tied
   to a requirement id or a `## Context` fact. A core question that does not apply to this change (no stored data, no
   interface) → leave it out and add the info line `💡 Assumed: no <topic> change (<why>)`.
5. Chat: `📝 Design brief ready: .hitl/changes/<id>/design-brief.md — answer, then /hitl:design <id>`. END THE TURN.

## 4. Later runs: read the answers, record, next round `[D]`
1. Text after the id → into the Notes of the open round (or of the Close section), never into `## Description`.
   If the header says `status: closing`, go to §6; else continue. `hitl-index brief <id> --kind design --json`; no answer at all (`counts.answered` 0:
   no answer, no accept-all Y, no pending Notes) → interview.md §6 (`no answers yet`), END THE TURN. A round with only
   its Notes filled is processed. `## Description` is read at the first processing run only.
2. Process every pending question, then every pending Notes block, per interview.md §6 (answer grammar — `deep` is
   text here —, accept-all and `(needs its own Y)` questions, decline answers, discussions `💬`, Notes, rename, scope
   change) — a question or discussion records nothing. Design-specific: a decision or fact → a D row or a `## Context`
   fact, `→ recorded: <ids> (new|changed)`; a correction of an earlier answer (`Q5: …`, `sửa Q5: …`) → edit that D
   row in place before approval (after approval: supersede through amend, §7), `(changed)`; a postponed answer (`n` +
   "later", "để sau") → a `(deferred: …)` line under design.md `## Open questions`; a scope change → interview.md §6
   Scope change (a change of WHAT also needs a `💡 Needs spec` question, below).
3. Record the settled answers (interview.md §7), then `→ recorded: <ids>` under each question (after a blank line,
   interview.md §4) and ` ✅` on the round:
   D rows (id `<KEY>-D<n>` = the change key, from `hitl-index spec next-id <change-id> --kind D`; `serves` =
   requirement/rule ids from the spec view; `alternatives` filled; status `accepted` once the developer agreed — an
   accepted recommendation, by `Y` or accept-all, is agreement) plus a MADR record `### <KEY>-D<n> <title>` (Context
   and problem, Considered options, Decision outcome, Consequences good/bad, optional Decision drivers/Confirmation) for
   every decision with ≥ 2 real options or a `cost if wrong` of data loss, security, money or public API (artifacts.md
   "decision records"), `## Architecture (C4)` (Context/Container mermaid, only
   per artifacts.md), `## Components` (`- <component> — <responsibility> — new|changed — (<KEY>-D<n>)`), `## Data model` or
   `data-model.md`, `contracts/<file>` from the matching skeleton (HTTP `*.openapi.yaml`, events `*.asyncapi.yaml`, payloads
   `*.schema.json`, CLI `cli-*.md`; only what the change adds or changes) + its `## Contracts` line
   (`- contracts/<file> — <boundary>`), `## State machines` (technical lifecycles: `stateDiagram-v2` + transition table), `## Flow / sequence`
   (mermaid `sequenceDiagram` at component level, optional), `## Error handling`, `## Test strategy` (one line per
   ADDED/MODIFIED requirement: `seam — catches / misses — doubles`, highest seams: endpoint, CLI, module boundary;
   `${CLAUDE_PLUGIN_ROOT}/shared/test-patterns.md` §3, §5; test kinds; data), `## Risks`
   (`concurrency|security|public-api|data|perf` with why; for security one line naming the trust boundaries:
   `security: anonymous client → reset endpoint → account store`), `## Migration / rollout`. Parked ideas that were
   decided leave `## Parked from planning`.
- Names: new components, entities, events, contract fields and test seams take the glossary term in code form
  (*Reset link* → `ResetLink`). A business noun the glossary lacks → a `💡 Needs term: <term> — <definition>` question
  in the next round; `Y` writes it to the change's `glossary.md` (rules: `shared/templates/glossary.md`).
  Technical-only names (token hash, queue) stay out of the glossary.
- A decision that needs **new behaviour** → a `### Q<n> 💡 Needs spec: <behaviour> (needs its own Y)` question in the
  next round whose body is the 📐 delta preview of `shared/amend-spec.md` §2; its own `Y` applies it, never the
  accept-all line (the change's delta gets the requirement; proposal back to draft only for a new capability or a new
  `must` requirement); a bare `n` → nothing written, `→ recorded: declined`.
4. Recompute the frontier: decisions that unblock others first (boundaries and components → data and contracts →
   errors → test strategy → risks → rollout), carried questions (same numbers), `💡 Needs spec` / `💡 Needs term`.
   Discussion Mode when several approaches are valid; Suggestion Mode for clear best practice. Frontier empty, or the
   developer answered `done` (unanswered questions → design `## Open questions` with their recommendation) → §5.
5. Else append `## Round <n+1> — D: <KEY>-D1…<KEY>-D<k> settled · open: <n>` with the accept-all line, ≤ 7
   questions, each with `💡 Recommended`, and the Notes block last. Update the header. Chat ≤ 3 lines: `✅ recorded: <counts>` and
   `🌳 Round <n+1>: <k> questions in .hitl/changes/<id>/design-brief.md`. END THE TURN.

## 5. Close (in the brief)
1. `hitl-index spec validate <id> --json` (it also checks the D table, `serves` refs and contracts). Fix every error
   (`DESIGN_SERVES_UNKNOWN`, `DESIGN_DEC_STATUS`, `CONTRACT_MISSING`, …) yourself, max 3 loops, and the standards
   warnings (`DESIGN_DEC_INCOMPLETE`, `DESIGN_DEC_SUPERSEDE_UNKNOWN`, `CONTRACT_PARSE|VERSION|STRUCTURE`, `SM_*`).
   No `proposed` decision is left at close: each is accepted or rejected.
2. Coverage: every ADDED/MODIFIED `must` requirement has an accepted D that serves it, or is trivially covered
   (say which in one line). The trace reports `REQ_NO_DEC` later; fix it now (a missing decision → one more round).
2b. Overlap recheck: `hitl-index overlap <id> --json`. A candidate with `parent: true` and new `contract` or `file`
   evidence → its line `🔗 parent <P> — shared: <the new contract/file refs>` in the summary below and the owner check of
   other-changes.md §3 on exactly those refs (a decision that changes what P owns → a `📥 For <P>` question, heading
   ending `(needs its own Y)`). Every other
   candidate with `linked: false`: judge only its new `contract` and `file` evidence (both changes name the same
   contract or source file) with the witness rule of other-changes.md §4, and put each real overlap in the Close
   section as its `### O<n> ⚠️ Overlap with … (1/2/3)` question. A decision that changes another change's contract →
   a `design` note there (owner check §3), never an edit of its files.
3. Append `## Close` to the brief (interview.md §9), header `status: closing`:
   ```
   ## Close

   🏗️ Design feat-password-reset — D: 5 (accepted 5) · components: 3 (2 new) · contracts: 1 · data-model ✅
   risks: security (anonymous client → reset endpoint → account store) · test seams: reset endpoint, mail port
   must requirements without a serving D: none · open: 0 · validate: ✅ · spec: approved

   ### Notes — anything the questions missed, or a change to an earlier answer

   >

   ### Approve the design? (Y/n) — then /hitl:tasks

   >
   ```
   Chat: `📋 .hitl/changes/<id>/design-brief.md: ready to approve — answer the Close section, then /hitl:design <id>`.
   END THE TURN.

## 6. Approve (next run, header `status: closing`)
Read `.close.items` and `.close.notes` of `hitl-index brief <id> --kind design --json` and process them in the order
of interview.md §9 (pending Close Notes → each `### O<n>` overlap answer, other-changes.md §4 → the last question).
Design's own steps: `Y` → design `status: approved`, `updated:` today; brief `→ approved <date>` and header
`status: done`; print `✅ Design approved.` and `🎯 next: /hitl:tasks <id>`. `n` + text → `→ continued in Round <n>`,
header `status: open`, process the text (§4.2–4.3) and append the next round. A bare `n` → `💬 What should change?`
under it, header stays `closing`, END THE TURN. Empty → `📋 … waits for your answer`, END THE TURN.

## 7. Amend (`<change-id> amend [N-k]`)
Unchanged by the brief file: one chat gate.
Approved design: decisions are never edited in place — supersede per `shared/amend-spec.md` (new D row, old row
`superseded by <KEY>-D<k>`, Changelog line), in one ⛔ GATE with the 📐 delta, the 🔁 Impact block and `Apply? (Y/n/edit)`.
With `N-k`, the change is that design note (`hitl-index note show --change <id> N-k --json`); superseding the `<KEY>-D<n>` it
names is what lets `note apply` accept it. A superseded contract decision is class `contract` (reopens the skeleton).
A note from another change (`source: <other>`) is amended the same way; the change still waits until `<other>` is
archived (other-changes.md §5).

## Rules
- Write only in `.hitl/changes/<id>/`: `design.md`, `data-model.md`, `contracts/*`, `design-brief.md` (Claude's parts:
  rounds, marks, `💬`, Close — never the developer's `>` lines or Description text), and the proposal `## Artifacts`
  rows for (a) artifacts. Spec deltas only through the `💡 Needs spec` path; `glossary.md` only through `💡 Needs term`.
  Never code, never `.hitl/specs/**`.
- No function signatures, no per-file symbol lists, no line numbers. Name existing modules as they are in the code.
