import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApplicationBoundary } from '../src/app/app.tsx';
import { workspaceAgentStore } from '../src/features/agent/workspace-agent-store.ts';
import { AnalysisRoutePage } from '../src/features/analysis/analysis-route-page.tsx';

const CONVERSATION_ID = '00000000-0000-4000-8000-000000000201';
const DATASET_ID = '00000000-0000-4000-8000-000000000202';
const BEFORE_VERSION_ID = '00000000-0000-4000-8000-000000000203';
const DATASET_VERSION_ID = '00000000-0000-4000-8000-000000000204';

const summary = Object.freeze({
  schemaVersion: 4 as const,
  conversationId: CONVERSATION_ID,
  title: 'Vì sao doanh thu tháng 7 giảm?',
  datasets: Object.freeze([
    Object.freeze({ datasetId: DATASET_ID, datasetVersionId: DATASET_VERSION_ID }),
  ]),
  createdAt: '2026-08-13T01:00:00.000Z',
  updatedAt: '2026-08-13T02:00:00.000Z',
});

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function renderRoute(path = `/vi-VN/analysis?conversation=${CONVERSATION_ID}`) {
  render(
    <ApplicationBoundary>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/:locale/analysis" element={<AnalysisRoutePage />} />
        </Routes>
      </MemoryRouter>
    </ApplicationBoundary>,
  );
}

function liveFetchMock(options: { readonly turnStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/v1/dda/conversations?limit=20')) {
      return jsonResponse({ schemaVersion: 4, accepted: true, items: [summary] });
    }
    if (url.includes(`/v1/dda/conversations/${CONVERSATION_ID}?limit=50`)) {
      return jsonResponse({
        schemaVersion: 4,
        accepted: true,
        conversation: summary,
        messages: [
          {
            messageId: '00000000-0000-4000-8000-000000000205',
            conversationId: CONVERSATION_ID,
            role: 'AGENT',
            text: 'Miền Nam đang dẫn đầu.',
            sequence: 1,
            datasetVersionId: DATASET_VERSION_ID,
            createdAt: '2026-08-13T02:00:00.000Z',
          },
        ],
        contextEvents: [
          {
            eventId: '00000000-0000-4000-8000-000000000206',
            conversationId: CONVERSATION_ID,
            kind: 'DATASET_VERSION_ADVANCED',
            datasetId: DATASET_ID,
            beforeVersionId: BEFORE_VERSION_ID,
            afterVersionId: DATASET_VERSION_ID,
            sequence: 2,
            occurredAt: '2026-08-13T02:01:00.000Z',
          },
        ],
      });
    }
    if (url.endsWith('/v1/dda/agent/turns') && init?.method === 'POST') {
      return options.turnStatus === undefined
        ? jsonResponse({
            schemaVersion: 4,
            accepted: true,
            narrative: 'Đã trả lời.',
            toolResults: [],
          })
        : new Response('', { status: options.turnStatus });
    }
    return new Response('', { status: 404 });
  });
}

describe('[WEB-024][DDA-055][DDA-056] live Analysis route', () => {
  afterEach(() => {
    workspaceAgentStore.setActiveConversation(undefined);
    vi.unstubAllGlobals();
  });

  it('restores an authorized query-selected conversation and shows the recorded version event', async () => {
    vi.stubGlobal('fetch', liveFetchMock());

    renderRoute();

    expect(screen.getByRole('status').textContent).toContain('Đang tải');
    expect(await screen.findByText('Miền Nam đang dẫn đầu.')).toBeTruthy();
    expect(screen.getAllByText(/Bộ dữ liệu …00000202/u).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Phiên bản …00000204/u).length).toBeGreaterThan(0);
    expect(screen.getByRole('status').textContent).toContain(
      'Phiên bản …00000203 → Phiên bản …00000204',
    );
    expect(workspaceAgentStore.getActiveConversation()?.conversationId).toBe(CONVERSATION_ID);
  });

  it('distinguishes an authorized empty history from a failed history request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(jsonResponse({ schemaVersion: 4, accepted: true, items: [] })),
    );
    renderRoute('/vi-VN/analysis');
    expect(
      await screen.findByText('Chưa có hội thoại được cấp quyền trong không gian làm việc này.'),
    ).toBeTruthy();

    workspaceAgentStore.setActiveConversation({
      conversationId: '00000000-0000-4000-8000-000000000299',
      title: 'Stale context',
      datasetLabel: 'Stale dataset',
      datasetVersionLabel: 'Stale version',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    renderRoute('/vi-VN/analysis');
    expect(
      await screen.findByText('Không thể tải hội thoại. Dữ liệu cũ không được hiển thị.'),
    ).toBeTruthy();
    await waitFor(() => expect(workspaceAgentStore.getActiveConversation()).toBeUndefined());
  });

  it('shows Viewer agent denial and keeps the unsent question available for correction', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', liveFetchMock({ turnStatus: 403 }));
    renderRoute();
    const composer = await screen.findByRole('textbox', { name: 'Nhập câu hỏi phân tích' });

    await user.type(composer, 'So sánh với tháng trước');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(
      await screen.findByRole('alert', {
        name: 'Bạn không có quyền trò chuyện với trợ lý trong không gian làm việc này.',
      }),
    ).toBeTruthy();
    await waitFor(() => expect(composer).toHaveProperty('value', 'So sánh với tháng trước'));
  });

  it('uses the approved-data preview when the external agent provider is unavailable', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/datasets')) {
        return jsonResponse({
          accepted: true,
          value: {
            datasets: [
              {
                datasetId: DATASET_ID,
                versionId: DATASET_VERSION_ID,
                label: 'Bán hàng đã duyệt',
                status: 'PUBLISHED',
                versionLabel: 'Phiên bản hiện tại',
                publishedAt: '2026-08-13T00:00:00.000Z',
                fieldCount: 2,
                fieldTypes: ['DECIMAL', 'TEXT'],
                health: 'HEALTHY',
                readiness: 'READY',
              },
            ],
            page: { limit: 25 },
          },
        });
      }
      if (url.endsWith('/v1/dda/data-imports?limit=50')) {
        return jsonResponse({
          accepted: true,
          value: {
            imports: [
              {
                importId: '00000000-0000-4000-8000-000000000220',
                revision: 1,
                state: 'READY',
                destination: 'NEW_DATASET',
                datasetId: DATASET_ID,
                datasetName: 'Bán hàng đã duyệt',
                idempotencyKey: 'analysis-preview-import',
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
                  datasetId: DATASET_ID,
                  datasetVersionId: DATASET_VERSION_ID,
                  definitionVersionId: '00000000-0000-4000-8000-000000000221',
                  dashboardStatus: 'UNAVAILABLE',
                  approvedAt: '2026-08-13T00:00:00.000Z',
                },
                createdAt: '2026-08-13T00:00:00.000Z',
                updatedAt: '2026-08-13T00:00:00.000Z',
              },
            ],
          },
        });
      }
      if (url.includes('/dashboard-preview')) {
        return jsonResponse({
          schemaVersion: 4,
          accepted: true,
          value: {
            importId: '00000000-0000-4000-8000-000000000220',
            datasetId: DATASET_ID,
            datasetVersionId: DATASET_VERSION_ID,
            datasetName: 'Bán hàng đã duyệt',
            sourceCount: 1,
            rowCount: 2,
            truncated: false,
            sourceHashes: ['a'.repeat(64)],
            columns: [
              { name: 'revenue', type: 'DECIMAL', nullable: false },
              { name: 'region', type: 'TEXT', nullable: false },
            ],
            measure: { field: 'revenue', sum: 300, average: 150, minimum: 100, maximum: 200 },
            dimension: { field: 'region', groups: [{ label: 'Miền Nam', count: 2, total: 300 }] },
            sampleRows: [
              {
                cells: [
                  { field: 'revenue', value: '100', kind: 'NUMBER' },
                  { field: 'region', value: 'Miền Nam', kind: 'TEXT' },
                ],
              },
            ],
            generatedAt: '2026-08-13T00:00:00.000Z',
          },
        });
      }
      if (url.endsWith('/v1/dda/agent/turns') && init?.method === 'POST') {
        return new Response('', { status: 503 });
      }
      if (url.endsWith('/v1/dda/conversations?limit=20')) {
        return jsonResponse({ schemaVersion: 4, accepted: true, items: [summary] });
      }
      if (url.includes(`/v1/dda/conversations/${CONVERSATION_ID}?limit=50`)) {
        return jsonResponse({
          schemaVersion: 4,
          accepted: true,
          conversation: summary,
          messages: [],
          contextEvents: [],
        });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute();
    const composer = await screen.findByRole('textbox', { name: 'Nhập câu hỏi phân tích' });
    await user.type(composer, 'Tóm tắt doanh thu');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText(/Nhận định cục bộ từ bản xem nhanh/u)).toBeTruthy();
    expect(
      await screen.findByText((content) => content.includes('Tổng **revenue** là')),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('creates the first conversation from authorized datasets when none exists yet', async () => {
    const user = userEvent.setup();
    const CREATED_CONVERSATION_ID = '00000000-0000-4000-8000-000000000210';
    const createdSummary = Object.freeze({
      ...summary,
      conversationId: CREATED_CONVERSATION_ID,
      title: 'Phân tích mới',
    });
    let conversationCreated = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('/v1/datasets')) {
        return jsonResponse({
          accepted: true,
          value: {
            datasets: [
              {
                datasetId: DATASET_ID,
                versionId: DATASET_VERSION_ID,
                label: 'Chi phí vận hành',
                status: 'PUBLISHED',
                versionLabel: '2026-08-13T00:00:00.000Z',
                publishedAt: '2026-08-13T00:00:00.000Z',
                fieldCount: 3,
                fieldTypes: ['DATE', 'DECIMAL', 'TEXT'],
                health: 'UNKNOWN',
                readiness: 'READY',
              },
            ],
            page: { limit: 25 },
          },
        });
      }
      if (url.endsWith('/v1/dda/conversations') && init?.method === 'POST') {
        if (typeof init.body !== 'string') throw new TypeError('Expected a JSON request body');
        const body = JSON.parse(init.body) as {
          readonly datasetIds: readonly string[];
          readonly datasetVersionIds: Readonly<Record<string, string>>;
        };
        expect(body.datasetIds).toEqual([DATASET_ID]);
        expect(body.datasetVersionIds).toEqual({ [DATASET_ID]: DATASET_VERSION_ID });
        conversationCreated = true;
        return jsonResponse({
          accepted: true,
          conversationId: CREATED_CONVERSATION_ID,
          title: 'Phân tích mới',
          activeDatasetIds: [DATASET_ID],
        });
      }
      if (url.endsWith('/v1/dda/conversations?limit=20')) {
        return jsonResponse({
          schemaVersion: 4,
          accepted: true,
          // Keep the list response stale to prove creation does not depend on
          // a refetch racing the server's history projection.
          items: [],
        });
      }
      if (url.includes(`/v1/dda/conversations/${CREATED_CONVERSATION_ID}?limit=50`)) {
        return jsonResponse({
          schemaVersion: 4,
          accepted: true,
          conversation: createdSummary,
          messages: [],
          contextEvents: [],
        });
      }
      return new Response('', { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);

    renderRoute('/vi-VN/analysis');

    expect(
      await screen.findByText('Chưa có hội thoại được cấp quyền trong không gian làm việc này.'),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Tạo hội thoại mới' }));

    await waitFor(() => expect(conversationCreated).toBe(true));
    expect(
      await screen.findByText('Phân tích mới', {
        selector: '.analysis-conversation-history__item-title',
      }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(workspaceAgentStore.getActiveConversation()?.conversationId).toBe(
        CREATED_CONVERSATION_ID,
      ),
    );
  });
});
