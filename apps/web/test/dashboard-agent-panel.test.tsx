import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AnalystPanel } from '../src/features/dashboards/analyst-panel.tsx';
import { DashboardAgentPanel } from '../src/features/dashboards/dashboard-agent-panel.tsx';

const preview = {
  datasets: ['00000000-0000-4000-8000-000000000018'],
  semanticVersionId: '00000000-0000-4000-8000-000000000019',
  metricVersionId: '00000000-0000-4000-8000-00000000001a',
  dimensions: ['region'],
  filters: [{ field: 'year', operator: 'EQ', value: '2026' }],
  timeRange: { start: '2026-01-01T00:00:00.000Z', end: '2026-12-31T23:59:59.000Z' },
  timeGrain: 'MONTH',
  joins: [],
  units: { amount: 'VND' },
  assumptions: ['Uses accepted sales dataset only'],
  output: { form: 'TABLE', maxRows: 100 },
  estimate: { cpuMs: 100, memoryMb: 64 },
};

describe('dashboard-local agent panel [DDA-015][DDA-017][DDA-024][WEB-014]', () => {
  it('opens from the persistent icon, identifies the current target, and returns focus on Escape', async () => {
    const user = userEvent.setup();
    render(<AnalystPanel locale="vi-VN" preview={preview} />);

    const opener = screen.getByRole('button', { name: 'Mở trợ lý biểu đồ' });
    await user.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Trợ lý biểu đồ' });
    expect(
      within(dialog).getByRole('textbox', { name: 'Câu hỏi cho trợ lý biểu đồ' }),
    ).toBeTruthy();
    expect(within(dialog).getByText('Mục tiêu: Trang hiện tại')).toBeTruthy();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Trợ lý biểu đồ' })).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('keeps deterministic manual analysis available when the provider is disabled [DDA-017][DDA-044]', async () => {
    const user = userEvent.setup();
    render(
      <DashboardAgentPanel
        locale="vi-VN"
        open
        target={{ pageId: 'page-1', pageTitle: { vi: 'Tổng quan', en: 'Overview' } }}
        onClose={() => undefined}
      />,
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Câu hỏi cho trợ lý biểu đồ' }),
      'Doanh thu theo khu vực',
    );
    await user.click(screen.getByRole('button', { name: 'Tạo đề xuất biểu đồ' }));

    expect(screen.getByRole('alert').textContent).toBe(
      'Trợ lý AI hiện không khả dụng. Bạn vẫn có thể tạo kế hoạch phân tích có kiểm soát thủ công.',
    );
  });
});
