# ADR-0004: Focus V1 on the Data-to-Dashboard Agent and Event-Updated Materialized Snapshots

**Status:** Accepted<br>
**Date:** 2026-08-10

## Context

The original product suite specified ten specialist modules across three applications. That suite established valuable shared foundations but made the first product release too broad. Product review selected a clearer primary outcome: users bring their own data, review governed ETL and quality, receive an editable interactive dashboard from an agent, ask evidence-backed questions, and see dashboards update efficiently after accepted data changes.

Web is cloud-first, Windows Desktop provides Local/Hybrid approved-folder processing, and Android initially provides cloud-connected receipt/document capture and dashboard consumption. AWS Singapore remains the first hosted target, but product contracts remain provider-neutral. [ADR-0005](0005-openai-ai-ocr-on-aws-hosting.md) selects OpenAI as the initial AI and receipt-extraction provider behind those contracts.

Continuously querying raw datasets for every page view would increase cost, complicate consistent publication, and make Local/Hybrid evidence harder to govern. Fixed-interval polling also wastes work when data has not changed.

## Decision

1. Make the Data-to-Dashboard Agent the single V1 product capability, delivered as the unified data workspace experience.
2. Retain the ten earlier modules as post-V1 specialist extension specifications.
3. Preserve existing foundation authorities and stable requirement IDs; DDA composes them through public contracts.
4. Make Hybrid the default and require an explicit versioned publication projection for Local/Hybrid data used by cloud dashboards.
5. Use typed ETL/analysis/materialization plans. AI may propose plans and presentation but cannot supply authoritative numeric values or arbitrary executable code.
6. Serve ordinary dashboard views from permission-scoped materialized results and immutable complete DashboardSnapshots.
7. Make `ON_CHANGE` the default refresh mode: accepted dataset events resolve affected dependencies, debounce compatible changes, execute idempotent materialization jobs, and atomically publish a complete snapshot.
8. Preserve the last complete snapshot when refresh is partial, failed, blocked, or waiting for a Local source.
9. Support `MANUAL` and `SCHEDULED` refresh in V1; defer genuine streaming until a separate specification defines ordering, lateness, replay, corrections, capacity, and cost.
10. Keep OCR and AI providers behind versioned adapters. ADR-0005 selects the OpenAI API for the initial deployment while AWS remains the hosting platform; this selection does not change domain semantics.
11. Persist sessions through rotating refresh families with these fixed boundaries:
    - Web refresh family: 30-day inactivity, 180-day absolute
    - Desktop/Android refresh family: 90-day inactivity, 365-day absolute
    - Access token: maximum 15 minutes on every platform
12. Allow automatic first-run ETL only under the approved `SAFE_NON_LOSSY` policy; all other plans remain review candidates.
13. Allow automatic starter canvases only as private deterministic allowlisted templates; AI-authored or shared-canvas mutations require preview and confirmation.
14. Make a Desktop folder Web-usable only through explicitly consented Cloud or Hybrid projection; `LOCAL` remains non-transferable.

## Consequences

- Product, roadmap, specification index, domain model, synchronization, performance, and implementation plans must be revised around DDA and the unified workspace deltas (`IAM-022` through `IAM-025`, `DDA-052` through `DDA-060`, `WEB-024`, `DSK-027`, `AND-024`).
- Existing specialist P0 requirements remain P0 for those capabilities' eventual first production releases but are not DDA V1 gates.
- Materialization dependency and cache-key correctness become security and data-correctness boundaries.
- Dashboard publication is an immutable versioned action rather than an in-place mutable view.
- Cloud cost is concentrated at intake, ETL, novel analysis, and affected-result refresh rather than every dashboard view.
- Desktop folder intelligence requires explicit manifests, drift/duplicate/overlap review, and no cloud path disclosure.
- Android V1 capture remains native, user-initiated, resumable, evidence-aware, and policy-bound even though OCR runs in cloud for Hybrid/Cloud destinations.
- Plan 406 is the current product-owner entry point for the unified workspace delta; unfinished production gates remain blocked without real owner evidence.

## Rejected alternatives

### Deliver all ten specialist modules as the first release

Rejected because it delays the primary user outcome, multiplies integration gates, and obscures what DataBreeze is.

### Continuously query raw data for every dashboard view

Rejected because cost scales with views, results can mix versions during change, Local/Hybrid sources may be unavailable, and permission/caching behavior becomes harder to prove.

### Refresh every dashboard on a fixed short interval

Rejected as the default because it performs work without a trusted data change and still leaves unclear freshness between intervals. Scheduled refresh remains an explicit option.

### Let AI generate and execute arbitrary queries or dashboard code

Rejected because it weakens authorization, reproducibility, evidence, resource admission, and numerical correctness.

## Approval gate

Accepted after written product review and approval of the Version 2 product documents, DDA specification, and replacement requirement-linked implementation/delegation program. Existing plans remain authoritative for already delivered foundation evidence; DDA work follows plans 080-087, 402-406, and `data-to-dashboard-orchestration.json`. The unified workspace requirements and session/automatic-action boundaries in this ADR were reconciled on 2026-08-12 for plan 406.
