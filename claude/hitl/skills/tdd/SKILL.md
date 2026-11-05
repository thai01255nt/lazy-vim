---
name: tdd
description: Quick test-first mode for a small fix or feature with no hitl change or task — agree the test seams in one round, then red→green one test at a time. Use for "TDD this", "test-first fix", "red-green-refactor", "làm TDD", "viết test trước". Not for a T-id or a task's tests (/hitl:test), a feature that needs a spec (/hitl:plan), or status/what next (/hitl:flow).
argument-hint: "<what to build or fix>"
allowed-tools: Read Glob Grep Edit Write Bash
---

# /hitl:tdd — quick test-first, no hitl change

Adapted from mattpocock/skills (MIT) — see NOTICE.md. Source: skills/engineering/tdd/SKILL.md @ 4ae2317. Changes: a
guard that routes work of a hitl change to `/hitl:flow`; the seam question in the hitl gate shape; glossary from
`.hitl/specs/GLOSSARY.md`; interface shape from `shared/test-patterns.md` §4 (no codebase-design skill); refactoring as
a separate pass (no code-review skill).

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` + `${CLAUDE_PLUGIN_ROOT}/shared/conventions-code.md`. Reply in the user's language.
Patterns (read once, before the first test): `${CLAUDE_PLUGIN_ROOT}/shared/test-patterns.md`,
`${CLAUDE_PLUGIN_ROOT}/skills/tdd/tests.md`, `${CLAUDE_PLUGIN_ROOT}/skills/tdd/mocking.md`.

Arguments: `$ARGUMENTS` = the behaviour to build or fix. No spec, no tasks.md, no locks: this mode writes only test
files and the code they drive, never `.hitl/`.

## 1. Guard
- A T-id in the request, or `.hitl/` exists and the work belongs to a hitl change (`hitl-index status --brief --soft`
  lists the active changes; Grep the files you will touch for `@task`: a symbol tagged with an unfinished task) →
  `🛑 This is part of <T or change>: /hitl:flow routes it (/hitl:test, then /hitl:implement).` Stop.
- Never edit locked tests or `@impl manual` bodies (the hooks deny it anyway).
- High-risk work (`${CLAUDE_PLUGIN_ROOT}/skills/tasks/references/slicing-and-risk.md` §4: security, persisted data,
  public API, concurrency, a new domain concept) → add `💡 High risk: /hitl:plan gives it a spec and gates.` to the round.

## 2. Seams (one round)
Find the public interface with Grep/Read (only what you need). Then one ⛔ GATE in the `shared/interview.md` §4 shape
(numbered questions, each with `💡 Recommended:`, a `Reply:` line; no round header, no grilling load, nothing recorded):
- **Q1 Seams**: 1–3 seams (test-patterns §5: highest, existing, fewest), each `seam — catches / misses — doubles (§3)`.
- **Q2 Tests**: the behaviours in order, one line each, the tracer first (main success path through the highest seam).
- Q3 only if the interface must change to be testable (test-patterns §4).
Names: the terms of `.hitl/specs/GLOSSARY.md` when it exists, never their `_Avoid_` words (test-patterns §1).
END THE TURN. No test and no code before the reply.

## 3. Loop (one test at a time, in the agreed order)
1. Write one test at an agreed seam (test-patterns §1–§3; expected values from the request or a worked example).
2. Run it. It must fail for the right reason (an assertion or the missing behaviour, not an import or a typo).
3. Write the minimal code that passes it. No code for the next test, no speculative options.
4. Run the test file: green → the next behaviour. Red → fix the code, never the test.
A test that needs a seam nobody agreed, or must reach past the interface → stop and ask (same gate shape).

## 4. Done
A fresh run of the touched test files and the project test command (`hitl.config.json` `commands.test` when present),
with the counts in the reply before any claim (`${CLAUDE_PLUGIN_ROOT}/skills/test/references/tdd-rules.md` §5).
List the tests added (`title → seam`). Refactoring is not part of this loop: do it as a separate pass under the green
tests, or as a `refactor-` change through `/hitl:plan`. End with `🎯 next:`.
