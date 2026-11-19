---
name: tdd
description: Quick test-first mode for a small fix or feature with no hitl change or task — agree the test seams in one round, then red→green one test at a time. Use for "TDD this", "test-first fix", "red-green-refactor", "làm TDD", "viết test trước", or when /hitl:go routes here. Not for a bare bug or feature description without a test-first ask (/hitl:go), a task id or a task's tests (/hitl:test), a feature that needs a spec (/hitl:plan), or status/what next (/hitl:flow).
argument-hint: "<what to build or fix>"
allowed-tools: Read Glob Grep Edit Write Bash
---

# /hitl:tdd — quick test-first, no hitl change

Adapted from mattpocock/skills (MIT) — see NOTICE.md. Source: skills/engineering/tdd/SKILL.md @ 4ae2317. Changes: a
guard that routes work of a hitl change to `/hitl:flow`; the seam question in the hitl gate shape; glossary from
`.hitl/specs/GLOSSARY.md`; interface shape from `shared/test-patterns.md` §4 (no codebase-design skill); refactor
under green in each cycle (no code-review skill); the test list grows as cases are found (Kent Beck, Canon TDD).

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-code.md`. Reply in the user's language.
Patterns (read once, before the first test): `${CLAUDE_PLUGIN_ROOT}/shared/test-patterns.md`,
`${CLAUDE_PLUGIN_ROOT}/skills/tdd/tests.md`, `${CLAUDE_PLUGIN_ROOT}/skills/tdd/mocking.md`.

Arguments: `$ARGUMENTS` = the behaviour to build or fix. No spec, no tasks.md, no locks: this mode writes only test
files and the code they drive, never `.hitl/`.

## 1. Guard
- A task id in the request, or `.hitl/` exists and the work belongs to a hitl change (`hitl-index status --brief --soft`
  lists the active changes; Grep the files you will touch for `@task`: a symbol tagged with an unfinished task) →
  `_Stop:_ This is part of <T or change>: /hitl:flow routes it (/hitl:test, then /hitl:implement).` Stop.
- Never edit locked tests or `@impl manual` bodies (the hooks deny it anyway).
- High-risk work (`${CLAUDE_PLUGIN_ROOT}/skills/tasks/references/slicing-and-risk.md` §4: security, persisted data,
  public API, concurrency, a new domain concept) → add `_Tip:_ High risk: /hitl:plan gives it a spec and gates.` to the seam
  question (§2).

## 2. Seams (one round)
Find the public interface with Grep/Read (only what you need). Then one GATE in chat: numbered questions
`**Q1** <title>` + one context line + `_Rec:_ …`, then `Reply: e.g. "y" (all recommendations) or "Q2: …"`
(no brief file, no round header, no grilling load, nothing recorded):
- **Q1 Seams**: 1–3 seams (test-patterns §5: highest, existing, fewest), each `seam — catches / misses — doubles (§3)`.
- **Q2 Tests**: the test list: the behaviours in order, one line each with the defect it catches, the tracer first
  (main success path through the highest seam; for a bug, the reproducer). The list may grow during the loop (§3).
- Q3 only if the interface must change to be testable (test-patterns §4).
Names: the terms of `.hitl/specs/GLOSSARY.md` when it exists, never their `_Avoid_` words (test-patterns §1).
END THE TURN. No test and no code before the reply.

## 3. Loop (one test at a time, in the agreed order)
This is the real TDD loop (Kent Beck's red → green → refactor), unlike the hitl change flow, which writes a task's
acceptance tests first and then the code.
1. Write one test at an agreed seam (test-patterns §1–§3; name = the behaviour, no ids; expected values from the request
   or a worked example).
2. Run it. It must fail for the right reason: its assertion fails (or the missing behaviour), not an import or a typo.
3. Write the minimal code that passes it. No code for the next test, no speculative options.
4. Run the test file: green → refactor now if the code asks for it (names, duplication, a guard clause), tests
   untouched and green after; then the next behaviour. Red → fix the code, never the test.
5. A new case found on the way (an edge the code reveals, a second failing input) → add it to the test list with its
   defect, in order; never write it before the current test is green. A case with no defect → not on the list.
A test that needs a seam nobody agreed, or must reach past the interface → stop and ask (same gate shape).

## 4. Done
A fresh run of the touched test files and the project test command (`hitl.config.json` `commands.test` when present),
with the counts in the reply before any claim (`${CLAUDE_PLUGIN_ROOT}/skills/test/references/tdd-rules.md` §5).
List the tests added (`title → seam → defect`) and mark the ones added to the list during the loop (`+ added`).
A refactor wider than the touched code → a `refactor-` change through `/hitl:plan`. End with `_Next:_`.
