# Slicing, priority, risk, ACs and test plan

Adapted from mattpocock/skills (MIT) — see NOTICE.md
Source: `skills/engineering/to-tickets/SKILL.md` @ 5c2cbbd5c3342a9ff4a80b7d8530759ca6a98c22 (vertical slices, blocking edges,
expand–contract, quiz). Changes: one tasks md per change instead of one file per ticket; adds HITL priority,
risk rules, symbol rows, impl owners, AC ids and test plan; consistency check idea from github/spec-kit `/analyze` (ideas only).
Seam rules (§5 tracer AC, §7 seam column) from `skills/engineering/{to-spec,tdd}/SKILL.md` @ 4ae2317 via `shared/test-patterns.md` §5.

## Contents
1. Vertical slices
2. Wide refactors (expand–contract)
3. Blocking edges and priority
4. Risk rules
5. Acceptance criteria
6. Symbols and owners
7. Test plan
8. Consistency check (before the gate)
9. Quiz

## 1. Vertical slices
- Each task cuts a narrow but COMPLETE path through the layers it needs (types, service, API, tests): vertical, not one layer.
- A finished task is verifiable on its own (its ACs pass).
- Each task fits one fresh context window: as a rule of thumb ≤6 symbols and ≤3 files changed. Larger → split.
- Prefactor first: "make the change easy, then make the easy change". A prefactor task has no new behaviour, its ACs say
  "existing tests stay green" plus one AC for the seam it opens.
- Titles use the glossary words (`.hitl/specs/GLOSSARY.md` + the change's `glossary.md`) and say the behaviour, not the layer ("Register user with unique email", not "UserService").
- Titles are short and direct (Linear Method: "short and simple issue titles that directly state what the task is"):
  verb first, ≤ 60 characters, one behaviour; no layer or class names, no lists of every case ("Refuse settle when context
  ended or reservation missing", not "Settle script refuses an ended context, a missing reservation and an unknown lease").
  The cases go in the ACs. The title becomes the tracker issue title (`/hitl:tickets`).

## 2. Wide refactors (expand–contract)
One mechanical change with a wide blast radius (rename a column, retype a shared symbol) is not a vertical slice.
Sequence it: **expand** (add the new form beside the old) → **migrate** call sites in batches (per package/dir, each a task
blocked by expand) → **contract** (delete the old form, blocked by every migrate task). Mark all of them `risk: high (public-api)`.

## 3. Blocking edges and priority
- `blocked-by` lists only tasks that genuinely gate this one (it needs their symbols or behaviour). No edge "for order's sake".
- The frontier = tasks whose blockers are all done.
- Priority: **P0** blocks others or is the riskiest unknown (do it first to learn early) · **P1** core behaviour of the feature ·
  **P2** secondary paths, error polish · **P3** nice-to-have. Sort the file by prio, then dependency order.

## 4. Risk rules (deterministic; always list the reasons)
`high` if ANY of these hold, else `low`:
| reason tag | when |
|---|---|
| `core` | a target file matches `risk.corePaths` in `hitl.config.json` |
| `concurrency` | async shared state, locks, threads, timers, queues, caches written concurrently |
| `security` | auth, crypto, money, SQL, shell, file paths from input, deserialization, or a file under `risk.securityPaths` |
| `public-api` | change to an exported symbol used by other modules, HTTP/CLI contract, or package API |
| `domain` | introduces a new domain concept (new entity/aggregate/state machine) |
| `data` | data migration or persisted schema change |
Low-risk tasks may use the fast lane (auto skeleton/tests approval). Never lower a risk to get the fast lane.
`quick` tasks follow the same rules; if a quick task comes out high, say so and recommend `/hitl:plan`.

## 5. Acceptance criteria
- 2–6 per task, id `<KEY>-T<n>.AC<k>` (k from 1), Given/When/Then, one observable behaviour each, testable at a seam.
- AC1 = the tracer: the main success path end to end through the highest seam.
- Include at least one failure/edge AC when the task validates input or handles errors.
- Every ADDED/MODIFIED scenario of the change has ≥1 AC that references it `(ACC-R3.S1)`; an AC instantiates its
  scenario concretely (same GIVEN/WHEN/THEN, concrete values). `MAY` requirements may stay without AC. Never reference
  a REMOVED or retired id. A living (untouched) scenario may be referenced for a regression AC (`## Unchanged behaviour`).
  Quick tasks: no spec refs.

## 6. Symbols and owners
- Row: `` n. [ ] `Ref` | new|modify | `path/file.ext` | impl: agent|manual | purpose ``. Row order = the tie-break of the implement order (`@prio` = row number); the order itself is callees first over `@calls` (`hitl-index status <T> --work-order`).
- `Ref` is `Name` or `Class.method` (no path; the file column carries it).
- `modify` only if the symbol exists now (`hitl-index context <ref> --json` or Grep); `new` only if it does not.
- File follows PATTERNS-CONVENTIONS (layer dir, naming). A `new` symbol in a file that does not exist yet → note
  `creates file` in purpose.
- Owner default `agent`. Recommend `manual` when the user said they will write it, or for core domain logic in a high-risk task.
- Meta `impl:` = `agent` / `manual` if all rows agree, else `mixed`.

## 7. Test plan
An AC is a key example of behaviour; a test is code that must earn its place. The plan records a **test decision per
AC**, not one test per AC. Row: `| AC1 | test | kind | oracle | seam | author |`, one row per AC (more rows allowed).
The `test` cell (checked by `hitl-index tasks --check`):
| test | meaning | what the CLI requires |
|---|---|---|
| `new: <defect>` | a new test at `seam`; `<defect>` = the production defect that would make it fail and no other planned or existing test catches | a stub with its `@ac` at the skeleton lock (`TEST_PLAN_NO_DEFECT` without a defect) |
| `shared: <ACk>` | the test of ACk (a `new` row of this task) proves this AC too | one stub carrying both `@ac` ids |
| `covered: <test>` | an existing test already proves it: its title, `file#title`, or an AC id (another task's AC whose tests prove it) | resolves to an indexed test at the lock; it runs with `hitl-index test --task`; an AC id must exist |
| `none: <reason>` | no automated test: type-checked, pure wiring with no independent oracle, config, behaviour a library guarantees | reason; refused on a task whose risk reasons include `security`, `concurrency` or `data` (`TEST_PLAN_NONE_RISK`) |
| `manual: <check>` | a human check (UI look, external system) | the check; `/hitl:approve <T> done` lists it; refused like `none` on a `security`, `concurrency` or `data` task (`TEST_PLAN_NONE_RISK`) |
Non-`new` rows may leave kind, oracle, seam and author as `—`. A table without the `test` column (before 0.16) reads
every row as `new`. Choose:
- `new` only when you can name its defect; prefer `shared` (or one table test) when two ACs are the same call with
  different expectations of one outcome.
- Prefactor ACs ("existing tests stay green") → `covered: <AC id or test>` or `none: refactor, existing suite`.
- A later task whose AC1 enters the same seam as an earlier task's tracer → `covered: <that AC>` (or extend its
  table), not a second tracer.
- Quick tasks: a trivial change (wording, constant, log line) usually ends with `none:` or `covered:`.
- Budget: a task's active tests stay ≤ `new` rows + 2 (a warning at the tests lock, never a block).
- kind: `example` (default) · `property` (an invariant over many inputs) · `concurrency` (symbol has @concurrency ≠ none)
  · `golden` (stable output snapshot) · `metamorphic` (relation between two runs) · `regression` (guards unchanged
  behaviour; may pass at the first lock).
- oracle: where the expected value comes from — `spec` (the AC text), `invariant: <expr>`, `golden file`, `relation: <r>`. Never "the implementation".
- seam: the public symbol or endpoint the test calls (from design.md `## Test strategy`; design skipped → the
  highest existing public seam). Highest seam that can observe the AC, prefer existing, fewest per task; a lower seam
  needs a reason in the cell; no independent oracle (pure wiring) → `none:` with the reason, or `author: human` (test-patterns §5).
- author: `test-author` (default) or `human`.

## 8. Consistency check (before the gate)
Structural checks (unknown/removed scenario, requirement, rule or <KEY>-D<n>; scenario without AC; AC without ref; unused D;
requirement without a serving D) come from `hitl-index trace <change-id> --json`; block items are fixed before the
gate, warn/info items are listed there. Add these semantic checks yourself, one line each, only when non-empty:
- design.md `## Risks` items with no high-risk task covering them
- tasks touching items listed in the proposal `## Out of scope` or `## Deferred`
- proposal `## Unchanged behaviour` items with no regression AC (fix/refactor/perf changes)
- symbols listed in two tasks (choose one owner task; the other is blocked-by it)

## 9. Quiz (the gate)
Present the task table and the test-plan table (`task · AC · test · seam`, one line per row, the defect or reason in
plain words), then ask:
1. Granularity ok? (too coarse / too fine)
2. Blocking edges right? Does each task depend only on tasks that genuinely gate it?
3. Merge or split any task?
4. Owners (agent/manual) ok?
5. Test plan ok? (which ACs get a new test and the defect each catches, shared/covered/none/manual, seams, count)
This gate is where the human decides whether and how many tests; it is the one human gate a low-risk (fast-lane) task
passes. Iterate until the user replies Y.
