# Planning Mode - Smart Hierarchical Brainstorming

## Purpose

Smart brainstorming: unlimited levels, user-controlled depth, individual item focus with **trade-off discussions** and **LLM recommendations** for multiple valid approaches. (planning file)

## Process

1. **Ask mission description** (USP): "Please describe new mission or planning file name:"
2. **Auto-find existing planning files** based on mission description → if found, ask user confirm (USP)
3. **If no existing file found** → Auto suggest new filename → ask user confirm (USP)
4. **Ask brainstorming needed** (USP)
5. **Execute smart brainstorming workflow** (resume from detected level if continuing existing file)

## Smart Brainstorming Workflow

### Core Process (Unlimited Levels)

1. **List items** at current level, ask user confirm (USP)
2. **Individual brainstorming** - one item at a time
3. **Ask satisfaction** (USP)
4. **Ask go deeper** - which item to break down (USP)
5. **Repeat recursively** - unlimited levels

### Step-by-Step Execution

**Step 1: Present List**

```
Level: [Name]
Items: 1.[Item] 2.[Item] 3.[Item]
Ready to brainstorm each? (Y/n)
```

**Step 2: Individual Focus with Discussion**

- Focus ONE item: "Brainstorming [Item]..."
- **Discussion Mode**: When multiple approaches exist, present options with trade-offs + **LLM recommendation**
- **Suggestion Mode**: When clear best practice exists, provide direct guidance
- Ask (USP): "Satisfied with [Item]? Next item? (Y/n)"
- Update files after user OK

**Step 3: Depth Decision** (USP)

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

**Individual Brainstorming with Discussion**:

```
Brainstorming: Login Service
Requirements: Email validation, token generation, security

Discussion: Authentication Strategy
Option 1: JWT Tokens
✅ Pros: Stateless, scalable, microservices-friendly
❌ Cons: Token revocation complex, larger payload

Option 2: Session-based
✅ Pros: Easy revocation, smaller requests, server control
❌ Cons: Stateful, scaling challenges, sticky sessions

💡 My Recommendation: JWT for this case
Reasoning: Based on requirements mentioning "scalability" and modern architecture trends, JWT provides better long-term flexibility despite revocation complexity.

Which approach do you prefer? Or shall we go with my recommendation?
Satisfied with this analysis? Next item? (Y/n)
```

## File Management

### Auto-Find Existing Files Process

**Step 1: Guest planning filename follow rule of [shared-patterns] section in core-rules**

**Step 2: Search existing planning files**

```
Search pattern: `${WORKSPACE_FOLDER}/.claude/custom/planning/*.md`
Match against:
- Filename: feat-user-auth.md, feat-authentication.md, feat-session-mgmt.md
- File content: Look for keywords in titles and component names
```

**Step 3: Present matches for continuation** (USP)

```
🔍 Found existing planning files:
1. feat-user-authentication.md (95% match) - "User Authentication Planning"
   Current progress: Level 2 - LoginService Sub-Components
2. feat-session-management.md (80% match) - "Session Management Design"
   Current progress: Level 1 - Components

Continue with existing file? (1/2/new)
```

**Step 4: Handle selection**

```
If user picks existing file:
- Parse content → detect current deepest level → resume from next level
- Ask (USP): "Continue from Level X? Or restart from beginning? (continue/restart)"

If user picks "new":
- Proceed to Auto Filename Suggestion below
```

### File Template

**Location**: `${WORKSPACE_FOLDER}.claude/custom/planning/[type]-[feature-name].md`

```markdown
# {Mission Name} - Planning

## Level 1 - Components

1. Missing Data Handler → ffill, bfill, interpolation, imputation strategies
2. Normalization Engine → standardization, min-max scaling, robust scaling

## Level 1 Component Details

### Missing Data Handler (Level 1 Item)

**Problem**: Xử lý missing values trong financial time series data
{add more details if needed}

### Level 2 - Missing Data Handler Sub-Components

1. Data Characteristics Analyzer → phân tích pattern, distribution, seasonality của datafield
2. Gap Pattern Detector → detect missing data patterns, gap sizes, frequencies

#### Level 2 Component Details

##### Data Characteristics Analyzer (Level 2 Item)

**Problem**: Phân tích đặc tính của datafield để quyết định strategy fill missing data tối ưu
{add more details if needed}

##### Gap Pattern Detector (Level 2 Item)

**Problem**: Phân tích patterns của missing data để hiểu root cause và chọn appropriate fill strategy
{add more details if needed}

## Level 1 Component Details (Continued)

### Normalization Engine (Level 1 Item)

**Problem**: Chuẩn hóa data để đảm bảo signals có scale tương đương và comparable
{add more details if needed}

### Other Components (Not Yet Brainstormed)

**5. Data Smoother** → moving averages, exponential smoothing, noise reduction
{add more details if needed}
```

## Integration

- **Docs Context**: BUSINESS-CONTEXT.md, ARCHITECTURE.md, CODEBASE-MAP.md
- **Updates**: Planning files update after each item satisfaction with chosen approach
