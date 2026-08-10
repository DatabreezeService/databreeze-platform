import { describe, expect, it, vi } from 'vitest';

import {
  dashboardLiveConfiguration,
  fetchDashboardDraft,
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
    ).rejects.toThrow('DASHBOARD_DRAFT_UNAVAILABLE');
  });
});
