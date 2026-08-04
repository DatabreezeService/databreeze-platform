# CodeRabbit disposition for promotion PR 51

Review invocation: one automatic full review was requested on PR #51
(`4853416975`). After the final push, repository automation emitted a follow-up
status review for head `365c080` (run `57535106-acc4-4eed-a227-99fd2c53e2fe`);
no second review was manually invoked. Its four additional findings were
reproduced and addressed below.

## Resolution

All 35 findings from the requested review plus the four automated follow-up
findings were reproduced against the reviewed Folder Autopilot slice and
classified as valid. They are addressed in focused commits on
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
- Follow-up hardening normalizes invalid engine timestamps, preserves Desktop
  receipts when a later operation fails, maps unavailable approval/undo facades
  to HTTP 503, and proves owner-versus-sibling assignment reads in the service
  test.

No comments were rejected as invalid. The module remains a content-free,
testable slice; this disposition does not promote unimplemented FA P0/P1
requirements to `verified`.

## Evidence

- TypeScript domain: 156 tests passed.
- API: 497 tests passed; Prisma validation/generation and OpenAPI checks passed.
- Web: 33 tests and typecheck passed.
- Engine: 143 tests, Ruff, and mypy passed.
- Android: `testDebugUnitTest` and `assembleDebug` passed with the local SDK.
