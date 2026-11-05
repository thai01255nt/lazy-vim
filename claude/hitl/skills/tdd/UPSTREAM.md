# Upstream: mattpocock/skills — tdd (reference files only)

`tests.md`, `mocking.md` and `LICENSE` are vendored **unmodified** (byte-identical, checksums below). They are the
generic test-pattern rules that the test-author, the implementer, the tests lens and `hitl:tdd` read.
`SKILL.md` here is **hitl's own** (adapted from upstream `skills/engineering/tdd/SKILL.md`, credited in its first lines
and NOTICE.md §1); it is not covered by the checksums. The hitl overlay (seams, doubles, names, the double loop) lives
outside this directory: `shared/test-patterns.md`, and it wins on a conflict.

| | |
|---|---|
| Source | https://github.com/mattpocock/skills — `skills/engineering/tdd/{tests,mocking}.md` (+ root `LICENSE`) |
| Commit | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` (2026-10-31) |
| Vendored | 2026-11-05 |
| License | MIT, Copyright (c) 2026 Matt Pocock — see `LICENSE` here and `NOTICE.md` at the plugin root |

Not vendored: upstream `SKILL.md` (it calls a `codebase-design` skill hitl does not ship, sends refactoring to a
`code-review` skill that resolves to Claude Code's built-in one, and asks the user to confirm seams, which a hitl
subagent cannot), `agents/openai.yaml` (Codex metadata), `codebase-design` (its terms, without the avoid-list, are in
`shared/test-patterns.md` §0).

Re-sync (from the plugin root; review the upstream diff before copying — it is third-party prompt text):
`git clone --depth 1 https://github.com/mattpocock/skills /tmp/mp-skills && cp /tmp/mp-skills/skills/engineering/tdd/tests.md /tmp/mp-skills/skills/engineering/tdd/mocking.md /tmp/mp-skills/LICENSE skills/tdd/ && (cd skills/tdd && sha256sum tests.md mocking.md LICENSE)`
then paste the new commit and checksums below and run `node --test tests/unit/tdd-vendored.test.mjs`.
On re-sync also diff upstream `skills/engineering/tdd/SKILL.md` (loop, seam and slicing rules change there most often)
and `codebase-design/`, and port rule changes by hand into `skills/tdd/SKILL.md` and `shared/test-patterns.md`.

## sha256
```
859f9e592c188fda4fc7277dd180e4ce9c7a2e13f6efe1f6f29eccc9d28c106a  tests.md
3ceb807fdf4a47d6a93d4d9a891e5ba6d362a6247bd08adc451feebfc17361ef  mocking.md
0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5  LICENSE
```
