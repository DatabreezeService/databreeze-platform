import { describe, expect, it, vi } from 'vitest';
import {
  createFolderAutopilotProfile,
  decideFolderAutopilotApproval,
  getFolderAutopilotDashboard,
  pauseFolderAutopilotAssignment,
  requestFolderAutopilotUndo,
} from '../src/features/folder-autopilot/folder-autopilot-api.ts';

const ids = {
  profile: '00000000-0000-4000-8000-000000000001',
  assignment: '00000000-0000-4000-8000-000000000002',
  recipe: '00000000-0000-4000-8000-000000000003',
  device: '00000000-0000-4000-8000-000000000004',
  inputBinding: '00000000-0000-4000-8000-000000000005',
  outputBinding: '00000000-0000-4000-8000-000000000006',
  preview: '00000000-0000-4000-8000-000000000007',
  artifact: '00000000-0000-4000-8000-000000000008',
  approval: '00000000-0000-4000-8000-000000000009',
  execution: '00000000-0000-4000-8000-00000000000a',
  job: '00000000-0000-4000-8000-00000000000b',
  manifest: '00000000-0000-4000-8000-00000000000c',
  exception: '00000000-0000-4000-8000-00000000000d',
};

const dashboard = {
  schemaVersion: 1,
  profiles: [
    {
      profileId: ids.profile,
      displayName: 'Hóa đơn đầu vào',
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
      assignmentId: ids.assignment,
      profileId: ids.profile,
      displayName: 'Kho chứng từ',
      jraRecipeVersionId: ids.recipe,
      deviceId: ids.device,
      inputBindingId: ids.inputBinding,
      outputBindingId: ids.outputBinding,
      state: 'ACTIVE',
      approvalRequired: true,
      revision: 3,
      updatedAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  previews: [
    {
      previewId: ids.preview,
      assignmentId: ids.assignment,
      jraRecipeVersionId: ids.recipe,
      planHash: 'b'.repeat(64),
      status: 'NEEDS_APPROVAL',
      affectedCount: 2,
      blockedCount: 1,
      actions: [
        {
          stepId: 'step-1',
          actionType: 'MOVE',
          sourceArtifactVersionId: ids.artifact,
          destinationBindingId: ids.outputBinding,
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
      approvalId: ids.approval,
      previewId: ids.preview,
      planHash: 'b'.repeat(64),
      decision: 'PENDING',
      expiresAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  executions: [
    {
      executionId: ids.execution,
      assignmentId: ids.assignment,
      jraJobId: ids.job,
      resultManifestId: ids.manifest,
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
      exceptionId: ids.exception,
      assignmentId: ids.assignment,
      executionId: ids.execution,
      severity: 'WARNING',
      reasonCode: 'DESTINATION_COLLISION',
      status: 'OPEN',
      createdAt: '2026-08-04T00:00:00.000Z',
    },
  ],
  health: [
    {
      assignmentId: ids.assignment,
      watcherState: 'HEALTHY',
      lastHeartbeatAt: '2026-08-04T00:00:00.000Z',
      queueAgeSeconds: 2,
      queuedCount: 1,
      syncLagSeconds: 0,
    },
  ],
};

describe('Folder Autopilot API boundary', () => {
  it('parses content-free dashboard projections and rejects source fields', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(dashboard))));

    const parsed = await getFolderAutopilotDashboard();
    expect(parsed.assignments[0]?.assignmentId).toBe(ids.assignment);
    expect(parsed.previews[0]?.actions[0]?.sourceArtifactVersionId).toBe(ids.artifact);
    expect(JSON.stringify(parsed)).not.toMatch(/sourcePath|rawBytes|localHandle/iu);

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...dashboard, sourcePath: 'C:\\private\\invoices' })),
        ),
    );
    await expect(getFolderAutopilotDashboard()).rejects.toThrow('AUTOPILOT_RESPONSE_INVALID');
  });

  it('sends only bounded identifiers and policy values for mutations', async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ accepted: true, value: dashboard.assignments[0] }), {
          status: 200,
        }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await createFolderAutopilotProfile({
      displayName: 'New profile',
      stabilizationSeconds: 10,
      collisionPolicy: 'REVIEW',
      confidenceThreshold: 0.9,
      undoWindowHours: 24,
      approvalRequired: true,
      dataModeConstraint: 'Hybrid',
    });
    await pauseFolderAutopilotAssignment(ids.assignment, 3);
    await decideFolderAutopilotApproval(ids.approval, 'APPROVED', 'b'.repeat(64));
    await requestFolderAutopilotUndo(ids.execution);

    for (const [, request] of fetchMock.mock.calls) {
      const init = request as RequestInit;
      const body = String(init.body ?? '');
      expect(body).not.toMatch(/path|bytes|formula|sourceValue|localHandle/iu);
    }
  });
});
