# NOTICE — credits and third-party licenses

`hitl` is MIT licensed (see `LICENSE`, © 2026 Thai). Some prompt and reference files are adapted
(modified, shortened, re-targeted to this workflow) from the MIT-licensed projects below.
Two skills are vendored unmodified (section 3).
Their copyright and permission notices are reproduced in full as the MIT license requires.
Each adapted file starts with a credit line: `Adapted from <project> (<license>) — see NOTICE.md. Source: <path> @ <commit>. Changes: …`.

## 1. Adapted sources (text adapted, MIT)

### mattpocock/skills — https://github.com/mattpocock/skills
Adapted into:
- `shared/templates/glossary.md` — from `domain-modeling/GLOSSARY-FORMAT.md` @ 5beb35b (glossary term blocks, `_Avoid_:` synonyms).
- `shared/templates/proposal.md` — from `to-spec` @ 5beb35b (problem from the user's view, no file paths; section ideas).
- `skills/tasks/references/slicing-and-risk.md` — from `to-tickets` (vertical slices, blocking edges, prefactor first, quiz the user).
- Ideas also taken from `tdd` (pre-agreed test seams) and `implement-spec` (context pointers).
- The `grilling` skill itself is vendored unmodified (section 3); `shared/interview.md` is hitl's own overlay on it.
  (v0.5's adapted `skills/plan/references/grilling.md` with its component "design tree" was removed in 0.6.)

```
MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### Fission-AI/OpenSpec — https://github.com/Fission-AI/OpenSpec
Adapted (format and merge semantics; commit 6d04a1b, docs `docs/concepts.md`, `docs/writing-specs.md`,
validator messages in `src/core/validation/constants.ts`) into:
- `shared/spec-format.md`, `shared/templates/spec.md`, `shared/templates/spec-delta.md` — living spec + delta format
  (`### Requirement:` / `#### Scenario:` with GIVEN/WHEN/THEN bullets, ADDED/MODIFIED/REMOVED sections, MODIFIED carries
  the full block, `Reason:` on REMOVED, archive moves the change folder);
- `scripts/lib/specmerge.mjs`, `scripts/lib/specmd.mjs` — apply order and validation rules re-implemented (no code copied);
- `shared/amend-spec.md` — the 📐 Spec delta preview.
Deviations: a stable id (`ACC-R3`) is the identity instead of the requirement name, so RENAMED is not supported (a new
title is a MODIFIED block); extra block kinds Rules / Flows / glossary Terms; `## Retired IDs` tombstones and
`## Change History`; archive goes to `.hitl/archive/<date>-<id>/`.

```
MIT License

Copyright (c) 2024 OpenSpec Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### github/spec-kit — https://github.com/github/spec-kit
Adapted (commit ee94598; `templates/spec-template.md`, `plan-template.md`, `checklist-template.md`, the `clarify`
command) into:
- `shared/templates/proposal.md` — success criteria, assumptions, inline `[NEEDS CLARIFICATION: …]` markers;
- `shared/templates/design.md`, `shared/templates/data-model.md`, `skills/design/SKILL.md` — the plan artifact set
  (technical context, constitution check, data model, contracts) re-shaped as hitl's `design.md` with `D-n` decisions;
- `shared/interview.md`, `skills/plan/references/elicitation.md` — the clarify coverage taxonomy (re-grouped into nine
  categories with ✅/⚠️/❌/— status and a stop rule);
- `agents/spec-reviewer.md` — the checklist idea ("unit tests for English") as review lenses;
- `skills/overview/SKILL.md` — the optional constitution idea (`.hitl/docs/CONSTITUTION.md`, user-written).

```
MIT License

Copyright GitHub, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### obra/superpowers — https://github.com/obra/superpowers
Adapted into:
- `skills/test/references/tdd-rules.md` — from `test-driven-development` and `verification-before-completion`
  (failing test first, verify RED for the right reason, no completion claims without fresh evidence).
- `skills/review/references/fix-loop.md` — from `receiving-code-review` (verify each finding, push back with evidence).
- Ideas also taken from `requesting-code-review` (fresh-context reviewer, never the session history),
  `subagent-driven-development`, and `brainstorming` @ 2ce8aa1 (look before you ask, lay out approaches before building,
  scale the ceremony to the change → `/hitl:design`).

```
MIT License

Copyright (c) 2025 Jesse Vincent

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 2. Idea-only credits (no code or text copied)

| Source | License | What was borrowed |
|---|---|---|
| github/spec-kit `/analyze` — https://github.com/github/spec-kit | MIT | Cross-artifact consistency → `tasks --check` and the `/hitl:tasks` consistency lines. Ideas only. |
| gotalab/cc-sdd — https://github.com/gotalab/cc-sdd | MIT | Steering docs with bootstrap/sync, "user customizations are sacred" (MANUAL sections preserved). Ideas only, no code copied. |
| gsd-build/get-shit-done (`/gsd:map-codebase`) — https://github.com/gsd-build/get-shit-done | MIT | Parallel codebase-mapper agents that write docs directly. Ideas only, no code copied. |
| Anthropic `code-review` plugin pattern — https://github.com/anthropics/claude-plugins-official | see repo | Parallel review lenses + per-finding confidence filter (≥80) + verifier pass. Ideas only, no code copied. |
| bothuany/insilode PR #10 "Skeleton first" — https://github.com/bothuany/insilode/pull/10 | AGPL-3.0 | "Code is the truth", signature-level plan-vs-code diff, warn-not-lock on human edits, hook-enforced gate. Ideas only, no code copied. |
| alvis/.claude `coding:draft-code` — https://github.com/alvis/.claude | no license (all rights reserved) | Canonical TODO marker + failing sentinel in stubs; `it.todo` test stubs. Ideas only, no code copied. |
| Meta ACH, "Mutation-Guided LLM-based Test Generation" (FSE 2025) — https://arxiv.org/abs/2501.12862 | paper | Mutation score as the test-adequacy gate; survivors go back to the test author. Ideas only. |
| nizos/tdd-guard (→ Probity) — https://github.com/nizos/tdd-guard | MIT | PreToolUse hook enforcing tests-before-implementation. Ideas only, no code copied. |
| ashbrener/spec-kit-linear-sync — https://github.com/ashbrener/spec-kit-linear-sync | MIT | One-way, idempotent disk→Linear reconciler (unchanged input = zero writes), committed id mapping, description-marker relink, read-only pull/drift → `hitl-index tickets` + `/hitl:tickets`. Ideas only, no code copied. |
| github/spec-kit `taskstoissues` — https://github.com/github/spec-kit | MIT | Dedupe issues by the task id in the title before creating (fallback for `tickets pull --relink`). Ideas only, no code copied. |
| mattpocock/skills `to-tickets` — https://github.com/mattpocock/skills | MIT | Blockers-first publish order with native blocking relations; no file paths in issue bodies. Ideas only for the Linear push. |
| Kiro specs — https://kiro.dev/docs/specs/ · steering — https://kiro.dev/docs/steering/ | product docs | Requirements vs design split, design.md sections, the bugfix "unchanged behaviour" section, steering docs ≈ `.hitl/docs/`. Ideas only. |
| EARS (Alistair Mavin) — https://alistairmavin.com/ears/ | method | Requirement statement grammar (When / While / If…then / Where + SHALL). Ideas only. |
| BMAD-METHOD — https://github.com/bmad-code-org/BMAD-METHOD | MIT code; "BMad" is a trademark of its owner | Ceremony scales with change size (design skip rule), stable requirement ids, and the "advanced elicitation" idea of a menu of deepening techniques → `deep <ID>` in `/hitl:plan`. Ideas only; no text or name reused. |
| Example Mapping (Matt Wynne, Cucumber) — https://cucumber.io/blog/bdd/example-mapping-introduction/ | method | Rules → examples → questions, used as `deep` technique 1 (examples become `#### Scenario` blocks). Ideas only. |
| Five Whys (Toyota Production System) · pre-mortem (Gary Klein, HBR 2007) | methods | `deep` techniques 2 and 4. Ideas only. |
| IIBA BABOK v3 · OMG DMN decision tables — https://www.omg.org/dmn/ · ISO/IEC 25010:2023 quality model | standards / method | Business rules catalog, decision tables (hit policy first), use-case flows, NFR quality characteristics (`Quality:`), requirements traceability matrix (`trace --capability`). Ideas only. |
| Michael Nygard, "Documenting Architecture Decisions" (2011) — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | blog post | Decisions are never edited, only superseded (`superseded by D-k`) + Changelog. Ideas only. |

### Standards used as references (0.6.1, `shared/formats/`)
hitl's formats follow these standards and methods. They are cited as references only: no text, table or figure from them
is copied; the templates, examples and lint heuristics in `shared/formats/`, `shared/templates/` and
`scripts/lib/speclint.mjs` are hitl's own wording. Names of standards are used only to identify them.

| Source (version checked 2026-10-27) | License / status | Used for |
|---|---|---|
| MADR — Markdown Architectural Decision Records 4.0.0 (2024-09-17) — https://adr.github.io/madr/ | MIT OR CC0-1.0 (dual) | Section names of the optional `### D-n` record (context and problem, decision drivers, considered options, decision outcome, consequences, confirmation) and the status values proposed/accepted/rejected/deprecated/superseded. Template re-written, not copied. |
| OMG Decision Model and Notation (DMN) 1.6 (1.7 beta in progress) — https://www.omg.org/spec/DMN/ | OMG specification | Decision table shape (input/output columns, rule rows) and the hit-policy letters U/A/P/F/R/O/C (+ C+ C< C> C#). Ideas only; no FEEL, no XML. |
| ISO/IEC/IEEE 29148:2018 Requirements engineering — https://www.iso.org/standard/72089.html | ISO copyright, paid standard | Characteristics of good requirements (necessary, unambiguous, singular, verifiable, feasible, …) and unbounded/vague terms → the `REQ_*` heuristics. Concepts only. |
| INCOSE Guide to Writing Requirements v4 (INCOSE-TP-2010-006-04, 2023) — https://www.incose.org/publications/products/guide-to-writing-requirements | INCOSE copyright | Requirement characteristics and writing rules (vague terms, singularity, active voice with a named actor). Concepts only; the vague-term list is hitl's own (EN + VI). |
| ISO/IEC 25010:2023 Product quality model — https://www.iso.org/standard/78176.html | ISO copyright, paid standard | The nine characteristic names used in `Quality:` (identifiers only). |
| Volere Requirements Specification Template / fit criterion — Suzanne & James Robertson, *Mastering the Requirements Process* | book / template (Atlantic Systems Guild) | The idea of a measurable fit criterion per requirement → the `Fit:` line. |
| Alistair Cockburn, *Writing Effective Use Cases* (Addison-Wesley, 2001) | book | The "fully dressed" use-case fields (primary actor, scope, level, preconditions, guarantees, main success scenario, extensions) → the `### Flow:` lite template. |
| The C4 model (Simon Brown) — https://c4model.com/ | site content CC BY 4.0 | System-context and container levels for the optional `## Architecture (C4)` section. No diagram or text copied. |
| Mermaid `stateDiagram-v2` and C4 diagrams — https://mermaid.js.org/ | MIT | Diagram syntax in templates (syntax only; no Mermaid code is shipped). |
| OpenAPI Specification 3.1.1 (3.2 accepted) — https://spec.openapis.org/oas/v3.1.1.html · AsyncAPI 3.0.0 — https://www.asyncapi.com/docs/reference/specification/v3.0.0 · JSON Schema 2020-12 — https://json-schema.org/draft/2020-12 | Apache-2.0 (OAS, AsyncAPI specs) · BSD-3-Clause / AFL (JSON Schema) | Minimal contract skeletons in `shared/templates/contracts/` written against these specifications (field names only) and the version checks in `spec validate`. |
| UML 2.5.1 state machines — https://www.omg.org/spec/UML/2.5.1 | OMG specification | Vocabulary of the transition table (state, event, guard, action/effect). Concepts only. |

## 3. Vendored (unmodified, MIT)

### mattpocock/skills `grilling` — https://github.com/mattpocock/skills
Vendored byte-identical as `skills/grilling/` (skill `hitl:grilling`): `SKILL.md` (from
`skills/productivity/grilling/SKILL.md`) and the upstream `LICENSE`. Commit, date, checksums and the re-sync procedure:
`skills/grilling/UPSTREAM.md`. `/hitl:plan` and `/hitl:design` load it through the Skill tool; the hitl overlay (round
header, tags, caps, recording) is separate: `shared/interview.md`. License text: section 1, mattpocock/skills
(Copyright (c) 2026 Matt Pocock).

### cloudflare/security-audit-skill — https://github.com/cloudflare/security-audit-skill
Vendored byte-identical as `skills/security-audit/` (skill `hitl:security-audit`): `SKILL.md`, phase docs, attack-class
companion docs, `report-schema.json`, `validate-*.cjs` and their tests, plus upstream `LICENSE`. Commit, date and the
re-sync procedure: `skills/security-audit/UPSTREAM.md`. hitl glue (security lens method, verdict → finding mapping,
`/hitl:review --security-audit`) is separate: `skills/review/references/security.md`.

```
MIT License

Copyright (c) 2025-2026 Cloudflare, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
