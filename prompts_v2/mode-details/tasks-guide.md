# Tasks Mode - Detailed Guide

## Purpose
Generate method lists and implementation items from planning context. Focus on actionable implementation breakdown.

## Mode Detection
- `"tasks"` → standalone (auto-load planning context)
- `"tasks skeleton"` → dual (tasks + skeleton)

## Process
1. Detect mode variant from keywords
2. **Auto-find planning file**: Search `docs/planning/` for `[type]-[feature-name].md` matching current project context
3. Load: CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md + found planning file
4. Check existing tasks file → Follow Universal Stop Protocol for update choice
5. Generate/update tasks from planning context
6. Auto-activate skeleton if dual mode

## Task Generation

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

## Mode Behaviors

### Standalone
- **Auto-find planning file**: Search `docs/planning/` directory for matching `[type]-[feature].md`
- **Fallback**: If no planning found, ask user to specify or create new
- Use all 4 docs + planning context
- Generate tasks based on planning decisions
- Output: Tasks file only

### Dual (+ Skeleton)
- Inherit from current session or load fresh
- Real-time skeleton generation as tasks defined
- Skeleton generation → update task references
- Tasks ↔ Skeleton bidirectional sync
- Output: Tasks + skeleton code files

## Document Template
```markdown
# [FEATURE_NAME] Tasks

← Planning: `docs/planning/[type]-[feature-name].md`

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
- **Context docs**: Planning file, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- **Auto-update**: Preserve task status, add new tasks, real-time sync
- **File management**: Mirror planning filename, incremental updates
- **Error handling**: Follow shared-patterns.md guidelines