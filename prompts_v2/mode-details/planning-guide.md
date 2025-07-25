# Planning Mode - Smart Hierarchical Brainstorming

## Purpose
Smart brainstorming: unlimited levels, user-controlled depth, individual item focus.

## Mode Detection
- `"planning"` → standalone | `"planning tasks"` → +tasks | `"planning skeleton"` → +tasks+skeleton

## Process
1. **Ask task description** → STOP for user response
2. **Auto suggest filename** → ask user confirm suggested name
3. **Auto detect existing file** → ask continue + detect current level if found
4. **Ask brainstorming needed** → STOP for user response
5. **Execute smart brainstorming workflow** (resume from detected level if continuing)

## Smart Brainstorming Workflow

### Core Process (Unlimited Levels)
1. **List items** at current level
2. **Wait user confirm** before proceeding
3. **Individual brainstorming** - one item at a time
4. **Ask satisfaction** - wait OK before next item
5. **Ask go deeper** - which item to break down
6. **Repeat recursively** - unlimited levels

### Step-by-Step Execution

**Step 1: Present List**
```
Level: [Name]
Items: 1.[Item] 2.[Item] 3.[Item]
Ready to brainstorm each? (Y/n)
```

**Step 2: Individual Focus**
- Focus ONE item: "Brainstorming [Item]..."
- Cover: Requirements, design, interactions, constraints
- Ask: "Satisfied with [Item]? Next item? (Y/n)"
- Update files after user OK

**Step 3: Depth Decision** 
```
Level complete. Items with sub-levels:
- [Item A] → [sub-components]
- [Item B] → [sub-components] 
Go deeper? Which item? ('done' to finish)
```

**Step 4: Recursive Depth**
- Analyze chosen item → create sub-level
- Repeat full process with sub-items
- Continue until user says "done"
- Support: Level 1→2→3→N (unlimited)

### Example Flow

**Level 1**: `1.UserAuth 2.Products 3.Cart 4.Payment` → User picks "UserAuth"
**Level 2**: `1.Login 2.Profiles 3.Permissions` → User picks "Login"  
**Level 3**: `1.Validation 2.Sessions 3.MFA` → Brainstorm each

**Individual Brainstorming**:
```
Brainstorming: Login Service
Requirements: Email validation, token generation, security
Design: JWT vs sessions, expiry policies, rate limiting
Integration: Frontend → validate → return token
Satisfied? Next item? (Y/n)
```

## Mode Behaviors

**Standalone**: Planning doc only, real-time updates
**Dual (+Tasks)**: Each item → method listing, mirror hierarchy levels
**Triple (+Skeleton)**: Add code structure at any level, sync all files

## File Management

### Auto Filename Suggestion (GitHub Convention)
**Pattern**: `[type]-[kebab-case-name].md`
**Types**: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `test`
**Examples**: 
- "Add user authentication" → suggest `feat-user-authentication.md`
- "Fix login validation bug" → suggest `fix-login-validation.md`  
- "Refactor payment service" → suggest `refactor-payment-service.md`
- "Update API documentation" → suggest `docs-api-update.md`
**Process**: Auto suggest → ask user confirm → proceed

### Existing File Detection  
**Check**: `docs/planning/[suggested-name].md` exists?
**If found**:
```
Found: feat-user-authentication.md
Content shows: Level 2 - UserAuth Sub-Components  
Continue from Level 2? Or restart? (continue/restart)
```
**Auto detect**: Parse content → find deepest level → resume from next

### File Template
**Location**: `docs/planning/[type]-[kebab-case].md`
**Combined**: Planning + Tasks in same file
```markdown
# User Authentication - Planning

## Level 1 - Components  
1. UserAuth → authentication/sessions
2. TokenManager → session handling

## Level 2 - UserAuth Sub-Components
1. LoginService → credential validation  
2. SessionManager → token lifecycle

### LoginService (Level 2 Item)
**Problem**: Secure user authentication
**Requirements**: Email validation, token generation
**Design**: JWT vs sessions, expiry policies

---
# Tasks Section

## Level 1 - Components
- [ ] UserAuth → src/auth/AuthService.ts
- [ ] TokenManager → src/auth/SessionManager.ts

## Level 2 - UserAuth Methods  
**Target**: `src/auth/AuthService.ts`
- [ ] login(credentials) → validate and create session
- [ ] validateSession(token) → check validity
```

## Integration
- **Context**: BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md
- **Mode switching**: Activate tasks/skeleton mid-conversation  
- **Updates**: Files update after each item satisfaction
- **Error handling**: Follow shared-patterns.md