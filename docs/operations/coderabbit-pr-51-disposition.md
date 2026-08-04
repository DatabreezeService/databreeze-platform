# CodeRabbit disposition for promotion PR 51

Review invocation: one automatic full review on PR #51 (`4853416975`). No
second CodeRabbit review is requested for this pull request.

## Resolution

All 35 reported findings were reproduced against the reviewed Folder Autopilot
slice and classified as valid. They are addressed in focused commits on
`feat/folder-autopilot-20260804`:

- Desktop observation/action/journal limits, recovery state, copy undo policy,
  runtime validation, partial receipts, JSON-safe timestamps, and path/collision
  handling were hardened.
- Engine stable execution keys, generated-name bounds, and case-folded
  destination collisions are validated before a plan is ready.
- API persistence reads now serialize with in-memory transactions, production
  composition rejects an implicit in-memory adapter, assignment idempotency is
  scope-safe, and state updates use compare-and-set revisions.
- API list failures preserve rejection codes and HTTP status, OpenAPI rejection
  responses are documented, and profile decision reasons are bounded.
- Dashboard projections expose raw identifiers/version/mode/timestamps rather
  than English display strings; assignment `updatedAt` is persisted and changed
  on state transitions.
- Web mutations surface failures, refresh profile projections, enforce positive
  revisions and bounded undo windows, require runtime UUID randomness, and keep
  all displayed copy localized.
- Android approvals validate ISO expiry before queueing or deciding, disable
  expired actions, and localize assignment, watcher, approval, outcome, undo,
  and severity states in Vietnamese and English.

No comments were rejected as invalid. The module remains a content-free,
testable slice; this disposition does not promote unimplemented FA P0/P1
requirements to `verified`.

## Evidence

- TypeScript domain: 156 tests passed.
- API: 497 tests passed; Prisma validation/generation and OpenAPI checks passed.
- Web: 33 tests and typecheck passed.
- Engine: 142 tests, Ruff, and mypy passed.
- Android: `testDebugUnitTest` and `assembleDebug` passed with the local SDK.
