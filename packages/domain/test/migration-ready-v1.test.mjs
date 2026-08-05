import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateMigrationDryRunV1 } from '@databreeze/domain/migration-ready/v1';

const scope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000801',
  workspaceId: '00000000-0000-4000-8000-000000000802',
};
const id = (suffix) => `00000000-0000-4000-8000-0000000008${suffix}`;

void test('[MR-001, MR-010, MR-016, MR-017] produces an immutable dry-run with dispositions and reason codes', () => {
  const result = evaluateMigrationDryRunV1({
    projectId: id('03'),
    tenantScope: scope,
    sourceVersionId: id('04'),
    sourceSha256: 'a'.repeat(64),
    targetSchemaVersionId: id('05'),
    targetFields: [
      { key: 'email', required: true },
      { key: 'name', required: false },
    ],
    keyField: 'email',
    sourceRows: [
      { email: 'a@example.test', name: 'A' },
      { email: '', name: 'B' },
      { email: 'a@example.test', name: 'C' },
    ],
  });
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.records[0]?.disposition, 'READY');
  assert.ok(result.records.some((record) => record.reasonCodes.includes('REQUIRED_FIELD_MISSING')));
  assert.ok(result.records.some((record) => record.reasonCodes.includes('DUPLICATE_KEY')));
  assert.equal(result.sourceMutated, false);
});

void test('[MR-002, MR-011] rejects malformed source hashes and empty target schemas', () => {
  assert.throws(
    () =>
      evaluateMigrationDryRunV1({
        projectId: id('06'),
        tenantScope: scope,
        sourceVersionId: id('07'),
        sourceSha256: 'bad',
        targetSchemaVersionId: id('08'),
        targetFields: [],
        keyField: 'id',
        sourceRows: [],
      }),
    /INVALID_MIGRATION_INPUT/,
  );
});
