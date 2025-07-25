# Shared Standards

## Quality Checklist
- [ ] Structure: Single responsibility, clear separation, consistent naming
- [ ] Security: Input validation, no secrets, parameterized queries
- [ ] Performance: Async/await, resource cleanup, monitoring
- [ ] Documentation: Method docs, business context, TODO comments
- [ ] Error handling: Try-catch, structured logging, proper transformation
- [ ] Integration: Follows existing patterns, clear API definitions

## File Management
**Pattern**: `[type]-[feature-name].md`
**Locations**: `.claude/custom/planning/`, `tasks/`, `docs/`
**Confirmation**: Auto-suggest → Y/n → handle conflicts

## Error Handling
- Missing files → continue with available info
- Parse errors → fallback to pattern detection
- Context loading fails → fallback strategies
- File conflicts → ask user preference
- Implementation failures → log details, preserve partial work

## Context Loading
**Structure**: 
- docs/: BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- .claude/custom/: planning/[filename].md, tasks/[filename].md

**Session-Aware**: Check if loaded → skip redundant → load missing → graceful fallbacks

## Update Logic
**Content**: AUTO-GENERATED sections safe to update, MANUAL sections preserve user edits
**Status**: NEVER modify task status, add new tasks, auto-delete removed components