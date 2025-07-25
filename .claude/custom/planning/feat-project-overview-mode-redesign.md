# Project Overview Mode Redesign

## Problem 1: Docs Structure Optimization
**Solution:** 4-file structure optimized cho LLM quick understanding:

```
docs/
├── BUSINESS-CONTEXT.md     # Goal + Domain + Business logic
├── ARCHITECTURE.md         # Tech + Component roles + Mermaid interactions  
├── CODEBASE-MAP.md        # Stack versions + Components + Classes + Methods
└── PATTERNS-CONVENTIONS.md # Coding patterns + Naming conventions
```

**Content Distribution:**
- **ARCHITECTURE.md**: Tech stack roles, component roles, Mermaid interaction charts
- **CODEBASE-MAP.md**: Stack + versions, detailed component structure với classes + methods + code references, short descriptions cho mỗi method

## Problem 2: Codebase Scanning Strategy
**Solution:** Smart multi-phase scanning approach:

- **Phase 1**: LLM intelligent scan - analyze full codebase structure → auto-extract tech stack + versions + roles in one pass
- **Phase 2**: Component discovery via file patterns, directory structure, export analysis
- **Phase 3**: Class & method extraction với AST parsing, method signatures, line references
- **Phase 4**: Description generation từ comments, fallback analysis, parameter types

**Benefits:** One-pass intelligence, context-aware role detection, self-contained scanning.

## Problem 3: LLM-Optimized Format Design
**Solution:** Standardized format rules cho efficient parsing:

**Hierarchical Structure:**
```
## ComponentName (src/path/file.ts:15)
├─ ClassName
│  ├─ method() → short action description
│  └─ method2() → short action description  
└─ ClassName2
   └─ method() → short action description
```

**Token-Efficient Patterns:**
- Action verbs: `creates`, `validates`, `fetches` thay vì full sentences
- Standardized symbols: `→` for descriptions, `├─└─` for hierarchy  
- Compact references: `file.ts:15` format
- Quick-scan sections với compact format
- Cross-reference system với `@ComponentName.method` IDs

## Problem 4: Auto-Detection Logic
**Solution:** Smart detection & update strategy:

**Content Classification:**
- AUTO-SECTIONS: `<!-- AUTO-GENERATED -->` markers cho safe updates
- MANUAL-SECTIONS: `<!-- MANUAL -->` markers cho preservation  
- HYBRID-SECTIONS: Smart merge với conflict detection

**Update Decision Flow:**
- New components: Auto-add với standard format
- Removed components: Auto-delete from docs
- Modified methods: Update signatures, preserve custom descriptions
- Conflicts: Present diff, ask user decision

**Change Detection:** Scan results với clear status indicators (✅ matches, ❌ new, 🗑️ auto-delete)