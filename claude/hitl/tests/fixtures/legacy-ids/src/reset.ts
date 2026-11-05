/**
 * Sends a reset link to a registered email; an unknown email gets the same answer.
 * @task T-12 @impl agent @status skeleton @prio 1
 * @dec D-1
 * @calls hashToken
 */
export function requestReset(email: string): boolean {
  // TODO(impl T-12): 1. find the account by the lower-cased email
  // TODO(impl T-12): 2. store the hashed token and send the link
  throw new Error("TODO(impl T-12): requestReset");
}

/**
 * Hashes a reset token so the plain token is never stored.
 * @task T-12 @impl agent @status skeleton @prio 2 @dec D-1
 */
export function hashToken(token: string): string {
  // TODO(impl): 1. sha-256 of the token
  throw new Error("TODO(impl): hashToken");
}

/**
 * Sets a new password for the account a valid link belongs to.
 * @task T-13 @impl agent @status skeleton @prio 1
 */
export function setPassword(link: string, password: string): void {
  // TODO(impl T-13): 1. check the link is valid and unused
  throw new Error("TODO(impl): setPassword");
}
