# Project Goal
<!-- AUTO-GENERATED:BEGIN project-goal -->
A small account service for a SaaS product: people register with an email and password and sign in. Success: users
can get into their account without contacting support.
<!-- AUTO-GENERATED:END project-goal -->

# Domain Logic
<!-- AUTO-GENERATED:BEGIN domain-logic -->
- An email address belongs to at most one account, compared without letter case.
- Passwords are never stored in readable form.
<!-- AUTO-GENERATED:END domain-logic -->

# User Flows
<!-- AUTO-GENERATED:BEGIN user-flows -->
- Register: visitor → enters email + password → account created (or "email already used").
- Sign in: user → enters email + password → account home.
<!-- AUTO-GENERATED:END user-flows -->

# Glossary
<!-- AUTO-GENERATED:BEGIN glossary -->
- See .hitl/specs/GLOSSARY.md.
<!-- AUTO-GENERATED:END glossary -->

# Notes
Support team: 2 people, office hours only. Admins are support staff with a back-office login.
