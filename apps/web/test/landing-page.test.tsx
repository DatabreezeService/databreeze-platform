import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

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
});
