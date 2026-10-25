# Fix loop: receiving review findings

> Adapted from obra/superpowers (MIT) — `skills/receiving-code-review`, Copyright (c) 2025 Jesse Vincent — see NOTICE.md.
> Changes: findings come from HITL lens reviewers + verifier; fix ownership follows `@impl`; fixes are test-first via the
> test-author/implementer subagents; decisions are recorded with `hitl-index review-decide`.

## 1. The response pattern (per finding)

```
1. READ      the whole finding: evidence, file:line, suggested fix
2. RESTATE   the technical requirement in one line (to yourself / the user)
3. VERIFY    against the code: open file:line, the contract (intent, TODO steps, ACs), the tests
4. EVALUATE  is it real, in scope, caused by this task, right for THIS codebase?
5. RESPOND   technical acknowledgment, or reasoned pushback with evidence
6. FIX       one finding at a time, test each (fresh run)
```

No performative agreement ("You're absolutely right!", "Great catch!", thanks). State the fix or the pushback.
If any finding in a batch is unclear, ask about it **before** fixing any of them (items may be related).

## 2. Push back when

- the suggestion breaks behaviour required by an AC or by a caller's expectations
- the reviewer lacked context (e.g. the behaviour is in the plan's Out of scope, or a decision `D-n` chose it —
  unless the finding shows that decision is wrong: then propose `amend F-n`)
- it adds unused "proper" features (YAGNI: grep for real usage first)
- it is wrong for this stack/version
Push back = tell the user, propose `reject F-n` with a one-line reason; the human decides. Never silently skip a finding.
If you pushed back and were wrong, say so in one line and fix it.

## 3. Ownership routing

| finding | owner | action |
|---|---|---|
| `@impl agent` symbol, reproducible behaviour (wrong result, missing error path, leak, race) | agent, **test first** | see §4 |
| `@impl agent` symbol, not reproducible by a test (naming, structure, perf without a measurable trigger) | agent | implementer fixes; existing tests must stay green |
| `@impl manual` symbol | human | print a ✍️ card: file:line, evidence, suggested fix, test to run. Never edit it. |
| category `intent`, `todo-flow` (contract wrong), `scope` needing a new public symbol, or any change to a locked signature/docstring | human | explain what would change in the skeleton; the human edits it and runs `/hitl:approve <T>` — or `amend F-n` (accept + amend spec, `shared/amend-spec.md`) when the plan's decision/requirement is what is wrong |
| test weakened / edited locked test | human | the human approves the new test (`/hitl:approve <T> tests`) or reverts it |

## 4. Test-first fix (agent-owned)

1. `hitl-index context <T> --contract --out .hitl/index/contracts/<T>.md`.
2. Spawn `hitl:test-author`: contract pack path, test file paths, the finding (title, evidence, trigger — not the code),
   `Write one failing test that reproduces F-n (tag @ac with the closest AC, @kind per behaviour, @origin test-author)`.
3. `hitl-index test --task <T> --json` → the new test must **fail** on the current body for the reason in the finding.
   It passes → the finding is not reproduced: report it (likely false positive → propose `reject`), stop for this finding.
4. `hitl-index context <ref> --out .hitl/index/contracts/<T>.impl.md`; spawn `hitl:implementer` with the slice,
   the ref, the test command and `Fix F-n: <title>. The new test <id> must pass; all other tests stay green.`
5. Fresh `hitl-index test --task <T> --json`. Green → `hitl-index status <T> --sync-tags`; print
   `✅ F-n fixed — <test id> red → green, task tests n/n`.
6. The new test is not locked yet. Risk high → tell the user to lock it with `/hitl:approve <T> tests` (gate at the end of the batch).
   Risk low → `hitl-index approve <T> --stage tests --by auto` (re-locks accept green tests with a fresh run; no `--force`).

## 5. Order and limits

- Clarify unclear findings first. Then: critical/blocking (security, wrong results) → simple → complex.
- One finding per implementer call. Fresh test run after each.
- Max `review.maxFixRounds` (config, default 2) rounds per finding. Still failing → 🛑 escalate to the human with the evidence
  (failing output, what was tried). Do not keep looping.
- After the batch: run `/hitl:review <T> recheck` logic (incremental L0 + L1 on changed symbols), then the report.
