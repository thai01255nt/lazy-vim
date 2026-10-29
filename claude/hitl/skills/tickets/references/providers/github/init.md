# GitHub — `init [--relink]` (`/hitl:tickets init`, only when the user typed it)

1. Discover tools (`connect.md` §1) and run `hitl-index tickets server <server>… --init --json`.
   - `none` → `❌ GitHub MCP not found. Install it: claude mcp add --transport http github https://api.githubcopilot.com/mcp/,
     run /mcp to authenticate, then /hitl:tickets init`. Stop.
   - `use` → keep it · `save` → `hitl-index init --set github.server=<server>` · `pick` → ⛔ GATE `# | server | account`, END TURN.
2. Repository: 💡 this repo's `origin` (`git remote get-url origin` → `owner/repo`); read it (id, issues enabled?).
   Issues disabled → `❌ issues are disabled on <owner/repo>` and stop. ⛔ GATE: repo (💡 origin) · a change becomes:
   `one milestone per change` 💡 / `existing milestone <pick: open milestones>` / `parent-issue per change` (sub-issues)
   / `none` · label groups risk + impl 💡 (phase off 💡) · priority: issue field `Priority` 💡 when the org defines it,
   else `priority labels` / `none`. END TURN.
3. On reply: `hitl-index init --set github.enabled=true --set github.team=<owner/repo> --set github.changeAs=<milestone|parent-issue|none>`
   + `--set 'github.project={"id":"<milestone number>","name":"<title>"}'` for an existing milestone, else
   `--set github.project=null` (+ `--set github.priorityLabels=true` / label switches as chosen).
4. States (fixed, no listing): `{"backlog":null,"unstarted":{"id":"open","name":"Open"},"started":{"id":"open","name":"Open"},
   "review":null,"completed":{"id":"closed:completed","name":"Closed"},"canceled":{"id":"closed:not_planned","name":"Closed as not planned"}}`.
   The hitl phase is visible through the `hitl:*` labels (turn phase labels on for a useful board).
5. Labels: list the repo's labels; create the missing enabled hitl labels with the colors and descriptions of
   `${CLAUDE_SKILL_DIR}/references/labels.md` (`label_write`, else `gh label create <name> --color <hex without #> --description …`).
   Denied → print the table for the user to create (repo → Issues → Labels) and END TURN. Map `{name: name}`.
6. Write `.hitl/.inbox/tickets-init.json`
   `{"schema":"hitl.tickets-results/1","kind":"init","relink":<true only with --relink>,"init":{"workspace":{"urlKey":"<owner>"},
   "team":{"key":"<owner/repo>","id":"<repo id>","name":"<owner/repo>"},"project":{"id","name","url"}|null,"states":{…step 4…},
   "labels":{…}}}` → `hitl-index tickets record --in .hitl/.inbox/tickets-init.json --json`. Exit 4 → as Linear init.md step 6.
7. Print `✅ GitHub linked: <owner/repo> via <server> · milestone <per change|title> · labels …`, the commit hint
   (`github.map.json` + `hitl.config.json`), and 💡 `Fixes #n` in a PR closes the issue on merge — hitl uses `Part of #n`
   until the task is verified. 🎯 next: `/hitl:tickets push`.
