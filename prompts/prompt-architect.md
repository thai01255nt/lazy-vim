# Prompt Architecture Guide

## Overview

This guide documents the complete LLM workflow system for structured software development, from initial planning through implementation and enhancement.

## System Architecture

### Core Components

#### 1. Foundation Files

- **`core-rules.txt`**: Universal rules for all LLM interactions
  - Anti-hallucination measures
  - Code standards and quality requirements
  - Direct file editing (no diff/patch)
  - Security and testing standards

#### 2. Template Files

- **`PROJECT-OVERVIEW-TEMPLATE.md`**: Comprehensive project documentation template
  - Tech stack, architecture, components
  - Mermaid diagrams for visualization
  - Feature breakdown and design principles
- **`TASKS-TEMPLATE.md`**: Task management template
  - Status tracking system (`[ ]`, `[⏳]`, `[x]`, `[❌]`, `[⏸️]`)
  - Project overview integration
  - Task lifecycle management

#### 3. Workflow Steps

**Sequential processing steps with context dependency:**

- **`step-planning.txt`**: Initial brainstorming and architecture planning
  - Feature analysis and approach exploration
  - Planning file generation in `.claude/custom/planning/`
  - Architecture decision documentation

- **`step-tasks.txt`**: Task breakdown from planning
  - Converts planning into actionable tasks
  - Task file generation in `.claude/custom/tasks/`
  - Progress preservation and change tracking

- **`step-1-context.txt`**: Context gathering and analysis
  - Requires completed planning and tasks files
  - Codebase pattern analysis
  - Integration point identification

- **`step-2-skeleton.txt`**: Structural framework generation
  - Depends on step-1 context
  - No implementation logic, structure only
  - Complete typing and documentation

- **`step-3-review.txt`**: Implementation review and validation
  - Pattern consistency checking
  - Quality validation against standards
  - Planning alignment verification

- **`step-4-enhance.txt`**: Extension and optimization
  - Skeleton enhancement
  - Performance and security improvements
  - Integration enhancements

- **`step-5-implement.txt`**: Business logic implementation
  - Convert skeleton methods to working code
  - Implement business logic and data processing
  - Add validation, error handling, and integrations

#### 4. Specialized Assistants

- **`step-project-overview.txt`**: PROJECT-OVERVIEW.md creation/update specialist
  - Auto-detects existing files
  - Codebase scanning and analysis
  - Technology stack recommendations
  - Architecture pattern identification

## Workflow Logic

### File Organization Strategy

```
.claude/custom/
├── planning/           # Feature planning documents
│   ├── feature-a.md
│   └── feature-b.md
└── tasks/              # Task breakdown files
    ├── feature-a.md    # Mirrors planning filename
    └── feature-b.md
```

### Context Dependencies

1. **Planning Phase**: Independent, generates planning files
2. **Task Phase**: Requires planning file, generates tasks file
3. **Context Phase**: Requires both planning and tasks files
4. **Implementation Phases**: All require context from step-1

### State Management

- **Progress Preservation**: Completed tasks (`[x]`) never lose status
- **Change Tracking**: New/updated/obsolete tasks clearly marked
- **Status Transitions**: Clear progression from `[ ]` → `[⏳]` → `[x]`
- **Dependency Handling**: Blocked tasks (`[⏸️]`) with clear reasons

## Key Design Principles

### 1. Context Continuity

- Each step builds on previous steps
- Context is preserved within chat sessions
- Missing context triggers re-execution prompts

### 2. File Management

- Consistent naming between planning and tasks files
- Auto-detection of existing files
- Update mode preserves existing content

### 3. Quality Assurance

- Built-in quality checklists at each step
- Pattern consistency enforcement
- Security and performance considerations

### 4. Flexibility

- Can start from any step if files exist
- Supports both new and existing projects
- Handles partial implementations

## Usage Patterns

### New Feature Development

1. Run `step-planning` → Create planning document
2. Run `step-tasks` → Break down into tasks
3. Run `step-1-context` → Gather context
4. Run `step-2-skeleton` → Generate structure
5. Implement manually or with further steps

### Existing Project Enhancement

1. Run `step-project-overview` → Update documentation
2. Run `step-planning` → Plan enhancements
3. Continue with normal workflow

### Code Review and Optimization

1. Run `step-1-context` → Analyze current state
2. Run `step-3-review` → Review implementation
3. Run `step-4-enhance` → Suggest improvements

## Integration Points

### With Development Tools

- **Direct file editing**: No diff/patch complexity
- **Codebase scanning**: Automatic pattern detection
- **Documentation sync**: Keep docs aligned with code

### With Project Management

- **Task tracking**: Clear status and progress
- **Dependency management**: Blocked task handling
- **Change management**: Planning file updates

## Error Handling

### Missing Dependencies

- Clear error messages when required files missing
- Guidance on which step to run first
- Auto-detection of available files

### Context Loss

- Session context preservation
- Fallback to file-based context
- Re-execution prompts when needed

## Best Practices

### For LLM Operators

1. Always start with planning for new features
2. Maintain file naming consistency
3. Preserve task progress during updates
4. Use context checks before implementation steps

### For Developers

1. Review generated planning documents
2. Update task status regularly
3. Keep PROJECT-OVERVIEW.md current
4. Follow established patterns from context analysis

## Extensibility

### Adding New Steps

- Follow context dependency model
- Include quality checklists
- Provide clear error handling
- Document integration points

### Customizing Templates

- Maintain core structure
- Add project-specific sections
- Keep placeholder conventions
- Update related workflow steps

This architecture provides a comprehensive, structured approach to LLM-assisted software development while maintaining flexibility and quality standards.

