# Dashboard Workspace Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Ready for execution after execution-mode selection  
**Design authority:** `docs/plans/404-dashboard-workspace-redesign-design.md`  
**Extends:** `docs/plans/083-dda-analyst-dashboard-canvas.md`  
**Requirements:** DDA-001, DDA-003, DDA-015, DDA-016, DDA-017, DDA-018, DDA-019, DDA-020, DDA-021, DDA-022, DDA-023, DDA-024, DDA-025, DDA-026, DDA-033, DDA-043, DDA-044, DDA-045, DDA-050; WEB-002, WEB-006, WEB-011, WEB-012, WEB-013, WEB-014, WEB-015, WEB-022

**Goal:** Deliver the approved Vietnamese-first dashboard workspace: cobalt application rail, retractable analysis history, responsive autosaved chart canvas, dashboard-local agent invitation, compatible chart proposals, and explicit proposal acceptance without visible draft/publish modes in the authoring surface.

**Architecture:** Keep the existing NestJS/Fastify modular monolith, generated contracts, React 19 Web client, and DDA immutable DashboardVersion authority. The server resolves scope and authorized proposal context, persists preview-only proposals, and converts an explicit authoring command into a new parented version; the client renders a conversation-first workspace and never sends authoritative values, tenant context, arbitrary chart code, or publication commands through autosave.

**Tech Stack:** TypeScript 5.9, React 19.2.8, React Router 7.18.2, TanStack Query 5.101.4, Tailwind CSS 4.3.3 plus repository CSS tokens, repository UI primitives/Radix patterns, Recharts 3.10.1, React Grid Layout 2.2.3, Fontsource Be Vietnam Pro 5.3.0, NestJS 11/Fastify 5, Prisma 7/PostgreSQL, JSON Schema 2020-12, Vitest, Node test runner, and Playwright.

## Global Constraints

- Vietnamese (`vi-VN`) remains the default complete locale; English (`en`) is complete for every new visible string and accessible name.
- Clients consume generated contracts and public HTTP APIs; Web never imports NestJS services, Prisma types, repository adapters, provider adapters, or database clients.
- AI output remains a preview-only typed proposal. It never supplies executable code, SQL, numeric results, authorization, publication, or data movement.
- Every numeric widget value continues to come from deterministic bounded results. This plan changes presentation and authoring; it does not invent live materialized values when Plan 084 has not supplied them.
- Selecting a chart card is not acceptance. Only the localized confirmation action sends `ACCEPT_PROPOSAL` and creates a new draft DashboardVersion.
- The authoring UI uses `Đang lưu…`, `Đã lưu`, and stable failure/conflict copy. Internal `DRAFT` state, parent versions, canonical hashes, audit, restore, approval, and separate DashboardSnapshot publication remain authoritative.
- Publication and audience changes stay outside the authoring canvas. Remove the current canvas `Xuất bản` button, but do not delete the publication service, endpoint, or authorized sharing/release flow.
- Current tenant scope comes from `REQUEST_TENANT_CONTEXT`; authoring endpoints must reject client-supplied `context` fields.
- History, proposal, acceptance, filter, evidence, and widget-result reads reauthorize current scope and do not reveal inaccessible titles, field names, counts, source paths, or evidence content.
- Responsive reflow never hides freshness, evidence, quality caveats, warnings, denied states, or fallback tables.
- Self-host Be Vietnam Pro through Fontsource. Do not load Google Fonts or other runtime font origins.
- Use CSS transitions for shell collapse and panel state. Do not add GSAP to this workspace.
- Pin new dependency versions exactly and preserve the Web bundle budget.
- Do not stage or commit secrets, generated reports, runtime artifacts, local databases, screenshots containing customer data, or unrelated dirty files.
- The current `dda-400-production` worktree contains unrelated Cursor/owner changes, including overlapping dashboard-proposal files. Execute in a clean isolated worktree after those changes are committed or intentionally incorporated. If an overlapping file is dirty at task start, stop and resolve ownership; do not overwrite it.

---

## File and responsibility map

| Area | Files | Responsibility |
|---|---|---|
| Generated contracts | `packages/contracts/schemas/v1/dda-dashboard-chart-proposal.schema.json`, `dda-dashboard-authoring-command.schema.json`, `dda-dashboard-workspace-history.schema.json` | Bounded proposal, explicit authoring command, and permission-safe history payloads shared by API and clients. |
| Contract fixtures/generation | `packages/contracts/manifest.json`, `packages/contracts/package.json`, `packages/contracts/test/schemas.test.mjs`, `packages/test-fixtures/contracts/v1/**`, generated TypeScript/Python/Kotlin outputs and compatibility baseline | Prove schema bounds, hostile-input rejection, and cross-runtime parity. |
| Proposal/history persistence | `services/api/prisma/schema/dda.prisma`, additive migration, `dashboard-proposal-repository.port.ts`, Prisma/in-memory adapters, `dashboard-workspace-history.*` | Store proposal metadata and return scoped, reauthorized history without source content. |
| Proposal API | `dashboard-proposal.controller.ts`, `dashboard-proposal.dto.ts`, `dashboard-proposal.service.ts`, `dashboard-proposal-context.port.ts` | Resolve authorized context server-side and return two to four compatible preview-only alternatives. |
| Version mutation API | `dashboard-draft.service.ts`, `dashboard-draft.controller.ts`, `dashboard.dto.ts`, repository adapters | Accept selected proposal options or bounded manual layout commands into a new immutable parented version with concurrency and idempotency. |
| Web transport/state | `dashboard-api.ts`, `dashboard-authoring-model.ts`, `use-dashboard-authoring.ts` | Validate generated responses, manage query/mutation state, autosave, conflicts, undo, and deterministic demo fixtures. |
| Global shell | `application-rail.tsx`, `workspace-topbar.tsx`, `shell-layout.tsx`, `icons.tsx`, `messages.ts`, `styles.css` | Premium cobalt rail, compact header, accessible mobile drawer, Vietnamese typography, and global navigation. |
| Dashboard workspace | `dashboard-workspace.tsx`, `analysis-history-panel.tsx`, `dashboard-header.tsx`, `dashboard-page.tsx` | Compose history, canvas, freshness, save state, filters, and the dashboard-local agent. |
| Canvas/charts | `responsive-widget-grid.tsx`, `widget-visualization.tsx`, `chart-fallback-table.tsx`, `widget-frame.tsx`, `dashboard-canvas.tsx`, `widget-catalog.ts` | Responsive 12-column layout, keyboard editing, allowlisted Recharts renderers, evidence/fallback presentation. |
| Agent proposal UX | `agent-invitation.tsx`, `dashboard-agent-panel.tsx`, `chart-proposal-picker.tsx`, `proposal-details.tsx` | Speech-bubble invitation, governed conversation, compatible alternatives, detail disclosure, explicit acceptance. |
| Verification | focused API/Web tests, `dashboard-authoring.spec.ts`, `dashboard-workspace.visual.spec.ts` | Requirement-linked behavior, authorization, accessibility, responsive and visual regression evidence. |

---

### Task 1: Add generated dashboard authoring contracts

**Primary requirements:** DDA-003, DDA-015, DDA-016, DDA-020, DDA-021, DDA-022, DDA-024, DDA-043

**Files:**

- Create: `packages/contracts/schemas/v1/dda-dashboard-chart-proposal.schema.json`
- Create: `packages/contracts/schemas/v1/dda-dashboard-authoring-command.schema.json`
- Create: `packages/contracts/schemas/v1/dda-dashboard-workspace-history.schema.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-dashboard-chart-proposal/valid.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-dashboard-chart-proposal/invalid-authoritative-value.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-dashboard-authoring-command/valid-accept.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-dashboard-authoring-command/invalid-publish.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-dashboard-workspace-history/valid.json`
- Create: `packages/test-fixtures/contracts/v1/payloads/dda-dashboard-workspace-history/invalid-source-content.json`
- Modify: `packages/contracts/manifest.json`
- Modify: `packages/contracts/package.json`
- Modify: `packages/contracts/test/schemas.test.mjs`
- Modify: `packages/test-fixtures/contracts/v1/manifest.json`
- Regenerate: `packages/contracts/generated/**`
- Regenerate: `packages/contracts/compatibility/v1/baseline.json`

**Interfaces:**

- Produces: generated `DdaDashboardChartProposal`, `DdaDashboardAuthoringCommand`, and `DdaDashboardWorkspaceHistory` types from `@databreeze/contracts/v1`.
- `DdaDashboardChartProposal` contains `proposalId`, `dashboardId`, `parentVersionId`, `expectedRevision`, `analysisPlanVersionId`, optional target widget, two-to-four `options`, required proposal summary, `previewOnly: true`, `publishes: false`, and `createdAt`.
- Each option contains an allowlisted widget type, localized title/rationale/accessibility description, typed binding IDs, supported spans from `[3,4,6,8,12]`, default span, assumptions, and bounded CPU/memory estimate. It contains no result values or source rows.
- `DdaDashboardAuthoringCommand` is a discriminated `oneOf` for `ACCEPT_PROPOSAL`, `SET_LAYOUT`, `REMOVE_WIDGET`, `RESTORE_WIDGET`, and `CONFIGURE_PRESENTATION`; every variant carries `commandId`, `dashboardId`, `expectedVersionId`, and `expectedRevision`. There is no publication variant.
- `DdaDashboardWorkspaceHistory` contains at most 50 content-safe entries with `kind`, opaque subject ID, localized title, updated timestamp, and optional safe status plus an opaque cursor.
- Use exact schema titles `DDA Dashboard Chart Proposal`, `DDA Dashboard Authoring Command`, and `DDA Dashboard Workspace History` so generated TypeScript names remain consistent with the interfaces above.

- [ ] **Step 1: Add failing schema registration and fixture-parity tests**

Add these IDs to the schema table in `packages/contracts/test/schemas.test.mjs` and fixture records to the V1 manifest:

```js
[
  ['dda-dashboard-chart-proposal', `${schemaBase}/dda-dashboard-chart-proposal`],
  ['dda-dashboard-authoring-command', `${schemaBase}/dda-dashboard-authoring-command`],
  ['dda-dashboard-workspace-history', `${schemaBase}/dda-dashboard-workspace-history`],
]
```

The invalid proposal fixture must include an unknown authoritative field such as `"values": [{"value": 42}]`; the invalid command must use `"kind": "PUBLISH"`; the invalid history fixture must include `"sourcePath": "C:\\private\\sales.xlsx"`.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
corepack pnpm --filter @databreeze/contracts test
corepack pnpm --filter @databreeze/contracts fixtures:check
```

Expected: failure because the three schema IDs are not registered and the new fixture schema IDs cannot resolve.

- [ ] **Step 3: Implement the three bounded JSON Schemas and exports**

Use closed objects (`additionalProperties: false`) and bounded strings/arrays. The acceptance variant must be shaped like:

```json
{
  "schemaVersion": 1,
  "kind": "ACCEPT_PROPOSAL",
  "commandId": "00000000-0000-4000-8000-000000000101",
  "dashboardId": "00000000-0000-4000-8000-000000000102",
  "expectedVersionId": "00000000-0000-4000-8000-000000000103",
  "expectedRevision": 7,
  "proposalId": "00000000-0000-4000-8000-000000000104",
  "selectedOptionIds": ["00000000-0000-4000-8000-000000000105"],
  "createdAt": "2026-08-11T00:00:00.000Z"
}
```

The proposal option widget pattern must be `^(KPI|TABLE|BAR|LINE|AREA|PIE|DONUT|TEXT_NOTE|EVIDENCE_NOTE)$`; `selectedOptionIds` is unique and bounded to 8; history titles are bounded to 200 characters; cursor is opaque and bounded to 512 characters.

- [ ] **Step 4: Generate contracts and update the additive compatibility baseline**

Run:

```powershell
corepack pnpm --filter @databreeze/contracts generate
corepack pnpm --filter @databreeze/contracts compatibility:baseline
```

Inspect the diff and verify it contains only the three new schemas, exports, generated models/validators, fixtures, and additive baseline entries.

- [ ] **Step 5: Run contract and parity verification**

Run:

```powershell
corepack pnpm --filter @databreeze/contracts contract:check
corepack pnpm --filter @databreeze/contracts test
corepack pnpm --filter @databreeze/contracts fixtures:check
```

Expected: all pass; the invalid value, publication, source-path, cross-scope, oversized, and unknown-property fixtures fail validation.

- [ ] **Step 6: Commit the contract slice**

```powershell
git add packages/contracts packages/test-fixtures/contracts/v1
git commit -m "feat(contracts): add dashboard authoring contracts"
```

---

### Task 2: Add scoped dashboard/analysis history

**Primary requirements:** DDA-001, DDA-020, DDA-026, DDA-045; WEB-002, WEB-022

**Files:**

- Create: `services/api/src/features/dda/dashboard/application/dashboard-workspace-history.port.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-workspace-history.service.ts`
- Create: `services/api/src/features/dda/dashboard/adapter/in-memory-dashboard-workspace-history.adapter.ts`
- Create: `services/api/src/features/dda/dashboard/adapter/prisma-dashboard-workspace-history.adapter.ts`
- Create: `services/api/src/features/dda/dashboard/api/dashboard-workspace-history.controller.ts`
- Create: `services/api/test/features/dda/dashboard-workspace-history.service.test.ts`
- Create: `services/api/test/features/dda/dashboard-workspace-history.controller.test.ts`
- Modify: `services/api/src/features/dda/adapter/dda-database.client.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`

**Interfaces:**

- Produces `DashboardWorkspaceHistoryPortV1.list(input)` returning `{items, nextCursor}` with already scoped candidate entries.
- `DashboardWorkspaceHistoryServiceV1.list(context, {cursor, limit})` reauthorizes each entry through server ports, removes denied entries without revealing their existence, sorts by `updatedAt DESC, subjectId ASC`, and caps `limit` at 50.
- HTTP: `GET /v1/dda/dashboards/workspace-history?cursor=<opaque>&limit=30`; scope comes only from `REQUEST_TENANT_CONTEXT`.

- [ ] **Step 1: Write failing service tests for scope, ordering, and non-enumeration**

Add a test with an authorized dashboard, an authorized analysis, and a denied dashboard:

```ts
const result = await service.list(context, { limit: 30 });
assert.equal(result.accepted, true);
if (!result.accepted) throw new Error(result.code);
assert.deepEqual(result.value.items.map((item) => item.subjectId), [analysisId, dashboardId]);
assert.equal(JSON.stringify(result).includes(deniedDashboardId), false);
assert.equal(JSON.stringify(result).includes('C:\\private'), false);
```

Also assert `limit: 51` returns `INVALID_PAGE`, copied cursor scope returns `INVALID_CURSOR`, and authorization failure returns content-safe `UNAVAILABLE` rather than leaking a title.

- [ ] **Step 2: Run focused API tests and verify failure**

```powershell
corepack pnpm --filter @databreeze/api test
```

Expected: compile/test failure because the history port, service, adapter, and controller do not exist.

- [ ] **Step 3: Implement the port, service, and adapters**

Define the candidate interface exactly once:

```ts
export interface DashboardWorkspaceHistoryCandidateV1 {
  readonly kind: 'ANALYSIS' | 'DASHBOARD';
  readonly subjectId: string;
  readonly title: { readonly vi: string; readonly en: string };
  readonly updatedAt: string;
  readonly safeStatus?: 'CURRENT' | 'STALE' | 'BLOCKED';
}
```

The Prisma adapter may query `DashboardRecord` and `AnalysisPlanRecord` separately, map metadata only, merge, sort, and page. Do not include `planDocument`, `layoutGraph`, dataset IDs, source fields, or local paths in history results.

- [ ] **Step 4: Implement the request-scoped controller and module wiring**

Resolve `REQUEST_TENANT_CONTEXT`, parse `limit` as an integer from 1 through 50, and return the generated history contract. Reject any `context` query/body parameter. Register the controller and injected production/in-memory adapter in `DdaModule.register`.

- [ ] **Step 5: Verify authorization and controller behavior**

```powershell
corepack pnpm --filter @databreeze/api test
corepack pnpm --filter @databreeze/api typecheck
corepack pnpm --filter @databreeze/api openapi:check
```

Expected: authorized entries only, deterministic pagination, no client tenant context, and no source-content fields in OpenAPI.

- [ ] **Step 6: Commit the history slice**

```powershell
git add services/api/src/features/dda/dashboard services/api/src/features/dda/adapter/dda-database.client.ts services/api/src/features/dda/dda.module.ts services/api/test/features/dda
git commit -m "feat(dda): add scoped dashboard workspace history"
```

---

### Task 3: Persist and expose compatible chart proposals

**Primary requirements:** DDA-015, DDA-016, DDA-017, DDA-019, DDA-021, DDA-024, DDA-043, DDA-044, DDA-045, DDA-050

**Files:**

- Create: `services/api/prisma/migrations/20260811020000_dda_dashboard_proposals/migration.sql`
- Modify: `services/api/prisma/schema/dda.prisma`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-proposal-context.port.ts`
- Create: `services/api/src/features/dda/dashboard/application/dashboard-proposal-repository.port.ts`
- Create: `services/api/src/features/dda/dashboard/adapter/in-memory-dashboard-proposal-repository.adapter.ts`
- Create: `services/api/src/features/dda/dashboard/adapter/prisma-dashboard-proposal-repository.adapter.ts`
- Create: `services/api/src/features/dda/dashboard/api/dashboard-proposal.controller.ts`
- Create: `services/api/src/features/dda/dashboard/api/dashboard-proposal.dto.ts`
- Modify: `services/api/src/features/dda/dashboard/application/dashboard-proposal.port.ts`
- Modify: `services/api/src/features/dda/dashboard/application/dashboard-proposal.service.ts`
- Modify: `services/api/src/features/dda/dda.module.ts`
- Modify: `services/api/src/features/dda/adapter/dda-database.client.ts`
- Create: `services/api/test/features/dda/dashboard-proposal.service.test.ts`
- Create: `services/api/test/features/dda/dashboard-proposal.controller.test.ts`

**Interfaces:**

- HTTP: `POST /v1/dda/dashboards/:dashboardId/proposals` with `{question, analysisPlanVersionId, targetPageId, targetWidgetId?, locale}` only.
- `DashboardProposalContextPortV1.resolve(context, input)` returns server-authorized fields, metrics, result shapes, current dashboard/version/revision, widget allowlist, responsive rules, and cost bounds. The browser never supplies those authority values.
- `DashboardProposalRepositoryPortV1.save(record)`, `.findById(scope, proposalId)`, and `.markAccepted(scope, proposalId, acceptedVersionId)` persist preview metadata only.
- A successful response validates as `DdaDashboardChartProposal`, returns two to four compatible options, and always has `previewOnly: true` and `publishes: false`.

- [ ] **Step 1: Write failing proposal security tests**

Cover wrong tenant, unknown plan, target widget on another dashboard, unsupported type, unauthorized binding, arbitrary URL/script in title, provider disabled, budget denied, ambiguity, and successful multiple options. The success assertion must include:

```ts
assert.equal(result.accepted, true);
if (!result.accepted) throw new Error(result.code);
assert.equal(result.value.previewOnly, true);
assert.equal(result.value.publishes, false);
assert.ok(result.value.options.length >= 2 && result.value.options.length <= 4);
assert.equal('values' in result.value.options[0]!, false);
```

- [ ] **Step 2: Run tests and verify failure**

```powershell
corepack pnpm --filter @databreeze/api test
```

Expected: failure because proposals are not persisted or exposed through a request-scoped endpoint.

- [ ] **Step 3: Add the additive proposal table and adapters**

Create `dda.dashboard_proposals` with UUID ID, full tenant-scope columns, dashboard/version/analysis-plan IDs, expected revision, state (`PROPOSED|ACCEPTED|EXPIRED|REJECTED`), bounded JSON proposal document, timestamps, and scoped indexes. Do not store source rows, evidence snippets, prompts, provider payloads, or credentials.

Migration rollback policy: deploy is additive. On application rollback, leave the unused table in place; do not drop proposal records until retention and audit constraints permit a later reviewed cleanup migration.

- [ ] **Step 4: Refactor the proposal service around trusted resolved context**

The public service signature becomes:

```ts
propose(
  context: IamTenantContextV1,
  input: {
    readonly dashboardId: string;
    readonly question: string;
    readonly analysisPlanVersionId: string;
    readonly targetPageId: string;
    readonly targetWidgetId?: string;
    readonly locale: 'vi' | 'en';
  },
): Promise<DashboardProposalServiceResultV1>
```

Resolve authority through `DashboardProposalContextPortV1`, call the provider port only after policy/admission checks, normalize provider grouping types into the canonical V1 widget types, reject unknown fields, save the validated proposal, finalize BUA reservation on every exit, and emit content-safe AUD references.

- [ ] **Step 5: Add the request-scoped controller**

Resolve tenant context from the request; reject a body containing `context`, `authorizedFields`, `authorizedMetrics`, `widgetAllowlist`, or cost bounds; map stable failure codes to non-enumerating RFC 7807 responses.

- [ ] **Step 6: Run migration, API, OpenAPI, and tenant tests**

```powershell
corepack pnpm --filter @databreeze/api prisma:validate
corepack pnpm --filter @databreeze/api prisma:generate
corepack pnpm --filter @databreeze/api test
corepack pnpm --filter @databreeze/api openapi:check
```

Expected: proposal happy path and all fail-closed cases pass; generated Prisma changes are reviewed; no provider/raw content enters OpenAPI or persistence.

- [ ] **Step 7: Commit the proposal slice**

```powershell
git add services/api/prisma services/api/src/features/dda services/api/test/features/dda
git commit -m "feat(dda): persist governed chart proposals"
```

---

### Task 4: Apply explicit authoring commands as immutable versions

**Primary requirements:** DDA-020, DDA-022, DDA-023, DDA-024, DDA-025, DDA-026, DDA-045

**Files:**

- Modify: `services/api/src/features/dda/dashboard/application/dashboard-repository.port.ts`
- Modify: `services/api/src/features/dda/dashboard/application/dashboard-draft.service.ts`
- Modify: `services/api/src/features/dda/dashboard/api/dashboard-draft.controller.ts`
- Modify: `services/api/src/features/dda/dashboard/api/dashboard.dto.ts`
- Modify: `services/api/src/features/dda/dashboard/adapter/in-memory-dashboard-draft-repository.adapter.ts`
- Modify: `services/api/src/features/dda/dashboard/adapter/prisma-dashboard-draft-repository.adapter.ts`
- Create: `services/api/test/features/dda/dashboard-authoring-command.service.test.ts`
- Modify: `services/api/test/features/dda/dashboard-draft.controller.test.ts`
- Create: `services/api/test/features/dda/dashboard-authoring-idempotency.test.ts`

**Interfaces:**

- HTTP: `POST /v1/dda/dashboards/:dashboardId/authoring-commands` with generated `DdaDashboardAuthoringCommand` excluding tenant context.
- Produces `{dashboardId, versionId, revision, savedAt, publishes: false}`.
- Repository adds `findCommandResult(scope, commandId)` and atomic `commitAuthoringVersion({expectedRevision, identity, version, commandResult, removedWidget?})` so idempotency and optimistic concurrency are database-enforced.

- [ ] **Step 1: Write failing tests for confirmation, idempotency, conflicts, and restore**

Test all command kinds. Required assertions:

```ts
const first = await service.applyAuthoringCommand(context, command);
const replay = await service.applyAuthoringCommand(context, command);
assert.deepEqual(replay, first);
assert.equal(first.accepted, true);
if (!first.accepted) throw new Error(first.code);
assert.equal(first.value.publishes, false);
assert.notEqual(first.value.versionId, command.expectedVersionId);
```

Also prove wrong revision returns `REVISION_CONFLICT`, unselected proposal returns `INVALID_SELECTION`, cross-tenant proposal returns `NOT_FOUND`, `SET_LAYOUT` rejects spans outside the 12-column grid, warnings/evidence cells remain represented, and `PUBLISH` cannot validate or route.

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
corepack pnpm --filter @databreeze/api test
```

Expected: the new endpoint and atomic repository operation do not exist.

- [ ] **Step 3: Implement server-owned version creation**

For `ACCEPT_PROPOSAL`, load the scoped persisted proposal, require `PROPOSED`, verify parent version/revision, merge only selected stored options, allocate stable widget/materialization-definition IDs server-side, compute all desktop/tablet/mobile layout cells, calculate canonical hash server-side, and save the new version. Never accept a complete DashboardVersion, canonical hash, binding authorization, or widget values from the browser.

For `SET_LAYOUT`, accept only existing stable widget IDs and bounded integer `x/y/w/h`; for remove/restore preserve the removed widget record; for presentation configuration allow localized title and allowlisted display flags only. Metric/binding changes require a new proposal.

- [ ] **Step 4: Make command commit atomic and audited**

Implement expected-revision update plus version/command-result persistence in one Prisma transaction. On success, emit content-safe action kind, dashboard ID, parent/new version IDs, and proposal ID if applicable. On failure, do not update identity, mark proposal accepted, or emit a success audit record.

- [ ] **Step 5: Replace client-context DTOs on modified authoring routes**

Resolve `REQUEST_TENANT_CONTEXT` in `accept`, `restore`, `filter`, and the new command endpoint. Maintain old endpoints only as deprecated internal aliases if current integration tests require them; reject any body `context` rather than trusting it.

- [ ] **Step 6: Run API, tenant, and restart verification**

```powershell
corepack pnpm --filter @databreeze/api test
corepack pnpm --filter @databreeze/api typecheck
corepack pnpm --filter @databreeze/api openapi:check
```

Expected: replay returns the same result, revision conflicts preserve the last version, acceptance never publishes, and tenant/controller tests pass.

- [ ] **Step 7: Commit the authoring-command slice**

```powershell
git add services/api/src/features/dda/dashboard services/api/test/features/dda
git commit -m "feat(dda): apply immutable dashboard authoring commands"
```

---

### Task 5: Add Web dependencies, typed transport, and authoring state

**Primary requirements:** DDA-020, DDA-021, DDA-022, DDA-024, DDA-026, DDA-033, DDA-045; WEB-011

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `apps/web/src/main.tsx`
- Modify: `apps/web/src/features/dashboards/dashboard-api.ts`
- Create: `apps/web/src/features/dashboards/dashboard-authoring-model.ts`
- Create: `apps/web/src/features/dashboards/use-dashboard-authoring.ts`
- Modify: `apps/web/test/dashboard-api.test.ts`
- Create: `apps/web/test/dashboard-authoring-model.test.ts`
- Create: `apps/web/test/use-dashboard-authoring.test.tsx`
- Modify: `apps/web/scripts/check-bundle-budget.mjs` only if the existing chart-specific lazy-chunk allowance is absent; do not raise the total budget to hide a regression.

**Interfaces:**

- `fetchDashboardWorkspaceHistory(configuration, signal)` returns the generated history contract.
- `proposeDashboardCharts(input, signal)` returns the generated proposal contract.
- `applyDashboardAuthoringCommand(input, signal)` returns `{dashboardId, versionId, revision, savedAt, publishes:false}`.
- `useDashboardAuthoring` owns `saveState: 'IDLE'|'SAVING'|'SAVED'|'FAILED'|'CONFLICT'`, active proposal, selected option IDs, optimistic layout, undo target, and a 600 ms layout debounce.

- [ ] **Step 1: Record dependency review and add failing transport/state tests**

Confirm package licenses and purpose in the commit body: Recharts 3.10.1 (MIT), React Grid Layout 2.2.3 (MIT), Fontsource Be Vietnam Pro 5.3.0 (OFL-1.1), and React Is 19.2.8 (MIT, matching React 19.2.8). Add tests that reject malformed response properties, `publishes:true`, unknown widget types, non-integer layout cells, and source-path history fields.

- [ ] **Step 2: Run tests and verify failure**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-api.test.ts test/dashboard-authoring-model.test.ts test/use-dashboard-authoring.test.tsx
```

Expected: missing model/hook and missing transport functions.

- [ ] **Step 3: Install exact dependencies and self-host Vietnamese font weights**

```powershell
corepack pnpm --filter @databreeze/web add --save-exact recharts@3.10.1 react-grid-layout@2.2.3 react-is@19.2.8 @fontsource/be-vietnam-pro@5.3.0
```

Add these exact imports to `apps/web/src/main.tsx`; they bundle only the Latin base glyphs and Vietnamese additions for the four used weights:

```ts
import '@fontsource/be-vietnam-pro/latin-400.css';
import '@fontsource/be-vietnam-pro/vietnamese-400.css';
import '@fontsource/be-vietnam-pro/latin-500.css';
import '@fontsource/be-vietnam-pro/vietnamese-500.css';
import '@fontsource/be-vietnam-pro/latin-600.css';
import '@fontsource/be-vietnam-pro/vietnamese-600.css';
import '@fontsource/be-vietnam-pro/latin-700.css';
import '@fontsource/be-vietnam-pro/vietnamese-700.css';
```

Do not import every weight, italic style, or subset.

- [ ] **Step 4: Implement generated-contract validation and stable API errors**

Use `@databreeze/contracts/v1` validators before accepting payloads. Transport requests include credentials, `Accept: application/json`, and idempotency command IDs. Map 401/403 to `UNAUTHORIZED`, 404 to `NOT_FOUND`, 409 to `REVISION_CONFLICT`, 422 to `INVALID_PROPOSAL`, 429 to `BUDGET_DENIED`, and other failures to `UNAVAILABLE`.

- [ ] **Step 5: Implement the pure state model and query/mutation hook**

The reducer accepts these exact events:

```ts
type DashboardAuthoringEventV1 =
  | { readonly type: 'PROPOSAL_RECEIVED'; readonly proposal: DdaDashboardChartProposal }
  | { readonly type: 'OPTION_TOGGLED'; readonly optionId: string }
  | { readonly type: 'ACCEPT_STARTED' }
  | { readonly type: 'SAVE_STARTED' }
  | { readonly type: 'SAVE_SUCCEEDED'; readonly versionId: string; readonly revision: number }
  | { readonly type: 'SAVE_FAILED'; readonly code: string }
  | { readonly type: 'CONFLICT'; readonly serverVersionId: string }
  | { readonly type: 'UNDO_AVAILABLE'; readonly versionId: string };
```

Do not place dashboard titles, questions, result rows, evidence, or tenant scope in localStorage. Only the boolean navigation/history collapsed preference may persist locally.

- [ ] **Step 6: Run focused tests, typecheck, and bundle budget**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-api.test.ts test/dashboard-authoring-model.test.ts test/use-dashboard-authoring.test.tsx
corepack pnpm --filter @databreeze/web typecheck
corepack pnpm --filter @databreeze/web build
```

Expected: transport fail-closed tests pass and dependencies remain in a lazy dashboard chunk within the existing total budget.

- [ ] **Step 7: Commit the Web foundation slice**

```powershell
git add apps/web/package.json apps/web/src/main.tsx apps/web/src/features/dashboards apps/web/test pnpm-lock.yaml
git commit -m "feat(web): add dashboard authoring state and transport"
```

---

### Task 6: Build the premium shell and retractable history

**Primary requirements:** DDA-020, DDA-026, DDA-033; WEB-002, WEB-013, WEB-014, WEB-015, WEB-022

**Files:**

- Create: `apps/web/src/components/application-rail.tsx`
- Create: `apps/web/src/components/workspace-topbar.tsx`
- Modify: `apps/web/src/components/shell-layout.tsx`
- Modify: `apps/web/src/components/icons.tsx`
- Modify: `apps/web/src/app/messages.ts`
- Create: `apps/web/src/features/dashboards/analysis-history-panel.tsx`
- Create: `apps/web/src/features/dashboards/dashboard-workspace.tsx`
- Modify: `apps/web/src/styles.css`
- Create: `apps/web/test/application-rail.test.tsx`
- Create: `apps/web/test/analysis-history-panel.test.tsx`
- Modify: `apps/web/test/shell.routing-accessibility.test.tsx`
- Modify: `apps/web/test/navigation-access.test.tsx`

**Interfaces:**

- `ApplicationRail({locale, items, mobileOpen, onMobileOpenChange})` renders permission-filtered navigation with icon plus accessible label.
- `AnalysisHistoryPanel({locale, items, activeSubjectId, collapsed, onCollapsedChange, onActivate, onCreate})` renders authorized history only.
- `DashboardWorkspace` owns the dashboard-specific three-column composition: global rail from the shell, history panel, and main dashboard stage.

- [ ] **Step 1: Write failing shell/history interaction tests**

Verify cobalt rail landmarks, active item, accessible icon labels, collapse/expand from keyboard, Vietnamese default copy, English completeness, mobile drawer behavior, history search over received authorized titles, stable denied/empty/error states, and no source data in DOM. Example:

```tsx
await user.click(screen.getByRole('button', { name: 'Thu gọn lịch sử phân tích' }));
expect(screen.getByRole('button', { name: 'Mở lịch sử phân tích' })).toHaveAttribute(
  'aria-expanded',
  'false',
);
```

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/application-rail.test.tsx test/analysis-history-panel.test.tsx test/shell.routing-accessibility.test.tsx test/navigation-access.test.tsx
```

Expected: new components and localized keys do not exist.

- [ ] **Step 3: Implement the application rail and compact top bar**

Replace the 288 px text navigation with a 68 px cobalt rail on desktop. Preserve the skip link, semantic banner/navigation/main landmarks, permission filtering, locale switch, notifications, workspace context, and canonical localized routes. Use the existing DataBreeze mark/wordmark assets; do not introduce a new brand authority.

- [ ] **Step 4: Implement the dashboard history panel**

Use a 248 px expanded panel and a zero-width collapsed state beside the rail. Persist only `databreeze.dashboardHistoryCollapsed=v1:true|false`. On narrow screens render an overlay drawer with focus containment, Escape close, and return focus. Search is client-side over already authorized received entries; do not fetch or infer inaccessible entries.

- [ ] **Step 5: Apply premium tokens and responsive CSS**

Use the approved cobalt range (`#2850df` primary rail, `#1634bb` lower rail), pale canvas background, white surfaces, blue-gray borders, 12–18 px radii, and restrained shadows. Keep text contrast at WCAG AA. Add no looping animation; collapse transition is 240 ms and disabled by existing reduced-motion rules.

- [ ] **Step 6: Run shell/history accessibility and route tests**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/application-rail.test.tsx test/analysis-history-panel.test.tsx test/shell.routing-accessibility.test.tsx test/navigation-access.test.tsx
corepack pnpm --filter @databreeze/web typecheck
```

Expected: landmarks, focus, locale switching, route preservation, permission-filtered nav/history, and mobile controls pass.

- [ ] **Step 7: Commit the shell slice**

```powershell
git add apps/web/src/components apps/web/src/app/messages.ts apps/web/src/features/dashboards/analysis-history-panel.tsx apps/web/src/features/dashboards/dashboard-workspace.tsx apps/web/src/styles.css apps/web/test
git commit -m "feat(web): redesign dashboard workspace shell"
```

---

### Task 7: Build the responsive governed canvas and chart renderer

**Primary requirements:** DDA-018, DDA-020, DDA-021, DDA-022, DDA-023, DDA-026, DDA-033; WEB-012, WEB-013, WEB-014

**Files:**

- Create: `apps/web/src/features/dashboards/responsive-widget-grid.tsx`
- Create: `apps/web/src/features/dashboards/widget-visualization.tsx`
- Create: `apps/web/src/features/dashboards/chart-fallback-table.tsx`
- Create: `apps/web/src/features/dashboards/dashboard-header.tsx`
- Modify: `apps/web/src/features/dashboards/dashboard-canvas.tsx`
- Modify: `apps/web/src/features/dashboards/widget-frame.tsx`
- Modify: `apps/web/src/features/dashboards/widget-catalog.ts`
- Modify: `apps/web/src/features/dashboards/filter-bar.tsx`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/dashboard-canvas.test.tsx`
- Create: `apps/web/test/responsive-widget-grid.test.tsx`
- Create: `apps/web/test/widget-visualization.test.tsx`

**Interfaces:**

- `ResponsiveWidgetGrid` consumes stable `desktop/tablet/mobile` cells and emits a bounded `SET_LAYOUT` draft command only after drag/resize stops or a keyboard move command is confirmed.
- `WidgetVisualization` consumes an allowlisted widget definition plus already authorized bounded deterministic rows. Unknown, empty, sampled, truncated, denied, or stale results render explicit states rather than fabricated charts.
- `ChartFallbackTable` always presents the same permission-filtered rows and unit labels as the visual chart.

- [ ] **Step 1: Write failing grid and chart tests**

Cover 12-column bounds, 3/4/6/8/12 spans, automatic horizontal packing, vertical mobile stacking, stable IDs, keyboard move/resize, remove/restore, selected widget state, filter scope, unknown type rejection, KPI/table/bar/line/area/pie/donut rendering, fallback tables, freshness/warnings at all breakpoints, and no parsing of arbitrary formatted strings into authoritative numbers.

```tsx
expect(onLayoutCommand).toHaveBeenCalledWith(
  expect.objectContaining({
    kind: 'SET_LAYOUT',
    breakpoint: 'desktop',
    cells: expect.arrayContaining([expect.objectContaining({ widgetId, w: 8 })]),
  }),
);
```

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-canvas.test.tsx test/responsive-widget-grid.test.tsx test/widget-visualization.test.tsx
```

Expected: missing grid/renderer and legacy add-widget behavior fails the conversation-first expectations.

- [ ] **Step 3: Implement the 12-column grid with accessible companion controls**

Use React Grid Layout v2 for pointer drag/resize. Import its two required CSS files in the dashboard entry. Keep a keyboard menu in each WidgetFrame for move left/right/up/down, width 3/4/6/8/12, height increase/decrease, remove, and restore. RGL output must pass through a pure normalizer that clamps positions, rejects collisions it cannot deterministically resolve, and creates desktop/tablet/mobile cells without hiding required chrome.

- [ ] **Step 4: Implement allowlisted Recharts renderers**

Use `ResponsiveContainer`, bounded axes/tooltip/legend, locale-aware `Intl.NumberFormat`, and the catalog compatibility rules. Do not pass raw HTML, functions, expressions, URLs, or provider configuration into Recharts. Lazy-load chart code from the dashboard route. KPI and table remain repository components; text/evidence notes render escaped text and evidence references only.

- [ ] **Step 5: Replace the direct widget catalog entry point**

Remove the current canvas `Thêm tiện ích/Add widget` catalog button. A `Thêm biểu đồ/Add chart` affordance calls `onOpenAgent`; direct manipulation remains for existing widgets. Keep `WidgetEditor` only if it is reused as a presentation configurator; it must no longer create an unbound random widget locally.

- [ ] **Step 6: Run focused accessibility, type, and build checks**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-canvas.test.tsx test/responsive-widget-grid.test.tsx test/widget-visualization.test.tsx
corepack pnpm --filter @databreeze/web typecheck
corepack pnpm --filter @databreeze/web build
```

Expected: all widget types and states are accessible, responsive layouts stay bounded, and the bundle budget passes.

- [ ] **Step 7: Commit the canvas slice**

```powershell
git add apps/web/src/features/dashboards apps/web/src/styles.css apps/web/test
git commit -m "feat(web): build responsive governed dashboard canvas"
```

---

### Task 8: Add the dashboard-local agent and chart picker

**Primary requirements:** DDA-015, DDA-016, DDA-017, DDA-019, DDA-021, DDA-024, DDA-043, DDA-044, DDA-050; WEB-011, WEB-013, WEB-014

**Files:**

- Create: `apps/web/src/features/dashboards/agent-invitation.tsx`
- Create: `apps/web/src/features/dashboards/dashboard-agent-panel.tsx`
- Create: `apps/web/src/features/dashboards/chart-proposal-picker.tsx`
- Create: `apps/web/src/features/dashboards/proposal-details.tsx`
- Modify: `apps/web/src/features/dashboards/analyst-panel.tsx`
- Modify: `apps/web/src/features/dashboards/analysis-plan-review.tsx`
- Modify: `apps/web/src/features/dashboards/dashboard-page.tsx`
- Modify: `apps/web/src/app/messages.ts`
- Modify: `apps/web/src/styles.css`
- Modify: `apps/web/test/dashboard-analyst.test.tsx`
- Create: `apps/web/test/dashboard-agent-panel.test.tsx`
- Create: `apps/web/test/chart-proposal-picker.test.tsx`

**Interfaces:**

- `AgentInvitation({locale, visible, onOpen, onDismiss})` renders the approved speech bubble and persistent agent icon.
- `DashboardAgentPanel` owns question input, clarification/error states, current target page/widget, and proposal loading; it delegates selection to `ChartProposalPicker`.
- `ChartProposalPicker` treats `selectedOptionIds` as local selection and calls `onConfirm(selectedOptionIds)` only from the explicit localized confirmation button.

- [ ] **Step 1: Write failing end-to-end component tests for the conversation flow**

Test collapsed invitation, dismissal, icon reopen, Vietnamese copy, English copy, submitting a question, clarification, two-to-four proposal cards, keyboard multiselect, detail disclosure, no mutation on card click, explicit confirmation, conflict, provider unavailable, AI disabled/manual fallback, and focus movement to the inserted widget.

```tsx
await user.click(screen.getByRole('option', { name: /Cột xếp chồng/u }));
expect(onConfirm).not.toHaveBeenCalled();
await user.click(screen.getByRole('button', { name: 'Thêm 1 biểu đồ vào canvas' }));
expect(onConfirm).toHaveBeenCalledWith([optionId]);
```

- [ ] **Step 2: Run focused tests and verify failure**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-analyst.test.tsx test/dashboard-agent-panel.test.tsx test/chart-proposal-picker.test.tsx
```

Expected: the invitation, integrated panel, and proposal picker do not exist.

- [ ] **Step 3: Implement the invitation and responsive panel**

Use the exact Vietnamese invitation `Muốn thêm biểu đồ mới hoặc chỉnh biểu đồ hiện tại? Nói với tôi.` and English `Want a new chart or a change to this one? Talk to me.` The invitation is visible on first dashboard use/empty state, dismissible, and never covers warnings. Desktop uses a 520 px anchored panel, medium screens a right sheet, and narrow screens a full-height bottom sheet with focus containment, Escape close, and return focus.

- [ ] **Step 4: Implement compatible option cards and proposal details**

Render miniature non-numeric chart silhouettes, localized type/title/rationale, target dimensions/measures by governed identifier/label, supported size, and accessible description. The details disclosure shows selected datasets/versions, dimensions, filters, date range/grain, join paths, units, assumptions, output bounds, cost, affected page/widgets, and before/after summary. Never hide these values; collapse them only behind an accessible disclosure.

- [ ] **Step 5: Wire explicit acceptance and deterministic fallback**

Confirmation builds the generated `ACCEPT_PROPOSAL` command with `crypto.randomUUID()`, expected version/revision, selected option IDs, and strict UTC timestamp. When AI is disabled/unavailable, keep the existing typed manual analysis plan review and show a stable non-answer/fallback message; saved dashboard viewing remains usable.

- [ ] **Step 6: Remove authoring-surface draft/publish terminology**

In `dashboard-page.tsx`, remove the visible `Xuất bản/Publish` and raw `Thêm widget/Add widget` buttons from authoring. Keep the publication service/dialog files intact for the separate sharing/release surface. Replace live error text such as `Không được phép đọc bản nháp` with user-facing `Không được phép mở bảng điều khiển này`; do not change the stable backend error code.

- [ ] **Step 7: Run agent, locale, accessibility, and build checks**

```powershell
corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-analyst.test.tsx test/dashboard-agent-panel.test.tsx test/chart-proposal-picker.test.tsx test/dashboard-route.test.tsx
corepack pnpm --filter @databreeze/web typecheck
corepack pnpm --filter @databreeze/web build
```

Expected: card selection alone never mutates, confirmation creates a saved version, Vietnamese/English are complete, and all panel states remain keyboard accessible.

- [ ] **Step 8: Commit the agent slice**

```powershell
git add apps/web/src/features/dashboards apps/web/src/app/messages.ts apps/web/src/styles.css apps/web/test
git commit -m "feat(web): add dashboard-local chart agent"
```

---

### Task 9: Integrate autosave, undo, responsive E2E, and release evidence

**Primary requirements:** DDA-020, DDA-022, DDA-024, DDA-025, DDA-026, DDA-033, DDA-045; WEB-002, WEB-006, WEB-011, WEB-012, WEB-013, WEB-014, WEB-015, WEB-022

**Files:**

- Modify: `apps/web/src/features/dashboards/dashboard-page.tsx`
- Modify: `apps/web/src/features/dashboards/dashboard-workspace.tsx`
- Modify: `apps/web/test/dashboard-route.test.tsx`
- Modify: `apps/web/e2e/dashboard-authoring.spec.ts`
- Create: `apps/web/e2e/dashboard-workspace.visual.spec.ts`
- Modify: `apps/web/e2e/dashboard-sharing-security.spec.ts` only to confirm authoring does not publish or expand permission
- Create: `docs/evidence/dda/dashboard-workspace-redesign.md`
- Modify: `docs/plans/requirement-traceability.json` only through the repository-approved evidence update process after tests pass; do not mark unverified requirements complete manually.

**Interfaces:**

- The composed DashboardPage loads current draft/history, renders workspace/canvas, opens the agent, applies commands, refetches the new version, exposes undo, and keeps the last authorized complete view during failures.
- Visual baselines cover desktop 1440×1000, tablet 1024×900, and mobile 390×844 in both core agent/canvas states using synthetic/demo fixtures only.

- [ ] **Step 1: Write failing route/E2E tests for the approved journey**

Test:

1. Open `/vi-VN/dashboards`.
2. Collapse and reopen analysis history.
3. Open the speech-bubble invitation.
4. Ask for revenue by product and region.
5. Select one proposal and verify no command yet.
6. Confirm `Thêm 1 biểu đồ vào canvas`.
7. Observe `Đang lưu…` then `Đã lưu`.
8. Verify a new widget appears and focus moves to it.
9. Resize with keyboard and autosave after 600 ms.
10. Undo and restore the parent version.
11. Verify freshness, evidence warning, fallback table, and no publish control remain visible/available as required.

- [ ] **Step 2: Run E2E and verify failure**

```powershell
corepack pnpm --filter @databreeze/web exec playwright test --config playwright.dev.config.ts e2e/dashboard-authoring.spec.ts e2e/dashboard-workspace.visual.spec.ts
```

Expected: the integrated journey and visual baselines are not yet satisfied.

- [ ] **Step 3: Complete DashboardPage composition and conflict recovery**

Use TanStack Query invalidation after successful command; show optimistic layout while saving; on 409 discard only the unsaved optimistic mutation, refetch the authorized server version, show localized conflict copy, and preserve the user’s question/proposal selection for retry. Undo sends a new bounded command or existing restore command; it never overwrites the current version in place.

- [ ] **Step 4: Add deterministic visual baselines and responsive assertions**

Use only repository synthetic fixtures. Mask generated timestamps/UUIDs, disable motion, wait for bundled fonts, and assert no horizontal page overflow. Baselines must show invitation-closed and proposal-open states at desktop, the sheet at tablet, and stacked canvas/bottom sheet at mobile.

- [ ] **Step 5: Run the full proportional verification set**

```powershell
corepack pnpm --filter @databreeze/contracts contract:check
corepack pnpm --filter @databreeze/api prisma:validate
corepack pnpm --filter @databreeze/api test
corepack pnpm --filter @databreeze/api openapi:check
corepack pnpm --filter @databreeze/web test
corepack pnpm --filter @databreeze/web typecheck
corepack pnpm --filter @databreeze/web build
corepack pnpm --filter @databreeze/web test:e2e
corepack pnpm requirements:check
corepack pnpm orchestration:check
```

Expected: all pass. If unrelated dirty work breaks a global check, record the exact unrelated failure separately; do not weaken or skip the focused dashboard gates.

- [ ] **Step 6: Perform manual browser QA with synthetic data**

Verify at 1440×1000, 1024×900, and 390×844: Vietnamese accents/font loading, focus order, keyboard-only chart selection and layout editing, screen-reader names, reduced motion, forced colors, history collapse persistence, agent panel close/return focus, warning/freshness visibility, empty/loading/error/conflict/provider-disabled states, and no runtime font/network request outside the app origin.

- [ ] **Step 7: Write release evidence**

In `docs/evidence/dda/dashboard-workspace-redesign.md`, record commit hashes, exact commands/results, contract additions, migration, dependency versions/licenses, screenshots using synthetic fixtures, requirement/test mapping, bundle result, accessibility observations, known limitations, and rollback procedure. Explicitly state that authoring autosave does not publish and that live materialized values remain governed by the existing Plan 084 result pipeline.

- [ ] **Step 8: Commit the integrated slice**

```powershell
git add apps/web docs/evidence/dda/dashboard-workspace-redesign.md
git commit -m "feat(web): complete dashboard workspace redesign"
```

- [ ] **Step 9: Request final code and design review**

Run the `superpowers:requesting-code-review` skill. Require reviewers to inspect requirement coverage, contract/client boundary, tenant context, proposal acceptance, publication separation, accessibility, Vietnamese copy, dependency/bundle impact, and visual comparison with the approved design.

## Execution order and ownership locks

1. Task 1 must complete first because all later API/Web work consumes generated contracts.
2. Tasks 2 and 3 may run in parallel only in separate worktrees with explicit file locks; both touch `dda.module.ts` and `dda-database.client.ts`, so their integration owner must resolve those two files serially.
3. Task 4 depends on Task 3 persistence and Task 1 command contract.
4. Task 5 depends on Task 1 and the final HTTP shapes from Tasks 2–4.
5. Task 6 may begin after Task 5 dependency/font setup; it must not modify dashboard agent/canvas leaf files owned by Tasks 7–8.
6. Task 7 depends on Task 5 and may run alongside Task 6 with `styles.css` owned by one integration agent at a time.
7. Task 8 depends on Tasks 3–5 and integrates after Tasks 6–7.
8. Task 9 runs only after all prior commits are integrated and focused tests pass.

## Rollback and failure behavior

- Contracts and proposal persistence are additive. Roll back application code without deleting the proposal table or generated contract history.
- A Web rollback restores the previous shell/canvas while the API continues accepting only generated bounded commands; do not re-enable client-supplied tenant context.
- A failed proposal leaves the existing dashboard version unchanged and returns a stable non-answer/error state.
- A failed/replayed authoring command leaves the last accepted version active; idempotent replay returns the recorded result.
- A Web save conflict refetches current authorized state and never silently overwrites it.
- Provider disablement preserves manual typed analysis and saved dashboard viewing.
- Bundle, accessibility, authorization, contract, or migration failure blocks merge; do not hide it with a budget increase, test skip, fail-open adapter, or visual-only fallback.

## Intentionally deferred

- Genuine streaming dashboards.
- Arbitrary/custom visualization code or a full Vega grammar.
- Android dashboard authoring.
- New source connectors.
- Publication/audience management redesign outside the separate sharing/release surface.
- AI-authored deterministic values, metrics, transformations, permissions, or evidence.
- Continuous raw-data queries for normal dashboard views.
