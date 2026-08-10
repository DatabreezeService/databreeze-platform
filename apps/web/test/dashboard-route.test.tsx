import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

describe('dashboard route composition [DDA-020]', () => {
  it('does not render fixture dashboard data when live dashboard configuration is unavailable', async () => {
    const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Dashboards' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dashboards' })).toBeTruthy();
    expect(
      await screen.findByText('Dashboard data is not available. No changes were sent.'),
    ).toBeTruthy();
    expect(screen.queryByText('1,250,000 VND')).toBeNull();
  });
});
