import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { UserRepo } from "../src/repo/userRepo.ts";
import { UserService } from "../src/services/userService.ts";

describe("UserService.createUser", () => {
  /** @covers UserService.createUser, UserRepo.findByEmail @ac T-1.AC1 @kind example @origin test-author */
  it("T-1.AC1 rejects duplicate email in any case", () => {
    const repo = new UserRepo();
    repo.save({ id: "u1", email: "A@x.io", passwordHash: "h" });
    const svc = new UserService(repo);
    assert.throws(() => svc.createUser("a@x.io", "h2"), /duplicate/);
  });

  /** @covers UserService.createUser @ac T-1.AC2 @kind example @origin test-author */
  it("T-1.AC2 returns the saved user", () => {
    const repo = new UserRepo();
    const svc = new UserService(repo);
    const user = svc.createUser("new@x.io", "h3");
    assert.equal(user.email, "new@x.io");
    assert.equal(repo.users.length, 1);
  });
});
