/* eslint-disable @typescript-eslint/require-await -- deterministic credential doubles. */
import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { S3CloudOriginalSignerAdapter } from '../../../src/features/iae/adapter/cloud-original-signer.adapter.js';

const scope = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000731',
  workspaceId: '00000000-0000-4000-8000-000000000732',
});
if (!scope.accepted) throw new Error('invalid test scope');

void test('[IAE-008] S3 signer emits a real SigV4 descriptor only with provisioned credentials', async () => {
  const signer = new S3CloudOriginalSignerAdapter(
    { bucket: 'databreeze-test-originals', region: 'ap-southeast-1' },
    {
      resolve: async () => ({
        accessKeyId: 'AKIAEXAMPLE12345678',
        secretAccessKey: 'test-secret-key-that-is-long-enough',
      }),
    },
    () => new Date('2026-08-13T00:00:00.000Z'),
  );
  const result = await signer.sign({
    tenantScope: scope.value,
    artifactVersionId: '00000000-0000-4000-8000-000000000733' as never,
    placementReference: 'iae-object-ref-000001',
    issuedAt: '2026-08-13T00:00:00.000Z' as never,
    expiresAt: '2026-08-13T00:02:00.000Z' as never,
    disposition: 'ORIGINAL',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  const url = new URL(result.value.signedDescriptor);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.hostname, 's3.ap-southeast-1.amazonaws.com');
  assert.equal(url.pathname, '/databreeze-test-originals/iae-object-ref-000001');
  assert.equal(url.searchParams.get('X-Amz-Algorithm'), 'AWS4-HMAC-SHA256');
  assert.equal(url.searchParams.get('X-Amz-Expires'), '120');
  assert.equal(result.value.signedDescriptor.includes('C:\\'), false);
});

void test('cloud signing fails closed without credentials or for an overlong lease', async () => {
  const signer = new S3CloudOriginalSignerAdapter(
    { bucket: 'databreeze-test-originals', region: 'ap-southeast-1' },
    { resolve: async () => undefined },
  );
  const input = {
    tenantScope: scope.value,
    artifactVersionId: '00000000-0000-4000-8000-000000000733' as never,
    placementReference: 'iae-object-ref-000001',
    issuedAt: '2026-08-13T00:00:00.000Z' as never,
    expiresAt: '2026-08-13T00:10:00.000Z' as never,
    disposition: 'ORIGINAL' as const,
  };
  assert.deepEqual(await signer.sign(input), { accepted: false, code: 'SIGNING_REJECTED' });
  assert.deepEqual(
    await new S3CloudOriginalSignerAdapter(
      { bucket: 'databreeze-test-originals', region: 'ap-southeast-1' },
      { resolve: async () => undefined },
    ).sign({ ...input, expiresAt: '2026-08-13T00:02:00.000Z' as never }),
    { accepted: false, code: 'SIGNING_UNAVAILABLE' },
  );
});
