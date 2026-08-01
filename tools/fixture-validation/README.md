# Fixture Validation

Cross-runtime fixture parity for generated contract consumers.

`src/run-contract-parity.mjs` type-checks valid fixtures through the supported
`@databreeze/contracts/v1` export and sends every valid and invalid payload through that export's
generated TypeScript parser. It also runs the generated Pydantic v2 models under the frozen uv
environment and compiles/runs the generated Kotlin public parser under the checksummed
Gradle/JDK 21 harness.

The TypeScript parser owns its generated Ajv registry. The Kotlin parser embeds the same canonical
schemas, attempts generated-model construction for every parsed fixture, then applies NetworkNT
JSON Schema 2020-12 validation with format assertions. The fixture harness contains no separate
TypeScript or Kotlin acceptance pre-filter.

Run from the repository root:

```sh
corepack pnpm --filter @databreeze/fixture-validation parity
```

The command emits one deterministic JSON summary and fails if a runtime disagrees with the fixture
manifest or another runtime. It requires uv 0.11.32 and JDK 21 on `PATH`; `DATABREEZE_UV` and
`DATABREEZE_JAVA` may point to those executables without committing machine-specific paths.
