import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryProfileMutationAdapter } from '../../../src/features/iam/adapter/in-memory-profile-mutation.adapter.js';
import { ProfileMutationService } from '../../../src/features/iam/application/profile-mutation.service.js';

const userId = '00000000-0000-4000-8000-000000000001' as never;

function service(): ProfileMutationService {
  const adapter = new InMemoryProfileMutationAdapter();
  adapter.seed(userId, { displayName: 'Mai', locale: 'vi-VN', revision: 1 });
  return new ProfileMutationService(adapter);
}

void test('[IAM-016/IAM-018] profile update is revisioned and idempotent', async () => {
  const profile = service();
  const first = await profile.update({
    actorId: userId,
    displayName: 'Mai Quynh',
    locale: 'en',
    expectedRevision: 1,
    idempotencyKey: 'profile-command-1',
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;
  assert.equal(first.value.revision, 2);
  const replay = await profile.update({
    actorId: userId,
    displayName: 'Mai Quynh',
    locale: 'en',
    expectedRevision: 1,
    idempotencyKey: 'profile-command-1',
  });
  assert.deepEqual(replay, { ...first, replayed: true });
  assert.deepEqual(
    await profile.update({
      actorId: userId,
      displayName: 'Changed again',
      locale: 'en',
      expectedRevision: 1,
      idempotencyKey: 'profile-command-2',
    }),
    { accepted: false, code: 'REVISION_CONFLICT' },
  );
});

void test('[IAM-018] changed payload reuse is rejected and malformed input is not persisted', async () => {
  const profile = service();
  await profile.update({
    actorId: userId,
    displayName: 'Mai Quynh',
    locale: 'en',
    expectedRevision: 1,
    idempotencyKey: 'profile-command-1',
  });
  assert.deepEqual(
    await profile.update({
      actorId: userId,
      displayName: 'Other',
      locale: 'vi-VN',
      expectedRevision: 1,
      idempotencyKey: 'profile-command-1',
    }),
    { accepted: false, code: 'IDEMPOTENCY_CONFLICT' },
  );
  assert.deepEqual(
    await profile.update({
      actorId: userId,
      displayName: '',
      locale: 'vi-VN',
      expectedRevision: 2,
      idempotencyKey: 'profile-command-2',
    }),
    { accepted: false, code: 'INVALID_INPUT' },
  );
});
