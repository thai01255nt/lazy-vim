<!-- audience: dev -->

# Design: Password reset by email

> change: feat-password-reset | status: draft | updated: 2026-11-19

## Context

- Sign-in is handled by the auth controller, which calls the user service (source: src/http/authController.ts)
- Users are stored in an in-memory repository with id and email; lookups compare the email exactly (source: src/repo/userRepo.ts)
- There is no mail sending in the code base yet (source: src/)
- Tests use node:test against the service with a hand-written fake repository (source: tests/userService.test.ts)

## Goals / Non-goals

- Goal: reset by email. Non-goal: reset by phone.

## Decisions

| id  | decision | why | alternatives | cost if wrong | serves | status |
| --- | -------- | --- | ------------ | ------------- | ------ | ------ |

## Components

## Contracts

## Test strategy

## Risks

## Open questions

## Changelog
