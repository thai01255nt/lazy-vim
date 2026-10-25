// Shared helper for P1 unit tests: builds a temp hitl project.
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";

export const REPO = `/** A user. */
export interface User { id: string; email: string }

export class UserRepo {
  users: User[] = [];
  /**
   * Finds a user by email.
   * @task T-1 @impl manual @status skeleton @prio 2
   */
  findByEmail(email: string): User | undefined {
    // TODO(impl): 1. compare lower-cased
    throw new Error("TODO(impl): UserRepo.findByEmail");
  }
  save(user: User): User { this.users.push(user); return user; }
}
`;
export const SVC = `import { UserRepo, type User } from "../repo/userRepo.ts";

export class UserService {
  repo: UserRepo;
  constructor(repo: UserRepo) { this.repo = repo; }
  /**
   * Registers a user.
   * @task T-1 @impl agent @status skeleton @prio 1
   * @calls UserRepo.findByEmail, UserRepo.save
   * @concurrency none
   */
  createUser(email: string): User {
    // TODO(impl): 1. reject duplicates
    throw new Error("TODO(impl): UserService.createUser");
  }
}
`;
export const CTRL = `import { UserService } from "../services/userService.ts";
/** Handles registration requests. */
export function register(svc: UserService, email: string) {
  return svc.createUser(email);
}
`;
export const TESTS = `import { describe, it } from "node:test";
describe("UserService.createUser", () => {
  /** @covers UserService.createUser @ac T-1.AC1 @kind example @origin skeleton */
  it.todo("T-1.AC1 rejects duplicate email");
});
`;
export const TASKS = `# Users Tasks
← Planning: .hitl/planning/feat-users.md
> status: approved

## T-1 Register user
- prio: P1 | risk: high (security) | impl: mixed | blocked-by: none | status: todo

### Acceptance criteria
- [ ] T-1.AC1 Given an existing email When createUser Then throws

### Symbols
1. [ ] \`UserService.createUser\` | modify | \`src/services/userService.ts\` | impl: agent | registers
2. [ ] \`UserRepo.findByEmail\` | modify | \`src/repo/userRepo.ts\` | impl: manual | lookup

### Test plan
| ac | kind | oracle | seam | author |
|----|------|--------|------|--------|
| AC1 | example | spec | UserService.createUser | test-author |
`;

export function makeProject(extra = {}) {
  const root = mkdtempSync(join(tmpdir(), "hitl-p1-"));
  const files = {
    ".hitl/hitl.config.json": JSON.stringify({ schema: "hitl.config/1", adapters: { ts: "ts-lite", py: "py-ast" } }),
    "src/repo/userRepo.ts": REPO, "src/services/userService.ts": SVC, "src/http/authController.ts": CTRL,
    "tests/userService.test.ts": TESTS, ".hitl/tasks/feat-users.md": TASKS, ...extra,
  };
  for (const [rel, text] of Object.entries(files)) write(root, rel, text);
  return root;
}
export function write(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
}
