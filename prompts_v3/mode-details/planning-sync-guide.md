# Planning Sync Intelligence Guide

## Live Planning Synchronization System

### Philosophy
**"Planning reflects implementation reality"** - Automatically keep planning documents synchronized with actual implementation to maintain accurate project documentation and decision history.

## Sync Detection Engine

### Component Detection Algorithm
```python
def detect_implementation_changes(skeleton_code, implementation_files):
    changes = {
        "new_components": [],
        "architecture_deviations": [],
        "dependency_additions": [],
        "method_signatures": [],
        "configuration_changes": []
    }
    
    # Detect new files/classes created
    impl_components = extract_components(implementation_files)
    skeleton_components = extract_components(skeleton_code)
    new_components = impl_components - skeleton_components
    
    for component in new_components:
        changes["new_components"].append({
            "name": component.name,
            "path": component.file_path,
            "type": component.type,  # controller, service, middleware, etc.
            "detected_at": datetime.now(),
            "reason": "implementation_created"
        })
    
    # Detect architecture pattern deviations
    planned_patterns = extract_patterns(skeleton_code)
    impl_patterns = extract_patterns(implementation_files)
    
    for pattern_type in ["database", "authentication", "caching", "api_design"]:
        if planned_patterns[pattern_type] != impl_patterns[pattern_type]:
            changes["architecture_deviations"].append({
                "type": pattern_type,
                "planned": planned_patterns[pattern_type],
                "implemented": impl_patterns[pattern_type],
                "impact": assess_impact(pattern_type, planned, implemented)
            })
    
    return changes
```

### Dependency Analysis
```python
def analyze_dependency_changes(planning_deps, implementation_deps):
    analysis = {
        "added": implementation_deps - planning_deps,
        "removed": planning_deps - implementation_deps,
        "version_changes": {},
        "security_implications": []
    }
    
    # Analyze new dependencies
    for dep in analysis["added"]:
        dep_info = {
            "name": dep.name,
            "version": dep.version,
            "purpose": infer_purpose(dep, implementation_files),
            "security_risk": assess_security_risk(dep),
            "size_impact": get_bundle_size_impact(dep)
        }
        
        if dep_info["security_risk"] > "low":
            analysis["security_implications"].append(dep_info)
    
    return analysis
```

## Planning File Structure with Sync

### Enhanced Planning Template
```markdown
# Planning: User Authentication
*Last updated: 2024-01-15 16:30 (v1.3)*

## Business Requirements
<!-- MANUAL SECTION - Never auto-updated -->
User can login with email/password and receive JWT token for API access.
Session management with refresh tokens for security.

## Technical Approach
<!-- AUTO-UPDATED SECTION -->
### Original Plan (v1.0 - 2024-01-15 10:00)
- JWT authentication with access + refresh tokens
- Redis session store for refresh tokens
- Express middleware for route protection
- bcrypt for password hashing

### Implementation Evolution
#### v1.1 Updates (2024-01-15 14:30)
- ✅ **Added**: Rate limiting middleware (security requirement discovered)
- ✅ **Added**: Email validation service (data quality improvement)
- ⚠️ **Changed**: Redis → In-memory store (MVP simplification)

#### v1.2 Updates (2024-01-15 15:45)
- ✅ **Added**: Password strength validation
- ✅ **Enhanced**: JWT service with proper error handling
- 📝 **Note**: Kept in-memory store for now, will migrate to Redis in v2.0

#### v1.3 Updates (2024-01-15 16:30)
- ✅ **Added**: AuthController input sanitization
- ⚠️ **Changed**: bcrypt → argon2 (better security, performance)
- 🔧 **Config**: Added environment-based JWT secrets

## Component Architecture
<!-- AUTO-UPDATED SECTION -->
### Planned Components (Original)
- AuthController (/src/controllers/auth.js)
- JWTService (/src/services/jwt.js)
- AuthMiddleware (/src/middleware/auth.js)

### Implemented Components (Current)
- ✅ AuthController (/src/controllers/auth.js) - *Enhanced with validation*
- ✅ JWTService (/src/services/jwt.js) - *Added refresh token logic*
- ✅ AuthMiddleware (/src/middleware/auth.js) - *Route protection implemented*
- ✅ RateLimitMiddleware (/src/middleware/rateLimit.js) - *Security addition*
- ✅ EmailValidator (/src/utils/emailValidator.js) - *Data quality addition*
- ✅ PasswordValidator (/src/utils/passwordValidator.js) - *Security addition*

## Dependencies
<!-- AUTO-UPDATED SECTION -->
### Original Dependencies
```json
{
  "jsonwebtoken": "^9.0.0",
  "bcrypt": "^5.1.0",
  "redis": "^4.6.0",
  "express": "^4.18.0"
}
```

### Current Dependencies
```json
{
  "jsonwebtoken": "^9.0.0",
  "argon2": "^0.31.0",        // Changed: bcrypt → argon2
  "express": "^4.18.0",
  "express-rate-limit": "^7.1.0",  // Added: Rate limiting
  "validator": "^13.11.0",    // Added: Email validation
  "zxcvbn": "^4.4.2"          // Added: Password strength
  // Removed: redis (using in-memory for MVP)
}
```

### Dependency Analysis
- **Security Enhanced**: argon2 > bcrypt, added rate limiting
- **Bundle Impact**: +127KB (acceptable for security gains)  
- **Removed Redis**: -2.1MB (temporary for MVP, plan to re-add)

## Implementation Decisions Log
<!-- AUTO-UPDATED SECTION -->
### Decision: bcrypt → argon2 (2024-01-15 16:30)
**Reason**: Better memory-hard security properties
**Impact**: Slight performance improvement, much better security
**Approval**: Auto-approved (security enhancement)

### Decision: Redis → In-memory (2024-01-15 14:30)
**Reason**: MVP simplification, reduce deployment complexity
**Impact**: Sessions lost on server restart (acceptable for MVP)
**Future**: Migrate to Redis in v2.0 for production
**Approval**: Pending review

## Quality Metrics
<!-- AUTO-UPDATED SECTION -->
### Security Score: 8.5/10
- ✅ Argon2 password hashing
- ✅ JWT with refresh tokens  
- ✅ Rate limiting implemented
- ⚠️ In-memory sessions (temporary)
- ✅ Input validation & sanitization

### Performance Impact
- Password hashing: 200ms avg (acceptable)
- JWT verification: <1ms (excellent)
- Rate limiting: <0.1ms (negligible)

## Testing Strategy
<!-- MANUAL SECTION with auto-updates -->
### Original Test Plan
- Unit tests for AuthController
- Integration tests for auth flow
- Security tests for JWT handling

### Implementation Test Updates
- ✅ Added: Rate limiting tests
- ✅ Added: Password validation tests  
- ✅ Added: Email validation tests
- ⏳ Pending: Argon2 performance tests

## Future Considerations
<!-- MANUAL SECTION with evolution notes -->
### v2.0 Planned Enhancements
- Redis session store (restore from v1.1 decision)
- Multi-factor authentication
- OAuth2 integration
- Session monitoring dashboard

### Technical Debt
- **Priority High**: Migrate to Redis for session persistence
- **Priority Medium**: Add comprehensive audit logging  
- **Priority Low**: Consider JWT blacklisting for logout
```

## Sync Workflow Execution

### 1. Real-Time Detection
```
Implementation Activity → Component Scanner → Change Detection → 
Impact Analysis → User Notification → Confirmation → Planning Update
```

### 2. User Notification System
```
🔄 PLANNING SYNC DETECTED:

📁 **New Components:**
   • PasswordValidator (/src/utils/passwordValidator.js)
     Purpose: Password strength validation
     Impact: Enhances security requirements

🔧 **Dependency Changes:**
   • Added: zxcvbn@4.4.2 (password strength checking)
   • Changed: bcrypt → argon2 (better security)

⚡ **Architecture Updates:**
   • Enhanced AuthController with input sanitization
   • Added validation pipeline to auth flow

📊 **Impact Assessment:**
   Security: +2 points (8.5/10)
   Bundle: +45KB (acceptable)
   Performance: No degradation

🤔 **Action Required:**
1. **AUTO-SYNC** - Update planning automatically (recommended)
2. **REVIEW** - Show detailed changes first
3. **MANUAL** - I'll update planning myself later
4. **SKIP** - Don't sync these changes

Choose (1/2/3/4): _
```

### 3. Sync Execution Modes

#### Mode 1: Auto-Sync (Recommended)
```
User: "1" (AUTO-SYNC)
→ Planning file updated automatically
→ Version incremented (v1.2 → v1.3)  
→ Change log appended
→ Dependencies section updated
→ Component list refreshed
→ "✅ Planning synced to v1.3"
```

#### Mode 2: Review First
```
User: "2" (REVIEW)
→ Show detailed diff of changes
→ Highlight manual vs auto-updated sections
→ Allow selective sync of individual changes
→ Confirm each section update
```

#### Mode 3: Manual Later
```
User: "3" (MANUAL)  
→ Save detected changes to pending_updates
→ Continue implementation without sync
→ Remind user periodically about pending updates
→ Allow batch sync later
```

#### Mode 4: Skip Changes
```
User: "4" (SKIP)
→ Mark changes as "intentionally not documented"  
→ Add to .sync_ignore for this session
→ Don't detect these patterns again
```

## Conflict Resolution

### Planning vs Implementation Conflicts
```
🚨 CONFLICT DETECTED:

📋 **Planning States:**
   Database: PostgreSQL with Prisma ORM
   
💻 **Implementation Uses:**  
   Database: MongoDB with Mongoose

🤔 **Resolution Options:**
1. **Update Planning** - Change planning to match implementation (MongoDB)
2. **Fix Implementation** - Change code to match planning (PostgreSQL)  
3. **Document Deviation** - Keep both, add explanation
4. **Discuss Trade-offs** - Analyze pros/cons of each approach

Choose (1/2/3/4): _
```

### Smart Conflict Analysis
```python
def analyze_conflict(planning_item, implementation_item):
    analysis = {
        "severity": assess_severity(planning_item, implementation_item),
        "business_impact": assess_business_impact(planning_item, implementation_item),
        "technical_debt": assess_technical_debt(planning_item, implementation_item),
        "rollback_cost": assess_rollback_cost(implementation_item),
        "recommendation": None
    }
    
    # Generate smart recommendation
    if analysis["rollback_cost"] > "high" and analysis["business_impact"] < "medium":
        analysis["recommendation"] = "update_planning"
    elif analysis["technical_debt"] > "high":
        analysis["recommendation"] = "fix_implementation"
    else:
        analysis["recommendation"] = "document_deviation"
    
    return analysis
```

## Version Control Integration

### Planning Version Schema
```json
{
  "current_version": "1.3",
  "versions": [
    {
      "version": "1.0",
      "timestamp": "2024-01-15T10:00:00Z",
      "type": "initial",
      "author": "planning_mode",
      "changes_summary": "Initial feature planning"
    },
    {
      "version": "1.1", 
      "timestamp": "2024-01-15T14:30:00Z",
      "type": "implementation_sync",
      "author": "auto_sync",
      "changes_summary": "Added rate limiting, simplified Redis to in-memory",
      "implementation_trigger": "component_detection"
    },
    {
      "version": "1.3",
      "timestamp": "2024-01-15T16:30:00Z", 
      "type": "implementation_sync",
      "author": "auto_sync",
      "changes_summary": "Security improvements: argon2, input sanitization",
      "implementation_trigger": "dependency_change"
    }
  ]
}
```

### Rollback Capability
```
User: "rollback planning to v1.1"
→ Restore planning file to version 1.1
→ Mark v1.2, v1.3 as "archived"  
→ Preserve implementation files (warn about mismatch)
→ Update session state to reflect rollback
```

## Quality Assurance

### Sync Quality Metrics
- **Accuracy**: % of implementation changes correctly detected
- **Completeness**: % of planning sections properly updated  
- **Timeliness**: Average time from implementation to sync
- **User Satisfaction**: User acceptance rate of sync suggestions

### Validation Rules
```python
sync_validation_rules = {
    "component_detection": {
        "min_confidence": 0.8,
        "require_file_analysis": True,
        "verify_imports": True
    },
    "dependency_changes": {
        "verify_package_json": True,
        "security_scan": True,
        "license_check": True
    },
    "architecture_deviations": {
        "impact_threshold": "medium",
        "require_justification": True,
        "business_approval": False  # auto-approve for solo dev
    }
}
```

## Integration Points

### With Session Continuity
- Sync state preserved across chat sessions
- Planning versions tracked in session-state.json
- Resume sync operations after interruption

### With Mode System
- **Quick Mode**: Minimal sync (major changes only)
- **Detailed Mode**: Comprehensive sync with full analysis
- **Continue Mode**: Check for pending syncs on resume
- **Implement Mode**: Real-time sync during implementation

### With Quality Standards
- Sync updates must maintain planning file quality
- All syncs logged for audit trail
- User preferences respected (auto vs manual sync)

This intelligence system ensures planning documents remain accurate and valuable throughout the entire development lifecycle.