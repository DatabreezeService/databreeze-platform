import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

describe('dashboard route composition [DDA-020]', () => {
  it('renders the dashboards feature through shell navigation', async () => {
    const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
    render(<ApplicationBoundary router={router} />);
    expect(await screen.findByRole('heading', { name: 'Dashboards' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Dashboards' })).toBeTruthy();
    expect(
      screen.getAllByText(/Evidence and authorization limits remain visible/u).length,
    ).toBeGreaterThan(0);
  });
});
