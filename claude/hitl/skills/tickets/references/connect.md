# Connect: tool discovery, server pick and identity check (`/hitl:tickets` init, push, pull)

Read by SKILL.md before the first Linear call of `init`, `push` and `pull`. `status` never needs it.

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
    `claude mcp add --transport http <name> https://mcp.linear.app/mcp` and `/mcp`); push → fail-open SKILL.md §4 step 5 with reason
    `pinned Linear server <name> not available`; pull → stop. Never fall back to another server.
  - `none` → no Linear server at all (init: SKILL `init` (references/init.md step 1) message; push: SKILL.md §4 step 5 `Linear MCP not connected`; pull: stop).
  - `save` / `pick` (init only) → SKILL `init` (references/init.md step 1).
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
- No Linear tool at all → fail-open path (SKILL.md §4 step 5) with reason `Linear MCP not connected`.

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
   An auth/network error during this step → unreachable (SKILL.md §4 step 5); it is not a mismatch.
