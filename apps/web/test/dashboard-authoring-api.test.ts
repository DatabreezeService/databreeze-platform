/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Vitest asymmetric matchers expose `any` by design. */

import { describe, expect, it, vi } from 'vitest';

import {
  applyDashboardAuthoringCommand,
  fetchDashboardWorkspaceHistory,
  proposeDashboardCharts,
  type DdaDashboardAuthoringCommand,
} from '../src/features/dashboards/dashboard-authoring-api.ts';

const identifiers = {
  dashboard: '00000000-0000-4000-8000-000000000001',
  parentVersion: '00000000-0000-4000-8000-000000000002',
  proposal: '00000000-0000-4000-8000-000000000003',
  analysisPlan: '00000000-0000-4000-8000-000000000004',
  page: '00000000-0000-4000-8000-000000000005',
  optionOne: '00000000-0000-4000-8000-000000000006',
  optionTwo: '00000000-0000-4000-8000-000000000007',
  materialization: '00000000-0000-4000-8000-000000000008',
  command: '00000000-0000-4000-8000-000000000009',
  widget: '00000000-0000-4000-8000-000000000010',
  nextVersion: '00000000-0000-4000-8000-000000000011',
} as const;

function proposalOption(optionId: string, type: string) {
  return {
    optionId,
    type,
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

function chartProposal(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    proposalId: identifiers.proposal,
    dashboardId: identifiers.dashboard,
    parentVersionId: identifiers.parentVersion,
    expectedRevision: 7,
    analysisPlanVersionId: identifiers.analysisPlan,
    target: { pageId: identifiers.page },
    options: [
      proposalOption(identifiers.optionOne, 'BAR'),
      proposalOption(identifiers.optionTwo, 'LINE'),
    ],
    summary: { vi: 'Hai lựa chọn', en: 'Two options' },
    previewOnly: true,
    publishes: false,
    createdAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  };
}

const proposalInput = {
  baseUrl: 'https://api.example.test',
  dashboardId: identifiers.dashboard,
  question: 'Doanh thu theo tháng',
  analysisPlanVersionId: identifiers.analysisPlan,
  targetPageId: identifiers.page,
  locale: 'vi' as const,
};

function layoutCommand(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 3,
    kind: 'SET_LAYOUT',
    commandId: identifiers.command,
    dashboardId: identifiers.dashboard,
    expectedVersionId: identifiers.parentVersion,
    expectedRevision: 7,
    breakpoint: 'desktop',
    cells: [{ widgetId: identifiers.widget, x: 0, y: 0, w: 6, h: 4 }],
    createdAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  } as unknown as DdaDashboardAuthoringCommand;
}

describe('dashboard authoring transport [DDA-020, DDA-026, DDA-043]', () => {
  it('accepts raw generated history and proposal success documents with credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            schemaVersion: 3,
            items: [
              {
                kind: 'DASHBOARD',
                subjectId: identifiers.dashboard,
                title: { vi: 'Doanh thu', en: 'Revenue' },
                updatedAt: '2026-08-12T00:00:00.000Z',
                safeStatus: 'CURRENT',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(chartProposal()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchDashboardWorkspaceHistory({ baseUrl: 'https://api.example.test', limit: 30 }),
    ).resolves.toMatchObject({ schemaVersion: 3, items: [{ subjectId: identifiers.dashboard }] });
    await expect(proposeDashboardCharts(proposalInput)).resolves.toMatchObject({
      schemaVersion: 3,
      proposalId: identifiers.proposal,
      previewOnly: true,
      publishes: false,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.example.test/v3/dda/dashboards/workspace-history?limit=30',
      expect.objectContaining({ method: 'GET', credentials: 'include' }),
    );
    const proposalRequest = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(proposalRequest.credentials).toBe('include');
    expect(JSON.parse(proposalRequest.body as string)).toEqual({
      question: proposalInput.question,
      analysisPlanVersionId: proposalInput.analysisPlanVersionId,
      targetPageId: proposalInput.targetPageId,
      locale: proposalInput.locale,
    });
  });

  it('rejects history metadata that carries a source path', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            schemaVersion: 3,
            items: [
              {
                kind: 'DASHBOARD',
                subjectId: '00000000-0000-4000-8000-000000000001',
                title: { vi: 'Doanh thu', en: 'Revenue' },
                updatedAt: '2026-08-12T00:00:00.000Z',
                sourcePath: 'C:\\private\\sales.xlsx',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(
      fetchDashboardWorkspaceHistory({ baseUrl: 'https://api.example.test' }),
    ).rejects.toThrow('DASHBOARD_AUTHORING_INVALID_RESPONSE');
  });

  it('rejects a history cursor larger than the generated 512-byte contract bound', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ schemaVersion: 3, items: [], nextCursor: 'x'.repeat(513) }),
            { status: 200 },
          ),
        ),
    );

    await expect(
      fetchDashboardWorkspaceHistory({ baseUrl: 'https://api.example.test' }),
    ).rejects.toThrow('DASHBOARD_AUTHORING_INVALID_RESPONSE');
  });

  it('rejects a chart proposal that claims it publishes', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(chartProposal({ publishes: true })), { status: 200 }),
        ),
    );

    await expect(proposeDashboardCharts(proposalInput)).rejects.toThrow(
      'DASHBOARD_AUTHORING_INVALID_RESPONSE',
    );
  });

  it('rejects a chart proposal with a widget type outside the allowlist', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(
            chartProposal({
              options: [
                proposalOption(identifiers.optionOne, 'BAR'),
                proposalOption(identifiers.optionTwo, 'SCRIPT'),
              ],
            }),
          ),
          { status: 200 },
        ),
      ),
    );

    await expect(proposeDashboardCharts(proposalInput)).rejects.toThrow(
      'DASHBOARD_AUTHORING_INVALID_RESPONSE',
    );
  });

  it('rejects non-integer layout cells before a command can reach the API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      applyDashboardAuthoringCommand({
        baseUrl: 'https://api.example.test',
        command: layoutCommand({
          cells: [{ widgetId: identifiers.widget, x: 0.5, y: 0, w: 6, h: 4 }],
        }),
      }),
    ).rejects.toThrow('DASHBOARD_AUTHORING_INVALID_COMMAND');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a confirmed authoring command with its idempotency key and rejects publication results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          commandId: identifiers.command,
          dashboardId: identifiers.dashboard,
          versionId: identifiers.nextVersion,
          revision: 8,
          savedAt: '2026-08-12T00:00:02.000Z',
          publishes: false,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      applyDashboardAuthoringCommand({
        baseUrl: 'https://api.example.test',
        command: layoutCommand(),
      }),
    ).resolves.toEqual({
      commandId: identifiers.command,
      dashboardId: identifiers.dashboard,
      versionId: identifiers.nextVersion,
      revision: 8,
      savedAt: '2026-08-12T00:00:02.000Z',
      publishes: false,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api.example.test/v3/dda/dashboards/${identifiers.dashboard}/authoring-commands`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const requestHeaders = new Headers(requestInit?.headers);
    expect(requestHeaders.get('Accept')).toBe('application/json');
    expect(requestHeaders.get('Idempotency-Key')).toBe(identifiers.command);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          commandId: identifiers.command,
          dashboardId: identifiers.dashboard,
          versionId: identifiers.nextVersion,
          revision: 8,
          savedAt: '2026-08-12T00:00:02.000Z',
          publishes: true,
        }),
        { status: 200 },
      ),
    );

    await expect(
      applyDashboardAuthoringCommand({
        baseUrl: 'https://api.example.test',
        command: layoutCommand(),
      }),
    ).rejects.toThrow('DASHBOARD_AUTHORING_INVALID_RESPONSE');
  });

  it('maps authoring HTTP failures to stable client error codes', async () => {
    const cases = [
      [401, 'UNAUTHORIZED'],
      [403, 'UNAUTHORIZED'],
      [404, 'NOT_FOUND'],
      [422, 'INVALID_PROPOSAL'],
      [429, 'BUDGET_DENIED'],
      [503, 'UNAVAILABLE'],
    ] as const;

    for (const [status, code] of cases) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status })));
      await expect(
        applyDashboardAuthoringCommand({
          baseUrl: 'https://api.example.test',
          command: layoutCommand(),
        }),
      ).rejects.toMatchObject({ code });
    }
  });

  it('preserves only a safe server version identifier on a revision conflict', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ currentVersionId: identifiers.nextVersion }), {
          status: 409,
        }),
      ),
    );

    await expect(
      applyDashboardAuthoringCommand({
        baseUrl: 'https://api.example.test',
        command: layoutCommand(),
      }),
    ).rejects.toMatchObject({
      code: 'REVISION_CONFLICT',
      serverVersionId: identifiers.nextVersion,
    });
  });
});
