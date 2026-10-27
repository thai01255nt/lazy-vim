---
name: tickets
description: Optional one-way mirror of approved hitl tasks to Linear (issues, status, labels, relations, verdicts); reports drift; never blocks a gate. Use for "push to Linear", "sync tickets", "linear status", or when another hitl skill asks to push.
argument-hint: "init [--relink] | push [T-id…|change-id] [--auto] | pull [--relink] | status"
allowed-tools: Read Write ToolSearch Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:tickets — Linear mirror (optional side channel)

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`.

Arguments: `$ARGUMENTS`

The CLI decides **what** to send (`hitl-index tickets plan`), you only **execute** it through the Linear MCP and hand
the results back (`hitl-index tickets record`). Never decide state, labels or text yourself. Linear is never a gate:
this skill never fails, blocks or changes the result of the skill that called it.

Parse the arguments: first token ∈ {`init`, `push`, `pull`, `status`} (none → `status`). For `push`: tokens `T-<n>` →
task scope; another token → a change id (`feat-x`; a legacy tasks file name or path also works); `--auto` → automatic mode (called by
`/hitl:tasks`, `/hitl:approve`, `/hitl:review`). For `pull` and `init`: `--relink`.

Hand-off files go to `.hitl/.inbox/` (Write tool). Never write `.hitl/linear.map.json` or
`.hitl/index/linear.*` yourself (the hook denies it; the CLI owns them).

## Sub-commands and what to read
| sub-command | read first |
|---|---|
| `status` | nothing more (§2) |
| `push` | §4 here; `references/connect.md` at step 2 and `references/push-ops.md` at step 4 (only when there are ops) |
| `init` | `references/connect.md`, then `references/init.md` (only when the user typed `/hitl:tickets init`) |
| `pull` | `references/connect.md`, then `references/pull.md` |
All under `${CLAUDE_SKILL_DIR}/references/`; `linear-mcp.md` there maps plan fields to tool parameters.
Never call a Linear tool before `connect.md` §1 picked the server (push and pull: and §1b verified the identity).

## 2. `status` (local, no network)
`hitl-index tickets status --json`. Print one line `Linear: on|off · <workspace>/<team> · server <s> · project <p> ·
mapped n · out of sync n · queued n` (omit unknown parts),
then the table `task | title | status | issue | synced | link` (synced: ✅ or the `reason`), then per mapped task
`🎯 branch: git switch -c <branch>` and `PR: <prLine>`. `enabled: false` → add `ℹ️ Linear sync is off (/hitl:tickets init)`.
`queued > 0` → `⚠️ <n> Linear update(s) queued → /hitl:tickets push`.
`enabled && !server` → `💡 pin the Linear MCP server: /hitl:tickets init`.

## 3. `init [--relink]`
Only when the user typed `/hitl:tickets init`: follow `references/init.md`.

## 4. `push [scope] [--auto]`
1. `hitl-index tickets plan [scope] --json`.
   - `enabled: false` → `ℹ️ Linear sync is off (/hitl:tickets init)`; stop. With `--auto`: print nothing; stop.
   - `configured: false` → `💡 run /hitl:tickets init`; stop. With `--auto`: print nothing; stop.
   - `ops: []` → `✅ Linear in sync`; stop. With `--auto`: print nothing; stop.
   - Exit ≠ 0 (e.g. unknown tasks file) → print the CLI message as `⚠️ Linear: <msg>`; stop (never fail the caller).
2. Read `${CLAUDE_SKILL_DIR}/references/connect.md`: discover tools and pick the server (§1). Missing / not available
   → step 5 (fail-open). Then the identity check (connect.md §1b, also with `--auto`); mismatch → stop there (nothing
   executed, nothing recorded).
3. Gate: any op with `needsGate` and not `--auto` → ⛔ GATE: table `# | op | task | issue | reason` (gated rows marked ⛔)
   + `skipped`/`warnings` lines, options `1. 💡 push all  2. push without gated ops  3. cancel`. END TURN.
   With `--auto` → execute only the non-gated ops and list each gated one as `⚠️ needs you: /hitl:tickets push` (one line).
   Option 3 → stop (nothing recorded). Option 2 → execute only the non-gated ops.
4. Execute the chosen ops **in plan order** exactly as `${CLAUDE_SKILL_DIR}/references/push-ops.md` says (read it
   now: per-op tool calls and result fields, label merge, state guard, stop at the first auth/network error).
5. Record (also the fail-open path): Write `.hitl/.inbox/tickets-push.json`
   `{"schema":"hitl.tickets-results/1","kind":"push","planId":"<from the plan>","identity":<§1b object, omit when
   unreachable before it>,"unreachable":null|{"reason":"…"},"results":[…]}`
   (`unreachable` only when nothing ran: no MCP tools, or the very first call failed with auth/network), then
   `hitl-index tickets record --in .hitl/.inbox/tickets-push.json --json`.
   - Exit 1 `plan changed` → run §4.1 once more (counts as a pass), never edit the plan.
   - Exit 4 identity mismatch → print as connect.md §1b.3 (nothing was applied or queued).
   - `failed > 0` or `unreachable` → print `⚠️ Linear sync skipped (<reason>) — queued; /hitl:tickets push later`.
   Never retry in a loop; never fail the caller.
6. `record` says `replan: true` → repeat from §4.1 (max 3 passes in one invocation; gated ops still need the gate,
   or `--auto` skips them).
7. Report: per created/updated task `T-1 → ENG-1 (<state name>) <url>`; then from `hitl-index tickets status --json`:
   `🎯 branch: git switch -c <branch>` for mapped tasks whose status is `todo|skeleton|approved`, and `PR: <prLine>` lines.
   With `--auto`: at most 3 lines (`🔗 Linear: <n> updated · <m> queued`, the gated hint, and the PR line if any).

## 5. `pull [--relink]` (read-only)
Follow `references/pull.md`. Never edit tasks md, proposals or specs and never push during pull.

## 5b. Archive
`/hitl:archive` never calls this skill and never closes the change's Linear project (a one-way, task-scoped mirror).
After an archive the next push only updates each issue's `file=` marker (the tasks file moved).

## 6. Never
- Edit `linear.map.json` or `index/linear.*` yourself; compute state, labels or descriptions yourself.
- Call tools of a Linear server other than the chosen one; push or pull after a failed identity check.
- Rename, re-describe or otherwise modify a pinned existing project (`linear.project`).
- Delegate or assign issues to agents (no `delegate`, no `assignee`, no `ready-for-agent` label): Linear coding agents
  would bypass the HITL gates.
- Create issues per AC or per symbol; put source paths or code in issues.
- Block, fail or change the result of the calling skill; ask the user anything when `--auto` is set.
