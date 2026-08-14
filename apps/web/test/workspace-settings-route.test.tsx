import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

describe('workspace settings route [WEB-019]', () => {
  it('renders the real settings surface and truthful API-unavailable state', async () => {
    const router = createAppRouter({ initialEntries: ['/en/administration'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Workspace settings' })).toBeTruthy();
    expect(screen.queryByText('This area is not available yet')).toBeNull();
    expect(await screen.findByText('Workspace settings could not load.')).toBeTruthy();
  });
});
