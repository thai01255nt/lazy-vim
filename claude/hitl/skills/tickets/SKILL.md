---
name: tickets
description: Optional one-way mirror of approved hitl tasks to a ticket tracker — Linear, Jira or GitHub Issues (issues, status, labels, relations, verdicts); reports drift; never blocks a gate. Use for "push to Linear/Jira/GitHub", "sync tickets", "tickets status", "linear status", or when another hitl skill asks to push.
argument-hint: "init [linear|jira|github] [--relink] | push [T-id…|change-id] [--auto] | pull [--relink] | status"
allowed-tools: Read Write ToolSearch Bash(hitl-index *) Bash(node *hitl-index.mjs *) Bash(gh *)
---

# /hitl:tickets — ticket tracker mirror (optional side channel)

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`.

Arguments: `$ARGUMENTS`

The CLI decides **what** to send (`hitl-index tickets plan`), you only **execute** it through the provider's tools and
hand the results back (`hitl-index tickets record`). Never decide state, labels or text yourself. The tracker is never a
gate: this skill never fails, blocks or changes the result of the skill that called it.

Parse the arguments: first token ∈ {`init`, `push`, `pull`, `status`} (none → `status`). For `push`: tokens `T-<n>` →
task scope; another token → a change id (`feat-x`; a legacy tasks file name or path also works); `--auto` → automatic
mode (called by `/hitl:tasks`, `/hitl:approve`, `/hitl:review`). For `init`: an optional provider name and `--relink`;
for `pull`: `--relink`.

## 0. Provider (always first, local)
`hitl-index tickets status --json` → `provider` (`linear` | `jira` | `github`; set by `tickets.provider` in
`.hitl/hitl.config.json`, default `linear`) and `label` (Linear / Jira / GitHub). Every provider-specific step below is
in **`${CLAUDE_SKILL_DIR}/references/providers/<provider>/`** — called `<PD>` here. Wherever this file says `<Tracker>`,
print the `label`. Config keys are `<provider>.*` (e.g. `jira.server`, `github.labels.phase`); the map is
`.hitl/<provider>.map.json`. Unknown provider → the CLI exits 2 with the list; print it; stop.
`init <name>` for a provider that is not the configured one → first `hitl-index init --set tickets.provider=<name>`
(say so in one line), then run §0 again. One repo mirrors to one provider at a time.

Hand-off files go to `.hitl/.inbox/` (Write tool). Never write `.hitl/<provider>.map.json` or `.hitl/index/<provider>.*`
yourself (the hook denies it; the CLI owns them).

## Sub-commands and what to read
| sub-command | read first |
|---|---|
| `status` | nothing more (§2) |
| `push` | §4 here; `<PD>/connect.md` at step 2 and `<PD>/push-ops.md` at step 4 (only when there are ops) |
| `init` | `<PD>/connect.md`, then `<PD>/init.md` (only when the user typed `/hitl:tickets init`) |
| `pull` | `<PD>/connect.md`, then `<PD>/pull.md` |
`<PD>/mcp.md` maps plan fields to that provider's tool parameters. `${CLAUDE_SKILL_DIR}/references/ticket-format.md`
explains the issue body and the field mapping per provider; `${CLAUDE_SKILL_DIR}/references/labels.md` lists the hitl
labels (names, colors, descriptions). Never call a tracker tool before `<PD>/connect.md` §1 picked the server (push and
pull: and §1b verified the identity).

## 2. `status` (local, no network)
`hitl-index tickets status --json`. Print one line `<Tracker>: on|off · <workspace>/<team> · server <s> · project <p> ·
mapped n · out of sync n · queued n` (omit unknown parts),
then the table `task | title | status | issue | synced | link` (synced: ✅ or the `reason`), then per mapped task
`🎯 branch: git switch -c <branch>` and `PR: <prLine>`. `enabled: false` → add `ℹ️ <Tracker> sync is off (/hitl:tickets init)`.
`queued > 0` → `⚠️ <n> <Tracker> update(s) queued → /hitl:tickets push`.
`enabled && !server` → `💡 pin the <Tracker> MCP server: /hitl:tickets init`.

## 3. `init [<provider>] [--relink]`
Only when the user typed `/hitl:tickets init`: follow `<PD>/init.md`.

## 4. `push [scope] [--auto]`
1. `hitl-index tickets plan [scope] --json`.
   - `enabled: false` → `ℹ️ <Tracker> sync is off (/hitl:tickets init)`; stop. With `--auto`: print nothing; stop.
   - `configured: false` → `💡 run /hitl:tickets init`; stop. With `--auto`: print nothing; stop.
   - `ops: []` → `✅ <Tracker> in sync`; stop. With `--auto`: print nothing; stop.
   - Exit ≠ 0 (e.g. unknown tasks file) → print the CLI message as `⚠️ <Tracker>: <msg>`; stop (never fail the caller).
2. Read `<PD>/connect.md`: discover tools and pick the server (§1). Missing / not available → step 5 (fail-open). Then
   the identity check (connect.md §1b, also with `--auto`); mismatch → stop there (nothing executed, nothing recorded).
3. Gate: any op with `needsGate` and not `--auto` → ⛔ GATE: table `# | op | task | issue | state | prio | labels |
   reason` (gated rows marked ⛔) + `skipped`/`warnings` lines, options `1. 💡 push all  2. push without gated ops
   3. cancel`. END TURN. With `--auto` → execute only the non-gated ops and list each gated one as
   `⚠️ needs you: /hitl:tickets push` (one line). Option 3 → stop (nothing recorded). Option 2 → only non-gated ops.
4. Execute the chosen ops **in plan order** exactly as `<PD>/push-ops.md` says (read it now: per-op tool calls and
   result fields, label merge, state guard, stop at the first auth/network error).
   The user stops you mid-push (e.g. "wrong project") → stop executing at once, still do step 5 with the results of
   the ops that already ran (so nothing is created twice), and only then discuss the change.
5. Record (also the fail-open path): Write `.hitl/.inbox/tickets-push.json`
   `{"schema":"hitl.tickets-results/1","kind":"push","planId":"<from the plan>","identity":<§1b object, omit when
   unreachable before it>,"unreachable":null|{"reason":"…"},"results":[…]}`
   (`unreachable` only when nothing ran: no MCP tools, or the very first call failed with auth/network), then
   `hitl-index tickets record --in .hitl/.inbox/tickets-push.json --json`.
   - Exit 1 `plan changed` → run §4.1 once more (counts as a pass), never edit the plan.
   - Exit 4 identity mismatch → print as connect.md §1b.3 (nothing was applied or queued).
   - `failed > 0` or `unreachable` → print `⚠️ <Tracker> sync skipped (<reason>) — queued; /hitl:tickets push later`.
   Never retry in a loop; never fail the caller.
6. `record` says `replan: true` → repeat from §4.1 (max 3 passes in one invocation; gated ops still need the gate,
   or `--auto` skips them).
7. Report: per created/updated task `T-1 → <issue> (<state name>) <url>`; then from `hitl-index tickets status --json`:
   `🎯 branch: git switch -c <branch>` for mapped tasks whose status is `todo|skeleton|approved`, and `PR: <prLine>` lines.
   With `--auto`: at most 3 lines (`🔗 <Tracker>: <n> updated · <m> queued`, the gated hint, and the PR line if any).

## 5. `pull [--relink]` (read-only)
Follow `<PD>/pull.md`. Never edit tasks md, proposals or specs and never push during pull. Drift codes carry the
provider prefix: `LINEAR_*`, `JIRA_*`, `GITHUB_*` (`_DRIFT`, `_DONE_EARLY`, `_UNMAPPED`, `_MISSING`, `_AMBIGUOUS`).

## 5b. Archive
`/hitl:archive` never calls this skill and never closes the change's container (project, epic or milestone): a one-way,
task-scoped mirror. After an archive the next push only updates each issue's `file=` marker (the tasks file moved).

## 6. Never
- Edit `<provider>.map.json` or `index/<provider>.*` yourself; compute state, labels or descriptions yourself.
- Call tools of a server other than the chosen one (or another provider's); push or pull after a failed identity check.
- Rename, re-describe or otherwise modify a pinned existing container (`<provider>.project`).
- Delegate or assign issues to agents (no `delegate`, no `assignee`, no `ready-for-agent` label): tracker coding agents
  would bypass the HITL gates.
- Create issues per AC or per symbol; put source paths or code in issues.
- Block, fail or change the result of the calling skill; ask the user anything when `--auto` is set.
