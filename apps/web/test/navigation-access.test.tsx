import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter, filterNavigationItems } from '../src/app/app.tsx';
import { UDW_PRIMARY_NAV_ITEMS_V1 } from '../src/app/unified-primary-navigation.ts';

const restrictedAccess = {
  entitlements: ['automation'] as const,
  permissions: [PERMISSIONS_V1.JOB_EXECUTION_READ] as const,
};

describe('build-time governed navigation', () => {
  it('keeps legacy filterNavigationItems for entitlement hints', () => {
    const keys = filterNavigationItems(restrictedAccess).map((item) => item.key);

    expect(keys).toContain('workspace');
    expect(keys).toContain('jobs');
    expect(keys).not.toContain('devices');
    expect(keys).not.toContain('administration');
    expect(keys).not.toContain('usage');
    expect(keys).not.toContain('audit');
  });

  it('renders the unified three-item primary rail', async () => {
    const router = createAppRouter({
      accessContext: restrictedAccess,
      initialEntries: ['/en/dashboards'],
    });
    render(<ApplicationBoundary router={router} />);

    const navigation = await screen.findByRole('navigation', { name: 'Primary navigation' });
    expect(navigation.classList.contains('application-rail')).toBe(true);
    expect(screen.getByRole('link', { name: 'Dashboards' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Analysis' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Data' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Jobs' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Devices' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
    expect(UDW_PRIMARY_NAV_ITEMS_V1).toHaveLength(3);
  });

  it('keeps the standalone brand mark available when the rail is compact', async () => {
    const originalMatchMedia = globalThis.matchMedia;
    globalThis.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: query === '(min-width: 768px) and (max-width: 1023px)',
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    }));

    try {
      const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
      render(<ApplicationBoundary router={router} />);

      const navigation = await screen.findByRole('navigation', { name: 'Primary navigation' });
      expect(navigation.getAttribute('data-collapsed')).toBe('true');
      expect(navigation.querySelector('.application-rail__brand-wordmark')).toBeNull();
      expect(navigation.querySelector('.application-rail__brand-icon')).toBeTruthy();
      expect(
        navigation.querySelector('.application-rail__brand-icon')?.getAttribute('src'),
      ).toContain('databreeze-mark');
    } finally {
      globalThis.matchMedia = originalMatchMedia;
    }
  });

  it('presents the dashboard breadcrumb as semantic content instead of inert controls', async () => {
    const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('navigation', { name: 'Dashboard breadcrumb' })).toBeTruthy();
    expect(screen.getByText('Bright Cloud')).toBeTruthy();
    expect(screen.getByText('Business overview')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bright Cloud/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Business overview/u })).toBeNull();
  });
});
