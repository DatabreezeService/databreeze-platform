import { describe, expect, it } from 'vitest';

import type {
  DashboardWorkspaceHistoryV1,
  DdaDashboardChartProposal,
} from '../src/features/dashboards/dashboard-authoring-api.ts';
import {
  createDashboardAuthoringState,
  dashboardAuthoringReducer,
} from '../src/features/dashboards/dashboard-authoring-reducer.ts';

const identifiers = {
  dashboard: '00000000-0000-4000-8000-000000000001',
  parentVersion: '00000000-0000-4000-8000-000000000002',
  proposal: '00000000-0000-4000-8000-000000000003',
  analysisPlan: '00000000-0000-4000-8000-000000000004',
  page: '00000000-0000-4000-8000-000000000005',
  optionOne: '00000000-0000-4000-8000-000000000006',
  optionTwo: '00000000-0000-4000-8000-000000000007',
  materialization: '00000000-0000-4000-8000-000000000008',
} as const;

function proposalOption(optionId: string): DdaDashboardChartProposal['options'][number] {
  return {
    optionId,
    type: 'BAR',
    title: { vi: 'Doanh thu', en: 'Revenue' },
    rationale: { vi: 'Theo thời gian', en: 'Over time' },
    accessibilityDescription: { vi: 'Biểu đồ doanh thu', en: 'Revenue chart' },
    binding: {
      analysisPlanVersionId: identifiers.analysisPlan,
      materializationDefinitionId: identifiers.materialization,
      dimensionIds: [],
      measureIds: [],
    },
    dimensions: [],
    measures: [],
    supportedSpans: [6],
    defaultSpan: 6,
    assumptions: ['Monthly grouping'],
    estimate: { cpuMs: 20, memoryMb: 32 },
    evidenceBehavior: 'REQUIRED',
  };
}

const proposal: DdaDashboardChartProposal = {
  schemaVersion: 3,
  proposalId: identifiers.proposal,
  dashboardId: identifiers.dashboard,
  parentVersionId: identifiers.parentVersion,
  expectedRevision: 7,
  analysisPlanVersionId: identifiers.analysisPlan,
  target: { pageId: identifiers.page },
  options: [proposalOption(identifiers.optionOne), proposalOption(identifiers.optionTwo)],
  summary: { vi: 'Hai lựa chọn', en: 'Two options' },
  previewOnly: true,
  publishes: false,
  createdAt: '2026-08-12T00:00:00.000Z',
};

describe('dashboard authoring reducer [DDA-020, DDA-024]', () => {
  it('keeps selections limited to the active proposal options', () => {
    const initial = createDashboardAuthoringState({
      dashboardId: identifiers.dashboard,
      versionId: identifiers.parentVersion,
      revision: 7,
    });
    const received = dashboardAuthoringReducer(initial, {
      type: 'PROPOSAL_RECEIVED',
      proposal,
    });
    const selected = dashboardAuthoringReducer(received, {
      type: 'OPTION_TOGGLED',
      optionId: identifiers.optionOne,
    });
    const unknownOption = dashboardAuthoringReducer(selected, {
      type: 'OPTION_TOGGLED',
      optionId: '00000000-0000-4000-8000-000000000099',
    });

    expect(unknownOption.activeProposal).toBe(proposal);
    expect(unknownOption.selectedOptionIds).toEqual([identifiers.optionOne]);
  });

  it('commits new immutable draft metadata only after a save succeeds', () => {
    const initial = createDashboardAuthoringState({
      dashboardId: identifiers.dashboard,
      versionId: identifiers.parentVersion,
      revision: 7,
    });
    const saving = dashboardAuthoringReducer(initial, { type: 'SAVE_STARTED' });
    const saved = dashboardAuthoringReducer(saving, {
      type: 'SAVE_SUCCEEDED',
      versionId: '00000000-0000-4000-8000-000000000011',
      revision: 8,
    });

    expect(saved.saveState).toBe('SAVED');
    expect(saved.currentDraft).toEqual({
      dashboardId: identifiers.dashboard,
      versionId: '00000000-0000-4000-8000-000000000011',
      revision: 8,
    });
    expect(saved.lastAuthorizedView).toEqual(saved.currentDraft);
  });

  it('discards an optimistic layout on a revision conflict while retaining the last authorized view', () => {
    const initial = createDashboardAuthoringState({
      dashboardId: identifiers.dashboard,
      versionId: identifiers.parentVersion,
      revision: 7,
    });
    const changed = dashboardAuthoringReducer(initial, {
      type: 'LAYOUT_CHANGED',
      layout: {
        breakpoint: 'desktop',
        cells: [{ widgetId: identifiers.optionOne, x: 0, y: 0, w: 6, h: 4 }],
      },
    });
    const conflicted = dashboardAuthoringReducer(
      dashboardAuthoringReducer(changed, { type: 'SAVE_STARTED' }),
      {
        type: 'CONFLICT',
        serverVersionId: '00000000-0000-4000-8000-000000000011',
      },
    );

    expect(conflicted.saveState).toBe('CONFLICT');
    expect(conflicted.optimisticLayout).toBeUndefined();
    expect(conflicted.currentDraft).toEqual(initial.currentDraft);
    expect(conflicted.lastAuthorizedView).toEqual(initial.lastAuthorizedView);
    expect(conflicted.conflict).toEqual({
      serverVersionId: '00000000-0000-4000-8000-000000000011',
    });
  });

  it('keeps the active proposal and selected options when the safe view is reloaded', () => {
    const initial = createDashboardAuthoringState({
      dashboardId: identifiers.dashboard,
      versionId: identifiers.parentVersion,
      revision: 7,
    });
    const selected = dashboardAuthoringReducer(
      dashboardAuthoringReducer(initial, { type: 'PROPOSAL_RECEIVED', proposal }),
      { type: 'OPTION_TOGGLED', optionId: identifiers.optionOne },
    );

    const reloaded = dashboardAuthoringReducer(selected, {
      type: 'AUTHORIZED_VIEW_RELOADED',
      view: {
        dashboardId: identifiers.dashboard,
        versionId: '00000000-0000-4000-8000-000000000011',
        revision: 8,
      },
    });

    expect(reloaded.activeProposal).toBe(proposal);
    expect(reloaded.selectedOptionIds).toEqual([identifiers.optionOne]);
    expect(reloaded.currentDraft).toEqual({
      dashboardId: identifiers.dashboard,
      versionId: '00000000-0000-4000-8000-000000000011',
      revision: 8,
    });
    expect(reloaded.lastAuthorizedView).toEqual(reloaded.currentDraft);
    expect(reloaded.optimisticLayout).toBeUndefined();
    expect(reloaded.conflict).toBeUndefined();
  });

  it('appends a later authorized history page without duplicating a subject', () => {
    const firstPage: DashboardWorkspaceHistoryV1 = {
      schemaVersion: 3,
      items: [
        {
          kind: 'DASHBOARD',
          subjectId: identifiers.dashboard,
          title: { vi: 'Doanh thu', en: 'Revenue' },
          updatedAt: '2026-08-12T00:00:00.000Z',
        },
      ],
      nextCursor: 'next-page',
    };
    const nextPage: DashboardWorkspaceHistoryV1 = {
      schemaVersion: 3,
      items: [
        firstPage.items[0]!,
        {
          kind: 'ANALYSIS',
          subjectId: identifiers.analysisPlan,
          title: { vi: 'Xu hướng', en: 'Trend' },
          updatedAt: '2026-08-11T00:00:00.000Z',
          safeStatus: 'CURRENT',
        },
      ],
    };
    const initial = createDashboardAuthoringState({
      dashboardId: identifiers.dashboard,
      versionId: identifiers.parentVersion,
      revision: 7,
    });
    const first = dashboardAuthoringReducer(initial, {
      type: 'HISTORY_PAGE_RECEIVED',
      history: firstPage,
      append: false,
    });
    const appended = dashboardAuthoringReducer(first, {
      type: 'HISTORY_PAGE_RECEIVED',
      history: nextPage,
      append: true,
    });

    expect(appended.history.items.map((item) => item.subjectId)).toEqual([
      identifiers.dashboard,
      identifiers.analysisPlan,
    ]);
    expect(appended.history.nextCursor).toBeUndefined();
    expect(appended.history.loadState).toBe('READY');
  });

  it('records a version-level undo target as unsupported until a canonical restore command exists', () => {
    const state = dashboardAuthoringReducer(
      createDashboardAuthoringState({
        dashboardId: identifiers.dashboard,
        versionId: identifiers.parentVersion,
        revision: 7,
      }),
      {
        type: 'UNDO_AVAILABLE',
        versionId: '00000000-0000-4000-8000-000000000012',
      },
    );

    expect(state.undoTarget).toEqual({
      capability: 'VERSION_RESTORE_UNSUPPORTED',
      priorVersionId: '00000000-0000-4000-8000-000000000012',
    });
  });
});
