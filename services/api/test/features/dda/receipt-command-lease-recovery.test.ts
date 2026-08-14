import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaReceiptExtractionCommandRepositoryAdapter,
  type DdaReceiptExtractionCommandDatabaseClientV1,
  type ReceiptExtractionCommandRowV1,
} from '../../../src/features/dda/receipt/adapter/prisma-receipt-extraction-command-repository.adapter.js';
import type {
  ReceiptCandidateView,
  ReceiptFieldCandidateView,
} from '../../../src/features/dda/receipt/application/receipt-extraction.service.js';
import type {
  ReceiptCommandReservationInputV1,
  ReceiptExtractionCommandRepositoryPortV1,
} from '../../../src/features/dda/receipt/application/receipt-extraction-command.port.js';

const parsedScope = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(parsedScope.accepted, true);
const tenantScope = parsedScope.accepted ? parsedScope.value : (null as never as TenantScopeV1);

const ids = Object.freeze({
  artifact: '00000000-0000-4000-8000-000000000101',
  profile: '00000000-0000-4000-8000-000000000102',
  candidate: '00000000-0000-4000-8000-000000000103',
  replacement: '00000000-0000-4000-8000-000000000104',
  evidence: '00000000-0000-4000-8000-000000000105',
});

function input(): ReceiptCommandReservationInputV1 {
  return {
    tenantScope,
    operation: 'EXTRACT',
    commandKey: 'lease-recovery-command',
    artifactVersionId: ids.artifact,
    sourceId: ids.profile,
    payloadFingerprint: 'a'.repeat(64),
  };
}

function candidate(candidateId: string = ids.candidate): ReceiptCandidateView {
  const field: ReceiptFieldCandidateView = {
    field: 'total',
    value: '120.00',
    confidence: 99,
    evidenceCoordinates: { page: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
  };
  return {
    schemaVersion: 1,
    candidateId,
    tenantScope,
    artifactVersionId: ids.artifact,
    profileVersionId: ids.profile,
    fieldCandidates: [field],
    adapterVersion: 'receipt-adapter-v1',
    modelVersion: 'receipt-model-v1',
    evidenceReferenceId: ids.evidence,
    candidateHash: 'b'.repeat(64),
    treatedAsUntrustedData: true,
  };
}

function sharedClient() {
  const rows = new Map<string, Record<string, unknown>>();
  const matches = (row: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const client: DdaReceiptExtractionCommandDatabaseClientV1 = {
    receiptExtractionCommandRecord: {
      findFirst: ({ where }) => {
        const row = [...rows.values()].find((candidateRow) =>
          matches(candidateRow, where as Record<string, unknown>),
        );
        return Promise.resolve((row ?? null) as ReceiptExtractionCommandRowV1 | null);
      },
      create: ({ data }) => {
        const duplicate = [...rows.values()].some(
          (row) =>
            row['scopeKey'] === data.scopeKey &&
            row['operation'] === data.operation &&
            row['artifactVersionId'] === data.artifactVersionId &&
            row['sourceId'] === data.sourceId &&
            row['commandKey'] === data.commandKey,
        );
        if (duplicate) throw Object.assign(new Error('unique'), { code: 'P2002' });
        const row = {
          ...data,
          updatedAt: data.createdAt,
          completedAt: null,
        } as Record<string, unknown>;
        rows.set(data.id, row);
        return Promise.resolve(row as unknown as ReceiptExtractionCommandRowV1);
      },
      updateMany: ({ where, data }) => {
        let count = 0;
        for (const row of rows.values()) {
          if (!matches(row, where as Record<string, unknown>)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return Promise.resolve({ count });
      },
      deleteMany: ({ where }) => {
        let count = 0;
        for (const [id, row] of rows) {
          if (!matches(row, where as Record<string, unknown>)) continue;
          rows.delete(id);
          count += 1;
        }
        return Promise.resolve({ count });
      },
    },
  };
  return { client, rows };
}

void test('[DDA-041] a crashed receipt reservation can be reconciled and taken over by another instance', async () => {
  let now = new Date('2026-08-13T05:00:00.000Z');
  const shared = sharedClient();
  const options = { clock: () => now, leaseDurationMs: 1_000 };
  const first = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client, options);
  const second = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client, options);

  const reserved = await first.reserve(input());
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted || reserved.value.kind !== 'RESERVED') return;
  assert.equal(typeof reserved.value.ownerToken, 'string');

  now = new Date(now.getTime() + 2_000);
  const reconciled = await first.reconcileAbandoned({
    reservationId: reserved.value.reservationId,
    ownerToken: reserved.value.ownerToken,
  });
  assert.deepEqual(reconciled, { accepted: true, value: { state: 'FAILED' } });

  const takeover = await second.reserve(input());
  assert.equal(takeover.accepted, true);
  if (!takeover.accepted || takeover.value.kind !== 'RESERVED') return;
  assert.notEqual(takeover.value.ownerToken, reserved.value.ownerToken);
  assert.deepEqual(
    await first.complete(reserved.value.reservationId, candidate(), reserved.value.ownerToken),
    { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' },
  );
  assert.deepEqual(
    await second.complete(takeover.value.reservationId, candidate(), takeover.value.ownerToken),
    { accepted: true },
  );
});

void test('[DDA-041] completed receipt results remain immutable across replay and stale owners', async () => {
  const shared = sharedClient();
  const repository = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client);
  const reserved = await repository.reserve(input());
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted || reserved.value.kind !== 'RESERVED') return;

  assert.deepEqual(
    await repository.complete(reserved.value.reservationId, candidate(), reserved.value.ownerToken),
    { accepted: true },
  );
  assert.deepEqual(
    await repository.complete(
      reserved.value.reservationId,
      candidate(ids.replacement),
      reserved.value.ownerToken,
    ),
    { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' },
  );
  const replay = await repository.reserve(input());
  assert.equal(replay.accepted, true);
  if (replay.accepted && replay.value.kind === 'REPLAY') {
    assert.equal(replay.value.candidate.candidateId, ids.candidate);
  }
});

void test('[DDA-041] the receipt command port exposes recovery without making unavailable storage succeed', async () => {
  const unavailable = new (
    await import('../../../src/features/dda/receipt/application/receipt-extraction-command.port.js')
  ).UnavailableReceiptExtractionCommandRepositoryAdapter() as ReceiptExtractionCommandRepositoryPortV1;
  const result = await unavailable.reconcileAbandoned({
    reservationId: ids.candidate,
    ownerToken: ids.profile,
  });
  assert.deepEqual(result, { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' });
});
