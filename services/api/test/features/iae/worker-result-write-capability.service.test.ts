/* eslint-disable @typescript-eslint/require-await -- deterministic authority doubles. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { HmacWorkerCapabilitySignerAdapter } from '../../../src/features/iae/adapter/hmac-worker-capability-signer.adapter.js';
import { InMemoryWorkerObjectCapabilityRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-worker-object-capability-repository.adapter.js';
import type { IaeWorkerSecurityEpochPortV1 } from '../../../src/features/iae/application/worker-object-capability.port.js';
import { IaeWorkerResultWriteCapabilityService } from '../../../src/features/iae/application/worker-result-write-capability.service.js';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix}` as StableIdentifierV1;
const scope = Object.freeze({
  scopeType: 'workspace',
  organizationId: id('000000000601'),
  workspaceId: id('000000000602'),
}) satisfies TenantScopeV1;
const now = '2026-08-14T01:00:00.000Z';
const sources = Object.freeze([id('000000000611')]);
const processorVersion = 'dda-widget@4';
const lineageHash = createHash('sha256')
  .update(JSON.stringify({ sourceArtifactVersionIds: sources, processorVersion }), 'utf8')
  .digest('hex');

function fixture(current = true) {
  const repository = new InMemoryWorkerObjectCapabilityRepositoryAdapter();
  const signer = new HmacWorkerCapabilitySignerAdapter('prepared-result-capability-secret-000001');
  const epoch: IaeWorkerSecurityEpochPortV1 = { isCurrent: async () => current };
  let next = 620;
  const service = new IaeWorkerResultWriteCapabilityService(
    repository,
    signer,
    epoch,
    () => now,
    () => id(String(next++).padStart(12, '0')),
  );
  const identity = Object.freeze({
    workerId: id('000000000603'),
    tenantScope: scope,
    securityEpoch: 7,
    correlationId: id('000000000604'),
  });
  const preparation = Object.freeze({
    submissionId: id('000000000605'),
    attemptId: id('000000000606'),
    jobId: id('000000000607'),
    tenantScope: scope,
    executionDescriptorId: id('000000000608'),
    executionDescriptorHash: 'a'.repeat(64),
    outputPolicyHash: 'b'.repeat(64),
    expiresAt: '2026-08-14T01:05:00.000Z',
    outputs: Object.freeze([
      Object.freeze({
        outputName: 'widget_result',
        objectId: 'result-object-601',
        mediaType: 'application/json',
        contentSha256: 'c'.repeat(64),
        byteLength: 128,
        maxBytes: 4096,
        allowedMediaTypes: Object.freeze(['application/json']),
        sourceArtifactVersionIds: sources,
        sourceLineageHash: lineageHash,
        processorVersion,
        dataMode: 'Cloud' as const,
        payloadClass: 'RECONSTRUCTABLE_DERIVED_CONTENT' as const,
      }),
    ]),
  });
  return { service, repository, signer, identity, preparation };
}

void test('[IAE-024, JRA-023] issues signed exact output capability with server-derived artifact placement and lineage bindings', async () => {
  const subject = fixture();
  const issued = await subject.service.issue(subject.identity, subject.preparation);
  assert.equal(issued.accepted, true);
  if (!issued.accepted) return;
  assert.equal(issued.value.length, 1);
  const capability = issued.value[0]!;
  assert.equal(capability.outputName, 'widget_result');
  assert.equal(capability.objectId, 'result-object-601');
  assert.equal('tenantScope' in capability, false);
  assert.equal('bucket' in capability, false);
  const stored = await subject.repository.findByCapability(scope, capability.capabilityId);
  assert.ok(stored?.resultFinalizationBinding);
  assert.equal(stored?.resultFinalizationBinding?.submissionId, subject.preparation.submissionId);
  assert.equal(
    stored?.resultFinalizationBinding?.executionDescriptorHash,
    subject.preparation.executionDescriptorHash,
  );
  assert.deepEqual(
    stored?.resultFinalizationBinding?.sourceArtifactVersionIds,
    subject.preparation.outputs[0]?.sourceArtifactVersionIds,
  );
  assert.ok(stored?.resultFinalizationBinding?.artifactId);
  assert.ok(stored?.resultFinalizationBinding?.artifactVersionId);
  assert.ok(stored?.resultFinalizationBinding?.placementId);
  assert.ok(stored?.resultFinalizationBinding?.lineageId);
  if (!stored?.resultFinalizationBinding) throw new Error('stored binding missing');
  assert.equal(
    await subject.signer.verify(
      {
        capabilityId: stored.capabilityId,
        grantType: stored.grantType,
        tenantScope: stored.tenantScope,
        jobId: stored.jobId,
        attemptId: stored.attemptId,
        workerId: stored.workerId,
        securityEpoch: stored.securityEpoch,
        objectIds: stored.objectIds,
        objectBindings: stored.objectBindings,
        action: stored.action,
        maxBytes: stored.maxBytes,
        issuedAt: stored.issuedAt,
        expiresAt: stored.expiresAt,
        resultFinalizationBinding: stored.resultFinalizationBinding,
      },
      capability.signedCapability,
    ),
    true,
  );
});

void test('[IAE-024] exact replay returns the same bindings and changed reuse conflicts', async () => {
  const subject = fixture();
  const first = await subject.service.issue(subject.identity, subject.preparation);
  const replay = await subject.service.issue(subject.identity, subject.preparation);
  assert.deepEqual(replay, first);
  const changed = await subject.service.issue(subject.identity, {
    ...subject.preparation,
    outputs: [{ ...subject.preparation.outputs[0]!, byteLength: 129 }],
  });
  assert.deepEqual(changed, { accepted: false, code: 'CAPABILITY_REPLAY' });
});

void test('[IAE-024] stale epoch, cross-scope, false lineage and Local cloud output fail closed', async () => {
  const stale = fixture(false);
  assert.deepEqual(await stale.service.issue(stale.identity, stale.preparation), {
    accepted: false,
    code: 'SECURITY_EPOCH_REVOKED',
  });
  const subject = fixture();
  const wrongScope = {
    ...subject.preparation,
    tenantScope: { ...scope, workspaceId: id('000000000699') },
  } as const;
  const badLineage = {
    ...subject.preparation,
    outputs: [{ ...subject.preparation.outputs[0]!, sourceLineageHash: 'd'.repeat(64) }],
  } as const;
  const local = {
    ...subject.preparation,
    outputs: [{ ...subject.preparation.outputs[0]!, dataMode: 'Local' }],
  } as never;
  assert.deepEqual(await subject.service.issue(subject.identity, wrongScope), {
    accepted: false,
    code: 'INVALID_SCOPE',
  });
  assert.deepEqual(await subject.service.issue(subject.identity, badLineage), {
    accepted: false,
    code: 'INVALID_PREPARATION',
  });
  assert.deepEqual(await subject.service.issue(subject.identity, local), {
    accepted: false,
    code: 'INVALID_PREPARATION',
  });
});
