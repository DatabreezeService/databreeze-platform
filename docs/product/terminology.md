# DataBreeze Terminology

**Status:** Product specification<br>
**Version:** 2.0

The following terms have one canonical meaning across product copy, APIs, schemas, logs, and specifications.

| Term | Definition |
|---|---|
| **User** | A person with one identity who may belong to multiple organizations and workspaces. |
| **Organization** | The billing, membership, and high-level policy owner. A personal organization is created for solo users. |
| **Workspace** | The primary tenant, authorization, data-mode, retention, and execution boundary. |
| **Project** | A grouping of related work inside a workspace, often representing a client, engagement, location, or initiative. |
| **Client** | A user-facing project type for customer-specific work (`Project.kind = CLIENT`), not a separate tenant, organization, or identity entity. |
| **Membership** | A user’s role and status in an organization or workspace. |
| **Capability** | A narrowly defined permission, such as `artifact.read`, `recipe.execute`, or `report.publish`. |
| **Device installation** | One physical/logical Desktop or Android application installation. It may hold separate organization-scoped Device identities. |
| **Device** | Canonical shorthand for one IAM-owned, organization-scoped Device identity: an enrollment owned by one user with its own key, activation state, security epoch, and permanent revocation lifecycle. |
| **Device capability grant** | A DSO-owned permission for one active IAM Device identity to perform a scoped operation in named workspaces, including approved folders or capture types. It can narrow but never replace IAM identity authority. |
| **Inbox** | The unified intake and triage view for newly created artifacts and records. |
| **Artifact** | A logical source item such as a file, document, image, recording, or exported dataset. |
| **Artifact version** | An immutable byte-level or structured snapshot of an artifact at a point in time. |
| **Derivative** | A new artifact produced from one or more source artifact versions. |
| **Dataset** | Governed structured data with a schema, lineage, versions, and access policy. |
| **Evidence reference** | A stable link from a value or finding to an artifact version and coordinate such as page, region, sheet, cell, row, or time span. |
| **Schema** | A versioned definition of fields, types, constraints, and semantics for a dataset or import. |
| **Mapping** | A versioned relationship from source fields or coordinates to a target schema. |
| **Processor** | A versioned deterministic or assisted operation that reads declared inputs and produces declared outputs. |
| **Recipe** | A user-manageable, versioned workflow composed of triggers, typed actions, conditions, review steps, and outputs. |
| **Trigger** | An event that proposes or starts a recipe, such as file creation, schedule, API call, or manual action. |
| **Typed action** | A named, schema-validated operation with declared permissions and effects. Arbitrary remote scripts are not typed actions. |
| **Job** | A durable execution request with state, owner, inputs, processor or recipe version, and idempotency key. |
| **Provisional execution** | Device-local typed work created while the server is unreachable. It is not a Job and becomes canonical only after server reauthorization and idempotent registration. |
| **Job step** | An independently observable and retryable stage within a job. |
| **Finding** | A versioned conclusion produced by a rule or processor, including severity, confidence, evidence, and disposition. |
| **Exception** | A condition requiring human resolution before a workflow can complete normally. |
| **Review task** | Work assigned to a person to validate, correct, or classify uncertain output. |
| **Approval** | A policy-governed decision authorizing or rejecting a consequential action or publication. |
| **Data classification** | The sensitivity axis applied to a resource: `PUBLIC`, `INTERNAL`, `CONFIDENTIAL`, or `RESTRICTED`. Classification can only make storage, access, provider, retention, and synchronization policy stricter. |
| **Sensitive data** | Data classified Confidential or Restricted. “Sensitive” never means merely large, difficult, or commercially important. |
| **Synchronization payload class** | The content/location axis used by data-mode policy: `CONTROL_METADATA`, `APPROVED_DERIVED_RESULT`, `RECONSTRUCTABLE_DERIVED_CONTENT`, or `ORIGINAL_CONTENT`. It is evaluated separately from data classification. |
| **Action risk class** | The effect axis for a typed action: Read-only, Low, Consequential, or Restricted. Risk is evaluated separately from data sensitivity. |
| **Consequential action** | An action whose wrong execution could publish or externally share data, alter a governed output, replace/delete user-managed data, authorize a financial or migration decision, move content across a data-mode boundary, or change access/security policy. |
| **High-risk action** | Product copy for a Restricted action. It requires online server authorization, recent MFA, and an approval policy; separation of duties is the default. |
| **Material change** | A change to bound inputs, versions, values/tolerances, recipients, destinations, effects, risk class, or governing policy that could alter an approved or reproduced outcome. It invalidates the prior approval or result binding. |
| **Confidence** | A calibrated measure of extraction or classification certainty; it is not a substitute for deterministic validation. |
| **Quality dimension** | One independently defined measurement of governed data: completeness, validity, uniqueness, consistency, freshness, or another published deterministic rule result. It is not factual correctness. |
| **Quality summary** | An optional combination of named quality dimensions whose formula, weights, coverage, sampling, and limitations are visible. |
| **Rule** | A versioned deterministic expression that validates, reconciles, scores, or routes data. |
| **Transformation plan** | A versioned ordered graph of allowlisted typed preparation steps bound to exact input, schema, mapping, rule, and engine versions. |
| **Publication projection** | The explicit subset of metadata, aggregates, governed fields/rows, evidence derivatives, or originals authorized to move from a Local/Hybrid source to a named destination. |
| **Folder dataset binding** | A DSO-governed Desktop capability plus a versioned local manifest describing how supported files in one explicitly selected folder become governed dataset versions. The canonical path remains local. |
| **Typed analysis plan** | A versioned, schema-validated query/analysis representation. It is not arbitrary SQL, code, or an AI-generated numeric answer. |
| **Dashboard** | A governed interactive presentation composed of pages, widgets, filters, typed query bindings, freshness policy, and immutable versions. |
| **Dashboard page** | One responsive canvas inside a dashboard version containing positioned widgets and page-level controls. |
| **Dashboard widget** | A versioned KPI, table, chart, text/evidence note, or other allowlisted presentation block bound to typed data and display configuration. |
| **Materialized result** | A bounded, permission-scoped result produced from exact dataset, semantic, plan, parameter, and engine versions for efficient dashboard interaction. It is not authoritative source data. |
| **Dashboard snapshot** | An immutable complete set of required materialized results and layout/configuration references published atomically for a dashboard version and input set. |
| **Freshness policy** | The rule selecting when a saved analysis or dashboard may recompute: `ON_CHANGE`, `MANUAL`, `SCHEDULED`, or a separately specified later streaming mode. |
| **Freshness state** | The visible relationship between a published snapshot and its required inputs: `CURRENT`, `REFRESHING`, `STALE`, `BLOCKED`, or `SOURCE_UNAVAILABLE`, with an exact reason and last-good time/version. |
| **On-change refresh** | Dependency-aware recomputation triggered after an accepted dataset version or other bound input changes; it is not continuous polling. |
| **Report** | A versioned presentation artifact generated from governed data, definitions, evidence, and a template. |
| **Publication** | An immutable released report or dashboard snapshot with defined audience, access controls, provenance, freshness behavior, and withdrawal state. |
| **Data mode** | The workspace policy determining where originals and derived information may be stored and processed: Local, Hybrid, or Cloud. |
| **Local mode** | Originals remain on an authorized source device—normally Desktop for files and Android for locally captured records; only explicitly allowed metadata or results synchronize. |
| **Hybrid mode** | Originals may remain local while selected structured data, evidence excerpts, and outputs synchronize. |
| **Cloud mode** | Authorized originals and processing are available through cloud storage and workers. |
| **Sync change** | A versioned, idempotent mutation made available to another authorized client through a cursor. |
| **Entitlement** | A server-enforced product capability or capacity granted by a plan, trial, contract, or administrator. |
| **Usage record** | An immutable metering event used to calculate an entitlement’s consumption. |
| **Audit event** | An append-only security or business record describing who or what performed an action and its outcome. |
| **Connector** | An optional adapter to an authorized external source or destination. A connector never bypasses access controls. |
| **Extension** | A versioned processor, connector, exporter, rule function, or UI registration that implements a documented contract. |

## Default Safety Policy

Classification and action risk are independent. A Restricted action on Public data still requires Restricted-action controls; a read-only view of Restricted data still requires Restricted-data access controls.

| Data classification | Default policy |
|---|---|
| Public | May use an authorized data mode and ordinary workspace access; publication still requires a publication action. |
| Internal | Authenticated workspace access; anonymous/public links are off by default. |
| Confidential | External-provider egress and reconstructable Hybrid synchronization are off by default; exports, evidence access, and shares are audited. |
| Restricted | Original/reconstructable content remains local by default; cloud transfer or provider egress requires an explicit Admin policy, recent MFA, named purpose, and audit. Notification and telemetry payloads contain no source-derived content. |

| Action risk | Default policy |
|---|---|
| Read-only | No approval by default, but normal resource and classification authorization applies. |
| Low | Must be bounded and audited when it changes state; reversible effects retain a receipt or undo path. |
| Consequential | Requires a before/after or outcome preview and audit; workspace policy decides the eligible approver and whether a second person is mandatory. |
| Restricted | Requires online authorization, recent MFA, an approval bound to the exact subject/effect, and separation of duties by default. |

Synchronization payload classes are:

- **`CONTROL_METADATA`:** identifiers, state, hashes, counts, safe error codes, and policy references that do not reconstruct source content.
- **`APPROVED_DERIVED_RESULT`:** a resource/hash/schema-bound output or summary whose synchronization was separately confirmed under current workspace policy.
- **`RECONSTRUCTABLE_DERIVED_CONTENT`:** previews, OCR/transcripts, thumbnails, row/cell values, source snippets, or other material that can reveal or substantially reconstruct a source.
- **`ORIGINAL_CONTENT`:** the immutable source bytes or structured source record.

## Naming Rules

- “Import” means normalization into a governed target schema, not merely uploading a file.
- “Original” always refers to an immutable artifact version, not a mutable filename.
- “AI” must be qualified by its role; use “AI-assisted mapping” rather than implying verification.
- “Sensitive,” “consequential,” “high-risk,” and “material” use the taxonomy above; a feature may tighten the default but may not redefine the terms.
- “Delete” must state whether it means hiding, soft deletion, retention expiry, local removal, or cryptographic/permanent deletion.
- “Sync complete” means all acknowledged changes reached the intended destination; “processed locally” is a separate state.
- “Integration” means an authorized connector. File templates and Android Share intake are not described as vendor integrations.
