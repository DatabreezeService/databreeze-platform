# DataBreeze worker production container

Plan 407 requires a long-running authenticated worker that claims only typed JRA assignments,
transfers exact result bytes through IAE capabilities, and completes the v4 prepare/finalize
protocol without database or object-store credentials (`IAE-024`, `JRA-023`, `JRA-031`).

## Current release status

The production worker Dockerfile is pinned, non-root and exposes only
`databreeze-engine-worker`. ECS supplies exactly `DATABREEZE_WORKER_API_ENDPOINT` and the protected
`DATABREEZE_WORKER_BEARER_TOKEN`; the API-only
`DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY` must never be delivered to the worker. The task has
no database/storage credentials and no arbitrary command surface.

The entrypoint deliberately remains fail-closed before claim/processing. The current JRA input
grant contains exact source-artifact object IDs, while the engine needs a server-authored typed
execution envelope containing parameters, locale, deadline and output bindings. No public
workload-resolver port currently binds those facts. Treating the first source object as an
`EngineExecutionRequest` would be an unsafe protocol invention.

Do not point `worker_image` at the API image, the engine sidecar image, or an image that receives
`DATABASE_URL`, AWS storage credentials, a bucket name, object paths, or arbitrary commands.

## Required implementation before the worker service can process jobs

1. Finish the authenticated, bounded IAE exact-object transfer/finalization API that accepts only one
   exact signed capability, attempt, object ID, declared hash, length, media type, and bytes. It
   must not provide list, prefix, URL, path, bucket, or credential operations.
2. Add a server-owned typed workload resolver that binds a claimed attempt to its immutable
   execution descriptor/envelope without reinterpreting source artifacts.
3. Inject that resolver and the IAE exact-object client into the bounded assignment loop; dispatch
   only registered handlers and preserve prepare -> transfer -> attestation -> finalize order.
4. Complete bounded retry, shutdown, temporary-data encryption/quarantine, and lease-loss behavior;
   add positive and negative integration tests for each boundary.
5. Owner-populate the dedicated API-side `DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY` as an
   owner-populated 32-byte base64url secret. The worker must never receive this signing key.
6. Run positive/negative image smoke only after the typed workload seam exists. Until then an exit
   code 78 with `worker workload resolver unavailable` is the expected fail-closed result.
