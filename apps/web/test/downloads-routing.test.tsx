import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { clearAuthSessionV1 } from '../src/features/auth/auth-session.ts';

afterEach(clearAuthSessionV1);

describe('public downloads routing [WEB-002, WEB-003]', () => {
  it('renders for signed-out users without mounting the protected shell', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/vi-VN/downloads'],
    });

    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'DataBreeze trên mọi thiết bị.' }),
    ).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Điều hướng chính' })).toBeTruthy();
  });

  it('keeps signed-in users on the public downloads route', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-in',
      initialEntries: ['/en/downloads'],
    });

    render(<ApplicationBoundary router={router} />);

    expect(
      await screen.findByRole('heading', { name: 'DataBreeze on every device.' }),
    ).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe('/en/downloads'));
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeTruthy();
  });

  it('canonicalizes the non-localized downloads path to the default Vietnamese route', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/downloads'],
    });

    render(<ApplicationBoundary router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe('/vi-VN/downloads'));
    expect(
      await screen.findByRole('heading', { name: 'DataBreeze trên mọi thiết bị.' }),
    ).toBeTruthy();
  });
});
