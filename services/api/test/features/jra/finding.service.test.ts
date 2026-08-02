import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryFindingRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-finding-repository.adapter.js';
import { FindingService } from '../../../src/features/jra/application/finding.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const findingId = '00000000-0000-4000-8000-000000000003';
const reviewTaskId = '00000000-0000-4000-8000-000000000004';
const evidenceId = '00000000-0000-4000-8000-000000000005';
const actorId = '00000000-0000-4000-8000-000000000006';
const correlationId = '00000000-0000-4000-8000-000000000007';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

const ids = {
  organizationId: stable(organizationId),
  workspaceId: stable(workspaceId),
  findingId: stable(findingId),
  reviewTaskId: stable(reviewTaskId),
  evidenceId: stable(evidenceId),
  actorId: stable(actorId),
  correlationId: stable(correlationId),
};

function context(key: string) {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    actorId: ids.actorId,
    correlationId: ids.correlationId,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function findingInput() {
  return {
    findingId: ids.findingId,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organizationId,
      workspaceId: ids.workspaceId,
    },
    sourceSubsystem: 'spreadsheet-auditor',
    findingType: 'formula-outlier',
    fingerprint: 'a'.repeat(64),
    diagnosticDetailRef: 'detail/0001',
    severity: 'HIGH',
    evidenceReferences: [ids.evidenceId],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[JRA-026, JRA-027] service creates, resolves, and reviews a finding with revisions', async () => {
  const service = new FindingService(new InMemoryFindingRepositoryAdapter());
  const created = await service.create(context('create'), findingInput());
  assert.equal(created.accepted, true);
  const task = await service.createReviewTask(context('task'), {
    reviewTaskId: ids.reviewTaskId,
    findingId: ids.findingId,
    tenantScope: findingInput().tenantScope,
    reason: 'Review repair plan',
    eligibleRole: 'ADMIN',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(task.accepted, true);
  if (!task.accepted) return;
  const claimed = await service.transitionReviewTask(
    context('claim'),
    ids.reviewTaskId,
    'CLAIMED',
    1,
  );
  assert.equal(claimed.accepted, true);
  const resolved = await service.resolve(
    context('resolve'),
    ids.findingId,
    'FIXED',
    '2026-01-01T00:01:00.000Z',
    'Validated derived output',
    1,
  );
  assert.equal(resolved.accepted, true);
});
