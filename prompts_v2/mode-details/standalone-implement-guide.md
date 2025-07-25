# Standalone-Implement Mode - Detailed Guide

## Purpose
Quick implementation of individual methods or components without full workflow context. Independent of planning/tasks workflow with smart pattern detection.

## Mode Detection
- `"standalone implement"` → general standalone implementation
- `"implement method [name]"` → specific method implementation
- `"quick implement"` → fast implementation mode
- `"fill method"` → complete method body implementation

## Context Requirements
**MINIMAL CONTEXT - Auto-Loading:**
- **Auto-load**: CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md (if available)
- **Auto-scan**: Project structure and existing patterns
- **No dependency**: On planning, tasks, or skeleton files
- **Fast detection**: Existing methods and architectural patterns

## Process
1. Auto-scan codebase for patterns and existing methods
2. Load available documentation (CODEBASE-MAP, PATTERNS-CONVENTIONS)
3. Apply smart method detection with fuzzy matching
4. Identify existing patterns and reusable utilities
5. Implement using established conventions and patterns
6. Generate tests and documentation following project standards

## Smart Pattern Detection

### Auto-Discovery Process
```
1. File Structure Analysis → Understand project organization
2. Import Analysis → Identify available libraries and utilities
3. Pattern Recognition → Detect common coding patterns
4. Existing Method Search → Find reusable functionality
5. Dependency Resolution → Identify required imports
```

### Intelligent Method Search

**Fuzzy Matching with Suggestions:**
```
❓ No exact match for "creatUser". Did you mean:
1. createUser() → UserService.ts:25 (95% match)
2. createNewUser() → AdminService.ts:40 (87% match)
3. updateUser() → UserService.ts:60 (related operation, 75% match)

Follow Universal Stop Protocol for pattern choice
```

**Pattern-Based Creation:**
```
🆕 Create "validateEmail()" method:
📍 Suggested location: ValidationUtils.ts (found similar validation methods)
📋 Pattern detected: Other validators return boolean, throw ValidationError
📊 Signature suggestion: validateEmail(email: string): boolean
✨ Dependencies found: EmailRegex constant, ValidationError class

Follow Universal Stop Protocol for creation choice
```

## Implementation Strategy

### Pattern-Based Implementation
```typescript
/**
 * Auto-generated method following detected patterns
 * Pattern source: ValidationUtils.validatePhone(), validateAddress()
 * Architecture: Utility pattern with error throwing
 */
validateEmail(email: string): boolean {
  // PATTERN: Input null check (found in 8 existing validation methods)
  if (!email || typeof email !== 'string') {
    throw new ValidationError('Email is required and must be a string');
  }

  // PATTERN: Trim and lowercase (found in EmailUtils patterns)
  const normalizedEmail = email.trim().toLowerCase();

  // REUSE: Found EMAIL_REGEX constant in constants/validation.ts
  const isValidFormat = EMAIL_REGEX.test(normalizedEmail);
  if (!isValidFormat) {
    throw new ValidationError('Invalid email format');
  }

  // PATTERN: Domain validation (found in existing email validators)
  // TODO: [UTILITY] Implement validateEmailDomain() - domain-specific validation
  // Purpose: Check against blocked domains, validate MX records
  // Pattern: Similar to validatePhoneDomain() in phone validation
  // Priority: MEDIUM - enhancement for production use
  this.validateEmailDomain(normalizedEmail);

  // PATTERN: Logging (found in other validation utilities)
  this.logger.debug('Email validation successful', {
    email: this.sanitizeEmailForLogging(normalizedEmail)
  });

  return true;
}
```

### Quick Method Implementation
```typescript
/**
 * Implements method following existing repository patterns
 * Pattern detected from: UserRepository, ProductRepository methods
 */
async findUserById(id: string): Promise<User | null> {
  // PATTERN: Input validation (found in all repository methods)
  if (!id || typeof id !== 'string') {
    throw new ValidationError('User ID is required and must be a string');
  }

  // PATTERN: ID format validation (found in existing ID validators)
  // REUSE: Found validateUUID() in utils/validation.ts
  if (!this.validateUUID(id)) {
    throw new ValidationError('Invalid user ID format');
  }

  try {
    // PATTERN: Database query with error handling (repository pattern)
    // REUSE: Found similar query pattern in UserRepository.findByEmail()
    const user = await this.database.query(
      'SELECT * FROM users WHERE id = ? AND deleted_at IS NULL',
      [id]
    );

    // PATTERN: Result processing (found in other find methods)
    if (!user || user.length === 0) {
      return null;
    }

    // REUSE: Found user transformation pattern in existing methods
    const transformedUser = this.transformDatabaseUserToEntity(user[0]);

    // PATTERN: Success logging (found in repository methods)
    this.logger.debug('User found successfully', { userId: id });

    return transformedUser;

  } catch (error) {
    // PATTERN: Error handling (consistent across repository layer)
    this.logger.error('Failed to find user by ID', {
      userId: id,
      error: error.message,
      operation: 'findUserById'
    });

    // PATTERN: Database error transformation (found in existing methods)
    if (error instanceof DatabaseConnectionError) {
      throw new ServiceUnavailableError('Database temporarily unavailable');
    }

    throw new InternalServerError('Failed to retrieve user');
  }
}
```

## Existing Code Integration

### Smart Import Resolution
```typescript
// AUTO-DETECTED imports based on usage patterns
import { ValidationError, ServiceUnavailableError } from "../errors";
import { Logger } from "../infrastructure/logging";
import { EMAIL_REGEX, UUID_REGEX } from "../constants/validation";
import { DatabaseService } from "../services/database";
import { validateUUID } from "../utils/validation";
import { sanitizeEmailForLogging } from "../utils/sanitization";
```

### Pattern Consistency Enforcement
```typescript
// Following detected constructor injection pattern
constructor(
  private readonly database: DatabaseService,    // Found in existing repositories
  private readonly logger: Logger,               // Found in all service classes
  private readonly validator: ValidationService  // Found in validation pattern
) {}

// Following detected method naming pattern
public async findUserById(id: string): Promise<User | null>        // Public query methods
private validateInputs(data: any): void                            // Private validation methods
private transformDatabaseResult(row: any): User                    // Private transformation methods
```

## Quality Assurance

### Automatic Quality Checks
```typescript
async processPayment(amount: number, method: string): Promise<PaymentResult> {
  // QUALITY: Performance monitoring (found in existing service methods)
  const startTime = performance.now();

  try {
    // QUALITY: Input validation following project standards
    this.validatePaymentInputs(amount, method);

    // QUALITY: Business logic with clear structure
    const processor = await this.getPaymentProcessor(method);
    const result = await processor.processPayment({ amount, method });

    // QUALITY: Success logging with metrics
    const duration = performance.now() - startTime;
    this.logger.info('Payment processed successfully', {
      amount,
      method,
      transactionId: result.transactionId,
      duration: `${duration}ms`
    });

    return result;

  } catch (error) {
    // QUALITY: Comprehensive error handling
    const duration = performance.now() - startTime;
    this.logger.error('Payment processing failed', {
      amount,
      method,
      duration: `${duration}ms`,
      error: error.message
    });

    // QUALITY: Error transformation following patterns
    if (error instanceof PaymentGatewayError) {
      throw new ServiceUnavailableError('Payment service temporarily unavailable');
    }

    throw new PaymentProcessingError('Payment failed', error);
  }
}
```

## Integration
- **Independence**: No planning/tasks workflow dependency
- **Context docs**: CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md only
- **Pattern detection**: Auto-detect existing patterns and reuse
- **Error handling**: Follow shared-patterns.md guidelines
- **Use cases**: Quick fixes, method completion, rapid prototyping