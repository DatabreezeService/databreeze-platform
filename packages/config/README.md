# Runtime Configuration

Pure, versioned deployment-configuration loading for DataBreeze. This package validates runtime
settings before an application or service constructs any adapter. It does not read `process.env`
itself, contact a provider, or choose product policy.

## Public interface

`@databreeze/config/runtime/v1` exports:

- `loadRuntimeConfigV1`, which accepts an explicit environment record/entry list, optional
  structured overrides, and the composition-owned secret-reference issuer used by enabled
  credential references, then returns a deeply frozen configuration;
- the five explicit profiles: `development`, `test`, `preview`, `staging`, and `production`;
- typed object-storage, email, push, OCR, AI, payments, telemetry, and secrets selections;
- `ConfigValidationErrorV1`, whose diagnostics contain only safe paths and codes; and
- canonical `SecretReferenceV1` identifier objects shared with the secrets port. References have no
  enumerable identifier fields or global extractor and redact string, JSON, and diagnostic
  inspection; only the matching composition-owned resolver can recover their validated metadata.

There is intentionally no unversioned package root.

## Loading and safety rules

Precedence is:

`explicit overrides -> DATABREEZE_* environment -> profile defaults`

The profile itself is always explicit. Development and test are the only profiles with defaults,
and those defaults use loopback endpoints, in-memory/local facilities, or disabled providers.
Preview, staging, and production have no provider-selection defaults: all eight provider modes must
be declared; object storage and secrets must be remote; every other port may be explicitly disabled.

Environment and override inputs are snapshotted from own data-property descriptors before parsing;
accessors and failed proxy inspection become bounded, stable, redacted validation diagnostics.
Unknown DataBreeze keys, duplicate entry-list keys, whitespace or alternate boolean/integer
spellings, unknown structured override fields, incomplete active providers, and fields attached to
a disabled provider are rejected. A higher-precedence provider `mode` that changes the selected
variant atomically replaces the lower-precedence provider record, so local fields cannot leak into
a disabled or remote selection. Cleartext endpoints are allowed only for an explicitly local
adapter on loopback in development/test. URLs with credentials and all cleartext nonlocal endpoints
are rejected. Secret reference paths are canonical non-traversing segments. Configuration accepts
references, never API keys, passwords, tokens, webhook secrets, or other credential values.

## Forbidden dependencies

- Provider SDKs, cloud SDKs, service implementations, frameworks, filesystem/database/network I/O.
- Business configuration, feature flags, organization/workspace/project policy, entitlements, or
  tenant state.
- Provider credentials or implicit host-environment reads.

The only runtime dependency is the pure versioned provider-contract package used to accept a
scoped secret-reference issuer and construct the same opaque reference accepted by
`SecretsProviderPortV1`.

The product-policy precedence `platform default -> plan/region -> organization -> workspace ->
project -> recipe/job` remains owned by later domain/application plans. This package covers only
fail-closed deployment composition.

## Local commands

```text
corepack pnpm --filter @databreeze/config test
corepack pnpm --filter @databreeze/config typecheck
corepack pnpm --filter @databreeze/config build
```
