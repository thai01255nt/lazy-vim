# GitHub — connect: tool discovery, server pick and identity check (`/hitl:tickets` init, push, pull)

Read by SKILL.md before the first GitHub call of `init`, `push` and `pull`. `status` never needs it.

## 1. Discover the GitHub MCP tools (runtime, never hardcoded)
Details and the payload → parameter mapping: `mcp.md` (this folder).
- Look for tools `mcp__*github*__*`; deferred → `ToolSearch` (`+github issue`).
- **Pick the server**: `hitl-index tickets server <server>… --json` (`--init` during init). `use` → only that server ·
  `missing` → `❌ <message>`, push → fail-open SKILL.md §4 step 5, pull → stop · `none` → init: init.md step 1, push:
  fail-open `GitHub MCP not connected` (the `gh` fallback alone is not enough for a push: it needs the MCP identity),
  pull: stop · `save` / `pick` → init.md step 1 · `legacy` → the server that can read the mapped repository.
- Capabilities → **first existing** tool:

  | capability | candidates |
  |---|---|
  | who am I | `get_me` |
  | create / update issue | `issue_write` (method create/update), else `create_issue` + `update_issue` |
  | get / list issues | `issue_read`, `get_issue` / `list_issues`, `search_issues` |
  | labels | `list_label`, `get_label` (creating labels: `label_write` when present, else `gh label create`) |
  | sub-issues | `sub_issue_write`, `add_sub_issue` |
  | comment | `add_issue_comment` |
  | milestones, dependencies, issue fields | `gh api` (see `mcp.md` §2) |

## 1b. Identity check (before every push and pull, also with `--auto`)
1. `get_me` (or the repo read) → the account; the mapped repository (`hitl-index tickets status --json` → `team` =
   `owner/repo`, `teamId` = its id): read it → `team: {"id": "<repo node id or id as mapped>", "key": "<owner/repo>"}`,
   absent → `null`; `workspace: {"urlKey": "<owner>"}`. Pinned milestone (`github.project`): read it → `project: {"id"}` or `null`.
2. Write `.hitl/.inbox/tickets-identity.json`
   `{"schema":"hitl.tickets-identity/1","server":"<server>","workspace":{"urlKey":"<owner>"},"team":{"id","key"}|null,"project":…}`
   → `hitl-index tickets verify --in .hitl/.inbox/tickets-identity.json --json`; keep the object for the results file.
3. Exit 4 / `ok: false` → refuse the run; print `❌ GitHub identity mismatch` + mismatches + `fix`. `--auto`: one line.
4. Using `gh` in this run: `gh auth status` must show the same host and an account with access to `owner/repo`;
   otherwise do not use `gh` (report the capability as skipped).
