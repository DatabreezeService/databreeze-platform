# Repository CLI

Cross-platform repository checks for Windows and CI.

`node tools/repo-cli/src/check-dependency-boundaries.mjs` scans the repository for
client-to-service implementation imports, cross-feature persistence imports, and
workspace packages without public `exports` declarations or imports of their private
subpaths. Root `pnpm lint` runs this checker after ESLint.

`pnpm requirements:generate` reads the normative Markdown requirement tables in
`docs/specs/foundation`, `docs/specs/features`, and `docs/specs/platforms` and writes
`docs/specs/requirement-index.json`. `pnpm requirements:check` verifies that the
committed index has no drift; root `pnpm repo:check` includes that verification.
