# Test patterns (hitl overlay on the vendored tdd references)

Adapted from mattpocock/skills (MIT) — see NOTICE.md. Source: skills/engineering/tdd/SKILL.md,
skills/engineering/codebase-design/{SKILL,DEEPENING}.md, skills/engineering/to-spec/SKILL.md @ 4ae2317. Changes: seams are
agreed at the design/tasks gates (never asked from a subagent); the per-task AC batch is the outer loop and the
one-test cycle the implementer's inner loop; glossary names from the contract pack; doubles keyed to hitl ports; the
true-external call-assertion exception; refactoring routed to `/hitl:review`; no codebase-design avoid-list.

Read first, once: `${CLAUDE_PLUGIN_ROOT}/skills/tdd/tests.md` and `${CLAUDE_PLUGIN_ROOT}/skills/tdd/mocking.md` (upstream,
verbatim). This file adds the hitl rules; on a conflict it wins.

## 0. Code-layer terms
Plugin vocabulary for skeleton, test, implement and review. It is **not** the project's domain glossary
(`.hitl/specs/GLOSSARY.md`): never write these words there, never let them replace a domain term in a test name.
- **interface**: everything a caller must know (signature, intent, `@throws`, ordering), not just the signature.
- **seam**: the public place a test calls and observes behaviour (endpoint, CLI, exported symbol).
- **port**: a dependency the signature takes in at a seam (repo, mailer, clock).
- **adapter**: what fills a port: the production one, or a test one (stand-in or fake).
- **stand-in**: a real-behaving local substitute (in-memory repo, test DB, temp dir).
- **fake**: a scripted test adapter for a true-external port that records what was sent. **double** = stand-in or fake.
"Component" (the C4 level in `design.md`) and "trust boundary" (security) keep their meaning.

## 1. Names
- Title = `T-n.ACk` + the capability in domain words: WHAT, not HOW (`T-12.AC2 unknown email gets the same message`,
  not `calls mailer 0 times`). One behaviour per title; "and" → split.
- Use the contract pack's `## Terms` (glossary order, ≤ 8): write each **term** as given, never a word from its
  `(avoid: …)` list, in `describe`/`it` titles and test helper names. No `## Terms` → the AC's own words.
- `describe` = the row's seam (usually the covered symbol ref).

## 2. Anti-patterns: tell → fix
The test-author avoids these; the tests lens reports each one as a finding naming the tell.
| tell | fix |
|---|---|
| mocks a project module (`vi.mock("../src/…")`, `patch("app.repo…")`) | use the real module, or a §3 double at its port |
| imports a private internal / tests a non-exported helper | go through the seam's `import paths:` |
| asserts call count/order on an internal collaborator | assert the observable result |
| **side channel**: reads a DB row, a file, or a repo's array instead of the interface (`repo.users.length`) | verify through the interface's own query (`findByEmail`) |
| tautology: expected value recomputed like the code | a literal from the AC, intent or oracle |
| shape-only: asserts fields or structure no AC states | assert what the AC states |
| enters below the Test-plan seam with no reason in the row | call the seam; unreachable → `needsHuman` |
| snapshot for logic; sleep or real clock for ordering | explicit values; fake clock; controlled promises |

## 3. Test doubles by dependency
| dependency | double |
|---|---|
| in-process (pure code, own modules) | none: the real code |
| local-substitutable (DB, file system) | stand-in: in-memory repo, test DB, temp dir |
| remote but owned (own service behind a port) | in-memory adapter at the port |
| true external (mail, payment, third-party HTTP) | fake at the port, SDK-style: one method per operation |
| clock, randomness | inject it, or the framework's fake timers / a fixed seed |
Asserting on a call is allowed **only** at a true-external port when the call *is* the observable outcome the AC states
("nothing is sent" → the fake mailer recorded 0 sends; "one link is sent" → 1 send to that address). Never on a stand-in.

## 4. Interfaces for testability (skeleton, design)
- Take dependencies in (the §3 ports) instead of `new`-ing them inside; the implementer uses what the signature injects.
- Return results rather than mutating hidden state, where the contract allows.
- One method per external operation; small surface.
- The interface is the test surface: a test that must reach past it means the skeleton has the wrong shape. Reshape the
  skeleton, never the test.
- One adapter = a hypothetical seam: no interface only for mocking unless it is a §3 port with a test adapter.

## 5. Seams
- The **highest** seam that can observe the AC; prefer existing seams; the fewest per task. A lower seam needs a reason
  in the Test plan row (e.g. a pure function with a property test).
- Per seam, one line: what it **catches** and what it **misses** (design `## Test strategy`).
- **AC1 is the tracer**: the main success path end to end through the highest seam. Test files keep AC order.
- Slow seams (browser, e2e) never drive RED; keep them for a later regression row.
- No independent oracle (pure wiring or config) → test at a higher seam that exercises it, or `author: human` with a
  reason. Never a tautology.

## 6. The double loop
- **Outer loop** (`/hitl:test`): the AC tests of one task, written from the contract and locked RED together. A batch
  for a ≤ 6-symbol slice with human-approved oracles; not upstream's "horizontal slicing" of a whole feature.
- **Inner loop** (implementer, `/hitl:tdd`): one failing test at a time in file order, AC1 first. Write only the code
  that test needs (within the TODO steps), run, see it green, take the next. Never write code for a test that is not
  current. A run that turns a test green is progress; only runs without progress count against the iteration cap.

## 7. Refactor
Not part of implement or the loop. Structure fixes happen in `/hitl:review` and its fix loop (implementer, under the
locked green tests), or in a `refactor-` change. The contract lens lists them as suggestions (`lenses.md` "Structure").
