# DataBreeze Repository Instructions

## Authority

- Read `docs/README.md` before planning product work.
- Treat accepted ADRs and stable requirement IDs in `docs/specs/` as authoritative.
- Do not weaken security, tenant isolation, evidence, data-mode, retention, approval, or audit requirements in an implementation plan.
- Link implementation tasks and tests to applicable requirement IDs.

## Repository Boundaries

- Web and Desktop may share React/TypeScript packages; Android remains native Kotlin/Compose.
- The API is a NestJS/Fastify modular monolith; processing lives in the Python engine.
- Clients consume generated contracts and never import service implementation code.
- Feature modules use foundation contracts and never read another feature's persistence directly.
- Workers and devices use authenticated APIs and signed typed jobs; they do not receive database credentials or arbitrary commands.

## Change Discipline

- Preserve unrelated work and never commit customer data, runtime artifacts, secrets, credentials, local databases, generated reports, or Office lock files.
- Keep Vietnamese the default product locale and English complete.
- Update specifications before implementation when a material ambiguity or boundary change is discovered.
- Do not begin a product slice without an approved plan in `docs/plans/`.
- Verify contract generation, tenant scope, local/cloud parity, and relevant requirement-linked tests before completion claims.
