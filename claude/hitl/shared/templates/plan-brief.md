<!-- hitl brief file. Answer on the `>` line under each question (more lines are fine), save, then run the command in
     the `next:` line. Y = take the 💡 recommendation · ? or "don't know" = Claude recommends and asks again · a question
     or a doubt instead of an answer = Claude answers it here (💬) and asks again · deep <ID|topic> = dig deeper ·
     done = stop asking. Vietnamese works too: được / đồng ý / ừ · không biết / chưa biết · xong.
     Notes (the last block of each round): anything the questions missed, or a change to an earlier answer
     ("Q5: …" / "sửa Q5: …"). Description is read once, at the first run; after that new information goes into the
     Notes of the open round. Lines that start with → or 💬 are Claude's; leave them as they are. -->
# Plan brief — {change-id}
> change: {change-id} | key: {KEY} | kind: plan | status: open | round: 1 | updated: {YYYY-MM-DD}
> next: answer the `>` lines, then run /hitl:plan {change-id}

## Description
{the user's description, verbatim. Extend it freely before the first /hitl:plan {change-id} run; after that, write new
information in the Notes of the open round.}

## Round 1
{🔗 parent / 🔎 may overlap / 💡 Assumed lines, if any — one per line, before the questions}

### Q0 Change id and key: `{change-id}` / `{KEY}` — keep?
Every id of this change starts with the key ({KEY}-R1, {KEY}-T1). A new id or key is possible only now.
💡 Recommended: keep `{change-id}` / `{KEY}`.
>

### Q1 [R] What problem does this solve, and for whom?
_e.g. "accountants retype the order list into a spreadsheet every month; it takes them a day"_
>

### Q2 [R] What starts it, and what is the result? (the main flow, step by step)
_e.g. "an admin picks a month and clicks Export; a file with one line per order is downloaded"_
>

### Q3 [R] Who may do this, and who must not?
_e.g. "accountants and admins; warehouse staff must not see prices"_
>

### Q4 [R] Which business data is involved, and what happens to it over time (created, changed, kept, deleted)?
_e.g. "orders of the chosen month; nothing is changed; the file is not kept"_
>

### Q5 [R] Which rules and limits apply? Give the numbers.
_e.g. "at most 12 months per file; cancelled orders are left out"_
>

### Q6 [R] What can go wrong, and what must happen then? (invalid input, duplicates, already done, two people at once)
_e.g. "no orders in the month → an empty file with the header line, not an error"_
>

### Q7 [R] Which other systems or people must be told or asked?
_e.g. "none" or "finance gets an email when a file is made"_
>

### Q8 [R] Which quality needs matter here? Give numbers. (speed, availability, privacy, security, accessibility)
_e.g. "the file is ready in under 10 seconds for 50 000 orders; only the person who asked can download it"_
>

### Q9 [R] What is out of scope?
_e.g. "no Excel format; no scheduled exports"_
>

### Q10 [R] How will you know it worked? (a measurable outcome)
_e.g. "month-end closing takes half a day instead of two"_
>

<!-- Q11–Q15: tailored questions from the description and the scout facts: current behaviour to keep or change [R],
     a word that clashes with the glossary or the code [T], a possible overlap with another active change [R]. -->

### Notes — anything the questions missed, or a change to an earlier answer
>
