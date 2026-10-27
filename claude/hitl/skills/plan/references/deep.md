# `deep <ID|topic>` — technique menu (`/hitl:plan`)

Own text; technique ideas cited in `elicitation.md` (NOTICE.md). Read when the user replies `deep …`.

Reply `deep ACC-R7` (or `deep refunds`) at any round gate. Answer with a numbered menu as the next gate:
```
🔎 deep ACC-R7 Deactivate a user — pick a technique (number, or "Y" for 💡):
1. Example mapping — rules → concrete examples → questions        → #### Scenario blocks
2. Five whys — dig to the real need behind it                       → ## Why / requirement wording
3. Edge cases / what-if — invalid, duplicate, timing, partial failure → failure scenarios
4. Pre-mortem — "it shipped and failed: why?"                       → new requirements, NFR, out of scope
5. Business rule → decision table — conditions × outcome             → <KEY>-BR<n> + table, Rules: link
6. Stakeholder lenses — BA · PO · ops/support · security · end user  → missing requirements per lens
💡 Recommended: 1 (the rule has no examples yet)
```
END THE TURN. On the pick, run it as one round (≤ 7 questions, recommendations as usual) and **write the results
straight into the delta or proposal** (ids from `hitl-index spec next-id`):
1. **Example mapping** — list the rules of the item (yellow), 2–4 examples each (green) as candidate scenarios with
   concrete values, open questions (red) as questions. Accepted examples → `#### Scenario` blocks; red →
   `[NEEDS CLARIFICATION]` or answered.
2. **Five whys** — ask "why" up to five times from the stated feature to the business need; rewrite `## Why` and the
   requirement statement when the real need differs; a discovered need → new `[R]`.
3. **Edge cases / what-if** — per scenario: empty/invalid input, duplicate, already in the target state, two people at
   once, the other party unavailable, undo. Accepted → failure/edge scenarios.
4. **Pre-mortem** — "six months later this change failed": the user picks the likely causes; each becomes a
   requirement, an NFR (`Quality:`), a success criterion or an explicit out-of-scope line.
5. **Business rule → decision table** — name the conditions and the outcome, fill the table (hit policy: first),
   write `### Rule: <KEY>-BR<n>` with the table and link it with `Rules:` from the requirements.
6. **Stakeholder lenses** — one question per lens (BA: consistency with other capabilities; PO: value and scope;
   ops/support: how they see and fix problems; security: abuse and data exposure; end user: what they see and feel).
After it, recompute coverage and return to the normal frontier.
