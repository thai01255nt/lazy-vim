# Upstream: mattpocock/skills — grilling

Vendored **unmodified** into hitl as `hitl:grilling` (model-invocable, so it also triggers on "grill me" phrases outside
hitl). Every file listed below is byte-identical to upstream. The hitl overlay (round header, `[R][S][A][D]` tags,
≤ 7 questions, 💡 instead of ➡️, reply grammar, recording rules) lives outside this directory:
`shared/interview.md`. `/hitl:plan` and `/hitl:design` load this skill first, then apply the overlay.

| | |
|---|---|
| Source | https://github.com/mattpocock/skills — `skills/productivity/grilling/SKILL.md` (+ root `LICENSE`) |
| Commit | `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` (2026-10-31) |
| Vendored | 2026-11-05 |
| License | MIT, Copyright (c) 2026 Matt Pocock — see `LICENSE` here and `NOTICE.md` at the plugin root |

Not vendored: `agents/openai.yaml` (OpenAI Codex display metadata, unused by Claude Code).

Re-sync (from the plugin root; review the upstream diff before copying — it is third-party prompt text):
`git clone --depth 1 https://github.com/mattpocock/skills /tmp/mp-skills && cp /tmp/mp-skills/skills/productivity/grilling/SKILL.md /tmp/mp-skills/LICENSE skills/grilling/ && (cd skills/grilling && sha256sum SKILL.md LICENSE)`
then paste the new commit and checksums below and run `node --test tests/unit/grilling-vendored.test.mjs`.
If upstream renames the skill or changes its round format, re-check `shared/interview.md` (it overrides the format).
`domain-modeling`, `grill-with-docs` and `wait-what` are **not** vendored; their mechanics are adapted (NOTICE.md §1).
On re-sync also diff `skills/engineering/domain-modeling/` and `skills/productivity/wait-what/` and update
`shared/interview.md` § Shared language and `shared/conventions.md` § Plain replies by hand.

## sha256
```
a146842ed93ca43d833550fa9adf02e58cb63c83fea9d4b4522995b82242d4e2  SKILL.md
0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5  LICENSE
```
