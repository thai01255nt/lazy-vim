# Planning Mode - Detailed Guide

## Purpose
Brainstorm architecture decisions, design component interactions, hierarchical breakdown from high-level to low-level.

## Mode Detection
- `"planning"` → standalone mode
- `"planning tasks"` → dual mode (planning + tasks)
- `"planning skeleton"` → triple mode (planning + tasks + skeleton)

## Process
1. Detect mode variant from user keywords
2. Load context: BUSINESS-CONTEXT.md, ARCHITECTURE.md (+ CODEBASE-MAP.md for dual/triple)
3. Check existing file in `.claude/custom/planning/`
4. Ask: "Found `existing-file.md`, continue? (Y/n)"
5. Ask: "Needs detailed brainstorming? (Y/n)"
6. Execute workflow, save with confirmation

## Brainstorming Workflow

### Confirmation Process
- Present each problem/component
- Ask: "Discuss [Item]? (Y/n)"
- Wait for Y/n before proceeding
- One item at a time, no batch processing

### Hierarchical Breakdown

**Level 1 - Architecture:**
```markdown
# Component Architecture
- ComponentA (exists/new) → solves X problem
- ComponentB (new) → solves Y problem
- Integration: A → B → Database
```

**Level 2 - Details:**
```markdown
# ComponentA Details

## Requirements
- [requirement 1]
- [requirement 2]

## Actions
- [action 1]
- [action 2]

## Integration
- Uses: ComponentB.method()
- Provides: interface
```

## Mode Behaviors

### Standalone
- Pure planning and architecture decisions
- Output: Planning document only
- Real-time file updates

### Dual (+ Tasks)
- Auto-generate task suggestions during planning
- Planning decisions → task suggestions
- Output: Planning + tasks files
- Real-time sync both files

### Triple (+ Tasks + Skeleton)
- Full workflow: planning + tasks + skeleton
- Generate code structure from decisions
- Skeleton → update task references
- Output: Planning + tasks + code files

## Document Template
```markdown
# [FEATURE_NAME]

## High-Level Architecture
[Component overview and relationships]

## [Component 1]

### Purpose
[Problem this component solves]

### Requirements
- [requirement 1]
- [requirement 2]

### Integration
- Uses: [components]
- Provides: [interfaces]

## Architecture Decisions
[Key technical decisions]
```

## Context Integration
- BUSINESS-CONTEXT.md: Project goals, domain logic
- ARCHITECTURE.md: Existing tech stack, patterns
- CODEBASE-MAP.md: Current implementation (dual/triple)

## Quality Checklist
- [ ] Architecture decisions documented
- [ ] Component relationships mapped
- [ ] Integration points identified
- [ ] Requirements specified
- [ ] Consistent with existing architecture
- [ ] Business goals alignment

## Error Handling
- Missing context → continue with available info
- File conflicts → ask user preference
- Mode switching → handle gracefully
- Context loading fails → fallback to basic planning

## Integration
- Uses project overview docs for context
- Can activate tasks/skeleton mid-conversation
- Maintain context across mode switches
- Real-time updates after each decision