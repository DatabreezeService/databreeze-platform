import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApplicationBoundary, createAppRouter } from '../src/app/app.tsx';

const dashboard = {
  schemaVersion: 1,
  profiles: [
    {
      profileId: '00000000-0000-4000-8000-000000000001',
      displayName: 'Invoice intake',
      stabilizationSeconds: 10,
      collisionPolicy: 'REVIEW',
      confidenceThreshold: 0.9,
      undoWindowHours: 24,
      approvalRequired: true,
      dataModeConstraint: 'Hybrid',
      recipeHash: 'a'.repeat(64),
      updatedAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  assignments: [
    {
      assignmentId: '00000000-0000-4000-8000-000000000002',
      profileId: '00000000-0000-4000-8000-000000000001',
      displayName: 'Invoice intake assignment',
      jraRecipeVersionId: '00000000-0000-4000-8000-000000000003',
      deviceId: '00000000-0000-4000-8000-000000000004',
      inputBindingId: '00000000-0000-4000-8000-000000000005',
      outputBindingId: '00000000-0000-4000-8000-000000000006',
      state: 'ACTIVE',
      approvalRequired: true,
      revision: 3,
      updatedAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  previews: [
    {
      previewId: '00000000-0000-4000-8000-000000000007',
      assignmentId: '00000000-0000-4000-8000-000000000002',
      jraRecipeVersionId: '00000000-0000-4000-8000-000000000003',
      planHash: 'b'.repeat(64),
      status: 'NEEDS_APPROVAL',
      affectedCount: 2,
      blockedCount: 1,
      actions: [
        {
          stepId: 'step-1',
          actionType: 'MOVE',
          sourceArtifactVersionId: '00000000-0000-4000-8000-000000000008',
          destinationBindingId: '00000000-0000-4000-8000-000000000006',
          collision: 'REVIEW',
          requiresApproval: true,
        },
      ],
      reasonCodes: ['DESTINATION_COLLISION'],
      createdAt: '2026-08-04T00:00:00.000Z',
      expiresAt: '2026-08-05T00:00:00.000Z',
    },
  ],
  approvals: [
    {
      approvalId: '00000000-0000-4000-8000-000000000009',
      previewId: '00000000-0000-4000-8000-000000000007',
      planHash: 'b'.repeat(64),
      decision: 'PENDING',
      expiresAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  executions: [
    {
      executionId: '00000000-0000-4000-8000-00000000000a',
      assignmentId: '00000000-0000-4000-8000-000000000002',
      jraJobId: '00000000-0000-4000-8000-00000000000b',
      resultManifestId: '00000000-0000-4000-8000-00000000000c',
      outcome: 'UNDO_AVAILABLE',
      affectedCount: 2,
      handledCount: 2,
      exceptionCount: 0,
      reasonCodes: [],
      undoState: 'AVAILABLE',
      updatedAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  exceptions: [
    {
      exceptionId: '00000000-0000-4000-8000-00000000000d',
      assignmentId: '00000000-0000-4000-8000-000000000002',
      executionId: '00000000-0000-4000-8000-00000000000a',
      severity: 'WARNING',
      reasonCode: 'DESTINATION_COLLISION',
      status: 'OPEN',
      createdAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  health: [
    {
      assignmentId: '00000000-0000-4000-8000-000000000002',
      watcherState: 'HEALTHY',
      lastHeartbeatAt: '2026-08-04T00:00:00.000Z',
      queueAgeSeconds: 2,
      queuedCount: 1,
      syncLagSeconds: 0,
    },
  ],
};

describe('Folder Autopilot workspace surface', () => {
  it('renders authoring, preview, approval, exception, and undo projections without paths', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(dashboard), { status: 200 })),
      );
    vi.stubGlobal('fetch', fetchMock);
    const router = createAppRouter({ initialEntries: ['/en/autopilot'] });
    render(<ApplicationBoundary router={router} />);

    expect(await screen.findByRole('heading', { name: 'Folder Autopilot' })).toBeTruthy();
    const asyncQueryOptions = { timeout: 5_000 };
    expect(
      await screen.findByRole('heading', { name: 'Profiles' }, asyncQueryOptions),
    ).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Assignments' }, asyncQueryOptions),
    ).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Approval queue' }, asyncQueryOptions),
    ).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Exceptions' }, asyncQueryOptions),
    ).toBeTruthy();
    expect(
      await screen.findByRole('heading', { name: 'Recent outcomes' }, asyncQueryOptions),
    ).toBeTruthy();
    expect(
      await screen.findByText('Invoice intake assignment', {}, asyncQueryOptions),
    ).toBeTruthy();
    expect(screen.queryByText(/sourceArtifactVersionId|sourcePath|localHandle/iu)).toBeNull();
  });

  it('pauses an assignment and approves the exact preview plan through safe mutations', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/v1/autopilot-dashboard'))
        return Promise.resolve(new Response(JSON.stringify(dashboard), { status: 200 }));
      return Promise.resolve(
        new Response(JSON.stringify({ accepted: true, value: {} }), { status: 200 }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    const router = createAppRouter({ initialEntries: ['/en/autopilot'] });
    render(<ApplicationBoundary router={router} />);

    const asyncQueryOptions = { timeout: 5_000 };
    await user.click(
      await screen.findByRole('button', { name: 'Pause assignment' }, asyncQueryOptions),
    );
    expect(await screen.findByText('Paused', { selector: 'span' }, asyncQueryOptions)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Approve preview' }));
    expect(
      await screen.findByText('Approved', { selector: 'span' }, asyncQueryOptions),
    ).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const mutationBodies = fetchMock.mock.calls
      .slice(1)
      .map(([, init]) => String((init as RequestInit).body ?? ''))
      .join('\n');
    expect(mutationBodies).not.toMatch(/path|bytes|formula|sourceValue|localHandle/iu);
  }, 20_000);
});
