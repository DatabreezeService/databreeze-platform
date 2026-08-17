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
    const url = String(input);
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
      const url = String(input);
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
        const body = JSON.parse(String(init.body)) as {
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
          items: conversationCreated ? [createdSummary] : [],
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
    await user.click(screen.getByRole('button', { name: 'Phân tích mới' }));

    await waitFor(() => expect(conversationCreated).toBe(true));
    await waitFor(() =>
      expect(workspaceAgentStore.getActiveConversation()?.conversationId).toBe(
        CREATED_CONVERSATION_ID,
      ),
    );
  });
});
