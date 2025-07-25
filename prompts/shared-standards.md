# Shared Standards

## Quality Checklist
- [ ] Structure: Single responsibility, clear separation, consistent naming
- [ ] Security: Input validation, no secrets, parameterized queries
- [ ] Performance: Async/await, resource cleanup, monitoring
- [ ] Documentation: Method docs, business context, TODO comments
- [ ] Error handling: Try-catch, structured logging, proper transformation
- [ ] Integration: Follows existing patterns, clear API definitions

## File Management

### Naming Convention
**Pattern**: `[type]-[feature-name].md`
- Types: feat-, bugfix-, refactor-, enhance-, update-
- Examples: feat-user-auth.md, bugfix-login-validation.md

### Locations
- Planning: `.claude/custom/planning/[filename].md`
- Tasks: `.claude/custom/tasks/[same-filename].md`
- Docs: `docs/` folder
- Code: Project structure (src/, lib/, etc.)

### Confirmation Protocol
1. Auto-suggest filename based on content
2. Ask: "Save as `filename.md`? (Y/n) or enter different name:"
3. Wait for explicit confirmation - NEVER proceed without confirmation
4. Handle conflicts: ask user preference for update/create new/overwrite

## Error Handling Patterns
- Missing files → continue with available info
- Parse errors → fallback to pattern detection
- Large codebases → prioritize main components
- Context loading fails → fallback strategies
- File conflicts → ask user preference
- Implementation failures → log details, preserve partial work

## Context Loading Strategy

### Documentation Structure
- **docs/**: BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- **.claude/custom/**: planning/[filename].md, tasks/[filename].md
- **src/**: Implementation code files

### Session-Aware Loading
- Check if docs already loaded in current session
- Skip redundant loading: "✅ Using existing [doc-name] from session"
- Load missing docs: "📄 Loading [doc-name] for mode context"
- Handle missing files gracefully with fallback strategies

## Update Logic Standards

### Content Classification
- `<!-- AUTO-GENERATED -->` sections: Safe to update
- `<!-- MANUAL -->` sections: Preserve user edits
- Auto-add new components, auto-delete removed ones
- Update signatures, preserve custom descriptions

### Status Preservation
- NEVER modify existing task status (`[x]`, `[ ]`)
- Add new tasks without changing existing
- Auto-delete tasks for removed components
- Update references when files change