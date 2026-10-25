---
name: tickets
description: Mirrors approved HITL tasks to Linear (one issue per task, planning file as project or one pinned existing project), pushes computed status, priority, risk/impl labels, blocked-by relations and review verdicts one-way, reports remote drift read-only, and prints branch names and "Fixes ENG-n" lines. Never blocks a HITL gate; queues updates when Linear is unreachable. Use for "push to Linear", "sync tickets", "linear status", or when another hitl skill asks to push.
argument-hint: "init [--relink] | push [T-id…|tasks-file] [--auto] | pull [--relink] | status"
allowed-tools: Read Write ToolSearch Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:tickets — Linear mirror (optional side channel)

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`.

Arguments: `$ARGUMENTS`

The CLI decides **what** to send (`hitl-index tickets plan`), you only **execute** it through the Linear MCP and hand
the results back (`hitl-index tickets record`). Never decide state, labels or text yourself. Linear is never a gate:
this skill never fails, blocks or changes the result of the skill that called it.

Parse the arguments: first token ∈ {`init`, `push`, `pull`, `status`} (none → `status`). For `push`: tokens `T-<n>` →
task scope; another token → a tasks file (`feat-x`, `feat-x.md` or a path); `--auto` → automatic mode (called by
`/hitl:tasks`, `/hitl:approve`, `/hitl:review`). For `pull` and `init`: `--relink`.

Hand-off files go to `.hitl/.inbox/` (Write tool). Never write `.hitl/linear.map.json` or
`.hitl/index/linear.*` yourself (the hook denies it; the CLI owns them).

## 1. Discover the Linear MCP tools (runtime, never hardcoded)
Details and the payload → parameter mapping: `${CLAUDE_PLUGIN_ROOT}/skills/tickets/references/linear-mcp.md`.
- Look at your available tools for names matching `mcp__*linear*__*` (e.g. `mcp__linear-server__…`,
  `mcp__plugin_linear_linear__…`, `mcp__claude_ai_Linear__…`). If they are deferred, `ToolSearch` with
  `+linear issue` and `+linear team` (then `select:` the ones you need) to load their schemas.
- **Pick the server** (`<server>` in `mcp__<server>__<tool>`; one server = one OAuth = one Linear workspace):
  `hitl-index tickets server <server>… --json` (one argument per distinct Linear server you see; add `--init` during
  init). Act on `action`:
  - `use` → use **only** `server` for the whole run (never call another Linear server's tools).
  - `missing` → the pinned `linear.server` is not available: print `❌ <message>` (it contains
    `claude mcp add --transport http <name> https://mcp.linear.app/mcp` and `/mcp`); push → fail-open §4.5 with reason
    `pinned Linear server <name> not available`; pull → stop. Never fall back to another server.
  - `none` → no Linear server at all (init: §3.1 message; push: §4.5 `Linear MCP not connected`; pull: stop).
  - `save` / `pick` (init only) → §3.1.
  - `legacy` (no `linear.server` in config) → use the server whose list teams contains the `team.id` of
    `hitl-index tickets status --json` (`teamId`); none contains it → treat as an identity mismatch (§1b). Print the
    `💡` pin hint once (not with `--auto`).
- Map each capability to the **first existing** tool (suffix after the chosen server prefix):

  | capability | candidates (first that exists) |
  |---|---|
  | list teams | `list_teams` |
  | list states | `list_issue_statuses`, `list_workflow_states` |
  | list / create labels | `list_issue_labels`, `list_labels` / `create_issue_label`, `create_label` |
  | upsert issue | `save_issue` (create without `id`, update with `id`), else `create_issue` + `update_issue` |
  | get / list issues | `get_issue` / `list_issues`, `search_issues` |
  | upsert comment | `save_comment`, else `create_comment` (+ `update_comment`) |
  | upsert project | `save_project`, else `create_project` + `update_project` |
  | list / get projects | `list_projects` / `get_project` |
- Read each chosen tool's input schema before its first call and map plan fields to its parameter names
  (`stateId` vs `state`, `labelIds` vs `labels`, project `summary`/`description` vs `content`, `teamId` vs `team`).
  A field with no matching parameter → skip it, list it as `skippedFields` in the result and report it once.
- No Linear tool at all → fail-open path (§4.5) with reason `Linear MCP not connected`.

## 1b. Identity check (before every push and pull, also with `--auto`)
1. With the chosen server: get the team by `teamId` from `hitl-index tickets status --json` (list teams and find it;
   absent → `team: null`). Workspace urlKey: from any `https://linear.app/<urlKey>/…` URL the MCP returns (team, issue,
   project or viewer/organization URL); none → `workspace: null`. `project` (status `project.id` set): get that project
   (found → `{"id": "<id>"}`, not found → `null`); no project pinned → omit `project`.
2. Write `.hitl/.inbox/tickets-identity.json`
   `{"schema":"hitl.tickets-identity/1","server":"<server>","workspace":{"urlKey":"<k>"}|null,"team":{"id","key"}|null,"project":…}`
   and run `hitl-index tickets verify --in .hitl/.inbox/tickets-identity.json --json`. Keep the same object: it also goes
   into the push results / remote file as `"identity"` (the CLI checks it again).
3. Exit 4 / `ok: false` → **refuse the whole run**: execute nothing, record nothing (no queue entry). Print
   `❌ Linear identity mismatch` + one line per `mismatches[]` (`<field>: expected <e> · observed <o>`) + the `fix` lines
   (`hitl-index init --set linear.server=<name>` for a wrong server, `/hitl:tickets init --relink` when the repo really
   moved). With `--auto`: one line `⚠️ Linear: identity mismatch — /hitl:tickets push to see why`. Never fail the caller.
4. `status: learned` → print `💡 recorded <learned> in linear.map.json` (old map without workspace). `warnings` → `⚠️` lines.
   An auth/network error during this step → unreachable (§4.5); it is not a mismatch.

## 2. `status` (local, no network)
`hitl-index tickets status --json`. Print one line `Linear: on|off · <workspace>/<team> · server <s> · project <p> ·
mapped n · out of sync n · queued n` (omit unknown parts),
then the table `task | title | status | issue | synced | link` (synced: ✅ or the `reason`), then per mapped task
`🎯 branch: git switch -c <branch>` and `PR: <prLine>`. `enabled: false` → add `ℹ️ Linear sync is off (/hitl:tickets init)`.
`queued > 0` → `⚠️ <n> Linear update(s) queued → /hitl:tickets push`.
`enabled && !server` → `💡 pin the Linear MCP server: /hitl:tickets init`.

## 3. `init [--relink]` (only when the user typed `/hitl:tickets init`)
1. Discover tools (§1) and run `hitl-index tickets server <server>… --init --json`.
   - `none` → print `❌ Linear MCP not found. Install it: claude mcp add --transport http linear-server
     https://mcp.linear.app/mcp (or the "linear" plugin), run /mcp to authenticate, then /hitl:tickets init`. Stop.
   - `use` → keep the pinned server (to switch: the user names another one; then save it as below).
   - `save` → exactly one Linear server: `hitl-index init --set linear.server=<server>` and say so in one line.
   - `pick` → ⛔ GATE: table `# | server | workspace | teams` (call list teams on each candidate if cheap; workspace
     urlKey from a returned URL, `?` when unknown; a server that fails auth → `not authenticated (/mcp)`), 💡 none
     preselected unless only one is authenticated. END TURN. On reply: `hitl-index init --set linear.server=<server>`.
     A missing workspace: `claude mcp add --transport http linear-<name> https://mcp.linear.app/mcp`, `/mcp`, init again.
   From here on call only that server's tools.
2. Call list teams and list projects (of the team, when the tool filters by team). ⛔ GATE: table of teams (key, name)
   and the choices with defaults: team (💡 the only/first one) · issues go to: `one project per planning file` 💡 /
   `existing project <pick: table of list_projects name + url>` / `parent-issue per planning file` / `none` · label
   groups risk + impl 💡 (phase labels `hitl:<status>` off 💡). With an existing project, `parent-issue` can be combined
   (parent issues inside that project). Also list the labels that will be created if missing:
   `risk:high`, `impl:agent`, `impl:manual`, `impl:mixed` (+ `hitl:skeleton|approved|red|wip|green|review|verified`
   when phase is on). END TURN. A project given as a name or URL → resolve it with list/get projects to its id.
3. On reply: `hitl-index init --set linear.enabled=true --set linear.team=<KEY> --set linear.planningAs=<x>`
   (`project` for "one project per planning file" and also for "existing project" alone; `parent-issue`; `none`)
   + `--set 'linear.project={"id":"<uuid>","name":"<name>"}'` for an existing project, else `--set linear.project=null`
   (+ `--set linear.labels.phase=true` / `--set linear.labels.risk=false` / `--set linear.labels.impl=false` when chosen).
   hitl never renames or edits an existing project; it only attaches issues to it.
4. List the team's states. Pick one per type: `backlog`, `unstarted`, `started`, `completed`, `canceled` (the first
   state of each type by position); `review` = a `started`-type state whose name matches `/review/i`, or the state named
   in config `linear.stateNames.review`; none → `null` (hitl then uses `started` for green/review/verified).
5. List the team's labels; create the missing enabled hitl labels (names exactly as above). Collect `{name: id}`.
6. Write `.hitl/.inbox/tickets-init.json`:
   `{"schema":"hitl.tickets-results/1","kind":"init","relink":<true only with --relink>,"init":{"workspace":{"urlKey":"<from
   a team/issue/project URL>"}|null,"team":{"key","id","name"},"project":{"id","name","url"}|null,
   "states":{"backlog":{"id","name"}|null,…},"labels":{"risk:high":"<id>",…}}}`
   then `hitl-index tickets record --in .hitl/.inbox/tickets-init.json --json`.
   Exit 4 (the map is linked to another workspace/team) → print the message: either the wrong server was picked
   (fix `linear.server`) or the repo really moves → the user runs `/hitl:tickets init --relink` (clears the old task
   mappings; the next push creates new issues). Never add `relink` without the flag.
7. Print `✅ Linear linked: <workspace>/<KEY> via <server> · project <name|per planning file> · states … · labels …`,
   `ℹ️ linear.map.json + hitl.config.json are per repo: commit them; every repo runs /hitl:tickets init once (repos may
   share a team/project)`, and the recommended team setting:
   `💡 Linear → Team → Workflow → GitHub: keep "On PR merge → Done" off, or accept that a merge after /hitl:approve done marks Done.`
   🎯 next: `/hitl:tickets push`.

## 4. `push [scope] [--auto]`
1. `hitl-index tickets plan [scope] --json`.
   - `enabled: false` → `ℹ️ Linear sync is off (/hitl:tickets init)`; stop. With `--auto`: print nothing; stop.
   - `configured: false` → `💡 run /hitl:tickets init`; stop. With `--auto`: print nothing; stop.
   - `ops: []` → `✅ Linear in sync`; stop. With `--auto`: print nothing; stop.
   - Exit ≠ 0 (e.g. unknown tasks file) → print the CLI message as `⚠️ Linear: <msg>`; stop (never fail the caller).
2. Discover tools and pick the server (§1). Missing / not available → §4.5. Then the identity check (§1b, also with
   `--auto`); mismatch → stop there (nothing executed, nothing recorded).
3. Gate: any op with `needsGate` and not `--auto` → ⛔ GATE: table `# | op | task | issue | reason` (gated rows marked ⛔)
   + `skipped`/`warnings` lines, options `1. 💡 push all  2. push without gated ops  3. cancel`. END TURN.
   With `--auto` → execute only the non-gated ops and list each gated one as `⚠️ needs you: /hitl:tickets push` (one line).
   Option 3 → stop (nothing recorded). Option 2 → execute only the non-gated ops.
4. Execute the chosen ops **in plan order**; one result per executed op: `{"opId","ok":true,…}` or
   `{"opId","ok":false,"error":"<message>"}`. Ignore each op's `meta` (CLI-internal). Per op:
   - `ensureProject` → upsert project (`payload.id` null → create with `name`, `summary`, `content`, team `teamId`;
     else update). Result: `id`, `url`. `ensureParent` → upsert issue with `title`, `description`, `teamId`
     (+ `id` to update). Result: `id`, `issue` (identifier), `url`.
   - `createIssue` → upsert issue without `id`: `title`, `description`, `teamId`, `priority`, `stateId`, `labelIds`,
     `projectId`/`parentId` (a pinned `linear.project` arrives as `projectId`; never create or update that project). When `projectId`/`parentId` is null and the op has `planning`, use the id returned by
     this run's `ensureProject`/`ensureParent` for that planning (report it as `projectId`/`parentId`). Result: `id`,
     `issue` (identifier, e.g. `ENG-12`), `url`, `branch` (the issue's `branchName`/`gitBranchName` when returned),
     `description` (as returned, when returned).
   - `updateIssue` → first get the issue (`id`), then:
     (a) labels: send current remote label ids **minus** `payload.labels.remove` **plus** `payload.labels.add` (never
     drop non-hitl labels; the label parameter usually replaces the whole set);
     (b) if `payload.fields.stateId` is present and the remote state type ≠ `payload.expect.stateType` (`review` means a
     started-type state) → do not send `stateId`, add `"stateId"` to `skippedFields`, report
     `⚠️ <issue> state changed in Linear (<remote state>) — kept`;
     (c) send the other `payload.fields` (`title`, `description`, `priority`, `stateId`, `projectId`, `parentId`).
     Result: `ok`, optional `description` (as returned), `skippedFields`.
   - `addRelations` → upsert issue `id` with `blockedBy: [payload.blockedBy[].id]` (append-only; never try to remove).
   - `manualNote` → print `📌 <payload.message>`; result `ok: true` without calling Linear.
   - `upsertComment` → `payload.commentId` set and an update tool exists → update that comment's `body`; else create a
     comment on issue `id` with `body`. Result: `commentId`.
   - `cancelIssue` → upsert issue `id` with `stateId = payload.stateId`.
   Stop executing at the first auth / network / rate-limit error; every remaining chosen op gets
   `{"ok":false,"error":"unreachable: <msg>"}`. Any other error → that op `ok:false`, continue.
5. Record (also the fail-open path): Write `.hitl/.inbox/tickets-push.json`
   `{"schema":"hitl.tickets-results/1","kind":"push","planId":"<from the plan>","identity":<§1b object, omit when
   unreachable before it>,"unreachable":null|{"reason":"…"},"results":[…]}`
   (`unreachable` only when nothing ran: no MCP tools, or the very first call failed with auth/network), then
   `hitl-index tickets record --in .hitl/.inbox/tickets-push.json --json`.
   - Exit 1 `plan changed` → run §4.1 once more (counts as a pass), never edit the plan.
   - Exit 4 identity mismatch → print as §1b.3 (nothing was applied or queued).
   - `failed > 0` or `unreachable` → print `⚠️ Linear sync skipped (<reason>) — queued; /hitl:tickets push later`.
   Never retry in a loop; never fail the caller.
6. `record` says `replan: true` → repeat from §4.1 (max 3 passes in one invocation; gated ops still need the gate,
   or `--auto` skips them).
7. Report: per created/updated task `T-1 → ENG-1 (<state name>) <url>`; then from `hitl-index tickets status --json`:
   `🎯 branch: git switch -c <branch>` for mapped tasks whose status is `todo|skeleton|approved`, and `PR: <prLine>` lines.
   With `--auto`: at most 3 lines (`🔗 Linear: <n> updated · <m> queued`, the gated hint, and the PR line if any).

## 5. `pull [--relink]` (read-only)
1. Discover tools and pick the server (§1). None / pinned server missing → `⚠️ Linear MCP not connected` (or the `❌`
   message); stop. Identity check (§1b); mismatch → stop.
2. Team id from `hitl-index tickets status --json` → `teamId`; then list issues of that team (page size ≤ 50, include
   completed and canceled, follow the cursor, max 5 pages). Set `"complete": true` only when every page was read.
3. Normalize to `{"schema":"hitl.tickets-remote/1","complete":bool,"issues":[{"id","identifier","url","title",
   "description","priority","state":{"id","name","type"},"labels":[{"id","name"}],"assignee":"<name>"|null,
   "cycle":"<name>"|null,"branchName"|null,"updatedAt"}],"identity":<§1b object>}`; Write `.hitl/.inbox/tickets-remote.json`.
4. `hitl-index tickets diff --in .hitl/.inbox/tickets-remote.json [--relink] --json`. Print the items table
   `level | code | task | issue | field | local → remote`, then `T-1: <state> · assignee <a> · cycle <c>` per task.
   Suggestions only: `LINEAR_DONE_EARLY` → `run /hitl:review <T>, or reopen in Linear`; `LINEAR_DRIFT` →
   `hitl overwrites it on the next /hitl:tickets push` (title/description/priority/labels) or `kept in Linear` (state);
   `LINEAR_UNMAPPED` → `/hitl:tickets pull --relink`; `LINEAR_MISSING` → `issue deleted or moved? fix by hand`;
   `LINEAR_AMBIGUOUS` → `two issues claim this task (legacy markers from two repos?) — fix by hand`. `foreign > 0` →
   `ℹ️ <n> issue(s) of other repos in this team ignored` (their marker has another `repo=`).
5. Never edit tasks/planning md and never push during pull.

## 6. Never
- Edit `linear.map.json` or `index/linear.*` yourself; compute state, labels or descriptions yourself.
- Call tools of a Linear server other than the chosen one; push or pull after a failed identity check.
- Rename, re-describe or otherwise modify a pinned existing project (`linear.project`).
- Delegate or assign issues to agents (no `delegate`, no `assignee`, no `ready-for-agent` label): Linear coding agents
  would bypass the HITL gates.
- Create issues per AC or per symbol; put source paths or code in issues.
- Block, fail or change the result of the calling skill; ask the user anything when `--auto` is set.
