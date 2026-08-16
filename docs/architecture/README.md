# Architecture Documentation Index

**Status:** Product specification<br>
**Version:** 1.0

| Document | Authority |
|---|---|
| [System architecture](system-architecture.md) | Runtime boundaries, deployables, ownership, and non-negotiable constraints |
| [Monorepo structure](monorepo-structure.md) | Clean repository layout and dependency direction |
| [Domain and data model](domain-and-data-model.md) | Shared entities, tenant scope, immutability, lineage, and persistence rules |
| [Processing and job system](processing-and-job-system.md) | Typed execution, routing, states, retry, review, and result acceptance |
| [Local, cloud, and offline synchronization](local-cloud-sync.md) | Data modes, scope-bound cursors, conflicts, content transfer, and recovery |
| [Security and privacy](security-and-privacy.md) | Trust boundaries, authorization, temporary data, providers, and release gates |
| [Extensibility](extensibility.md) | Contracts for modules, processors, rules, connectors, imports, and exports |
| [Performance and reliability](performance-and-reliability.md) | Reference profiles, budgets, failure domains, recovery, and capacity |
| [Testing and delivery](testing-and-delivery.md) | Contract, cross-platform, security, performance, and release verification |
| [Local development and Lightsail pilot](local-and-pilot-development.md) | Database-backed HMR, built local validation, low-cost deployment, and CI/CD flow |

Architecture documents define system-wide constraints. When a feature needs a stricter rule, its normative specification may tighten the constraint but may not silently weaken or bypass it.
