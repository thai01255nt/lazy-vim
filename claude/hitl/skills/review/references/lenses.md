# Review lenses

Read **Common rules** plus the section for your lens only.

> The parallel-lens + per-finding confidence filter pattern is adapted (ideas, reworded) from Anthropic's official
> `code-review` plugin (anthropics/claude-plugins-official). Severity scale and "set aside" list adapted from
> obra/superpowers `requesting-code-review` (MIT) — see NOTICE.md. The concurrency checklist follows the HITL research
> notes (Sonar's Opus 5.5 evaluation: concurrency/threading the largest bug category).

## Contents
1. Common rules (all lenses)
2. contract
3. tests
4. concurrency
5. security

## 1. Common rules

**Inputs**: the review context (task, ACs, per-symbol approved contract vs current source, callers, declared callees,
tests), `l0.json` (lint/typecheck/tests/drift/mutation already checked mechanically).

**Requirements**: ACs arrive with their requirement text `(R-n: …)`. Code that passes the AC but violates the R is a
finding (category intent).

**Scope**: only code this task created or changed (symbols tagged `@task <T>`, their tests, helpers they added).
Compare the **approved skeleton** (signature, intent, TODO steps in the lock) with the **current** code.
`git diff`, `git log`, `git show`, `git blame` are allowed for history. `hitl-index context <ref>` for more context.

**Exclude** (do not report; these are false positives here):
- issues a linter, typechecker or compiler would catch, or that L0 already reports (failing tests, drift items)
- pre-existing issues on code this task did not touch
- nitpicks a senior engineer would not raise; style that the project's patterns do not demand
- behaviour that is intentional per the plan/ACs, or explicitly silenced in code (e.g. a documented ignore)
- speculative "could be a problem someday" without a concrete trigger

**Every finding needs**: `file` + `line` of the evidence, the symbol id, a concrete trigger (input/sequence that goes wrong),
why it matters, a suggested fix, and `fixOwner` (`human` when the symbol is `@impl manual` or the fix changes the contract;
else `agent`).

**Severity**: `critical` = wrong result, data loss, security hole, crash, deadlock, an AC not met · `important` = missing error
handling on a real path, resource leak, untested AC/concurrency, scope creep with impact · `minor` = everything else worth noting.

**Confidence** (your own 0–100, the verifier re-scores):
- 0 — does not survive light scrutiny, or pre-existing
- 25 — might be real; could not verify
- 50 — verified real, but minor or rare
- 75 — verified, very likely hit in practice, matters for functionality
- 100 — certain; the evidence (code path, test, mutant) directly shows it

**Set aside**: list every behaviour you considered and judged out of scope (one line + reason) in `setAside`. Nothing is
dropped silently. A spec's silence is not permission: judge such behaviour by what a reasonable user would expect.

**Output** (`hitl.findings/1`), written to the path you were given:
```json
{ "schema": "hitl.findings/1", "task": "T-1", "lens": "contract",
  "findings": [ { "key": "contract-1", "lens": "contract", "symbol": "src/services/userService.ts#UserService.createUser",
                  "file": "src/services/userService.ts", "line": 52, "severity": "critical", "confidence": 85,
                  "category": "intent", "title": "…", "evidence": "…", "suggestedFix": "…", "fixOwner": "agent" } ],
  "setAside": [ "perf of bulk path: not in plan" ] }
```
`key` = `<lens>-<n>`, n from 1. `category` ∈ intent | todo-flow | scope | tests | concurrency | resource | security | perf.
Do not set `verifiedConfidence`/`keep` (the verifier does). Zero findings → `"findings": []`.
Security lens only: optional `"verdict": "confirmed" | "needs_validation"` and, for `needs_validation`, `"blocker"`
(the exact unresolved fact) — see `security.md` §3.

## 2. contract

Per task symbol (approved lock entry → current):
- **Intent**: the body does what the docstring says, including every `@throws`/`Raises` and return-shape rule
  (e.g. "without passwordHash").
- **TODO flow**: each locked TODO step `n. text` maps to a `// n. text` (or `# n.`) step comment and to code that does it,
  in order. Report unmapped, reordered, or half-done steps (category `todo-flow`). Extra behaviour not in any step → `scope`.
- **Signature** unchanged vs lock (L0 drift also shows it; report only consequences, e.g. callers now broken).
- **Scope creep**: undeclared callees (not in `@calls`) — acceptable when marked `// REUSE:` and it fits a step (then minor);
  new public/exported symbols; new modules; helpers without `@task`/`@impl`/`@status` tags.
- **ACs**: each `T-n.ACk` is actually satisfied by the code (not just by a test name).
- **Callers**: changed behaviour still matches what callers expect (their intents in the context).
- Quality checklist (only real defects): input validation at boundaries, structured errors, cleanup on every path,
  existing patterns followed.

## 3. tests

- Each AC has ≥1 active test with `@ac` that would fail if the AC were broken (name the mutation that it kills).
- Tests check behaviour through the seam, not mocks; expected values come from the contract, not recomputed like the code.
- No weakened assertions, added skips, deleted cases, or loosened matchers vs the locked version (L0 shows TEST_CHANGED;
  you judge whether it weakens the test).
- Edge checklist coverage relevant to the intent: empty/None, boundaries, unicode/case, duplicates, ordering, timeouts/cancel,
  partial failure/rollback, resource release on error.
- `@concurrency` ≠ none → a `@kind concurrency` test exists and would fail without the guard. Otherwise finding
  "untested concurrency" (`important`, fixOwner agent → feeds test-author).
- Mutation survivors in l0.json on task symbols → one finding per meaningful survivor (skip equivalent mutants; say why).
- Flaky patterns: sleeps for ordering, real clock, shared global state between tests, order dependence.

## 4. concurrency

- Shared mutable state identified? Every access guarded by the same lock, or confined to one thread/task?
- Locks and resources released on **every** path (exceptions, early returns): `with` / try-finally / RAII / `using`?
- Double-checked locking, check-then-act (TOCTOU), lazy-init races?
- Sleep, blocking IO or `await` while holding a lock?
- Async: missing `await`, fire-and-forget promises/tasks, unhandled rejections, cancellation that leaves state half-updated,
  a shared client reused across event loops?
- Lock ordering (deadlock risk), non-atomic read-modify-write counters, iterating a collection while it is mutated?
- Timers/intervals cleared; workers/threads joined; pools closed on error.
- Is there a concurrency test that would fail if the guard were removed? If not → "untested concurrency".
- Also flag (category `perf`): N+1 calls in loops, quadratic work on hot paths, unbounded buffers.

## 5. security

Method: `${CLAUDE_PLUGIN_ROOT}/skills/review/references/security.md` §2–3 — the vendored Cloudflare
`security-audit` attack-class docs (pick by what the task's code does), its boundary/severity rules, and the
`confirmed` / `needs_validation` / `rejected` mapping. The list below is the quick floor, not the whole check.

- Injection: SQL built with string concat/templates (use parameters), shell commands with interpolated input
  (`exec`, `child_process`, `subprocess(shell=True)`, `os.system`), template/HTML injection, regex DoS on user input.
- Paths: user input in file paths without normalization + base-dir check (traversal `../`), symlink following.
- Crypto: weak/misused primitives (MD5/SHA1 for passwords, ECB, static IV/nonce, `Math.random`/`random` for secrets),
  homemade crypto, non-constant-time secret compares, hard-coded keys.
- Secrets: credentials/tokens in code, logs or error messages; sensitive fields returned (e.g. passwordHash).
- Deserialization of untrusted data: `pickle`, `yaml.load` without SafeLoader, `eval`/`new Function`, unchecked `JSON.parse`
  feeding privileged logic.
- AuthN/AuthZ: missing checks on the path, trust of client-provided identity/roles, IDOR.
- Resource handling: unbounded input sizes, missing timeouts on network calls, files/connections not closed on error.
- Error handling that leaks internals or fails open.
- Only a real trust-boundary failure is a finding; a missing extra layer behind a working control is a hardening note
  (`setAside`). Blocked on a fact outside source → `needs_validation`, never a guess.
