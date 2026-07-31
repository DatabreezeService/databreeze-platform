# DataBreeze

DataBreeze is a Vietnamese-first, local-first business data workspace that turns user-controlled files, documents, photos, voice notes, and datasets into trustworthy actions and reports.

> Your data work, handled.

## Current Phase

The complete product and technical specification is present. Product implementation has not started; the next authorized step is an approved implementation plan derived from the specifications.

## Start Here

- [Documentation index](docs/README.md)
- [Product definition](docs/product/product-definition.md)
- [Platform and feature matrix](docs/product/platform-feature-matrix.md)
- [System architecture](docs/architecture/system-architecture.md)
- [Specification index](docs/specs/README.md)
- [Product roadmap](docs/product/roadmap.md)

## Repository Shape

- `apps/`: Web, Windows Desktop, and Android applications
- `services/`: TypeScript control plane and Python processing engine
- `packages/`: generated contracts and reusable TypeScript assets
- `infrastructure/`: local, environment, and observability definitions
- `tools/`: repository, contract-generation, and fixture-validation tooling
- `docs/`: authoritative product, architecture, decision, and specification records

The applications and services will be independently buildable and releasable even though they share this repository.
