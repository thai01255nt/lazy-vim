# GitHub — `pull [--relink]` (read-only)

1. Server pick and identity check (`references/common/connect.md` §1–§2); stop on none / missing / mismatch / unreachable.
2. List the issues of status `team` (`owner/repo`), state all, pull requests excluded (page size ≤ 50, follow
   pagination, max 5 pages); `"complete": true` only when every page was read.
3. Normalize to `{"schema":"hitl.tickets-remote/1","complete":bool,"issues":[{"id":"<REST id>","identifier":"#<n>","url",
   "title","description":"<body>","priority":<1–4 from the Priority field or a priority:* label, else omit>,
   "state":{"id":"open|closed:completed|closed:not_planned","name","type":"started|completed|canceled"},
   "labels":[{"id":"<name>","name"}],"assignee":"<login>"|null,"cycle":"<milestone title>"|null,"branchName":null,
   "updatedAt"}],"identity":<the common §2 object>}`. (`open` → type `started`: GitHub has no to-do / in-progress split;
   hitl compares state ids, so an open issue never shows drift.) Write `.hitl/.inbox/tickets-remote.json`.
4. `hitl-index tickets diff --in .hitl/.inbox/tickets-remote.json [--relink] --json`; print the items table
   `level | code | task | issue | field | local → remote` with the suggestion per code (SKILL.md §5), then
   `T-1: <state> · assignee <a> · milestone <m>` per task.
