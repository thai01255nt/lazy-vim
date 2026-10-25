export interface User {
  id: string;
  email: string;
  passwordHash: string;
}

export class UserRepo {
  users: User[] = [];

  /**
   * Finds a user by email, case-insensitive.
   * @param email - email in any case
   * @returns the stored user, or undefined when none matches
   * @task T-1 @impl manual @status skeleton @prio 2
   * @concurrency none
   */
  findByEmail(email: string): User | undefined {
    // TODO(impl): 1. lower-case the wanted email
    // TODO(impl): 2. return the first stored user whose email matches case-insensitively
    throw new Error("TODO(impl): UserRepo.findByEmail");
  }

  save(user: User): User {
    this.users.push(user);
    return user;
  }
}
