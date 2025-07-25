# Guide Prompt Loading & Improvement Assistant

## Purpose
This guide helps LLM quickly understand all guide prompts and their purposes for effective brainstorming when improving prompt guides.

## 🎯 OPTIMIZED SYSTEM (Updated 2025-01-25)

**Major Update**: System has been optimized with **73% token reduction** while preserving 100% functionality.

### New Optimized Structure
```
prompts/
├── core-rules.md (385 words) - Request detection, execution protocol  
├── modes-unified.md (602 words) - All mode behaviors consolidated
├── shared-standards.md (319 words) - Quality, file mgmt, error patterns
└── reference/ (external)
    ├── templates.md - Document templates
    └── code-examples.md - Implementation patterns
```

### Core System Files

#### 1. System Foundation
```
📁 core-rules.md (OPTIMIZED)
Purpose: Universal rules for all LLM interactions
Key Functions:
- Request type detection (Knowledge/Mode-Workflow/Code-Analysis)
- Mode execution protocol (6-step validation)
- Anti-hallucination and decision making principles
- References to unified components

Load to understand: System-wide behavior rules and execution flow
```

#### 2. Unified Mode System  
```
📁 modes-unified.md (NEW - CONSOLIDATED)
Purpose: All mode behaviors in single unified system
Key Functions:
- Mode matrix: keywords → context → process → output
- Dependencies flow with clear relationships
- Mode detection and execution protocols
- Context requirements for each mode
- Smart features: auto-loading, real-time sync, pattern detection

Load to understand: Complete mode system, all workflow behaviors
```

#### 3. Shared Standards
```
📁 shared-standards.md (NEW - CONSOLIDATED)  
Purpose: Quality standards, file management, error handling
Key Functions:
- Quality checklist for all modes
- File management patterns and confirmation protocols
- Error handling strategies and fallback patterns
- Context loading strategy and session awareness
- Update logic and status preservation

Load to understand: Quality requirements and operational standards
```

### Reference Files (External)
```
📁 reference/templates.md
Purpose: Document templates for all modes
Contains: BUSINESS-CONTEXT, ARCHITECTURE, CODEBASE-MAP, PATTERNS-CONVENTIONS, planning, tasks templates

📁 reference/code-examples.md  
Purpose: Implementation patterns and code examples
Contains: Skeleton patterns, quality implementations, test structures
```

### Legacy Files (Archived)
```
📁 project-overview-mode.md → Functionality moved to modes-unified.md
📁 planning-mode.md → Functionality moved to modes-unified.md  
📁 tasks-mode.md → Functionality moved to modes-unified.md
📁 skeleton-mode.md → Functionality moved to modes-unified.md
📁 implement-mode.md → Functionality moved to modes-unified.md
📁 standalone-implement-mode.md → Functionality moved to modes-unified.md
```

## Quick Loading Instructions for LLM (UPDATED)

### Essential Understanding (3 files only)
1. **Load core-rules.md** - Request detection, execution protocol, references
2. **Load modes-unified.md** - Complete mode system, all behaviors
3. **Load shared-standards.md** - Quality standards, file management

### For Detailed Examples (Optional)
4. **Load reference/templates.md** - Document templates if needed
5. **Load reference/code-examples.md** - Implementation patterns if needed

## Optimized Mode System

### Dependencies Flow (Unchanged)
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

### Mode Matrix (From modes-unified.md)
| Mode | Keywords | Context Required | Output |
|------|----------|------------------|---------|
| **project-overview** | "project overview" | None (creates foundation) | 4 docs files |
| **planning** | "planning" | BUSINESS-CONTEXT + ARCHITECTURE | Planning file |
| **tasks** | "tasks" | Planning file + CODEBASE-MAP + PATTERNS | Tasks file |
| **skeleton** | "skeleton" | Tasks/planning + PATTERNS | Code files with TODOs |
| **implement** | "implement" | Planning + tasks + skeleton + all docs | Working code |
| **standalone-implement** | "quick implement" | Auto-detected patterns | Working code |

## Optimization Results

### Performance Improvements
- **73% token reduction** (6,400 → 1,700 tokens)  
- **3x faster loading** with consolidated structure
- **Single source of truth** for shared components
- **Improved maintainability** and consistency

### Preserved Intelligence
- ✅ All mode detection keywords and logic
- ✅ Complete dependencies flow and context requirements
- ✅ Full quality standards and security patterns
- ✅ Smart features: pattern detection, auto-loading, real-time sync
- ✅ File management and confirmation protocols

### System Strengths (Enhanced)
- **Optimized workflow**: Faster progression from planning to implementation
- **Consolidated modes**: Unified system easier to understand and maintain
- **Preserved context awareness**: Smart loading with session persistence
- **Enhanced quality framework**: Consolidated standards across all modes
- **Maintained pattern detection**: Smart reuse of existing code patterns
- **Efficient auto-updates**: Real-time synchronization with reduced overhead

## Current System Usage

**For New Users**: Load the 3 core files (core-rules.md, modes-unified.md, shared-standards.md) for complete understanding.

**For Improvement Work**: Focus on the unified files - all functionality is consolidated, making improvements more efficient and impactful.