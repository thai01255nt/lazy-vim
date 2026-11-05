package com.acme.users;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

class UserServiceTest {
    /** @covers UserService.createUser @ac QT-T1.AC1 @kind example @origin skeleton */
    @Test
    @Disabled("TODO(test): QT-T1.AC1")
    void t1Ac1RejectsDuplicateEmail() {
    }

    @Test
    void countsUsers() {
        new UserService(null).count();
    }
}
