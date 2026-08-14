import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaEtlAcceptanceCommandRepositoryAdapter,
  type DdaEtlAcceptanceCommandDatabaseClientV1,
  type EtlAcceptanceCommandRowV1,
} from '../../../src/features/dda/etl/adapter/prisma-etl-acceptance-command-repository.adapter.js';
import type {
  EtlAcceptanceReservationInputV1,
  EtlAcceptanceValueV1,
} from '../../../src/features/dda/etl/application/etl-acceptance-idempotency.port.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000201',
  workspaceId: '00000000-0000-4000-8000-000000000202',
  projectId: '00000000-0000-4000-8000-000000000203',
});
const otherScopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000211',
  workspaceId: '00000000-0000-4000-8000-000000000212',
  projectId: '00000000-0000-4000-8000-000000000213',
});
assert.equal(scopeResult.accepted, true);
assert.equal(otherScopeResult.accepted, true);
type ProjectScopeV1 = Extract<TenantScopeV1, { readonly scopeType: 'project' }>;
const scope = (scopeResult.accepted ? scopeResult.value : (null as never)) as ProjectScopeV1;
const otherScope = (
  otherScopeResult.accepted ? otherScopeResult.value : (null as never)
) as ProjectScopeV1;

const ids = Object.freeze({
  proposal: '00000000-0000-4000-8000-000000000221',
  job: '00000000-0000-4000-8000-000000000222',
  artifact: '00000000-0000-4000-8000-000000000223',
  dataset: '00000000-0000-4000-8000-000000000224',
});

const proposalRow = () => ({
  id: ids.proposal,
  scopeType: 'project',
  organizationId: scope.organizationId,
  workspaceId: scope.workspaceId,
  projectId: scope.projectId,
  revision: 1,
  state: 'READY_FOR_ACCEPTANCE',
  blockingReasons: [],
  planDocument: { inputArtifactVersionId: ids.artifact },
  reviewDocument: {},
  createdAt: new Date('2026-08-13T00:00:00.000Z'),
  updatedAt: new Date('2026-08-13T00:00:00.000Z'),
});

function input(
  overrides: Partial<EtlAcceptanceReservationInputV1> = {},
): EtlAcceptanceReservationInputV1 {
  return {
    tenantScope: scope,
    proposalId: ids.proposal,
    expectedRevision: 1,
    commandKey: 'etl-acceptance-1',
    payloadFingerprint: 'a'.repeat(64),
    ...overrides,
  };
}

function value(overrides: Partial<EtlAcceptanceValueV1> = {}): EtlAcceptanceValueV1 {
  return {
    proposalId: ids.proposal,
    jobId: ids.job,
    artifactVersionId: ids.artifact,
    datasetVersionId: ids.dataset,
    rowCount: 4,
    contentHash: 'b'.repeat(64),
    schemaHash: 'c'.repeat(64),
    lineageIds: ['00000000-0000-4000-8000-000000000225'],
    replayed: false,
    ...overrides,
  };
}

type MutableRow = Record<string, unknown>;

function sharedClient(
  options: {
    readonly unavailable?: boolean;
    readonly raceRow?: MutableRow;
    readonly failProposalUpdate?: boolean;
  } = {},
) {
  const proposals = new Map<string, MutableRow>([[ids.proposal, proposalRow()]]);
  const commands = new Map<string, MutableRow>();
  const calls = { transactions: 0, commandCreates: 0, proposalUpdates: 0 };
  const matches = (row: MutableRow, where: Record<string, unknown>): boolean =>
    Object.entries(where).every(([key, expected]) => row[key] === expected);
  const asCommand = (row: MutableRow): EtlAcceptanceCommandRowV1 => row as never;

  let racePending = options.raceRow;
  const client: DdaEtlAcceptanceCommandDatabaseClientV1 = {
    etlProposalRecord: {
      findFirst(input) {
        if (options.unavailable) return Promise.reject(new Error('DATABASE_OFFLINE'));
        const row = proposals.get(input.where.id);
        if (!row) return Promise.resolve(null);
        return Promise.resolve(
          Object.entries(input.where).every(([key, expected]) => row[key] === expected)
            ? (row as never)
            : null,
        );
      },
      updateMany(input) {
        calls.proposalUpdates += 1;
        if (options.unavailable) throw new Error('DATABASE_OFFLINE');
        if (options.failProposalUpdate) throw new Error('CAS_FAILURE');
        let count = 0;
        for (const row of proposals.values()) {
          if (!matches(row, input.where as Record<string, unknown>)) continue;
          Object.assign(row, input.data);
          count += 1;
        }
        return Promise.resolve({ count });
      },
    },
    etlAcceptanceCommandRecord: {
      findFirst(input) {
        if (options.unavailable) return Promise.reject(new Error('DATABASE_OFFLINE'));
        for (const row of commands.values()) {
          if (matches(row, input.where as Record<string, unknown>)) {
            return Promise.resolve(asCommand(row));
          }
        }
        return Promise.resolve(null);
      },
      create(input) {
        calls.commandCreates += 1;
        if (options.unavailable) throw new Error('DATABASE_OFFLINE');
        const existing = [...commands.values()].find(
          (row) =>
            row['organizationId'] === input.data.organizationId &&
            row['workspaceId'] === input.data.workspaceId &&
            row['projectId'] === input.data.projectId &&
            row['proposalId'] === input.data.proposalId &&
            row['expectedRevision'] === input.data.expectedRevision,
        );
        if (existing) throw Object.assign(new Error('unique race'), { code: 'P2002' });
        if (racePending) {
          const raceRow = racePending;
          racePending = undefined;
          commands.set(String(raceRow['id']), { ...raceRow });
          throw Object.assign(new Error('unique race'), { code: 'P2002' });
        }
        commands.set(String(input.data.id), {
          ...input.data,
          updatedAt: new Date(),
          completedAt: null,
        });
        return Promise.resolve(asCommand(commands.get(String(input.data.id))!));
      },
      updateMany(input) {
        if (options.unavailable) throw new Error('DATABASE_OFFLINE');
        let count = 0;
        for (const row of commands.values()) {
          if (!matches(row, input.where as Record<string, unknown>)) continue;
          Object.assign(row, input.data);
          count += 1;
        }
        return Promise.resolve({ count });
      },
    },
    async $transaction(callback) {
      calls.transactions += 1;
      const proposalBackup = structuredClone([...proposals.entries()]);
      const commandBackup = structuredClone([...commands.entries()]);
      try {
        return await callback(client);
      } catch (error) {
        proposals.clear();
        for (const [key, row] of proposalBackup) proposals.set(key, row);
        commands.clear();
        for (const [key, row] of commandBackup) commands.set(key, row);
        if ((error as { code?: string } | undefined)?.code === 'P2002' && options.raceRow) {
          commands.set(String(options.raceRow['id']), { ...options.raceRow });
        }
        throw error;
      }
    },
  };

  return { client, proposals, commands, calls };
}

void test('[DDA-053] durable ETL acceptance replays after restart and CASes the proposal revision', async () => {
  const shared = sharedClient();
  const first = new PrismaEtlAcceptanceCommandRepositoryAdapter(shared.client);
  const second = new PrismaEtlAcceptanceCommandRepositoryAdapter(shared.client);
  const reserved = await first.reserveAcceptance(input());
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted || reserved.value.kind !== 'RESERVED') return;

  assert.deepEqual(await first.completeAcceptance(reserved.value.reservationId, value()), {
    accepted: true,
  });
  assert.equal(shared.proposals.get(ids.proposal)?.['revision'], 2);
  assert.equal(shared.proposals.get(ids.proposal)?.['state'], 'ACCEPTED');

  const replay = await second.reserveAcceptance(input());
  assert.equal(replay.accepted, true);
  if (replay.accepted && replay.value.kind === 'REPLAY') {
    assert.deepEqual(replay.value.acceptance, value());
  }
  assert.equal(shared.calls.transactions, 3);
});

void test('[DDA-053] ETL acceptance distinguishes changed payload, tenant, and competing revision keys', async () => {
  const shared = sharedClient();
  const repository = new PrismaEtlAcceptanceCommandRepositoryAdapter(shared.client);
  const reserved = await repository.reserveAcceptance(input());
  assert.equal(reserved.accepted, true);

  assert.deepEqual(
    await repository.reserveAcceptance(input({ payloadFingerprint: 'd'.repeat(64) })),
    { accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' },
  );
  assert.deepEqual(await repository.reserveAcceptance(input({ tenantScope: otherScope })), {
    accepted: false,
    code: 'DDA_ETL_NOT_FOUND',
  });
  assert.deepEqual(await repository.reserveAcceptance(input({ commandKey: 'etl-acceptance-2' })), {
    accepted: false,
    code: 'DDA_ETL_REVISION_CONFLICT',
  });
});

void test('[DDA-053] a scoped P2002 race re-reads a completed acceptance instead of creating a second one', async () => {
  const raceRow: MutableRow = {
    id: '00000000-0000-4000-8000-000000000231',
    scopeType: 'project',
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    proposalId: ids.proposal,
    expectedRevision: 1,
    commandKey: 'etl-acceptance-1',
    payloadFingerprint: 'a'.repeat(64),
    state: 'COMPLETED',
    ownerToken: '00000000-0000-4000-8000-000000000232',
    leaseExpiresAt: null,
    resultDocument: value(),
    failureCode: null,
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
    completedAt: new Date('2026-08-13T00:00:00.000Z'),
  };
  const shared = sharedClient({ raceRow });
  const result = await new PrismaEtlAcceptanceCommandRepositoryAdapter(
    shared.client,
  ).reserveAcceptance(input());
  assert.equal(result.accepted, true);
  if (result.accepted) assert.equal(result.value.kind, 'REPLAY');
});

void test('[DDA-053] failed CAS rolls back both command completion and proposal mutation', async () => {
  const shared = sharedClient({ failProposalUpdate: true });
  const repository = new PrismaEtlAcceptanceCommandRepositoryAdapter(shared.client);
  const reserved = await repository.reserveAcceptance(input());
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted || reserved.value.kind !== 'RESERVED') return;

  assert.deepEqual(await repository.completeAcceptance(reserved.value.reservationId, value()), {
    accepted: false,
    code: 'DDA_ETL_COMMAND_UNAVAILABLE',
  });
  assert.equal(shared.proposals.get(ids.proposal)?.['revision'], 1);
  assert.equal(shared.proposals.get(ids.proposal)?.['state'], 'READY_FOR_ACCEPTANCE');
  assert.equal(shared.commands.get(reserved.value.reservationId)?.['state'], 'RESERVED');
});

void test('[DDA-053] abandoned reservations require explicit expired-lease reconciliation', async () => {
  const now = new Date('2026-08-13T00:00:00.000Z');
  const shared = sharedClient();
  const repository = new PrismaEtlAcceptanceCommandRepositoryAdapter(shared.client, {
    now: () => now,
    leaseDurationMs: 1_000,
  });
  const reserved = await repository.reserveAcceptance(input());
  assert.equal(reserved.accepted, true);
  if (!reserved.accepted || reserved.value.kind !== 'RESERVED') return;

  const notExpired = await repository.reconcileAbandonedAcceptance({
    ...input(),
    reservationId: reserved.value.reservationId,
    now: new Date('2026-08-13T00:00:00.500Z'),
  });
  assert.deepEqual(notExpired, { accepted: false, code: 'DDA_ETL_COMMAND_CONFLICT' });

  const expired = await repository.reconcileAbandonedAcceptance({
    ...input(),
    reservationId: reserved.value.reservationId,
    now: new Date('2026-08-13T00:00:01.001Z'),
  });
  assert.deepEqual(expired, { accepted: true, value: { state: 'FAILED' } });
  assert.equal(shared.commands.get(reserved.value.reservationId)?.['state'], 'FAILED');
});

void test('[DDA-053] corrupt or unavailable ETL command state fails closed', async () => {
  const corrupt = sharedClient();
  corrupt.commands.set('corrupt', {
    id: '00000000-0000-4000-8000-000000000241',
    scopeType: 'project',
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    proposalId: ids.proposal,
    expectedRevision: 1,
    commandKey: 'etl-acceptance-1',
    payloadFingerprint: 'a'.repeat(64),
    state: 'COMPLETED',
    ownerToken: '00000000-0000-4000-8000-000000000242',
    leaseExpiresAt: null,
    resultDocument: value({ artifactVersionId: 'not-a-stable-identifier' }),
    failureCode: null,
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
    completedAt: new Date('2026-08-13T00:00:00.000Z'),
  });
  assert.deepEqual(
    await new PrismaEtlAcceptanceCommandRepositoryAdapter(corrupt.client).reserveAcceptance(
      input(),
    ),
    { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' },
  );
  assert.deepEqual(
    await new PrismaEtlAcceptanceCommandRepositoryAdapter(
      sharedClient({ unavailable: true }).client,
    ).reserveAcceptance(input()),
    { accepted: false, code: 'DDA_ETL_COMMAND_UNAVAILABLE' },
  );
});
