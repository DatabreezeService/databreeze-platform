import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApplicationBoundary, createAppRouter, filterNavigationItems } from '../src/app/app.tsx';

const restrictedAccess = {
  entitlements: ['automation'] as const,
  permissions: [PERMISSIONS_V1.JOB_EXECUTION_READ] as const,
};

describe('build-time governed navigation', () => {
  it('filters navigation using permission and entitlement hints while retaining safe routes', () => {
    const keys = filterNavigationItems(restrictedAccess).map((item) => item.key);

    expect(keys).toContain('workspace');
    expect(keys).toContain('jobs');
    expect(keys).not.toContain('devices');
    expect(keys).not.toContain('administration');
    expect(keys).not.toContain('usage');
    expect(keys).not.toContain('audit');
  });

  it('renders restricted navigation without claiming client hints are authorization', async () => {
    const router = createAppRouter({
      accessContext: restrictedAccess,
      initialEntries: ['/en/workspace'],
    });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('link', { name: 'Jobs' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Devices' })).toBeNull();
    expect(
      screen.getByText('Server authorization is still required for every action.'),
    ).toBeTruthy();
  });
});
