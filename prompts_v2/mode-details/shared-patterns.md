# Shared Patterns for Mode Guides

## Standard Mode Structure
```
# [Mode] Mode - Detailed Guide

## Purpose
[1-2 sentences describing mode function]

## Mode Detection
- `"mode"` → standalone
- `"mode other"` → dual mode

## Process
[Numbered steps with Universal Stop Protocol integration]
```

## Universal Stop Protocol Reference
When mode guide says "Follow Universal Stop Protocol":
- STOP execution immediately
- Wait for user response
- Do not proceed until user confirms
- Use exact phrasing from core-rules.md

## Common Templates

### Component Structure Template
```markdown
## [ComponentName] (existing/new/modify)
**Problem solved**: [what specific problem this solves]
**Requirements**: [what it needs to support]
**Actions**: [methods/functions needed]
**Integration**: [how it connects with other components]
```

### Method Template
```markdown
### [ComponentName] Methods
**Target**: `src/path/ClassName.ts`
- [ ] methodName(params) → description
- [ ] anotherMethod() → description
```

## Error Handling Pattern
- Missing context → continue with available info
- File conflicts → Follow Universal Stop Protocol for user choice
- Implementation failures → preserve partial work, document issues

## File Management Pattern
- Auto-suggest filenames based on task description
- Check existing files → Follow Universal Stop Protocol
- Real-time updates after each discussion
- Preserve manual sections, update auto-generated