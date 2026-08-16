import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FloatingAgentButton } from '../src/features/agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../src/features/agent/floating-agent-panel.tsx';
import { createAgentStore } from '../src/features/agent/agent-store.ts';

describe('floating agent surfaces', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('shows the floating agent on the composed dashboard route', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);
    const opener = await screen.findByRole('button', { name: 'Mở trợ lý biểu đồ' });
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
  });

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
    expect(opener.querySelector('img')?.getAttribute('src')).toBe(
      '/landing/assets/databreeze-mark.png',
    );
  });

  it('opens a contextual DataBreeze assistant card instead of an empty panel', async () => {
    const user = userEvent.setup();
    const store = createAgentStore();
    store.setActiveConversation({
      conversationId: 'conversation-1',
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

    await user.click(screen.getByRole('button', { name: 'Mở trợ lý' }));

    const panel = screen.getByRole('complementary', { name: 'Trợ lý' });
    expect(screen.getByRole('heading', { name: 'Trợ lý DataBreeze' })).toBeTruthy();
    expect(panel.querySelector('img')?.getAttribute('src')).toBe(
      '/landing/assets/databreeze-mark.png',
    );
    expect(screen.getByRole('combobox', { name: 'Chuyển hội thoại' })).toBeTruthy();
    expect(screen.getByRole('textbox', { name: 'Nhập câu hỏi cho trợ lý' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gửi' })).toBeTruthy();
    expect(screen.getByText('Bán hàng toàn quốc · Phiên bản 12')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở trong Phân tích' }).getAttribute('href')).toBe(
      '/vi-VN/analysis?conversation=conversation-1',
    );
  });

  it('switches between authorized conversations and opens the same thread in Analysis', async () => {
    const user = userEvent.setup();
    const store = createAgentStore();
    store.setConversations([
      {
        conversationId: 'conversation-sales',
        title: 'Doanh thu theo khu vực',
        datasetLabel: 'Bán hàng toàn quốc',
        datasetVersionLabel: 'Phiên bản 12',
      },
      {
        conversationId: 'conversation-orders',
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
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Chuyển hội thoại' }),
      'conversation-orders',
    );

    expect(store.getActiveConversation()?.conversationId).toBe('conversation-orders');
    expect(screen.getByText('Tồn kho cửa hàng · Phiên bản 7')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mở trong Phân tích' }).getAttribute('href')).toBe(
      '/vi-VN/analysis?conversation=conversation-orders',
    );
    expect(screen.getByRole('link', { name: 'Hội thoại mới' }).getAttribute('href')).toBe(
      '/vi-VN/analysis?new=1',
    );
  });

  it('does not render a second floating agent on analysis', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/analysis'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Phân tích' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mở trợ lý' })).toBeNull();
  });
});
