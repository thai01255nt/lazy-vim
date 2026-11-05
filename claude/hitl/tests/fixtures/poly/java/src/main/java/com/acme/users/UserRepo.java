package com.acme.users;

/** Storage for users. */
public interface UserRepo {
    /**
     * Finds a user by email.
     * @task QT-T1 @impl manual @status skeleton @prio 2
     */
    User findByEmail(String email);

    User save(User user);

    int size();
}
