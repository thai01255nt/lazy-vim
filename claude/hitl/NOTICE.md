# NOTICE — credits and third-party licenses

`hitl` is MIT licensed (see `LICENSE`, © 2026 Thai). Some reference files are adapted
(modified, shortened, re-targeted to this workflow) from the MIT-licensed projects below.
One skill is vendored unmodified (section 3).
Their copyright and permission notices are reproduced in full as the MIT license requires.

## 1. Adapted sources (text adapted, MIT)

### mattpocock/skills — https://github.com/mattpocock/skills
Adapted into:
- `skills/plan/references/grilling.md` — from `grilling` / `grill-me` (design tree, frontier rounds, recommended answers, "facts are the agent's job").
- `skills/tasks/references/slicing-and-risk.md` — from `to-tickets` (vertical slices, blocking edges, prefactor first, quiz the user).
- Ideas also taken from `tdd` (pre-agreed test seams), `to-spec` and `implement-spec` (context pointers).

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

### obra/superpowers — https://github.com/obra/superpowers
Adapted into:
- `skills/test/references/tdd-rules.md` — from `test-driven-development` and `verification-before-completion`
  (failing test first, verify RED for the right reason, no completion claims without fresh evidence).
- `skills/review/references/fix-loop.md` — from `receiving-code-review` (verify each finding, push back with evidence).
- Ideas also taken from `requesting-code-review` (fresh-context reviewer, never the session history) and `subagent-driven-development`.

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
| github/spec-kit — https://github.com/github/spec-kit | MIT | `/clarify` (bounded questions encoded back into the spec), `/analyze` (cross-artifact consistency → `tasks --check`). Ideas only, no code copied. |
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
| Fission-AI/OpenSpec — https://github.com/Fission-AI/OpenSpec | MIT | Delta specs (ADDED/MODIFIED/REMOVED) → the inline 📐 Spec delta of `shared/amend-spec.md` (applied in place, no `changes/` folder). Ideas only, no code copied. |
| Kiro specs — https://kiro.dev/docs/specs/ · EARS (Alistair Mavin) — https://alistairmavin.com/ears/ | docs / method | Requirements vs design split, Design-First variant, EARS keywords (When / While / If…then / Where / shall) → `R-n` lines in EARS-lite (no validator). Ideas only. |
| Michael Nygard, "Documenting Architecture Decisions" (2011) — https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions | blog post | Decisions are never edited, only superseded (`superseded by D-k`) + Changelog. Ideas only. |

## 3. Vendored (unmodified, MIT)

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
