import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

describe('data pipeline route composition [DDA-002][DDA-006]', () => {
  it('composes intake upload and ETL review on the reviews route without demo mode', async () => {
    const router = createAppRouter({ initialEntries: ['/en/reviews'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Intake and ETL review' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'ETL review' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Continue to dashboards' })).toBeTruthy();
    expect(screen.queryByText('1,250,000 VND')).toBeNull();
  });

  it('keeps Vietnamese as the default composed pipeline copy', async () => {
    const router = createAppRouter({ initialEntries: ['/vi-VN/reviews'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Tiếp nhận và xem xét ETL' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tiếp tục tới bảng điều khiển' })).toBeTruthy();
  });
});
