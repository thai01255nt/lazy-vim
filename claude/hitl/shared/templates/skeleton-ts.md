# TS/JS skeleton patterns

Rules: every target symbol gets intent docstring + reserved tags + numbered `TODO(impl):` steps + the sentinel throw.
The sentinel text MUST start with `TODO(impl):` (the adapter detects `throw new Error("TODO(impl)…")`).
Tags go on their own lines, never mixed with `@param/@returns/@throws` (see `../tag-grammar.md`).

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
  // TODO(impl): 1. normalize email to lower case
  // TODO(impl): 2. throw DuplicateEmailError if UserRepo.findByEmail(email) returns a user
  // TODO(impl): 3. hash password, save, return user without passwordHash
  throw new Error("TODO(impl): UserService.createUser");
}
```
`@dec D-n` (optional, 0–3 per task): only on symbols that embody a planning decision whose *cost if wrong* matters.
Not hashed; adding it never needs re-approval.
Top-level function: same, `export function name(...)` / `export const name = (...) => { … }`.

## Modify an existing symbol (keep working code)
```ts
/**
 * Finds a user by email, case-insensitive.          ← updated intent
 * @task T-12 @impl manual @status skeleton @prio 2
 * @concurrency none
 */
findByEmail(email: string): User | undefined {
  // TODO(impl): 1. compare lower-cased emails
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
Title always starts with the AC id. Describe name = the covered symbol ref.

## After implementation (for reference)
`// TODO(impl): 1. x` becomes `// 1. x` and the sentinel is removed. Step comments stay so reviewers map the flow.
