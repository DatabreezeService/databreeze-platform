import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAdmissionRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-admission-repository.adapter.js';
import { JraAdmissionService } from '../../../src/features/jra/application/admission.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const jobId = '00000000-0000-4000-8000-000000000003';
const dispatchId = '00000000-0000-4000-8000-000000000004';
const actorId = '00000000-0000-4000-8000-000000000005';
const correlationId = '00000000-0000-4000-8000-000000000006';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid identifier');
  return parsed.value;
}

const ids = {
  organizationId: stable(organizationId),
  workspaceId: stable(workspaceId),
  jobId: stable(jobId),
  dispatchId: stable(dispatchId),
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

function input() {
  return {
    job: {
      jobId: ids.jobId,
      tenantScope: {
        scopeType: 'workspace',
        organizationId: ids.organizationId,
        workspaceId: ids.workspaceId,
      },
      requestedBy: ids.actorId,
      inputManifestHash: 'b'.repeat(64),
      idempotencyKey: 'job-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      action: {
        actionType: 'spreadsheet.audit',
        version: 1,
        inputSchemaId: 'schema.input.v1',
        outputSchemaId: 'schema.output.v1',
        handlerDigest: 'a'.repeat(64),
        requiredCapabilities: ['artifact.read'],
        sideEffectClass: 'NONE',
        riskClass: 'READ_ONLY',
        defaultTimeoutSeconds: 60,
        maxAttempts: 3,
        approvalClass: 'NONE',
      },
    },
    dispatch: {
      dispatchId: ids.dispatchId,
      jobId: ids.jobId,
      tenantScope: {
        scopeType: 'workspace',
        organizationId: ids.organizationId,
        workspaceId: ids.workspaceId,
      },
      eventType: 'JOB_READY',
      payloadHash: 'c'.repeat(64),
      idempotencyKey: 'dispatch-1',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

void test('[JRA-001, JRA-002] admission commits one typed job and outbox record, then replays it', async () => {
  const service = new JraAdmissionService(new InMemoryAdmissionRepositoryAdapter());
  const admitted = await service.admit(context('admit'), input());
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  assert.equal(admitted.value.job.state, 'CREATED');
  assert.equal(admitted.value.dispatch.eventType, 'JOB_READY');
  assert.deepEqual(await service.admit(context('replay'), input()), admitted);
});

void test('[JRA-002] mismatched dispatch input is rejected before either record is persisted', async () => {
  const service = new JraAdmissionService(new InMemoryAdmissionRepositoryAdapter());
  const invalid = input();
  invalid.dispatch.jobId = stable('00000000-0000-4000-8000-000000000007');
  assert.deepEqual(await service.admit(context('mismatch'), invalid), {
    accepted: false,
    code: 'INVALID_IDENTIFIER',
  });
  assert.equal((await service.admit(context('retry'), input())).accepted, true);
});
