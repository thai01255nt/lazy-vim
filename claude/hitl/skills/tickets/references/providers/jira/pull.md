# Jira — `pull [--relink]` (read-only)

1. Discover tools and pick the server (`connect.md` §1). None / pinned server missing → `⚠️ Jira MCP not connected`
   (or the `❌` message); stop. Identity check (`connect.md` §1b); mismatch → stop.
2. JQL `project = <KEY> ORDER BY updated DESC` with fields `summary, description, priority, status, labels, assignee,
   sprint` (page size ≤ 50, follow the page token, max 5 pages). `"complete": true` only when every page was read.
3. Normalize to `{"schema":"hitl.tickets-remote/1","complete":bool,"issues":[{"id","identifier":"<KEY-n>","url",
   "title":"<summary>","description":"<as markdown, as returned>","priority":<1–4 from jira.priorityNames / Highest…Low,
   0 when unknown>,"state":{"id":"<status id>","name","type":"<unstarted|started|completed|canceled>"},
   "labels":[{"id":"<name>","name"}],"assignee":"<display name>"|null,"cycle":"<sprint name>"|null,"branchName":null,
   "updatedAt"}],"identity":<connect.md §1b object>}`. State type from the status category (To Do → unstarted, In
   Progress → started, Done → completed; the status mapped as `canceled` in `jira.map.json` → canceled).
   Write `.hitl/.inbox/tickets-remote.json`.
4. `hitl-index tickets diff --in .hitl/.inbox/tickets-remote.json [--relink] --json`; print the items table
   `level | code | task | issue | field | local → remote` and `T-1: <state> · assignee <a> · sprint <c>` per task.
   Suggestions as in the Linear pull (codes `JIRA_DRIFT`, `JIRA_DONE_EARLY`, `JIRA_UNMAPPED`, `JIRA_MISSING`, `JIRA_AMBIGUOUS`).
5. Never edit tasks md, proposals or specs and never push during pull.
