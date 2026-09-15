# 005. v0.1 to v1 Evolution Boundaries

## Status

Accepted

## Context

v0.1 is an information/operational foundation release. v1 is a much larger
participant/governance/UGC platform (accounts, forums, voting, bills,
constitution, coefficients, team-based administration with a "roundabout"
review-and-quorum workflow). The client has been explicit that v1
functionality must not be built now, but today's architecture must not make
it difficult to add later.

## Decision

Apply an A/B/C classification to every feature and structural decision:

- **A — Implement now**: genuine v0.1 requirements (e.g. Documentation from
  Notion).
- **B — Establish the boundary, not the feature**: create the seam v1 will
  need, with no more code than current requirements justify (e.g. the
  `DocumentationRepository` interface pattern in ADR 003, the generic
  error/logging foundations, module folder boundaries that a future module
  can occupy without restructuring existing ones).
- **C — Document only**: future v1 concepts are named and described in
  architecture docs so intent isn't lost, but no schema, interface, or code
  is created for them (e.g. Participant, Team, Proposal, Bill, Vote,
  CoefficientDefinition, the audit-consuming governance workflow,
  Tiptap/Yjs collaborative editing, Nextcloud integration).

Concretely, for the current foundation: no `audit_events` table, jobs/outbox
table, or provider abstraction interfaces (AI/email/analytics) are created
until a real module needs them — even though the target architecture
anticipates their existence. The `src/modules/`, `src/integrations/`, and
`src/db/` directories are populated only with folders that have real code
in them.

## Why Chosen

- Prevents the two failure modes the client explicitly warned against:
  rewriting v0.1 for v1 (by ignoring future shape), and speculative v1
  scaffolding that never gets validated against real requirements (by
  building it early).
- Keeps the repository's structure an honest reflection of what's actually
  implemented, which matters for a public, transparency-oriented project.

## Alternatives Considered

- **Scaffold all future modules/tables now as empty stubs** — rejected:
  creates unused code and schema that will likely need revision once v1
  requirements (voting rules, quorum rules, coefficient formulas) are
  actually defined; contradicts the project's own "don't create unused
  architecture" guidance.
- **Design v0.1 without regard for v1 shape** — rejected: would very likely
  force a rewrite of the Documentation/Notion boundary and database access
  patterns once governance/participant features arrive.

## Trade-offs

- Some future work (e.g. defining the audit event schema in detail) will
  need to happen "for real" only when the first concrete auditable action
  exists, rather than being pre-solved now — this is accepted as the
  correct order of operations, not deferred risk.
- Contributors need to actively apply the A/B/C classification to new work
  rather than following a pre-built template; this requires judgment,
  which this ADR and `overview.md` are meant to support.

## Future Migration Implications

When v1 requirements (governance rules, coefficient formulas, participant
model) are defined, they should be added as new modules under
`src/modules/`, new tables under `src/db/schema/`, and new ADRs — extending
the existing module/repository/adapter patterns rather than retrofitting
them onto code that wasn't built with these seams in mind.
