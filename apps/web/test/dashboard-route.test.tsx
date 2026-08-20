import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

const DISCOVERED_DASHBOARD_ID = '00000000-0000-4000-8000-000000000300';
const dashboardCanvasCss = readFileSync(
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/styles/dashboard-canvas.css'),
  'utf8',
);

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function verifiedWidgetResponse(input: {
  readonly dashboardId: string;
  readonly snapshotId: string;
  readonly widgetId: string;
  readonly rows: readonly {
    readonly label: string;
    readonly displayValue: string;
    readonly numericValue: number;
  }[];
}): Response {
  return jsonResponse({
    schemaVersion: 4,
    accepted: true,
    dashboardId: input.dashboardId,
    snapshotId: input.snapshotId,
    freshness: {
      state: 'CURRENT',
      lastSuccessfulRefreshAt: '2026-08-18T00:00:00.000Z',
      inputSelectorHash: 'a'.repeat(64),
      dashboardVersionId: '00000000-0000-4000-8000-000000000439',
      inputVersionIds: ['00000000-0000-4000-8000-000000000440'],
    },
    widgets: [
      {
        widgetId: input.widgetId,
        resultState: 'READY',
        rows: input.rows.map((row, index) => {
          const resultCellId = `00000000-0000-4000-8000-${String(500 + index).padStart(12, '0')}`;
          return {
            ...row,
            unit: 'VND',
            provenance: {
              resultCellId,
              planVersionId: '00000000-0000-4000-8000-000000000441',
              metricVersionId: '00000000-0000-4000-8000-000000000442',
              datasetVersionId: '00000000-0000-4000-8000-000000000443',
              evidenceRefs: [resultCellId],
            },
          };
        }),
      },
    ],
  });
}

describe('dashboard route composition [DDA-020]', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('keeps the dashboard shell available when the legacy demo flag is set', async () => {
    vi.stubEnv('VITE_DATABREEZE_DEMO_MODE', 'true');
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'Bảng điều khiển', hidden: true }),
    ).toBeTruthy();
    expect(screen.getByText('Bản demo cục bộ')).toBeTruthy();
  });

  it('renders only the truthful upload empty state when no dashboard exists', async () => {
    const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Dashboards' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dashboards' })).toBeTruthy();
    expect(screen.queryByText('Dashboard data is not available. No changes were sent.')).toBeNull();
    const emptyState = await screen.findByTestId('dashboard-empty-state');
    expect(emptyState).toBeTruthy();
    expect(
      emptyState.closest('.dda-dashboard-page')?.classList.contains('dda-dashboard-page--empty'),
    ).toBe(true);
    expect(screen.getByRole('link', { name: 'Upload data' })).toBeTruthy();
    expect(document.querySelector('.dda-dashboard-canvas')).toBeNull();
    expect(screen.queryByText('1,250,000 VND')).toBeNull();
    expect(screen.getByTestId('dashboard-freshness')).toBeTruthy();
    expect(screen.getByTestId('dashboard-evidence-warning')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Template' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ask governed data' })).toBeNull();
    expect(screen.queryByRole('search', { name: 'Search this workspace' })).toBeNull();
    expect(screen.getByText('Want a new chart or a change to this one? Talk to me.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open chart assistant' })).toBeTruthy();
  });

  it('keeps the Vietnamese empty dashboard free of the unavailable-data notice', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByTestId('dashboard-empty-state')).toBeTruthy();
    expect(
      screen.queryByText('Dữ liệu bảng điều khiển chưa khả dụng. Không có thay đổi nào được gửi.'),
    ).toBeNull();
    expect(screen.getByText('Tải dữ liệu lên để bắt đầu xây dựng bảng điều khiển của bạn.'));
  });

  it('places the English discovery-unavailable notice after the retained empty-state action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v3/dda/dashboards/workspace-history')) {
          return new Response('', { status: 503 });
        }
        if (url.includes('/v1/dda/data-imports?limit=50')) {
          return jsonResponse({ accepted: true, value: { imports: [] } });
        }
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    const emptyState = await screen.findByTestId('dashboard-empty-state');
    const logo = within(emptyState).getByRole('img', { name: 'DataBreeze' });
    const sentence = within(emptyState).getByText(
      'Upload your data to start building your dashboard.',
    );
    const action = within(emptyState).getByRole('link', { name: 'Upload data' });
    const notice = within(emptyState).getByRole('alert', {
      name: 'The workspace dashboard could not be found right now.',
    });

    expect(logo).toBeTruthy();
    expect(sentence).toBeTruthy();
    expect(action).toBeTruthy();
    expect(notice.classList.contains('dda-dashboard-page__empty-notice')).toBe(true);
    expect(notice.parentElement).toBe(emptyState);
    expect(action.compareDocumentPosition(notice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(
      screen.queryByText('The workspace dashboard could not be found right now.')?.parentElement,
    ).toBe(emptyState);
  });

  it('keeps the Vietnamese discovery-unavailable notice localized below the upload action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v3/dda/dashboards/workspace-history')) {
          return new Response('', { status: 503 });
        }
        if (url.includes('/v1/dda/data-imports?limit=50')) {
          return jsonResponse({ accepted: true, value: { imports: [] } });
        }
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    const emptyState = await screen.findByTestId('dashboard-empty-state');
    const notice = within(emptyState).getByRole('alert', {
      name: 'Không thể tìm bảng điều khiển trong không gian làm việc lúc này.',
    });

    expect(within(emptyState).getByRole('img', { name: 'DataBreeze' })).toBeTruthy();
    expect(
      within(emptyState).getByText('Tải dữ liệu lên để bắt đầu xây dựng bảng điều khiển của bạn.'),
    ).toBeTruthy();
    expect(within(emptyState).getByRole('link', { name: 'Tải dữ liệu lên' })).toBeTruthy();
    expect(notice.classList.contains('dda-dashboard-page__empty-notice')).toBe(true);
    expect(notice.parentElement).toBe(emptyState);
  });

  it('contains a bounded empty-dashboard layout without a scrollable page column', () => {
    expect(dashboardCanvasCss).toMatch(
      /\.app-shell--dashboard \.main-workspace--dashboard:has\(\.dda-dashboard-page--empty\)\s*\{[^}]*overflow:\s*hidden/su,
    );
    expect(dashboardCanvasCss).toMatch(
      /\.app-shell--dashboard \.dda-dashboard-page--empty\s*\{[^}]*height:\s*100%[^}]*min-height:\s*0[^}]*overflow:\s*hidden/su,
    );
    expect(dashboardCanvasCss).toMatch(
      /\.app-shell--dashboard \.dda-dashboard-page__empty-notice\s*\{[^}]*color:\s*#b42318/su,
    );
  });

  it('offers an approved-data preview from the empty live dashboard state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v1/dda/data-imports?limit=50')) {
          return jsonResponse({
            accepted: true,
            value: {
              imports: [
                {
                  importId: '00000000-0000-4000-8000-000000000410',
                  revision: 2,
                  state: 'READY',
                  destination: 'NEW_DATASET',
                  datasetId: '00000000-0000-4000-8000-000000000411',
                  datasetName: 'Bán hàng đã duyệt',
                  idempotencyKey: 'local-import-410',
                  sources: [
                    {
                      sessionId: '00000000-0000-4000-8000-000000000412',
                      artifactVersionId: '00000000-0000-4000-8000-000000000413',
                      fileName: 'sales.csv',
                      mediaType: 'text/csv',
                      contentSha256: 'a'.repeat(64),
                      byteSize: 128,
                      rowCount: 2,
                      fields: [
                        {
                          fieldId: '00000000-0000-4000-8000-000000000414',
                          name: 'revenue',
                          type: 'DECIMAL',
                          nullable: false,
                        },
                      ],
                      sampleRows: [{ revenue: '100' }],
                    },
                  ],
                  review: {
                    beforeSample: [],
                    afterSample: [],
                    counts: { input: 2, output: 2, changed: 0, rejected: 0 },
                    quality: { completeness: 1, validity: 1, uniqueness: 1, consistency: 1 },
                    warnings: [],
                    corrections: [],
                    reviewRequired: true,
                  },
                  accepted: {
                    datasetId: '00000000-0000-4000-8000-000000000411',
                    datasetVersionId: '00000000-0000-4000-8000-000000000415',
                    definitionVersionId: '00000000-0000-4000-8000-000000000416',
                    dashboardStatus: 'UNAVAILABLE',
                    approvedAt: '2026-08-18T00:00:00.000Z',
                  },
                  createdAt: '2026-08-18T00:00:00.000Z',
                  updatedAt: '2026-08-18T00:01:00.000Z',
                },
              ],
            },
          });
        }
        if (
          url.includes(
            '/v1/dda/data-imports/00000000-0000-4000-8000-000000000410/dashboard-preview',
          )
        ) {
          return jsonResponse({
            schemaVersion: 4,
            accepted: true,
            value: {
              importId: '00000000-0000-4000-8000-000000000410',
              datasetId: '00000000-0000-4000-8000-000000000411',
              datasetVersionId: '00000000-0000-4000-8000-000000000415',
              datasetName: 'Bán hàng đã duyệt',
              sourceCount: 1,
              rowCount: 2,
              truncated: false,
              sourceHashes: ['a'.repeat(64)],
              columns: [{ name: 'revenue', type: 'DECIMAL', nullable: false }],
              measure: { field: 'revenue', sum: 300, average: 150, minimum: 100, maximum: 200 },
              dimension: {
                field: 'revenue',
                groups: [{ label: 'Tổng', count: 2, total: 300 }],
              },
              sampleRows: [
                {
                  cells: [{ field: 'revenue', value: '100', kind: 'NUMBER' }],
                },
              ],
              generatedAt: '2026-08-18T00:02:00.000Z',
            },
          });
        }
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByTestId('dashboard-approved-preview')).toBeTruthy();
    expect(await screen.findByText('Bán hàng đã duyệt')).toBeTruthy();
    expect(await screen.findByText('Bản xem nhanh · không phải snapshot chứng nhận')).toBeTruthy();
    expect((await screen.findAllByText('300')).length).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý biểu đồ' }));
    const composer = screen.getByRole('textbox', { name: 'Câu hỏi cho trợ lý biểu đồ' });
    fireEvent.change(composer, { target: { value: 'Tóm tắt tổng doanh thu' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });
    expect(await screen.findByText(/Nhận định cục bộ từ bản xem nhanh/u)).toBeTruthy();
  });

  it('falls back to the approved-data preview when the live dashboard agent is unavailable', async () => {
    const dashboardId = '00000000-0000-4000-8000-000000000430';
    const importId = '00000000-0000-4000-8000-000000000431';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v1/dda/data-imports?limit=50')) {
          return jsonResponse({
            accepted: true,
            value: {
              imports: [
                {
                  importId,
                  revision: 1,
                  state: 'READY',
                  destination: 'NEW_DATASET',
                  datasetId: '00000000-0000-4000-8000-000000000432',
                  datasetName: 'Bán hàng đã duyệt',
                  idempotencyKey: 'dashboard-agent-preview-430',
                  sources: [],
                  review: {
                    beforeSample: [],
                    afterSample: [],
                    counts: { input: 2, output: 2, changed: 0, rejected: 0 },
                    quality: { completeness: 1, validity: 1, uniqueness: 1, consistency: 1 },
                    warnings: [],
                    corrections: [],
                    reviewRequired: true,
                  },
                  accepted: {
                    datasetId: '00000000-0000-4000-8000-000000000432',
                    datasetVersionId: '00000000-0000-4000-8000-000000000433',
                    definitionVersionId: '00000000-0000-4000-8000-000000000434',
                    dashboardStatus: 'READY',
                    approvedAt: '2026-08-18T00:00:00.000Z',
                  },
                  createdAt: '2026-08-18T00:00:00.000Z',
                  updatedAt: '2026-08-18T00:01:00.000Z',
                },
              ],
            },
          });
        }
        if (url.includes(`/v1/dda/dashboards/${dashboardId}/draft`)) {
          return jsonResponse({
            dashboardId,
            versionId: '00000000-0000-4000-8000-000000000435',
            pages: [
              {
                pageId: '00000000-0000-4000-8000-000000000436',
                title: { vi: 'Tổng quan', en: 'Overview' },
              },
            ],
            widgets: [
              {
                widgetId: '00000000-0000-4000-8000-000000000437',
                type: 'KPI',
                pageId: '00000000-0000-4000-8000-000000000436',
                title: { vi: 'Tổng doanh thu', en: 'Total revenue' },
                values: [],
              },
            ],
            filters: [],
            freshness: 'Freshness: loading',
            warning: 'Evidence remains visible.',
          });
        }
        if (url.includes(`/v1/dda/dashboards/${dashboardId}/freshness`)) {
          return jsonResponse({
            accepted: true,
            value: {
              dashboardId,
              freshnessPolicy: 'ON_DEMAND',
              freshnessState: 'CURRENT',
              lastSuccessfulRefreshAt: '2026-08-18T00:00:00.000Z',
              lastGoodSnapshotId: '00000000-0000-4000-8000-000000000438',
              resultCompleteness: 'COMPLETE',
            },
          });
        }
        if (
          url.includes(
            `/v1/dda/dashboards/${dashboardId}/snapshots/00000000-0000-4000-8000-000000000438/widget-results`,
          )
        ) {
          return verifiedWidgetResponse({
            dashboardId,
            snapshotId: '00000000-0000-4000-8000-000000000438',
            widgetId: '00000000-0000-4000-8000-000000000437',
            rows: [{ label: 'Tổng', displayValue: '300', numericValue: 300 }],
          });
        }
        if (url.includes('/v1/dda/dashboards/query/view')) {
          return jsonResponse({
            accepted: true,
            value: {
              rows: [{ revenue: '100' }, { revenue: '200' }],
              permissionExpansion: {},
              deniedFieldsExposed: false,
            },
          });
        }
        if (url.includes(`/v1/dda/data-imports/${importId}/dashboard-preview`)) {
          return jsonResponse({
            schemaVersion: 4,
            accepted: true,
            value: {
              importId,
              datasetId: '00000000-0000-4000-8000-000000000432',
              datasetVersionId: '00000000-0000-4000-8000-000000000433',
              datasetName: 'Bán hàng đã duyệt',
              sourceCount: 1,
              rowCount: 2,
              truncated: false,
              sourceHashes: ['a'.repeat(64)],
              columns: [{ name: 'revenue', type: 'DECIMAL', nullable: false }],
              measure: { field: 'revenue', sum: 300, average: 150, minimum: 100, maximum: 200 },
              dimension: {
                field: 'revenue',
                groups: [{ label: 'Tổng', count: 2, total: 300 }],
              },
              sampleRows: [],
              generatedAt: '2026-08-18T00:02:00.000Z',
            },
          });
        }
        if (url.includes('/v1/dda/analysis/propose')) return jsonResponse({}, 503);
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({
      initialEntries: [`/vi-VN/dashboards?dashboard=${dashboardId}`],
    });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByText('Tổng doanh thu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Mở trợ lý biểu đồ' }));
    const composer = screen.getByRole('textbox', { name: 'Câu hỏi cho trợ lý biểu đồ' });
    fireEvent.change(composer, { target: { value: 'Tóm tắt tổng doanh thu' } });
    fireEvent.keyDown(composer, { key: 'Enter', code: 'Enter' });

    expect(await screen.findByText(/Nhận định cục bộ từ bản xem nhanh/u)).toBeTruthy();
    expect(screen.getByText(/Tổng cột revenue là 300/u)).toBeTruthy();
  });

  it('shows the server-authoritative AI credit balance beside the dashboard upgrade action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v1/entitlements/summary')) {
          return jsonResponse({
            schemaVersion: 4,
            snapshot: {
              schemaVersion: 1,
              snapshotId: '00000000-0000-4000-8000-000000000701',
              organizationId: '00000000-0000-4000-8000-000000000702',
              workspaceId: '00000000-0000-4000-8000-000000000703',
              planCode: 'professional-monthly',
              status: 'ACTIVE',
              revision: 3,
              securityEpoch: 2,
              effectiveAt: '2026-08-18T00:00:00.000Z',
              features: ['agent', 'dashboards'],
              quotas: [{ metric: 'job_count', limit: 100 }],
            },
            aiCredits: { metric: 'job_count', limit: 100, used: 12, reserved: 3, remaining: 85 },
          });
        }
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect((await screen.findByTestId('dashboard-ai-credits')).textContent).toContain('85');
    expect(screen.getByTestId('dashboard-plan').textContent).toContain('Gói Professional');
    expect(screen.getByTestId('dashboard-plan').textContent).toContain('Đang hoạt động');
    expect(screen.getByRole('link', { name: 'Nâng cấp gói' }).getAttribute('href')).toBe(
      '/vi-VN/billing',
    );
  });

  it('discovers the authorized workspace dashboard through history when none is pinned', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v3/dda/dashboards/workspace-history')) {
          return jsonResponse({
            schemaVersion: 3,
            items: [
              {
                kind: 'ANALYSIS',
                subjectId: '00000000-0000-4000-8000-000000000310',
                title: { vi: 'Phân tích chi phí', en: 'Expense analysis' },
                updatedAt: '2026-08-14T00:00:00.000Z',
              },
              {
                kind: 'DASHBOARD',
                subjectId: DISCOVERED_DASHBOARD_ID,
                title: { vi: 'Tổng quan chi phí', en: 'Expense overview' },
                updatedAt: '2026-08-14T00:00:00.000Z',
              },
            ],
          });
        }
        if (url.includes(`/v1/dda/dashboards/${DISCOVERED_DASHBOARD_ID}/draft`)) {
          return jsonResponse({
            dashboardId: DISCOVERED_DASHBOARD_ID,
            versionId: '00000000-0000-4000-8000-000000000301',
            pages: [
              {
                pageId: '00000000-0000-4000-8000-000000000302',
                title: { vi: 'Tổng quan', en: 'Overview' },
              },
            ],
            widgets: [
              {
                widgetId: '00000000-0000-4000-8000-000000000303',
                type: 'KPI',
                pageId: '00000000-0000-4000-8000-000000000302',
                title: { vi: 'Doanh thu đã khám phá', en: 'Discovered revenue' },
                values: [{ label: 'Doanh thu', value: '₫120 triệu' }],
              },
            ],
            filters: [],
            freshness: 'Freshness: discovered',
            warning: 'Evidence remains visible.',
          });
        }
        if (url.includes(`/v1/dda/dashboards/${DISCOVERED_DASHBOARD_ID}/freshness`)) {
          return jsonResponse({
            accepted: true,
            value: {
              dashboardId: DISCOVERED_DASHBOARD_ID,
              freshnessPolicy: 'ON_DEMAND',
              freshnessState: 'CURRENT',
              lastSuccessfulRefreshAt: '2026-08-14T00:00:00.000Z',
              lastGoodSnapshotId: '00000000-0000-4000-8000-000000000325',
              resultCompleteness: 'COMPLETE',
            },
          });
        }
        if (
          url.includes(
            `/v1/dda/dashboards/${DISCOVERED_DASHBOARD_ID}/snapshots/00000000-0000-4000-8000-000000000325/widget-results`,
          )
        ) {
          return verifiedWidgetResponse({
            dashboardId: DISCOVERED_DASHBOARD_ID,
            snapshotId: '00000000-0000-4000-8000-000000000325',
            widgetId: '00000000-0000-4000-8000-000000000303',
            rows: [{ label: 'Tổng', displayValue: '120000000', numericValue: 120000000 }],
          });
        }
        if (url.includes('/v1/dda/dashboards/query/view')) {
          return jsonResponse({
            accepted: true,
            value: {
              rows: [{ revenue: '120000000' }],
              permissionExpansion: {},
              deniedFieldsExposed: false,
            },
          });
        }
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByText('Doanh thu đã khám phá')).toBeTruthy();
    expect(screen.queryByText('Dashboard data is not available. No changes were sent.')).toBeNull();
  });

  it('maps authorized rows using uploaded column names instead of demo-specific headers', async () => {
    const dashboardId = '00000000-0000-4000-8000-000000000320';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes(`/v1/dda/dashboards/${dashboardId}/draft`)) {
          return jsonResponse({
            dashboardId,
            versionId: '00000000-0000-4000-8000-000000000321',
            pages: [
              {
                pageId: '00000000-0000-4000-8000-000000000322',
                title: { vi: 'Tổng quan tải lên', en: 'Uploaded overview' },
              },
            ],
            widgets: [
              {
                widgetId: '00000000-0000-4000-8000-000000000323',
                type: 'KPI',
                pageId: '00000000-0000-4000-8000-000000000322',
                title: { vi: 'Tổng giá trị', en: 'Total value' },
                values: [],
              },
            ],
            filters: [],
            freshness: 'Freshness: uploaded',
            warning: 'Evidence remains visible.',
          });
        }
        if (url.includes(`/v1/dda/dashboards/${dashboardId}/freshness`)) {
          return jsonResponse({
            accepted: true,
            value: {
              dashboardId,
              freshnessPolicy: 'ON_DEMAND',
              freshnessState: 'CURRENT',
              lastSuccessfulRefreshAt: '2026-08-14T00:00:00.000Z',
              lastGoodSnapshotId: '00000000-0000-4000-8000-000000000324',
              resultCompleteness: 'COMPLETE',
            },
          });
        }
        if (
          url.includes(
            `/v1/dda/dashboards/${dashboardId}/snapshots/00000000-0000-4000-8000-000000000324/widget-results`,
          )
        ) {
          return verifiedWidgetResponse({
            dashboardId,
            snapshotId: '00000000-0000-4000-8000-000000000324',
            widgetId: '00000000-0000-4000-8000-000000000323',
            rows: [{ label: 'Tổng', displayValue: '30', numericValue: 30 }],
          });
        }
        if (url.includes('/v1/dda/dashboards/query/view')) {
          return jsonResponse({
            accepted: true,
            value: {
              rows: [
                { amount: '12.5', category: 'A' },
                { amount: '17.5', category: 'B' },
              ],
              permissionExpansion: {},
              deniedFieldsExposed: false,
            },
          });
        }
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({ initialEntries: [`/en/dashboards?dashboard=${dashboardId}`] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByText('Total value')).toBeTruthy();
    expect(screen.getByRole('article', { name: /Total value.*KPI/u }).textContent).toContain('30');
    expect(
      screen.queryByText('Structured numeric data is required before this chart can be shown.'),
    ).toBeNull();
  });

  it('keeps an explicit safe state when the verified widget result is unavailable', async () => {
    const dashboardId = '00000000-0000-4000-8000-000000000350';
    const snapshotId = '00000000-0000-4000-8000-000000000351';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes(`/v1/dda/dashboards/${dashboardId}/draft`)) {
          return jsonResponse({
            dashboardId,
            versionId: '00000000-0000-4000-8000-000000000352',
            pages: [
              {
                pageId: '00000000-0000-4000-8000-000000000353',
                title: { vi: 'Tổng quan', en: 'Overview' },
              },
            ],
            widgets: [
              {
                widgetId: '00000000-0000-4000-8000-000000000354',
                type: 'KPI',
                pageId: '00000000-0000-4000-8000-000000000353',
                title: { vi: 'Tổng giá trị', en: 'Total value' },
                values: [],
              },
            ],
            filters: [],
            freshness: 'Freshness: waiting',
            warning: 'Evidence remains visible.',
          });
        }
        if (url.includes(`/v1/dda/dashboards/${dashboardId}/freshness`)) {
          return jsonResponse({
            accepted: true,
            value: {
              dashboardId,
              freshnessPolicy: 'ON_DEMAND',
              freshnessState: 'CURRENT',
              lastSuccessfulRefreshAt: '2026-08-19T00:00:00.000Z',
              lastGoodSnapshotId: snapshotId,
              resultCompleteness: 'COMPLETE',
            },
          });
        }
        if (
          url.includes(`/v1/dda/dashboards/${dashboardId}/snapshots/${snapshotId}/widget-results`)
        ) {
          return new Response('', { status: 503 });
        }
        return new Response('', { status: 404 });
      }),
    );

    const router = createAppRouter({ initialEntries: [`/en/dashboards?dashboard=${dashboardId}`] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByTestId('dashboard-snapshot-empty')).toBeTruthy();
    expect(screen.getByText('Your dashboard is waiting for verified metrics.')).toBeTruthy();
    expect(screen.queryByRole('article', { name: /Total value.*KPI/u })).toBeNull();
  });

  it('renders the reload-safe approved-data dashboard preview', async () => {
    const importId = '00000000-0000-4000-8000-000000000401';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes(`/v1/dda/data-imports/${importId}/dashboard-preview`)) {
          return jsonResponse({
            schemaVersion: 4,
            accepted: true,
            value: {
              importId,
              datasetId: '00000000-0000-4000-8000-000000000402',
              datasetVersionId: '00000000-0000-4000-8000-000000000403',
              datasetName: 'Bán hàng tháng',
              sourceCount: 1,
              rowCount: 3,
              truncated: false,
              sourceHashes: ['aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
              columns: [
                { name: 'region', type: 'TEXT', nullable: false },
                { name: 'revenue', type: 'DECIMAL', nullable: false },
              ],
              measure: { field: 'revenue', sum: 450, average: 150, minimum: 100, maximum: 200 },
              dimension: {
                field: 'region',
                groups: [
                  { label: 'Bắc', count: 2, total: 300 },
                  { label: 'Nam', count: 1, total: 150 },
                ],
              },
              sampleRows: [
                {
                  cells: [
                    { field: 'region', value: 'Bắc', kind: 'TEXT' },
                    { field: 'revenue', value: '100', kind: 'NUMBER' },
                  ],
                },
              ],
              generatedAt: '2026-08-18T00:00:00.000Z',
            },
          });
        }
        return new Response('', { status: 404 });
      }),
    );
    const router = createAppRouter({ initialEntries: [`/vi-VN/dashboards?importId=${importId}`] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Bán hàng tháng' })).toBeTruthy();
    expect(screen.getByText('Tổng')).toBeTruthy();
    expect(screen.getByText('450')).toBeTruthy();
    expect(screen.getByText('Phân bổ theo')).toBeTruthy();
    expect(screen.getAllByText('Bắc').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Bản xem nhanh · không phải snapshot chứng nhận')).toBeTruthy();
  });
});
