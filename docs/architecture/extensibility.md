# Extensibility Architecture

**Status:** Product specification<br>
**Version:** 1.0

## 1. Goal

DataBreeze must add industries, formats, processors, templates, and authorized connections without weakening evidence, security, compatibility, or module boundaries.

Extensibility is contract-driven. The first release does not execute arbitrary third-party code inside customer desktops or the control plane.

## 2. Extension Types

### Template pack

Versioned schemas, aliases, mappings, deterministic rules, report templates, Vietnamese terminology, and sample fixtures. Template packs are the preferred way to support a vendor or industry file.

### Processor

A Python engine operation with declared schemas, resource requirements, determinism, evidence behavior, and supported routes.

### Connector

An authorized adapter to a source or destination using public APIs, customer credentials, email forwarding, databases, or object storage.

### Exporter

A renderer or serializer producing a declared file or API format from governed data.

### Rule function

A deterministic, sandboxed function available in rule definitions with typed inputs and outputs.

### Module

A product-level capability registering navigation, domain services, permissions, jobs, events, entitlements, and optional platform surfaces.

## 3. Common Manifest

Every extension has a signed or repository-controlled manifest:

- globally unique ID and semantic version
- publisher and trust level
- supported platform and protocol versions
- input/output schema IDs
- requested capabilities and data classifications
- processor resource class and network policy
- configuration schema with secret fields marked
- emitted events and possible effects
- upgrade, downgrade, and removal behavior
- license and support metadata

Installation never grants requested capabilities automatically.

## 4. Processor Plug-in Contract

Processors implement the engine interface and run in controlled worker or sidecar execution:

- inputs are immutable local handles or signed cloud references
- output is a validated result bundle
- evidence and lineage are mandatory where the output makes a finding
- filesystem output is limited to an allocated workspace
- cloud network access is denied unless the processor declares and receives an adapter
- checkpoints are versioned
- golden fixtures define compatibility

Official processors ship with the signed application or worker image. A later third-party processor program requires sandboxing, signing, review, revocation, and customer policy.

## 5. Connector Contract

Connectors separate provider transport from DataBreeze domain data:

```text
authorize -> discover capabilities -> test -> pull/push page -> checkpoint -> revoke
```

- Provider identifiers are stored as external references.
- Imported bytes or normalized records become ordinary artifacts/datasets with lineage.
- Connector checkpoints are durable and idempotent.
- Rate limits, retries, scope changes, token expiry, and partial access are visible.
- A connector can be removed without making existing artifacts unreadable.
- File upload, folder intake, and Android Share remain supported alternatives.

## 6. Schema and Template Evolution

Stable field IDs survive display-name and translation changes. Schema changes are classified:

- additive optional field: backward compatible
- tightened validation: new schema version and explicit revalidation
- rename: display/alias change while stable ID remains
- type or semantic change: new field ID or migration
- removal: deprecation period and preserved historical reader

Mappings declare source fingerprints and target schema ranges. A mapping is suggested, not silently reused, when the source changes materially.

## 7. Module Registration

A module registers through defined control-plane interfaces:

- capability and role additions
- routes and OpenAPI tags
- domain event subscriptions/publications
- job and processor definitions
- entity ownership and migrations
- entitlement keys and usage meters
- Web/Desktop/Android navigation contributions
- telemetry vocabulary

Feature modules may depend on foundation services but not another feature’s storage. Cross-feature use occurs through published datasets, artifacts, reports, or application-service contracts.

## 8. UI Extension Rules

Web and Desktop modules use route-level code splitting and a registry of typed navigation, page, command, review-card, and artifact-action contributions.

Android features use native Gradle modules and compile-time navigation registration. DataBreeze does not download executable Android feature code outside approved application distribution.

Extension UI:

- uses shared design tokens and accessibility components
- receives only authorized view models
- cannot access raw device APIs from a Web/Desktop renderer
- handles unavailable module, entitlement, and offline states

## 9. Public APIs and SDKs

- REST APIs are described by versioned OpenAPI.
- Typed jobs and events use versioned JSON Schema.
- SDKs are generated where possible and add ergonomic helpers without hiding HTTP semantics.
- Cursor pagination, idempotency, rate-limit headers, request correlation, and structured errors are consistent.
- Deprecations have published dates and telemetry before removal.
- Webhooks are at-least-once, signed, ordered only within a documented key when promised, and replayable by event ID.

## 10. Feature Flags and Configuration

Flags control rollout, not permanent product modeling. A flag has owner, purpose, creation date, safe default, targeted scopes, and removal condition.

Configuration uses typed schemas and precedence:

`platform default -> plan/region -> organization -> workspace -> project -> recipe/job`

A lower level cannot weaken a mandatory higher-level security or retention policy.

## 11. Provider Independence

OCR, AI, email, push, payments, object storage, antivirus, and observability use ports/adapters. Each critical adapter has:

- capability description
- normalized errors
- timeout and retry policy
- health check
- contract tests
- data-region and retention metadata
- failover or degraded behavior
- documented exit and data-export path

Provider-specific advanced features are optional and never stored as the only representation of customer state.

## 12. Compatibility and Removal

Removing an extension:

1. Prevents new use.
2. Identifies active recipes, jobs, schemas, and reports that depend on it.
3. Allows export or migration.
4. Retains historical readers and manifests for required evidence.
5. Revokes credentials and capabilities.
6. Removes executable code only after no supported active dependency remains.

The system rejects an extension whose manifest, signature, schema, or requested capability is unsupported.
