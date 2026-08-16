import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import {
  clearAuthSessionV1,
  initializeWebAuthenticationStateV1,
} from '../src/features/auth/auth-session.ts';

afterEach(clearAuthSessionV1);

describe('live authentication routing [IAM-023, WEB-002, WEB-004]', () => {
  it('shows the teammate landing page for signed-out visitors at / and /vi-VN [WEB-013]', async () => {
    for (const initialEntry of ['/', '/vi-VN']) {
      const router = createAppRouter({
        authenticationState: 'signed-out',
        initialEntries: [initialEntry],
      });

      const view = render(<ApplicationBoundary router={router} />);

      await waitFor(() => expect(router.state.location.pathname).toBe('/vi-VN'));
      expect(await screen.findByRole('heading', { name: /Dữ liệu biết cất lời/u })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Đăng nhập' })).toBeNull();
      expect(screen.getByRole('link', { name: 'Đăng nhập' }).getAttribute('href')).toBe(
        '/vi-VN/sign-in',
      );
      expect(document.querySelector('header.workspace-topbar')).toBeNull();

      view.unmount();
    }
  });

  it('redirects a signed-out in-app navigation to the localized sign-in route', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/en/data'],
    });

    render(<ApplicationBoundary router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe('/en/sign-in'));
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeTruthy();
  });

  it('renders public authentication routes without the protected workspace shell', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/vi-VN/register'],
    });

    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Tạo tài khoản' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).toBeNull();
  });

  it('renders localized password recovery routes without the protected workspace shell', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/en/forgot-password'],
    });

    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Forgot your password?' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Primary navigation' })).toBeNull();
  });

  it('keeps signed-in users out of public authentication routes', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-in',
      initialEntries: ['/en/sign-in'],
    });

    render(<ApplicationBoundary router={router} />);

    await waitFor(() => expect(router.state.location.pathname).toBe('/en/data'));
    expect(await screen.findByRole('navigation', { name: 'Primary navigation' })).toBeTruthy();
  });

  it('reacts to session establishment and revocation without a stale router snapshot', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/en/sign-in'],
    });
    render(<ApplicationBoundary router={router} />);

    act(() => initializeWebAuthenticationStateV1('signed-in'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/en/data'));

    act(() => clearAuthSessionV1());
    await waitFor(() => expect(router.state.location.pathname).toBe('/en/sign-in'));
  });
});
