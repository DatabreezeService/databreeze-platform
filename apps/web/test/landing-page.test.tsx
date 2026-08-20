import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';
import { LandingPage, LandingRoutePage } from '../src/features/landing/landing-page.tsx';

describe('landing page stylesheet [WEB-013]', () => {
  it('declares the teammate stylesheet in the first render with React precedence', () => {
    render(<LandingPage locale="vi-VN" />);

    const stylesheet = document.querySelector('link[href="/landing/styles.css"]');
    expect(stylesheet).not.toBeNull();
    expect(stylesheet?.getAttribute('rel')).toBe('stylesheet');
  });

  it('keeps the locale landing route on the same first-render stylesheet', () => {
    render(
      <MemoryRouter initialEntries={['/vi-VN']}>
        <Routes>
          <Route path="/:locale" element={<LandingRoutePage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      document.querySelector('link[href="/landing/styles.css"][rel="stylesheet"]'),
    ).not.toBeNull();
  });

  it('links the Vietnamese landing navigation to the public downloads page', () => {
    render(<LandingPage locale="vi-VN" />);

    expect(screen.getByRole('link', { name: 'Ứng dụng' }).getAttribute('href')).toBe(
      '/vi-VN/downloads',
    );
  });

  it('uses the English downloads label on the English landing route', () => {
    render(<LandingPage locale="en" />);

    expect(screen.getByRole('link', { name: 'Apps' }).getAttribute('href')).toBe('/en/downloads');
  });

  it('switches pricing cards to annual billing when selected', async () => {
    const user = userEvent.setup();
    render(<LandingPage locale="vi-VN" />);

    await user.click(screen.getByRole('button', { name: /Theo năm/u }));

    expect(screen.getByText('1.490.000 ₫')).toBeTruthy();
    expect(screen.getByText('3.990.000 ₫')).toBeTruthy();
    expect(screen.getByText('9.990.000 ₫')).toBeTruthy();
    expect(screen.getAllByText('/năm')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /Theo năm/u }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('link', { name: /Bắt đầu với Cá nhân/u }).getAttribute('href')).toBe(
      '/vi-VN/billing?planId=personal-annual',
    );
  });

  it('restores an inbound hash destination after the landing markup mounts', async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const destinations: string[] = [];
    HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
      destinations.push(this.id);
    };

    try {
      render(
        <MemoryRouter initialEntries={['/vi-VN#pricing']}>
          <Routes>
            <Route path="/:locale" element={<LandingRoutePage />} />
          </Routes>
        </MemoryRouter>,
      );

      await waitFor(() => expect(destinations).toContain('pricing'));
    } finally {
      HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it.each(['flow', 'intelligence', 'modes'] as const)(
    'reveals the %s section when opened from a navbar hash',
    async (destinationId) => {
      const view = render(
        <MemoryRouter initialEntries={[`/vi-VN#${destinationId}`]}>
          <Routes>
            <Route path="/:locale" element={<LandingRoutePage />} />
          </Routes>
        </MemoryRouter>,
      );

      try {
        await waitFor(() => {
          const destination = document.getElementById(destinationId);
          expect(destination).not.toBeNull();
          expect(
            Array.from(destination?.querySelectorAll<HTMLElement>('[data-reveal]') ?? []).every(
              (item) => item.classList.contains('is-visible'),
            ),
          ).toBe(true);
        });
      } finally {
        view.unmount();
      }
    },
  );

  it('preserves previously revealed sections across consecutive navbar hash navigation', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/vi-VN'],
    });

    render(<ApplicationBoundary router={router} />);
    await screen.findByRole('heading', { name: /DataBreeze Dữ liệu biết cất lời\./u });

    await router.navigate('/vi-VN#flow');
    const flowHeading = await waitFor(() => {
      const heading = document.querySelector<HTMLElement>('#flow [data-reveal]');
      expect(heading?.classList.contains('is-visible')).toBe(true);
      return heading;
    });

    await router.navigate('/vi-VN#intelligence');
    await waitFor(() => {
      expect(
        document
          .querySelector<HTMLElement>('#intelligence [data-reveal]')
          ?.classList.contains('is-visible'),
      ).toBe(true);
    });

    const preservedFlowHeading = document.querySelector<HTMLElement>('#flow [data-reveal]');
    expect(preservedFlowHeading).toBe(flowHeading);
    expect(preservedFlowHeading?.classList.contains('is-visible')).toBe(true);
  });

  it('removes the landing stylesheet when navbar routing leaves the page', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/vi-VN'],
    });

    render(<ApplicationBoundary router={router} />);

    await screen.findByRole('heading', { name: /DataBreeze Dữ liệu biết cất lời\./u });
    expect(document.querySelector('link[data-teammate-landing-stylesheet]')).not.toBeNull();
    await router.navigate('/vi-VN/downloads');

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'DataBreeze trên mọi thiết bị.' })).toBeTruthy();
      expect(document.querySelector('link[data-teammate-landing-stylesheet]')).toBeNull();
    });
  });

  it('keeps the landing stylesheet mounted under React strict mode', async () => {
    const router = createAppRouter({
      authenticationState: 'signed-out',
      initialEntries: ['/vi-VN'],
    });

    render(
      <StrictMode>
        <ApplicationBoundary router={router} />
      </StrictMode>,
    );

    await screen.findByRole('heading', { name: /DataBreeze Dữ liệu biết cất lời\./u });
    expect(document.querySelector('link[data-teammate-landing-stylesheet]')).not.toBeNull();
  });
});
