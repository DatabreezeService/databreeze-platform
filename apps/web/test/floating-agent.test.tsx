import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { FloatingAgentButton } from '../src/features/agent/floating-agent-button.tsx';
import { FloatingAgentPanel } from '../src/features/agent/floating-agent-panel.tsx';
import { createAgentStore } from '../src/features/agent/agent-store.ts';

describe('floating agent surfaces', () => {
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

  it('does not render a second floating agent on analysis', () => {
    const store = createAgentStore();
    render(
      <MemoryRouter initialEntries={['/vi-VN/analysis']}>
        <Routes>
          <Route
            path="/:locale/analysis"
            element={
              <FloatingAgentPanel store={store} locale="vi-VN" surface="analysis" />
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Mở trợ lý' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Phân tích' })).toBeTruthy();
  });
});
