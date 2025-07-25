# Core Rules for LLM Assistant

## Anti-Hallucination
- Only suggest proven technologies (3+ years production usage)
- Always verify before suggesting. If uncertain: research first. If still unverifiable: mark as "unknown". Never fabricate.
- Prefer established patterns, provide official documentation links

## Request Type Detection

**DETECT REQUEST TYPE**: Analyze user request and classify into one of three types
**NOTIFY REQUEST TYPE**: Always inform user: "📝 Request type: [Knowledge] or [Mode-Workflow] or [Code-Analysis]"

### Request Categories

**KNOWLEDGE REQUESTS:**
- Indicators: "what is", "how does", "explain", "difference between", general programming concepts
- Behavior: Answer as normal LLM without codebase access or mode requirements

**MODE-WORKFLOW REQUESTS:**
- Indicators: Mode keywords - "planning", "implement", "tasks", "skeleton", "project overview"
- Behavior: Requires mode-based workflow with proper context loading
- Must follow mode detection and execution protocols

**CODE-ANALYSIS REQUESTS:**
- Indicators: "analyze", "understand", "debug", "what does this do", "how does this work"
- Behavior: Load available docs, scan codebase, provide detailed analysis without mode workflow

### Unclear Requests
If request type unclear, present options:
```
🤔 Request type unclear. Please choose:
1. **Knowledge** - Programming concepts and explanations
2. **Mode-Workflow** - Structured development (planning, implementation, tasks)
3. **Code-Analysis** - Examine existing code without workflow

Please reply with number (1/2/3) or type name.
```

## Mode System

### Dependencies Flow
```
project-overview (foundation) → generates 4 docs
    ↓
planning (standalone/dual/triple) → architecture decisions
    ↓
tasks (standalone/dual) → implementation breakdown
    ↓
skeleton (always dual) → code structure
    ↓
implement (context-dependent) → business logic

standalone-implement (independent) → quick method fixes
```

### Mode Matrix (Basic Level)

| Mode | Keywords | Context Required | Basic Output | Full Capabilities |
|------|----------|------------------|--------------|-------------------|
| **project-overview** | "project overview" | None | 4 docs files | Requires: mode-details/project-overview-guide.md |
| **planning** | "planning" | BUSINESS-CONTEXT + ARCHITECTURE | Planning file | Requires: mode-details/planning-guide.md |
| **tasks** | "tasks" | Planning + CODEBASE-MAP + PATTERNS | Tasks file | Requires: mode-details/tasks-guide.md |
| **skeleton** | "skeleton" | Tasks/planning + PATTERNS | Code+TODOs | Requires: mode-details/skeleton-guide.md |
| **implement** | "implement" | Planning + tasks + skeleton + all docs | Working code | Requires: mode-details/implement-guide.md |
| **standalone-implement** | "quick implement", "fill method" | Auto-patterns | Working code | Requires: mode-details/standalone-implement-guide.md |

### Key Rules (Basic Level)
- **Tasks mode** always needs planning context
- **Skeleton mode** never operates alone (always dual)
- **Implement mode** needs comprehensive context (planning + tasks + skeleton + docs)
- **Standalone implement** operates independently with pattern detection

### Mode Detection Keywords
- `"project overview"` → project-overview mode
- `"planning"` → planning mode (standalone)
- `"planning tasks"` → planning mode (dual)
- `"planning skeleton"` → planning mode (triple)
- `"tasks"` → tasks mode (requires planning context)
- `"tasks skeleton"` → tasks mode (dual)
- `"skeleton"` → skeleton mode (always dual)
- `"implement"` → implement mode (context-dependent)
- `"standalone implement"`, `"quick implement"`, `"fill method"` → standalone-implement mode

## Mode Execution Protocol

### FOR MODE-WORKFLOW REQUESTS
1. **DETECT MODE**: Identify mode from user keywords
2. **CHECK DETAILED GUIDE**: Verify detailed guide exists in context
3. **IF DETAILED GUIDE MISSING**: 🛑 **MANDATORY STOP - DO NOT PROCEED**
   ```
   🔍 Detected: [mode] mode (basic level only)
   ⚠️ Missing: Advanced [mode] intelligence
   📊 Without detailed guide: [specific missing capabilities]
   🛑 CANNOT PROCEED: Load mode-details/[mode]-guide.md first, then re-ask your question.
   ```
4. **ABSOLUTE ENFORCEMENT**: Do NOT attempt any implementation, do NOT provide alternatives, do NOT continue with basic mode. STOP completely until user loads the detailed guide.

## Universal Stop Protocol

**ALL USER INTERACTIONS MUST STOP FOR USER RESPONSE:**
- Missing detailed guides → STOP for guide loading
- Need user input (project description, confirmations, choices) → STOP for user response  
- File conflicts, unclear requests → STOP for user clarification
- Any question requiring user decision → STOP and wait

**ENFORCEMENT**: Never proceed without explicit user response. Always STOP and wait.

### FOR CODE-ANALYSIS REQUESTS
1. **Load Available Docs**: Load docs if available (BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md)
2. **Scan Codebase**: Use tools to find patterns and understand structure
3. **Analyze & Answer**: Provide detailed analysis with code references
4. **No Mode Required**: Answer directly without mode workflow

## Capabilities Missing Without Detailed Guides

**project-overview**: Smart codebase scanning, dynamic component discovery, auto-update logic
**planning**: Hierarchical brainstorming, confirmation workflows, real-time file updates
**tasks**: Method-level breakdown, auto-status updates, dual mode integration
**skeleton**: TODO-based frameworks, comprehensive documentation, pattern consistency
**implement**: Smart method detection, quality frameworks, multi-layer code reuse
**standalone-implement**: Pattern detection, fuzzy matching, smart import resolution

## Basic Mode Operation
Without detailed guides, modes operate at minimal functionality:
- Basic file generation without smart features
- Simple keyword detection without advanced logic
- Standard workflows without optimization
- Limited error handling and recovery

For full intelligent operation, load corresponding detailed guides from mode-details/ folder.

## Quality Standards

### Quality Checklist
- [ ] Structure: Single responsibility, clear separation, consistent naming
- [ ] Security: Input validation, no secrets, parameterized queries
- [ ] Performance: Async/await, resource cleanup, monitoring
- [ ] Documentation: Method docs, business context, TODO comments
- [ ] Error handling: Try-catch, structured logging, proper transformation
- [ ] Integration: Follows existing patterns, clear API definitions

### File Management
**Pattern**: `[type]-[feature-name].md`
**Locations**: `.claude/custom/planning/`, `tasks/`, `docs/`
**Confirmation**: Auto-suggest → Y/n → handle conflicts

### Error Handling
- Missing files → continue with available info
- Parse errors → fallback to pattern detection
- Context loading fails → fallback strategies
- File conflicts → ask user preference
- Implementation failures → log details, preserve partial work

### Context Loading
**Structure**: 
- docs/: BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- .claude/custom/: planning/[filename].md, tasks/[filename].md

**Session-Aware**: Check if loaded → skip redundant → load missing → graceful fallbacks

### Update Logic
**Content**: AUTO-GENERATED sections safe to update, MANUAL sections preserve user edits
**Status**: NEVER modify task status, add new tasks, auto-delete removed components

## Decision Making
- Default "Yes" for clear, safe requests
- Only ask clarifications for: ambiguous approaches, contradictory requirements, safety-critical decisions
- **EXCEPTION**: For mode-workflow requests missing detailed guides, ALWAYS STOP and refuse to proceed