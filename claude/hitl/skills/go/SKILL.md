---
name: go
description: One entry point for new work in a hitl project — reads a plain description of something to build, fix or change, picks the route with a read-only subagent (note or amend of an active change, tasks update, /hitl:tdd, /hitl:tasks quick, /hitl:plan) and runs it; "--plan", "--quick", "--tdd" pick it yourself; "--before <change-id>" plans a prerequisite change that change waits for. Use when the user describes new work without naming a command, e.g. "users should be able to export to CSV", "the total is off by one cent", "thêm chức năng…", "sửa lỗi…", "làm việc mới". Not for explicit "plan/spec …", "TDD this", "tasks quick …", a task id, status/what next (/hitl:flow), or checking overlap between existing changes (/hitl:overlap).
argument-hint: "<description> [--plan|--quick|--tdd] [--before <change-id>[,…]]"
allowed-tools: Agent Skill Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:go — one entry point for new work

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md`. Reply in the user's language. This skill reads no code and
writes no file: the router decides, the skill it hands over to does the work and gathers its own context.

Status summary (injected):
!`node ${CLAUDE_PLUGIN_ROOT}/scripts/hitl-index.mjs status --brief --soft`

Arguments: `$ARGUMENTS` = `<description> [--plan|--quick|--tdd] [--before <change-id>[,…]]` (the flags anywhere;
`--before` is repeatable: `--before A --before C` = `--before A,C`).

**`--before <ids>`** (0.12) = this work is a prerequisite change that those changes wait for
(`${CLAUDE_PLUGIN_ROOT}/shared/other-changes.md`). It always takes the plan route: no router, print
`_Route:_ /hitl:plan — prerequisite of <ids>` and invoke the Skill `hitl:plan` with `<description> --before <ids joined by ,>`.
With `--quick` or `--tdd` → GATE `--before needs its own change: 1. _Rec:_ plan it (--plan) · 2. drop --before`
END THE TURN. Reply 2 → the chosen `--quick` / `--tdd` runs as in §2, without `--before`.

## 1. Guards
- Status summary says "not initialized" → `❌ HITL not initialized here. _Next:_ /hitl:setup`. Stop.
- No description (empty, or a flag alone) and none earlier in this conversation → GATE
  `What do you want to build, fix or change? One or two sentences. (Add --plan, --quick or --tdd to pick the route.)`
  END THE TURN.
- A task id (`PWR-T12`), a status or what-next question, or `help` → invoke the Skill `hitl:flow` with the same arguments
  and stop.

## 2. Manual mode (a flag)
One route flag (`--plan`, `--quick`, `--tdd`; `--before` implies `--plan` and, together with `--plan`, still counts as one) → no router. Print `_Route:_ <command> — <the flag> chosen` and invoke the Skill in this turn:

| flag | Skill | args |
|---|---|---|
| `--plan` | `hitl:plan` | `<description>` |
| `--quick` | `hitl:tasks` | `quick <description>` |
| `--tdd` | `hitl:tdd` | `<description>` |

Two or more flags → GATE `Pick one: 1. --plan · 2. --quick · 3. --tdd` (`_Rec:_` on the heaviest given) END THE TURN.

## 3. Auto mode (no flag)
1. Spawn one `hitl:work-router` (Agent tool, `subagent_type: hitl:work-router`) and wait. Prompt:
   ```
   Description: <verbatim>
   Language: <vi|en>   Final: no
   Conversation facts: <≤ 3 lines the user already said here that bear on the route, or "none">
   Answers: none
   Output: .hitl/.inbox/route.json   CLI: <hitl-index | node …/hitl-index.mjs>
   ```
   Never read code, specs or docs yourself, and never write the verdict: that is the router's job.
2. `hitl-index route --json` (reads the verdict, checks it against the active changes, removes the file). Exit 1 →
   `⚠️ The router gave no usable verdict.` and take `/hitl:plan <description>` (the safest route).
3. Act on `.action`. Print `.line` first (the reason is already in the user's language) and every `.hints[]` restated
   in the user's language. No `Go?` question: the route is decided.
   - `invoke` → invoke the Skill `.skill` with args `.args` in this same turn.
   - `note` → the note gate of conventions "Edits to approved behaviour stated in chat": one line on what you understood, then `.gate`.
     END THE TURN. Y → `hitl-index note add --change <.change.id> --kind <.noteKind> --refs <ids of .refs>
     --text "<.summary>" --from "user, during /hitl:go"`, print its `_Note N-k_` line and `_Next:_` its apply command.
     n → `_Next:_ /hitl:go <description> --plan` (a separate change).
   - `ask` → GATE: one sentence on why the route is unclear, then `.questions` as `**Q1** …` (≤ 3, goal and scope
     only, each keeps its `_Rec:_`), then `Reply: e.g. "y" (all recommendations) or "Q2: …"`. END THE TURN.
4. After the answers (one round only):
   - The answers settle it alone (the user names a route, or says "quick fix" / "a real feature" / "test-first") →
     manual mode (§2) with `<description> — <answers>`.
   - Else spawn the router once more with `Answers: <the answers>` and `Final: yes`, then `hitl-index route --final
     --json` (questions are dropped) and step 3. Never a second question round.

## Rules
- One _Route:_ line, then the next skill runs in the same turn. Its gates are the next stop (`/hitl:plan` stops after it
  writes the brief file `.hitl/changes/<id>/plan-brief.md` that the user answers in the editor).
- An id always with its title (`feat-password-reset (Password reset by email)`, `ACC-R3.S2 (Reset link expires)`).
- Explicit asks skip this skill: "plan …" → `/hitl:plan`, "TDD this" → `/hitl:tdd`, "tasks quick …" → `/hitl:tasks`,
  "check overlap / chồng lấn between <changes>" → `/hitl:overlap`.
