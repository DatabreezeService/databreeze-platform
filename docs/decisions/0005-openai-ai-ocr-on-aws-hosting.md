# ADR-0005: Use OpenAI for Initial AI and Receipt Extraction on AWS Hosting

**Status:** Accepted<br>
**Date:** 2026-08-10

## Context

DataBreeze is hosted on AWS Singapore, but the hosting provider does not need to own the product's AI or receipt-extraction capability. The selected initial deployment uses the OpenAI API for receipt image understanding/OCR and optional analyst, mapping, narrative, and dashboard-proposal assistance. Core product contracts must remain provider-neutral so a later provider or local model can replace OpenAI without changing governed data, evidence, review, or dashboard semantics.

OpenAI vision output is probabilistic. It may misread small or rotated text, return invalid fields, or provide imprecise spatial localization. DataBreeze therefore cannot treat a model response as an accepted receipt, an authoritative calculation, or sufficient evidence by itself.

## Decision

1. AWS `ap-southeast-1` remains the initial host for DataBreeze-controlled Web assets, API, workers, PostgreSQL, Redis, object storage, keys, secrets, logs, and queues.
2. The initial external AI implementation uses the OpenAI Responses API behind versioned provider-neutral OCR and AI ports. No OpenAI identifier becomes a domain primary key.
3. Only server-side API/worker adapters call OpenAI. Web, Desktop, and Android never receive an OpenAI API key or call OpenAI directly. Production credentials live in AWS Secrets Manager and are scoped to a dedicated OpenAI project.
4. Receipt extraction sends only the policy-approved immutable image/version and bounded instructions. It requests strict structured output for the published receipt candidate schema, disables tools and web access, sets `store: false`, and records the returned model identifier, adapter version, prompt version, schema version, usage, and content-safe request correlation.
5. Production uses an explicitly configured and evaluated model snapshot. Development may use a model alias, but production promotion is blocked until the selected snapshot passes the Vietnamese receipt evaluation corpus for field extraction, refusal, malformed output, latency, and cost.
6. Coordinate-sensitive receipt extraction uses original-detail image input when the configured model supports it. Any preprocessing, rotation, crop, resize, or coordinate remapping is versioned. Invalid or out-of-bounds coordinates fail extraction review rather than becoming evidence.
7. OpenAI output is always a candidate. DataBreeze deterministically validates required fields, types, dates, currency, subtotal/tax/total reconciliation, duplicate signals, permissions, and policy before human review and governed acceptance.
8. Optional OpenAI assistance may propose mappings, typed analysis plans, explanations, narratives, and dashboard changes. Deterministic DataBreeze processors calculate every authoritative number; OpenAI cannot execute arbitrary code, publish, approve, broaden access, or transfer data beyond the approved egress policy.
9. Workspace policy controls whether originals, bounded crops, metadata, samples, result rows, or evidence may be sent to OpenAI. The UI and audit trail disclose the provider, purpose, data classes, retention posture, and destination before protected content is transferred.
10. The default OpenAI API retention behavior and any approved Zero Data Retention, Modified Abuse Monitoring, or regional storage configuration are treated as deployment policy, not assumed. Production documentation and privacy disclosures must match the actual OpenAI project configuration.
11. BUA admission enforces per-workspace OpenAI request, image-token, text-token, retry, concurrency, and cost limits. Rate limits, timeouts, refusals, schema failures, and provider outages preserve the original and route to retry, manual review, or deterministic non-AI behavior.
12. Provider disablement or failure removes assisted extraction/proposals only. Existing dashboards, deterministic ETL, typed manual analysis, receipt manual correction, and the last authorized complete snapshot remain usable.

## Consequences

- The Android receipt lane implements an OpenAI adapter and a deterministic fake adapter behind the same port.
- Production readiness requires an OpenAI project, billing and spend limits, server-side secret configuration, a pinned evaluated model snapshot, retention/egress approval, and Vietnamese receipt evaluation evidence.
- OpenAI requests and responses never replace IAE originals, DSM governed versions, JRA review state, AUD records, or deterministic engine output.
- AWS infrastructure monitoring includes OpenAI latency, rate-limit, retry, token, refusal, schema-validation, and estimated-cost telemetry without logging source images, OCR text, prompts containing customer content, or extracted values.

## Rejected alternatives

### Use an AWS OCR service because AWS hosts the application

Rejected. Hosting and model-provider choices are independent, and the user selected OpenAI for initial OCR and AI capabilities.

### Call OpenAI directly from Web, Desktop, or Android

Rejected because it exposes credentials, bypasses centralized egress policy and admission, complicates audit/retention, and prevents server-side schema and evidence validation.

### Accept OpenAI extraction without deterministic checks and human review

Rejected because probabilistic extraction is not factual correctness and cannot establish governed financial data without validation and review.

### Store product conversation state in OpenAI as the system of record

Rejected. DataBreeze retains authoritative plans, versions, reviews, results, and audit state in its own governed stores.

## Approval gate

Accepted by the product owner as the initial deployment-provider decision. ADR-0004 remains authoritative for product scope and provider-neutral domain behavior; this ADR selects the first adapter implementation and its production constraints.

## Implementation references

- [OpenAI images and vision guide](https://developers.openai.com/api/docs/guides/images-vision)
- [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data#default-usage-policies-by-endpoint)
- [OpenAI model catalog](https://developers.openai.com/api/docs/models)
