# Other active changes (0.12): prerequisite changes, owner check, overlaps

Used by `/hitl:go`, `/hitl:plan`, `/hitl:design`, `/hitl:implement`, `/hitl:review` and `/hitl:overlap`. One rule drives everything:
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
**Parents first (0.13.1).** A parent of B is an active change P that holds notes from B (`source: B`; B was created
`--before P`, or an earlier owner check wrote one): `hitl-index overlap B --json` marks it `parent: true` and lists it
even with no evidence. Plan round 1 prints one line per parent, before the questions:
`🔗 parent <P> — shared: <evidence refs (titles)>` (no evidence → `shared: none found yet`). The owner check then works
through this concrete list (the refs named there first), every round, instead of relying on memory. Design close does
the same for new `contract` or `file` evidence against a parent (a `design` note in P, below).

For each behaviour you are about to record in B, ask whose WHAT it is:
- B's own behaviour, or a change to a **living** requirement (in `.hitl/specs/`) → B's delta, as usual.
- A change to something an active parent P owns (P's ADDED or MODIFIED blocks, P's decisions, P's task ACs) → never in
  B's delta (B cannot modify a requirement that is not living yet). Draft it in P's words and ask in the round gate:
  `📥 For <P>: <what changes, plain words> · refs <P's ids (titles)> → note in <P>? (Y/n/edit)`.
  Y → `hitl-index note add --change P --source B --kind spec|design --refs <P's ids> --text "<what P must change and
  why, B's behaviour in plain words>" --from "/hitl:plan B"` (`design` for a contract or decision of P). The text may
  end with `Proposed for <P>:` and the requirement as P should read it. Print its `📥` line.
- B never edits P's files. The note reaches P only through the CLI.

## 4. Overlap with active changes B is not linked to (with or without `--before`)
This applies to every active change B holds no notes from and that holds none from B (`linked: false`), whether or not
B itself was created with `--before`: B made `--before A` is linked to A (A is a parent, §3) but not to C, so C is
checked here. Changes B already waits for (`waitsFor: true`) need nothing more.
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
  same witness rule and the same gate (against a parent: the 🔗 line and the owner check of §3).
- After design nothing special runs: a later collision in code is handled by the normal task flow and drift. To check
  on demand (another change moved on, a branch with other changes was merged, or before archiving), run
  `/hitl:overlap B [<P> …]` (§6).

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

## 6. On demand: `/hitl:overlap <A> [<B> <C> …]` (0.13.1)
Compares one active change with several (`--with B,C`; no targets = every other active change) at any phase, e.g.
after a branch merge brought in other changes, or when two changes moved on since their plans. Deterministic first
(`hitl-index overlap A --with B,C --json`, with a `code` section: symbols and files both changes' tasks name, drift on
A's locked symbols in the other's files); no evidence → `✅` and nothing else. Else one `hitl:spec-reviewer` judges A
and all candidates as one cluster (a Given/When/Then witness quoting each change, or the finding is dropped) and one ⛔
gate line per finding: `1. adjust <one side>` (→ `/hitl:plan <id> amend`) · `2. both sides` (§3 notes into the
affected change(s) with `--source`, which then wait, §5) · `3. not an overlap` (nothing written).
