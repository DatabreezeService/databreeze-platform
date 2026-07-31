# Fixture Validation

Cross-runtime fixture parity for generated contract consumers.

`src/run-contract-parity.mjs` type-checks the valid fixtures against generated TypeScript types,
validates every shared payload with the canonical Ajv registry, runs the generated Pydantic v2
models under the frozen uv environment, and compiles/runs the generated standard-Kotlin models
under the checksummed Gradle/JDK 21 harness. Kotlin rejects invalid JSON with NetworkNT JSON Schema
2020-12 validation before generated model construction.

Run from the repository root:

```sh
corepack pnpm --filter @databreeze/fixture-validation parity
```

The command emits one deterministic JSON summary and fails if a runtime disagrees with the fixture
manifest or another runtime. It requires uv 0.11.32 and JDK 21 on `PATH`; `DATABREEZE_UV` and
`DATABREEZE_JAVA` may point to those executables without committing machine-specific paths.
