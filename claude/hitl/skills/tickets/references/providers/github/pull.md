# GitHub — `pull [--relink]` (read-only)

1. Discover tools and pick the server (`connect.md` §1). None / pinned server missing → `⚠️ GitHub MCP not connected`
   (or the `❌` message); stop. Identity check (`connect.md` §1b); mismatch → stop.
2. List the repo's issues, state all, pull requests excluded (page size ≤ 50, follow pagination, max 5 pages);
   `"complete": true` only when every page was read.
3. Normalize to `{"schema":"hitl.tickets-remote/1","complete":bool,"issues":[{"id","identifier":"#<n>","url","title",
   "description":"<body>","priority":<1–4 from the Priority field or priority:* label, else omit>,
   "state":{"id":"open|closed:completed|closed:not_planned","name","type":"started|completed|canceled"},
   "labels":[{"id":"<name>","name"}],"assignee":"<login>"|null,"cycle":"<milestone title>"|null,"branchName":null,
   "updatedAt"}],"identity":<connect.md §1b object>}`. (`open` → type `started`: GitHub has no to-do/in-progress split;
   hitl compares state ids, so an open issue never shows drift.) Write `.hitl/.inbox/tickets-remote.json`.
4. `hitl-index tickets diff --in .hitl/.inbox/tickets-remote.json [--relink] --json`; print the items table and
   `T-1: <state> · assignee <a> · milestone <m>` per task (codes `GITHUB_DRIFT`, `GITHUB_DONE_EARLY`, `GITHUB_UNMAPPED`,
   `GITHUB_MISSING`, `GITHUB_AMBIGUOUS`; suggestions as in the Linear pull).
5. Never edit tasks md, proposals or specs and never push during pull.
