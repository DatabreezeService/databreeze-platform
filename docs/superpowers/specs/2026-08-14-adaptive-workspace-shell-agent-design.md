# Adaptive Workspace Shell and Agent Design

**Status:** Approved by the product owner on 2026-08-14  
**Applies to:** DataBreeze Web workspace shell, Dashboard, Analysis, Data, Inbox, Reviews, Settings, and the shared workspace agent  
**Refines:** `2026-08-12-unified-data-workspace-experience-design.md`, `404-dashboard-workspace-redesign-design.md`, and Web tasks in plan `406`  
**Requirement links:** WEB-002, WEB-013, WEB-014, WEB-019, WEB-020, WEB-021, WEB-022, WEB-024; DDA-015, DDA-016, DDA-020, DDA-021, DDA-022, DDA-024, DDA-026, DDA-043, DDA-055, DDA-056

## 1. Product outcome

DataBreeze uses one calm, premium, blue workspace shell. The shell makes the product hierarchy obvious without reducing the dashboard canvas or agent to small cards. The interface must feel intentionally designed, not like a collection of unrelated generated pages.

The user can:

1. Expand or collapse the global sidebar.
2. Reach the three primary destinations immediately.
3. Reach operational workspace tools without giving them equal visual weight.
4. Use the Dashboard as a full canvas with no analysis-history column inside it.
5. Open one shared agent from Dashboard or Data, switch conversations, continue history, ask a question, inspect chart proposals, select compatible charts, and explicitly add them to the dashboard canvas.

## 2. Adaptive global sidebar

### 2.1 Desktop expanded state

- The sidebar is expanded by default on a new desktop browser profile.
- It is 248 pixels wide and contains the DataBreeze wordmark at the top.
- A visible collapse control sits beside or immediately below the wordmark.
- Primary navigation is grouped under the workspace heading and contains exactly Dashboard, Analysis, and Data.
- Secondary workspace tools contain Inbox, Reviews, and Settings. They are visually quieter than the primary destinations.
- Each entry uses the existing approved icon set plus a Vietnamese or English label.
- The bottom area may contain locale, account, or settings access only when those actions are not already available more clearly in the top bar.

### 2.2 Desktop compact state

- The sidebar is 72 pixels wide.
- Only the DataBreeze brand mark, navigation icons, and expand control remain visible.
- Every icon retains an accessible name and a native tooltip/title.
- The current destination remains visually obvious.
- The user's preference is remembered per browser device. No tenant, member, dataset, or source identity is persisted with this preference.

### 2.3 Responsive state

- Between 768 and 1023 pixels, compact mode is the default unless the user explicitly expands it.
- Below 768 pixels, the sidebar opens as an expanded modal navigation drawer and closes on route selection, Escape, or explicit close.
- Reduced-motion preference removes width and transform animation without removing state feedback.

## 3. Information architecture

The shell preserves exactly three primary destinations:

1. **Dashboard** — governed visual canvas, filters, freshness, evidence, and agent.
2. **Analysis** — complete AI conversation workspace with full conversation history.
3. **Data** — datasets, sources, preparation, versions, and health.

Secondary workspace tools are:

- **Inbox** — governed incoming artifacts and review state.
- **Reviews** — CSV/XLSX intake, preparation review, ETL evidence, and explicit acceptance.
- **Settings** — members, agent grants, sessions, and workspace controls.

Secondary tools stay reachable from the sidebar but do not become primary product destinations. Existing governed routes and authorization boundaries remain unchanged.

## 4. Dashboard canvas

- Dashboard renders directly on a pale blue canvas field.
- The application sidebar is its only permanent left navigation.
- The Dashboard must not render `Phân tích mới`, conversation search, or an analysis-history column.
- The dashboard page, title, filters, freshness, autosave state, KPI widgets, charts, evidence affordances, and agent entry remain visible.
- White widget surfaces use restrained blue-gray borders, moderate radii, quiet depth, and no decorative gradients.
- The canvas uses available width in either sidebar state and reflows without horizontal clipping.
- Moving, resizing, removing, restoring, and keyboard operations continue to use stable widget IDs and existing governed authoring commands.

## 5. Shared workspace agent

### 5.1 Compact entry point

- Dashboard and Data show the shared agent button at the bottom-right.
- Analysis does not render a second floating agent because Analysis is already the full agent interface.
- The button uses the current DataBreeze brand asset and an accessible label.

### 5.2 Agent panel structure

Opening the agent displays a responsive AI chat panel:

1. DataBreeze agent identity and current authorized context.
2. Conversation switcher showing authorized conversations only.
3. New conversation action inside the agent, not inside the Dashboard canvas.
4. Scrollable message history with distinct user and assistant treatment.
5. Context summary for selected dashboard, datasets, versions, filters, or widget target.
6. Composer with send action, loading state, denial state, and retry-safe error state.
7. Link to open the same conversation in the full Analysis destination.

The panel is approximately 420 pixels wide on wide screens, becomes a right-side sheet on medium screens, and a full-height bottom sheet on narrow screens.

### 5.3 Conversation behavior

- The compact agent and Analysis consume the same authorized conversation summaries and active-conversation identity.
- Switching a conversation restores its permitted dashboard/dataset/version context without exposing hidden resources.
- Creating a conversation inherits clearly displayed current scope or asks for scope before sending.
- Conversation continuation reauthorizes the current member and current resource versions.
- The UI never fabricates prior messages, source values, or results when the conversation API is unavailable.

## 6. Dashboard chart proposal journey

When the user asks to show something on the Dashboard:

1. The agent records the question in the active authorized conversation.
2. The system resolves a typed analysis plan against current permissions and exact dataset versions.
3. The agent explains the proposed analytical framing in concise language.
4. The panel displays only compatible allowlisted chart proposal cards.
5. Each card shows chart type, title, rationale, supported dimensions/metric, important assumptions, evidence behavior, and a bounded preview state.
6. The user selects one or more cards.
7. The primary confirmation names the exact consequence, for example `Thêm 2 biểu đồ vào canvas`.
8. Only that confirmation may create the next immutable dashboard version and place widgets on the canvas.
9. The canvas communicates saving, saved, failed, or conflict state and focuses the first inserted widget when successful.

The agent never generates executable UI, arbitrary chart code, SQL, JavaScript, or authoritative numeric values. It never publishes, broadens audience, changes permissions, or silently alters the shared dashboard.

## 7. Page organization and visual system

All first-party Web pages use:

- Be Vietnam Pro.
- Cobalt `#075DE8` for primary actions and selection.
- Deep blue `#102A63` for primary text and selected navigation.
- Pale blue-gray `#F4F7FC` or equivalent canvas background.
- White working surfaces with blue-gray borders.
- Moderate 10–18 pixel radii based on hierarchy.
- Shadows with no more than 8 pixels of blur when paired with borders.
- No decorative gradients, oversized marketing headings, emoji icons, handcrafted placeholder art, or excessive pill containers.

Each page follows the same information order:

1. Compact breadcrumb or eyebrow when needed.
2. One clear page title and explanatory sentence.
3. Current state or critical action.
4. Primary work surface.
5. Secondary details and evidence.

Loading, empty, unavailable, unauthorized, conflict, and success are visibly distinct. An unavailable backend never appears as confirmed-empty data.

## 8. Accessibility and interaction

- Sidebar collapse/expand is a real button with `aria-expanded` and an explicit label.
- Navigation remains reachable and understandable at 200 percent zoom.
- Agent conversation switching, proposal selection, confirmation, and close are keyboard operable.
- Focus moves into the agent on open, returns to the trigger on close, and moves to an inserted widget after confirmed placement.
- Icon-only navigation keeps accessible text and tooltip titles.
- Forced-colors and reduced-motion states remain functional.
- Vietnamese is complete and default; English remains complete.

## 9. Verification

Implementation is not complete until the following pass:

- Unit tests for sidebar default, collapse, remembered preference, icon-only labels, mobile drawer, and route selection.
- Shell tests proving exactly three primary destinations and the quieter secondary tool group.
- Dashboard tests proving no analysis-history or `Phân tích mới` appears in the canvas.
- Agent tests for conversation switching, new conversation, contextual history, message composition, Analysis deep link, proposal selection, explicit confirmation, and no silent mutation.
- Existing dashboard authoring, tenant-isolation, generated-contract, and permission tests.
- Web TypeScript check, full Web tests, production build, bundle budget, and local container health.
- Signed-in browser comparison against the approved dashboard reference at desktop and narrow widths.

## 10. Normative delta

This design replaces the earlier presentation rule that the Dashboard permanently hosts a retractable analysis-history panel. Conversation history now lives in the full Analysis destination and inside the opened compact agent. The global application rail becomes an adaptive sidebar that can display labels. The requirement for exactly three primary destinations, one shared agent, explicit chart confirmation, governed typed plans, and a pale-blue dashboard canvas remains unchanged.

