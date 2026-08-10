import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import {
  createFailClosedDdaFoundationPortsV1,
  createLookupBackedDdaIaePortV1,
  createLookupBackedDdaDsmPortV1,
  createLookupBackedDdaAudPortV1,
  createLookupBackedDdaJraPortV1,
  createLookupBackedDdaBuaPortV1,
  createLookupBackedDdaDsoPortV1,
} from '../../../src/features/dda/adapter/fail-closed-foundation.adapters.js';

const scopeResult = parseTenantScopeV1({
  scopeType: 'project',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
});
assert.equal(scopeResult.accepted, true);
const tenantScope = scopeResult.accepted ? scopeResult.value : (null as never);

const reference = Object.freeze({
  id: '00000000-0000-4000-8000-000000000302',
  tenantScope,
});

void test('[DDA-001] default foundation ports fail closed when authorities are not composed', async () => {
  const ports = createFailClosedDdaFoundationPortsV1();
  await assert.rejects(
    () => ports.iae.requireArtifactVersion(reference),
    /DDA_FOUNDATION_UNAVAILABLE/u,
  );
  await assert.rejects(
    () => ports.dsm.requireDatasetVersion(reference),
    /DDA_FOUNDATION_UNAVAILABLE/u,
  );
  await assert.rejects(() => ports.jra.requireJob(reference), /DDA_FOUNDATION_UNAVAILABLE/u);
  await assert.rejects(
    () => ports.dso.requireCapabilityGrant(reference),
    /DDA_FOUNDATION_UNAVAILABLE/u,
  );
  await assert.rejects(
    () => ports.bua.requireAdmission(reference, 'refresh'),
    /DDA_FOUNDATION_UNAVAILABLE/u,
  );
  await assert.rejects(
    () =>
      ports.aud.emitContentSafeSummary({
        tenantScope,
        action: 'dda.test',
        outcome: 'DENIED',
        correlationId: '00000000-0000-4000-8000-000000000041',
        references: [reference.id],
      }),
    /DDA_FOUNDATION_UNAVAILABLE/u,
  );
});

void test('[DDA-001] lookup-backed IAE/DSM adapters require presence and tenant scope', async () => {
  const iae = createLookupBackedDdaIaePortV1({
    findArtifactVersion(input) {
      return Promise.resolve(
        input.id === reference.id &&
          input.tenantScope.organizationId === tenantScope.organizationId,
      );
    },
    findEvidenceReference() {
      return Promise.resolve(false);
    },
    addRetentionConstraint() {
      return Promise.resolve();
    },
  });
  await iae.requireArtifactVersion(reference);
  await assert.rejects(() => iae.requireEvidenceReference(reference), /DDA_AUTHORITY_MISSING/u);

  const dsm = createLookupBackedDdaDsmPortV1({
    findDatasetVersion() {
      return Promise.resolve(true);
    },
    findSemanticVersion() {
      return Promise.resolve(false);
    },
    findMetricVersion() {
      return Promise.resolve(true);
    },
  });
  await dsm.requireDatasetVersion(reference);
  await assert.rejects(() => dsm.requireSemanticVersion(reference), /DDA_AUTHORITY_MISSING/u);
});

void test('[DDA-001] lookup-backed JRA/BUA/DSO/AUD adapters fail closed on missing records', async () => {
  const jra = createLookupBackedDdaJraPortV1({
    findJob() {
      return Promise.resolve(false);
    },
    findResultManifest() {
      return Promise.resolve(true);
    },
  });
  await assert.rejects(() => jra.requireJob(reference), /DDA_AUTHORITY_MISSING/u);

  const bua = createLookupBackedDdaBuaPortV1({
    admit() {
      return Promise.resolve(false);
    },
  });
  await assert.rejects(() => bua.requireAdmission(reference, 'refresh'), /DDA_AUTHORITY_MISSING/u);

  const dso = createLookupBackedDdaDsoPortV1({
    findCapabilityGrant() {
      return Promise.resolve(true);
    },
    findProjection() {
      return Promise.resolve(false);
    },
  });
  await dso.requireCapabilityGrant(reference);
  await assert.rejects(() => dso.requireProjection(reference), /DDA_AUTHORITY_MISSING/u);

  let emitted = 0;
  const aud = createLookupBackedDdaAudPortV1({
    emitContentSafeSummary() {
      emitted += 1;
      return Promise.resolve();
    },
  });
  await aud.emitContentSafeSummary({
    tenantScope,
    action: 'dda.test',
    outcome: 'OK',
    correlationId: '00000000-0000-4000-8000-000000000041',
    references: [],
  });
  assert.equal(emitted, 1);
});
