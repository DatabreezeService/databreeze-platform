import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { DataPipelinePage } from '../src/features/data-intake/data-pipeline-page.tsx';

describe('data pipeline route composition [DDA-002][DDA-006]', () => {
  it('composes intake upload and ETL review on the reviews route without demo mode', async () => {
    const router = createAppRouter({ initialEntries: ['/en/reviews'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Intake and ETL review' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ETL review' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to dashboards' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Accept ETL proposal' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Accept ETL proposal' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.queryByText('1,250,000 VND')).toBeNull();
  });

  it('keeps Vietnamese as the default composed pipeline copy', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/reviews'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Tiếp nhận và xem xét ETL' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tiếp tục tới bảng điều khiển' })).toBeTruthy();
  });

  it('fail-closes upload and accept until live tenant context is configured', async () => {
    const router = createAppRouter({ initialEntries: ['/en/reviews'] });
    render(<ApplicationBoundary router={router} />);
    expect(
      await screen.findByText(
        'Tenant context is required before upload or ETL acceptance. No changes were sent.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Upload' })).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Accept ETL proposal' }).hasAttribute('disabled'),
    ).toBe(true);
  });

  it('keeps local demo intake selectable and testable without inventing tenant authority', async () => {
    const user = userEvent.setup();
    render(
      <ApplicationBoundary>
        <DataPipelinePage demoMode />
      </ApplicationBoundary>,
    );

    expect(screen.getByRole('heading', { name: 'Tải tệp CSV/XLSX' })).toBeTruthy();
    expect(screen.getByLabelText('Chọn tệp')).toBeTruthy();
    expect(
      screen.queryByText(
        'Cần ngữ cảnh tenant trước khi tải lên hoặc chấp nhận ETL. Không có thay đổi nào được gửi.',
      ),
    ).toBeNull();
    await user.upload(
      screen.getByLabelText('Chọn tệp'),
      new File(['date,revenue\n2026-08-14,4200000\n'], 'doanh-thu.csv', {
        type: 'text/csv',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Tải lên' }));
    expect(await screen.findByText(/Đã gửi tệp vào Inbox/u)).toBeTruthy();
    expect(screen.queryByText(/4200000/u)).toBeNull();
  });
});
