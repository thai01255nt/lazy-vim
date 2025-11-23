# Flexible Modes Guide - Solo Developer Optimized

## Mode Philosophy: Adaptive Control

### Core Principle
**"Right level of control, right speed, right context"**
- **Quick Mode**: When you know what you want, get there fast
- **Detailed Mode**: When you need to think through complexity
- **Exploratory Mode**: When requirements are unclear or changing
- **Continue Mode**: When resuming previous work
- **Live Sync Mode**: When you want planning to evolve with implementation

## Mode Execution Framework

### 1. Quick Mode
**Keywords**: `"quick planning skeleton"`, `"quick [feature]"`, `"quick planning skeleton with sync"`
**Philosophy**: Minimal overhead, maximum speed
**Sync Option**: Optional live planning synchronization

#### Workflow
```
User Input → Context Check → Minimal Planning → Skeleton → Ready

# With Sync Enabled:
User Input → Context Check → Minimal Planning → Skeleton → 
Implementation with Live Sync → Auto-Update Planning
```

#### Execution Steps
1. **Context Check**: Load existing business context if available
2. **Minimal Planning**: Create high-level approach (2-3 paragraphs)
3. **Direct Skeleton**: Generate code structure with TODOs
4. **Ready State**: User can immediately start implementation
5. **Live Sync** (if enabled): Auto-detect implementation changes and update planning

#### Output Structure
```markdown
# Quick Planning: [Feature Name]

## Approach
[2-3 paragraph summary of approach]

## Key Components
- Component A: [brief description]
- Component B: [brief description]

## Implementation Notes
[Any critical considerations]

---
[Generated skeleton code with TODOs]
```

#### When to Use
- Feature requirements are clear
- You've done similar implementations before
- Time pressure situations
- Prototyping and experimentation

### 2. Detailed Mode
**Keywords**: `"full planning"`, `"detailed planning"`, `"planning skeleton with sync"`
**Philosophy**: Comprehensive thinking, quality over speed
**Sync Default**: Live sync enabled by default for comprehensive tracking

#### Workflow
```
User Input → Context Loading → Planning Draft → User Review → 
Tasks Breakdown → Skeleton → Implementation Ready

# With Live Sync (Default):
User Input → Context Loading → Planning Draft → User Review → 
Tasks Breakdown → Skeleton → Implementation with Sync → 
Auto-Update Planning → Versioned Documentation
```

#### Execution Steps
1. **Context Loading**: Load all available project context
2. **Planning Draft**: Comprehensive planning document
3. **User Review Point**: Present planning, wait for approval/changes
4. **Tasks Breakdown**: Detailed implementation tasks
5. **Skeleton Generation**: Complete code structure
6. **Implementation Ready**: All pieces in place
7. **Live Sync Active**: Monitor implementation changes and sync to planning
8. **Version Tracking**: Maintain planning evolution history

#### Planning Template
```markdown
# Detailed Planning: [Feature Name]

## Business Context
[Why this feature, user value]

## Technical Approach
### Architecture Decisions
[High-level technical decisions]

### Implementation Strategy  
[Detailed approach with alternatives considered]

### Risk Analysis
[Potential issues and mitigations]

## Component Breakdown
[Detailed component analysis]

## Dependencies
[External dependencies and integrations]

## Testing Strategy
[How to validate this works]

## Future Considerations
[Extensibility and maintenance]
```

#### When to Use
- Complex or critical features
- New domain areas
- When requirements might change
- Team collaboration needed
- Documentation important

### 3. Exploratory Mode
**Keywords**: `"exploratory planning"`, `"explore options"`
**Philosophy**: Discovery-driven, multiple approaches

#### Workflow
```
User Input → Discovery Phase → Multiple Approaches → 
User Selection → Detailed Planning → Continue with chosen approach
```

#### Execution Steps
1. **Discovery Questions**: Ask clarifying questions
2. **Multiple Approaches**: Generate 2-3 different approaches
3. **Pros/Cons Analysis**: Compare approaches
4. **User Selection**: Wait for user to choose direction
5. **Deep Dive**: Detailed planning for selected approach

#### Exploration Template
```markdown
# Exploratory Planning: [Feature Name]

## Understanding the Problem
[Clarified requirements and constraints]

## Approach Options

### Option A: [Approach Name]
**Pros**: [Benefits]
**Cons**: [Drawbacks] 
**Implementation**: [High-level steps]
**Effort**: [Time estimate]

### Option B: [Approach Name] 
**Pros**: [Benefits]
**Cons**: [Drawbacks]
**Implementation**: [High-level steps] 
**Effort**: [Time estimate]

### Option C: [Approach Name]
**Pros**: [Benefits]
**Cons**: [Drawbacks]
**Implementation**: [High-level steps]
**Effort**: [Time estimate]

## Recommendation
[Which approach and why]

## Next Steps
[What happens after user selection]
```

#### When to Use
- Unclear or changing requirements
- Multiple valid approaches exist
- Learning new technologies/domains
- Architecture decisions needed
- Trade-off analysis required

### 4. Continue Mode
**Keywords**: `"continue [feature]"`, `"resume [feature]"`
**Philosophy**: Seamless resumption, context preservation

#### Workflow
```
User Input → Feature Detection → Context Loading → 
State Analysis → Resume from Last Point
```

#### Execution Steps
1. **Feature Detection**: Identify which feature to continue
2. **Context Loading**: Load all related files for that feature
3. **State Analysis**: Determine current progress state
4. **Progress Summary**: Show user where they left off
5. **Resume Point**: Continue from exact stopping point

#### Continuation Summary Template
```markdown
# Continuing: [Feature Name]

## Current Status
✅ **Completed**: [List completed phases]
🔄 **In Progress**: [Current phase with details]
⏳ **Remaining**: [Upcoming phases]

## Last Session Summary
[What was accomplished last time]

## Current Focus
[What we're working on now]

## Next Actions
[Immediate next steps]

---
[Resume execution from exact point]
```

#### Smart Resume Logic
```python
def determine_resume_point(feature_state):
    if feature_state.progress.implementation == "in_progress":
        return "continue_implementation", feature_state.last_method
    elif feature_state.progress.skeleton == "completed":
        return "start_implementation", None
    elif feature_state.progress.tasks == "completed":
        return "create_skeleton", None
    elif feature_state.progress.planning == "completed":
        return "break_down_tasks", None
    else:
        return "review_planning", None
```

### 5. Live Sync Mode
**Keywords**: `"planning skeleton with sync"`, `"sync planning"`, `"live sync mode"`
**Philosophy**: Planning evolves with implementation reality

#### Sync Workflow
```
Implementation Activity → Change Detection → Impact Analysis → 
User Notification → Confirmation → Planning Update → Version Control
```

#### Sync Execution Steps
1. **Change Detection**: Monitor implementation for new components, dependencies, patterns
2. **Impact Analysis**: Assess significance and business impact of changes
3. **User Notification**: Present changes with recommendation
4. **Confirmation**: Wait for user approval (auto/manual/skip options)
5. **Planning Update**: Sync approved changes to planning file
6. **Version Tracking**: Increment planning version, log changes

#### Sync Notification Template
```markdown
🔄 PLANNING SYNC DETECTED:

📁 **New Components:**
   • AuthMiddleware (/src/middleware/auth.js)
     Purpose: Route protection
     Impact: Enhances security architecture

🔧 **Dependency Changes:**
   • Added: express-rate-limit@7.1.0 (security)
   • Changed: bcrypt → argon2 (better security)

⚡ **Architecture Updates:**
   • Enhanced validation pipeline
   • Added rate limiting layer

📊 **Impact Assessment:**
   Security: +2 points (8.5/10)
   Bundle: +127KB (acceptable)
   Performance: No degradation

🤔 **Action Required:**
1. **AUTO-SYNC** - Update planning automatically ✅
2. **REVIEW** - Show detailed changes first
3. **MANUAL** - I'll update planning myself later
4. **SKIP** - Don't sync these changes

Choose (1/2/3/4): _
```

#### Planning Evolution Template
```markdown
## Implementation History
### v1.0 - Initial Planning (2024-01-15 10:00)
- Basic JWT auth approach

### v1.1 - Implementation Updates (2024-01-15 14:30)
- Added: AuthMiddleware component
- Changed: Redis → in-memory (MVP simplification)
- Added: Rate limiting for security

### v1.2 - Security Enhancement (2024-01-15 16:00)
- Enhanced: Password validation
- Changed: bcrypt → argon2
- Added: Input sanitization
```

#### When to Use Live Sync
- Long-term feature development
- Evolving requirements
- Learning new technologies (discoveries during implementation)
- Documentation is important for future reference
- Working on complex features with multiple components

## Mode Transitions

### Flexible Switching
Users can transition between modes at any time:

```markdown
**From Quick → Detailed**: "Actually, let me think through this more carefully"
**From Detailed → Quick**: "This is simpler than I thought, let's just build it"
**From Exploratory → Detailed**: "I want to go with Option B, plan it fully"
**Any Mode → Continue**: "Let's pause here and continue later"
**Any Mode → Live Sync**: "Enable sync planning" or "sync planning to implementation"
**Live Sync → Manual**: "Disable live sync" or "freeze planning"
```

### Transition Handling
```python
def handle_mode_transition(current_mode, new_mode, context):
    # Save current state
    save_progress_state(current_mode, context)
    
    # Preserve context
    transition_context = extract_useful_context(current_mode, context)
    
    # Initialize new mode with preserved context
    return initialize_mode(new_mode, transition_context)
```

## Context Intelligence

### Smart Context Loading
Each mode loads context intelligently:

```python
context_requirements = {
    "quick": {
        "required": [],
        "preferred": ["BUSINESS-CONTEXT.md"],
        "optional": ["ARCHITECTURE.md", "PATTERNS-CONVENTIONS.md"],
        "sync": "optional"  # User choice
    },
    "detailed": {
        "required": ["BUSINESS-CONTEXT.md"],
        "preferred": ["ARCHITECTURE.md", "CODEBASE-MAP.md"],
        "optional": ["PATTERNS-CONVENTIONS.md"],
        "sync": "enabled"   # Default enabled
    },
    "exploratory": {
        "required": [],
        "preferred": ["BUSINESS-CONTEXT.md"],
        "optional": ["ARCHITECTURE.md"],
        "sync": "disabled"  # Focus on discovery
    },
    "continue": {
        "required": ["planning-{feature}.md"],
        "preferred": ["tasks-{feature}.md", "BUSINESS-CONTEXT.md"],
        "optional": ["ARCHITECTURE.md", "PATTERNS-CONVENTIONS.md"],
        "sync": "inherit"   # Use previous setting
    },
    "live_sync": {
        "required": ["planning-{feature}.md"],
        "preferred": ["tasks-{feature}.md", "BUSINESS-CONTEXT.md"],
        "optional": ["ARCHITECTURE.md", "CODEBASE-MAP.md"],
        "sync": "active"    # Always active
    }
}
```

### Context Fallback Strategy
1. **Try to load preferred context**
2. **If missing, use graceful fallbacks**
3. **Create minimal context if needed**
4. **Never block user progress due to missing context**

## Quality Assurance

### Mode-Specific Quality Checks

#### Quick Mode Quality
- [ ] Planning addresses core requirements
- [ ] Skeleton is implementable  
- [ ] No obvious architectural issues
- [ ] Clear next steps defined

#### Detailed Mode Quality
- [ ] All requirements addressed
- [ ] Architecture decisions documented
- [ ] Risks identified and mitigated
- [ ] Implementation path clear
- [ ] Testing strategy defined

#### Exploratory Mode Quality
- [ ] Problem well understood
- [ ] Multiple valid options presented
- [ ] Pros/cons analysis complete
- [ ] Clear recommendation provided
- [ ] Next steps defined

#### Continue Mode Quality
- [ ] Previous context fully loaded
- [ ] Current state accurately represented
- [ ] Clear continuation point identified
- [ ] No progress lost

#### Live Sync Mode Quality
- [ ] Implementation changes accurately detected
- [ ] Planning updates preserve manual sections
- [ ] Version history maintained properly
- [ ] User confirmation respected
- [ ] Conflict resolution handled gracefully

## Integration Points

### With Session Continuity
- All modes save progress to session-state.json
- Context files maintained in .claude/docs/
- Resume points preserved across sessions

### With Implementation
- All modes produce implementable outputs
- Skeleton generation consistent across modes
- Implementation phase can start from any mode output

### With Quality Standards
- All modes follow the same quality checklist
- Code generation patterns consistent
- Documentation standards maintained

### With Live Sync System
- Planning sync state tracked in session-state.json
- Version control integrated across all modes
- Conflict resolution available in all sync-enabled modes
- User preferences for sync behavior preserved

This guide enables flexible, adaptive workflow control while maintaining consistency and quality across all development activities, with optional live synchronization between planning and implementation for maximum documentation accuracy.