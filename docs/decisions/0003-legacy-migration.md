# ADR-0003: Selectively Reimplement Legacy Behavior

**Status:** Accepted<br>
**Date:** 2026-07-31

## Context

The legacy backend contains authentication, workspaces, Shopee-oriented import/mapping, dashboards, costs, expenses, insights, usage, subscriptions, administration, and early payOS behavior. The frontend contains useful brand and product-interface work.

The repositories also contain structural duplication, limited test coverage, outdated product assumptions, runtime artifacts, possible sensitive configuration history, and implementation choices that do not match the approved platform.

## Decision

Do not merge the old repository histories or copy their source trees into the new monorepo.

Preserve the repositories as read-only archives. Migrate only selected assets, rules, fixtures, and externally required behavior after review.

## Migration Process

For each candidate:

1. Describe the user-visible behavior independently of the old code.
2. Link it to an accepted new requirement.
3. Inspect security, tenant isolation, data assumptions, licensing, and edge cases.
4. Create synthetic characterization fixtures or tests.
5. Reimplement through the new domain and contracts.
6. Compare expected behavior where equivalence is intended.
7. Record intentional differences.
8. Import only sanitized, licensed assets.

## Candidate Material

- DataBreeze logo and approved brand assets
- Vietnamese terminology and useful interaction patterns
- Mapping concepts, row-level error behavior, and synthetic marketplace fixtures
- Workspace and role scenarios
- Profit, cost, expense, or dashboard formulas that remain valid as templates
- payOS behavior if billing later selects payOS through the payment adapter

## Material Not Migrated Directly

- Secrets, environment configuration, credentials, or Git history containing them
- Uploaded files, generated reports, local databases, build outputs, or runtime storage
- Entity/controller/package structure
- Development-only endpoints or seed credentials
- Vendor-specific assumptions as core domain fields
- Duplicate DTOs, enums, or nested project copies
- Code without an accepted requirement or safe characterization

## Historical Data

No production data migration is assumed. If real legacy customers or data exist, a separate audited migration specification must define:

- source inventory and ownership
- legal basis and consent
- field mapping and loss report
- credential rotation
- dry run, reconciliation, rollback, and deletion
- customer communication

## Consequences

- Initial implementation rewrites more behavior but avoids inheriting hidden coupling and vulnerabilities.
- Useful legacy knowledge remains available.
- Git blame begins cleanly for the new architecture.
- Parity is required only where the new specification says so.

## Archive Requirements

- Mark both repositories archived/read-only after the new repository is established.
- Rotate any credential that may have appeared in repository history.
- Preserve tags and issues for reference.
- Add a final README linking to the new repository and stating that legacy code is unsupported.
