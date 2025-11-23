# Hướng Dẫn Sử Dụng V3 - Session Continuity System

## Tính Năng Mới V3

### 🔄 Session Continuity (Tiếp Tục Phiên Làm Việc)
- **Tự động phát hiện**: Quét `.claude/docs/` mỗi khi bắt đầu chat
- **Khôi phục context**: Tiếp tục đúng từ nơi bạn dừng lại
- **Theo dõi tiến độ**: Duy trì progress qua nhiều sessions
- **Hệ thống archive**: Lưu công việc cũ khi bắt đầu mới

### 🎯 Flexible Modes cho Solo Developer
- **Quick Mode**: Planning nhanh + skeleton ngay
- **Detailed Mode**: Planning chi tiết với review points
- **Exploratory Mode**: Nhiều cách tiếp cận khi chưa rõ
- **Continue Mode**: Resume bất kỳ công việc nào seamless

## Workflow Examples

### Scenario 1: Quick Implementation
```
Bạn: "quick planning skeleton user authentication"

LLM: 📝 Request type: Mode-Workflow
🔍 SCANNING: ~/.claude/docs/ for existing context...
📂 No existing context found
🎯 Mode: Quick Mode

# Quick Planning: User Authentication

## Approach
Simple JWT-based authentication with login/register endpoints...

[Generated skeleton code với TODOs]
```

### Scenario 2: Detailed Planning  
```
Bạn: "full planning payment system"

LLM: 📝 Request type: Mode-Workflow
🔍 SCANNING: ~/.claude/docs/ for existing context...  
📂 FOUND: BUSINESS-CONTEXT.md (2 hours ago)
🎯 Mode: Detailed Mode

Loading business context...

# Detailed Planning: Payment System

## Business Context
[Chi tiết requirements...]

## Technical Approach
[Phân tích kỹ thuật...]

⏸️ REVIEW POINT: Please review planning above. 
Type "approve" to continue or suggest changes.
```

### Scenario 3: Continue Previous Work
```
Bạn: "continue user authentication" 

LLM: 📝 Request type: Mode-Workflow
🔍 SCANNING: ~/.claude/docs/ for existing context...
📂 FOUND: 
  • planning-user-auth.md (3 hours ago)
  • tasks-user-auth.md (2 hours ago)
  • BUSINESS-CONTEXT.md (5 hours ago)

# Continuing: User Authentication

## Current Status  
✅ **Completed**: Planning, Task breakdown
🔄 **In Progress**: Implementation (JWT middleware)
⏳ **Remaining**: Testing, Integration

## Last Session Summary
Completed planning and broke down into 8 implementation tasks...

## Current Focus
Implementing JWT middleware authentication...

Resuming implementation of `authMiddleware` function...
```

### Scenario 4: Session Start với Existing Context
```
[New chat session]

LLM: 📝 Request type: [Detecting...]
🔍 SCANNING: ~/.claude/docs/ for existing context...
📂 EXISTING PROJECT CONTEXT FOUND:

🎯 **Active Features:**
  • user-auth (planning ✅, tasks ✅, implementation 🔄)
  • payment-system (planning ✅, tasks ⏳)

📅 **Last Session:** 3 hours ago

🔄 **Options:**
1. **CONTINUE** - Resume from where you left off
2. **NEW** - Start fresh (archive current context)
3. **SELECTIVE** - Choose which parts to load  
4. **ARCHIVE** - Save current work and start completely new

Please choose (1/2/3/4):

Bạn: "1"

LLM: Loading all related files for active features...
Context loaded successfully. What would you like to work on?
```

## File Organization V3

### Context Directory Structure
```
~/.claude/docs/
├── BUSINESS-CONTEXT.md        # Project overview
├── ARCHITECTURE.md            # System architecture
├── CODEBASE-MAP.md           # Code structure  
├── PATTERNS-CONVENTIONS.md   # Coding standards
├── planning-user-auth.md     # Feature planning
├── planning-payment.md       # Another feature planning
├── tasks-user-auth.md        # Implementation tasks
├── tasks-payment.md          # Another tasks file
└── session-state.json        # Current progress tracking
```

### Archive System
```
~/.claude/archive/
├── 2024-01-15-14-30/         # Archived session
│   ├── planning-old-auth.md
│   ├── tasks-old-auth.md
│   └── session-state.json
└── 2024-01-14-09-15/         # Another archived session
    └── [old files...]
```

## Mode Selection Guide

### Khi nào dùng Quick Mode?
```
Bạn: "quick planning skeleton login form"
```
- Requirements rõ ràng
- Đã làm tương tự trước đây  
- Cần tốc độ
- Prototyping

### Khi nào dùng Detailed Mode?
```  
Bạn: "full planning complex user management system"
```
- Feature phức tạp hoặc quan trọng
- Domain mới
- Requirements có thể thay đổi
- Cần documentation chi tiết

### Khi nào dùng Exploratory Mode?
```
Bạn: "exploratory planning data synchronization approaches"
```
- Requirements chưa rõ
- Nhiều cách tiếp cận khả thi
- Học technology mới
- Cần phân tích trade-offs

### Khi nào dùng Continue Mode?
```
Bạn: "continue user authentication"
```
- Resume công việc đã dừng
- Tiếp tục sau khi đã planning
- Cross-session work
- Maintain context

## Best Practices

### 1. Sử Dụng Session Continuity
- Luôn để LLM scan context khi bắt đầu
- Chọn "Continue" khi có thể
- Archive old work khi start completely new project

### 2. Mode Selection
- Start với Quick khi idea rõ  
- Upgrade to Detailed khi cần more thinking
- Use Exploratory khi uncertain
- Always Continue existing work

### 3. Context Management  
- Để files trong `.claude/docs/` để auto-discovery
- Regular archive old projects
- Maintain clear feature naming

### 4. Flexibility
- Switch modes mid-process khi cần
- Pause anywhere và resume later
- Trust the system để maintain context

## Troubleshooting

### Missing Context Recovery
```
DETECTED: session-state.json corrupted
RECOVERY: Rebuilding from file discovery
ACTION: Creating new state with discovered files
```

### File Conflicts
```
CONFLICT: planning-auth.md exists but different content
OPTIONS: 
1. Use existing file
2. Overwrite with new content  
3. Create new version (planning-auth-v2.md)
Choose option:
```

### Reset Everything
```bash
# Archive current work
mv ~/.claude/docs ~/.claude/archive/manual-backup-$(date +%Y-%m-%d-%H-%M)

# Create fresh docs directory
mkdir ~/.claude/docs

# Next chat will start fresh
```

V3 system designed specifically cho solo developer workflow with maximum flexibility và seamless session continuity.