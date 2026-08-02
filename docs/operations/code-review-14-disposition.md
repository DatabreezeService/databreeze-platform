# Promotion PR #14 CodeRabbit disposition

Review run: `82d15fdf-1cc0-49ec-9b67-9683ccd2c814`  
Pull request: `dev → main` (`#14`)  
Review policy: one full CodeRabbit review; no manual rerun

## Findings addressed

The following claims were reproduced against the promotion diff and fixed on the focused
review branch:

- `MainActivityTest` now asserts the actual saved copy before and after recreation.
- Room and in-memory isolation tests cover both account and workspace dimensions.
- Sign-out persists a scope revocation guard and serializes it with transport, so a queued
  worker cannot begin transport after revocation.
- Capture saves enqueue scoped WorkManager work only after the durable queue write.
- `EncryptedPayload` uses content equality and Android Keystore supplies the randomized GCM IV.
- Queue timestamps are required at construction and local snapshots/fakes use the Room ordering.
- `APPEND_OR_REPLACE` preserves newer sync inputs instead of dropping them behind `KEEP`.
- Accepted mutations are removed in one scoped batch operation rather than accumulating completed rows.
- Default WorkManager initialization is removed so the application `WorkerFactory` is authoritative.
- XML, backup, extraction, and orchestration checkpoint assertions fail closed and record PR #13.
- Room schema output includes canonical empty `foreignKeys` and `views` arrays.
- The JVM WorkManager contract test imports `Data` directly.

## Claims intentionally not applied

- **Switch kapt to KSP/Room plugin:** a local trial with the version-catalog alias failed Gradle
  configuration because the Kotlin kapt plugin was already on the classpath with an unknown
  version. The existing raw plugin ID is the compatible configuration; a KSP migration is a
  separate dependency/toolchain task, not a promotion fix.
- **Docstring coverage warning:** the check is advisory and its 80% threshold is not part of the
  repository release gates. Adding broad generated documentation would expand this Android
  foundation change without improving the reviewed behavior.

All actionable findings were handled in focused commits. Hosted checks and the connected Android
tests remain required before merging the review-fix PR and the synchronized promotion PR.

## Automatic incremental review after PR #15 synchronization

GitHub automatically refreshed the existing review when PR #15 merged into `dev` (no new review
was requested). It identified two additional valid claims, both fixed in the follow-up branch:

- Revocation locks are now keyed by `AccountWorkspaceScope`, so a long-running sync in one
  workspace cannot stall sign-out in another.
- The guard now exposes `reactivate(scope)` and `AndroidRuntime.signIn` calls it only after the
  device key is initialized, allowing an explicit sign-in/sign-out cycle without silently
  re-enabling a revoked scope on process restart.

## Automatic incremental review after PR #16 synchronization

GitHub automatically refreshed the existing review after PR #16 merged into `dev` (no new review
was requested). It identified one valid lifecycle race: sign-in and sign-out could interleave
between device-key initialization and revocation. `AndroidRuntime` now serializes the complete
sign-in/sign-out lifecycle per `AccountWorkspaceScope`, and a blocking JVM test proves sign-out
cannot revoke, cancel, or delete the key until sign-in has completed.

## Automatic incremental review after PR #17 synchronization

GitHub automatically refreshed the existing review after PR #17 merged into `dev` (no new review
was requested). It identified a valid test determinism issue: the lifecycle test now starts
sign-out with `CoroutineStart.UNDISPATCHED` after key creation has blocked, guaranteeing that the
test actually contends on the per-scope mutex before releasing sign-in.
