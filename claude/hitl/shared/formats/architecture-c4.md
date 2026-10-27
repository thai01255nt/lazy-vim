# Architecture diagrams (C4, optional)

Sources (references only): the C4 model by Simon Brown — https://c4model.com/ (site content CC BY 4.0; levels: system
context, container, component, code) · Mermaid C4 diagrams (`C4Context`, `C4Container`; marked experimental by
Mermaid) — https://mermaid.js.org/syntax/c4.html.

Use in design.md `## Architecture (C4)` when the change adds or changes a system boundary, an external system or a
container (deployable/runnable unit, data store). Levels 1–2 only (Context, Container); components belong to
`## Components` as text; code-level diagrams never (that is the skeleton). Skip it for a change inside one container.

## Template — Context (level 1)
```mermaid
C4Context
  title <System> — system context
  Person(user, "<Role>", "<what they do>")
  System(sys, "<System>", "<responsibility>")
  System_Ext(ext, "<External system>", "<responsibility>")
  Rel(user, sys, "<uses for …>")
  Rel(sys, ext, "<calls for …>", "<protocol>")
```

## Template — Container (level 2)
```mermaid
C4Container
  title <System> — containers
  Person(user, "<Role>")
  System_Boundary(b, "<System>") {
    Container(web, "<Web app>", "<technology>", "<responsibility>")
    ContainerDb(db, "<Database>", "<technology>", "<what it stores>")
  }
  Rel(user, web, "<uses>", "HTTPS")
  Rel(web, db, "<reads/writes>", "<protocol>")
```

## Fallback (renderers without C4 support)
```mermaid
flowchart LR
  user([Customer]) -->|places orders| shop[Shop<br/>web app]
  shop -->|charges card, HTTPS| psp[[Payment provider<br/>external]]
  shop -->|reads/writes| db[(Orders DB)]
```
Shapes: `([…])` person, `[…]` container/system, `[[…]]` external system, `[(…)]` data store. No lint.
