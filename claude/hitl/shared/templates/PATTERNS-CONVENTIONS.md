# Naming Patterns
<!-- AUTO-GENERATED:BEGIN naming-patterns -->
- **Files**: [convention, e.g. camelCase.ts under src/<layer>/]
- **Classes**: [convention]
- **Methods**: [convention]
- **Tests**: [file naming + title style]
<!-- AUTO-GENERATED:END naming-patterns -->

# Code Patterns
<!-- AUTO-GENERATED:BEGIN code-patterns -->
- **Error Handling**: [pattern, e.g. typed error classes thrown from services]
- **Data Validation**: [approach / library]
- **Logging**: [logger + structure]
- **Dependency Injection**: [constructor injection / module singletons / none]
<!-- AUTO-GENERATED:END code-patterns -->

# Architecture Patterns
<!-- AUTO-GENERATED:BEGIN architecture-patterns -->
- **Component Structure**: [layering / organization]
- **Data Flow**: [request → layer → layer → storage]
<!-- AUTO-GENERATED:END architecture-patterns -->

# Testing Conventions
<!-- AUTO-GENERATED:BEGIN testing-conventions -->
- **Framework**: [node:test | vitest | jest | pytest | unittest] (+ property lib if present: fast-check / hypothesis)
- **Location**: [tests/ | __tests__/ | next to source]
- **Naming**: [*.test.ts | test_*.py], titles `T-n.ACk …` for HITL tests
- **Fixtures**: [factories / fixtures dir / none]
<!-- AUTO-GENERATED:END testing-conventions -->

# Notes
Text outside AUTO-GENERATED blocks is MANUAL and is never changed by /hitl:overview.
