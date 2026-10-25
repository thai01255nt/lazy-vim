import { UserService } from "../services/userService.ts";
import type { User } from "../repo/userRepo.ts";

/**
 * Handles registration requests.
 */
export function register(svc: UserService, body: { email: string; password: string }): User {
  return svc.createUser(body.email, "hash:" + body.password);
}
