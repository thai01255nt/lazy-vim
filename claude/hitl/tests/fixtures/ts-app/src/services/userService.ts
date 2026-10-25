import { UserRepo, type User } from "../repo/userRepo.ts";

export class UserService {
  repo: UserRepo;

  constructor(repo: UserRepo) {
    this.repo = repo;
  }

  /**
   * Registers a user; rejects duplicate emails (case-insensitive).
   * @param email - user email, any case
   * @param passwordHash - already hashed password
   * @returns the saved user
   * @throws Error "duplicate" when the email already exists
   * @task T-1 @impl agent @status skeleton @prio 1
   * @dec D-1
   * @calls UserRepo.findByEmail, UserRepo.save
   * @concurrency none
   */
  createUser(email: string, passwordHash: string): User {
    // TODO(impl): 1. reject with Error("duplicate email") when this.repo.findByEmail(email) returns a user
    // TODO(impl): 2. save and return the new user with a generated id
    throw new Error("TODO(impl): UserService.createUser");
  }
}
