import { strict as assert } from 'node:assert';
import test from 'node:test';

import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  PrismaSpreadsheetAuditRepositoryAdapter,
  type SpreadsheetAuditDatabaseClientV1,
  type SpreadsheetAuditDatabaseRowV1,
} from '../../../src/features/sa/adapter/prisma-spreadsheet-audit-repository.adapter.js';
import { createSpreadsheetAuditResultV1 } from '@databreeze/domain/spreadsheet-audit/v1';

const contextResult = createIamTenantContextV1({
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '22222222-2222-4222-8222-222222222222',
    workspaceId: '33333333-3333-4333-8333-333333333333',
  },
  authorizationEpoch: 1,
  correlationId: '44444444-4444-4444-8444-444444444444',
  idempotencyKey: 'prisma-spreadsheet-audit',
});
if (!contextResult.accepted) throw new Error('fixture context invalid');
const context = contextResult.value;

const result = createSpreadsheetAuditResultV1({
  auditId: '55555555-5555-4555-8555-555555555555',
  artifactVersionId: '66666666-6666-4666-8666-666666666666',
  tenantScope: context.tenantScope,
  workbookSha256: 'a'.repeat(64),
  sheets: [
    {
      sheetId: '77777777-7777-4777-8777-777777777777',
      name: 'Orders',
      maxRow: 10,
      maxColumn: 4,
      formulaCount: 2,
    },
  ],
  findings: [],
  blockedReasons: ['EXTERNAL_LINK'],
  processorVersion: 'spreadsheet-auditor-0.1.0',
  createdAt: '2026-08-04T00:00:00.000Z',
});
if (!result.accepted) throw new Error('fixture result invalid');

function client(rows: SpreadsheetAuditDatabaseRowV1[]): SpreadsheetAuditDatabaseClientV1 {
  return {
    spreadsheetAuditResultRecord: {
      create({ data }) {
        const row = { ...data } as SpreadsheetAuditDatabaseRowV1;
        rows.push(row);
        return Promise.resolve(row);
      },
      findUnique({ where }) {
        return Promise.resolve(rows.find((row) => row.id === where.id) ?? null);
      },
      findMany({ where }) {
        return Promise.resolve(
          rows
            .filter(
              (row) =>
                row.artifactVersionId === where['artifactVersionId'] &&
                row.organizationId === where['organizationId'],
            )
            .sort((left, right) => left.id.localeCompare(right.id)),
        );
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('SA-001/SA-004 Prisma adapter persists only value-free audit metadata', async () => {
  const rows: SpreadsheetAuditDatabaseRowV1[] = [];
  const repository = new PrismaSpreadsheetAuditRepositoryAdapter(client(rows));
  await repository.save(context, result.value);
  await repository.save(context, result.value);
  assert.deepEqual(await repository.find(context, result.value.auditId), result.value);
  assert.equal((await repository.list(context, result.value.artifactVersionId)).length, 1);
  assert.equal(rows.length, 1);
  assert.equal(Object.hasOwn(rows[0] as object, 'formula'), false);
  assert.equal(Object.hasOwn(rows[0] as object, 'sourceValue'), false);
});
