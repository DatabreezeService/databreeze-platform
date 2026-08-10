import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AnalystPanel } from '../src/features/dashboards/analyst-panel.tsx';

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

describe('dashboard analyst [DDA-016][DDA-019]', () => {
  it('shows datasets, versions, metrics, dimensions, filters, range/grain, joins, units, assumptions, output, and cost before execution', () => {
    render(<AnalystPanel locale="en" preview={preview} />);

    expect(screen.getByRole('heading', { name: 'Ask governed data' })).toBeTruthy();
    expect(screen.getByText(preview.datasets[0]!)).toBeTruthy();
    expect(screen.getByText(preview.semanticVersionId)).toBeTruthy();
    expect(screen.getByText(preview.metricVersionId)).toBeTruthy();
    expect(screen.getByText('region')).toBeTruthy();
    expect(screen.getByText(/year EQ 2026/u)).toBeTruthy();
    expect(screen.getByText(/MONTH/u)).toBeTruthy();
    expect(screen.getByText('No joins')).toBeTruthy();
    expect(screen.getByText(/amount: VND/u)).toBeTruthy();
    expect(screen.getByText(/Uses accepted sales dataset only/u)).toBeTruthy();
    expect(screen.getByText(/TABLE \/ max 100/u)).toBeTruthy();
    expect(screen.getByText(/100 ms CPU, 64 MB/u)).toBeTruthy();
  });

  it('renders Vietnamese analyst chrome', () => {
    render(<AnalystPanel locale="vi-VN" preview={preview} />);
    expect(screen.getByRole('heading', { name: 'Hỏi dữ liệu có kiểm soát' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đề xuất kế hoạch' })).toBeTruthy();
  });
});
