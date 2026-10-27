# hitl evals — A/B suites for prompt and context changes

Use these when you change a SKILL.md, a shared doc or a description: run the same cases against the old copy of the
plugin (BASE) and the edited one (NEW), then compare. Every case runs `claude -p` with `--plugin-dir <variant>` in a
throw-away fixture project, so it costs real money (see the costs below).

Why not `claude plugin eval`? It compares the plugin against "no plugin", not two versions of it, and it has no
supported way to start a case from a fixture project. This runner covers both. Cases live in JSON next to it.

## Files
| file | what |
|---|---|
| `trigger.json` | Suite A: ~30 VI/EN prompts → the skill that should fire first (`null` / `"nohitl"` for negatives) |
| `scenarios.json` | Suite B: one slash-command turn per case on a fixture, with named deterministic checks |
| `grade.mjs` | the checks (spec validate, tasks --check, trace, gate shape, files written, tool calls) |
| `ab.mjs` | runner: builds fixtures, runs variants, grades, `summary.json`, cost cap, resumable |
| `regrade.mjs` | re-grade finished runs after editing `grade.mjs` (no new claude calls) |
| `judge.mjs` | Suite C: blind pairwise LLM judge of plan / design outputs, both orders |
| `fixtures/build.sh` | builds `plan` / `design` / `tasks` / `flow` / `review` projects from `tests/fixtures` |

## Run
```sh
cp -R ~/.config/nvim/claude/hitl /tmp/hitl-base          # freeze BASE before editing
OUT=/tmp/hitl-ev
node evals/ab.mjs trigger   --variant BASE=/tmp/hitl-base --variant NEW=. --out $OUT -j 3 --max-cost 15
node evals/ab.mjs behaviour --variant BASE=/tmp/hitl-base --variant NEW=. --out $OUT -j 3 --max-cost 30
node evals/judge.mjs $OUT BASE NEW            # Suite C on plan-vi, plan-en, design-auto
node evals/regrade.mjs $OUT behaviour BASE=/tmp/hitl-base NEW=.
```
- `--case <substring>` runs a subset, `--runs n` overrides per-case runs (default: case `runs`, trigger 1).
- The installed `hitl@thai-hitl` is disabled in the children (`--settings`), so only `--plugin-dir` is loaded.
  Other user plugins stay on, so trigger results reflect your real skill list.
- Runs that already have `grade.json` are skipped. Delete a run folder to redo it. `cost.json` in `$OUT` tracks spend.
  Children stop starting at `--max-cost`. Never run two `ab.mjs` processes on the same variant at once: they share
  run folders and one deletes the other's run.
- Behaviour runs use `--permission-mode acceptEdits` and a fixed `--allowedTools` list, never bypassPermissions.
- `grade.json` holds `pluginChars`/`pluginFiles`: plugin files loaded into the main conversation (skill bodies + Reads),
  which gives the observed context cost per command.

## Acceptance (used for 0.6.2)
- Suite A accuracy NEW ≥ BASE.
- Suite B pass rate NEW ≥ BASE, with no new failure type.
- Suite C: NEW wins or ties in ≥ 50% of judgements.
Any regression → restore that part from BASE and re-run the affected cases.

## Cost (Opus, effort high, 0.6.2 measurements)
Trigger ≈ $0.18 per prompt-run (≈ $6 per variant). Plan round 1 ≈ $0.9, design --auto ≈ $1.4, tasks ≈ $0.9,
review ≈ $0.8, flow/tickets ≈ $0.25. Judge ≈ $0.1–0.2 per call.

## Known limits
- Fixtures are small (one change, a 3-file TS app). A check passes on shape, not on deep correctness. Suite C covers
  quality.
- Triggering varies a little run to run (the model sometimes explores with Bash first, which is denied in the trigger
  suite). Re-run disagreeing prompts before calling a regression.
