# Planning + Tasks + Skeleton Modes Redesign

## Problem 1: Mode Relationships & Dependencies
**Solution:** Clear dependency architecture with dual/triple mode support:

**Mode Dependencies:**
```
project-overview (foundation)
    ↓
planning-mode (standalone) ←→ planning-tasks (dual) ←→ planning-skeleton (triple)
    ↓
tasks-mode (needs planning) ←→ tasks-skeleton (dual)
    ↓
implement-mode (needs tasks context)
```

**Mode Capabilities:**
- **Planning**: Standalone possible, can activate dual (planning + tasks) or triple (planning + tasks + skeleton)  
- **Tasks**: Always needs planning context, focus on method listing + high-level items
- **Skeleton**: Always dual mode - với tasks mode, auto-updates task file references
- **Auto-update Logic**: Skeleton → tasks file references (preserve task status), real-time updates during discussions

**Hierarchical Breakdown**: High level component architecture → low level component details với standardized descriptions.

## Problem 2: Dual Mode Architecture  
**Solution:** Auto-detection system với simple keyword patterns:

**Detection Patterns:**
- `"planning"` → planning standalone
- `"planning skeleton"` → planning triple (planning + tasks + skeleton)
- `"planning tasks"` → planning dual (planning + tasks)  
- `"tasks"` → tasks standalone (auto-load planning context)

**State Management:**
- Shared context object cho all modes trong session
- Real-time sync protocol cho cross-mode triggers
- File update queue để coordinate multiple mode outputs
- Auto-switch detection during conversations

**Implementation**: Keyword analysis, context awareness, progressive enhancement từ simple → complex modes.

## Problem 3: File Organization Strategy
**Solution:** Keep existing simple structure:

```
.claude/custom/
├── planning/
│   ├── feat-user-auth.md
│   └── feat-payment.md  
└── tasks/
    ├── feat-user-auth.md (mirrors planning name)
    └── feat-payment.md
```

**Simple Rules:**
- Tasks files mirror exact planning file names
- Skeleton code generated in actual project folders
- Cross-references maintained trong tasks files
- No need for additional skeleton directory

## Problem 4: Context Loading & Handoff
**Solution:** Smart loading strategy với session awareness:

**Auto-Load Requirements:**
- Planning standalone → BUSINESS-CONTEXT.md, ARCHITECTURE.md
- Planning dual/triple → add CODEBASE-MAP.md
- Tasks standalone → planning file + all 4 docs
- Tasks dual → inherit current session context

**Efficient Management:**
- Session context awareness để skip redundant loads
- Context inheritance cho dual modes
- Progressive loading as needed
- Loading notifications cho user visibility

## Problem 5: Progressive Enhancement
**Solution:** Smooth abstraction level progression:

**Level Progression:**
- Level 1 (Planning): High-level component architecture
- Level 2 (Tasks): Medium-level method specifications  
- Level 3 (Skeleton): Implementation-level code structure với TODOs

**Enhancement Flow:**
- Natural progression từ "what components" → "what methods" → "what implementation"
- Context preservation across levels với consistent naming
- User control để stop, jump, or refine at any level
- Detail inheritance đảm bảo consistency

## Problem 6: Integration Points
**Solution:** Seamless integration với project overview foundation:

**Foundation Integration:**
- All modes use appropriate docs files từ project overview
- Natural workflow transitions với context handoff
- Bidirectional updates giữa modes và project docs

**Quality Consistency:**
- Unified standards từ PATTERNS-CONVENTIONS.md
- Architecture alignment với project overview
- Integration checkpoints cho quality validation
- Cross-references maintained automatically