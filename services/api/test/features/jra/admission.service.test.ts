import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryAdmissionRepositoryAdapter } from '../../../src/features/jra/adapter/in-memory-admission-repository.adapter.js';
import type { ExecutionRequestDescriptorVerifierPortV1 } from '../../../src/features/jra/application/execution-request-descriptor.js';
import { JraAdmissionService } from '../../../src/features/jra/application/admission.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const jobId = '00000000-0000-4000-8000-000000000003';
const dispatchId = '00000000-0000-4000-8000-000000000004';
const actorId = '00000000-0000-4000-8000-000000000005';
const correlationId = '00000000-0000-4000-8000-000000000006';
const descriptorId = '00000000-0000-4000-8000-000000000007';
const stepId = '00000000-0000-4000-8000-000000000008';
const settlementBindingId = '00000000-0000-4000-8000-000000000009';

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
  descriptorId: stable(descriptorId),
  stepId: stable(stepId),
  settlementBindingId: stable(settlementBindingId),
};

const acceptingVerifier: ExecutionRequestDescriptorVerifierPortV1 = {
  verify: () => Promise.resolve(true),
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
  const action = {
    actionType: 'spreadsheet.audit',
    version: 1,
    inputSchemaId: 'schema.input.v1',
    outputSchemaId: 'schema.output.v1',
    handlerDigest: 'a'.repeat(64),
    requiredCapabilities: ['artifact.read'],
    sideEffectClass: 'NONE' as const,
    riskClass: 'READ_ONLY' as const,
    defaultTimeoutSeconds: 60,
    maxAttempts: 3,
    approvalClass: 'NONE' as const,
  };
  const tenantScope = {
    scopeType: 'workspace' as const,
    organizationId: ids.organizationId,
    workspaceId: ids.workspaceId,
  };
  return {
    job: {
      jobId: ids.jobId,
      tenantScope,
      requestedBy: ids.actorId,
      inputManifestHash: 'b'.repeat(64),
      idempotencyKey: 'job-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      action,
    },
    executionRequest: {
      schemaVersion: 1 as const,
      descriptorId: ids.descriptorId,
      resultUsageSettlementBindingId: ids.settlementBindingId,
      tenantScope,
      jobId: ids.jobId,
      stepId: ids.stepId,
      action: {
        type: action.actionType,
        version: action.version,
        inputSchemaId: action.inputSchemaId,
        outputSchemaId: action.outputSchemaId,
        handlerDigest: action.handlerDigest,
        requiredCapabilities: action.requiredCapabilities,
        sideEffectClass: action.sideEffectClass,
        riskClass: action.riskClass,
      },
      inputObjectIds: ['artifact-version:source-1'],
      inputManifestHash: 'b'.repeat(64),
      parameters: { sheet: 'Chi phí', includeHidden: false } as Record<string, unknown>,
      outputPolicy: {
        outputObjectId: 'artifact-version:result-1',
        maxBytes: 5_000_000,
        mediaType: 'application/json',
      },
      deadline: '2026-01-01T00:01:00.000Z',
      locale: 'vi-VN' as const,
      createdAt: '2026-01-01T00:00:00.000Z',
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
  const service = new JraAdmissionService(
    new InMemoryAdmissionRepositoryAdapter(),
    acceptingVerifier,
  );
  const admitted = await service.admit(context('admit'), input());
  assert.equal(admitted.accepted, true);
  if (!admitted.accepted) return;
  assert.equal(admitted.value.job.state, 'CREATED');
  assert.equal(admitted.value.dispatch.eventType, 'JOB_READY');
  assert.equal(admitted.value.executionRequest.canonicalHash.length, 64);
  assert.equal(admitted.value.executionRequest.jobId, admitted.value.job.jobId);
  assert.equal(
    admitted.value.executionRequest.resultUsageSettlementBindingId,
    ids.settlementBindingId,
  );
  assert.deepEqual(await service.admit(context('replay'), input()), admitted);
});

void test('[JRA-002] mismatched dispatch input is rejected before either record is persisted', async () => {
  const service = new JraAdmissionService(
    new InMemoryAdmissionRepositoryAdapter(),
    acceptingVerifier,
  );
  const invalid = input();
  invalid.dispatch.jobId = stable('00000000-0000-4000-8000-000000000007');
  assert.deepEqual(await service.admit(context('mismatch'), invalid), {
    accepted: false,
    code: 'INVALID_IDENTIFIER',
  });
  assert.equal((await service.admit(context('retry'), input())).accepted, true);
});

void test('[JRA-002/JRA-004/JRA-005] admission rejects descriptor drift and unverified inputs before persistence', async () => {
  let verifyCalls = 0;
  const verifier: ExecutionRequestDescriptorVerifierPortV1 = {
    verify: () => {
      verifyCalls += 1;
      return Promise.resolve(false);
    },
  };
  const service = new JraAdmissionService(new InMemoryAdmissionRepositoryAdapter(), verifier);
  assert.deepEqual(await service.admit(context('unverified'), input()), {
    accepted: false,
    code: 'JRA_EXECUTION_REQUEST_UNVERIFIED',
  });
  assert.equal(verifyCalls, 1);

  const drifted = input();
  drifted.executionRequest.action.handlerDigest = 'd'.repeat(64);
  assert.deepEqual(await service.admit(context('drift'), drifted), {
    accepted: false,
    code: 'JRA_EXECUTION_REQUEST_ACTION_MISMATCH',
  });
  assert.equal(verifyCalls, 1);

  assert.equal(
    (
      await new JraAdmissionService(
        new InMemoryAdmissionRepositoryAdapter(),
        acceptingVerifier,
      ).admit(context('clean'), input())
    ).accepted,
    true,
  );
});

void test('[JRA-005/JRA-023] descriptors reject secrets, database URLs, paths, commands, and inline bytes', async () => {
  const service = new JraAdmissionService(
    new InMemoryAdmissionRepositoryAdapter(),
    acceptingVerifier,
  );
  for (const parameters of [
    { apiKey: 'sk-should-never-be-dispatched' },
    { source: 'postgresql://user:password@database/workspace' },
    { command: 'powershell.exe -Command whoami' },
    { filePath: 'C:\\customers\\tenant-a\\input.xlsx' },
  ]) {
    const candidate = input();
    candidate.executionRequest.parameters = parameters;
    const result = await service.admit(context('unsafe'), candidate);
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.code, 'JRA_EXECUTION_REQUEST_INVALID');
  }
});
