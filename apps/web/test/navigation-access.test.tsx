import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

    expect(await screen.findByRole('link', { name: 'Dashboards' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Analysis' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Data' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Jobs' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Devices' })).toBeNull();
    expect(UDW_PRIMARY_NAV_ITEMS_V1).toHaveLength(3);
  });

  it('presents placeholder context as semantic content instead of inert controls', async () => {
    const router = createAppRouter({ initialEntries: ['/en/dashboards'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByText('Bright Cloud Organization')).toBeTruthy();
    expect(screen.getByText('Governed Workspace')).toBeTruthy();
    expect(screen.getByText('Operations Project')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bright Cloud Organization/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Governed Workspace/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Operations Project/u })).toBeNull();
  });
});
