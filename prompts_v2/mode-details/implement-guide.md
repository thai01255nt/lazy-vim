# Implement Mode - Detailed Guide

## Purpose

Convert tasks/skeleton into working code. Method-by-method implementation with smart detection or quick implement for specific method.

## Process

1. Ask for `quick implement` or `mode-follow implement` (USP)
2. **If quick implement**: follow quick implement execution guide
3. **If mode-follow implement**: follow mode-flow implement execution guide

## Shared Execution

### Overview

Shared execution provides a common interface for all implementation types.

### Process Flow

1. **Auto-pattern detection**: using PATTERNS-CONVENTIONS.md, ARCHITECTURE.md, CODEBASE-MAP.md, to understand for similar patterns
2. **Auto detect priority**: base on context
3. **Generate component**: start first component base on priority, detect component exists or not
4. **If component exists**: Implement first method base on priority
5. **If component not exists**: Generate component then implement method
6. **Present result**: Show generated code and wait for user confirmation. (USP)
7. **If user confirm**: repeat process with next priority

## Quick Implement Execution

### Overview

Quick implement provides rapid method implementation for specific functions without full context loading. Best for single method fixes, small utilities, or when you know exactly what to implement.

### Context loading

- No need more context loading

## Mode-Flow Implement Execution

### Context loading

- Check for planning and tasks context
- If planning context not found: ask user for project description (USP) → auto-find planning file base on section [File manage patterns] of `core-rules` and ask user confirm (USP) → load planning context
- When planning context confirmed: auto load tasks context with same filename

## Smart Method Detection

**Multi-Level Search:**

```
1. Exact Match → methodName() in class
2. Fuzzy Match → similar names
3. Context Search → from tasks/planning (for `mode-flow type`) or from user description (for `quick type`)
4. Pattern Match → similar functionality
5. Create New → if not found
```

**Method Order Selection:**

- Auto order priority, list methods by priority. And ask to confirm start implement first method. (USP)

```
🎯 Available methods:
- [ ] createUser() → validation + database save
- [ ] updateUser() → data sanitization + update

Start implement createUser()? (Y/n)
```

## Implementation Cycle

1. **Show methods** → wait confirmation (USP)
2. **Implement** → complete method with quality standards
3. **Review** → show code → wait for approval (USP)
4. **Next prompt** (USP): "Method done. Continue? (Y/n/method-name)"
5. **Repeat** until done

## Implementation Strategy

**Method Implementation Pattern:**

```typescript
async createUser(userData: UserData): Promise<User> {
  // TODO: [UTILITY] validateUserData() - input validation (HIGH priority)
  await this.validateUserData(userData);

  // TODO: [SERVICE] checkUserExists() - duplicate prevention (HIGH)
  await this.checkUserExists(userData.email);

  // REUSE: Found PasswordHasher.hash() in security service
  const hashedPassword = await this.passwordHasher.hash(userData.password);

  // TODO: [REPOSITORY] saveUser() - transactional persistence (MEDIUM)
  const savedUser = await this.userRepository.saveUser({
    id: this.generateUserId(), // REUSE: ID generation pattern
    ...userData,
    password: hashedPassword,
    createdAt: new Date()
  });

  // TODO: [INTEGRATION] sendWelcomeEmail() - async notification (LOW)
  await this.emailService.sendWelcomeEmail(savedUser.email);

  return this.sanitizeUserForResponse(savedUser); // REUSE: sanitization pattern
}
```

## Auto-Status Updates

**Tasks File Updates:**

```markdown
- [x] createUser() → COMPLETED
  - Quality: 95/100, Dependencies: PasswordHasher, EmailService
  - TODO methods: validateUserData(), checkUserExists(), sendWelcomeEmail()
```

## Integration

- **Context**: 4 docs (BUSINESS-CONTEXT, ARCHITECTURE, CODEBASE-MAP, PATTERNS-CONVENTIONS), planning file and tasks file (for `mode-flow type`)
- **Updates**: Auto-update task status
