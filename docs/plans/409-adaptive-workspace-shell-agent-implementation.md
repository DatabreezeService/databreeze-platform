# Adaptive Workspace Shell and Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Approved by the product owner on 2026-08-14

**Goal:** Deliver the approved premium blue Web workspace with an adaptive sidebar, a dashboard-only canvas, and one conversation-aware agent that can propose and explicitly add compatible charts.

**Architecture:** Keep the existing React Router shell, generated conversation contracts, governed dashboard authoring commands, and server authorization boundaries. Add a presentation-only sidebar preference, derive authorized secondary navigation from the existing registry, synchronize conversation summaries through the shared agent store, and reuse the existing dashboard proposal/confirmation pipeline inside a richer chat surface.

**Tech Stack:** React 19, React Router 7, TypeScript 5.9, TanStack Query 5, Vitest, Testing Library, Vite, existing DataBreeze design tokens and generated contracts.

## Global Constraints

- Requirements: WEB-002, WEB-013, WEB-014, WEB-019, WEB-020, WEB-021, WEB-022, WEB-024; DDA-015, DDA-016, DDA-020, DDA-021, DDA-022, DDA-024, DDA-026, DDA-043, DDA-055, DDA-056.
- Vietnamese remains the default locale and English remains complete.
- Cobalt `#075DE8`, deep blue `#102A63`, and pale blue-gray `#F4F7FC` are the primary workspace colors.
- Do not add decorative gradients, emoji icons, arbitrary generated UI, SQL, JavaScript, or authoritative numeric values.
- The client never treats navigation filtering, stored preferences, or conversation presentation state as authorization.
- Dashboard mutations continue through existing governed authoring commands and require explicit user confirmation.
- Sidebar persistence stores only the compact/expanded presentation preference under `databreeze.sidebar.compact.v1`.
- Preserve existing tenant isolation, generated-contract parsing, exact version context, audit, evidence, and fail-closed unavailable states.

---

## File Structure

- `apps/web/src/components/sidebar-preference.ts` — bounded browser-only compact preference.
- `apps/web/src/components/application-rail.tsx` — adaptive sidebar presentation and accessible controls.
- `apps/web/src/components/shell-layout.tsx` — shell state, authorized secondary tools, and direct dashboard canvas outlet.
- `apps/web/src/styles/workspace-shell.css` — expanded/compact/mobile shell geometry and common page rhythm.
- `apps/web/src/features/agent/agent-store.ts` — shared authorized conversation summaries and active identity.
- `apps/web/src/features/agent/agent-chat-shell.tsx` — reusable conversation switcher, message list, context, and composer.
- `apps/web/src/features/agent/floating-agent-panel.tsx` — Data route composition around the shared chat shell.
- `apps/web/src/features/analysis/analysis-route-page.tsx` — authoritative conversation synchronization.
- `apps/web/src/features/dashboards/dashboard-agent-panel.tsx` — dashboard chat plus chart proposal selection.
- `apps/web/src/features/dashboards/dashboard-page.tsx` — chat presentation state and governed chart insertion.
- Existing route CSS files — consistent blue canvas, page hierarchy, focus, responsive, and forced-color behavior.

---

### Task 1: Adaptive sidebar preference and accessible navigation

**Files:**
- Create: `apps/web/src/components/sidebar-preference.ts`
- Modify: `apps/web/src/components/application-rail.tsx`
- Modify: `apps/web/src/styles/workspace-shell.css`
- Test: `apps/web/test/application-rail.test.tsx`
- Test: `apps/web/test/navigation-access.test.tsx`

**Interfaces:**
- Produces: `readSidebarCompactPreference(): boolean | undefined`
- Produces: `writeSidebarCompactPreference(compact: boolean): void`
- Produces: `ApplicationRailProperties.collapsed`, `onCollapsedChange`, and `secondaryItems`
- Consumes: `UdwPrimaryNavItemV1`, `NavigationItem`, and existing route labels.

- [ ] **Step 1: Write failing sidebar tests**

```tsx
it('starts expanded, collapses to icon-only navigation, and remembers the preference', async () => {
  const user = userEvent.setup();
  renderDashboard();
  expect(screen.getByText('Bảng điều khiển')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Thu gọn thanh bên' }));
  expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveAttribute(
    'data-collapsed',
    'true',
  );
  expect(localStorage.getItem('databreeze.sidebar.compact.v1')).toBe('true');
  expect(screen.getByRole('link', { name: 'Bảng điều khiển' })).toHaveAttribute(
    'title',
    'Bảng điều khiển',
  );
});

it('renders authorized Inbox, Reviews, and Settings as secondary tools', async () => {
  renderDashboard();
  expect(await screen.findByRole('link', { name: 'Hộp thư đến' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Cần xem xét' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'Cài đặt' })).toBeVisible();
});
```

- [ ] **Step 2: Run the sidebar tests and confirm RED**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/application-rail.test.tsx test/navigation-access.test.tsx`

Expected: FAIL because no collapse control, preference helper, or secondary group exists.

- [ ] **Step 3: Implement the bounded preference helper**

```ts
const SIDEBAR_COMPACT_KEY = 'databreeze.sidebar.compact.v1';

export function readSidebarCompactPreference(): boolean | undefined {
  const value = globalThis.localStorage?.getItem(SIDEBAR_COMPACT_KEY);
  return value === 'true' ? true : value === 'false' ? false : undefined;
}

export function writeSidebarCompactPreference(compact: boolean): void {
  globalThis.localStorage?.setItem(SIDEBAR_COMPACT_KEY, String(compact));
}
```

- [ ] **Step 4: Implement expanded, compact, and mobile sidebar rendering**

Add a real toggle with `aria-expanded={!collapsed}`, localized expand/collapse labels, the full wordmark when expanded, the mark when compact, grouped primary and secondary lists, icon-only `title` attributes, route-selection close on mobile, and existing Escape handling. Secondary items use the existing registered paths and authorization-filtered list supplied by `ShellLayout`.

- [ ] **Step 5: Add shell geometry and accessibility CSS**

```css
.app-shell { --sidebar-width: 248px; grid-template-columns: var(--sidebar-width) minmax(0, 1fr); }
.app-shell[data-sidebar-collapsed='true'] { --sidebar-width: 72px; }
.application-rail__label { opacity: 1; white-space: nowrap; }
.application-rail[data-collapsed='true'] .application-rail__label,
.application-rail[data-collapsed='true'] .application-rail__group-label { position: absolute; inline-size: 1px; block-size: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (prefers-reduced-motion: reduce) { .app-shell, .application-rail { transition: none; } }
```

- [ ] **Step 6: Run sidebar tests and confirm GREEN**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/application-rail.test.tsx test/navigation-access.test.tsx`

Expected: PASS with exactly three primary destinations and authorized secondary tools.

- [ ] **Step 7: Commit the sidebar slice**

```bash
git add apps/web/src/components/sidebar-preference.ts apps/web/src/components/application-rail.tsx apps/web/src/styles/workspace-shell.css apps/web/test/application-rail.test.tsx apps/web/test/navigation-access.test.tsx
git commit -m "feat(web): add adaptive workspace sidebar"
```

---

### Task 2: Shell integration and dashboard-only canvas

**Files:**
- Modify: `apps/web/src/components/shell-layout.tsx`
- Modify: `apps/web/src/styles/workspace-shell.css`
- Test: `apps/web/test/application-rail.test.tsx`
- Test: `apps/web/test/dashboard-workspace.test.tsx`

**Interfaces:**
- Consumes: `readSidebarCompactPreference`, `writeSidebarCompactPreference`, `filterNavigationItems`.
- Produces: direct dashboard outlet with no `DashboardWorkspace` history wrapper.

- [ ] **Step 1: Write failing shell tests**

```tsx
it('renders dashboard directly on the canvas without analysis history controls', async () => {
  renderDashboard();
  expect(await screen.findByRole('heading', { name: 'Bức tranh kinh doanh' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Phân tích mới' })).toBeNull();
  expect(screen.queryByRole('searchbox', { name: 'Tìm kiếm lịch sử' })).toBeNull();
});

it('uses compact sidebar by default at tablet width only when no preference exists', () => {
  setViewport('(min-width: 768px) and (max-width: 1023px)', true);
  renderDashboard();
  expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toHaveAttribute(
    'data-collapsed',
    'true',
  );
});
```

- [ ] **Step 2: Run the shell tests and confirm RED**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/application-rail.test.tsx test/dashboard-workspace.test.tsx`

Expected: FAIL because Dashboard is still wrapped by `DashboardWorkspace` and sidebar state is not shell-owned.

- [ ] **Step 3: Integrate adaptive state and secondary navigation**

In `ShellLayout`, initialize explicit preference first, otherwise use compact mode for 768–1023 pixels; persist only user-triggered changes. Derive the secondary list with:

```ts
const SECONDARY_KEYS = new Set(['inbox', 'reviews', 'administration']);
const secondaryItems = filterNavigationItems(accessContext).filter((item) =>
  SECONDARY_KEYS.has(item.key),
);
```

Pass `collapsed`, `onCollapsedChange`, and `secondaryItems` to `ApplicationRail`, and set `data-sidebar-collapsed` on `.app-shell`.

- [ ] **Step 4: Remove the dashboard history wrapper from the route**

Replace the conditional `DashboardWorkspace` wrapper with a direct `<Outlet />`. Keep the `DashboardWorkspace` component and its focused legacy tests intact until its governed history behavior is deliberately retired elsewhere; it is simply no longer mounted inside Dashboard.

- [ ] **Step 5: Make the dashboard workspace fill the canvas**

Set `.main-workspace--dashboard` to a pale blue canvas with no nested history grid, min-width zero, and responsive padding. Remove dashboard-specific rail overrides that contradict the shared adaptive sidebar.

- [ ] **Step 6: Run shell and dashboard tests and confirm GREEN**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/application-rail.test.tsx test/dashboard-workspace.test.tsx test/dashboard-canvas.test.tsx`

Expected: PASS; Dashboard contains no analysis-history controls and canvas authoring remains functional.

- [ ] **Step 7: Commit the shell integration slice**

```bash
git add apps/web/src/components/shell-layout.tsx apps/web/src/styles/workspace-shell.css apps/web/test/application-rail.test.tsx apps/web/test/dashboard-workspace.test.tsx
git commit -m "feat(web): restore dashboard-only canvas"
```

---

### Task 3: Shared authorized conversation state and chat shell

**Files:**
- Modify: `apps/web/src/features/agent/agent-store.ts`
- Create: `apps/web/src/features/agent/agent-chat-shell.tsx`
- Modify: `apps/web/src/features/analysis/analysis-route-page.tsx`
- Modify: `apps/web/src/features/agent/floating-agent-panel.tsx`
- Modify: `apps/web/src/styles/workspace-shell.css`
- Test: `apps/web/test/floating-agent.test.tsx`
- Test: `apps/web/test/analysis-destination.test.tsx`

**Interfaces:**
- Produces: `AgentConversationSummaryV1`, `AgentMessagePresentationV1`, `setConversations`, `selectConversation`, and `getConversations`.
- Produces: `AgentChatShell` props for conversations, active ID, messages, context, composer, select, create, submit, and Analysis link.
- Consumes: authorized `DdaConversationSummary` and `DdaConversationLoadAccepted` results.

- [ ] **Step 1: Write failing store and panel tests**

```tsx
it('switches only among supplied authorized conversations', async () => {
  const user = userEvent.setup();
  render(<FloatingAgentPanel open locale="vi-VN" store={store} onClose={() => undefined} />);
  await user.click(screen.getByRole('button', { name: 'Đơn hàng bất thường' }));
  expect(store.getActiveConversation()?.conversationId).toBe('conversation-orders');
  expect(screen.getByText('Ngữ cảnh: Tồn kho cửa hàng')).toBeVisible();
});

it('opens the selected conversation in full Analysis', () => {
  renderPanel();
  expect(screen.getByRole('link', { name: 'Mở trong Phân tích' })).toHaveAttribute(
    'href',
    '/vi-VN/analysis?conversation=conversation-sales',
  );
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/floating-agent.test.tsx test/analysis-destination.test.tsx`

Expected: FAIL because the store exposes only one active conversation and the compact panel has no switcher or chat shell.

- [ ] **Step 3: Extend the shared store without persisting authority**

```ts
export interface AgentConversationSummaryV1 {
  readonly conversationId: string;
  readonly title: string;
  readonly datasetLabel: string;
  readonly datasetVersionLabel: string;
}

export interface AgentStoreV1 {
  getConversations(): readonly AgentConversationSummaryV1[];
  setConversations(items: readonly AgentConversationSummaryV1[]): void;
  selectConversation(conversationId: string): void;
}
```

`selectConversation` must ignore unknown IDs. Conversation summaries stay in memory and are replaced or cleared when authoritative history is unavailable.

- [ ] **Step 4: Build the reusable chat shell**

Render a compact conversation dropdown/list, new conversation button, authorized context summary, scrollable user/assistant messages, a labeled textarea, loading/denial/unavailable states, send button, and Analysis deep link. Keep focus trap/return behavior in the containing panel.

- [ ] **Step 5: Synchronize Analysis history into the store**

When the authorized history query succeeds, map all authorized summaries into `setConversations`; when it fails or becomes empty, clear them. Selecting a conversation from Analysis or the compact agent uses the same active ID, while URL search parameters remain the full Analysis source of navigation truth.

- [ ] **Step 6: Compose Data floating agent with the chat shell**

Preserve the current Data context and fail-closed behavior. Do not fabricate messages or enable send when no authorized conversation/send callback exists. The new-conversation action links to or opens Analysis unless a real creation callback is supplied.

- [ ] **Step 7: Run focused tests and confirm GREEN**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/floating-agent.test.tsx test/analysis-destination.test.tsx`

Expected: PASS for switching, context restoration, Analysis link, unavailable history, and no fabricated message behavior.

- [ ] **Step 8: Commit shared agent foundations**

```bash
git add apps/web/src/features/agent apps/web/src/features/analysis/analysis-route-page.tsx apps/web/src/styles/workspace-shell.css apps/web/test/floating-agent.test.tsx apps/web/test/analysis-destination.test.tsx
git commit -m "feat(web): share authorized agent conversations"
```

---

### Task 4: Dashboard agent chat and explicit chart insertion

**Files:**
- Modify: `apps/web/src/features/dashboards/dashboard-agent-panel.tsx`
- Modify: `apps/web/src/features/dashboards/dashboard-page.tsx`
- Modify: `apps/web/src/features/dashboards/dashboard-page.css`
- Test: `apps/web/test/dashboard-agent-panel.test.tsx`
- Test: `apps/web/test/chart-proposal-picker.test.tsx`
- Test: `apps/web/test/dashboard-canvas.test.tsx`

**Interfaces:**
- Consumes: `AgentChatShell`, `workspaceAgentStore`, existing `askForChart`, `acceptCharts`, and `DashboardAuthoringCommandQueueV1`.
- Produces: a Notion-like chat panel whose proposal confirmation calls the existing governed authoring path exactly once.

- [ ] **Step 1: Write failing dashboard agent tests**

```tsx
it('shows conversation history and keeps proposals inside the assistant turn', async () => {
  renderAgentPanel({ conversations, messages, proposalOptions });
  expect(screen.getByRole('button', { name: 'Bức tranh kinh doanh' })).toBeVisible();
  expect(screen.getByText('Cho tôi xem doanh thu theo khu vực')).toBeVisible();
  expect(screen.getByRole('checkbox', { name: 'So sánh theo nhóm' })).toBeVisible();
});

it('names the exact mutation and does not add a chart before confirmation', async () => {
  const user = userEvent.setup();
  renderDashboard();
  await openProposalAndSelectTwo(user);
  expect(screen.getByRole('button', { name: 'Thêm 2 biểu đồ vào canvas' })).toBeVisible();
  expect(screen.queryByText('Biểu đồ được đề xuất')).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Thêm 2 biểu đồ vào canvas' }));
  expect(await screen.findByText('Biểu đồ được đề xuất')).toBeVisible();
});
```

- [ ] **Step 2: Run dashboard agent tests and confirm RED**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-agent-panel.test.tsx test/chart-proposal-picker.test.tsx test/dashboard-canvas.test.tsx`

Expected: FAIL because the current panel is form-like and lacks conversation/message composition.

- [ ] **Step 3: Compose the panel around `AgentChatShell`**

Keep the proposal picker within the latest assistant response. Add exact selected-count copy:

```ts
const confirmLabel = locale === 'vi-VN'
  ? `Thêm ${selectedOptionIds.length} biểu đồ vào canvas`
  : `Add ${selectedOptionIds.length} charts to canvas`;
```

Do not call `onConfirmProposal` from selection or agent response rendering.

- [ ] **Step 4: Bind dashboard chat presentation state**

Append the submitted question as a user presentation message, call existing `askForChart`, then append a concise assistant explanation carrying proposal cards. In demo mode, use only the existing deterministic demo proposal values. In live mode, show only returned governed results and clear/disable mutation controls on unavailable or rejected responses.

- [ ] **Step 5: Preserve governed insertion and focus behavior**

Call existing `acceptCharts(selectedOptionIds)` only from the explicit confirm button. After success, set the canvas focus target to the first inserted stable widget ID and announce saving/saved/conflict status through the existing authoring state.

- [ ] **Step 6: Style the panel as a responsive AI chat**

Use a 420-pixel wide desktop panel, right sheet at medium widths, and full-height bottom sheet on narrow screens. Use white/blue-gray surfaces, restrained borders, distinct user/assistant message alignment, visible context, and no gradients.

- [ ] **Step 7: Run dashboard agent tests and confirm GREEN**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/dashboard-agent-panel.test.tsx test/chart-proposal-picker.test.tsx test/dashboard-canvas.test.tsx`

Expected: PASS for conversation switching, message submission, proposal selection, explicit confirmation, and no silent mutation.

- [ ] **Step 8: Commit dashboard agent integration**

```bash
git add apps/web/src/features/dashboards/dashboard-agent-panel.tsx apps/web/src/features/dashboards/dashboard-page.tsx apps/web/src/features/dashboards/dashboard-page.css apps/web/test/dashboard-agent-panel.test.tsx apps/web/test/chart-proposal-picker.test.tsx apps/web/test/dashboard-canvas.test.tsx
git commit -m "feat(web): add conversational dashboard agent"
```

---

### Task 5: Premium organization for Data, Reviews, Inbox, Analysis, and Settings

**Files:**
- Modify: `apps/web/src/features/analysis/analysis-page.css`
- Modify: `apps/web/src/features/data/data-workspace.css`
- Modify: `apps/web/src/styles/data-intake.css`
- Modify: `apps/web/src/features/settings/workspace-settings.css`
- Modify only where needed for semantic hierarchy: corresponding route page `.tsx` files.
- Test: `apps/web/test/analysis-destination.test.tsx`
- Test: `apps/web/test/data-pipeline-route.test.tsx`
- Test: `apps/web/test/workspace-settings-route.test.tsx`
- Test: route tests for Inbox/Data already present under `apps/web/test/`.

**Interfaces:**
- Consumes: shared sidebar and shell canvas tokens.
- Produces: consistent title, description, action, primary work surface, and evidence hierarchy across all first-party routes.

- [ ] **Step 1: Add failing hierarchy and state tests**

For each route, assert one `h1`, a concise explanatory description, visible primary work surface, and distinct unavailable/empty state. Assert that Reviews keeps the enabled CSV/XLSX upload path when local/demo intake is configured and that Settings keeps member/session controls operational.

- [ ] **Step 2: Run the focused page suites and confirm RED where hierarchy is missing**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/analysis-destination.test.tsx test/data-pipeline-route.test.tsx test/workspace-settings-route.test.tsx test/data-workspace.test.tsx`

Expected: only pages missing the approved semantic hierarchy fail.

- [ ] **Step 3: Normalize page composition and visual tokens**

Use one compact heading block, state/action row, white primary workspace, and quieter supporting evidence. Remove decorative over-cardification, green primary actions, mixed radius scales, and unnecessary pill wrappers. Keep success green and warnings amber only for semantic statuses; primary actions and selection remain cobalt.

- [ ] **Step 4: Verify responsive and accessibility rules in CSS**

Add 200-percent zoom-safe wrapping, focus-visible rings, forced-color borders, reduced motion, and mobile stacking without horizontal clipping.

- [ ] **Step 5: Run focused page suites and confirm GREEN**

Run: `corepack pnpm --filter @databreeze/web exec vitest run test/analysis-destination.test.tsx test/data-pipeline-route.test.tsx test/workspace-settings-route.test.tsx test/data-workspace.test.tsx`

Expected: PASS with live controls preserved and unavailable states not presented as empty data.

- [ ] **Step 6: Commit page organization**

```bash
git add apps/web/src/features/analysis apps/web/src/features/data apps/web/src/features/data-intake apps/web/src/features/settings apps/web/src/styles/data-intake.css apps/web/test
git commit -m "feat(web): unify premium workspace pages"
```

---

### Task 6: Full verification and local runtime proof

**Files:**
- Modify only for defects revealed by verification.
- Verify: `apps/web` and local Web container.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: tested local Web behavior and evidence for handoff.

- [ ] **Step 1: Run the complete Web unit suite**

Run: `corepack pnpm --filter @databreeze/web test`

Expected: every Vitest file passes with zero failures.

- [ ] **Step 2: Run TypeScript and production build**

Run: `corepack pnpm --filter @databreeze/web typecheck`

Expected: exit 0.

Run: `corepack pnpm --filter @databreeze/web build`

Expected: exit 0 and the existing 256,000-byte gzip initial JavaScript budget passes.

- [ ] **Step 3: Run formatting and whitespace checks**

Run: `corepack pnpm exec prettier --check apps/web/src apps/web/test docs/plans/409-adaptive-workspace-shell-agent-implementation.md`

Expected: exit 0.

Run: `git diff --check`

Expected: no whitespace errors in the owned slice.

- [ ] **Step 4: Rebuild and restart only the local Web service**

Run: `docker compose --env-file infrastructure/local/.env.local -f infrastructure/local/compose.yml --profile app build web`

Expected: exit 0.

Run: `docker compose --env-file infrastructure/local/.env.local -f infrastructure/local/compose.yml --profile app up -d --no-deps web gateway`

Expected: Web and gateway become healthy without replacing PostgreSQL data.

- [ ] **Step 5: Verify local routes and API routing**

Run: `Invoke-WebRequest -SkipCertificateCheck https://localhost:8443/vi-VN/dashboards | Select-Object StatusCode,Headers`

Expected: 200 `text/html`.

Run: `try { Invoke-WebRequest -SkipCertificateCheck https://localhost:8443/v1/me/bootstrap } catch { $_.Exception.Response.StatusCode.value__ }`

Expected: 401 for a signed-out browser, proving `/v1` is API-routed rather than rewritten to the SPA.

- [ ] **Step 6: Perform signed-in browser acceptance**

At desktop and narrow widths, verify: wordmark-expanded sidebar; compact icon mode; preference across reload; exactly three primary destinations; authorized secondary tools; no Dashboard history panel or `Phân tích mới`; pale-blue full canvas; agent conversation switching; contextual messages; explicit chart confirmation; inserted widget focus; Data/Reviews/Settings page organization; login/logout and route protection.

- [ ] **Step 7: Commit verified implementation**

```bash
git add docs/plans/409-adaptive-workspace-shell-agent-implementation.md apps/web
git commit -m "feat(web): deliver adaptive premium workspace"
```

---

## Self-Review

- Spec coverage: Tasks 1–2 cover adaptive navigation and dashboard-only canvas; Tasks 3–4 cover shared conversations, chat, and explicit chart insertion; Task 5 covers all named secondary pages; Task 6 covers accessibility, bundle, local runtime, and signed-in acceptance.
- Authorization: navigation is only a client hint; API and generated-contract boundaries remain authoritative.
- Mutation safety: chart selection does not mutate; the exact confirm action invokes the existing governed authoring command path.
- Type consistency: shared store and chat shell names are defined in Task 3 and consumed unchanged in Task 4.
- No backend values, prior messages, tenant scope, or success state are fabricated when live services are unavailable.
