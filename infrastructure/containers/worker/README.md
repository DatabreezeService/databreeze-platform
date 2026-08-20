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

The local profile now composes a server-owned workload resolver for the reviewed
`dda.materialize.widget-result` action. It reads only the exact CSV ArtifactVersion handle,
dispatches the registered typed DDA processor, transfers the JSON result through the exact IAE
capability, and finalizes the attestation before JRA completion. Unsupported actions and any
missing/stale authority still fail closed. Cloud deployment remains gated on composing the same
resolver with the production IAE byte authority.

Do not point `worker_image` at the API image, the engine sidecar image, or an image that receives
`DATABASE_URL`, AWS storage credentials, a bucket name, object paths, or arbitrary commands.

## Required implementation before cloud worker processing is production-ready

1. Finish the authenticated, bounded IAE exact-object transfer/finalization API that accepts only one
   exact signed capability, attempt, object ID, declared hash, length, media type, and bytes. It
   must not provide list, prefix, URL, path, bucket, or credential operations.
2. The local profile already has the server-owned typed workload resolver. Keep the cloud profile
   fail-closed until it is composed with an authoritative IAE input byte reader and the same exact
   descriptor/attempt binding.
3. Keep the exact-object client in the bounded assignment loop; dispatch only registered handlers
   and preserve prepare -> transfer -> attestation -> finalize order.
4. Complete bounded retry, shutdown, temporary-data encryption/quarantine, and lease-loss behavior;
   add positive and negative integration tests for each boundary.
5. Owner-populate the dedicated API-side `DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY` as an
   owner-populated 32-byte base64url secret. The worker must never receive this signing key.
6. Run positive/negative image smoke for the local widget action and cloud deployment only after
   the approved input/output adapters and runtime secrets are available. Missing adapters must
   remain an explicit unavailable result, never an empty or synthetic success.
