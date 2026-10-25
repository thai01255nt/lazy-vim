# Fast lane (low-risk tasks, or a high-risk task the user forced with `--lane fast`)

For tasks whose risk is `low` in the tasks md (e.g. created by `/hitl:tasks quick …`). Every automatic step prints ⚡.
`BY` = `auto` (low risk) or `human-override` (high risk + the user typed `--lane fast`; see SKILL.md "Lane override").
The CLI refuses `--by auto` on high-risk tasks (exit 1). If that happens, stop with 🛑 and the CLI's reason, and
tell the user which human step is needed. Never retry with `--by human`, and never switch to `human-override` on your own.
With `BY = human-override` prefix the automatic steps with `⚠️⚡` instead of `⚡`.

Same rules as the normal flow: agent bodies only through `hitl:implementer`, manual bodies only by the human, tests
only through `hitl:test-author`, fresh test evidence before any claim.

## Steps

1. **⚡ Skeleton** (only if task status is `todo`)
   - Invoke the `hitl:skeleton` skill with arguments `<T> --quick` (`<T> --quick --override` when `BY = human-override`)
     (Skill tool). It drafts stubs + test stubs, checks drift, and auto-approves with
     `hitl-index approve <T> --stage skeleton --by <BY>` instead of stopping at its gate.
   - If the Skill tool is unavailable: Read `${CLAUDE_PLUGIN_ROOT}/skills/skeleton/SKILL.md` and follow its steps 2–5,
     then run the approve command above yourself.
   - Print `⚡ skeleton auto-approved: n symbols, m test stubs`.
   - Status `skeleton` (stubs exist but not approved): just run the approve command.
   - Run every approve command alone (no chaining); the hook denies chained approve commands.
2. **⚡ Tests** (task status `approved`)
   - Invoke the `hitl:test` skill with arguments `<T> fill` (`<T> fill --override` when `BY = human-override`). For low
     risk (or override) it fills stubs via the test-author, runs the RED check and auto-locks with
     `hitl-index approve <T> --stage tests --by <BY>`.
   - If the RED check could not be satisfied (vacuous or broken tests after 2 bounces): 🛑 stop and show them.
     Do not implement against tests that never failed.
   - Print `⚡ tests auto-locked: n red`.
3. **Implement** — return to SKILL.md step 2 with `--all`: loop over all agent symbols; manual symbols still use the
   hand-off gate.
4. **Finish** — fresh `hitl-index test --task <T> --json`, `status --sync-tags`, then
   `🎯 next: /hitl:review <T>` (for low risk with verdict PASS the review auto-approves `done`; an override task always
   goes to the human: every function is HUMAN-routed and `done` needs `/hitl:approve <T> done`).

## When to leave the fast lane

Stop and recommend `/hitl:plan` or `/hitl:tasks` (normal lane) if, while drafting, you find any high-risk signal that the
task row did not list: concurrency / shared state, auth/crypto/money/SQL/shell/path/deserialization, a public or exported
API change, a data migration. Print `⚠️ risk looks high: <reasons>` and do not auto-approve anything further.
(Not under `BY = human-override`: the user already accepted the high risk. Mention new signals once in the summary.)
