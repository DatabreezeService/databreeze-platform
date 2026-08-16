/* eslint-disable @typescript-eslint/require-await -- HTTP fixture ports. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';

import type { StableIdentifierV1, TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { createApiApplication } from '../../../src/bootstrap.js';
import { HmacWorkerCapabilitySignerAdapter } from '../../../src/features/iae/adapter/hmac-worker-capability-signer.adapter.js';
import { InMemoryWorkerObjectByteStoreAdapter } from '../../../src/features/iae/adapter/in-memory-worker-object-byte-store.adapter.js';
import { InMemoryWorkerObjectCapabilityRepositoryAdapter } from '../../../src/features/iae/adapter/in-memory-worker-object-capability-repository.adapter.js';
import type { IaeWorkerCapabilityRecordV1 } from '../../../src/features/iae/application/worker-object-capability.port.js';
import type { IaeWorkerResultFinalizationPortV1 } from '../../../src/features/iae/application/worker-result-finalization.port.js';

const id = (value: string) => `00000000-0000-4000-8000-${value}` as StableIdentifierV1;
const scope = Object.freeze({
  scopeType: 'workspace',
  organizationId: id('000000000501'),
  workspaceId: id('000000000502'),
}) satisfies TenantScopeV1;
const bytes = new TextEncoder().encode('{"total":125000}');
const digest = createHash('sha256').update(bytes).digest('hex');

async function application(authenticated = true, finalization?: IaeWorkerResultFinalizationPortV1) {
  const repository = new InMemoryWorkerObjectCapabilityRepositoryAdapter();
  const signer = new HmacWorkerCapabilitySignerAdapter('worker-controller-secret-00000000000001');
  const identity = Object.freeze({
    workerId: id('000000000503'),
    tenantScope: scope,
    securityEpoch: 9,
    correlationId: id('000000000504'),
  });
  const record: IaeWorkerCapabilityRecordV1 = Object.freeze({
    schemaVersion: 1,
    grantType: 'JOB_OUTPUT',
    capabilityId: id('000000000505'),
    attemptId: id('000000000506'),
    jobId: id('000000000507'),
    workerId: identity.workerId,
    securityEpoch: 9,
    tenantScope: scope,
    objectIds: Object.freeze(['result-object-501']),
    objectBindings: Object.freeze([Object.freeze({ objectId: 'result-object-501' })]),
    action: 'WRITE',
    maxBytes: 1024,
    issuedAt: '2026-08-13T00:00:00.000Z' as never,
    expiresAt: '2099-08-14T00:05:00.000Z' as never,
  });
  await repository.save(record);
  const signedCapability = await signer.sign({
    capabilityId: record.capabilityId,
    grantType: record.grantType,
    tenantScope: record.tenantScope,
    jobId: record.jobId,
    attemptId: record.attemptId,
    workerId: record.workerId,
    securityEpoch: record.securityEpoch,
    objectIds: record.objectIds,
    objectBindings: record.objectBindings,
    action: record.action,
    maxBytes: record.maxBytes,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
  });
  const { app } = await createApiApplication({
    runtimeMode: 'test',
    workerCapabilityRepository: repository,
    workerCapabilitySigner: signer,
    workerCapabilityVerifier: signer,
    workerCapabilityReferenceResolver: signer,
    workerSecurityEpoch: { isCurrent: async () => true },
    workerRequestAuthenticator: {
      authenticate: async () => (authenticated ? identity : undefined),
    },
    workerObjectByteStore: new InMemoryWorkerObjectByteStoreAdapter(),
    ...(finalization === undefined ? {} : { iaeWorkerResultFinalization: finalization }),
  } as never);
  return { app, signedCapability };
}

void test('[IAE-024] authenticated octet-stream upload derives identity and capability ID server-side', async () => {
  const fixture = await application();
  try {
    const response = await fixture.app.inject({
      method: 'PUT',
      url: '/internal/iae/worker/objects/result-object-501',
      headers: {
        authorization: 'Bearer opaque-service-account',
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.byteLength),
        'x-content-sha256': digest,
        'x-databreeze-attempt-id': id('000000000506'),
        'x-databreeze-signed-capability': fixture.signedCapability,
      },
      payload: Buffer.from(bytes),
    });
    assert.equal(response.statusCode, 200, response.body);
    const body: {
      readonly receipt: {
        readonly contentSha256: string;
        readonly contentLength: number;
      };
    } = response.json();
    assert.equal(body.receipt.contentSha256, digest);
    assert.equal(body.receipt.contentLength, bytes.byteLength);
    assert.equal('capabilityId' in body.receipt, false);
  } finally {
    await fixture.app.close();
  }
});

void test('[IAE-024] finalization derives identity and capability ID and accepts no worker lineage authority', async () => {
  let observed: Parameters<IaeWorkerResultFinalizationPortV1['finalize']> | undefined;
  const finalization: IaeWorkerResultFinalizationPortV1 = {
    finalize: async (...input) => {
      observed = input;
      return {
        accepted: true,
        value: {
          schemaVersion: 1,
          attestationId: id('000000000521'),
          tenantScope: scope,
          jobId: id('000000000507'),
          attemptId: id('000000000506'),
          executionDescriptorId: id('000000000522'),
          executionDescriptorHash: 'e'.repeat(64),
          submissionId: id('000000000523'),
          artifactVersionId: id('000000000524'),
          contentSha256: digest,
          contentLength: bytes.byteLength,
          mediaType: 'application/json',
          sourceLineageHash: 'f'.repeat(64),
          outputPolicyHash: 'a'.repeat(64),
          finalizedAt: '2026-08-13T18:00:00.000Z' as never,
        },
      };
    },
  };
  const fixture = await application(true, finalization);
  try {
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/internal/iae/worker/results/finalize',
      headers: {
        authorization: 'Bearer opaque-service-account',
        'content-type': 'application/json',
      },
      payload: {
        submissionId: id('000000000523'),
        signedCapability: fixture.signedCapability,
        attemptId: id('000000000506'),
        executionDescriptorId: id('000000000522'),
        objectId: 'result-object-501',
        contentSha256: digest,
        contentLength: bytes.byteLength,
        mediaType: 'application/json',
      },
    });
    assert.equal(response.statusCode, 200, response.body);
    const responseBody: {
      readonly attestation: { readonly attestationId: string };
    } = response.json();
    assert.equal(responseBody.attestation.attestationId, id('000000000521'));
    assert.equal(observed?.[0].workerId, id('000000000503'));
    assert.equal(observed?.[1].capabilityId, id('000000000505'));
    assert.equal('sourceArtifactVersionIds' in (observed?.[1] ?? {}), false);
    assert.equal('sourceLineageHash' in (observed?.[1] ?? {}), false);
  } finally {
    await fixture.app.close();
  }
});

void test('[IAE-024] unauthenticated exact-object transfer is non-enumerating and stores nothing', async () => {
  const fixture = await application(false);
  try {
    const response = await fixture.app.inject({
      method: 'PUT',
      url: '/internal/iae/worker/objects/result-object-501',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.byteLength),
        'x-content-sha256': digest,
        'x-databreeze-attempt-id': id('000000000506'),
        'x-databreeze-signed-capability': fixture.signedCapability,
      },
      payload: Buffer.from(bytes),
    });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['content-type']?.startsWith('application/problem+json'), true);
    assert.equal(response.body.includes('result-object-501'), false);
  } finally {
    await fixture.app.close();
  }
});
