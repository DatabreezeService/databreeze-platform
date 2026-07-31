# DataBreeze Documentation

This directory is the authoritative design source for the DataBreeze platform. It describes the product before implementation, records system-wide constraints, and defines testable behavior for each platform and product module.

The suite was reviewed in the legacy `BE_DataBreeze` repository and migrated into this clean `databreeze-platform` monorepo through the integrity gate in ADR-0001. Legacy source code in `BE_DataBreeze` and `FE_Databreeze` is reference-only and is not an implementation base for this platform.

## Reading Order

1. [Product documentation index](product/README.md)
2. [Product definition](product/product-definition.md)
3. [Platform and feature matrix](product/platform-feature-matrix.md)
4. [Users and use cases](product/users-and-use-cases.md)
5. [Product principles](product/product-principles.md)
6. [Canonical terminology](product/terminology.md)
7. [Architecture documentation index](architecture/README.md)
8. [System architecture](architecture/system-architecture.md)
9. [Specification index](specs/README.md)
10. The applicable foundation, platform, and feature specifications
11. [Architecture decisions](decisions/)
12. An approved implementation plan in `plans/`

## Documentation Map

| Area | Purpose |
|---|---|
| `product/` | Defines what DataBreeze is, who it serves, its language, principles, and delivery sequence. |
| `architecture/` | Defines system boundaries, data flow, security, synchronization, performance, extensibility, and delivery rules. |
| `specs/` | Contains normative, testable product requirements grouped by foundation, platform, and feature. |
| `decisions/` | Records important choices and the alternatives that were rejected. |
| `plans/` | Contains implementation sequencing created only after the relevant specifications are approved. |
| `operations/` | Will contain deployment, incident, backup, restoration, and support runbooks as implementation begins. |
| `superpowers/specs/` | Historical design material. A file there may be superseded by this suite. |

## Authority and Change Rules

- Only documents listed in the Documentation Map, accepted ADRs in `decisions/`, and approved implementation plans in `plans/` are normative. Unlisted artifacts at the repository root or elsewhere are legacy reference-only; useful material must migrate into `docs/legacy/`, while temporary material must be removed before the monorepo migration gate closes.
- Specifications use stable requirement IDs. IDs are never reused for a different meaning.
- A changed requirement keeps its ID when its intent remains the same and increments the document version.
- A removed requirement is marked retired rather than silently deleted after implementation has begun.
- Architecture decisions explain why; specifications state what must be true.
- Implementation plans may choose sequence and tactics but cannot weaken accepted requirements.
- Code, API schemas, database migrations, tests, and user documentation must link back to applicable requirements.
- Vietnamese is the default product language. English is maintained as a complete secondary language.

## Status Vocabulary

- **Draft:** Still being designed and not an implementation commitment.
- **Product specification:** Accepted design awaiting final written review.
- **Approved:** Reviewed and ready for implementation planning.
- **Implemented:** Released and verified against its acceptance criteria.
- **Superseded:** Retained for history but replaced by a linked document.
