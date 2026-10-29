# Jira — `pull [--relink]` (read-only)

1. Pick the server and verify the identity (`references/common/connect.md` §1–§2); stop on none / missing / mismatch / unreachable.
2. JQL `project = <KEY> ORDER BY updated DESC` with fields `summary, description, priority, status, labels, assignee,
   sprint` (`<KEY>` = status `team`; page size ≤ 50, follow the page token, max 5 pages). `"complete": true` only when every page was read.
3. Normalize to `{"schema":"hitl.tickets-remote/1","complete":bool,"issues":[{"id","identifier":"<KEY-n>","url",
   "title":"<summary>","description":"<as markdown, as returned>","priority":<1–4 from jira.priorityNames / Highest…Low,
   0 when unknown>,"state":{"id":"<status id>","name","type":"<unstarted|started|completed|canceled>"},
   "labels":[{"id":"<name>","name"}],"assignee":"<display name>"|null,"cycle":"<sprint name>"|null,"branchName":null,
   "updatedAt"}],"identity":<the common §2 object>}`. State type from the status category (To Do → unstarted, In
   Progress → started, Done → completed; the status mapped as `canceled` in `jira.map.json` → canceled).
   Write `.hitl/.inbox/tickets-remote.json`.
4. `hitl-index tickets diff --in .hitl/.inbox/tickets-remote.json [--relink] --json`; print the items table
   `level | code | task | issue | field | local → remote` with the suggestion per code (SKILL.md §5), then
   `T-1: <state> · assignee <a> · sprint <c>` per task.
