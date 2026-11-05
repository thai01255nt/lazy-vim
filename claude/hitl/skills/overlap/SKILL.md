---
name: overlap
description: Checks whether one active hitl change overlaps (chồng lấn) other active changes — a deterministic pass first (shared ids, rules, contracts, terms, symbols, files, drift), then one fresh-context judge over the whole cluster that must quote a Given/When/Then witness from each change, then one gate per finding (adjust one side · both sides via notes · not an overlap). Use for "check overlap between feat-a and feat-b", "do these changes conflict", "kiểm tra chồng lấn", "hai change có đụng nhau không", or after merging a branch that brought in other changes. Not for new work (/hitl:go), a task id or status (/hitl:flow), or an archived change.
argument-hint: "<change-id> [<other-id> …] | <change-id> --with <id>[,<id>…]"
allowed-tools: Agent Bash(hitl-index *) Bash(node *hitl-index.mjs *)
---

# /hitl:overlap — does this change collide with other active changes?

Follow `${CLAUDE_PLUGIN_ROOT}/shared/conventions.md` (gates, ids with titles, the user's language). The rules for notes
between changes are `${CLAUDE_PLUGIN_ROOT}/shared/other-changes.md` §3–§6 (you apply them; you do not need to read it
unless a reply asks about waiting or ordering). **This skill writes no file.** Only the CLI writes, and only after the
user's answer at the gate: `hitl-index note add … --source …` for "both sides". Never read code or spec files yourself:
the CLI and the judge do.

Arguments: `$ARGUMENTS` = `<A> [<B> <C> …]` or `<A> --with B,C` (the same thing). No targets = A against every other
active change.

## 1. Guards
- No argument → `hitl-index change --json`; ⛔ GATE `Check which change for overlap? (1/2/…)` listing the active
  changes (id + title), END THE TURN. No active change → `✅ No active changes to compare.` Stop.
- A task id (`PWR-T3`), a status or what-next question → `🎯 next: /hitl:flow <the same words>` and one line why. Stop.
- New work described instead of a change id → `🎯 next: /hitl:go <description>`. Stop.

## 2. Deterministic pass (no LLM)
`hitl-index overlap <A> [--with <B,C>] --json`.
- Exit 3 → per conventions (`/hitl:setup`). Exit 1 (unknown or archived change, A named as its own target) → `🛑 <the
  CLI message>`; an archived change → add `its spec is living now; compare the active ones`. Stop.
- Print, one line per candidate (ids with titles):
  - `parent: true` → `🔗 parent <P> — shared: <evidence refs (titles)>` (`none found yet` when its evidence is empty);
  - else `🔎 <A> may overlap <P>: <evidence refs (titles)>`;
  - and, when its `code` section has entries, `   🧩 code: shared symbols … · files … · drift <symbol> (<what changed>)`.
- No candidate with `evidence` or `code` entries (none at all, or only 🔗 parents with nothing shared) →
  `✅ <A>: no overlap with <targets joined by ", ">` (`targets` from the JSON; empty → `✅ <A>: no overlap (no other
  active change)`). Stop: no judge, no gate.
  The judged candidates (§3) are the ones with evidence or code.

## 3. One deep judge (fresh context)
Spawn **one** `hitl:spec-reviewer` (Agent tool, `subagent_type: hitl:spec-reviewer`) for the whole cluster, never one
per pair, and wait. Prompt:
```
Mode: overlap. Change: <A>. Targets: <the candidate ids, joined by ", ">.
Overlap: hitl-index overlap <A> --with <candidate ids joined by ,> --json
Output: .hitl/.inbox/overlap-review.json   CLI: <hitl-index | node …/hitl-index.mjs>
```
Then `hitl-index overlap <A> --with <candidate ids> --review --json` (it checks every finding against the changes' own
text, drops the ones without a witness quoting each change they name, and removes the verdict file).
- Exit 1 (no verdict, bad JSON) or the agent failed → `⚠️ The overlap judge gave no usable verdict.` + the 🔎 lines
  above stand as evidence only; `🎯 next: /hitl:overlap <A> <targets>` to retry. Stop.
- `findings` empty → `✅ <A>: evidence with <targets> but no conflict with a witness` (+ one `💡 dropped O-n: <reason>`
  line per `dropped` entry). Stop.

## 4. ⛔ GATE (one line per finding)
```
📋 /hitl:overlap <A> — <n> finding(s) with <targets>
<findings[].line, one per finding, exactly as the CLI printed it>
💡 dropped O-3: witness quote not found in feat-report        (only when `dropped` is non-empty)
Reply per finding: "1 2, 2 3" (finding 1 → both sides, finding 2 → not an overlap) · "1 1 <change>" adjust that change
instead · "1 2 <change>" that change goes first (the others get the notes) · ? to explain
```
Each line reads `⚠️ <n>. <changes> — <witness> → 1. adjust <one side> · 2. both sides (📥 source notes into the affected
change(s), which then wait until the other is archived) · 3. not an overlap`. Restate a witness in plain words only
when the user asks (`?`). END THE TURN.

## 5. On the answer (per finding; a finding not answered is skipped and listed as open)
- **1. adjust one side** → write nothing; print `🎯 next: <findings[].amend>` (`/hitl:plan <change> amend`, or
  `/hitl:design <change> amend` when the finding is about a decision or contract) with the witness as the reason. A
  `1 <change>` reply names the other side: the same command for that change. Never run the amend yourself.
- **2. both sides** → for each entry of `findings[].notes`, run its `command` (`hitl-index note add --change <affected>
  --source <other> --kind spec|design --refs … --text "…" --from "/hitl:overlap <A>"`; you may reword `--text` into the
  affected change's words, keep it plain business language) and print the CLI's `📌`/`⏳` lines. With `2 <change>`
  that change is the source: build the same commands with the other changes as `--change` and their own `refs`. The
  0.12 rules apply as they are: the affected change waits (no task approval, implement or archive) until the source is
  archived, then takes the notes in with `/hitl:plan <id> amend N-k`; a CLI refusal (`--source` archived, unknown ref) →
  print it and go on with the next finding.
- **3. not an overlap** → write nothing.
End with one summary line (`📥 notes: … · 🎯 amends: … · ✅ not overlaps: …`) and one `🎯 next:` (the first amend, else
`/hitl:flow`).

## Rules
- Only the `hitl-index` commands above; one judge per run; no file reads or writes of your own.
- Never decide an order: a recommendation is shown at the gate, the user's answer decides (other-changes.md).
- A note from this skill never goes into a change the user did not answer `2` for.
