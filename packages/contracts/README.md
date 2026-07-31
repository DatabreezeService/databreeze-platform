# Contracts

Canonical OpenAPI, JSON Schema, event, typed-job, and compatibility definitions used to generate TypeScript, Kotlin, and Pydantic models.

## Public interfaces

- `manifest.json` is the deterministic registry for canonical source schemas.
- `schemas/v1/*.schema.json` contains closed JSON Schema 2020-12 definitions with stable absolute IDs and references.
- Consumers import only the entry points declared in `package.json#exports`.

The v1 base schemas provide UUID identifiers and UTC timestamps (IAM-001), complete tenant ancestry (IAM-019), correlation and actor metadata (AUD-004), RFC-compatible public problems (INT-021), idempotent commands (INT-004), cursor pages (INT-005), and canonical events (AUD-004, AUD-006, and INT-008). This is partial foundation coverage; it does not implement those requirements' persistence or runtime behavior.

## Local commands

```text
corepack pnpm --filter @databreeze/contracts test
corepack pnpm --filter @databreeze/contracts build
```

`test` compiles the real schemas with Ajv's JSON Schema 2020-12 validator and exercises hand-authored protocol payloads. `build` compiles every manifest entry without generating language models; cross-language generation belongs to Task 5.

## Forbidden dependencies

This package contains protocol definitions only. It must not import application or service implementations, persistence adapters, framework code, or generated consumer models.
