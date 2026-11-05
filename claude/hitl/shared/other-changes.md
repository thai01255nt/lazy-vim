# Other active changes (0.12): prerequisite changes, owner check, overlaps

Used by `/hitl:go`, `/hitl:plan`, `/hitl:design`, `/hitl:implement` and `/hitl:review`. One rule drives everything:
**a note in change A with `source: B` blocks all of A until B is archived.** The notes in A are the only source of
truth (the CLI computes the block from the folders; nothing else is synced). Who goes first and what runs in parallel
is the user's call: never decide an order yourself, never write a note into another change without the user's typed
`--before` or Y.

## 1. Out of scope → a prerequisite change (the main path)
In A's plan, design, implement or review, when the user or you spot work outside A's scope:
- **Small** (still A's WHAT: a behaviour of A's own requirements, one task at most) → amend A
  (`/hitl:plan A amend`, `/hitl:design A amend`) or a 📌 note (conventions.md).
- **Big** (needs its own spec; new behaviour A's proposal does not name; more than 1 task; another capability) → print
  `💡 Out of scope for A: <X> — big enough for its own change → /hitl:go <X> --before A` and carry on with A.
  Never start it yourself. Several parents: `--before A,C` (or `--before A --before C`).

## 2. Creating B with `--before` (in `/hitl:plan`)
Right after B's proposal is written (§1 of plan):
- Add `| before: A, C` to B's proposal meta line. It is display only: it never blocks anything.
- For each parent P (the user typed `--before`, so no extra gate):
  `hitl-index note add --change P --source B --kind order --text "<B's title>: P waits until B is archived." --from "/hitl:plan B --before P"`
  and print its `⏳` line. P not found → `❌ <P>: no active change`, skip it. P archived → `💡 <P> is archived: nothing
  waits`, skip it.

## 3. Owner check (B's plan and design brainstorm)
For each behaviour you are about to record in B, ask whose WHAT it is:
- B's own behaviour, or a change to a **living** requirement (in `.hitl/specs/`) → B's delta, as usual.
- A change to something an active parent P owns (P's ADDED or MODIFIED blocks, P's decisions, P's task ACs) → never in
  B's delta (B cannot modify a requirement that is not living yet). Draft it in P's words and ask in the round gate:
  `📥 For <P>: <what changes, plain words> · refs <P's ids (titles)> → note in <P>? (Y/n/edit)`.
  Y → `hitl-index note add --change P --source B --kind spec|design --refs <P's ids> --text "<what P must change and
  why, B's behaviour in plain words>" --from "/hitl:plan B"` (`design` for a contract or decision of P). The text may
  end with `Proposed for <P>:` and the requirement as P should read it. Print its `📥` line.
- B never edits P's files. The note reaches P only through the CLI.

## 4. Accidental overlap (B was not created with `--before`)
- **plan §3**, after the scout: `hitl-index overlap B --json`. Each candidate with `shared: true` and `linked: false`
  → one round-1 line `🔎 may overlap <P>: <evidence refs (titles)>`, and a `[R]` question when the evidence names
  behaviour (same-id, ac-ref, rule-ref, term). Capability-only candidates: the info line only.
- **plan §6 close**: the spec-reviewer gets the candidates (its prompt line `Overlap: hitl-index overlap B --json`).
  It judges each candidate as a cluster and must quote a witness (one Given/When/Then run where B's text and P's text
  disagree or chain). One gate line per finding:
  `⚠️ Overlap with <P> — <witness> → 1. adjust <B> only · 2. both sides: <B>'s delta + 📥 note in <P> (<P> then waits
  until <B> is archived) · 3. not an overlap`.
  2 → the §3 note(s) into P with `--source B`. 3 → one line in B's proposal `## Assumptions`
  (`Checked against <P>: no overlap`). Nothing else is recorded.
- **design close**: `hitl-index overlap B --json` again; judge only the new `contract` and `file` evidence with the
  same witness rule and the same gate.
- After design nothing special runs: a later collision in code is handled by the normal task flow and drift.

## 5. A's side (deterministic, no LLM)
- `hitl-index status --brief` and `hitl-index change A --json` (`wait`) show `⏳ A waits for B (N-1)` and, once B is
  archived, `📥 A must take in N-3 from B first → /hitl:plan A amend N-3`.
- While A waits: every task approval (skeleton, tests, done; `--ack` and `--force` do not help), implement (the hook
  denies the implementer's edits) and A's archive are refused. A's plan, design, tasks and amends stay open: take in
  B's spec notes early with `/hitl:plan A amend N-k` (or `/hitl:design A amend N-k`).
- B archived → the wait lifts by itself. Open spec/design notes from B still block all of A: amend (Impact, recheck,
  the human's `/hitl:approve A reopen`) or the human dismisses them. B's `order` notes clear by themselves.
- B gone (deleted or abandoned) → A stays blocked: amend back what A took in, then the human types
  `/hitl:approve A dismiss N-k <reason>` for each note from B.
- The human may dismiss a note from B at any time: the user decides the order, the tool never does.
