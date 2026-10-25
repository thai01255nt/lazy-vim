package acme

import acme.repo.UserRepo

/** Registers users. */
class AccountService(private val repo: UserRepo) {
    /**
     * Registers a user; rejects duplicate emails.
     * @task T-2 @impl agent @status skeleton @prio 1
     * @calls UserRepo.findByEmail
     * @concurrency async
     */
    suspend fun createUser(email: String): User {
        // TODO(impl): 1. normalize email
        TODO("TODO(impl): AccountService.createUser")
    }

    fun greeting(name: String) = "hello ${name.trim()} }"

    fun count(): Int {
        val s = """ { raw } """
        return repo.size()
    }

    companion object {
        fun create(repo: UserRepo): AccountService = AccountService(repo)
    }
}

data class User(val email: String)

/**
 * Formats an email for display.
 * @task T-2 @impl manual @status skeleton @prio 2
 */
fun formatEmail(email: String): String {
    TODO("TODO(impl): formatEmail")
}
