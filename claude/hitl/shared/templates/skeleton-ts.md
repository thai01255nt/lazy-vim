# TS/JS skeleton patterns

Rules: every target symbol gets intent docstring + reserved tags + numbered `TODO(impl):` steps + the sentinel throw.
The sentinel text MUST start with `TODO(impl):` (the adapter detects `throw new Error("TODO(impl)…")`).
Tags go on their own lines, never mixed with `@param/@returns/@throws` (see `../tag-grammar.md`).
Step wording: each numbered step is a short intent label that says WHAT the block does (2-8 words, e.g.
`1. parse args`, `3. validate billing stream key type`), not pseudo-code that restates the line below it. It stays in
the code as the `n.` comment after implementation, so write it for a reader of the finished code. Add a short "why"
only when it is not obvious (`3. validate stream key type (before any write: no rollback)`). Rules, edge cases and
error behaviour belong in the intent docstring (the test-author's contract), not in the steps. No ids (`T-n`, `D-n`, spec
ids) in steps. Numbered step comments inside classes/enums are deleted after implementation (only function bodies
keep them).

## Method / function stub (exact shape)
```ts
/**
 * Registers a user; rejects duplicate emails (case-insensitive).
 * @param email - user email, any case
 * @returns the saved user (without passwordHash)
 * @throws DuplicateEmailError when the email already exists
 * @task T-12 @impl agent @status skeleton @prio 1
 * @dec D-1
 * @calls UserRepo.findByEmail, UserRepo.save
 * @concurrency none
 */
async createUser(email: string, password: string): Promise<User> {
  // TODO(impl): 1. normalize email
  // TODO(impl): 2. reject a duplicate email
  // TODO(impl): 3. save the user with a hashed password
  throw new Error("TODO(impl): UserService.createUser");
}
```
`@dec D-n` (optional, 0–3 per task): only on symbols that embody a design decision (change `design.md`, cited in the task's **Why**) whose *cost if wrong* matters.
Not hashed; adding it never needs re-approval.
Top-level function: same, `export function name(...)` / `export const name = (...) => { … }`.

## Modify an existing symbol (keep working code)
Rewrite the whole intent as one current contract; never append a sentence per task. Keep the intent to what this
symbol guarantees: an orchestrator lists the outcome order and names its callee or enum (`→ checkAlreadySettled`,
`statuses: SettleStatusEnum`) instead of re-explaining it. No ids in prose (`T-n`, `D-n`, spec or change ids): use `@dec`.
```ts
/**
 * Finds a user by email, case-insensitive.          ← updated intent
 * @task T-12 @impl manual @status skeleton @prio 2
 * @concurrency none
 */
findByEmail(email: string): User | undefined {
  // TODO(impl): 1. match email case-insensitively
  return this.users.find((u) => u.email === email);   // existing code stays
}
```
Add the sentinel only when the whole body will be rewritten. Omit `@calls` when there are none.

## New class holding stubs
```ts
/**
 * Application service for user registration.
 * @task T-12 @impl agent @status skeleton
 */
export class UserService {
  repo: UserRepo;
  constructor(repo: UserRepo) {
    this.repo = repo;
  }
  // …method stubs…
}
```
Prefer explicit fields + constructor assignment when the project runs with type stripping (no parameter properties, no enums).

## Types needed by signatures (full types, no sentinel)
```ts
/** Input for registration. */
export interface RegisterInput {
  email: string;
  password: string;
  // TODO(impl): define optional profile fields
}
```

## Test stubs (one per test-plan row; no assertions yet)
vitest / jest / node:test all support `it.todo`. Import from the project's framework (`vitest`, `node:test`; jest = globals).
```ts
import { describe, it } from "node:test";   // or "vitest"

describe("UserService.createUser", () => {
  /** @covers UserService.createUser @ac T-12.AC1 @kind example @origin skeleton */
  it.todo("T-12.AC1 rejects duplicate email in any case");

  /** @covers UserService.createUser @ac T-12.AC2 @kind property @origin skeleton */
  it.todo("T-12.AC2 returns saved user without passwordHash");
});
```
`@concurrency` ≠ none on a covered symbol → add one more stub with `@kind concurrency`:
```ts
  /** @covers Cache.getOrLoad @ac T-7.AC3 @kind concurrency @origin skeleton */
  it.todo("T-7.AC3 concurrent getOrLoad calls load once");
```
Title always starts with the AC id. Describe name = the seam from the Test plan row (usually the covered symbol ref).

## After implementation (for reference)
`// TODO(impl): 1. x` becomes `// 1. x` and the sentinel is removed. Step comments stay so reviewers map the flow.
