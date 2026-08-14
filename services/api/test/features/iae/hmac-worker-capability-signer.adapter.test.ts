import { strict as assert } from 'node:assert';
import test from 'node:test';

import { parseStableIdentifierV1, parseTenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import { HmacWorkerCapabilitySignerAdapter } from '../../../src/features/iae/adapter/hmac-worker-capability-signer.adapter.js';

const scope = parseTenantScopeV1({
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000751',
  workspaceId: '00000000-0000-4000-8000-000000000752',
});
const id = parseStableIdentifierV1('00000000-0000-4000-8000-000000000753');
if (!scope.accepted || !id.accepted) throw new Error('invalid signer fixture');

void test('[JRA-006, JRA-023] HMAC worker capability tokens are opaque and content-free', async () => {
  const signer = new HmacWorkerCapabilitySignerAdapter('x'.repeat(32));
  const token = await signer.sign({
    capabilityId: id.value,
    grantType: 'JOB_INPUT',
    tenantScope: scope.value,
    jobId: id.value,
    attemptId: id.value,
    workerId: id.value,
    securityEpoch: 3,
    objectIds: ['opaque-source-object-000001'],
    objectBindings: [
      {
        objectId: 'opaque-source-object-000001',
        contentSha256: 'd'.repeat(64),
        contentLength: 4096,
      },
    ],
    action: 'READ',
    maxBytes: 4096,
    issuedAt: '2026-08-13T00:00:00.000Z' as never,
    expiresAt: '2026-08-13T00:05:00.000Z' as never,
  });
  assert.match(token, /^iae-cap-v1\./u);
  assert.equal(token.includes('opaque-source-object-000001'), false);
  assert.equal(token.includes('C:\\'), false);
  assert.equal(await signer.resolveCapabilityId(token), id.value);
  assert.equal(await signer.resolveCapabilityId(`${token}tampered`), undefined);
  assert.equal(
    await signer.verify(
      {
        capabilityId: id.value,
        grantType: 'JOB_INPUT',
        tenantScope: scope.value,
        jobId: id.value,
        attemptId: id.value,
        workerId: id.value,
        securityEpoch: 3,
        objectIds: ['opaque-source-object-000001'],
        objectBindings: [
          {
            objectId: 'opaque-source-object-000001',
            contentSha256: 'd'.repeat(64),
            contentLength: 4096,
          },
        ],
        action: 'READ',
        maxBytes: 4096,
        issuedAt: '2026-08-13T00:00:00.000Z' as never,
        expiresAt: '2026-08-13T00:05:00.000Z' as never,
      },
      token,
    ),
    true,
  );
  assert.equal(
    await signer.verify(
      {
        capabilityId: id.value,
        grantType: 'JOB_INPUT',
        tenantScope: scope.value,
        jobId: id.value,
        attemptId: id.value,
        workerId: id.value,
        securityEpoch: 3,
        objectIds: ['opaque-source-object-000001'],
        objectBindings: [
          {
            objectId: 'opaque-source-object-000001',
            contentSha256: 'd'.repeat(64),
            contentLength: 4096,
          },
        ],
        action: 'READ',
        maxBytes: 4096,
        issuedAt: '2026-08-13T00:00:00.000Z' as never,
        expiresAt: '2026-08-13T00:05:00.000Z' as never,
      },
      `${token}tampered`,
    ),
    false,
  );
  await assert.rejects(
    Promise.resolve().then(() => new HmacWorkerCapabilitySignerAdapter('short')),
    /IAE_WORKER_CAPABILITY_SECRET_TOO_SHORT/,
  );
});
