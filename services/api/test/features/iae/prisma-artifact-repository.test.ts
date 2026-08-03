import { strict as assert } from 'node:assert';
import test from 'node:test';

import {
  createArtifactVersionV1,
  createContentPlacementV1,
  createEvidenceReferenceV1,
} from '@databreeze/domain/artifact/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaArtifactRepositoryAdapter,
  type ArtifactDatabaseClientV1,
  type ArtifactVersionDatabaseRowV1,
  type ContentPlacementDatabaseRowV1,
  type EvidenceDatabaseRowV1,
} from '../../../src/features/iae/adapter/prisma-artifact-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

function id(value: string): StableIdentifierV1 {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture id rejected');
  return result.value;
}
const organizationId = id('00000000-0000-4000-8000-000000000501');
const workspaceId = id('00000000-0000-4000-8000-000000000502');
const siblingWorkspaceId = id('00000000-0000-4000-8000-000000000509');
const artifactId = id('00000000-0000-4000-8000-000000000503');
const versionId = id('00000000-0000-4000-8000-000000000504');
const placementId = id('00000000-0000-4000-8000-000000000505');
const evidenceId = id('00000000-0000-4000-8000-000000000506');

function contextForWorkspace(candidateWorkspaceId: StableIdentifierV1, key: string) {
  const result = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000507',
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: candidateWorkspaceId },
    authorizationEpoch: 1,
    correlationId: '00000000-0000-4000-8000-000000000508',
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('fixture context rejected');
  return result.value;
}

function context(key: string) {
  return contextForWorkspace(workspaceId, key);
}

function client(
  versions: ArtifactVersionDatabaseRowV1[],
  placements: ContentPlacementDatabaseRowV1[],
  evidence: EvidenceDatabaseRowV1[],
  options: { readonly forceVersionConflict?: boolean } = {},
): ArtifactDatabaseClientV1 {
  return {
    artifactVersion: {
      create(input) {
        const persisted = { ...input.data } as ArtifactVersionDatabaseRowV1;
        versions.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique(input) {
        return Promise.resolve(
          versions.find((candidate) => candidate.id === input.where.id) ?? null,
        );
      },
      update(input) {
        const current = versions.find((candidate) => candidate.id === input.where.id);
        if (!current) throw new Error('fixture version not found');
        const next = { ...current, ...input.data };
        versions[versions.indexOf(current)] = next;
        return Promise.resolve(next);
      },
      updateMany(input) {
        const current = versions.find((candidate) => candidate.id === input.where.id);
        if (
          options.forceVersionConflict ||
          !current ||
          current.status !== input.where.status ||
          current.scanState !== input.where.scanState
        )
          return Promise.resolve({ count: 0 });
        const next = { ...current, ...input.data };
        versions[versions.indexOf(current)] = next;
        return Promise.resolve({ count: 1 });
      },
    },
    contentPlacement: {
      create(input) {
        const persisted = { ...input.data } as ContentPlacementDatabaseRowV1;
        placements.push(persisted);
        return Promise.resolve(persisted);
      },
      findMany(input) {
        return Promise.resolve(
          placements.filter(
            (candidate) => candidate.artifactVersionId === input.where['artifactVersionId'],
          ),
        );
      },
      findUnique(input) {
        return Promise.resolve(
          placements.find((candidate) => candidate.id === input.where.id) ?? null,
        );
      },
      update(input) {
        const current = placements.find((candidate) => candidate.id === input.where.id);
        if (!current) throw new Error('fixture placement not found');
        const next = { ...current, ...input.data };
        placements[placements.indexOf(current)] = next;
        return Promise.resolve(next);
      },
      updateMany(input) {
        const current = placements.find((candidate) => candidate.id === input.where.id);
        if (!current || current.revision !== input.where.revision)
          return Promise.resolve({ count: 0 });
        const next = { ...current, ...input.data };
        placements[placements.indexOf(current)] = next;
        return Promise.resolve({ count: 1 });
      },
    },
    evidenceReference: {
      create(input) {
        const persisted = { ...input.data } as EvidenceDatabaseRowV1;
        evidence.push(persisted);
        return Promise.resolve(persisted);
      },
      findUnique(input) {
        return Promise.resolve(
          evidence.find((candidate) => candidate.id === input.where.id) ?? null,
        );
      },
      findMany(input) {
        return Promise.resolve(
          evidence.filter(
            (candidate) => candidate.artifactVersionId === input.where['artifactVersionId'],
          ),
        );
      },
    },
    $transaction(work) {
      return work(this);
    },
  };
}

void test('[IAE-003, IAE-004, IAE-005, IAM-009] Prisma artifact adapter keeps placement and evidence tenant scoped', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const artifact = createArtifactVersionV1({
    artifactId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'e'.repeat(64),
    byteSize: 8,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: createdAt.value,
  });
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) throw new Error('fixture artifact rejected');
  const placement = createContentPlacementV1({
    placementId,
    artifactVersion: artifact.value,
    tenantScope: artifact.value.tenantScope,
    kind: 'CLOUD',
    opaqueReference: 'opaque-reference-1234',
    contentSha256: artifact.value.contentSha256,
  });
  const evidenceRef = createEvidenceReferenceV1({
    evidenceId,
    artifactVersion: artifact.value,
    tenantScope: artifact.value.tenantScope,
    coordinate: { kind: 'ROW', row: 1 },
  });
  assert.equal(placement.accepted, true);
  assert.equal(evidenceRef.accepted, true);
  if (!placement.accepted || !evidenceRef.accepted) throw new Error('fixture child rejected');
  const placements: ContentPlacementDatabaseRowV1[] = [];
  const evidence: EvidenceDatabaseRowV1[] = [];
  const repository = new PrismaArtifactRepositoryAdapter(client([], placements, evidence));
  await repository.saveVersion(context('version'), artifact.value);
  const quarantined = await repository.updateVersionStatus(
    context('quarantine'),
    versionId,
    'QUARANTINED',
  );
  assert.equal(quarantined?.status, 'QUARANTINED');
  await repository.savePlacement(context('placement'), placement.value);
  await repository.savePlacement(context('placement-repeat'), placement.value);
  await repository.saveEvidence(context('evidence'), evidenceRef.value);
  await repository.saveEvidence(context('evidence-repeat'), evidenceRef.value);
  const conflictingEvidence = createEvidenceReferenceV1({
    evidenceId,
    artifactVersion: artifact.value,
    tenantScope: artifact.value.tenantScope,
    coordinate: { kind: 'ROW', row: 2 },
  });
  assert.equal(conflictingEvidence.accepted, true);
  if (!conflictingEvidence.accepted) return;
  await assert.rejects(
    repository.saveEvidence(context('evidence-conflict'), conflictingEvidence.value),
    /IAE_IMMUTABLE_EVIDENCE/,
  );
  assert.equal((await repository.listPlacements(context('list-placement'), versionId)).length, 1);
  assert.equal((await repository.listEvidence(context('list-evidence'), versionId)).length, 1);
});

void test('[IAE-009, IAE-010] Prisma artifact status transitions reject a scan-state race', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const artifact = createArtifactVersionV1({
    artifactId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'a'.repeat(64),
    byteSize: 8,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: createdAt.value,
  });
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) throw new Error('fixture artifact rejected');
  const versions: ArtifactVersionDatabaseRowV1[] = [];
  const repository = new PrismaArtifactRepositoryAdapter(
    client(versions, [], [], { forceVersionConflict: true }),
  );
  await repository.saveVersion(context('status-race-version'), artifact.value);
  await assert.rejects(
    repository.updateVersionStatus(context('status-race-update'), versionId, 'QUARANTINED'),
    /IAE_REVISION_CONFLICT/u,
  );
  assert.equal(versions[0]?.status, 'ACTIVE');
});

void test('[IAE-009, IAE-010] direct Prisma artifact status updates persist the supplied scan state', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const artifact = createArtifactVersionV1({
    artifactId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'b'.repeat(64),
    byteSize: 8,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: createdAt.value,
  });
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) throw new Error('fixture artifact rejected');
  const versions: ArtifactVersionDatabaseRowV1[] = [];
  const repository = new PrismaArtifactRepositoryAdapter(client(versions, [], []));
  await repository.saveVersion(context('scan-version'), artifact.value);

  const clean = await repository.updateVersionStatus(
    context('scan-clean'),
    versionId,
    'ACTIVE',
    'CLEAN',
  );

  assert.equal(clean?.scanState, 'CLEAN');
  assert.equal(versions[0]?.scanState, 'CLEAN');
});

void test('[IAE-020, DSO-006] Prisma placement adapter rejects a stale revision after a concurrent update', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const artifact = createArtifactVersionV1({
    artifactId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId },
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'f'.repeat(64),
    byteSize: 8,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: createdAt.value,
  });
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) throw new Error('fixture artifact rejected');
  const placement = createContentPlacementV1({
    placementId,
    artifactVersion: artifact.value,
    tenantScope: artifact.value.tenantScope,
    kind: 'CLOUD',
    opaqueReference: 'opaque-reference-1234',
    contentSha256: artifact.value.contentSha256,
  });
  assert.equal(placement.accepted, true);
  if (!placement.accepted) throw new Error('fixture placement rejected');
  const placements: ContentPlacementDatabaseRowV1[] = [];
  const repository = new PrismaArtifactRepositoryAdapter(client([], placements, []));
  await repository.saveVersion(context('stale-version'), artifact.value);
  await repository.savePlacement(context('stale-placement'), placement.value);

  const updated = {
    ...placement.value,
    available: false,
    revision: placement.value.revision + 1,
  };
  await repository.updatePlacement(context('first-update'), updated);

  await assert.rejects(
    repository.updatePlacement(context('stale-update'), {
      ...placement.value,
      available: true,
      revision: placement.value.revision + 1,
    }),
    /IAE_REVISION_CONFLICT/u,
  );
  assert.equal(placements[0]?.available, false);
  assert.equal(placements[0]?.revision, 2);
});

void test('[IAE-003, IAM-009] Prisma placement updates authorize the persisted workspace scope', async () => {
  const createdAt = parseStrictUtcTimestampV1('2026-01-01T00:00:00.000Z');
  assert.equal(createdAt.accepted, true);
  if (!createdAt.accepted) throw new Error('fixture timestamp rejected');
  const artifact = createArtifactVersionV1({
    artifactId,
    versionId,
    tenantScope: { scopeType: 'workspace', organizationId, workspaceId: siblingWorkspaceId },
    sourceKind: 'FILE',
    dataMode: 'Hybrid',
    contentSha256: 'c'.repeat(64),
    byteSize: 8,
    mediaType: 'text/csv',
    displayName: 'orders.csv',
    createdAt: createdAt.value,
  });
  assert.equal(artifact.accepted, true);
  if (!artifact.accepted) throw new Error('fixture artifact rejected');
  const placement = createContentPlacementV1({
    placementId,
    artifactVersion: artifact.value,
    tenantScope: artifact.value.tenantScope,
    kind: 'CLOUD',
    opaqueReference: 'opaque-reference-5678',
    contentSha256: artifact.value.contentSha256,
  });
  assert.equal(placement.accepted, true);
  if (!placement.accepted) throw new Error('fixture placement rejected');
  const repository = new PrismaArtifactRepositoryAdapter(client([], [], []));
  await repository.saveVersion(contextForWorkspace(siblingWorkspaceId, 'scope-version'), artifact.value);
  await repository.savePlacement(
    contextForWorkspace(siblingWorkspaceId, 'scope-placement'),
    placement.value,
  );

  await assert.rejects(
    repository.updatePlacement(context('scope-forgery'), {
      ...placement.value,
      tenantScope: context('scope-forgery-input').tenantScope,
      available: false,
      revision: 2,
    }),
    /IAE_SCOPE_NARROWING_REQUIRED/u,
  );
});
