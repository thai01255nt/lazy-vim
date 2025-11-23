# Mode: Project Overview

## Purpose

Generate/update 4 essential documentation files for LLM quick understanding of codebase. Foundation mode for all projects.

## Process

1. Check existing docs in `docs/` folder
2. Ask: "Found existing docs, update them? (Y/n) or generate fresh?"
3. Smart codebase scan - one-pass analysis
4. Generate 4 files using optimized format
5. Apply update logic (preserve manual sections)

## Target Files

```
docs/
├── BUSINESS-CONTEXT.md     # Goals, domain, business logic
├── ARCHITECTURE.md         # Tech roles, component roles, interactions
├── CODEBASE-MAP.md        # Versions, components, classes, methods
└── PATTERNS-CONVENTIONS.md # Coding patterns, naming rules
```

## Codebase Scanning

### Tech Stack Detection

- List all paths (exclude .gitignore)
- Auto-detect tech stack files and patterns
- Extract versions and dependencies
- Infer roles from usage patterns

### Component Discovery

- Auto-analyze structure, naming, imports, content
- Identify logical components from file organization
- Infer roles from actual usage in codebase
- Group by natural project architecture

### Code Extraction

- AST parsing for accurate structure
- Method signatures with parameters/types
- Line number references
- Extract comments for descriptions

## File Templates

### BUSINESS-CONTEXT.md

```markdown
# Project Goal

[Problem this codebase solves]

# Domain Logic

- [Business rule 1]
- [Business rule 2]

# User Flows

- [Use case 1]: [brief flow]
- [Use case 2]: [brief flow]
```

### ARCHITECTURE.md

````markdown
# Tech Stack Roles

- [Tech 1] → [role]
- [Tech 2] → [role]

# Component Roles

- [Component 1] → [responsibility]
- [Component 2] → [responsibility]

# System Interactions

```mermaid
graph TD
    A[Component1] --> B[Component2]
    B --> C[Database]
```
````

````

### CODEBASE-MAP.md
```markdown
# Tech Stack + Versions
- [Framework 1] [version]
- [Database] [version]

# Components

## ComponentName (src/path/file.ts:15)
├─ ClassName (line X)
│  ├─ method1() → action description
│  └─ method2() → action description
└─ ClassName2 (line Y)
   └─ methodA() → action description
````

### PATTERNS-CONVENTIONS.md

```markdown
# Naming Patterns

- **Files**: [convention]
- **Classes**: [convention]
- **Methods**: [convention]

# Code Patterns

- **Error Handling**: [pattern]
- **Data Validation**: [approach]

# Architecture Patterns

- **Component Structure**: [organization]
- **Data Flow**: [movement]
```

## Update Logic

### Content Classification

- `<!-- AUTO-GENERATED -->` sections: Safe to update
- `<!-- MANUAL -->` sections: Preserve user edits
- Auto-add new components, auto-delete removed ones
- Update signatures, preserve custom descriptions

### Change Detection

```
✅ Component.method() - matches docs
❌ Component.newMethod() - not in docs (NEW)
🗑️ OldComponent - in docs but not found (DELETE)
⚠️ Component.method() - signature changed (UPDATE)
```

## File Management

- Pattern: `[type]-[feature-name].md`
- Location: `docs/` folder for documentation
- Auto-suggest filename, require confirmation
- Handle conflicts: ask user preference

## Error Handling

- Missing files → continue with available info
- Parse errors → fallback to pattern detection
- Large codebases → prioritize main components
- No docs folder → auto-create

## Integration

- Foundation for all other modes
- Other modes auto-load these 4 files
- Code changes trigger doc updates

