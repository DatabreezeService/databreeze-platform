# Development Troubleshooting

## Repository checks fail on formatting

Run `corepack pnpm exec prettier --write <changed-files>` and repeat the check.
Do not reformat unrelated fixtures; if a baseline fixture is intentionally
changed, make that a separate `fix:` commit with a reason.

## pnpm cannot resolve the workspace

Run `corepack pnpm --version`, confirm it is `11.18.0`, then run
`corepack pnpm install --frozen-lockfile`. Do not regenerate the lockfile as a
side effect of a feature task. If the package store is intentionally offline,
use `--offline` and report the missing package instead of changing versions.

## Engine checks fail

Use the repository's `uv` version and run `uv lock --check --offline` followed by
`uv sync --locked --offline`. The engine deliberately refuses to download a
different interpreter or dependency during its task commands. Remove only the
task-created `.venv` if a local environment is corrupt, then repeat the locked
sync.

## Android checks fail

Use `apps/android/gradlew` rather than a globally installed Gradle. Set
`sdk.dir` in the ignored `apps/android/local.properties` only on the local
machine. Never commit that file, SDK paths, signing keys, APKs, or emulator
state. A missing emulator is an environment limitation, not a reason to alter
the application security configuration.

## Local dependencies are unhealthy

Run `corepack pnpm local:smoke -- --help`, inspect the named Docker volumes,
and restart only the disposable local stack. The smoke command is read-only
apart from creating its own temporary marker. Never delete a path outside the
repository or use production credentials to make local services pass.

## A generated contract drifts

Change the canonical OpenAPI/JSON Schema source, regenerate all consumers, and
inspect the diff. Do not hand-edit TypeScript, Kotlin, or Python generated
models. Add a compatibility note and migration window for a breaking change.
