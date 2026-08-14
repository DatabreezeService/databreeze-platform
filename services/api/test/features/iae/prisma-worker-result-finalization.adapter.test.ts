import assert from 'node:assert/strict';
import test from 'node:test';

/* eslint-disable @typescript-eslint/require-await, prefer-const -- deterministic recursive transaction double. */

import { parseTenantScopeV1, tenantScopeKeyV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  PrismaWorkerResultFinalizationAdapter,
  type WorkerResultAttestationDatabaseRowV1,
  type WorkerResultFinalizationDatabaseClientV1,
} from '../../../src/features/iae/adapter/prisma-worker-result-finalization.adapter.js';
import type { IaeWorkerResultFinalizationSaveV1 } from '../../../src/features/iae/application/worker-result-finalization.service.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000b01',
  workspace: '00000000-0000-4000-8000-000000000b02',
  attestation: '00000000-0000-4000-8000-000000000b03',
  job: '00000000-0000-4000-8000-000000000b04',
  attempt: '00000000-0000-4000-8000-000000000b05',
  descriptor: '00000000-0000-4000-8000-000000000b06',
  submission: '00000000-0000-4000-8000-000000000b07',
  artifact: '00000000-0000-4000-8000-000000000b08',
  version: '00000000-0000-4000-8000-000000000b09',
  placement: '00000000-0000-4000-8000-000000000b10',
  lineage: '00000000-0000-4000-8000-000000000b11',
  source: '00000000-0000-4000-8000-000000000b12',
} as const;

const parsedScope = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: ids.organization,
  workspaceId: ids.workspace,
});
if (!parsedScope.accepted) throw new Error('invalid scope fixture');
const tenantScope = parsedScope.value;

function save(): IaeWorkerResultFinalizationSaveV1 {
  const now = '2026-08-13T01:00:00.000Z' as never;
  return {
    requestHash: '1'.repeat(64),
    artifactVersion: {
      id: ids.version as never,
      artifactId: ids.artifact as never,
      tenantScope,
      sourceKind: 'GENERATED',
      dataMode: 'Cloud',
      contentSha256: '2'.repeat(64),
      byteSize: 256,
      mediaType: 'application/json',
      displayName: 'worker-result',
      createdAt: now,
      status: 'ACTIVE',
      scanState: 'CLEAN',
    },
    placement: {
      id: ids.placement as never,
      artifactVersionId: ids.version as never,
      tenantScope,
      kind: 'CLOUD_OBJECT',
      opaqueReference: 'result.json',
      contentSha256: '2'.repeat(64),
      payloadClass: 'APPROVED_DERIVED_RESULT',
      available: true,
      revision: 1,
      createdAt: now,
    },
    lineage: {
      id: ids.lineage as never,
      tenantScope,
      derivedArtifactVersionId: ids.version as never,
      sourceVersionIds: [ids.source as never],
      processorVersion: 'engine@1',
      recipeVersion: ids.descriptor as never,
      coordinateLineage: { sourceLineageHash: '3'.repeat(64) },
      createdAt: now,
    },
    attestation: {
      schemaVersion: 1,
      attestationId: ids.attestation as never,
      tenantScope,
      jobId: ids.job as never,
      attemptId: ids.attempt as never,
      executionDescriptorId: ids.descriptor as never,
      executionDescriptorHash: '4'.repeat(64),
      submissionId: ids.submission as never,
      artifactVersionId: ids.version as never,
      contentSha256: '2'.repeat(64),
      contentLength: 256,
      mediaType: 'application/json',
      sourceLineageHash: '3'.repeat(64),
      outputPolicyHash: '5'.repeat(64),
      finalizedAt: now,
    },
  };
}

function database(options: { readonly failLineage?: boolean } = {}) {
  let writes: Array<readonly [string, Readonly<Record<string, unknown>>]> = [];
  let attestationRow: WorkerResultAttestationDatabaseRowV1 | null = null;
  let client: WorkerResultFinalizationDatabaseClientV1;
  client = {
    workerObjectCapabilityRecord: { findFirst: async () => null },
    artifactVersion: {
      create: async ({ data }: { data: Readonly<Record<string, unknown>> }) => {
        writes.push(['version', data]);
        return data;
      },
    },
    contentPlacement: {
      create: async ({ data }: { data: Readonly<Record<string, unknown>> }) => {
        writes.push(['placement', data]);
        return data;
      },
    },
    artifactLineageRecord: {
      create: async ({ data }: { data: Readonly<Record<string, unknown>> }) => {
        if (options.failLineage) throw new Error('lineage unavailable');
        writes.push(['lineage', data]);
        return data;
      },
    },
    workerResultFinalizationAttestationRecord: {
      findFirst: async ({ where }: { where: Readonly<Record<string, unknown>> }) => {
        if (
          attestationRow === null ||
          Object.entries(where).some(
            ([key, value]) =>
              (attestationRow as unknown as Readonly<Record<string, unknown>> | null)?.[key] !==
              value,
          )
        )
          return null;
        return attestationRow;
      },
      create: async ({ data }: { data: Readonly<Record<string, unknown>> }) => {
        writes.push(['attestation', data]);
        attestationRow = data as unknown as WorkerResultAttestationDatabaseRowV1;
        return attestationRow;
      },
    },
    $transaction: async <TValue>(
      work: (tx: WorkerResultFinalizationDatabaseClientV1) => Promise<TValue>,
    ) => {
      const before = writes;
      const previousAttestation = attestationRow;
      writes = [...writes];
      try {
        return await work(client as never);
      } catch (error) {
        writes = before;
        attestationRow = previousAttestation;
        throw error;
      }
    },
  };
  return { client, writes: () => writes };
}

void test('[IAE-007/024] Prisma adapter creates version, placement, lineage and attestation in one transaction', async () => {
  const fixture = database();
  const adapter = new PrismaWorkerResultFinalizationAdapter(fixture.client);
  await adapter.withTransaction(tenantScope, (transaction) => transaction.saveFinalization(save()));

  assert.deepEqual(
    fixture.writes().map(([kind]) => kind),
    ['version', 'placement', 'lineage', 'attestation'],
  );
  const placement = fixture.writes().find(([kind]) => kind === 'placement')?.[1];
  assert.equal(placement?.['payloadClass'], 'APPROVED_DERIVED_RESULT');
});

void test('[IAE-024] exact-scope resolver returns content-free immutable attestation', async () => {
  const fixture = database();
  const adapter = new PrismaWorkerResultFinalizationAdapter(fixture.client);
  await adapter.withTransaction(tenantScope, (transaction) => transaction.saveFinalization(save()));
  const resolved = await adapter.resolveAttestation({
    tenantScope,
    attestationId: ids.attestation as never,
  });

  assert.equal(resolved?.artifactVersionId, ids.version);
  assert.equal(resolved?.executionDescriptorHash, '4'.repeat(64));
  assert.equal(resolved?.outputPolicyHash, '5'.repeat(64));
  assert.equal('objectId' in (resolved ?? {}), false);
  const other = parseTenantScopeV1({
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: '00000000-0000-4000-8000-000000000b99',
  });
  assert.equal(other.accepted, true);
  if (other.accepted)
    assert.equal(
      await adapter.resolveAttestation({
        tenantScope: other.value,
        attestationId: ids.attestation as never,
      }),
      undefined,
    );
});

void test('[IAE-024] failed lineage write rolls back every worker-result row', async () => {
  const fixture = database({ failLineage: true });
  const adapter = new PrismaWorkerResultFinalizationAdapter(fixture.client);
  await assert.rejects(
    adapter.withTransaction(tenantScope, (transaction) => transaction.saveFinalization(save())),
    /lineage unavailable/u,
  );
  assert.deepEqual(fixture.writes(), []);
});

void test('[IAE-024] attestation persistence uses normalized exact scope key', async () => {
  const fixture = database();
  const adapter = new PrismaWorkerResultFinalizationAdapter(fixture.client);
  await adapter.withTransaction(tenantScope, (transaction) => transaction.saveFinalization(save()));
  const row = fixture.writes().find(([kind]) => kind === 'attestation')?.[1];
  assert.equal(row?.['scopeKey'], tenantScopeKeyV1(tenantScope));
});
