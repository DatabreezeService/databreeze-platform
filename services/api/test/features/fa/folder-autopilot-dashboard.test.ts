import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFolderAutopilotDashboardProjection } from '../../../src/features/fa/api/folder-autopilot-dashboard.js';
import {
  createFolderAutopilotProfileV1,
  createRecipeAssignmentV1,
} from '@databreeze/domain/folder-autopilot/v1';

const scope = {
  scopeType: 'workspace' as const,
  organizationId: '11111111-1111-4111-8111-111111111111',
  workspaceId: '22222222-2222-4222-8222-222222222222',
};

const createdAt = '2026-08-04T00:00:00.000Z';

function profile() {
  const result = createFolderAutopilotProfileV1({
    profileId: '33333333-3333-4333-8333-333333333333',
    tenantScope: scope,
    version: 2,
    payloadHash: 'a'.repeat(64),
    stabilizationDelayMs: 10_000,
    maxFilesPerScan: 100,
    collisionPolicy: 'REVIEW',
    undoWindowSeconds: 86_400,
    outputLineageEnabled: true,
    createdAt,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid profile fixture');
  return result.value;
}

function assignment() {
  const result = createRecipeAssignmentV1({
    assignmentId: '44444444-4444-4444-8444-444444444444',
    tenantScope: scope,
    profileId: '33333333-3333-4333-8333-333333333333',
    profileVersion: 2,
    profileHash: 'a'.repeat(64),
    jraRecipeVersionId: '55555555-5555-4555-8555-555555555555',
    jraRecipeVersionHash: 'b'.repeat(64),
    deviceId: '66666666-6666-4666-8666-666666666666',
    inputBindingIds: ['77777777-7777-4777-8777-777777777777'],
    outputBindingIds: ['88888888-8888-4888-8888-888888888888'],
    idempotencyKey: 'dashboard-fixture',
    createdAt,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid assignment fixture');
  return result.value;
}

void test('[FA-033] dashboard maps immutable records to a content-free projection', () => {
  const dashboard = buildFolderAutopilotDashboardProjection([profile()], [assignment()]);
  assert.equal(dashboard.schemaVersion, 1);
  assert.equal(dashboard.profiles[0]?.stabilizationSeconds, 10);
  assert.equal(dashboard.profiles[0]?.undoWindowHours, 24);
  assert.equal(dashboard.assignments[0]?.displayName, 'Assignment 44444444');
  assert.equal('tenantScope' in dashboard.profiles[0]!, false);
  assert.equal('deviceGrantId' in dashboard.assignments[0]!, false);
  assert.doesNotMatch(JSON.stringify(dashboard), /path|handle|bytes|localHandle/iu);
});
