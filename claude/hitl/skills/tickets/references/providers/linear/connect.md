# Linear — tools and identity (with `references/common/connect.md`)

- Tool pattern: `mcp__<server>__…` where `<server>` contains `linear` (case-insensitive), e.g. `mcp__linear-server__…`,
  `mcp__plugin_linear_linear__…`, `mcp__claude_ai_Linear__…`. One server = one OAuth = one Linear workspace. Deferred →
  `ToolSearch` `+linear issue`, `+linear team` (+ `+linear label`, `+linear comment`, `+linear project` as needed).
- `legacy`: the candidate whose list teams contains the team with id status `teamId`.

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

Identity (common §2 step 1): `team` = the team whose id is status `teamId`, from list teams → `{"id":"<uuid>","key":"<KEY>"}`
(absent → `null`). `workspace.urlKey` = the first path segment of any `https://linear.app/<urlKey>/…` URL a tool
returns (team, issue, project or organization URL); none → `workspace: null`. `project` (status `project.id` set) = get
that project → `{"id":"<uuid>"}`, not found → `null`.
