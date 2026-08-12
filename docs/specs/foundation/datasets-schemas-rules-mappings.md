# Datasets, Schemas, Rules, and Mappings

| Metadata | Value |
|---|---|
| Status | Product specification |
| Version | 1.1 |
| Requirement prefix | `DSM` |
| Dependencies | `IAM` Identity, Workspaces, and Permissions; `IAE` Inbox, Artifacts, and Evidence; `JRA` Jobs, Recipes, and Approvals; `DSO` Devices, Synchronization, and Offline Operation; `BUA` Billing, Usage, and Administration |

## Purpose

Define the shared governed-data model used by DataBreeze modules for datasets, schemas, semantic and metric definitions, deterministic rules, mappings, profiling, validation, and lineage. This foundation gives local and cloud processors the same versioned contracts while preserving immutable inputs, evidence, tenant isolation, data-location policy, and reproducibility. Automatic first-run preparation under DDA `SAFE_NON_LOSSY` may create an accepted DatasetVersion only when DDA-053 conditions hold; DSM remains the logical-dataset and DatasetVersion authority.

`IAE` remains authoritative for artifacts, artifact versions, dataset snapshots, evidence references, storage locators, and retention. `JRA` remains authoritative for typed execution, durable job state, retry, review, and approval. This specification governs the definitions and result manifests those foundations carry.

## Scope and non-goals

### In scope

- Governed `Dataset` identities and immutable `DatasetVersion` records over one or more `IAE` snapshots or artifact versions.
- Immutable schema versions with stable field identifiers, compatibility classification, localization, sensitivity, units, and constraints.
- Semantic definitions for dimensions, measures, relationships, time behavior, and certified metrics.
- Versioned deterministic rules, rule sets, mappings, transforms, profiling, validation, and quality summaries.
- Reproducible lineage from source evidence through mappings, rules, metrics, and derived dataset versions.
- Local, Hybrid, and Cloud execution contracts, APIs, events, extension registries, budgets, diagnostics, and tests.

### Non-goals

- Replacing `IAE` storage, evidence-coordinate, original-file, retention, or deletion behavior.
- Replacing `IAM` authorization, `JRA` jobs/approvals, `DSO` synchronization, or `BUA` entitlement accounting.
- Defining a warehouse, general SQL workbench, database crawler, or unrestricted query service.
- Executing customer-supplied Python, JavaScript, SQL, macros, or arbitrary expressions.
- Treating AI-assisted mappings, semantic labels, or rule suggestions as validated truth.
- Silently changing a published schema, metric, rule set, mapping, or historical dataset result.

## Concepts and components

- **Dataset:** stable governed identity with owner, purpose, access policy, current compatible version, and lifecycle state.
- **Dataset version:** immutable logical data snapshot or append watermark that references immutable `IAE` storage objects and records schema, lineage, quality, and content fingerprints.
- **Schema definition:** stable identity for a set of fields; each published schema version is immutable.
- **Field definition:** stable field ID with type, nullability, unit, semantic role, aliases, localization, constraints, and sensitivity.
- **Semantic definition:** versioned business meaning for entities, dimensions, measures, relationships, calendars, and default filters.
- **Metric definition:** versioned deterministic calculation with declared grain, inputs, aggregation, unit, filters, null behavior, rounding, tests, and evidence policy.
- **Rule definition and rule-set version:** stable rule identities assembled into an immutable executable policy with severity, parameters, scopes, and release gates.
- **Mapping definition and mapping version:** stable relationship from a source fingerprint/schema range to target field IDs through allowlisted deterministic transforms.
- **Profile run:** bounded observation of structure, distributions, nulls, uniqueness, patterns, and candidate types; sampling is explicitly disclosed.
- **Validation run:** deterministic application of one schema and rule-set version to one immutable input version.
- **Lineage edge:** typed relationship between source evidence, fields, definitions, executions, and outputs.
- **Reference entity:** stable shared identity for governed business reference data. `BUSINESS_PARTY` specializes suppliers/customers; immutable versions carry names, aliases, external identifiers, roles, default business attributes, and visibility without making a feature module canonical.

### Components

- Dataset catalog and version service.
- Schema registry and compatibility checker.
- Semantic/metric definition registry and certification workflow.
- Rule and rule-set registry with deterministic compiler and fixture runner.
- Mapping registry, source-fingerprint matcher, and transform-function catalog.
- Profiling and validation processors in the shared Python engine.
- Lineage and evidence-manifest builder.
- Reference-entity registry, resolution, and merge-history service.
- Local/cloud parity harness and governed-data export service.

## Subsystem workflows

### Publish a schema or semantic definition

1. An authorized steward creates a draft with stable IDs, localized labels, types, units, constraints, sensitivity, and ownership.
2. The service validates internal references, type compatibility, cycles, required tests, and declared compatibility with the preceding version.
3. Metric fixtures evaluate exact expected values, units, null behavior, grain, and rounding.
4. Publication creates an immutable version and canonical hash; edits create a new draft.
5. Existing dataset and report versions remain pinned until an explicit revalidation or migration is requested.

### Create or refresh a governed dataset version

1. A caller selects immutable `IAE` artifact versions or dataset snapshots plus published schema, mapping, and optional rule-set versions.
2. A `JRA` typed job validates permission, data mode, entitlement, route, and input hashes.
3. The processor profiles inputs, applies the mapping, validates records, and writes a versioned result manifest and allowed derivative snapshot.
4. The control plane verifies counts, hashes, schemas, evidence coverage, and declared effects before registering the `DatasetVersion`.
5. Incomplete or rejected rows remain counted and discoverable; no record is silently omitted.

### Publish and execute a rule set

1. A steward assembles published deterministic rules, parameters, severities, scopes, and blocking behavior.
2. Static validation rejects unknown fields/functions, incompatible types, cycles, unbounded joins, nondeterminism, and missing fixtures.
3. A bounded dry run shows finding counts, performance, evidence coverage, and comparison with the current rule-set version.
4. Publication freezes the rule set.
5. Execution against a pinned dataset version creates an immutable validation run and findings; it never rewrites the dataset version.

### Reuse or revise a mapping

1. Exact source fingerprints and schema compatibility are evaluated before a saved mapping is offered.
2. Material source drift changes the mapping to `REVIEW_REQUIRED`; it is not silently reused.
3. A reviewer confirms target fields, transformations, defaults, and excluded columns.
4. Publication creates a new immutable mapping version and records its parent.
5. Reprocessing creates a new dataset version and retains comparison lineage to the earlier result.

### Resolve or merge a business party

1. A caller keeps raw extracted supplier/customer text on its source record and searches authorized DSM `BUSINESS_PARTY` versions using normalized aliases and exact typed identifiers.
2. A confident exact match may create a version-bound feature binding; ambiguity creates a JRA ReviewTask and does not invent a new canonical identity.
3. An authorized steward creates or revises a ReferenceEntity through DSM with an explicit project-visibility policy and evidence/provenance for identifiers.
4. A merge or split appends a resolution record and new immutable versions. Historical feature records stay pinned to the version they used and resolve redirects only when explicitly requested.

## Functional requirements

| ID | Priority | Requirement |
|---|---|---|
| DSM-001 | P0 | Every Dataset, definition, mapping, rule set, run, and lineage record shall have a stable UUID and an owning workspace; project scope shall be recorded when applicable. |
| DSM-002 | P0 | A DatasetVersion shall be immutable and shall reference exact input versions, schema version, mapping version, rule-set version, engine build, content fingerprint, row counts, quality state, and lineage manifest. |
| DSM-003 | P0 | Dataset bytes and snapshots shall remain owned by `IAE`; this foundation shall store governed metadata and opaque storage references rather than create an alternate artifact or storage authority. |
| DSM-004 | P0 | Each published SchemaVersion shall use stable field IDs and declare field type, nullability, constraints, unit, semantic role, aliases, localized labels, sensitivity, and default behavior. |
| DSM-005 | P0 | Schema publication shall classify compatibility as additive-compatible, validation-tightening, migration-required, or breaking and shall reject a claim contradicted by structural comparison. |
| DSM-006 | P0 | Published schema, semantic, metric, rule-set, and mapping versions shall be immutable, canonical-hashed, and retained as historical readers while referenced by an active result. |
| DSM-007 | P0 | A MetricDefinitionVersion shall declare grain, typed inputs, filters, aggregation, unit, null/zero behavior, rounding, deterministic implementation, evidence policy, and executable fixtures. |
| DSM-008 | P0 | A RuleSetVersion shall contain only published deterministic rules and allowlisted typed functions and shall declare scope, severity, parameters, missing-input behavior, and blocking behavior. |
| DSM-009 | P0 | A MappingVersion shall bind a source schema or fingerprint range to stable target field IDs and record every transform, default, exclusion, reviewer, compatibility decision, and parent version. |
| DSM-010 | P0 | Saved mappings shall not apply automatically after material source drift, ambiguous header matching, incompatible type change, or target breaking change; the system shall require review. |
| DSM-011 | P0 | Profiling shall disclose whether it is complete or sampled, the deterministic sample method and seed where applicable, excluded scopes, scanned counts, and resource limits. |
| DSM-012 | P0 | Validation and transformation runs shall pin immutable inputs and definition versions and execute through registered `JRA` typed actions with idempotent result acceptance. |
| DSM-013 | P0 | Every validation finding shall include a stable fingerprint, rule/version, severity, subject, actual/expected typed values where safe, evidence references, and run/input versions. |
| DSM-014 | P0 | Every material derived field, metric, aggregate, or release-gating conclusion shall carry reproducible lineage and `IAE` evidence or be explicitly marked `UNSUPPORTED_BY_SOURCE`. |
| DSM-015 | P0 | Missing, null, blank, invalid, zero, not-applicable, and redacted states shall remain distinct through mapping, rules, metrics, APIs, and exports. |
| DSM-016 | P0 | AI-assisted labels, mappings, semantic definitions, or rule suggestions shall remain drafts, identify provider/configuration provenance, and require deterministic validation plus authorized confirmation before publication. |
| DSM-017 | P0 | Local, Hybrid, and Cloud processing shall follow `DSO`; `LOCAL` originals, source values, reconstructable previews, and evidence excerpts shall never synchronize, while content-free metadata and explicitly approved derived outputs may synchronize only as `DSO` permits. |
| DSM-018 | P0 | Authorization shall be enforced through `IAM` for catalog discovery, definition management, execution, row/field access, evidence resolution, export, certification, and deprecation. |
| DSM-019 | P1 | Reprocessing after input, schema, mapping, rule, metric, or engine change shall create a new run and DatasetVersion and shall never revise a historical result in place. |
| DSM-020 | P1 | Data-quality gates shall bind an exact schema, rule-set, and policy version and shall expose `PASS`, `PASS_WITH_WARNINGS`, `BLOCKED`, or `INCOMPLETE` with contributing findings. |
| DSM-021 | P1 | Dataset and definition APIs shall use idempotency keys for creation, revision preconditions for mutable drafts, stable cursor pagination, and machine-readable compatibility errors. |
| DSM-022 | P1 | Governed-data exports shall include data permitted by policy plus schema, semantic, metric, mapping, rule-set, quality, lineage, evidence, and checksum manifests sufficient for independent verification. |
| DSM-023 | P1 | Rule and transform extensions shall use a versioned typed registry, deterministic contract, declared resource limits, security review, and golden fixtures and shall not execute arbitrary customer code. |
| DSM-024 | P2 | The system shall allow authorized administrators to promote compatible definitions or templates across workspaces only as sanitized unsigned drafts with no source values, evidence, secrets, access policy, certification, or automatic activation. |
| DSM-025 | P0 | A shared ReferenceEntity shall have a stable workspace-scoped identity and immutable versions; a `BUSINESS_PARTY` version shall declare supplier/customer roles, canonical display name, localized aliases, typed external identifiers, status, default business attributes, visibility policy, provenance, and canonical hash. |
| DSM-026 | P0 | Feature modules shall keep extracted party text separate and bind an exact authorized ReferenceEntityVersion; no feature shall own a second canonical supplier/customer identity, alias registry, identifier authority, project-visibility rule, or merge history. |
| DSM-027 | P1 | Reference-entity merge, split, redirect, and correction shall append immutable resolution history and new versions, preserve every historical binding, require actor/reason/evidence, reject cross-workspace targets, and never silently retarget a prior result. |

## Domain and data contracts

### Dataset and schema records

```text
Dataset {
  id, workspaceId, projectId?, name, purpose, ownerId,
  accessPolicyId, retentionPolicyId, lifecycleState,
  currentVersionId?, createdAt, revision
}

DatasetVersion {
  id, datasetId, ordinal, inputArtifactVersionIds[],
  inputDatasetVersionIds[], iaeSnapshotRefs[],
  schemaVersionId, mappingVersionId?, ruleSetVersionId?,
  engineBuild, contentFingerprint, rowCounts,
  qualityState, lineageManifestId, createdBy, createdAt
}

SchemaDefinition {
  id, workspaceId, name, ownerId, currentPublishedVersionId?,
  lifecycleState, revision
}

SchemaVersion {
  id, schemaDefinitionId, ordinal, compatibilityClass,
  parentVersionId?, fields[], canonicalHash,
  publishedBy, publishedAt
}

FieldDefinition {
  fieldId, key, type, nullable, unit?, semanticRole?,
  aliases[], labels, sensitivity, constraints[], defaultPolicy?
}
```

A DatasetVersion is governance over immutable `IAE` snapshots and artifacts. It does not own raw source bytes. Append-style datasets record an immutable watermark and ordered partition manifest so the same logical version cannot later include additional records.

### Semantic, rule, and mapping records

```text
SemanticDefinition {
  id, workspaceId, kind: ENTITY|DIMENSION|MEASURE|RELATIONSHIP|CALENDAR,
  name, ownerId, currentPublishedVersionId?, revision
}

SemanticDefinitionVersion {
  id, semanticDefinitionId, ordinal, description, fieldRefs[],
  relationshipRefs[], temporalBehavior?, defaultFilters?,
  labels, canonicalHash, publishedBy, publishedAt
}

MetricDefinition {
  id, workspaceId, stableKey, name, ownerId,
  currentPublishedVersionId?, lifecycleState, revision
}

MetricDefinitionVersion {
  id, metricDefinitionId, ordinal, grain, inputFieldIds[],
  expressionAst, filters, aggregation, unit,
  nullPolicy, roundingPolicy, evidencePolicy,
  fixtures[], canonicalHash, certificationState
}

RuleDefinition {
  id, workspaceId, name, ownerId, outputType,
  currentPublishedVersionId?, revision
}

RuleDefinitionVersion {
  id, ruleDefinitionId, ordinal, inputSchemaRefs[],
  expressionAst, outputType, parametersSchema,
  missingInputBehavior, fixtures[], canonicalHash,
  publishedBy, publishedAt
}

RuleSet {
  id, workspaceId, name, ownerId,
  currentPublishedVersionId?, lifecycleState, revision
}

RuleSetVersion {
  id, ruleSetId, ordinal,
  rules: [{ ruleVersionId, parameters, severity, scope, blocking }],
  canonicalHash, publishedBy, publishedAt
}

MappingDefinition {
  id, workspaceId, sourceKind, targetSchemaDefinitionId,
  ownerId, currentPublishedVersionId?, revision
}

MappingVersion {
  id, mappingDefinitionId, ordinal, sourceFingerprintRange,
  targetSchemaVersionRange, fieldMappings[], exclusions[],
  compatibilityState, parentVersionId?, canonicalHash
}
```

Metric and rule expression ASTs contain only registered typed operators and stable field/definition references. Raw SQL, script bodies, file paths, credentials, and provider prompts are not valid stored expressions.

### Shared reference entities

```text
ReferenceEntity {
  id, workspaceId,
  kind: BUSINESS_PARTY|CATALOG_ITEM|LOCATION|CUSTOM,
  status: ACTIVE|INACTIVE|MERGED|ARCHIVED,
  currentVersionId, revision
}

ReferenceEntityVersion {
  id, referenceEntityId, ordinal,
  partyRoles[]: SUPPLIER|CUSTOMER|BOTH|OTHER,
  canonicalDisplayName, localizedNames,
  aliases[], externalIdentifiers[],
  defaultCurrency?, defaultCountry?,
  visibilityPolicyId, provenanceRefs[],
  parentVersionId?, canonicalHash, publishedBy, publishedAt
}

ReferenceEntityResolution {
  id, workspaceId, type: MERGE|SPLIT|REDIRECT|CORRECTION,
  sourceEntityVersionIds[], targetEntityVersionIds[],
  reason, evidenceReferenceIds[], decidedBy, decidedAt
}
```

External identifiers use a typed issuer/namespace and policy-controlled display. Sensitive tax, registration, contact, or bank values are not ordinary aliases and require separately classified fields and permissions. A redirect assists a new binding but does not alter a historical feature record.

### Execution, quality, and lineage records

```text
DataProfileRun {
  id, workspaceId, inputVersionIds[], profilerVersion,
  sampleMode, sampleSeed?, scannedCounts, excludedScopes[],
  jraJobId, resultManifestId?,
  businessState: REQUESTED|AVAILABLE|INCOMPLETE|UNAVAILABLE,
  statisticsManifestRef?, completeness?, createdAt
}

DataValidationRun {
  id, workspaceId, datasetVersionId, schemaVersionId,
  ruleSetVersionId, engineBuild, jraJobId, resultManifestId?,
  businessState: REQUESTED|AVAILABLE|INCOMPLETE|BLOCKED|UNAVAILABLE,
  evaluatedCounts?, findingCounts?, resultHash?, createdAt
}

ValidationFindingDetail {
  id, validationRunId, fingerprint, ruleVersionId,
  severity, subjectRef, actualValueRef?, expectedValueRef?,
  evidenceReferenceIds[], sharedFindingId?
}

DataLineageEdge {
  id, workspaceId, fromResourceRef, toResourceRef,
  transformType, definitionVersionId?, executionId,
  inputFieldIds[], outputFieldIds[], evidenceSetManifestId?
}
```

Large statistics, finding sets, and lineage bundles use immutable `IAE`-managed objects with checksums. PostgreSQL stores ownership, indexes, summaries, and references.

`DataProfileRun.businessState` and `DataValidationRun.businessState` are DSM result-availability projections updated idempotently from committed JRA events and the pinned result manifest. JRA alone owns dispatch, progress, retry, cancellation, and terminal execution state; `AVAILABLE` requires a verified `SUCCEEDED` JRA result, `INCOMPLETE` requires an accepted partial result, and `UNAVAILABLE` covers failed/cancelled/expired jobs without pretending DSM completed work.

When a failed evaluation becomes assigned or reviewable work, the control plane creates the canonical JRA `Finding` envelope and, when needed, a JRA `ReviewTask`, then links `sharedFindingId`. DSM owns the immutable `ValidationFindingDetail`; JRA owns actionable state, assignment, disposition, and review history. DSM owns neither approval nor job state.

## Permissions, security, and privacy

- Recommended capabilities are `dataset.read`, `dataset.create`, `dataset.version.publish`, `dataset.export`, `schema.manage`, `semantic.manage`, `metric.certify`, `rule.manage`, `mapping.manage`, `profile.run`, `validation.run`, and `lineage.read`; `IAM` owns evaluation and role assignment.
- Dataset access does not imply access to every source artifact or evidence reference. Resolution independently rechecks the referenced resource and requested representation.
- Field sensitivity and row/resource policies narrow catalog, query, preview, profiling, finding, and export views. Masking never becomes the stored canonical value.
- Statistics that could reveal rare or sensitive values use policy-controlled suppression, minimum group sizes, or redacted manifests.
- Published definitions never contain secrets, provider credentials, unrestricted paths, raw source samples, or executable code.
- Workspace-keyed fingerprints prevent cross-tenant source probing. General telemetry excludes field values, source headers, distribution values, evidence excerpts, and local locators.
- Certification, deprecation, cross-workspace promotion, quality-gate changes, and export are audited with safe before/after metadata.

### Data-mode behavior

| Behavior | Local | Hybrid | Cloud |
|---|---|---|---|
| Source and governed dataset bytes | Source bytes stay on the authorized Desktop; a derived output moves only through explicit approved export/sync | Local or cloud per artifact/dataset policy | Authorized object storage |
| Schema, semantic, rule, and mapping metadata | Published content-safe definitions may synchronize | Synchronizes subject to classification | Synchronizes |
| Profile and validation detail | Local by default; only approved summaries synchronize | Policy selects fields, findings, and evidence excerpts | Authorized records synchronize |
| Execution | Registered Desktop processor | Desktop or cloud according to source and policy | Cloud or Desktop when explicitly requested and permitted |

## Offline, failure, and recovery

- Desktop may use cached published definitions only while `DSO` authorization and `BUA` entitlement leases permit the action. Offline drafts remain local operations until revalidated.
- An offline run records exact definition hashes, input hashes, engine build, authorization snapshot, and result manifest. Synchronization may register it only after current authorization, entitlement, and schema checks pass.
- Concurrent draft edits use revision checks. Published versions and execution results are immutable and never merge through last-write-wins.
- A source change during execution stops the affected partition or finishes only against its captured immutable version; it never combines versions.
- Worker or device restart resumes only compatible partition checkpoints. Result identities and finding fingerprints make retries idempotent.
- Resource exhaustion produces an explicit partial profile or incomplete validation with scanned and omitted scopes. A partial run cannot satisfy a complete quality gate.
- Incompatible schema, missing function version, corrupt snapshot, or unresolved lineage fails closed with a stable reason and does not fall back to a different version.
- Provider-neutral AI failure removes suggestions only; deterministic profiling, mapping confirmation, validation, metrics, and prior published definitions remain usable.
- Retention, legal hold, deletion, and evidence-unavailable states follow `IAE`. Historical metadata retains tombstoned provenance rather than pointing silently to a newer source.

## APIs, events, and extension points

### REST resources

- `GET|POST /v1/workspaces/{workspaceId}/datasets`
- `GET|PATCH /v1/datasets/{datasetId}`
- `POST /v1/datasets/{datasetId}/versions`
- `GET|POST /v1/workspaces/{workspaceId}/schema-definitions`
- `POST /v1/schema-definitions/{schemaId}/versions`
- `POST /v1/schema-versions/{versionId}/publish`
- `GET|POST /v1/workspaces/{workspaceId}/semantic-definitions`
- `GET|POST /v1/workspaces/{workspaceId}/metric-definitions`
- `GET|POST /v1/workspaces/{workspaceId}/rule-definitions`
- `POST /v1/rule-sets/{ruleSetId}/versions`
- `GET|POST /v1/workspaces/{workspaceId}/mapping-definitions`
- `POST /v1/mapping-definitions/{mappingId}/versions`
- `POST /v1/dataset-versions/{versionId}/profile-runs`
- `POST /v1/dataset-versions/{versionId}/validation-runs`
- `GET /v1/dataset-versions/{versionId}/lineage`
- `POST /v1/dataset-versions/{versionId}/exports`
- `GET|POST /v1/workspaces/{workspaceId}/reference-entities`
- `POST /v1/reference-entities/{referenceEntityId}/versions`
- `POST /v1/reference-entities/resolutions`

Create/run commands require idempotency keys. Draft updates require `If-Match`; publication binds the submitted revision and canonical hash. Lists use opaque cursors and stable `(createdAt,id)` ordering.

### Events

`dataset.created`, `dataset.version.registered`, `schema.version.published`, `schema.compatibility_failed`, `semantic.version.published`, `metric.version.certified`, `rule_set.version.published`, `mapping.version.published`, `mapping.review_required`, `reference_entity.version.published`, `reference_entity.resolved`, `data.profile.completed`, `data.validation.completed`, `data.quality_gate.blocked`, and `dataset.lineage.updated`.

Events contain resource/version IDs, compatibility or quality states, safe counts, and correlation IDs. Consumers retrieve protected definitions or results through an authorized API.

### Extension points

- Schema type/constraint registry with tagged versioned contracts and compatibility rules.
- Deterministic transform and rule-function registry with typed inputs/outputs, bounded resources, signature/trust metadata, and golden fixtures.
- Profiler adapter contract that declares supported formats, statistics, sampling methods, privacy behavior, and capacity.
- Metric compiler adapter that emits a reviewed execution plan from the constrained AST and proves output parity through fixtures.
- Dataset storage adapter that returns immutable `IAE` snapshot references and never becomes an authorization authority.
- Exporter contract that receives an authorized governed manifest and emits data plus verification manifests without weakening masking or retention.

## Performance and capacity budgets

- Catalog metadata read: p95 under 300 ms; first page of 50 datasets or definitions under 500 ms.
- Draft validation and canonical hashing: p95 under two seconds for a schema with 2,000 fields, rule set with 1,000 rules, or mapping with 2,000 field bindings.
- Standard cloud profiling/validation supports 1 million rows, 500 columns, or 500 MiB per run; larger contracted or local runs use explicit resource profiles.
- Large local processing supports the platform ceiling of 10 million streaming rows or 5 GiB when the format and processor declare compatibility.
- A 1-million-row by 100-column simple profile completes within five minutes p95 on published reference worker hardware, excluding queue time.
- Finding and row-result APIs use cursor pagination and shall not return more than 1,000 records or 5 MiB per page.
- Streaming processors target bounded working memory below 512 MiB for standard runs and declare temporary-storage estimates before execution.
- A workspace supports at least 10,000 datasets, 100,000 dataset versions, 50,000 published definition versions, and 100 million indexed findings with measured partitioning.

Workspace policy and entitlements may lower limits within tested ceilings. Backpressure returns the limiting dimension, current limit, estimated requirement, and safe split or routing options; no processor silently samples or truncates.

## Observability and metrics

- Catalog/version counts, publication latency, compatibility failures, draft conflict rate, certification and deprecation age.
- Profile and validation queue delay, rows/bytes/fields processed, throughput, memory/temp high-water marks, checkpoint resume, partial/incomplete rate, and failure reason.
- Mapping auto-offer, confirmation, correction, drift, and reuse rates without logging source headers or values.
- Rule/metric fixture pass rate, execution latency, finding counts, quality-gate outcomes, deterministic parity failures, and unsupported-function attempts.
- Evidence coverage for material outputs, lineage resolution, stale/tombstoned sources, manifest verification, and export completeness.
- Traces join workspace, dataset/version, definition versions, job/attempt, engine build, evidence-set manifest, and correlation IDs using content-safe identifiers.

## Acceptance and testing

- Contract tests generate and consume schema, mapping, rule, metric, run, finding, lineage, API, job, and event models across TypeScript, Kotlin where applicable, and Pydantic.
- Golden fixtures cover Vietnamese/English aliases, encodings, locale-specific numbers/dates, units, null/blank/zero states, nested data, merged spreadsheet headers, drift, and incompatible schemas.
- Property tests prove deterministic mapping, rule and metric results; row accounting; stable finding fingerprints; canonical hashes; and no mutation of published versions.
- Local/cloud parity tests produce identical typed outputs, quality states, and lineage for the same inputs, definitions, engine build, and rounding policy.
- Authorization tests cover catalog enumeration, cross-workspace/project IDs, masked fields, row policies, evidence resolution, export, promotion, certification, and revoked offline snapshots.
- Reference-entity tests cover alias/identifier ambiguity, project visibility, exact-version feature bindings, merge/split/redirect history, cross-workspace rejection, sensitive identifiers, and preservation of historical supplier/customer results.
- Failure tests interrupt every partition/checkpoint boundary, duplicate job completion, change inputs, remove a function version, exhaust memory/temp space, and corrupt manifests.
- Privacy tests verify profiling suppression, keyed fingerprints, Local-mode network behavior, safe events/logs, and absence of source values in published definitions.
- Performance tests publish reference hardware and exercise maximum standard schemas, rule sets, mappings, datasets, findings, pagination, and backpressure.
- Acceptance requires an authorized user to reproduce one material output from its pinned input versions, definitions, lineage, and exact evidence or receive an explicit evidence-unavailable state.

## Delivery and expansion

1. **Foundation release:** governed datasets/versions, schema registry, mappings, deterministic transforms, complete profiling, validation runs, findings, lineage, evidence manifests, Local/Hybrid/Cloud routing, and versioned APIs/events.
2. **Definition release:** semantic relationships, certified metrics, reusable rule sets, quality gates, mapping drift, governed exports, and parity dashboards.
3. **Expansion:** additional typed formats, privacy-preserving statistics, cross-workspace sanitized definition packs, and formally sandboxed third-party functions may use the registries without introducing arbitrary code, mutable history, or a second storage/job authority.
