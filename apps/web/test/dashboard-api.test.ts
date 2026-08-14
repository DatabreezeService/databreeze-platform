import { describe, expect, it, vi } from 'vitest';

import {
  dashboardApiBaseConfiguration,
  dashboardLiveConfiguration,
  fetchDashboardDraft,
  publishDashboardSnapshot,
} from '../src/features/dashboards/dashboard-api.ts';

describe('dashboard live API configuration [DDA-020]', () => {
  it('requires both an API base URL and dashboard identity before requesting live data', () => {
    expect(dashboardLiveConfiguration({})).toBeUndefined();
    expect(
      dashboardLiveConfiguration({
        VITE_DATABREEZE_API_BASE_URL: 'https://api.example.test/',
      }),
    ).toBeUndefined();
    expect(
      dashboardLiveConfiguration({
        VITE_DATABREEZE_API_BASE_URL: 'https://api.example.test/',
        VITE_DATABREEZE_DASHBOARD_ID: 'dashboard-123',
      }),
    ).toEqual({
      baseUrl: 'https://api.example.test',
      dashboardId: 'dashboard-123',
    });
    expect(
      dashboardApiBaseConfiguration({ VITE_DATABREEZE_API_BASE_URL: 'https://api.example.test/' }),
    ).toEqual({ baseUrl: 'https://api.example.test' });
    expect(
      dashboardLiveConfiguration(
        { VITE_DATABREEZE_API_BASE_URL: 'https://api.example.test/' },
        'dashboard-from-history',
      ),
    ).toEqual({ baseUrl: 'https://api.example.test', dashboardId: 'dashboard-from-history' });
  });

  it('rejects a malformed draft response instead of rendering invented data', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify('not-a-dashboard'), { status: 200 })),
    );

    await expect(
      fetchDashboardDraft({
        baseUrl: 'https://api.example.test',
        dashboardId: 'dashboard-123',
      }),
    ).rejects.toThrow('DASHBOARD_DRAFT_INVALID');
  });

  it('fails closed on unauthorized or missing live drafts without inventing fixture numbers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'denied' }), { status: 403 })),
    );

    await expect(
      fetchDashboardDraft({
        baseUrl: 'https://api.example.test',
        dashboardId: 'dashboard-123',
      }),
    ).rejects.toThrow('DASHBOARD_DRAFT_UNAUTHORIZED');
  });

  it('maps missing drafts to a distinct fail-closed code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    await expect(
      fetchDashboardDraft({
        baseUrl: 'https://api.example.test',
        dashboardId: 'dashboard-123',
      }),
    ).rejects.toThrow('DASHBOARD_DRAFT_NOT_FOUND');
  });

  it('publishes only through the governed publication endpoint with credentials', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ accepted: true, revision: 2 }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await publishDashboardSnapshot({
      baseUrl: 'https://api.example.test',
      dashboardId: 'dashboard-123',
      versionId: '00000000-0000-4000-8000-000000000011',
      audience: 'WORKSPACE_VIEWERS',
      materializationIds: [],
      permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
      expectedRevision: 1,
      idempotencyKey: '00000000-0000-4000-8000-000000000031',
    });

    expect(result).toEqual({ accepted: true, revision: 2 });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.test/v1/dda/dashboards/publication/publish',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    );
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).not.toHaveProperty('context');
  });

  it('fails closed when publish is unauthorized', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    await expect(
      publishDashboardSnapshot({
        baseUrl: 'https://api.example.test',
        dashboardId: 'dashboard-123',
        versionId: '00000000-0000-4000-8000-000000000011',
        audience: 'WORKSPACE_VIEWERS',
        materializationIds: [],
        permissionProjectionVersionId: '00000000-0000-4000-8000-000000000021',
        expectedRevision: 1,
        idempotencyKey: '00000000-0000-4000-8000-000000000031',
      }),
    ).rejects.toThrow('DASHBOARD_PUBLISH_UNAUTHORIZED');
  });
});
