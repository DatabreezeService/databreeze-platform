import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { WorkerBoundary } from '../../../../src/features/jra/worker/worker-boundary.js';
import { workerAttemptDescriptorBindingHashV1 } from '../../../../src/features/jra/worker/execution-descriptor-binding.js';
import type { WorkerBoundaryDependenciesV1 } from '../../../../src/features/jra/worker/worker-boundary.js';
import type { WorkerIdentityV1 } from '../../../../src/features/jra/worker/worker-ports.js';

interface WorkerAssignmentV1 {
  readonly attemptId: string;
  readonly descriptorId: string;
  readonly descriptorHash: string;
  readonly attemptBindingHash: string;
}

function id(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('test identifier invalid');
  return parsed.value;
}

const tenantScope: TenantScopeV1 = Object.freeze({
  scopeType: 'workspace',
  organizationId: id('11111111-1111-4111-8111-111111111111'),
  workspaceId: id('22222222-2222-4222-8222-222222222222'),
});
const assignmentAttemptId = id('55555555-5555-4555-8555-555555555555');
const assignmentJobId = id('66666666-6666-4666-8666-666666666666');
const assignmentWorkerId = id('33333333-3333-4333-8333-333333333333');
const assignmentExpiry = '2026-08-13T08:01:00.000Z';
const assignmentDescriptorHash = 'a'.repeat(64);
const assignmentBindingHash = workerAttemptDescriptorBindingHashV1({
  descriptorHash: assignmentDescriptorHash,
  attemptId: assignmentAttemptId,
  jobId: assignmentJobId,
  workerId: assignmentWorkerId,
  securityEpoch: 7,
  leaseExpiresAt: assignmentExpiry,
});

void test('[JRA-001/JRA-007/JRA-013/JRA-023] assignment uses authenticated identity only', async () => {
  let receivedIdentity: unknown;
  const boundary = new WorkerBoundary({
    authenticator: {
      authenticate: () =>
        Promise.resolve({
          workerId: assignmentWorkerId,
          tenantScope,
          securityEpoch: 7,
          correlationId: id('44444444-4444-4444-8444-444444444444'),
        }),
    },
    assignment: {
      assign: (identity: WorkerIdentityV1) => {
        receivedIdentity = identity;
        return Promise.resolve(
          Object.freeze({
            attemptId: assignmentAttemptId,
            jobId: assignmentJobId,
            leaseToken: 'one-time-lease-token',
            leaseExpiresAt: assignmentExpiry,
            expectedRevision: 1,
            descriptorId: '77777777-7777-4777-8777-777777777777',
            descriptorHash: assignmentDescriptorHash,
            attemptBindingHash: assignmentBindingHash,
            action: Object.freeze({
              type: 'foundation.metadata-digest',
              version: 1,
              handlerDigest: `sha256:${'a'.repeat(64)}`,
              inputSchemaId: 'foundation.metadata-fixture.v1',
              outputSchemaId: 'foundation.metadata-digest-result.v1',
              requiredCapabilities: Object.freeze(['metadata.read']),
              sideEffectClass: 'NONE',
              riskClass: 'READ_ONLY',
            }),
          }),
        );
      },
    },
    attempts: {} as WorkerBoundaryDependenciesV1['attempts'],
    authority: {} as WorkerBoundaryDependenciesV1['authority'],
    grants: {} as WorkerBoundaryDependenciesV1['grants'],
    completion: {} as WorkerBoundaryDependenciesV1['completion'],
    now: () => '2026-08-13T08:00:00.000Z',
  } as unknown as WorkerBoundaryDependenciesV1);

  const response = await (
    boundary as unknown as { assignment(request: unknown): Promise<WorkerAssignmentV1 | undefined> }
  ).assignment({ body: { workspaceId: 'attacker-controlled' } });

  assert.equal(response?.attemptId, '55555555-5555-4555-8555-555555555555');
  assert.equal(response?.descriptorId, '77777777-7777-4777-8777-777777777777');
  assert.equal(response?.descriptorHash, assignmentDescriptorHash);
  assert.equal(response?.attemptBindingHash, assignmentBindingHash);
  assert.deepEqual(receivedIdentity, {
    workerId: assignmentWorkerId,
    tenantScope,
    securityEpoch: 7,
    correlationId: id('44444444-4444-4444-8444-444444444444'),
  });
});
