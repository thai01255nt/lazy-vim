# Mode Essentials

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

## Mode Matrix (Basic Level)

| Mode | Keywords | Context Required | Basic Output | Full Capabilities |
|------|----------|------------------|--------------|-------------------|
| **project-overview** | "project overview" | None | 4 docs files | Requires: mode-details/project-overview-guide.md |
| **planning** | "planning" | BUSINESS-CONTEXT + ARCHITECTURE | Planning file | Requires: mode-details/planning-guide.md |
| **tasks** | "tasks" | Planning + CODEBASE-MAP + PATTERNS | Tasks file | Requires: mode-details/tasks-guide.md |
| **skeleton** | "skeleton" | Tasks/planning + PATTERNS | Code+TODOs | Requires: mode-details/skeleton-guide.md |
| **implement** | "implement" | Planning + tasks + skeleton + all docs | Working code | Requires: mode-details/implement-guide.md |
| **standalone-implement** | "quick implement", "fill method" | Auto-patterns | Working code | Requires: mode-details/standalone-guide.md |

## Key Rules (Basic Level)
- **Tasks mode** always needs planning context
- **Skeleton mode** never operates alone (always dual)
- **Implement mode** needs comprehensive context (planning + tasks + skeleton + docs)
- **Standalone implement** operates independently with pattern detection

## Mode Detection Keywords
- `"project overview"` → project-overview mode
- `"planning"` → planning mode (standalone)
- `"planning tasks"` → planning mode (dual)
- `"planning skeleton"` → planning mode (triple)
- `"tasks"` → tasks mode (requires planning context)
- `"tasks skeleton"` → tasks mode (dual)
- `"skeleton"` → skeleton mode (always dual)
- `"implement"` → implement mode (context-dependent)
- `"standalone implement"`, `"quick implement"`, `"fill method"` → standalone-implement mode

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