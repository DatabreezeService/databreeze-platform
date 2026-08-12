import { render, screen } from '@testing-library/react';
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
    expect(await screen.findByRole('button', { name: 'Mở trợ lý' })).toBeTruthy();
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

  it('does not render a second floating agent on analysis', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/analysis'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Phân tích' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Mở trợ lý' })).toBeNull();
  });
});
