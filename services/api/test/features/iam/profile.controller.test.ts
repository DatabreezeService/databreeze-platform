import assert from 'node:assert/strict';
import test from 'node:test';

import { ProfileController } from '../../../src/features/iam/api/profile.controller.js';
import { InMemoryProfileMutationAdapter } from '../../../src/features/iam/adapter/in-memory-profile-mutation.adapter.js';
import { ProfileMutationService } from '../../../src/features/iam/application/profile-mutation.service.js';

const actorId = '00000000-0000-4000-8000-000000000001' as never;
const context = {
  actorId,
  tenantScope: { scopeType: 'organization', organizationId: actorId },
  correlationId: '00000000-0000-4000-8000-000000000002' as never,
  authorizationEpoch: 1,
  mfaReenrollmentRequired: false,
  idempotencyKey: 'request-context-key',
} as never;

function controller(): ProfileController {
  const adapter = new InMemoryProfileMutationAdapter();
  adapter.seed(actorId, { displayName: 'Mai', locale: 'vi-VN', revision: 1 });
  return new ProfileController(new ProfileMutationService(adapter), {
    resolve: async () => context,
  });
}

void test('[IAM-002/IAM-016] profile controller derives actor and returns the generated v4 result', async () => {
  const result = await controller().update(
    { headers: { 'idempotency-key': 'profile-controller-1' } },
    { schemaVersion: 4, displayName: 'Mai Quynh', locale: 'en', expectedRevision: 1 },
  );
  assert.deepEqual(result, {
    schemaVersion: 4,
    user: {
      id: actorId,
      displayName: 'Mai Quynh',
      locale: 'en',
      revision: 2,
    },
  });
});

void test('[IAM-002] profile controller rejects browser-authored identity authority', async () => {
  await assert.rejects(
    controller().update({ headers: { 'idempotency-key': 'profile-controller-2' } }, {
      schemaVersion: 4,
      displayName: 'Mai Quynh',
      locale: 'en',
      expectedRevision: 1,
      userId: actorId,
    } as never),
    /HTTP_400/,
  );
});
