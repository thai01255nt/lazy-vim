use std::collections::HashMap;

/// Stores users by email.
pub struct UserRepo {
    by_email: HashMap<String, User>,
}

#[derive(Clone, Debug)]
pub struct User {
    pub email: String,
}

impl UserRepo {
    /// Finds a user by email.
    /// @task T-4 @impl manual @status skeleton @prio 2
    pub fn find_by_email(&self, email: &str) -> Option<&User> {
        // TODO(impl): 1. lower-case
        todo!("TODO(impl): UserRepo::find_by_email")
    }

    /// Registers a user; rejects duplicates.
    /// @task T-4 @impl agent @status skeleton @prio 1
    /// @calls UserRepo.find_by_email
    pub fn create_user<'a>(&'a mut self, email: &str) -> Result<&'a User, String> {
        let s = r#"}"#;
        if self.find_by_email(email).is_some() { return Err(format!("dup {}", s)); }
        unimplemented!("TODO(impl): UserRepo::create_user")
    }
}

fn helper(x: char) -> bool {
    x == '}' || x == '{'
}

#[cfg(test)]
mod tests {
    use super::*;

    /// @covers UserRepo.create_user @ac T-4.AC1 @kind example @origin skeleton
    #[test]
    #[ignore]
    fn t4_ac1_rejects_duplicate() {
        todo!("TODO(test): T-4.AC1");
    }
}
