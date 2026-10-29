# Jira — connect: tool discovery, server pick and identity check (`/hitl:tickets` init, push, pull)

Read by SKILL.md before the first Jira call of `init`, `push` and `pull`. `status` never needs it.

## 1. Discover the Atlassian MCP tools (runtime, never hardcoded)
Details and the payload → parameter mapping: `mcp.md` (this folder).
- Look for tools `mcp__*atlassian*__*` or `mcp__*jira*__*`; deferred → `ToolSearch` (`+atlassian jira issue`).
- **Pick the server**: `hitl-index tickets server <server>… --json` (one argument per distinct Atlassian server; add
  `--init` during init). Act on `action` exactly as for Linear: `use` → only that server · `missing` → print `❌ <message>`
  (it contains the `claude mcp add` line), push → fail-open SKILL.md §4 step 5, pull → stop · `none` → init: init.md
  step 1, push: fail-open `Jira MCP not connected`, pull: stop · `save` / `pick` (init only) → init.md step 1 ·
  `legacy` → use the server whose visible projects contain the mapped project id.
- Map each capability to the **first existing** tool (suffix after the server prefix):

  | capability | candidates |
  |---|---|
  | site / cloudId | `getAccessibleAtlassianResources` |
  | list projects | `getVisibleJiraProjects` |
  | issue types | `getJiraProjectIssueTypesMetadata` |
  | create / edit issue | `createJiraIssue` / `editJiraIssue` |
  | get / search issues | `getJiraIssue` / `searchJiraIssuesUsingJql` |
  | transitions | `getTransitionsForJiraIssue` + `transitionJiraIssue` |
  | link issues | `createJiraIssueLink`, `linkJiraIssues` (none → manual note) |
  | comment | `addCommentToJiraIssue` |
- Read each tool's schema before its first call. A field with no matching parameter → skip it, list it in
  `skippedFields` and report it once.

## 1b. Identity check (before every push and pull, also with `--auto`)
1. Site: from `getAccessibleAtlassianResources` (`url` → `<name>.atlassian.net`) → `workspace: {"urlKey": "<host>"}`.
   Project: the project with the mapped id (`hitl-index tickets status --json` → `teamId`) from list projects →
   `team: {"id", "key"}`; absent → `team: null`. A pinned epic (`jira.project`): get it → `project: {"id"}` or `null`.
2. Write `.hitl/.inbox/tickets-identity.json`
   `{"schema":"hitl.tickets-identity/1","server":"<server>","workspace":{"urlKey":"<site host>"},"team":{"id","key"}|null,"project":…}`
   and run `hitl-index tickets verify --in .hitl/.inbox/tickets-identity.json --json`. Keep the object: it also goes into
   the push results / remote file as `"identity"`.
3. Exit 4 / `ok: false` → refuse the whole run (nothing executed, nothing recorded). Print `❌ Jira identity mismatch`
   + one line per mismatch + the `fix` lines. With `--auto`: one line `⚠️ Jira: identity mismatch — /hitl:tickets push to see why`.
4. `status: learned` → print `💡 recorded <learned> in jira.map.json`. Auth/network error here → unreachable, not a mismatch.
