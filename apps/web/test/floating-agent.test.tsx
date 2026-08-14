import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FloatingAgentButton } from '../src/features/agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../src/features/agent/floating-agent-panel.tsx';
import { createAgentStore } from '../src/features/agent/agent-store.ts';

describe('floating agent surfaces', () => {
  it('shows the floating agent on the composed dashboard route', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/dashboards'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('button', { name: 'Mở trợ lý biểu đồ' })).toBeTruthy();
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
    expect(screen.getByRole('button', { name: 'Mở trợ lý' })).toBeTruthy();
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

    expect(screen.getByRole('heading', { name: 'Trợ lý DataBreeze' })).toBeTruthy();
    expect(screen.getByText('Bán hàng toàn quốc · Phiên bản 12')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Mở trong Phân tích' }).getAttribute('href'),
    ).toBe('/vi-VN/analysis?conversation=conversation-1');
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
