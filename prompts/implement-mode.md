# Mode: Implement

## Purpose

Convert skeleton code and task specifications into working business logic implementation. Requires comprehensive context from planning, tasks, and skeleton workflow.

## Mode Detection

- `"implement"` → standard implementation mode
- `"implement [component]"` → focused component implementation
- `"implement [method]"` → specific method implementation

## Context Requirements

**MANDATORY CONTEXT - All Required:**

- **Planning file**: Architecture decisions and component purposes
- **Tasks file**: Method specifications and business requirements
- **Skeleton code**: TODO structure and method signatures
- **All 4 docs**: BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md

## Process

1. Load comprehensive context (planning + tasks + skeleton + docs)
2. Analyze skeleton structure and TODO comments
3. Review task specifications for business logic requirements
4. Apply smart method detection with confirmation
5. Implement methods with quality standards
6. Auto-update status in tasks and planning files

## Smart Method Detection

### Multi-Level Search Strategy

```
Level 1: Exact Match → Find methodName() in specific class
Level 2: Fuzzy Match → Similar names (createUser vs createNewUser)
Level 3: Context Search → Methods from tasks/planning context
Level 4: Pattern Match → Methods with similar functionality
Level 5: Create New → Offer creation if not found
```

### Enhanced Confirmation Flow

**Single Method Found:**

```
✅ Found: `createUser()` in UserService (src/services/UserService.ts:25)
📋 Context: From tasks - "validation + database save"
🔄 Dependencies: Uses validateInput(), saveToDatabase()
📊 Quality: 3 TODO comments, 5 reuse methods needed
Implement this method? (Y/n/show code/batch with related)
```

**Multiple Methods Found:**

```
🔍 Multiple matches for "createUser":
1. UserService.createUser() → user registration (from tasks)
2. AdminService.createUser() → admin user creation
3. TestHelper.createUser() → test data generation

Choose: 1-3, 'all' for batch, 'related' for component batch, or 'cancel'
```

**Batch Implementation Option:**

```
🎯 Related methods in UserService found from tasks:
- [ ] createUser() → validation + database save
- [ ] updateUser() → data sanitization + update
- [ ] deleteUser() → soft delete logic

Implement: 'all', '1,3', 'one-by-one', or 'cancel'?
```

## Implementation Strategy

### Comprehensive Method Implementation

```typescript
/**
 * Creates a new user with comprehensive validation and security measures
 * Implementation follows: Planning architecture + Tasks specifications + Quality standards
 */
async createUser(userData: UserData): Promise<User> {
  // 1. Input validation (following quality framework)
  // TODO: [UTILITY] Implement validateUserData() - comprehensive input validation
  // Purpose: Validate email format, password strength, required fields
  // Context: From tasks - security requirement for user registration
  // Priority: HIGH - blocks user creation, security critical
  await this.validateUserData(userData);

  // 2. Business rule validation (from planning context)
  // TODO: [SERVICE] Implement checkUserExists() - duplicate prevention
  // Purpose: Prevent duplicate user registration per business rules
  // Context: From planning - "unique user constraint in authentication system"
  // Priority: HIGH - core business rule validation
  await this.checkUserExists(userData.email);

  // 3. Data processing (reusing existing patterns)
  // REUSE: Found PasswordHasher.hash() in security service
  const hashedPassword = await this.passwordHasher.hash(userData.password);

  // 4. Entity creation (following domain patterns)
  const userEntity = {
    id: this.generateUserId(), // REUSE: Found ID generation pattern
    ...userData,
    password: hashedPassword,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  // 5. Persistence with transaction (from architecture patterns)
  // TODO: [REPOSITORY] Implement saveUser() - transactional user persistence
  // Purpose: Save user data with ACID properties and rollback capability
  // Context: From architecture - "database operations must be transactional"
  // Priority: MEDIUM - can be stubbed for testing initially
  const savedUser = await this.userRepository.saveUser(userEntity);

  // 6. Side effects (from tasks specifications)
  // TODO: [INTEGRATION] Implement sendWelcomeEmail() - user onboarding
  // Purpose: Send welcome email as part of registration flow
  // Context: From tasks - "send welcome email after successful registration"
  // Priority: LOW - can be async/queued, not blocking
  await this.emailService.sendWelcomeEmail(savedUser.email);

  // 7. Response preparation (following API patterns)
  // REUSE: Found user sanitization pattern in existing endpoints
  return this.sanitizeUserForResponse(savedUser);
}
```

### Reuse Method Creation

```typescript
/**
 * [AUTO-GENERATED REUSE METHOD]
 * TODO: [UTILITY] Implement validateUserData()
 * Purpose: Comprehensive user data validation with security checks
 * Context: Called from createUser() - validate email, password, required fields
 * Priority: HIGH - security requirement, prevents invalid data processing
 * Dependencies: Email validation library, password complexity rules
 *
 * @param userData - User data to validate
 * @returns Promise<boolean> - true if valid, throws ValidationError if invalid
 * @throws {ValidationError} When validation fails with specific field details
 */
private async validateUserData(userData: UserData): Promise<boolean> {
  // TODO: Validate email format using existing EmailValidator pattern
  // TODO: Check password meets complexity requirements from config
  // TODO: Verify all required fields are present and non-empty
  // TODO: Validate business rules (age restrictions, terms acceptance)
  // TODO: Scan for potentially malicious input (XSS, injection attempts)

  throw new Error('Method not implemented - validateUserData()');
}
```

## Quality Standards Implementation

### Code Structure Excellence

```typescript
async createUser(userData: UserData): Promise<User> {
  const startTime = performance.now(); // Performance monitoring

  try {
    // 1. Input validation layer
    await this.validateAndSanitizeInput(userData);

    // 2. Business rule enforcement layer
    await this.enforceBusinessRules(userData);

    // 3. Data processing layer
    const processedData = await this.processUserData(userData);

    // 4. Persistence layer with transaction
    const savedUser = await this.persistUserWithTransaction(processedData);

    // 5. Side effects and notifications
    await this.triggerPostCreationActions(savedUser);

    // 6. Response preparation
    const response = this.formatUserResponse(savedUser);

    // Performance and audit logging
    const duration = performance.now() - startTime;
    this.logger.info('User created successfully', {
      userId: savedUser.id,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString()
    });

    return response;

  } catch (error) {
    // Comprehensive error handling
    this.logger.error('User creation failed', {
      operation: 'createUser',
      userData: this.sanitizeForLogging(userData),
      error: {
        name: error.constructor.name,
        message: error.message,
        stack: error.stack
      },
      duration: `${performance.now() - startTime}ms`
    });

    // Error transformation
    if (error instanceof ValidationError) {
      throw new BadRequestError('Invalid user data', error.details);
    }

    if (error instanceof BusinessRuleError) {
      throw new ConflictError('Registration violates business rules', {
        rule: error.ruleName
      });
    }

    throw new InternalServerError('User creation failed');
  }
}
```

### Security Implementation Standards

```typescript
async createUser(userData: UserData): Promise<User> {
  // Security: Input sanitization
  const sanitizedData = this.securitySanitizer.sanitizeUserInput(userData);

  // Security: Rate limiting check
  await this.rateLimiter.checkRegistrationRate(
    this.getCurrentClientIP(),
    this.getCurrentUserId()
  );

  // Security: Comprehensive validation
  await this.securityValidator.validateUserData(sanitizedData, {
    checkEmailDomain: true,
    validatePasswordComplexity: true,
    scanForMaliciousContent: true,
    verifyInputEncoding: true
  });

  // Security: Audit logging
  await this.auditLogger.logUserRegistration({
    email: sanitizedData.email,
    ipAddress: this.getCurrentClientIP(),
    userAgent: this.getCurrentUserAgent(),
    timestamp: new Date(),
    sessionId: this.getCurrentSessionId()
  });

  // Implementation continues with secure patterns...
}
```

## Auto-Status Updates

### Tasks File Updates

After implementation completion, automatically update:

```markdown
## UserService Methods

**Target**: `src/services/UserService.ts`

- [x] createUser() → validation + database save ← AUTO-UPDATED: COMPLETED
  - **Implementation Date**: 2024-01-15 15:30
  - **Quality Score**: 95/100 (comprehensive error handling, security validated)
  - **Performance**: 85ms average response time
  - **Dependencies**: PasswordHasher, EmailService, UserRepository
  - **TODO Methods Created**: validateUserData(), checkUserExists(), sendWelcomeEmail()
  - **Tests**: Unit tests added, integration tests pending
  - **Security**: Input validation, rate limiting, audit logging implemented
```

### Planning File Updates

```markdown
# User Authentication Planning

## Implementation Progress ← AUTO-UPDATED

- **UserService**: 🟢 Complete (3/3 methods implemented)
- **Quality Score**: 94/100 average across all methods
- **Performance**: All methods under 100ms target
- **Security**: Comprehensive validation and audit logging
- **Next Component**: AuthController (dependencies ready)
```

## Error Handling

- Missing context files → Load available, note limitations in implementation
- Method not found → Offer creation with smart location suggestions
- Implementation failures → Log details, preserve partial implementation
- Dependency conflicts → Create TODO with resolution guidance

## Integration

- Updates tasks file with completion status and quality metrics
- Updates planning file with component progress
- Triggers review mode suggestions when component complete
- Maintains context for cross-component dependency resolution
- Preserves implementation patterns for consistency across project

