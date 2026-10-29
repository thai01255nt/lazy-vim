# Jira — `init [--relink]` (`/hitl:tickets init`, only when the user typed it)

1. Server (`references/common/connect.md` §1, `--init`):
   - `none` → print `❌ Atlassian MCP not found. Install it: claude mcp add --transport http atlassian
     https://mcp.atlassian.com/v1/mcp, run /mcp to authenticate, then /hitl:tickets init`. Stop.
   - `pick` → ⛔ GATE table `# | server | site` (site from `getAccessibleAtlassianResources`), END TURN; on reply save it.
2. Site (cloudId + host) and the visible projects. ⛔ GATE: table of projects (key, name, type) and the choices with
   defaults: project (💡 the only one, else none preselected) · a change becomes: `one epic per change` 💡 /
   `existing epic <key>` (all issues under it) / `parent-issue per change` / `none` · issue type for tasks (💡 `Task`;
   list the project's types; a team-managed project may call epics differently — use the type whose hierarchy level
   is 1) · label groups risk + impl 💡 (phase labels off 💡). Jira labels need no creation. END TURN.
3. On reply: `hitl-index init --set jira.enabled=true --set jira.team=<KEY> --set jira.changeAs=<epic|parent-issue|none>
   --set jira.issueType=<type> --set jira.epicType=<epic type>` + `--set 'jira.project={"id":"<id>","name":"<KEY-n>"}'`
   for an existing epic, else `--set jira.project=null` (+ label switches as chosen). hitl never edits an existing epic.
4. Statuses: the project's workflow statuses (from an issue's transitions or the project's status list). Pick one per
   type by **status category**: `unstarted` = first "To Do" category status, `started` = first "In Progress",
   `completed` = first "Done"; `review` = an In-Progress-category status matching `/review/i` (or `jira.stateNames.review`);
   `backlog` = a To-Do status named `/backlog/i`, else null; `canceled` = a Done-category status matching
   `/cancel|won.?t|reject|declin/i` (or `jira.stateNames.canceled`), else null (hitl then cannot cancel removed tasks).
   Ids are **status ids** (transitions are resolved per issue at push time).
5. Priorities: when the site's priority names differ from Highest/High/Medium/Low, record `--set
   'jira.priorityNames={"1":"<p0>","2":"<p1>","3":"<p2>","4":"<p3>"}'` (ask in the step-2 gate when unsure).
6. Labels: `{"risk:high":"risk:high", …}` (name → name) for every enabled hitl label (`${CLAUDE_SKILL_DIR}/references/labels.md`).
7. Write `.hitl/.inbox/tickets-init.json`
   `{"schema":"hitl.tickets-results/1","kind":"init","relink":<true only with --relink>,"init":{"workspace":{"urlKey":"<site host>"},
   "team":{"key":"<KEY>","id":"<project id>","name"},"project":{"id","name","url"}|null,"states":{"backlog":{"id","name"}|null,…},
   "labels":{…}}}` → `hitl-index tickets record --in .hitl/.inbox/tickets-init.json --json`. Exit 4 → print the message: wrong server picked
   (fix `jira.server`) or the repo really moves (`/hitl:tickets init --relink`; clears the old task mappings). Never add `relink` without the flag.
8. Print `✅ Jira linked: <site>/<KEY> via <server> · epic <per change|KEY-n> · statuses … · labels …`, the
   commit hint (`jira.map.json` + `hitl.config.json` per repo), and 💡 keep Jira automation that closes issues on PR
   merge off, or accept that a merge after `/hitl:approve … done` marks them Done. 🎯 next: `/hitl:tickets push`.
