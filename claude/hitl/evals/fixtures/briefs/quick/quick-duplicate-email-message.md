# Duplicate email message Tasks

← Change: none | key: {KEY}

> status: draft

## {KEY}-T1 Say "email already registered" on a duplicate sign-up

- prio: P2 | risk: low | impl: agent | blocked-by: none | status: todo

**Why**: support tickets ask what "duplicate email" means; the new wording says what happened

### Acceptance criteria

- [ ] {KEY}-T1.AC1 Given an existing email in another case When createUser Then it throws "email already registered"
- [ ] {KEY}-T1.AC2 Given a new email When createUser Then the user is saved as before

### Symbols

1. [ ] `UserService.createUser` | modify | `src/services/userService.ts` | impl: agent | the duplicate error message text

### Test plan

| ac  | test                                          | kind    | oracle | seam                   | author      |
| --- | --------------------------------------------- | ------- | ------ | ---------------------- | ----------- |
| AC1 | new: the old "duplicate email" text is thrown | example | spec   | UserService.createUser | test-author |
| AC2 | none: unchanged path, the existing suite runs | —       | —      | —                      | —           |
