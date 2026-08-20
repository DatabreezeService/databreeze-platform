import assert from 'node:assert/strict';
import test from 'node:test';
import type { DdaNotificationPreferencesCommand } from '@databreeze/contracts/v4';
import { InMemoryNotificationPreferencesAdapter } from '../../../src/features/dda/notification/in-memory-notification-preferences.adapter.js';
import {
  commandPreferencesFromSnapshotV1,
  defaultNotificationPreferencesV1,
} from '../../../src/features/dda/notification/notification-preferences.defaults.js';
import { fingerprintNotificationPreferencesV1 } from '../../../src/features/dda/notification/notification-preferences.port.js';
import type { NotificationTenantContextV1 } from '../../../src/features/dda/notification/notification-repository.port.js';
import { NotificationPreferencesControllerV1 } from '../../../src/features/dda/notification/notification-preferences.controller.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const context: NotificationTenantContextV1 = {
  actorId: '00000000-0000-4000-8000-000000000402',
  tenantScope: {
    scopeType: 'workspace',
    organizationId: '00000000-0000-4000-8000-000000000400',
    workspaceId: '00000000-0000-4000-8000-000000000401',
  },
};

function command(expectedRevision: number): DdaNotificationPreferencesCommand {
  const snapshot = defaultNotificationPreferencesV1(expectedRevision);
  return {
    schemaVersion: 4,
    expectedRevision,
    preferences: commandPreferencesFromSnapshotV1(snapshot),
  };
}

void test('[NCO-006/NCO-024] preferences default, replace, replay, and revision conflict are exact', async () => {
  const adapter = new InMemoryNotificationPreferencesAdapter();
  const initial = await adapter.get(context);
  assert.equal(initial.accepted, true);
  if (!initial.accepted) return;
  assert.equal(initial.value.preferences.length, 28);
  const next = command(1);
  const fingerprint = fingerprintNotificationPreferencesV1(next);
  const updated = await adapter.replace({
    context,
    command: next,
    idempotencyKey: 'notification-preferences-1',
    fingerprint,
  });
  assert.equal(updated.accepted, true);
  if (!updated.accepted) return;
  assert.equal(updated.value.revision, 2);
  const replay = await adapter.replace({
    context,
    command: next,
    idempotencyKey: 'notification-preferences-1',
    fingerprint,
  });
  assert.deepEqual(replay, { ...updated, replayed: true });
  assert.deepEqual(
    await adapter.replace({
      context,
      command: command(1),
      idempotencyKey: 'notification-preferences-2',
      fingerprint: fingerprintNotificationPreferencesV1(command(1)),
    }),
    { accepted: false, code: 'REVISION_CONFLICT' },
  );
});

void test('[NCO-018] mandatory security and billing preferences cannot be disabled', async () => {
  const adapter = new InMemoryNotificationPreferencesAdapter();
  const invalid = command(1);
  const security = invalid.preferences.find(
    (preference) => preference.category === 'SECURITY' && preference.channel === 'IN_APP',
  );
  assert.ok(security !== undefined);
  const changed: DdaNotificationPreferencesCommand = {
    ...invalid,
    preferences: invalid.preferences.map((preference) =>
      preference === security ? { ...preference, enabled: false } : preference,
    ),
  };
  assert.deepEqual(
    await adapter.replace({
      context,
      command: changed,
      idempotencyKey: 'notification-preferences-3',
      fingerprint: fingerprintNotificationPreferencesV1(changed),
    }),
    { accepted: false, code: 'INVALID_INPUT' },
  );
});

void test('[NCO-006] controller derives scope and rejects client authority', async () => {
  const adapter = new InMemoryNotificationPreferencesAdapter();
  const requestContext = {
    resolve: async () => {
      const resolved = createIamTenantContextV1({
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        correlationId: '00000000-0000-4000-8000-000000000405',
        idempotencyKey: 'notification-preferences-5',
        authorizationEpoch: 1,
        mfaReenrollmentRequired: false,
      });
      assert.equal(resolved.accepted, true);
      if (!resolved.accepted) throw new Error('TEST_CONTEXT_INVALID');
      return resolved.value;
    },
  };
  const controller = new NotificationPreferencesControllerV1(adapter, requestContext);
  const result = await controller.get({ headers: {} });
  assert.equal(result.schemaVersion, 4);
  await assert.rejects(
    () =>
      controller.replace(
        { body: {} },
        { ...command(1), workspaceId: context.tenantScope.workspaceId },
        'notification-preferences-4',
      ),
    (error: unknown) => error instanceof Error && error.message.includes('HTTP_400'),
  );
});
