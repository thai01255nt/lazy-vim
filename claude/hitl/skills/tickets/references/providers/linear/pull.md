# Linear — `pull [--relink]` (read-only)

1. Discover tools and pick the server (`connect.md` §1). None / pinned server missing → `⚠️ Linear MCP not connected` (or the `❌`
   message); stop. Identity check (`connect.md` §1b); mismatch → stop.
2. Team id from `hitl-index tickets status --json` → `teamId`; then list issues of that team (page size ≤ 50, include
   completed and canceled, follow the cursor, max 5 pages). Set `"complete": true` only when every page was read.
3. Normalize to `{"schema":"hitl.tickets-remote/1","complete":bool,"issues":[{"id","identifier","url","title",
   "description","priority","state":{"id","name","type"},"labels":[{"id","name"}],"assignee":"<name>"|null,
   "cycle":"<name>"|null,"branchName"|null,"updatedAt"}],"identity":<connect.md §1b object>}`; Write `.hitl/.inbox/tickets-remote.json`.
4. `hitl-index tickets diff --in .hitl/.inbox/tickets-remote.json [--relink] --json`. Print the items table
   `level | code | task | issue | field | local → remote`, then `T-1: <state> · assignee <a> · cycle <c>` per task.
   Suggestions only: `LINEAR_DONE_EARLY` → `run /hitl:review <T>, or reopen in Linear`; `LINEAR_DRIFT` →
   `hitl overwrites it on the next /hitl:tickets push` (title/description/priority/labels) or `kept in Linear` (state);
   `LINEAR_UNMAPPED` → `/hitl:tickets pull --relink`; `LINEAR_MISSING` → `issue deleted or moved? fix by hand`;
   `LINEAR_AMBIGUOUS` → `two issues claim this task (legacy markers from two repos?) — fix by hand`. `foreign > 0` →
   `ℹ️ <n> issue(s) of other repos in this team ignored` (their marker has another `repo=`).
5. Never edit tasks md, proposals or specs and never push during pull.
