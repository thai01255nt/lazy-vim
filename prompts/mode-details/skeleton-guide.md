# Skeleton Mode - Detailed Guide

## Purpose
Generate code structure and implementation framework from task specifications. Always operates in dual mode, never standalone.

## Mode Operation
**DUAL MODE ONLY**: Never runs independently
- With tasks: `"tasks skeleton"` → tasks + skeleton dual
- With planning triple: `"planning skeleton"` → planning + tasks + skeleton triple
- Always inherits context from parent mode

## Process
1. Inherit context from tasks or planning triple mode
2. Load: PATTERNS-CONVENTIONS.md for code style
3. Analyze task specifications for method signatures
4. Generate skeleton: classes, methods, interfaces with TODOs
5. Update task references with skeleton file locations
6. Apply coding patterns from existing codebase

## Skeleton Generation

### Code Structure Analysis
- Extract from tasks: method names, parameters, return types
- Infer structure: class organization, file locations
- Apply patterns from PATTERNS-CONVENTIONS.md
- Reference existing code from CODEBASE-MAP.md

### Skeleton Components

**Class Structure:**
```typescript
/**
 * [Class description from tasks]
 * Generated skeleton - implement TODOs
 */
class UserService {
  constructor(
    // TODO: Add required dependencies
  ) {}

  /**
   * [Method description from tasks]
   * @param userData User data for creation
   * @returns Promise<User> Created user object
   */
  async createUser(userData: UserData): Promise<User> {
    // TODO: Validate user data
    // TODO: Check for duplicates
    // TODO: Save to database
    // TODO: Return created user
    throw new Error('Method not implemented');
  }
}
```

**Interface Definitions:**
```typescript
/**
 * [Interface description inferred from usage]
 */
interface UserData {
  // TODO: Define user data structure
  email: string;
  password: string;
  // TODO: Add additional fields
}
```

## Auto-Update Integration

### Task File Reference Updates
After skeleton generation:
```markdown
## UserService Methods
**Target**: `src/services/UserService.ts` ← AUTO-UPDATED

- [ ] createUser() → validation + database save
  - **Reference**: UserService.ts:15-25 ← AUTO-ADDED
  - Dependencies: @ValidationService, @DatabaseService
```

### Real-Time Integration
- Generate skeleton → update task references immediately
- Method signatures → sync with task descriptions
- File locations → auto-determine or use existing patterns
- Cross-references → maintain bidirectional links

## Code Patterns

### Method Template
```typescript
async methodName(param: Type): Promise<ReturnType> {
  // TODO: [High-level step 1 from tasks]
  // TODO: [High-level step 2 from tasks]
  // TODO: [Error handling]
  // TODO: [Return appropriate result]
  
  throw new Error('Method not implemented');
}
```

### Error Handling
```typescript
try {
  // TODO: Main implementation logic
} catch (error) {
  // TODO: Log error appropriately
  // TODO: Handle specific error types
  throw new Error(`[MethodName] failed: ${error.message}`);
}
```

### Dependency Injection
```typescript
constructor(
  private readonly dependency1: Service1,
  private readonly dependency2: Service2,
  // TODO: Add additional dependencies as needed
) {}
```

## Code Quality Standards

### Type Safety
- Full typing: all parameters, returns, properties
- Interface definitions for complex types
- Generic usage where appropriate
- Handle undefined/null cases

### Documentation
- Class documentation: purpose and responsibility
- Method documentation: parameters, returns, behavior
- TODO comments: clear implementation guidance
- Usage examples in comments where helpful

### Structure Patterns
- Consistent naming: follow PATTERNS-CONVENTIONS.md
- File organization: logical grouping and separation
- Import statements: organized and efficient
- Export patterns: clear public API definitions

## Context Integration
- Task specifications: method requirements and descriptions
- PATTERNS-CONVENTIONS.md: coding standards and naming
- CODEBASE-MAP.md: existing code patterns to reuse
- Parent mode context: inherited from tasks or planning

## Quality Checklist
- [ ] All task methods have skeleton implementations
- [ ] Full TypeScript typing applied
- [ ] Class structure follows project patterns
- [ ] Documentation complete with TODOs
- [ ] Error handling patterns included
- [ ] Dependencies properly structured
- [ ] Import statements organized
- [ ] File references updated in tasks
- [ ] Naming conventions followed
- [ ] Integration points identified

## Error Handling
- Type inference failures → use defaults, note in TODO
- Pattern matching issues → fallback to basic patterns
- File creation errors → note issues, continue with others
- Reference update failures → log discrepancies, continue

## Integration
- Never standalone: always dual with tasks or in planning triple
- Real-time updates: task file references updated immediately
- Context inheritance: uses parent mode context completely
- Implementation ready: generated code ready for TODO completion
- Pattern consistency: maintains codebase style and structure