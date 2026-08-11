# Dashboard Workspace Redesign — Design Specification

**Status:** User-approved visual direction; written design review requested  
**Date:** 2026-08-11  
**Applies to:** DataBreeze Web dashboard authoring workspace; reusable Web/Desktop React packages where public contracts permit  
**Build authority:** This document refines the UX of approved plan `083-dda-analyst-dashboard-canvas.md`; it does not replace DDA contracts or production gates.  
**Primary requirements:** DDA-015, DDA-016, DDA-017, DDA-018, DDA-019, DDA-020, DDA-021, DDA-022, DDA-023, DDA-024, DDA-025, DDA-026, DDA-033, DDA-043, DDA-044, DDA-045, DDA-050

## 1. Outcome

Create a premium, Vietnamese-first dashboard workspace where the dashboard is the main object and the agent feels native to that canvas. A user can return to prior analyses like chat history, ask for a new or changed visualization from inside a dashboard, compare compatible chart proposals, explicitly add one or more charts, and continue arranging an autosaved responsive canvas.

The experience must feel immediate without pretending that AI output is authoritative. DataBreeze continues to use typed plans, deterministic values, evidence, immutable parented dashboard versions, permission-scoped materializations, audit, and separate authorized publication.

## 2. Approved visual direction

### 2.1 Workspace shell

- Use a narrow cobalt application rail for top-level product areas.
- Place a retractable analysis-history panel beside the rail. It behaves like a conversation history: recent analyses and dashboards are easy to reopen, search, and continue.
- Use `Be Vietnam Pro` for Vietnamese and English interface copy. Keep source values in their governed source representation unless locale formatting is explicitly applicable.
- Make the main surface a pale blue canvas field containing restrained white dashboard pages and widgets.
- Use subtle blue-gray borders, moderate radii, quiet depth, and compact controls. Avoid decorative gradients or motion that compete with the data.
- Keep the dashboard title, freshness/autosave status, filters, warnings, and evidence affordances visible without filling the header with workflow terminology.

### 2.2 Navigation behavior

- The history panel can collapse to the icon rail and remembers the user preference per device.
- The active history item represents the current governed analysis/dashboard context, not an unscoped chatbot thread.
- Creating a new analysis starts with dataset/dashboard scope selection or inherits a clearly displayed current scope.
- Reopening history reauthorizes current access and shows stable unavailable/removed states rather than leaking prior names or counts.

## 3. Dashboard canvas

### 3.1 Layout model

- Use a responsive 12-column logical grid.
- Widgets may span 3, 4, 6, 8, or 12 columns and declare a minimum accessible height.
- In `Tự động`, widgets fill the next compatible horizontal space and continue vertically as rows fill.
- Optional `Ngang` and `Dọc` ordering preferences change insertion and reflow priority, not the governed data or widget definition.
- Desktop-width layouts preserve authored positions where compatible. Tablet and narrow layouts reflow deterministically; mobile viewing stacks widgets vertically.
- Reflow must never hide evidence, warnings, freshness, quality caveats, denied states, or required chart alternatives.
- Every page and widget keeps a stable identifier across move, resize, configure, remove, restore, and breakpoint changes.

### 3.2 Authoring behavior

- Conversation is the primary way to create a new chart. A secondary `Thêm biểu đồ` affordance, if present, opens the same agent flow rather than a separate inconsistent catalog.
- Direct canvas controls support moving, keyboard moving, resizing, configuring, duplicating when permitted, removing, and restoring widgets.
- Manual layout edits autosave after a short debounce with expected-revision conflict handling.
- Accepted agent changes create a new immutable parented DashboardVersion. The authoring UI displays `Đã lưu` or `Đang lưu…`; it does not require the user to work in a visible “Bản nháp” mode.
- Autosave never publishes, changes audience, broadens permission, moves data, or accepts a pending agent proposal.

### 3.3 Widget allowlist

V1 uses the canonical allowlist from DDA-021:

- KPI
- Table
- Bar, including grouped or stacked variants when the typed result is compatible
- Line/area
- Pie/donut
- Text/evidence note

Each widget definition declares compatible field types, cardinality, grain, units, maximum result shape, interactions, evidence behavior, accessible summary, fallback table, and responsive size bounds. No agent-generated component code, SQL, JavaScript, Vega expression, or arbitrary chart grammar becomes executable.

## 4. Dashboard-local agent

### 4.1 Collapsed invitation

- Keep a small agent icon at the bottom-right of the dashboard tab.
- Attach a lightweight speech bubble to the icon: `Muốn thêm biểu đồ mới hoặc chỉnh biểu đồ hiện tại? Nói với tôi.`
- The bubble can be dismissed and should not cover required content. The icon remains available.
- Show the invitation on first use, after an empty-state dashboard opens, or when the user explicitly invokes chart help. Do not repeatedly animate or reopen it after dismissal.

### 4.2 Conversation flow

1. The user opens the invitation and describes the desired question, chart, comparison, or change in Vietnamese or English.
2. The client sends only the authorized dashboard/dataset context through generated contracts. Source content is untrusted and cannot instruct the agent or authorize an effect.
3. The planner resolves metrics, dimensions, filters, time range/grain, joins, units, target page/widget, assumptions, output bounds, and estimated cost.
4. Material ambiguity produces a clarification or named alternatives. Unauthorized, unavailable, stale, or quality-blocked inputs produce the canonical stable non-answer reason.
5. Deterministic execution produces bounded result cells and provenance. AI may explain why a visualization fits but may not invent numeric results.
6. The agent opens a contextual chart picker containing only compatible allowlisted proposals.

### 4.3 Chart proposal picker

- Present two to four useful alternatives rather than every chart type.
- Each chart card includes a miniature preview, Vietnamese name, concise reason it fits, intended dimensions/measures, and an accessible text description.
- A `Chi tiết` disclosure shows the typed plan, affected page/widgets, assumptions, coverage, freshness, quality caveats, cost, and before/after summary required by DDA-016 and DDA-024.
- Users may select one or multiple compatible chart cards. Selection alone only highlights the proposal.
- A clear confirmation such as `Thêm 2 biểu đồ vào canvas` is the explicit acceptance event. Only then may the server create the next DashboardVersion.
- The accepted widgets appear on the active page, the grid reflows, focus moves to the first inserted widget, and an undo affordance restores the previous version.
- Further chat can refine the proposal before acceptance, for example “đổi sang 12 tháng”, “tách theo khu vực”, or “làm biểu đồ này cao hơn”.

### 4.4 Existing-chart changes

- Invoking the agent from a selected widget binds the conversation to that stable widget ID and clearly names the target.
- The proposal shows whether it will change visualization type, fields, filter scope, size, title, or explanation.
- Changes that alter a certified metric or permission boundary are blocked or routed through the owning review/approval policy; they are never silently applied.

## 5. Saved work versus publication

The authoring canvas intentionally avoids visible `Bản nháp` and `Xuất bản` modes while the user is composing. This is a presentation decision, not a domain-model deletion.

- Every accepted mutation still creates an immutable draft DashboardVersion with parent version, canonical hash, actor, and audit linkage.
- The canvas header communicates save state only: `Đang lưu…`, `Đã lưu`, `Không thể lưu`, or a conflict/retry state.
- Publication remains a separate authorized operation outside the canvas, reached from the dashboard sharing/release surface when the product slice includes it.
- A sharing action that requires a new DashboardSnapshot must preview audience and evidence/freshness consequences, reauthorize current scope, and obtain required approval.
- No autosave, chart choice, drag, resize, conversation, or recommendation changes a published snapshot or its audience.

This preserves DDA-024 and DDA-025 while keeping the authoring experience simple.

## 6. Trust, evidence, and data quality

- Every material KPI, table value, and chart series comes from deterministic result cells with exact plan/metric provenance.
- Widget frames expose freshness and quality state without claiming a “percentage correct.” If an overall quality score appears, it must disclose the deterministic formula, coverage, dimensions, weights, and limitations required by DDA-009 and DDA-010.
- Evidence opens in a permission-filtered drawer or table. Denied evidence does not reveal hidden field names, row counts, or source locations.
- Current authorization applies to every load, filter, drill-down, export, event, history reopen, and share resolution.
- AI/provider failure leaves saved dashboard viewing and manual typed analysis available.
- All proposal, acceptance, autosave-version, restore, evidence, and publication events use content-safe canonical audit records.

## 7. Component and dependency direction

Use the existing React/TypeScript Web architecture and generated API clients. The implementation plan should prefer these bounded responsibilities:

- `DashboardWorkspaceShell`
- `ApplicationRail`
- `AnalysisHistoryPanel`
- `DashboardHeader`
- `DashboardCanvas`
- `ResponsiveWidgetGrid`
- `WidgetFrame`
- `AgentInvitation`
- `DashboardAgentPanel`
- `ChartProposalPicker`
- `ProposalDetails`
- `AutosaveStatus`
- `FreshnessStatus`
- `EvidenceDrawer`

Preferred UI dependencies, subject to repository dependency review and locked versions:

- Existing repository primitives and shadcn/ui patterns for accessible controls, dialogs, tooltips, drawers, and menus
- Recharts through the repository chart wrapper for the bounded V1 widget catalog
- React Grid Layout v2 for responsive drag/resize with a tested keyboard-accessible companion interaction
- CSS transitions for shell collapse and state changes; GSAP is not required for this workspace

The chart-picker contract is declarative data, not UI code. It contains proposal ID, target page/widget IDs, allowlisted widget type, typed result binding, presentation configuration, supported spans, rationale, assumptions, cost, evidence behavior, and expected dashboard revision.

## 8. Responsive and accessible behavior

- All controls have Vietnamese and English accessible names, visible focus, keyboard operation, and non-color state indicators.
- Every chart has a concise text summary and an accessible fallback table over the same permission-filtered result.
- Keyboard users can open the agent, move between proposal cards, select proposals, inspect details, confirm insertion, reach the inserted widget, and undo.
- The agent panel becomes a right-side sheet on medium screens and a full-height bottom sheet on narrow screens.
- The history panel becomes an overlay drawer below desktop width.
- The invitation bubble collapses to the icon before it would obscure canvas warnings or controls.
- Reduced-motion users receive immediate state changes without spring or parallax effects.

## 9. Required states

The implementation must design and test:

- Empty dashboard with agent invitation
- Populated responsive dashboard
- Agent closed, invitation visible, invitation dismissed, and agent open
- Clarification required
- Compatible chart proposals
- No compatible visualization
- Proposal selected but not accepted
- Saving, saved, save failed, revision conflict, retry, and undo
- Fresh, refreshing, stale, blocked, and source unavailable
- AI disabled or provider unavailable
- Unauthorized/removed dataset, dashboard, widget, evidence, or history entry
- Narrow-screen canvas and chart fallback table

## 10. Verification expectations

The implementation plan must link tests to the applicable requirement IDs and cover at least:

- Typed proposal validation and rejection of arbitrary code or numeric AI output
- Ambiguity and stable non-answer reasons
- Compatible-only chart selection
- Explicit confirmation before agent mutation
- Immutable parented version creation and autosave conflict recovery
- Stable page/widget IDs, restore, and deterministic responsive reflow
- Keyboard, focus, screen-reader labels, reduced motion, and fallback tables
- Persistent freshness/evidence/warning visibility at all breakpoints
- Tenant and row/field authorization for load, filter, drill, history, evidence, and events
- Provider-disabled deterministic fallback
- Vietnamese default and complete English messages
- Visual regression coverage for the approved shell, invitation, agent panel, chart picker, and canvas layouts

## 11. Deferred scope

- Genuine streaming dashboards
- Arbitrary/custom visualization code
- A general-purpose chatbot outside governed data scope
- Full Android dashboard authoring
- New connector families
- AI-authored deterministic metrics or transformations
- Publication or sharing through autosave

## 12. Acceptance decisions

The following decisions were approved during visual review:

1. Blue, premium, restrained visual language with `Be Vietnam Pro`.
2. Retractable analysis history beside the application rail.
3. Dashboard page as the dominant canvas surface.
4. Responsive horizontal/vertical reflow based on widget size.
5. Dashboard-local agent icon and speech-bubble invitation.
6. Conversation-first chart creation followed by a visual proposal picker.
7. No visible `Bản nháp` or `Xuất bản` modes during authoring; autosave wording in the canvas.
8. Existing governance, version, proposal acceptance, publication, evidence, permission, and audit semantics remain authoritative behind the simplified experience.
