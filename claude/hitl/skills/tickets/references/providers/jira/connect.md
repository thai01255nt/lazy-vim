# Jira — tools and identity (with `references/common/connect.md`)

- Tool pattern: `mcp__<server>__…` where `<server>` contains `atlassian` or `jira` (case-insensitive). One server = one
  OAuth = one Atlassian site. Deferred → `ToolSearch` `+atlassian jira issue`, `+atlassian transition`.
- `legacy`: the candidate whose visible projects contain the project with id status `teamId`.
- Most calls need the site's `cloudId` (`getAccessibleAtlassianResources`): get it once, keep it for the run.

| capability | candidates (first that exists) |
|---|---|
| site / cloudId | `getAccessibleAtlassianResources` |
| list projects | `getVisibleJiraProjects` |
| issue types | `getJiraProjectIssueTypesMetadata` |
| create / edit issue | `createJiraIssue` / `editJiraIssue` |
| get / search issues | `getJiraIssue` / `searchJiraIssuesUsingJql` |
| transitions | `getTransitionsForJiraIssue` + `transitionJiraIssue` |
| link issues | `createJiraIssueLink`, `linkJiraIssues` (none → manual note, see `push-ops.md`) |
| comment | `addCommentToJiraIssue` |

Identity (common §2 step 1): `workspace.urlKey` = the site host from `getAccessibleAtlassianResources` (`url` →
`<name>.atlassian.net`). `team` = the project whose **id** is status `teamId`, from list projects →
`{"id":"<numeric project id>","key":"<KEY>"}` (absent → `null`). `project` (status `project.id` set: a pinned epic) =
get that issue → `{"id":"<numeric issue id>"}`, not found → `null`.
