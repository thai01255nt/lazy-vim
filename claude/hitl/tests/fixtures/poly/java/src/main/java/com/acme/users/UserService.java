package com.acme.users;

import java.util.Map;
import java.util.HashMap;

/** Registers and looks up users. */
public class UserService {
    private final UserRepo repo;
    private final Map<String, String> cache = new HashMap<>();

    public UserService(UserRepo repo) {
        this.repo = repo;
    }

    /**
     * Registers a user; rejects duplicate emails (case-insensitive).
     * @param email user email, any case
     * @task T-1 @impl agent @status skeleton @prio 1
     * @calls UserRepo.findByEmail, UserRepo.save
     * @concurrency none
     */
    @Override
    public User createUser(String email) throws DuplicateEmailException {
        // TODO(impl): 1. reject duplicates
        // TODO(impl): 2. save
        throw new UnsupportedOperationException("TODO(impl): UserService.createUser");
    }

    /** Counts users. "quoted { brace" */
    public int count() {
        String s = "}"; /* } */ char c = '{';
        return repo.size();
    }

    private static <T> java.util.List<T> listOf(T a) {
        return java.util.List.of(a);
    }

    /** Nested type. */
    public static class Stats {
        int total() { return 0; }
    }
}
