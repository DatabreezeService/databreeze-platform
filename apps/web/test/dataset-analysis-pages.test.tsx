import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DatasetIndexPage } from '../src/features/data/dataset-index-page.tsx';
import { AnalysisPage } from '../src/features/analysis/analysis-page.tsx';
import { createAgentStore } from '../src/features/agent/agent-store.ts';

describe('data and analysis destinations', () => {
  it('renders dataset cards with Vietnamese defaults', () => {
    render(
      <DatasetIndexPage
        locale="vi-VN"
        datasets={[
          {
            datasetId: 'ds-1',
            label: 'Doanh thu TP.HCM',
            health: 'READY',
            versionLabel: 'phiên bản 8',
          },
        ]}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Dữ liệu' })).toBeTruthy();
    expect(screen.getByText('Doanh thu TP.HCM')).toBeTruthy();
    expect(screen.getByText(/phiên bản 8/i)).toBeTruthy();
  });

  it('shows conversation history context before opening a thread', () => {
    const store = createAgentStore();
    store.setActiveConversation({
      conversationId: 'c1',
      title: 'Vì sao doanh thu tháng 7 giảm?',
      datasetLabel: 'Doanh thu TP.HCM',
      datasetVersionLabel: 'phiên bản 7',
    });
    render(<AnalysisPage locale="vi-VN" store={store} />);
    expect(screen.getByRole('heading', { name: 'Phân tích' })).toBeTruthy();
    expect(screen.getAllByText('Vì sao doanh thu tháng 7 giảm?').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Doanh thu TP.HCM/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/phiên bản 7/).length).toBeGreaterThan(0);
  });
});
