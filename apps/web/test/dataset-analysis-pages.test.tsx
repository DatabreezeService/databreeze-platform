import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { DatasetIndexPage } from '../src/features/data/dataset-index-page.tsx';
import { SourceUploadPanel } from '../src/features/data/source-upload-panel.tsx';
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

  it('routes legacy empty dataset views into the canonical reloadable Data flow', () => {
    render(
      <MemoryRouter>
        <DatasetIndexPage locale="vi-VN" datasets={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Mở Dữ liệu' }).getAttribute('href')).toBe(
      '/vi-VN/data',
    );
    expect(screen.queryByText('Tải tệp an toàn chưa khả dụng trong bản chạy này.')).toBeNull();
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

  it('does not show dead upload or connector controls without an authorized command', () => {
    const { container } = render(<SourceUploadPanel locale="vi-VN" />);
    expect(container.firstChild).toBeNull();
  });

  it('shows only the controls that the current route can execute', () => {
    render(<SourceUploadPanel locale="vi-VN" onSelectFiles={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Kết nối nguồn' })).toBeNull();
    expect(screen.getByLabelText('Chọn tệp để tải lên')).toBeTruthy();
  });
});
