import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { createExecutionRequestDescriptorV1 } from '../../../src/features/jra/application/execution-request-descriptor.js';

function id(value: string) {
  const parsed = parseStableIdentifierV1(value);
  if (!parsed.accepted) throw new Error('invalid test identifier');
  return parsed.value;
}

function input(parameters: Record<string, unknown> = { includeHidden: false, sheet: 'Chi phí' }) {
  return {
    schemaVersion: 1,
    descriptorId: id('00000000-0000-4000-8000-000000000101'),
    resultUsageSettlementBindingId: id('00000000-0000-4000-8000-000000000106'),
    tenantScope: {
      scopeType: 'workspace',
      organizationId: id('00000000-0000-4000-8000-000000000102'),
      workspaceId: id('00000000-0000-4000-8000-000000000103'),
    },
    jobId: id('00000000-0000-4000-8000-000000000104'),
    stepId: id('00000000-0000-4000-8000-000000000105'),
    action: {
      type: 'spreadsheet.audit',
      version: 1,
      inputSchemaId: 'schema.input.v1',
      outputSchemaId: 'schema.output.v1',
      handlerDigest: 'a'.repeat(64),
      requiredCapabilities: ['artifact.read'],
      sideEffectClass: 'NONE',
      riskClass: 'READ_ONLY',
    },
    inputObjectIds: ['artifact-version:source-1'],
    inputManifestHash: 'b'.repeat(64),
    parameters,
    outputPolicy: {
      outputObjectId: 'artifact-version:result-1',
      maxBytes: 5_000_000,
      mediaType: 'application/json',
    },
    deadline: '2026-01-01T00:01:00.000Z',
    locale: 'vi-VN',
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

void test('[JRA-032/BUA-023] immutable descriptors require one opaque usage-settlement binding and hash it canonically', () => {
  const accepted = createExecutionRequestDescriptorV1(input());
  const missing = input() as Record<string, unknown>;
  delete missing['resultUsageSettlementBindingId'];
  const changed = createExecutionRequestDescriptorV1({
    ...input(),
    resultUsageSettlementBindingId: id('00000000-0000-4000-8000-000000000107'),
  });

  assert.equal(accepted.accepted, true);
  assert.equal(createExecutionRequestDescriptorV1(missing).accepted, false);
  assert.equal(changed.accepted, true);
  if (!accepted.accepted || !changed.accepted) return;
  assert.equal(
    accepted.value.resultUsageSettlementBindingId,
    id('00000000-0000-4000-8000-000000000106'),
  );
  assert.notEqual(accepted.value.canonicalHash, changed.value.canonicalHash);
});

void test('[JRA-002/JRA-004] canonical hash is exact, deterministic, and key-order independent', () => {
  const first = createExecutionRequestDescriptorV1(
    input({ sheet: 'Chi phí', includeHidden: false }),
  );
  const reordered = createExecutionRequestDescriptorV1(
    input({ includeHidden: false, sheet: 'Chi phí' }),
  );
  const changed = createExecutionRequestDescriptorV1(
    input({ sheet: 'Doanh thu', includeHidden: false }),
  );
  assert.equal(first.accepted, true);
  assert.equal(reordered.accepted, true);
  assert.equal(changed.accepted, true);
  if (!first.accepted || !reordered.accepted || !changed.accepted) return;
  assert.equal(first.value.canonicalHash, reordered.value.canonicalHash);
  assert.notEqual(first.value.canonicalHash, changed.value.canonicalHash);
  assert.match(first.value.canonicalHash, /^[0-9a-f]{64}$/u);
});

void test('[JRA-005/JRA-023] closed descriptors reject extra fields and bounded hostile values', () => {
  assert.equal(
    createExecutionRequestDescriptorV1({ ...input(), arbitraryCode: 'print(1)' }).accepted,
    false,
  );
  assert.equal(
    createExecutionRequestDescriptorV1(input({ nested: { path: '/etc/passwd' } })).accepted,
    false,
  );
  assert.equal(
    createExecutionRequestDescriptorV1(input({ rows: Array.from({ length: 129 }, () => true) }))
      .accepted,
    false,
  );
});
