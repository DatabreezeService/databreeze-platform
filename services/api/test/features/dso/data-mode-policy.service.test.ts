import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryDataModePolicyRepositoryAdapter } from '../../../src/features/dso/adapter/in-memory-data-mode-policy-repository.adapter.js';
import { DataModePolicyService } from '../../../src/features/dso/application/data-mode-policy.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const siblingWorkspaceId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const policyId = '00000000-0000-4000-8000-000000000020';
const versionId = '00000000-0000-4000-8000-000000000021';
const childVersionId = '00000000-0000-4000-8000-000000000022';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

function context(scopeWorkspaceId: string, key: string) {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: scopeWorkspaceId },
    actorId,
    correlationId,
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function input(nextVersionId: string, mode: 'LOCAL' | 'HYBRID' | 'CLOUD') {
  return {
    policyId,
    policyVersionId: nextVersionId,
    organizationId,
    workspaceId,
    revision: nextVersionId === versionId ? 1 : 2,
    mode,
    allowedPayloadClasses: {
      PUBLIC: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
      INTERNAL: ['CONTROL_METADATA', 'APPROVED_DERIVED_RESULT'],
      CONFIDENTIAL: ['CONTROL_METADATA'],
      RESTRICTED: ['CONTROL_METADATA'],
    },
    allowedPlacementKinds: mode === 'LOCAL' ? ['LOCAL'] : ['LOCAL', 'CLOUD'],
    allowedExecutorClasses: mode === 'LOCAL' ? ['DESKTOP'] : ['DESKTOP', 'CLOUD'],
    allowedDestinationClasses: mode === 'LOCAL' ? ['DESKTOP'] : ['WEB', 'DESKTOP'],
    canonicalHash: 'b'.repeat(64),
    publishedAt: '2026-08-02T00:00:00.000Z',
  };
}

void test('[DSO-008, DSO-026, DSO-027] service publishes and enforces narrowing', async () => {
  const service = new DataModePolicyService(new InMemoryDataModePolicyRepositoryAdapter());
  const parent = await service.publish(
    context(workspaceId, 'policy-parent'),
    input(versionId, 'HYBRID'),
  );
  assert.equal(parent.accepted, true);
  if (!parent.accepted) return;
  const child = await service.publish(
    context(workspaceId, 'policy-child'),
    input(childVersionId, 'LOCAL'),
    stable(versionId),
  );
  assert.equal(child.accepted, true);
  assert.equal(
    (await service.list(context(workspaceId, 'policy-list'), stable(policyId))).length,
    2,
  );
  const broader = await service.publish(
    context(workspaceId, 'policy-broader'),
    input('00000000-0000-4000-8000-000000000023', 'CLOUD'),
    stable(versionId),
  );
  assert.deepEqual(broader, { accepted: false, code: 'POLICY_BROADENS_PARENT' });
});

void test('[IAM-009, DSO-026] a policy cannot be published for a different workspace', async () => {
  const service = new DataModePolicyService(new InMemoryDataModePolicyRepositoryAdapter());
  const result = await service.publish(
    context(siblingWorkspaceId, 'policy-scope'),
    input(versionId, 'HYBRID'),
  );
  assert.deepEqual(result, { accepted: false, code: 'INVALID_IDENTIFIER' });
});

void test('[DSO-026] policy persistence conflicts return stable application errors', async () => {
  const service = new DataModePolicyService(new InMemoryDataModePolicyRepositoryAdapter());
  assert.equal(
    (await service.publish(context(workspaceId, 'policy-immutable-1'), input(versionId, 'HYBRID')))
      .accepted,
    true,
  );
  assert.deepEqual(
    await service.publish(context(workspaceId, 'policy-immutable-2'), {
      ...input(versionId, 'LOCAL'),
    }),
    { accepted: false, code: 'IMMUTABLE_POLICY' },
  );
});
