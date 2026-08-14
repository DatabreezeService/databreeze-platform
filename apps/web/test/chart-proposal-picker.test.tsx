import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DashboardAgentPanel } from '../src/features/dashboards/dashboard-agent-panel.tsx';

const proposals = [
  {
    optionId: 'stacked-bar-by-region',
    chartType: 'STACKED_BAR',
    title: { vi: 'Doanh thu theo khu vực', en: 'Revenue by region' },
    rationale: { vi: 'So sánh cơ cấu theo khu vực.', en: 'Compares the mix by region.' },
    dimensions: [{ id: 'region', label: { vi: 'Khu vực', en: 'Region' } }],
    measures: [{ id: 'revenue', label: { vi: 'Doanh thu', en: 'Revenue' } }],
    supportedSize: { vi: 'Rộng 6 cột', en: 'Wide 6 columns' },
    accessibilityDescription: {
      vi: 'Biểu đồ cột xếp chồng so sánh doanh thu giữa các khu vực.',
      en: 'A stacked bar chart comparing revenue between regions.',
    },
    details: {
      datasets: [
        { datasetId: 'dataset-1', label: { vi: 'Bán hàng', en: 'Sales' }, versionId: 'version-1' },
      ],
      dimensions: ['region'],
      filters: ['year EQ 2026'],
      dateRange: {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-12-31T23:59:59.000Z',
        grain: 'MONTH',
      },
      joins: [],
      units: { revenue: 'VND' },
      assumptions: ['Authorized sales dataset only'],
      outputBounds: { form: 'TABLE', maxRows: 100 },
      estimatedCost: { cpuMs: 100, memoryMb: 64 },
      affectedPageIds: ['page-1'],
      affectedWidgetIds: [],
      beforeAfterSummary: { vi: 'Thêm biểu đồ mới.', en: 'Adds a new chart.' },
    },
  },
  {
    optionId: 'line-by-month',
    chartType: 'LINE',
    title: { vi: 'Xu hướng doanh thu', en: 'Revenue trend' },
    rationale: { vi: 'Cho thấy xu hướng theo tháng.', en: 'Shows the monthly trend.' },
    dimensions: [{ id: 'month', label: { vi: 'Tháng', en: 'Month' } }],
    measures: [{ id: 'revenue', label: { vi: 'Doanh thu', en: 'Revenue' } }],
    supportedSize: { vi: 'Rộng 8 cột', en: 'Wide 8 columns' },
    accessibilityDescription: {
      vi: 'Biểu đồ đường về xu hướng doanh thu theo tháng.',
      en: 'A line chart of revenue by month.',
    },
    details: {
      datasets: [
        { datasetId: 'dataset-1', label: { vi: 'Bán hàng', en: 'Sales' }, versionId: 'version-1' },
      ],
      dimensions: ['month'],
      filters: ['year EQ 2026'],
      dateRange: {
        start: '2026-01-01T00:00:00.000Z',
        end: '2026-12-31T23:59:59.000Z',
        grain: 'MONTH',
      },
      joins: [],
      units: { revenue: 'VND' },
      assumptions: ['Authorized sales dataset only'],
      outputBounds: { form: 'TABLE', maxRows: 100 },
      estimatedCost: { cpuMs: 100, memoryMb: 64 },
      affectedPageIds: ['page-1'],
      affectedWidgetIds: [],
      beforeAfterSummary: { vi: 'Thêm biểu đồ mới.', en: 'Adds a new chart.' },
    },
  },
] as const;

describe('chart proposal picker [DDA-016][DDA-021][DDA-024][DDA-050][WEB-014]', () => {
  it('keeps compatible card selection local until the explicit Vietnamese confirmation [DDA-024]', async () => {
    const user = userEvent.setup();
    const onConfirmProposal = vi.fn();

    render(
      <DashboardAgentPanel
        locale="vi-VN"
        open
        target={{ pageId: 'page-1', pageTitle: { vi: 'Tổng quan', en: 'Overview' } }}
        onClose={() => undefined}
        proposalOptions={proposals}
        onConfirmProposal={onConfirmProposal}
      />,
    );

    const stackedBar = screen.getByRole('option', { name: /Cột xếp chồng/u });
    const line = screen.getByRole('option', { name: /Đường/u });
    expect(onConfirmProposal).not.toHaveBeenCalled();

    stackedBar.focus();
    await user.keyboard(' ');
    line.focus();
    await user.keyboard('{Enter}');

    expect(stackedBar.getAttribute('aria-selected')).toBe('true');
    expect(line.getAttribute('aria-selected')).toBe('true');
    expect(onConfirmProposal).not.toHaveBeenCalled();
    expect(screen.getAllByText('Tập dữ liệu và phiên bản')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Thêm 2 biểu đồ vào canvas' }));

    expect(onConfirmProposal).toHaveBeenCalledWith(['stacked-bar-by-region', 'line-by-month']);
  });
});
