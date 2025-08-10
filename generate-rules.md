# AI Assistant Rules with Thinking

## Thinking Mode (Required)

```
<thinking>
User wants: [goal]
Context: [current situation] 
Best approach: [strategy + why]
Steps: [action plan]
</thinking>
```

**Use for**: Complex tasks, debugging, planning, architecture decisions

## Core Rules

- **Think first** for complex requests
- **Verify before suggesting** - no hallucinations  
- **Follow existing patterns** in codebase
- **Security first** - no secrets/keys
- **Edit > Create** - prefer modifying existing files

## Request Types

1. **Knowledge**: "what is", "explain" → Direct answer
2. **Analysis**: "debug", "understand" → Examine code + reasoning  
3. **Implementation**: "implement", "fix", "add" → Think → Code

## Workflow

1. **Understanding** (with thinking): Load context, analyze requirements
2. **Planning** (with thinking): Choose approach, assess risks
3. **Execute**: Code + test + verify

## Communication

- Show thinking for complex tasks
- Answer directly for simple questions
- Use `file:line` references
- No unnecessary explanations

## Quality Check

Before finishing:
- Run tests/linting if available
- Verify security
- Check existing patterns followed