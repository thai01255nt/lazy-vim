# Mode: Tasks

## Purpose
Generate method lists and implementation items from planning context. Focus on actionable implementation breakdown.

## Mode Detection
- `"tasks"` → standalone (auto-load planning context)
- `"tasks skeleton"` → dual (tasks + skeleton)

## Process
1. Detect mode variant from keywords
2. Auto-load planning file (same filename)
3. Load: CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
4. Check existing tasks file
5. Ask: "Update existing tasks? (Y/n) or generate fresh?"
6. Generate/update tasks from planning context
7. Auto-activate skeleton if dual mode

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
- Auto-load planning file with same name
- Use all 4 docs + planning context
- Generate tasks based on planning decisions
- Preserve existing task status
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

← Planning: `.claude/custom/planning/[same-filename].md`

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

## Context Requirements
- Planning file: Auto-extract corresponding document
- CODEBASE-MAP.md: Current implementation, existing methods
- PATTERNS-CONVENTIONS.md: Coding standards, method naming
- Session context: Inherited from planning mode if available

## Auto-Update Logic

### Status Preservation
- NEVER modify existing task status (`[x]`, `[ ]`)
- Add new tasks without changing existing
- Auto-delete tasks for removed components
- Update references when skeleton changes

### Skeleton Integration (Dual Mode)
- Skeleton creation → add reference to tasks
- Generated methods → update task descriptions
- Maintain bidirectional references
- Real-time sync during session

## File Management
- Mirror planning filename exactly
- Location: `.claude/custom/tasks/[planning-filename].md`
- Auto-find planning context via filename
- Incremental updates: preserve content, add new
- Smart merging: detect conflicts, ask resolution

## Quality Checklist
- [ ] All planning components covered
- [ ] Method-level breakdown for ready components
- [ ] File references accurate and current
- [ ] Dependencies identified and mapped
- [ ] Task status preserved during updates
- [ ] Consistent with planning decisions
- [ ] Skeleton references updated (dual mode)

## Error Handling
- Missing planning file → ask user to specify context
- Context loading failure → continue with available info
- Skeleton generation errors → mark affected tasks, continue
- Reference update failures → note discrepancies, continue

## Integration
- Always needs planning context for generation
- Task specifications guide code implementation
- Can update planning based on implementation insights
- Real-time sync with skeleton generation
- Inherits context from planning mode sessions