import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FloatingAgentButton } from '../src/features/agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../src/features/agent/floating-agent-panel.tsx';
import { createAgentStore } from '../src/features/agent/agent-store.ts';

describe('floating agent surfaces', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function stubAuthorizedConversations(
    conversations: readonly {
      readonly conversationId: string;
      readonly title: string;
      readonly datasetId: string;
      readonly datasetVersionId: string;
    }[],
  ) {
    const summaries = conversations.map((conversation) => ({
      schemaVersion: 4 as const,
      conversationId: conversation.conversationId,
      createdAt: '2026-08-18T08:00:00.000Z',
      updatedAt: '2026-08-18T08:00:00.000Z',
      title: conversation.title,
      datasets: [
        {
          datasetId: conversation.datasetId,
          datasetVersionId: conversation.datasetVersionId,
        },
      ],
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v1/dda/conversations?')) {
          return new Response(
            JSON.stringify({ accepted: true, items: summaries, schemaVersion: 4 }),
            { headers: { 'content-type': 'application/json' } },
          );
        }
        const matched = summaries.find((summary) => url.includes(`/${summary.conversationId}?`));
        if (matched === undefined) return new Response('{}', { status: 404 });
        return new Response(
          JSON.stringify({
            accepted: true,
            contextEvents: [],
            conversation: matched,
            messages: [],
            schemaVersion: 4,
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }),
    );
  }

  it('shows the floating agent on the composed dashboard route', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);
    const opener = await screen.findByRole('button', { name: 'Mở trợ lý biểu đồ' });
    expect(opener.getAttribute('data-shape')).toBe('circle');
    expect(opener.querySelector('img')?.getAttribute('src')).toBe(
      '/landing/assets/databreeze-mark.png',
    );
  });

  it('adds compatible demo charts only after the explicit canvas confirmation', async () => {
    vi.stubEnv('VITE_DATABREEZE_DEMO_MODE', 'true');
    const user = userEvent.setup();
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    await screen.findByTestId('widget-00000000-0000-4000-8000-00000000001d');
    const initialWidgetCount = document.querySelectorAll('.dda-widget-frame').length;
    await user.click(await screen.findByRole('button', { name: 'Mở trợ lý biểu đồ' }));
    await user.type(
      screen.getByRole('textbox', { name: 'Câu hỏi cho trợ lý biểu đồ' }),
      'Cho tôi xem doanh thu theo khu vực',
    );
    await user.click(screen.getByRole('button', { name: 'Gửi' }));

    const barOption = await screen.findByRole('option', { name: /Cột/u });
    const lineOption = screen.getByRole('option', { name: /Đường/u });
    await user.click(barOption);
    await user.click(lineOption);
    expect(document.querySelectorAll('.dda-widget-frame').length).toBe(initialWidgetCount);

    await user.click(screen.getByRole('button', { name: 'Thêm 2 biểu đồ vào canvas' }));

    expect(await screen.findByText('Đã thêm 2 biểu đồ vào canvas.')).toBeTruthy();
    expect(document.querySelectorAll('.dda-widget-frame').length).toBe(initialWidgetCount + 2);
    await waitFor(() => {
      expect(document.activeElement).toBe(
        document.querySelectorAll<HTMLElement>('.dda-widget-frame')[initialWidgetCount],
      );
    });
  }, 30_000);

  it('shows the floating agent on dashboard and data routes', () => {
    const store = createAgentStore();
    render(
      <MemoryRouter initialEntries={['/vi-VN/dashboards']}>
        <Routes>
          <Route
            path="/:locale/dashboards"
            element={
              <>
                <FloatingAgentButton store={store} locale="vi-VN" />
                <FloatingAgentPanel store={store} locale="vi-VN" surface="dashboard" />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    const opener = screen.getByRole('button', { name: 'Mở trợ lý' });
    expect(opener.getAttribute('data-shape')).toBe('circle');
    expect(opener.querySelector('img')?.getAttribute('src')).toBe(
      '/landing/assets/databreeze-mark.png',
    );
  });

  it('opens a contextual DataBreeze assistant card instead of an empty panel', async () => {
    const user = userEvent.setup();
    stubAuthorizedConversations([
      {
        conversationId: '00000000-0000-4000-8000-000000000100',
        title: 'Doanh thu theo khu vực',
        datasetId: '00000000-0000-4000-8000-000000000201',
        datasetVersionId: '00000000-0000-4000-8000-000000000301',
      },
    ]);
    const store = createAgentStore();
    store.setActiveConversation({
      conversationId: '00000000-0000-4000-8000-000000000100',
      title: 'Doanh thu theo khu vực',
      datasetLabel: 'Bán hàng toàn quốc',
      datasetVersionLabel: 'Phiên bản 12',
    });
    render(
      <MemoryRouter initialEntries={['/vi-VN/data']}>
        <FloatingAgentButton store={store} locale="vi-VN" />
        <FloatingAgentPanel store={store} locale="vi-VN" surface="data" />
      </MemoryRouter>,
    );

    const opener = screen.getByRole('button', { name: 'Mở trợ lý' });
    expect(opener.getAttribute('data-shape')).toBe('circle');
    await user.click(opener);

    const panel = screen.getByRole('complementary', { name: 'Trợ lý' });
    expect(panel.getAttribute('data-open-motion')).toBe('from-bubble');
    expect(opener.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('heading', { name: 'Trợ lý DataBreeze' })).toBeTruthy();
    expect(panel.querySelector('img')?.getAttribute('src')).toBe(
      '/landing/assets/databreeze-mark.png',
    );
    expect(
      screen.getByRole('button', { name: 'Chọn cuộc trò chuyện: Doanh thu theo khu vực' }),
    ).toBeTruthy();
    expect(screen.queryByText('Lịch sử hội thoại')).toBeNull();
    expect(screen.queryByLabelText('Tự động áp dụng thay đổi an toàn')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cuộc trò chuyện mới' })).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Nhập câu hỏi cho trợ lý' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeTruthy();
    expect(screen.getByText('Bộ dữ liệu …00000201 · Phiên bản …00000301')).toBeTruthy();
  });

  it('keeps the composer unavailable when the server has no authorized conversations', async () => {
    const user = userEvent.setup();
    stubAuthorizedConversations([]);
    const store = createAgentStore();
    render(
      <MemoryRouter initialEntries={['/vi-VN/data']}>
        <FloatingAgentButton store={store} locale="vi-VN" />
        <FloatingAgentPanel store={store} locale="vi-VN" surface="data" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));
    await waitFor(() =>
      expect(
        screen.getByRole('textbox', { name: 'Nhập câu hỏi cho trợ lý' }).hasAttribute('disabled'),
      ).toBe(true),
    );
    expect(
      screen.getByRole('textbox', { name: 'Nhập câu hỏi cho trợ lý' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.queryByText(/Tôi đã phân tích câu hỏi/u)).toBeNull();
  });

  it('sends a real turn and renders only the server-reloaded assistant message', async () => {
    const user = userEvent.setup();
    const conversation = {
      schemaVersion: 4 as const,
      conversationId: '00000000-0000-4000-8000-000000000110',
      createdAt: '2026-08-18T08:00:00.000Z',
      updatedAt: '2026-08-18T08:00:00.000Z',
      title: 'Doanh thu theo khu vực',
      datasets: [
        {
          datasetId: '00000000-0000-4000-8000-000000000210',
          datasetVersionId: '00000000-0000-4000-8000-000000000310',
        },
      ],
    };
    let turnCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/v1/dda/conversations?')) {
        return new Response(
          JSON.stringify({ accepted: true, items: [conversation], schemaVersion: 4 }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/v1/dda/agent/turns')) {
        turnCount += 1;
        expect(init?.method).toBe('POST');
        return new Response(
          JSON.stringify({
            accepted: true,
            narrative: 'accepted',
            schemaVersion: 4,
            toolResults: [],
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          accepted: true,
          contextEvents: [],
          conversation,
          messages:
            turnCount === 0
              ? []
              : [
                  {
                    conversationId: conversation.conversationId,
                    createdAt: '2026-08-18T08:01:00.000Z',
                    messageId: '00000000-0000-4000-8000-000000000410',
                    role: 'USER',
                    sequence: 1,
                    text: 'Tóm tắt doanh thu',
                  },
                  {
                    conversationId: conversation.conversationId,
                    createdAt: '2026-08-18T08:01:01.000Z',
                    messageId: '00000000-0000-4000-8000-000000000411',
                    role: 'AGENT',
                    sequence: 2,
                    text: 'Đây là câu trả lời từ máy chủ.',
                  },
                ],
          schemaVersion: 4,
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const store = createAgentStore();
    render(
      <MemoryRouter initialEntries={['/vi-VN/data']}>
        <FloatingAgentButton store={store} locale="vi-VN" />
        <FloatingAgentPanel store={store} locale="vi-VN" surface="data" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));
    const textbox = await screen.findByRole('textbox', { name: 'Nhập câu hỏi cho trợ lý' });
    await waitFor(() => expect((textbox as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(textbox, 'Tóm tắt doanh thu');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));

    expect(await screen.findByText('Đây là câu trả lời từ máy chủ.')).toBeTruthy();
    expect(turnCount).toBe(1);
    expect(screen.queryByText(/Tôi đã phân tích câu hỏi/u)).toBeNull();
  });

  it('shows a clearly labelled approved-data preview when the agent provider is unavailable', async () => {
    const user = userEvent.setup();
    const conversation = {
      schemaVersion: 4 as const,
      conversationId: '00000000-0000-4000-8000-000000000120',
      createdAt: '2026-08-18T08:00:00.000Z',
      updatedAt: '2026-08-18T08:00:00.000Z',
      title: 'Doanh thu theo khu vực',
      datasets: [
        {
          datasetId: '00000000-0000-4000-8000-000000000220',
          datasetVersionId: '00000000-0000-4000-8000-000000000320',
        },
      ],
    };
    const dataset = conversation.datasets[0];
    if (dataset === undefined) throw new Error('Test conversation must include a dataset');
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes('/v1/dda/conversations?')) {
        return new Response(
          JSON.stringify({ accepted: true, items: [conversation], schemaVersion: 4 }),
          {
            headers: { 'content-type': 'application/json' },
          },
        );
      }
      if (url.includes('/v1/dda/agent/turns') && init?.method === 'POST') {
        return new Response('', { status: 503 });
      }
      if (url.endsWith('/v1/dda/data-imports?limit=50')) {
        return new Response(
          JSON.stringify({
            accepted: true,
            value: {
              imports: [
                {
                  importId: '00000000-0000-4000-8000-000000000420',
                  revision: 1,
                  state: 'READY',
                  destination: 'NEW_DATASET',
                  datasetId: dataset.datasetId,
                  datasetName: 'Bán hàng đã duyệt',
                  idempotencyKey: 'floating-preview-import',
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
                    datasetId: dataset.datasetId,
                    datasetVersionId: dataset.datasetVersionId,
                    definitionVersionId: '00000000-0000-4000-8000-000000000521',
                    dashboardStatus: 'UNAVAILABLE',
                    approvedAt: '2026-08-18T08:00:00.000Z',
                  },
                  createdAt: '2026-08-18T08:00:00.000Z',
                  updatedAt: '2026-08-18T08:00:00.000Z',
                },
              ],
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.includes('/dashboard-preview')) {
        return new Response(
          JSON.stringify({
            schemaVersion: 4,
            accepted: true,
            value: {
              importId: '00000000-0000-4000-8000-000000000420',
              datasetId: dataset.datasetId,
              datasetVersionId: dataset.datasetVersionId,
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
              sampleRows: [],
              generatedAt: '2026-08-18T08:00:00.000Z',
            },
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          accepted: true,
          contextEvents: [],
          conversation,
          messages: [],
          schemaVersion: 4,
        }),
        { headers: { 'content-type': 'application/json' } },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const store = createAgentStore();
    render(
      <MemoryRouter initialEntries={['/vi-VN/data']}>
        <FloatingAgentButton store={store} locale="vi-VN" />
        <FloatingAgentPanel store={store} locale="vi-VN" surface="data" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));
    const textbox = await screen.findByRole('textbox', { name: 'Nhập câu hỏi cho trợ lý' });
    await waitFor(() => expect((textbox as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(textbox, 'Tóm tắt doanh thu');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));

    expect(await screen.findByText(/Nhận định cục bộ từ bản xem nhanh/u)).toBeTruthy();
    expect(
      await screen.findByText((content) => content.includes('Tổng **revenue** là')),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('keeps the question available when no approved import can back a local preview', async () => {
    const user = userEvent.setup();
    const conversation = {
      schemaVersion: 4 as const,
      conversationId: '00000000-0000-4000-8000-000000000121',
      createdAt: '2026-08-18T08:00:00.000Z',
      updatedAt: '2026-08-18T08:00:00.000Z',
      title: 'Doanh thu theo khu vực',
      datasets: [
        {
          datasetId: '00000000-0000-4000-8000-000000000221',
          datasetVersionId: '00000000-0000-4000-8000-000000000321',
        },
      ],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
        if (url.includes('/v1/dda/agent/turns') && init?.method === 'POST') {
          return new Response('', { status: 503 });
        }
        if (url.endsWith('/v1/dda/data-imports?limit=50')) {
          return new Response(JSON.stringify({ accepted: true, value: { imports: [] } }), {
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/v1/dda/conversations?')) {
          return new Response(
            JSON.stringify({ accepted: true, items: [conversation], schemaVersion: 4 }),
            {
              headers: { 'content-type': 'application/json' },
            },
          );
        }
        return new Response(
          JSON.stringify({
            accepted: true,
            contextEvents: [],
            conversation,
            messages: [],
            schemaVersion: 4,
          }),
          { headers: { 'content-type': 'application/json' } },
        );
      }),
    );
    const store = createAgentStore();
    render(
      <MemoryRouter initialEntries={['/vi-VN/data']}>
        <FloatingAgentButton store={store} locale="vi-VN" />
        <FloatingAgentPanel store={store} locale="vi-VN" surface="data" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));
    const textbox = await screen.findByRole('textbox', { name: 'Nhập câu hỏi cho trợ lý' });
    await waitFor(() => expect((textbox as HTMLTextAreaElement).disabled).toBe(false));
    await user.type(textbox, 'Tóm tắt doanh thu');
    await user.click(screen.getByRole('button', { name: 'Gửi' }));

    expect(
      await screen.findByText(
        'Không thể gửi câu hỏi lúc này. Nội dung vẫn được giữ lại để bạn thử lại.',
      ),
    ).toBeTruthy();
    expect((textbox as HTMLTextAreaElement).value).toBe('Tóm tắt doanh thu');
  });

  it('switches between authorized conversations in the Notion-style dropdown', async () => {
    const user = userEvent.setup();
    stubAuthorizedConversations([
      {
        conversationId: '00000000-0000-4000-8000-000000000101',
        title: 'Doanh thu theo khu vực',
        datasetId: '00000000-0000-4000-8000-000000000202',
        datasetVersionId: '00000000-0000-4000-8000-000000000302',
      },
      {
        conversationId: '00000000-0000-4000-8000-000000000102',
        title: 'Đơn hàng bất thường',
        datasetId: '00000000-0000-4000-8000-000000000203',
        datasetVersionId: '00000000-0000-4000-8000-000000000303',
      },
    ]);
    const store = createAgentStore();
    store.setConversations([
      {
        conversationId: '00000000-0000-4000-8000-000000000101',
        title: 'Doanh thu theo khu vực',
        datasetLabel: 'Bán hàng toàn quốc',
        datasetVersionLabel: 'Phiên bản 12',
      },
      {
        conversationId: '00000000-0000-4000-8000-000000000102',
        title: 'Đơn hàng bất thường',
        datasetLabel: 'Tồn kho cửa hàng',
        datasetVersionLabel: 'Phiên bản 7',
      },
    ]);
    render(
      <MemoryRouter initialEntries={['/vi-VN/data']}>
        <FloatingAgentButton store={store} locale="vi-VN" />
        <FloatingAgentPanel store={store} locale="vi-VN" surface="data" />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));
    await user.click(screen.getByRole('button', { name: /Chọn cuộc trò chuyện/u }));
    await user.click(screen.getByRole('option', { name: 'Đơn hàng bất thường' }));

    expect(store.getActiveConversation()?.conversationId).toBe(
      '00000000-0000-4000-8000-000000000102',
    );
    expect(screen.getByText('Bộ dữ liệu …00000203 · Phiên bản …00000303')).toBeTruthy();
  });

  it('fades the chat open when the user prefers reduced motion', async () => {
    const originalMatchMedia = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-reduced-motion: reduce)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    const user = userEvent.setup();
    stubAuthorizedConversations([]);
    const store = createAgentStore();
    render(
      <MemoryRouter initialEntries={['/en/data']}>
        <FloatingAgentButton store={store} locale="en" />
        <FloatingAgentPanel store={store} locale="en" surface="data" />
      </MemoryRouter>,
    );

    try {
      await user.click(screen.getByRole('button', { name: 'Open agent' }));

      expect(
        screen.getByRole('complementary', { name: 'Agent' }).getAttribute('data-open-motion'),
      ).toBe('fade');
      expect(screen.getByRole('heading', { name: 'DataBreeze Agent' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Close agent' })).toBeTruthy();
    } finally {
      globalThis.matchMedia = originalMatchMedia;
    }
  });

  it('does not render a second floating agent on analysis', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/analysis'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Phân tích' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mở trợ lý' })).toBeNull();
  });
});
