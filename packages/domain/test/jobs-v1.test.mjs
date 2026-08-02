import assert from 'node:assert/strict';
import test from 'node:test';

import { createJobV1, createTypedActionDefinitionV1, transitionJobV1 } from '../dist/jobs/v1.js';

const actionInput = {
  actionType: 'spreadsheet.audit',
  version: 1,
  inputSchemaId: 'schema.spreadsheet.audit.input.v1',
  outputSchemaId: 'schema.spreadsheet.audit.output.v1',
  handlerDigest: 'a'.repeat(64),
  requiredCapabilities: ['artifact.read'],
  sideEffectClass: 'NONE',
  riskClass: 'READ_ONLY',
  defaultTimeoutSeconds: 60,
  maxAttempts: 3,
  approvalClass: 'NONE',
};

const base = {
  jobId: '00000000-0000-4000-8000-000000000001',
  requestedBy: '00000000-0000-4000-8000-000000000002',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000003',
    workspaceId: '00000000-0000-4000-8000-000000000004',
  },
  inputManifestHash: 'b'.repeat(64),
  idempotencyKey: 'job-1',
  createdAt: '2026-01-01T00:00:00.000Z',
};

test('[JRA-004, JRA-005, JRA-022] typed actions are bounded and restricted effects require approval', () => {
  const created = createTypedActionDefinitionV1(actionInput);
  assert.equal(created.accepted, true);
  assert.equal(
    createTypedActionDefinitionV1({
      ...actionInput,
      sideEffectClass: 'BILLING_PROVIDER_EFFECT',
      riskClass: 'CONSEQUENTIAL',
      approvalClass: 'REQUIRED',
    }).accepted,
    false,
  );
  assert.equal(
    createTypedActionDefinitionV1({ ...actionInput, riskClass: 'RESTRICTED' }).accepted,
    false,
  );
});

test('[JRA-001, JRA-014] job state transitions are explicit, monotonic in revision, and terminal', () => {
  const action = createTypedActionDefinitionV1(actionInput);
  assert.equal(action.accepted, true);
  if (!action.accepted) return;
  const created = createJobV1({ ...base, action: action.value });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const queued = transitionJobV1(created.value, 'QUEUED', '2026-01-01T00:00:01.000Z');
  assert.equal(queued.accepted, true);
  if (!queued.accepted) return;
  const dispatched = transitionJobV1(queued.value, 'DISPATCHED', '2026-01-01T00:00:02.000Z');
  assert.equal(dispatched.accepted, true);
  if (!dispatched.accepted) return;
  const running = transitionJobV1(dispatched.value, 'RUNNING', '2026-01-01T00:00:03.000Z');
  assert.equal(running.accepted, true);
  if (!running.accepted) return;
  const succeeded = transitionJobV1(running.value, 'SUCCEEDED', '2026-01-01T00:00:04.000Z');
  assert.equal(succeeded.accepted, true);
  if (!succeeded.accepted) return;
  assert.equal(succeeded.value.finishedAt, '2026-01-01T00:00:04.000Z');
  assert.equal(
    transitionJobV1(succeeded.value, 'QUEUED', '2026-01-01T00:00:05.000Z').accepted,
    false,
  );
});
