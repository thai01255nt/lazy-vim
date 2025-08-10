# Tasks Mode - Detailed Guide

## Purpose

Generate method lists and implementation items from planning context (planning file content). Focus on actionable implementation breakdown. (tasks file)

## Process

1. **Check planning context in chat**: If planning context exists in current conversation → show planning filename and ask user confirm (USP)
2. **If no planning context**: Ask user for project description (USP) → auto-find planning file and ask user confirm (USP)
3. **If no planning file**: stop require user planning first (USP)
4. Load: CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md + confirmed planning file
5. **Check existing tasks file**: find existing tasks file with same name with planning filename
   - If found: ask user confirm (USP)
   - If not found: ask create new file with same name (USP)
6. Generate/update tasks from planning context

## Task Generation

### step-by-step process

1. Context extraction
2. Breakdown levels
3. At each level and each item, wait for user confirmation (USP)

### Context Extraction

- Extract components from planning decisions
- Derive methods from component requirements
- Determine implementation priority
- Follow planning architectural decisions

### Breakdown Levels

**High-Level Tasks:**

```markdown
# Authentication Feature

- [ ] User registration system
- [ ] Login/logout functionality
- [ ] Password reset flow
- [ ] Session management
```

**Method-Level Tasks:**

```markdown
# UserService Implementation

- [ ] createUser() → validation + database save
- [ ] updateProfile() → data sanitization + update
- [ ] deleteUser() → soft delete logic
- [ ] findById() → user retrieval with error handling
```

## Document Template

```markdown
# [FEATURE_NAME] Tasks

← Planning: `${WORKSPACE_FOLDER}/.claude/custom/planning/[type]-[feature-name].md`

## High-Level Implementation

- [ ] [Major component 1]
- [ ] [Major component 2]
- [ ] [Integration points]
- [ ] [Testing approach]

## [ComponentName] Methods

**Target**: `src/path/ComponentFile.ts`

- [ ] methodName() → short description
  - Reference: ComponentFile.ts:25-35
  - Dependencies: @OtherService.method
- [ ] anotherMethod(param: Type) → description
  - Reference: ComponentFile.ts:40-55
  - Uses: existing utilities

## Integration Tasks

- [ ] Connect ComponentA → ComponentB
- [ ] Database schema updates
- [ ] API endpoint modifications
- [ ] Update existing tests
```

## Integration

- **Docs Context**: Planning file, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- **Auto-update**: Preserve task status, add new tasks, real-time sync
- **File management**: Mirror planning filename, incremental updates
