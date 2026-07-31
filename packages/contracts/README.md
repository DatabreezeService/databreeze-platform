# Contracts

Canonical OpenAPI, JSON Schema, event, typed-job, and compatibility definitions used to generate TypeScript, Kotlin, and Pydantic models.

## Public interfaces

- `manifest.json` is the deterministic registry for canonical source schemas.
- `schemas/v1/*.schema.json` contains closed JSON Schema 2020-12 definitions with stable absolute IDs and references.
- `generated/typescript/v1/index.ts` exports structural TypeScript contracts for Web, Desktop, and API consumers.
- `generated/kotlin/src/main/kotlin/com/databreeze/contracts/v1/Models.kt` provides standard Kotlin models in `com.databreeze.contracts.v1`.
- `generated/python/databreeze_contracts/v1` is the Pydantic v2 model package for Python consumers.
- Consumers import only the entry points declared in `package.json#exports`.

The v1 base schemas provide UUID identifiers and UTC timestamps (IAM-001), complete tenant ancestry (IAM-019), correlation and actor metadata (AUD-004), RFC-compatible public problems (INT-021), idempotent commands (INT-004), cursor pages (INT-005), and canonical events (AUD-004, AUD-006, and INT-008). This is partial foundation coverage; it does not implement those requirements' persistence or runtime behavior.

## Local commands

```text
corepack pnpm --filter @databreeze/contracts test
corepack pnpm --filter @databreeze/contracts build
corepack pnpm --filter @databreeze/contracts generate
corepack pnpm --filter @databreeze/contracts generate:check
```

`generate` is the only supported way to update checked-in language models. Do not edit files below `generated/` by hand. `generate:check` regenerates into a temporary directory, byte-compares the complete expected file set, and reports missing, stale, or unexpected files without changing checked-in output. `test` compiles the real schemas with Ajv's JSON Schema 2020-12 validator and exercises generator behavior plus hand-authored protocol payloads. `build` compiles every manifest entry and checks generated-file drift.

## Forbidden dependencies

This package contains protocol definitions only. It must not import application or service implementations, persistence adapters, framework code, or generated consumer models.
