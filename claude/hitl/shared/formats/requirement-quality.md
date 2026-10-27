# Requirement quality and NFRs

Sources (references only): ISO/IEC/IEEE 29148:2018 *Requirements engineering* §5.2.5–5.2.7 (characteristics of
individual requirements, unbounded terms) — https://www.iso.org/standard/72089.html · INCOSE *Guide to Writing
Requirements* v4 (INCOSE-TP-2010-006-04, July 2023; characteristics of needs/requirements and writing rules) —
https://www.incose.org/publications/products/guide-to-writing-requirements · ISO/IEC 25010:2023 product quality model —
https://www.iso.org/standard/78176.html · Volere fit criterion (S. & J. Robertson, *Mastering the Requirements Process*) ·
EARS — https://alistairmavin.com/ears/.

## Characteristics (what a good requirement is)
Necessary · appropriate (right level) · unambiguous · complete · **singular** (one need) · feasible · **verifiable** ·
correct · **conforming** (follows this format). A set: complete, consistent, feasible, comprehensible, able to be validated.
The CLI checks only what a regex can see; the `hitl:spec-reviewer` lenses judge the rest.

## Template (EARS + one modal verb)
```
### Requirement: <KEY>-R<n> <title>
[While <state>,] [When <trigger>,] [If <unwanted condition>, then] the <actor/system> SHALL <observable response>.
Quality: <ISO 25010 characteristic>[ (<sub-characteristic>)]      ← NFR only
Fit: <measurable criterion: metric, threshold, how measured>       ← NFR only (Volere fit criterion)
```

## NFR = Quality + Fit
`Quality:` takes one ISO/IEC 25010:2023 characteristic: `functional-suitability`, `performance-efficiency`,
`compatibility`, `interaction-capability`, `reliability`, `security`, `maintainability`, `flexibility`, `safety`;
optionally a sub-characteristic in parentheses (e.g. `performance-efficiency (time behaviour)`, `security
(confidentiality)`, `interaction-capability (accessibility)`, `reliability (availability)`).
`Fit:` states how a tester decides pass/fail: a number with a unit and a measurement method, or a concrete check.

Example:
```
### Requirement: ORD-R2 Order page response time
While up to 500 customers use the shop at the same time, the system SHALL show the order page within 2 seconds for 95% of requests.
Quality: performance-efficiency (time behaviour)
Fit: 95th percentile page time ≤ 2 s in a 500-user load test
```

## Warnings (`spec validate`, ADDED/MODIFIED requirements of a change)
| code | heuristic | fix |
|---|---|---|
| `REQ_VAGUE` | a vague term (list below) in the statement | a number, a defined glossary term, or a reference |
| `REQ_COMPOUND` | ≥ 2 modal verbs (SHALL/MUST/SHOULD/MAY) or `and/or` / `và/hoặc` | split into singular requirements |
| `REQ_PASSIVE_NO_ACTOR` | `SHALL be <participle>` with no `by …` | name the actor: "the system SHALL send …" |
| `NFR_NO_FIT` | `Quality:` set, no digit in the statement and no `Fit:` line | add a measurable `Fit:` |

Vague terms (built-in, `scripts/lib/speclint.mjs`): EN fast, quick(ly), slow, efficient(ly), user-friendly, easy/easily,
simple, intuitive, flexible, robust, seamless(ly), appropriate, adequate, sufficient, reasonable, as needed/appropriate,
if/where possible, if necessary, etc., and so on, normally, usually, typically, optimal, optimized, minimize, maximize,
several, various, high performance, scalable, state-of-the-art, best, better, enough, approximately, TBD/TBC ·
VI nhanh, nhanh chóng, chậm, dễ dùng, dễ sử dụng, dễ dàng, thân thiện, tối ưu, linh hoạt, hiệu quả, đơn giản, trực quan,
phù hợp, hợp lý, v.v., vân vân, một số, mượt mà, thông thường, nếu có thể, khi cần.
Config (`.hitl/hitl.config.json`): `spec.qualityLint: "warn" | "off"`, `spec.vagueTerms: [...]` (replaces the list),
`spec.vagueTermsExtra: [...]` (adds to it). Matching is case-insensitive on whole words (Unicode-aware).
