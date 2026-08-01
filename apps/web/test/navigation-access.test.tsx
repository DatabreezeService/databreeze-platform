import { PERMISSIONS_V1 } from '@databreeze/domain/permissions/v1';
import userEvent from '@testing-library/user-event';
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

  it('requires both create permission and the automation entitlement to create a job', async () => {
    const router = createAppRouter({
      accessContext: {
        entitlements: [],
        permissions: [PERMISSIONS_V1.JOB_EXECUTION_CREATE, PERMISSIONS_V1.JOB_EXECUTION_READ],
      },
      initialEntries: ['/en/workspace'],
    });
    render(<ApplicationBoundary router={router} />);

    const createButton = await screen.findByRole('button', { name: 'Create job' });
    expect(createButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('You can view this work but cannot create a new job.')).toBeTruthy();
  });

  it('navigates an enabled create action to the intentional jobs placeholder', async () => {
    const user = userEvent.setup();
    const router = createAppRouter({ initialEntries: ['/en/workspace'] });
    render(<ApplicationBoundary router={router} />);

    await user.click(await screen.findByRole('button', { name: 'Create job' }));

    expect(router.state.location.pathname).toBe('/en/jobs');
    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeTruthy();
  });

  it('presents placeholder context as semantic content instead of inert controls', async () => {
    const router = createAppRouter({ initialEntries: ['/en/workspace'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByText('Bright Cloud Organization')).toBeTruthy();
    expect(screen.getByText('Governed Workspace')).toBeTruthy();
    expect(screen.getByText('Operations Project')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Bright Cloud Organization/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Governed Workspace/u })).toBeNull();
    expect(screen.queryByRole('button', { name: /Operations Project/u })).toBeNull();
  });
});
