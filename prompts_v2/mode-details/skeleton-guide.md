# Skeleton Mode - Detailed Guide

## Purpose

Generate code structure and implementation framework.

## Process

1. Ask for `quick type` or `mode-follow type` (USP)
2. **If quick type**: follow quick type execution guide
3. **If mode-follow type**: follow mode-flow type execution guide

## Shared Execution

### Overview

Shared execution provides a common interface for all skeleton generation types.

### Process Flow

1. **Auto-pattern detection**: using PATTERNS-CONVENTIONS.md, ARCHITECTURE.md, CODEBASE-MAP.md, to understand for similar patterns
2. **Auto detect priority**: base on context
3. **Generate component**: start first component base on priority, detect component exists or not
4. **If component exists**: Generate first method skeleton base on priority
5. **If component not exists**: Generate component skeleton
6. **Present result**: Show generated code and wait for user confirmation. (USP)
7. **If user confirm**: repeat process with next priority

## Quick Type Execution

### Overview

Quick type provides rapid skeleton generation for specific components without full context loading. Best for small, isolated features or when you already know what to implement.

### Context loading

- No need more context loading

## Mode-Flow Type Execution

### Context loading

- Check for planning and tasks context
- If planning context not found: ask user for project description (USP) → auto-find planning file base on section [File manage patterns] of `core-rules` and ask user confirm (USP) → load planning context
- When planning context confirmed: auto load tasks context with same filename

## Skeleton Generation Rules

### Code Structure Analysis

- Extract base on `execution` guide: method names, parameters, return types
- Reference existing code from CODEBASE-MAP.md
- Apply patterns from PATTERNS-CONVENTIONS.md
- Infer structure: class organization, file locations

### Skeleton Components

**Class Structure:**

```typescript
/**
 * [Class description from tasks]
 * Generated skeleton - implement TODOs
 */
class UserService {
  constructor() {} // TODO: Add required dependencies

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
    throw new Error("Method not implemented");
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

## Auto-Update Integration (For mode-follow type)

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

- Method signatures → sync with task descriptions (for `mode-flow type`)
- File locations → auto-determine or use existing patterns
- Cross-references → maintain bidirectional links

## Code Comment Patterns

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

## Error Handling

- Type inference failures → use defaults, note in TODO
- Pattern matching issues → fallback to basic patterns
- File creation errors → note issues, continue with others
- Reference update failures → log discrepancies, continue

## Integration

- **Docs Context**: ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- **Updates**: Auto-update task references, method signatures, file locations (for `mode-flow type`)
