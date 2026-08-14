import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaReceiptExtractionCommandRepositoryAdapter,
  type DdaReceiptExtractionCommandDatabaseClientV1,
  type ReceiptExtractionCommandRowV1,
} from '../../../src/features/dda/receipt/adapter/prisma-receipt-extraction-command-repository.adapter.js';
import type { ReceiptCandidateView } from '../../../src/features/dda/receipt/application/receipt-extraction.service.js';
import type { ReceiptCommandReservationInputV1 } from '../../../src/features/dda/receipt/application/receipt-extraction-command.port.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
const otherProjectResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000004',
});
assert.equal(scopeResult.accepted, true);
assert.equal(otherProjectResult.accepted, true);
type ProjectScopeV1 = Extract<TenantScopeV1, { readonly scopeType: 'project' }>;
const scope = (scopeResult.accepted ? scopeResult.value : (null as never)) as ProjectScopeV1;
const otherProject = (
  otherProjectResult.accepted ? otherProjectResult.value : (null as never)
) as ProjectScopeV1;

const ids = Object.freeze({
  artifact: '00000000-0000-4000-8000-000000000101',
  profile: '00000000-0000-4000-8000-000000000102',
  candidate: '00000000-0000-4000-8000-000000000103',
  evidence: '00000000-0000-4000-8000-000000000104',
});

function candidate(overrides: Partial<ReceiptCandidateView> = {}): ReceiptCandidateView {
  return {
    schemaVersion: 1,
    candidateId: ids.candidate,
    tenantScope: scope,
    artifactVersionId: ids.artifact,
    profileVersionId: ids.profile,
    fieldCandidates: [
      {
        field: 'total',
        value: '120.00',
        confidence: 98,
        evidenceCoordinates: { page: 1, x: 0.1, y: 0.2, width: 0.3, height: 0.1 },
      },
    ],
    adapterVersion: 'receipt-adapter-v1',
    modelVersion: 'receipt-model-v1',
    evidenceReferenceId: ids.evidence,
    candidateHash: 'a'.repeat(64),
    treatedAsUntrustedData: true,
    ...overrides,
  };
}

function input(
  overrides: Partial<ReceiptCommandReservationInputV1> = {},
): ReceiptCommandReservationInputV1 {
  return {
    tenantScope: scope,
    operation: 'EXTRACT',
    commandKey: 'receipt-command-1',
    artifactVersionId: ids.artifact,
    sourceId: ids.profile,
    payloadFingerprint: 'b'.repeat(64),
    ...overrides,
  };
}

type MutableRow = Record<string, unknown>;

function sharedClient(options: { readonly unavailable?: boolean; readonly race?: boolean } = {}) {
  const rows = new Map<string, MutableRow>();
  let raceUsed = false;
  const calls = { findFirst: 0, create: 0, updateMany: 0 };

  const matches = (row: MutableRow, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, value]) => row[key] === value);
  const stored = (row: MutableRow): ReceiptExtractionCommandRowV1 => row as never;

  const client: DdaReceiptExtractionCommandDatabaseClientV1 = {
    receiptExtractionCommandRecord: {
      findFirst(input) {
        calls.findFirst += 1;
        if (options.unavailable) return Promise.reject(new Error('DATABASE_OFFLINE'));
        for (const row of rows.values()) {
          if (matches(row, input.where as Record<string, unknown>)) {
            return Promise.resolve(stored(row));
          }
        }
        return Promise.resolve(null);
      },
      create(input) {
        calls.create += 1;
        if (options.unavailable) throw new Error('DATABASE_OFFLINE');
        const key = JSON.stringify({
          scopeKey: input.data.scopeKey,
          operation: input.data.operation,
          artifactVersionId: input.data.artifactVersionId,
          sourceId: input.data.sourceId,
          commandKey: input.data.commandKey,
        });
        const existing = [...rows.values()].find(
          (row) =>
            JSON.stringify({
              scopeKey: row['scopeKey'],
              operation: row['operation'],
              artifactVersionId: row['artifactVersionId'],
              sourceId: row['sourceId'],
              commandKey: row['commandKey'],
            }) === key,
        );
        if (existing) {
          const error = Object.assign(new Error('unique race'), { code: 'P2002' });
          throw error;
        }
        if (options.race && !raceUsed) {
          raceUsed = true;
          rows.set(String(input.data.id), {
            ...input.data,
            updatedAt: new Date(),
            completedAt: null,
          });
          throw Object.assign(new Error('unique race'), { code: 'P2002' });
        }
        rows.set(String(input.data.id), {
          ...input.data,
          updatedAt: new Date(),
          completedAt: null,
        });
        return Promise.resolve(stored(rows.get(String(input.data.id))!));
      },
      updateMany(input) {
        calls.updateMany += 1;
        if (options.unavailable) throw new Error('DATABASE_OFFLINE');
        let count = 0;
        for (const row of rows.values()) {
          if (!matches(row, input.where as Record<string, unknown>)) continue;
          Object.assign(row, input.data);
          count += 1;
        }
        return Promise.resolve({ count });
      },
      deleteMany(input) {
        for (const [key, row] of rows) {
          if (!matches(row, input.where as Record<string, unknown>)) continue;
          rows.delete(key);
        }
        return Promise.resolve({ count: 1 });
      },
    },
  };
  return { client, rows, calls };
}

void test('[DDA-041] durable receipt command replays after an adapter restart', async () => {
  const shared = sharedClient();
  const first = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client);
  const second = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client);
  const reserved = await first.reserve(input());
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted || reserved.value.kind !== 'RESERVED') return;

  assert.deepEqual(
    await first.complete(reserved.value.reservationId, candidate(), reserved.value.ownerToken),
    {
      accepted: true,
    },
  );
  const replay = await second.reserve(input());
  assert.equal(replay.accepted, true);
  if (replay.accepted && replay.value.kind === 'REPLAY') {
    assert.deepEqual(replay.value.candidate, candidate());
  }
});

void test('[DDA-041] receipt command conflicts on a changed fingerprint but isolates projects and sources', async () => {
  const shared = sharedClient();
  const repository = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client);
  const first = await repository.reserve(input());
  assert.equal(first.accepted, true);

  const changed = await repository.reserve(input({ payloadFingerprint: 'c'.repeat(64) }));
  assert.deepEqual(changed, { accepted: false, code: 'COMMAND_CONFLICT' });

  const otherProjectReservation = await repository.reserve(input({ tenantScope: otherProject }));
  assert.equal(otherProjectReservation.accepted, true);
  const otherSource = await repository.reserve(
    input({ sourceId: '00000000-0000-4000-8000-000000000105' }),
  );
  assert.equal(otherSource.accepted, true);
});

void test('[DDA-041] a scoped P2002 create race re-reads the durable command deterministically', async () => {
  const shared = sharedClient({ race: true });
  const repository = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client);
  const result = await repository.reserve(input());
  assert.deepEqual(result, { accepted: false, code: 'COMMAND_CONFLICT' });
  assert.equal(shared.calls.create, 1);
  assert.ok(shared.calls.findFirst >= 2);
});

void test('[DDA-041] corrupt or unavailable receipt command rows fail closed', async () => {
  const corrupt = sharedClient();
  corrupt.rows.set('corrupt', {
    id: '00000000-0000-4000-8000-000000000106',
    scopeKey:
      'project:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002:00000000-0000-4000-8000-000000000003',
    scopeType: 'project',
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    operation: 'EXTRACT',
    artifactVersionId: ids.artifact,
    sourceId: ids.profile,
    commandKey: 'receipt-command-1',
    payloadFingerprint: 'b'.repeat(64),
    state: 'COMPLETED',
    ownerToken: '00000000-0000-4000-8000-000000000107',
    candidateId: ids.candidate,
    candidateDocument: { broken: true },
  });
  const corruptResult = await new PrismaReceiptExtractionCommandRepositoryAdapter(
    corrupt.client,
  ).reserve(input());
  assert.deepEqual(corruptResult, { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' });

  const unavailableResult = await new PrismaReceiptExtractionCommandRepositoryAdapter(
    sharedClient({ unavailable: true }).client,
  ).reserve(input());
  assert.deepEqual(unavailableResult, { accepted: false, code: 'COMMAND_REPOSITORY_UNAVAILABLE' });
});

void test('[DDA-041] correction candidate lookup remains tenant and artifact scoped', async () => {
  const shared = sharedClient();
  const repository = new PrismaReceiptExtractionCommandRepositoryAdapter(shared.client);
  const reserved = await repository.reserve(
    input({
      operation: 'CORRECT',
      sourceId: ids.candidate,
      commandKey: 'correction-1',
    }),
  );
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted || reserved.value.kind !== 'RESERVED') return;
  const corrected = candidate({ priorCandidateId: ids.candidate });
  assert.deepEqual(
    await repository.complete(reserved.value.reservationId, corrected, reserved.value.ownerToken),
    { accepted: true },
  );
  assert.deepEqual(
    await repository.findCandidate({
      tenantScope: scope,
      candidateId: ids.candidate,
      artifactVersionId: ids.artifact,
    }),
    corrected,
  );
  assert.equal(
    await repository.findCandidate({
      tenantScope: otherProject,
      candidateId: ids.candidate,
      artifactVersionId: ids.artifact,
    }),
    undefined,
  );
});
