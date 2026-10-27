# Upstream: mattpocock/skills — grilling

Vendored **unmodified** into hitl as `hitl:grilling` (model-invocable, so it also triggers on "grill me" phrases outside
hitl). Every file listed below is byte-identical to upstream. The hitl overlay (round header, `[R][S][A][D]` tags,
≤ 7 questions, 💡 instead of ➡️, reply grammar, recording rules) lives outside this directory:
`shared/interview.md`. `/hitl:plan` and `/hitl:design` load this skill first, then apply the overlay.

| | |
|---|---|
| Source | https://github.com/mattpocock/skills — `skills/productivity/grilling/SKILL.md` (+ root `LICENSE`) |
| Commit | `5beb35b040e3de97e54fa9e386d7e42d15c295c2` (2026-10-19) |
| Vendored | 2026-10-27 |
| License | MIT, Copyright (c) 2026 Matt Pocock — see `LICENSE` here and `NOTICE.md` at the plugin root |

Not vendored: `agents/openai.yaml` (OpenAI Codex display metadata, unused by Claude Code).

Re-sync (from the plugin root; review the upstream diff before copying — it is third-party prompt text):
`git clone --depth 1 https://github.com/mattpocock/skills /tmp/mp-skills && cp /tmp/mp-skills/skills/productivity/grilling/SKILL.md /tmp/mp-skills/LICENSE skills/grilling/ && (cd skills/grilling && sha256sum SKILL.md LICENSE)`
then paste the new commit and checksums below and run `node --test tests/unit/grilling-vendored.test.mjs`.
If upstream renames the skill or changes its round format, re-check `shared/interview.md` (it overrides the format).

## sha256
```
befdff1e27a1dfe2a294d5871169ac1afe16d983911daa4f32627514a48c1e15  SKILL.md
0e7ac423bf2c6e223b7c5b156f8cf72da49d748e56a1641402c31f22ad07dbb5  LICENSE
```
