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

First token ∈ {`init`, `push`, `pull`, `status`} (none → `status`). `push`: `T-<n>` tokens → task scope; another token
→ a change id (`feat-x`; a legacy tasks file name or path also works); `--auto` → automatic mode (called by
`/hitl:tasks`, `/hitl:approve`, `/hitl:review`). `init`: optional provider name, `--relink`. `pull`: `--relink`.

## 0. Provider (always first, local)
`hitl-index tickets status --json` → `provider` (`linear` | `jira` | `github`, from `tickets.provider`) and `label`
(printed for `<Tracker>`). Provider docs: `${CLAUDE_SKILL_DIR}/references/providers/<provider>/`
= `<PD>`; shared rules: `${CLAUDE_SKILL_DIR}/references/common/connect.md` = `<CONN>`. Config keys are `<provider>.*`.
Unknown provider → the CLI exits 2 with the list; print it; stop. `init <name>` for another provider than the
configured one → `hitl-index init --set tickets.provider=<name>` (say so in one line), then §0 again.
Hand-off files go to `.hitl/.inbox/` (Write tool). Never write `.hitl/<provider>.map.json` or `.hitl/index/*` (CLI-owned).

| sub-command | read |
|---|---|
| `status` | nothing more (§2) |
| `push` | §4; at step 2 `<CONN>` + `<PD>/connect.md`; at step 4 (only when there are ops) `<PD>/push-ops.md` + `<PD>/mcp.md` |
| `init` | only when the user typed `/hitl:tickets init`: `<CONN>` + `<PD>/connect.md`, then `<PD>/init.md` |
| `pull` | `<CONN>` + `<PD>/connect.md`, then `<PD>/pull.md` and §5 |

## 2. `status` (local, no network)
`hitl-index tickets status --json`. Print `<Tracker>: on|off · <workspace>/<team> · server <s> · project <p> · mapped n
· out of sync n · queued n` (omit unknown parts), the table `task | title | status | issue | synced | link` (synced: ✅
or the `reason`), then per mapped task `🎯 branch: git switch -c <branch>` and `PR: <prLine>`. `enabled: false` →
`ℹ️ <Tracker> sync is off (/hitl:tickets init)`. `queued > 0` → `⚠️ <n> <Tracker> update(s) queued → /hitl:tickets
push`. `enabled && !server` → `💡 pin the <Tracker> MCP server: /hitl:tickets init`.

## 4. `push [scope] [--auto]`
1. `hitl-index tickets plan [scope] --json`, then stop on: `enabled: false` → `ℹ️ <Tracker> sync is off (/hitl:tickets
   init)` · `configured: false` → `💡 run /hitl:tickets init` · `ops: []` → `✅ <Tracker> in sync` (these three print
   nothing with `--auto`) · exit ≠ 0 → `⚠️ <Tracker>: <CLI message>`.
2. Server pick and identity check (`<CONN>` §1–§2, also with `--auto`). Server missing / none → step 5 (fail-open);
   mismatch → stop (nothing executed, nothing recorded).
3. Gate: any op with `needsGate` and not `--auto` → ⛔ GATE: table `# | op | task | issue | state | prio | labels |
   reason` (gated rows ⛔) + `skipped`/`warnings` lines, options `1. 💡 push all  2. push without gated ops  3. cancel`.
   END TURN. Option 3 → stop (nothing recorded); option 2 → non-gated ops only. `--auto` → non-gated ops only, plus one
   line `⚠️ needs you: /hitl:tickets push` for the gated ones.
4. Execute the chosen ops **in plan order** as `<PD>/push-ops.md` says. The user stops you mid-push → stop at once,
   still do step 5 with the results so far (nothing is created twice), then discuss.
5. Record (also the fail-open path): Write `.hitl/.inbox/tickets-push.json` `{"schema":"hitl.tickets-results/1",
   "kind":"push","planId":"<plan's>","identity":<the <CONN> §2 object; omit when unreachable before it>,
   "unreachable":null|{"reason":"…"},"results":[…]}` (`unreachable` only when nothing ran: no tools, or the very first
   call failed with auth/network), then `hitl-index tickets record --in .hitl/.inbox/tickets-push.json --json`.
   Exit 1 `plan changed` → step 1 again (counts as a pass), never edit the plan. Exit 4 → print as `<CONN>` §2 step 3. `failed > 0` or `unreachable` → `⚠️ <Tracker> sync skipped (<reason>) — queued;
   /hitl:tickets push later`. Never retry in a loop.
6. `replan: true` → repeat from step 1 (max 3 passes per invocation; gated ops still need the gate). A new pass reuses
   this run's server and identity object (no new verify).
7. Report per created/updated task `T-1 → <issue> (<state name>) <url>` (state name as the tool returned it, else the
   plan's `stateType`, else omit); then from `hitl-index tickets status --json` `🎯 branch: git switch -c <branch>` for
   mapped tasks in `todo|skeleton|approved` and the `PR: <prLine>` lines. `--auto`: at most 3 lines (`🔗 <Tracker>: <n>
   updated · <m> queued`, the gated hint, the PR line).

## 5. `pull [--relink]` (read-only)
Follow `<PD>/pull.md`; never edit tasks md, proposals or specs, never push. Suggestion per item code
(`<P>_` = `LINEAR_` | `JIRA_` | `GITHUB_`):

| code | suggestion |
|---|---|
| `<P>_DONE_EARLY` | `run /hitl:review <T>, or reopen in <Tracker>` |
| `<P>_DRIFT` | title/description/priority/labels → `hitl overwrites it on the next /hitl:tickets push`; state → `kept in <Tracker>` |
| `<P>_UNMAPPED` | `/hitl:tickets pull --relink` |
| `<P>_MISSING` | `issue deleted or moved? fix by hand` |
| `<P>_AMBIGUOUS` | `two issues claim this task (legacy markers from two repos?) — fix by hand` |

`foreign > 0` → `ℹ️ <n> issue(s) of other repos ignored` (their marker has another `repo=`).

## 5b. Archive
`/hitl:archive` never calls this skill nor closes a container; the next push only updates each issue's `file=` marker.

## 6. Never
- Modify a pinned existing container (`<provider>.project`).
- Assign or delegate issues to agents (no `assignee`, `delegate`, `ready-for-agent`): they would bypass the HITL gates.
- Create issues per AC or per symbol; put source paths or code in issues.
- Ask the user anything when `--auto` is set.
