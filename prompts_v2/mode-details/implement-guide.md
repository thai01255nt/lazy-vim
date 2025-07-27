# Implement Mode - Detailed Guide

## Purpose
Convert tasks/skeleton into working code. Method-by-method implementation with smart detection.

## Context Requirements
**MANDATORY:** Planning file + tasks + skeleton + 4 docs (BUSINESS-CONTEXT, ARCHITECTURE, CODEBASE-MAP, PATTERNS-CONVENTIONS)

## Process
1. **Auto-find planning files** → confirm with user → STOP
2. **Load context** → planning + tasks + skeleton + 4 docs
3. **Method discovery** → smart detection from tasks
4. **Method-by-method cycle:**
   - Show methods → user picks → STOP
   - Implement → show code → STOP for approval
   - "Next method? (Y/n/method-name)" → STOP
   - Repeat until done

### Context Discovery
**Auto-find:** Extract keywords → search `.claude/custom/planning/*.md` → rank relevance → confirm with user

**Confirmation Template:**
```
🔍 Found: feat-user-auth.md (95% match)
Methods: createUser(), validateSession(), updateProfile()
Use this file? (Y/n/other)
```

## Smart Method Detection

**Multi-Level Search:**
```
1. Exact Match → methodName() in class
2. Fuzzy Match → similar names  
3. Context Search → from tasks/planning
4. Pattern Match → similar functionality
5. Create New → if not found
```

**Method Selection:**
```
🎯 Available methods:
- [ ] createUser() → validation + database save
- [ ] updateUser() → data sanitization + update

Which method first? (createUser/updateUser)
```

**Method Confirmation:**
```
✅ Selected: createUser()
📋 Context: validation + database save
🔄 Dependencies: validateInput(), saveToDatabase()
Ready to implement? (Y/n)
```

## Implementation Cycle
1. **Show methods** → user picks → STOP
2. **Confirm method** → show details → STOP for approval  
3. **Implement** → complete method with quality standards
4. **Review** → show code → STOP for approval
5. **Next prompt**: "Method done. Continue? (Y/n/method-name)" → STOP
6. **Repeat** until done

**Next Method Template:**
```
✅ createUser() completed!
Next: (updateUser/deleteUser/stop)
```

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

## Quality Standards

**Implementation includes:**
- **Structure**: Input validation → business rules → processing → persistence → response
- **Error handling**: Try-catch with specific error types and logging
- **Security**: Input sanitization, rate limiting, audit logging
- **Performance**: Monitoring, async patterns, resource cleanup
- **Documentation**: Method docs, TODO priorities, dependency notes

**Code Pattern:**
```typescript
async methodName(input: Type): Promise<ReturnType> {
  try {
    // TODO: Input validation (HIGH)
    // TODO: Business rules (HIGH) 
    // REUSE: Found existing patterns
    // TODO: Persistence (MEDIUM)
    // TODO: Side effects (LOW)
    return result;
  } catch (error) {
    this.logger.error('Operation failed', { operation: 'methodName', error });
    throw new AppropriateError('Descriptive message');
  }
}
```

## Auto-Status Updates

**Tasks File Updates:**
```markdown
- [x] createUser() → COMPLETED
  - Quality: 95/100, Dependencies: PasswordHasher, EmailService
  - TODO methods: validateUserData(), checkUserExists(), sendWelcomeEmail()
```

**Planning File Updates:**
```markdown
## Implementation Progress
- UserService: 🟢 Complete (3/3 methods)
- Quality: 94/100 average, Performance: <100ms
- Next: AuthController
```

## Integration
- **Context**: Auto-find planning/tasks + 4 docs (BUSINESS-CONTEXT, ARCHITECTURE, CODEBASE-MAP, PATTERNS-CONVENTIONS)
- **Updates**: Auto-update task status and planning progress
- **Error handling**: Follow shared-patterns.md