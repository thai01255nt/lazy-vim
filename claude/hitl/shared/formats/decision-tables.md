# Decision tables (DMN)

Source (reference only): OMG *Decision Model and Notation* 1.6 (latest formal version, checked 2026-10-27; 1.7 beta in
progress), chapter 8 decision tables and hit policies — https://www.omg.org/spec/DMN/. hitl keeps the tabular form, not DMN XML or FEEL.

## Template (inside a `### Rule:` block, business-readable)
```
### Rule: <KEY>-BR<n> <title>
<the policy in one sentence>

Hit policy: <U|A|P|F|R|O|C|C+|C<|C>|C#> (<name>)

| # | <input 1> (in) | <input 2> (in) | <output> (out) |
|---|---|---|---|
| 1 | <condition> | <condition> | <value> |
```
- **Input/output columns:** suffix `(in)` / `(out)`. Without any marker the last column is the output.
  The hit policy may also sit in the top-left header cell, as in DMN (`| U | age (in) | … |`).
- **Conditions:** a value, a list `gold, silver`, a comparison `< 50`, `≥ 30 min`, a range `[1..5]` / `(5..10]`, or
  `-` / `any` for "does not matter". Anything else is text (`not gold` is allowed; the CLI does not reason about it).
- **Hit policies** (DMN): `U` unique — rules never overlap (**default when unsure**); `A` any — overlaps must give the
  same output; `P` priority — highest-priority output wins; `F` first — first matching rule in order wins; `R` rule
  order — all matches, in rule order; `O` output order — all matches, by output priority; `C` collect — all matches,
  unordered, or aggregated with `C+` sum, `C<` min, `C>` max, `C#` count.

## Example
```
### Rule: ACC-BR1 Reset link validity
A reset link is valid for 30 minutes and for one use only.

Hit policy: U (unique)

| # | link age (in) | already used (in) | outcome (out) |
|---|---|---|---|
| 1 | ≤ 30 min | no | accept |
| 2 | ≤ 30 min | yes | reject "link already used" |
| 3 | > 30 min | any | reject "link expired" |
```

## Warnings
`DT_NO_HIT_POLICY` (none declared) · `DT_HIT_POLICY` (unknown letter) · `DT_COLUMNS` (unmarked columns when others are
marked; no input or no output) · `DT_ROW_CELLS` (cell count ≠ header) · `DT_NO_RULES` · `DT_OVERLAP` (two rules can
match the same input under `U`, or under `A` with different outputs; numeric intervals, lists and wildcards are compared,
other text only when identical — no false alarms on what it cannot read).
