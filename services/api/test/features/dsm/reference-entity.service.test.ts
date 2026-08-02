import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import { InMemoryReferenceEntityRepositoryAdapter } from '../../../src/features/dsm/adapter/in-memory-reference-entity-repository.adapter.js';
import { ReferenceEntityService } from '../../../src/features/dsm/application/reference-entity.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const organizationId = '00000000-0000-4000-8000-000000000001';
const workspaceId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000010';
const correlationId = '00000000-0000-4000-8000-000000000011';
const scope = { scopeType: 'workspace' as const, organizationId, workspaceId };

function context(idempotencyKey: string) {
  const result = createIamTenantContextV1({
    tenantScope: scope,
    actorId,
    correlationId,
    idempotencyKey,
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid context');
  return result.value;
}

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid id');
  return result.value;
}

function party(entityId: string, versionId: string, displayName: string) {
  return {
    entityId,
    versionId,
    tenantScope: scope,
    displayName,
    roles: ['SUPPLIER'],
    aliases: [],
    externalIdentifiers: [],
    canonicalHash: 'a'.repeat(64),
    createdAt: '2026-01-01T00:00:00.000Z',
  } as const;
}

void test('[DSM-025, DSM-026] reference entities remain immutable and merges are actor-bound', async () => {
  const service = new ReferenceEntityService(new InMemoryReferenceEntityRepositoryAdapter());
  const source = await service.create(
    context('party-source'),
    party(
      '00000000-0000-4000-8000-000000000020',
      '00000000-0000-4000-8000-000000000021',
      'Source Supplier',
    ),
  );
  const target = await service.create(
    context('party-target'),
    party(
      '00000000-0000-4000-8000-000000000022',
      '00000000-0000-4000-8000-000000000023',
      'Target Supplier',
    ),
  );
  assert.equal(source.accepted, true);
  assert.equal(target.accepted, true);
  const resolution = await service.merge(context('party-merge'), {
    sourceEntityId: source.accepted ? source.value.entityId : '',
    targetEntityId: target.accepted ? target.value.entityId : '',
    resolutionId: '00000000-0000-4000-8000-000000000024',
    actorId,
    reason: 'Verified duplicate',
    evidenceId: '00000000-0000-4000-8000-000000000025',
    resolvedAt: '2026-01-01T00:01:00.000Z',
  });
  assert.equal(resolution.accepted, true);
  assert.equal(
    (
      await service.listResolutions(
        context('party-read'),
        stable('00000000-0000-4000-8000-000000000020'),
      )
    ).length,
    1,
  );
  assert.equal(
    (
      await service.listVersions(
        context('party-history'),
        stable('00000000-0000-4000-8000-000000000020'),
      )
    ).length,
    1,
  );
});

void test('[DSM-027] a merge cannot be authored by a different actor', async () => {
  const service = new ReferenceEntityService(new InMemoryReferenceEntityRepositoryAdapter());
  await service.create(
    context('party-a'),
    party('00000000-0000-4000-8000-000000000030', '00000000-0000-4000-8000-000000000031', 'A'),
  );
  await service.create(
    context('party-b'),
    party('00000000-0000-4000-8000-000000000032', '00000000-0000-4000-8000-000000000033', 'B'),
  );
  const result = await service.merge(context('party-actor-mismatch'), {
    sourceEntityId: '00000000-0000-4000-8000-000000000030',
    targetEntityId: '00000000-0000-4000-8000-000000000032',
    resolutionId: '00000000-0000-4000-8000-000000000034',
    actorId: '00000000-0000-4000-8000-000000000099',
    reason: 'No',
    evidenceId: '00000000-0000-4000-8000-000000000035',
    resolvedAt: '2026-01-01T00:01:00.000Z',
  });
  assert.deepEqual(result, { accepted: false, code: 'ACTOR_MISMATCH' });
});
