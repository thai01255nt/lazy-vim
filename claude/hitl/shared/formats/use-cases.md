# Use cases (`### Flow:`)

Source (reference only): Alistair Cockburn, *Writing Effective Use Cases* (Addison-Wesley, 2001) — the "fully dressed"
template (primary actor, scope, level, stakeholders and interests, preconditions, minimal and success guarantees,
trigger, main success scenario, extensions). hitl uses a lite subset and keeps it business-readable.

## Template (fully dressed, lite)
```
### Flow: <KEY>-UC<n> <goal as an active verb phrase>
Primary actor: <role> · Scope: <capability or system> · Level: user goal | summary | subfunction
Stakeholders: <who cares and why>                     (optional)
Preconditions: <what is already true>                  (or "none")
Trigger: <what starts it>
Success guarantee: <what is true when the goal is met>
Minimal guarantee: <what is true even on failure>      (optional)
Main success scenario:
1. <actor> <does something>.
2. The system <responds> (<REQ-ID>).
Extensions:
2a. <condition>: <what happens>; <ends | continues at step n>.
*a. <condition at any step>: <what happens>.
```
- One goal per use case, written from the actor's view, no UI or code detail ("the user confirms", not "clicks the
  blue button"). Steps reference requirement/scenario ids where they apply; extensions `<step><letter>` refer to an
  existing main step (`*a` = any step).
- Casual form (v0.6.0) stays valid: `Actor: … · Goal: … · Trigger: …` + numbered steps.

## Example
```
### Flow: ACC-UC1 Recover access
Primary actor: registered user · Scope: accounts · Level: user goal
Trigger: the user forgot their password
Preconditions: none
Success guarantee: the user can sign in with the new password; the link no longer works
Main success scenario:
1. The user asks for a reset with their email.
2. The system sends a reset link (ACC-R5).
3. The user opens the link and sets a new password (ACC-R6).
Extensions:
2a. Unknown email: the system shows the same confirmation and sends nothing (ACC-R5.S2).
```

## Warnings
`UC_NO_ACTOR` · `UC_NO_STEPS` (no numbered main steps) · `UC_EXT_REF` (extension on a step that does not exist) ·
`UC_NO_GUARANTEE` (a `Primary actor:` use case without `Success guarantee:`).
