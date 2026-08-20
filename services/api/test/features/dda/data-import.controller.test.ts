import assert from 'node:assert/strict';
import test from 'node:test';

import { HttpException } from '@nestjs/common';

import { DataImportController } from '../../../src/features/dda/etl/api/data-import.controller.js';
import type {
  DataImportProblemCodeV1,
  DataImportServiceV1,
} from '../../../src/features/dda/etl/application/data-import.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const tenantContext = createIamTenantContextV1({
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000001',
    workspaceId: '00000000-0000-4000-8000-000000000002',
  },
  actorId: '00000000-0000-4000-8000-000000000003',
  correlationId: '00000000-0000-4000-8000-000000000004',
  idempotencyKey: 'data-import-controller',
  authorizationEpoch: 1,
});
assert.equal(tenantContext.accepted, true);
if (!tenantContext.accepted) throw new Error('invalid test context');
const resolvedTenantContext = tenantContext.value;

function requestBody(declaredEncoding: unknown = 'utf-8') {
  return {
    destination: { kind: 'NEW_DATASET' },
    datasetName: 'Import review',
    idempotencyKey: 'data-import-controller',
    files: [
      {
        fileName: 'data.csv',
        claimedMediaType: 'text/csv',
        contentBase64: Buffer.from('name\nitem\n').toString('base64'),
        declaredEncoding,
      },
    ],
  };
}

function controllerFor(code: DataImportProblemCodeV1) {
  return new DataImportController(
    {
      create: async () => Object.freeze({ accepted: false as const, code }),
    } as unknown as DataImportServiceV1,
    { resolve: async () => resolvedTenantContext },
  );
}

async function expectProblem(
  promise: Promise<unknown>,
  expectedStatus: number,
  expectedCode: DataImportProblemCodeV1,
) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof HttpException);
    assert.equal(error.getStatus(), expectedStatus);
    assert.deepEqual(error.getResponse(), {
      error: 'DDA_IMPORT_REJECTED',
      code: expectedCode,
    });
    return true;
  });
}

void test('[DDA-002][WEB-021] unsupported declared encoding is a stable bad request', async () => {
  let called = false;
  const controller = new DataImportController(
    {
      create: async () => {
        called = true;
        return Object.freeze({ accepted: false as const, code: 'DDA_IMPORT_UNAVAILABLE' as const });
      },
    } as unknown as DataImportServiceV1,
    { resolve: async () => resolvedTenantContext },
  );

  await expectProblem(
    controller.create({}, requestBody('windows-1252')),
    400,
    'DDA_INTAKE_UNSUPPORTED_ENCODING',
  );
  assert.equal(called, false);
});

void test('[DDA-002][WEB-021] encoding and profile limit problems retain HTTP semantics', async () => {
  await expectProblem(
    controllerFor('DDA_INTAKE_MALFORMED_ENCODING').create({}, requestBody()),
    400,
    'DDA_INTAKE_MALFORMED_ENCODING',
  );
  await expectProblem(
    controllerFor('DDA_INTAKE_LIMIT_ROWS').create({}, requestBody()),
    422,
    'DDA_INTAKE_LIMIT_ROWS',
  );
  await expectProblem(
    controllerFor('DDA_INTAKE_LIMIT_COLUMNS').create({}, requestBody()),
    422,
    'DDA_INTAKE_LIMIT_COLUMNS',
  );
});
