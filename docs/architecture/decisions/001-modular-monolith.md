# 001. Modular Monolith Architecture

## Status

Accepted

## Context

Global Experiment v0.1 needs several public-facing features (Home,
Documentation, and later Treasury, Donations, Waitlist, Feedback, Issues,
Contribution) plus multiple third-party integrations (Notion, Stripe, Wise,
email, AI, analytics). The client's long-term direction (v1) is a much
larger governance/UGC platform. Low operating cost, a small team, and the
long-term goal of self-hosting on Hetzner all argue against premature
distributed-systems complexity.

## Decision

Build a single Next.js (App Router, TypeScript) application structured as a
modular monolith: one deployable unit, internally divided into modules with
domain/application/infrastructure/UI layering. Domain and application code
never import a third-party SDK directly; provider-specific code is isolated
under `src/integrations/*` or a module's `infrastructure/` folder.

## Why Chosen

- Matches actual v0.1 scale (a public information site plus a handful of
  integrations).
- Keeps operational cost and complexity low, consistent with the project's
  low-operating-cost and self-hosting goals.
- Strong internal boundaries make it possible to extract a service later if
  v1 scale genuinely requires it, without having paid the operational cost
  of microservices/Kafka/Kubernetes prematurely.

## Alternatives Considered

- **Microservices from day one** — rejected: no current scale justifies the
  operational overhead (multiple deployments, service discovery, network
  reliability concerns), and it would slow M1 delivery without benefit.
- **Unstructured single Next.js app with no internal boundaries** —
  rejected: would tightly couple domain logic to Notion/Stripe/Wise SDKs,
  making the planned v1 migration (especially away from Notion) far more
  expensive.

## Trade-offs

- Requires discipline to maintain the domain/infrastructure boundary as the
  codebase grows; there is no runtime enforcement (no separate deployable
  forcing isolation), only code structure and review.
- All modules currently scale and deploy together; if one module's resource
  needs diverge significantly in the future, extracting it will require
  deliberate work.

## Future Migration Implications

If v1 scale eventually requires it, a well-isolated module (e.g. a future
governance/voting module) can be extracted into a separate service at
comparatively low cost, because domain logic never depended on being
in-process with other modules' infrastructure code.
