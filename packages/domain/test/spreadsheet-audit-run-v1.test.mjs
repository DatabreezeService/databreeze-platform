import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSpreadsheetAuditRunAdmissionRequestV1,
  createSpreadsheetAuditRunV1,
  toSpreadsheetAuditRunHandleV1,
} from '../dist/spreadsheet-audit-run/v1.js';

const ids = {
  runId: '00000000-0000-4000-8000-000000000001',
  jobId: '00000000-0000-4000-8000-000000000002',
  artifactVersionId: '00000000-0000-4000-8000-000000000003',
  organizationId: '00000000-0000-4000-8000-000000000004',
  workspaceId: '00000000-0000-4000-8000-000000000005',
};

const scope = {
  scopeType: 'workspace',
  organizationId: ids.organizationId,
  workspaceId: ids.workspaceId,
};

test('[SA-001] run admission accepts only an artifact version and processor version', () => {
  const request = createSpreadsheetAuditRunAdmissionRequestV1({
    artifactVersionId: ids.artifactVersionId,
    processorVersion: 'spreadsheet-auditor-0.1.0',
  });
  assert.deepEqual(request, {
    accepted: true,
    value: {
      artifactVersionId: ids.artifactVersionId,
      processorVersion: 'spreadsheet-auditor-0.1.0',
    },
  });
  assert.equal(
    createSpreadsheetAuditRunAdmissionRequestV1({
      artifactVersionId: ids.artifactVersionId,
      processorVersion: '   ',
    }).accepted,
    false,
  );
  assert.equal(
    createSpreadsheetAuditRunAdmissionRequestV1({
      artifactVersionId: '/Users/alice/orders.xlsx',
      processorVersion: 'spreadsheet-auditor-0.1.0',
    }).accepted,
    false,
  );
});

test('[SA-001] run records are immutable, content-free, and expose a safe handle', () => {
  const created = createSpreadsheetAuditRunV1({
    ...ids,
    tenantScope: scope,
    processorVersion: 'spreadsheet-auditor-0.1.0',
    idempotencyKey: 'sa-run-1',
    createdAt: '2026-08-04T00:00:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(toSpreadsheetAuditRunHandleV1(created.value), {
    schemaVersion: 1,
    runId: ids.runId,
    jobId: ids.jobId,
    artifactVersionId: ids.artifactVersionId,
    processorVersion: 'spreadsheet-auditor-0.1.0',
    state: 'ADMITTED',
    createdAt: '2026-08-04T00:00:00.000Z',
  });
  const handle = toSpreadsheetAuditRunHandleV1(created.value);
  assert.equal(Object.hasOwn(handle, 'tenantScope'), false);
  assert.equal(Object.hasOwn(handle, 'idempotencyKey'), false);
  assert.equal(
    createSpreadsheetAuditRunV1({
      ...ids,
      tenantScope: scope,
      processorVersion: 'spreadsheet-auditor-0.1.0',
      idempotencyKey: 'sa-run-1\nleak',
      createdAt: '2026-08-04T00:00:00.000Z',
    }).accepted,
    false,
  );
});
