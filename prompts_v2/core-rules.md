# Core Rules for LLM Assistant

## Anti-Hallucination

- Prefer suggest proven technologies (3+ years production usage)
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
planning → architecture and logic decisions
    ↓
tasks → implementation breakdown
    ↓
skeleton → code structure
    ↓
implement → business logic

standalone-implement → quick method fixes
```

### Mode Matrix (Basic Level)

| Mode                     | Keywords                                                                    | Context Required                       | Basic Output  | Full Capabilities                                    |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------------------- | ------------- | ---------------------------------------------------- |
| **project-overview**     | "project overview"                                                          | None                                   | 4 docs files  | Requires: mode-details/project-overview-guide.md     |
| **planning**             | "planning"->standalone, "planning tasks"->dual, "planning skeleton"->triple | BUSINESS-CONTEXT + ARCHITECTURE        | Planning file | Requires: mode-details/planning-guide.md             |
| **tasks**                | "tasks"                                                                     | Planning + CODEBASE-MAP + PATTERNS     | Tasks file    | Requires: mode-details/tasks-guide.md                |
| **skeleton**             | "skeleton"                                                                  | Tasks/planning + PATTERNS              | Code+TODOs    | Requires: mode-details/skeleton-guide.md             |
| **implement**            | "implement"                                                                 | Planning + tasks + skeleton + all docs | Working code  | Requires: mode-details/implement-guide.md            |
| **standalone-implement** | "quick implement", "fill method", "implement method"                        | Auto-patterns                          | Working code  | Requires: mode-details/standalone-implement-guide.md |

## Universal Stop Protocol (USP)

**ALL USER INTERACTIONS MUST STOP FOR USER RESPONSE:**

- If process execution guide mentions (USP) → STOP and wait for user response
- With ask user or need user confirmation → show question follow guide definition or auto detect base on current execution.
- With error handling (missing file) → show error content and wait for user clarification

**ABSOLUTE ENFORCEMENT**: Never proceed without explicit user response. Always STOP and wait.

## Mode Execution Protocol

### FOR MODE-WORKFLOW REQUESTS

1. **DETECT MODE**: If not any activated mode, identify mode from user keywords
2. **DYNAMIC COMBINE MODE**: Auto detect if user mentions about new mode, ask user to confirm switching modes or combine modes (USP).
3. **CHECK DETAILED GUIDE**: Verify detailed guide exists in context
4. **IF DETAILED GUIDE MISSING** (USP)
   ```
   🔍 Detected: [mode] mode (basic level only)
   🛑 CANNOT PROCEED: Load mode-details/[mode]-guide.md first, then re-ask your question.
   ```
5. **AUTO LOAD**: auto load docs files required in detailed guide

### FOR CODE-ANALYSIS REQUESTS

1. **Load Available Docs**: Load docs if available (BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md)
2. **Scan Codebase**: Use tools to find patterns and understand structure
3. **Analyze & Answer**: Provide detailed analysis with code references
4. **No Mode Required**: Answer directly without mode workflow

### Update Logic

**Content**: AUTO-GENERATED sections safe to update, MANUAL sections preserve user edits
**Status**: NEVER modify task status, add new tasks, auto-delete removed components

## Decision Making

- Default "Yes" for clear, safe requests
- Only ask clarifications for: ambiguous approaches, contradictory requirements, safety-critical decisions
- **EXCEPTION**: For mode-workflow requests missing detailed guides, ALWAYS STOP and refuse to proceed

### Error Handling

- Missing required loading files (USP)

# Shared Patterns for Mode Guides

## Context Loading

### Structure context

- ${WORKSPACE_FOLDER}/.claude/custom/docs/ (docs context): BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- ${WORKSPACE_FOLDER}/.claude/custom/planning(planning context): [type]-[feature-name].md
- ${WORKSPACE_FOLDER}/.claude/custom/tasks(tasks context): [type]-[feature-name].md

### Session-Aware

- Check if loaded → skip redundant → load missing → graceful fallbacks

### File managment patterns

- Check existing files → (USP) to confirm selected file
- Preserve manual sections, update auto-generated
- About planning, tasks, skeleton, implement mode: Auto-suggest planning filename based on mission description and git convention, `[type]-[mission-name].md`. There `[type]` is different type git `docs`, `feat`, `refactor`, `fix`, `text`, ..., `[mission-name]` is name of planning filename base on mission description user provided.
