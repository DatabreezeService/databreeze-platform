# Users and Use Cases

**Status:** Product specification<br>
**Version:** 2.0

## 1. Primary users

### Solo operator or SME owner

A business owner, freelancer, accountant, or operations lead working with recurring spreadsheets, exports, and receipts. They need a useful dashboard without learning ETL, SQL, or visualization software.

Key jobs:

- Upload a file and understand whether it is usable.
- Correct data problems without losing the original.
- Receive a sensible first dashboard and adjust it visually.
- Ask a business question in Vietnamese or English.
- Add the next period's data without rebuilding everything.

### Analyst or consultant

A person preparing dashboards and recurring analyses for an internal team or client.

Key jobs:

- Inspect and edit mappings, transformations, metric definitions, and typed query plans.
- Reuse governed definitions across dataset versions.
- Create multi-page interactive dashboards with evidence and stable sharing.
- Keep client/project data isolated.
- Compare versions and explain why a result changed.

### Data steward or administrator

A person responsible for data meaning, quality, access, location, cost, and retention.

Key jobs:

- Publish schemas, mappings, rules, metrics, and quality gates.
- Decide which Local/Hybrid data projections may synchronize.
- Configure AI egress, refresh budgets, sharing, retention, and devices.
- Review drift, rejected records, stale dashboards, and audit history.

### Receipt capture user

A mobile user capturing expenses or source documents for later analysis.

Key jobs:

- Photograph a receipt quickly.
- See and correct uncertain extracted values.
- Avoid creating a duplicate expense record.
- Confirm when the accepted record reaches the dashboard.

### Dashboard viewer

A manager or stakeholder who needs current, understandable results without broad raw-data access.

Key jobs:

- Open an authorized interactive dashboard quickly.
- See when and from which dataset version it was generated.
- Filter and drill down only within permitted data.
- Ask a focused follow-up question and understand its assumptions.

## 2. Organizational model

A new user begins with a personal organization and workspace so solo use does not require administrative setup. The hierarchy is:

`User -> Organization -> Workspace -> Project`

- **Organization** owns billing, members, global policies, and verified domains.
- **Workspace** is the primary security, data-mode, retention, AI-egress, execution, and dashboard-publication boundary.
- **Project** groups related artifacts, datasets, dashboards, and analyses without creating another tenant. A customer-facing Client is a project with `kind = CLIENT`.
- **Device** belongs to a user; each organization enrollment has its own identity/key and may receive grants for named workspaces and approved folders.

## 3. Core jobs-to-be-done

| Situation | Job | Desired outcome |
|---|---|---|
| I have a spreadsheet | “Turn this into something I can understand.” | Profiled source, reviewed ETL, governed dataset, and proposed dashboard. |
| The data is messy | “Show me what is wrong and what you changed.” | Explicit quality dimensions, transformation preview, rejects, evidence, and a new version. |
| I need a dashboard | “Choose useful metrics and charts, but let me control them.” | Agent-proposed editable canvas with visible assumptions and typed calculations. |
| I have a business question | “Answer using only my authorized data.” | Deterministic result, caveats, evidence, and optional dashboard addition. |
| New data arrives | “Update the dashboard without rebuilding it or wasting compute.” | Dependency-aware on-change refresh and a complete atomic snapshot. |
| Files must remain local | “Analyze them without silently uploading originals.” | Desktop local execution and an explicit Hybrid publication projection. |
| A receipt arrives | “Capture it without typing every field.” | OCR candidates, confidence, correction, reconciliation, deduplication, and governed insertion. |
| A stakeholder only needs results | “Share the dashboard without granting raw-data access.” | Permission-filtered published dashboard with freshness and evidence availability. |

## 4. Canonical end-to-end use cases

### Web cloud dashboard

1. The user uploads a supported CSV/XLSX file into a Cloud or Hybrid workspace.
2. DataBreeze preserves an immutable original and profiles structure and quality.
3. The system proposes a typed mapping/transformation plan.
4. The user reviews before/after samples, changed/rejected counts, warnings, and quality dimensions.
5. Acceptance creates an immutable governed dataset version.
6. The analyst proposes metrics, filters, visualizations, and a dashboard page.
7. The user edits the canvas and publishes an interactive snapshot.
8. Every material value resolves to its plan, metric, dataset version, filters, lineage, and authorized evidence.

### Hybrid recurring folder

1. The user registers Desktop and selects one folder through the OS picker.
2. The user confirms the folder purpose, file types, dataset grouping, version/append behavior, and publication projection.
3. Desktop processes current stable files locally and asks about ambiguity or drift.
4. The accepted cleaned dataset or dashboard-specific projection synchronizes according to policy.
5. A later compatible file appears; Desktop fingerprints, debounces, and processes it once.
6. After accepted sync, affected cloud materializations recompute and a complete dashboard snapshot publishes.
7. If the Device is offline or review is pending, Web shows the last good snapshot and an explicit freshness reason.

### Mobile receipt to dashboard

1. The user actively captures a receipt on Android.
2. The app preserves the original, stages it securely, and uploads resumably to the selected Hybrid/Cloud workspace.
3. Cloud OCR returns field/token candidates with confidence and evidence coordinates.
4. Deterministic rules check subtotal, tax, total, currency, and probable duplicates.
5. The user corrects or confirms uncertain/conflicting fields.
6. Acceptance creates a governed captured-record version.
7. The related expense materialization refreshes and the mobile/web dashboard shows the new snapshot.

### Conversational analysis and canvas change

1. The user selects a governed dataset or dashboard and asks a Vietnamese/English question.
2. DataBreeze shows the proposed metrics, dimensions, filters, date range, assumptions, and estimated cost.
3. The deterministic engine executes the accepted typed plan.
4. The answer links numeric claims to result cells and source evidence.
5. If the user asks to add the result to a dashboard, the agent creates a previewable widget proposal.
6. The user confirms the canvas mutation; publishing remains a separate authorized action.

## 5. Experience requirements

- Vietnamese copy is complete, natural, and primary; English is a complete secondary locale.
- The primary onboarding path begins with “Add data,” not a catalog of modules.
- Technical concepts use business language with definitions and detailed evidence available on demand.
- The ETL review never hides rejected rows, sampling, unsupported columns, or material assumptions.
- Quality dimensions are named precisely; the UI never presents profile validity as factual correctness.
- Every dashboard shows last successful refresh, input version, freshness state, and blocked/stale reason when applicable.
- Every empty state has one useful next action.
- Errors state what happened, what was preserved, which snapshot remains visible, and what the user can do next.
- Accessibility targets WCAG 2.2 AA on Web and equivalent native expectations on Desktop and Android.
- Dates, currency, decimal separators, names, addresses, and time zones support Vietnamese conventions without assuming all source data is Vietnamese.

## 6. Role expectations

| Role | Typical capability |
|---|---|
| Owner | Ownership transfer, billing, deletion, recovery, and all policy controls. |
| Admin | Members, devices, data modes, AI egress, refresh budgets, sharing, integrations, and retention. |
| Analyst | Datasets, mappings, rules, metrics, typed analyses, dashboard authoring, and draft publication. |
| Operator | Upload/capture data, run allowed ETL, and resolve routine assigned review. |
| Approver | Approve controlled publication or material data movement within assigned policy scope. |
| Viewer | Read and interact with explicitly published dashboards within permission-filtered bounds. |

Roles provide defaults. Fine-grained capabilities and project assignments narrow access; they never broaden Workspace policy.

## 7. Adoption sequence

1. Add a sample or real CSV/XLSX file.
2. Choose Cloud or Hybrid behavior with a plain-language explanation.
3. Review the detected structure, quality dimensions, and proposed ETL steps.
4. Accept a governed dataset version.
5. Review and edit the first agent-proposed dashboard.
6. Ask one guided question and inspect evidence.
7. Publish the dashboard to an authorized viewer.
8. Optionally register a Desktop folder or Android receipt intake after the cloud workflow is understood.
