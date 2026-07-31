# Repository CLI

Cross-platform repository checks for Windows and CI.

`node tools/repo-cli/src/check-dependency-boundaries.mjs` scans the repository for
client-to-service implementation imports, cross-feature persistence imports, and
workspace packages without public `exports` declarations or imports of their private
subpaths. Root `pnpm lint` runs this checker after ESLint.
