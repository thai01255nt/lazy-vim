# Session Discovery & Continuity Guide

## Auto-Discovery Protocol

### On Every Chat Start
```
🔍 SCANNING: ~/.claude/docs/ for existing context...
📊 ANALYSIS: Checking file patterns and timestamps...
🎯 DISCOVERY RESULTS: [findings]
```

### Discovery Logic
```javascript
// File Pattern Detection
const patterns = {
  business: /BUSINESS-CONTEXT\.md/,
  architecture: /ARCHITECTURE\.md/,
  codebase: /CODEBASE-MAP\.md/,
  patterns: /PATTERNS-CONVENTIONS\.md/,
  planning: /planning-(.+)\.md/,
  tasks: /tasks-(.+)\.md/,
  state: /session-state\.json/
};

// Discovery Results Format
{
  "has_project_context": boolean,
  "active_features": ["user-auth", "payment-system"],
  "last_session": "2024-01-15 14:30:00",
  "incomplete_features": ["user-auth"],
  "completed_features": ["login-system"]
}
```

### User Presentation Format
```
📂 EXISTING PROJECT CONTEXT FOUND:

🎯 **Active Features:**
  • user-auth (planning ✅, tasks 🔄, implementation ⏳)
  • payment-system (planning ✅, tasks ✅, implementation ⏳)

📅 **Last Session:** 2 hours ago (2024-01-15 14:30)

🔄 **Options:**
1. **CONTINUE** - Resume from where you left off
2. **NEW** - Start fresh (archive current context)  
3. **SELECTIVE** - Choose which parts to load
4. **ARCHIVE** - Save current work and start completely new

Please choose (1/2/3/4):
```

## Context Loading Strategies

### 1. Continue Mode (Option 1)
```
LOADING: All related files for active features
CONTEXT: Full project understanding
RESUME: From last known state in session-state.json
```

**Files Loaded:**
- Business context (BUSINESS-CONTEXT.md)
- Architecture (ARCHITECTURE.md)  
- All planning files for active features
- All tasks files for active features
- Current progress state

### 2. New Mode (Option 2)
```
ARCHIVING: Current context → .claude/archive/[timestamp]/
CREATING: Fresh workspace
INITIALIZING: Clean session state
```

**Actions:**
- Move all .claude/docs/ → .claude/archive/YYYY-MM-DD-HH-MM/
- Create new session-state.json
- Start with empty context

### 3. Selective Mode (Option 3)
```
PRESENTING: All available context files
ALLOWING: User to pick specific files
LOADING: Only selected context
```

**Interactive Selection:**
```
📋 **Available Context Files:**
  [ ] BUSINESS-CONTEXT.md (Project overview)
  [ ] ARCHITECTURE.md (System design)
  [x] planning-user-auth.md (User auth planning)
  [ ] tasks-user-auth.md (Auth implementation tasks)
  [ ] planning-payment.md (Payment system planning)
  
Select files to load (space to toggle, enter to confirm):
```

### 4. Archive Mode (Option 4)
```
ARCHIVING: All current work → permanent archive
CLEANING: .claude/docs/ directory
STARTING: Completely fresh project
```

## Smart Context Resolution

### Feature Detection Algorithm
```python
def detect_active_features(docs_path):
    features = {}
    
    # Scan planning files
    for file in glob(f"{docs_path}/planning-*.md"):
        feature = extract_feature_name(file)
        features[feature] = {"planning": "exists"}
    
    # Check corresponding tasks files
    for feature in features:
        tasks_file = f"{docs_path}/tasks-{feature}.md"
        if exists(tasks_file):
            features[feature]["tasks"] = analyze_completion_status(tasks_file)
    
    # Determine states
    for feature, status in features.items():
        features[feature]["state"] = determine_feature_state(status)
    
    return features

def determine_feature_state(status):
    if "implementation" in status and status["implementation"] == "completed":
        return "completed"
    elif "tasks" in status and status["tasks"] == "completed":
        return "ready_for_implementation"  
    elif "planning" in status:
        return "in_planning"
    else:
        return "new"
```

### Dependency Graph Loading
```
User selects: "Continue user-auth"
    ↓
Load planning-user-auth.md
    ↓
Check dependencies referenced in planning
    ↓
Auto-load: BUSINESS-CONTEXT.md, ARCHITECTURE.md
    ↓
Load tasks-user-auth.md if exists
    ↓
Build complete context graph
```

## State Management

### Session State Schema
```json
{
  "session_id": "uuid-v4",
  "project_name": "my-app", 
  "created": "2024-01-15T10:00:00Z",
  "last_active": "2024-01-15T14:30:00Z",
  "active_features": {
    "user-auth": {
      "state": "in_tasks",
      "planning_file": "planning-user-auth.md",
      "tasks_file": "tasks-user-auth.md", 
      "progress": {
        "planning": "completed",
        "tasks": "in_progress",
        "skeleton": "pending",
        "implementation": "pending"
      },
      "last_mode": "detailed",
      "next_action": "continue tasks breakdown"
    }
  },
  "completed_features": ["login-basic"],
  "archived_features": [],
  "user_preferences": {
    "default_mode": "quick",
    "auto_continue": true,
    "confirmation_level": "minimal"
  }
}
```

### State Update Triggers
- **Mode completion**: Update progress status
- **File creation**: Add to active features
- **Task completion**: Mark progress milestones
- **User pause**: Save current action context
- **Session end**: Update last_active timestamp

## Error Recovery

### Missing Files
```
EXPECTED: planning-user-auth.md
STATUS: File not found
ACTION: Offer to recreate from session state or start fresh
```

### Corrupted State
```
DETECTED: session-state.json parse error
RECOVERY: Create backup, initialize new state with discovered files
NOTIFY: "Session state corrupted, recovered from file discovery"
```

### Conflicting Context
```
STATE: Says "user-auth" in progress  
REALITY: No planning-user-auth.md found
RESOLUTION: Present conflict to user, offer correction options
```

## Integration with Mode System

### Context-Aware Mode Selection
```python
def smart_mode_detection(user_input, loaded_context):
    if "continue" in user_input:
        feature = extract_feature_from_input(user_input)
        if feature in loaded_context.active_features:
            return "continue_mode", {"feature": feature}
    
    elif "quick" in user_input and loaded_context.has_business_context:
        return "quick_mode", {"context": "loaded"}
    
    elif "full planning" in user_input:
        return "detailed_mode", {"context": loaded_context}
    
    # Default to exploratory if no clear context
    return "exploratory_mode", {}
```

### Mode-Context Matrix
| Mode | Required Context | Auto-Load Strategy |
|------|------------------|-------------------|
| Continue | Exact feature files | Load all related files |
| Quick | Business context preferred | Load if exists, create minimal if not |  
| Detailed | Full project context | Load all available docs |
| Exploratory | Minimal | Load business context only |

This guide enables seamless session continuity while maintaining flexible workflow control for solo developers.