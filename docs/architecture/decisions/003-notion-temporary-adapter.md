# 003. Notion as a Temporary Adapter Behind Repository Interfaces

## Status

Accepted

## Context

Notion is used in v0.1 as a fast, low-cost CMS/editorial and review
interface, starting with Documentation and later extending to Treasury
review and feedback/issue review. The client has explicitly confirmed
Notion is temporary and will be replaced by a self-hosted solution in v1.
Domain/application code and UI must not need to change when that
replacement happens.

## Decision

Every Notion-backed capability is accessed through a domain-owned
repository interface (e.g. `DocumentationRepository` with
`listPublished()` / `getBySlug()`), implemented in v0.1 by a
`NotionDocumentationRepository`. The Notion SDK and any Notion-specific
types (block shapes, property names) are confined to
`src/integrations/notion/` and the relevant module's `infrastructure/`
folder. Notion responses are mapped into application-owned TypeScript types
before crossing into `application/` or `ui/` code.

## Why Chosen

- Directly satisfies the requirement that v1 can replace Notion with a
  self-hosted system "without rebuilding the frontend or business logic" —
  the swap is implementing a new class against an existing interface (e.g.
  a future `PostgresDocumentationRepository`).
- Keeps Notion's editorial conveniences (fast to use for non-technical
  reviewers today) without letting its schema leak into long-lived
  application code.

## Alternatives Considered

- **Call the Notion SDK directly from route handlers/components** —
  rejected: fastest to build, but ties UI and business logic to Notion's
  data shapes; the swap to a self-hosted CMS in v1 would require touching
  every call site.
- **Sync Notion into Postgres as a cache/mirror now** — considered for the
  future (e.g. on-demand revalidation), not needed for M1 given content
  volume (~10 articles) and low change frequency; time-based revalidation
  is sufficient today.

## Trade-offs

- An extra mapping layer (Notion block → internal content model) adds code
  a direct integration wouldn't need — accepted as the cost of the future
  migration path.
- The v0.1 adapter must handle Notion's own inconsistencies, rate limits,
  and schema quirks; this complexity is isolated but not eliminated.

## Future Migration Implications

Replacing Notion means writing a new repository implementation (e.g.
Postgres-backed) satisfying the same interface, and updating the
composition point that decides which implementation to use. No change is
expected in `application/` use-cases or `ui/` rendering components,
provided the new implementation continues to produce the same internal
content model.
