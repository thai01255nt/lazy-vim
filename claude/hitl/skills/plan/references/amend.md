# Amend mode (`/hitl:plan <change-id> amend [N-k]`, `/hitl:design <change-id> amend [N-k]`)

Read by `/hitl:plan` §7 and `/hitl:design` §7 (design applies its own differences listed there). A change to the
approved spec (or design) of an active change: `${CLAUDE_PLUGIN_ROOT}/shared/amend-spec.md` (route, chat gate, amend
brief, the status rule) and `${CLAUDE_PLUGIN_ROOT}/shared/task-changes.md` (the amend task set).
1. Load the change, `hitl-index spec show --change <id> --json`, `hitl-index trace <id> --json`. Proposal still draft →
   `_Info:_ Spec is draft; editing normally.` and use the plan brief (plan §4). An open amend brief
   (`hitl-index brief <id> --kind amend --json`) → continue it (amend-spec.md §4.2–§4.4): text after `amend` and a
   new `N-k` go into the Notes of its open round.
2. The amendment: with `N-k`, that note (`hitl-index note show --change <id> N-k --json`); no `N-k` → the text after
   `amend`, else the open spec notes (`hitl-index note list --change <id> --json`): all of them as `--from` when they
   belong together, else ask which in one chat line (GATE, END THE TURN). A note from another change
   (`source: <other>`) is amended the same way; after its approval the change still waits until `<other>` is archived
   (other-changes.md §5) — say so in the `_Next:_` line.
3. Route (amend-spec.md §1): propose the classes, then `hitl-index amend start <id> [--from N-k,…] [--refs …]
   [--impact …] --json`:
   - `chat · gate` → the chat gate of amend-spec.md §2 (delta preview, Impact block, `Apply? (Y/n/edit)`).
   - `chat · tasks-update` → `_Info:_ only tasks change` and invoke the Skill `hitl:tasks` with `<id> update <what>`.
   - `chat · mini-change` (archived change) → amend-spec.md §6.
   - `brief` → amend-spec.md §4.1 with `--skill plan` (the amend brief, round 1). END THE TURN.
4. Later runs (`/hitl:plan <id> amend`, or `/hitl:plan <id>` while the amend brief is open): amend-spec.md §4.2–§4.4
   (rounds, Close with the amend task set, the approval and its `_Next:_` lines).
