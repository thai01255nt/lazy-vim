# Unified Mode System

## Dependencies Flow

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

## Mode Matrix

| Mode                     | Keywords                         | Context Required                        | Process                       | Output                 |
| ------------------------ | -------------------------------- | --------------------------------------- | ----------------------------- | ---------------------- |
| **project-overview**     | "project overview"               | None (creates foundation)               | Scan codebase + generate      | 4 docs files           |
| **planning**             | "planning"                       | BUSINESS-CONTEXT + ARCHITECTURE         | Brainstorm architecture       | Planning file          |
| **planning-dual**        | "planning tasks"                 | + CODEBASE-MAP                          | Planning + auto-tasks         | Planning + tasks files |
| **planning-triple**      | "planning skeleton"              | + PATTERNS                              | Planning + tasks + skeleton   | All 3 outputs          |
| **tasks**                | "tasks"                          | Planning file + CODEBASE-MAP + PATTERNS | Extract methods from planning | Tasks file             |
| **tasks-dual**           | "tasks skeleton"                 | + skeleton context                      | Tasks + generate skeleton     | Tasks + code files     |
| **skeleton**             | "skeleton"                       | Tasks/planning + PATTERNS               | Generate TODO structure       | Code files with TODOs  |
| **implement**            | "implement"                      | Planning + tasks + skeleton + all docs  | Fill TODOs with logic         | Working code           |
| **standalone-implement** | "quick implement", "fill method" | Auto-detect patterns                    | Pattern-based implementation  | Working code           |

## Mode Behaviors

### Context Requirements by Mode

- **project-overview**: Creates all 4 docs from codebase scan
- **planning**: BUSINESS-CONTEXT.md, ARCHITECTURE.md (+ CODEBASE-MAP.md for dual/triple)
- **tasks**: Auto-load planning file + CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md
- **skeleton**: Inherits from parent mode + PATTERNS-CONVENTIONS.md
- **implement**: Planning + tasks + skeleton + all 4 docs
- **standalone-implement**: Auto-load CODEBASE-MAP.md, PATTERNS-CONVENTIONS.md

### Key Rules

- **Tasks mode** always needs planning context
- **Skeleton mode** never operates alone (always dual)
- **Implement mode** needs comprehensive context (planning + tasks + skeleton + docs)
- **Standalone implement** operates independently with pattern detection

## Mode Detection Protocol

### Detection Keywords

- `"project overview"` → project-overview mode
- `"planning"` → planning mode (standalone)
- `"planning tasks"` → planning mode (dual)
- `"planning skeleton"` → planning mode (triple)
- `"tasks"` → tasks mode (requires planning context)
- `"tasks skeleton"` → tasks mode (dual)
- `"skeleton"` → skeleton mode (always dual)
- `"implement"` → implement mode (context-dependent)
- `"standalone implement"`, `"quick implement"`, `"fill method"` → standalone-implement mode

### Execution Protocol

1. **DETECT MODE**: Identify mode from user keywords
2. **NOTIFY USER**: "🔍 Detected: [mode-name] mode"
3. **CHECK PROMPT**: Verify mode guide prompt exists in current context
4. **IF FOUND**: "✅ [Mode-name] mode prompt loaded" and proceed
5. **IF NOT FOUND**: 🛑 **ABSOLUTE STOP**
   ```
   ❌ [mode-name] prompt NOT FOUND in context.
   🚫 Cannot proceed without mode guide.
   ⚡ ACTION: Load [mode-name].md prompt first.
   ```
6. **NEVER PROCEED** without mode prompt - NO EXCEPTIONS

### Unclear Mode Detection

If cannot detect mode, ask user:

```
Cannot determine mode. Please specify:
- project-overview (documentation generation)
- planning (architecture brainstorming)
- tasks (implementation breakdown)
- skeleton (code structure)
- implement (business logic implementation)
- standalone-implement (quick method completion)
```

## Smart Features

### Auto-Context Loading

- Auto-load planning file by filename matching (tasks mode)
- Session-aware loading (skip if already in context)
- Graceful fallback when files missing

### Real-Time Sync

- Dual modes update both files simultaneously
- Triple modes maintain 3-way synchronization
- Reference updates when skeleton generates files
- Status preservation across updates

### Pattern Detection (standalone-implement)

- Fuzzy method matching with suggestions
- Auto-detect existing patterns and conventions
- Smart import resolution from codebase analysis
- Quality enforcement following project standards

