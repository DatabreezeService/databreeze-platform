# DDA Data Flow and Authority Boundaries

**Status:** Implementation guidance for plan 081<br>
**Requirements:** DDA-001, DDA-003, DDA-043, DDA-044, DDA-045, DDA-046

## Ownership

| Concern | Authority | DDA may store |
|---|---|---|
| Original bytes, evidence, retention/deletion | IAE | Opaque artifact/evidence reference IDs only |
| Datasets, schemas, mappings, metrics, lineage | DSM | Version IDs only |
| Jobs, results, approvals | JRA | Job/result/approval reference IDs only |
| Device capability, data-mode transfer | DSO | Capability/projection references only |
| Admission and usage | BUA | Usage/admission references only |
| Canonical audit ledger | AUD | Correlation IDs; content-safe summaries via port |
| Dashboard/plan/snapshot metadata | DDA | Identity, versions, hashes, refresh state, dependency references |

DDA never owns blob columns, foreign-schema foreign keys, raw result cells in event payloads, or a second audit ledger.

## Untrusted content (DDA-043)

Source values, filenames, worksheet cells, comments, OCR text, metadata, and evidence snippets are branded as `UntrustedSourceContentV1` and treated as data only. They must not authorize:

- system/developer instruction changes
- tool selection
- plan or canvas mutation
- publication
- transfer
- permission changes
- egress

## AI egress (DDA-044)

Default AI egress is denied. A workspace policy must explicitly allowlist adapter, locality, purpose, metadata/samples/result rows/evidence flags, retention, and maximum payload. Provider failure or disablement must leave deterministic ETL, typed manual analysis, and saved snapshot viewing available.

## Audit (DDA-045)

Named mutations emit content-safe action/outcome/reference summaries through `DdaAuditPortV1` to AUD. Summaries exclude values, paths, OCR text, evidence snippets, and credentials.

## Retention (DDA-046)

Retention holds and constraints are requested through the IAE composition port. DDA never calls object-storage deletion directly and never deletes IAE content or AUD history during DDA rollbacks.
