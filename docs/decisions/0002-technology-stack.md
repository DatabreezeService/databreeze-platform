# ADR-0002: Use TypeScript for Product Surfaces and Control Plane, Kotlin for Android, and Python for Processing

**Status:** Accepted<br>
**Date:** 2026-07-31

## Context

DataBreeze needs a full Web application, a deeply integrated Windows agent, an Android-only capture application, a multi-tenant control plane, and strong spreadsheet/document/data processing.

The stack must be maintainable by a small team and implementation agents, use mature ecosystems, support independent release, and remain suitable for long-lived business data.

Because the product will start in a clean repository, preserving Java is no longer a controlling requirement.

## Decision

### Shared TypeScript workspace

- Active LTS Node.js line pinned and upgraded on a scheduled cadence
- `pnpm`, Corepack, and Turborepo
- Strict TypeScript, ESLint, formatting, dependency-boundary checks, and generated contracts

### Web

- React, TypeScript, and Vite
- React Router and TanStack Query
- Tailwind CSS with accessible Radix/shadcn-style primitives
- React Hook Form and Zod for client interaction
- Vitest, React Testing Library, and Playwright

### Windows Desktop

- Electron with React, TypeScript, and Vite
- Electron Forge for packaging and signed updates
- Renderer sandbox and context isolation
- SQLite for local durable state
- OS credential vault and a bundled signed Python sidecar

### Android

- Native Kotlin and Jetpack Compose
- Coroutines and Flow, ViewModel, repository-based layered architecture
- Room, WorkManager, CameraX, Android Share, scoped storage, and Keystore
- Gradle wrapper and version catalog

### Control-plane API

- NestJS modular monolith with Fastify
- Prisma ORM for ordinary transactional persistence and SQL migrations
- PostgreSQL-specific typed or reviewed SQL for measured queries Prisma cannot express efficiently
- OpenAPI generation, structured validation, and explicit domain/application/adapter layers
- PostgreSQL outbox plus Redis Streams for dispatch

### Processing engine

- Supported Python release pinned with `uv`
- Pydantic contracts
- Polars and DuckDB for analytical/tabular work; pandas only where library compatibility requires it
- openpyxl for supported spreadsheet manipulation
- PyMuPDF/pdfplumber and replaceable OCR adapters
- Ruff, static typing, pytest, property tests, and golden fixtures
- Cloud worker entry point and PyInstaller-packaged Windows sidecar from the same package

### Durable infrastructure

- PostgreSQL as the source of truth
- S3-compatible object storage
- Redis for streams, locks, rate limits, cache, and ephemeral progress
- Docker Compose locally and managed services in production
- OpenTelemetry and structured logs
- GitHub Actions for CI, signing, and release

## Why

- Web, Desktop, and API share one language and a large tooling ecosystem.
- Electron shares React UI and product logic while providing mature Windows packaging and OS integration.
- Native Kotlin avoids React Native bridges for Android Share, background work, scoped storage, camera, and offline capture.
- Python provides the strongest practical libraries for the processing modules and can run locally and in the cloud.
- NestJS provides modular structure, dependency injection, OpenAPI support, and a Fastify adapter without retaining a Java layer solely for legacy reasons.
- PostgreSQL and versioned contracts keep durable state independent from any runtime language.

## Alternatives

### Spring Boot control plane

Viable and mature, but rejected for the clean start because it adds another primary language and prevents sharing control-plane contracts and tooling with the TypeScript product surfaces. The legacy backend’s code quality is not strong enough to offset that cost.

### Expo React Native Android

Rejected for the primary Android app. Expo is productive, but DataBreeze is Android-only initially and depends heavily on native capture, background, intents, storage, and device security. Native Kotlin removes bridge and framework-layer risk.

### Kotlin Compose Desktop

Rejected because it creates another UI stack and provides less direct sharing with Web. It remains technically viable if Electron’s measured footprint becomes unacceptable.

### Tauri

Deferred. Its smaller footprint is attractive, but Rust adds another implementation ecosystem and Electron provides faster delivery and more mature packaging for the current team.

### All-Python or all-TypeScript processing

Rejected. Neither should be forced into responsibilities where the other ecosystem provides materially better correctness and libraries.

## Consequences

- The repository uses three languages, but each has a narrow responsibility.
- Generated OpenAPI and JSON Schema contracts are mandatory to prevent drift.
- Electron footprint must be budgeted and measured.
- Prisma is not used to hide PostgreSQL; complex measured queries may use reviewed TypedSQL/SQL.
- Python sidecar signing, IPC validation, and packaging are first-class security work.
- Android does not share UI code with Web/Desktop but shares contracts, behavior, terminology, fixtures, and design tokens through generation.

## Upgrade Policy

- Use supported release lines, not unpinned “latest.”
- Lock dependencies and automate reviewed update pull requests.
- Schedule framework and runtime upgrades at least quarterly.
- Run compatibility, golden-fixture, performance, and installer tests before major upgrades.
- Critical security updates may shorten the normal client support window.
