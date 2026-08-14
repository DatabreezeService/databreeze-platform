import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryNotificationRepositoryAdapter } from '../../../src/features/dda/notification/in-memory-notification-repository.adapter.js';
import { DdaNotificationControllerV1 } from '../../../src/features/dda/notification/notification.controller.js';
import {
  fingerprintNotificationStateCommandV1,
  type NotificationStateCommandInputV1,
  type NotificationStateCommandPortV1,
} from '../../../src/features/dda/notification/notification-state-command.port.js';
import type { DdaNotification } from '@databreeze/contracts/v3';
import type { NotificationRepositoryPortV1 } from '../../../src/features/dda/notification/notification-repository.port.js';
import { UnavailableNotificationRepositoryAdapter } from '../../../src/features/dda/notification/unavailable-notification-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';
import { RequestTenantContextProblemError } from '../../../src/platform/http/request-tenant-context.port.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000101',
  workspace: '00000000-0000-4000-8000-000000000102',
  actor: '00000000-0000-4000-8000-000000000103',
  otherActor: '00000000-0000-4000-8000-000000000104',
  first: '00000000-0000-4000-8000-000000000105',
  second: '00000000-0000-4000-8000-000000000106',
  other: '00000000-0000-4000-8000-000000000107',
  correlation: '00000000-0000-4000-8000-000000000108',
};

function context() {
  const result = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    },
    actorId: ids.actor,
    correlationId: ids.correlation,
    idempotencyKey: 'notification-test',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid notification test context');
  return result.value;
}

function requestContext(): RequestTenantContextPortV1 {
  return { resolve: () => Promise.resolve(context()) };
}

function notification(input: {
  readonly id: string;
  readonly recipientId?: string;
  readonly createdAt: string;
  readonly state?: 'UNREAD' | 'READ' | 'ARCHIVED' | 'DISMISSED';
  readonly revision?: number;
  readonly labelEn?: string;
}) {
  return {
    schemaVersion: 3 as const,
    id: input.id,
    recipientId: input.recipientId ?? ids.actor,
    organizationId: ids.organization,
    workspaceId: ids.workspace,
    subjectId: input.id,
    kind: 'SYNC_FAILED' as const,
    labelVi: 'Đồng bộ cần chú ý',
    labelEn: input.labelEn ?? 'Sync needs attention',
    action: 'OPEN_DATA' as const,
    createdAt: input.createdAt,
    correlationId: ids.correlation,
    state: input.state ?? 'UNREAD',
    revision: input.revision ?? 1,
  };
}

function repository() {
  const value = new InMemoryNotificationRepositoryAdapter();
  value.seed([
    notification({ id: ids.first, createdAt: '2026-08-12T00:02:00.000Z' }),
    notification({
      id: ids.second,
      createdAt: '2026-08-12T00:01:00.000Z',
      state: 'READ',
    }),
    notification({
      id: ids.other,
      recipientId: ids.otherActor,
      createdAt: '2026-08-12T00:03:00.000Z',
    }),
  ]);
  return value;
}

void test('[NCO-001][IAM-002] list filters recipient and workspace before applying the opaque cursor', async () => {
  const controller = new DdaNotificationControllerV1(repository(), requestContext());

  const firstPage = await controller.list({}, { limit: 1 });
  assert.equal(firstPage.unreadCount, 1);
  assert.equal(firstPage.items.length, 1);
  assert.equal(firstPage.items[0]?.id, ids.first);
  assert.equal(Object.hasOwn(firstPage.items[0] ?? {}, 'recipientId'), false);
  assert.equal(typeof firstPage.nextCursor, 'string');

  const secondPage = await controller.list({}, { limit: 1, cursor: firstPage.nextCursor ?? '' });
  assert.equal(secondPage.items.length, 1);
  assert.equal(secondPage.items[0]?.id, ids.second);
  assert.equal(secondPage.unreadCount, 1);
});

void test('[NCO-012] read mutation is actor filtered and uses the revision precondition', async () => {
  const controller = new DdaNotificationControllerV1(repository(), requestContext());

  const updated = await controller.setState({}, ids.first, {
    schemaVersion: 3,
    state: 'READ',
    expectedRevision: 1,
    idempotencyKey: 'notification-read-1',
  });
  assert.equal(updated.state, 'READ');
  assert.equal(updated.revision, 2);

  const replayed = await controller.setState({}, ids.first, {
    schemaVersion: 3,
    state: 'READ',
    expectedRevision: 1,
    idempotencyKey: 'notification-read-1',
  });
  assert.deepEqual(replayed, updated);
  await assert.rejects(
    () =>
      controller.setState({}, ids.other, {
        schemaVersion: 3,
        state: 'READ',
        expectedRevision: 1,
        idempotencyKey: 'notification-other-1',
      }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_404',
  );
});

void test('[NCO-012][NCO-024] generated v3 state commands reach the server-owned command port for every terminal state', async () => {
  const calls: NotificationStateCommandInputV1[] = [];
  const commandPort: NotificationStateCommandPortV1 = {
    setStateCommand(input) {
      calls.push(input);
      return Promise.resolve({
        accepted: true as const,
        value: notification({
          id: input.notificationId,
          state: input.targetState,
          revision: input.expectedRevision + 1,
          createdAt: '2026-08-12T00:04:00.000Z',
        }) as unknown as DdaNotification,
      });
    },
  };
  const controller = new DdaNotificationControllerV1(repository(), requestContext(), commandPort);

  for (const [state, idempotencyKey] of [
    ['ARCHIVED', 'notification-archive-1'],
    ['DISMISSED', 'notification-dismiss-1'],
  ] as const) {
    const result = await controller.setState({}, ids.first, {
      schemaVersion: 3,
      state,
      expectedRevision: 1,
      idempotencyKey,
    });
    assert.equal(result.state, state);
  }

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.targetState, 'ARCHIVED');
  assert.equal(calls[1]?.targetState, 'DISMISSED');
  const firstCall = calls[0];
  assert.ok(firstCall);
  assert.equal(firstCall.fingerprint, fingerprintNotificationStateCommandV1(firstCall));
  assert.equal(firstCall.fingerprint.length, 64);
  await assert.rejects(
    () =>
      controller.setState({ body: { actorId: ids.otherActor } }, ids.first, {
        schemaVersion: 3,
        state: 'READ',
        expectedRevision: 1,
        idempotencyKey: 'notification-client-authority',
      }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_400',
  );
});

void test('[NCO-001] production composition reports unavailable instead of a false empty page', async () => {
  const repositoryPort: NotificationRepositoryPortV1 =
    new UnavailableNotificationRepositoryAdapter();
  const controller = new DdaNotificationControllerV1(repositoryPort, requestContext());

  await assert.rejects(
    () => controller.list({}, { limit: 20 }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_503',
  );
});

void test('[NCO-001] repository failures report unavailable instead of a false empty page', async () => {
  const throwingRepository: NotificationRepositoryPortV1 = {
    createIntent: () => Promise.reject(new Error('database offline')),
    list: () => Promise.reject(new Error('database offline')),
    setState: () => Promise.reject(new Error('database offline')),
  };
  const controller = new DdaNotificationControllerV1(throwingRepository, requestContext());

  await assert.rejects(
    () => controller.list({}, { limit: 20 }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_503',
  );
});

void test('[NCO-003] unsafe committed content fails closed before it reaches the client', async () => {
  const unsafe = new InMemoryNotificationRepositoryAdapter();
  unsafe.seed([
    notification({
      id: ids.first,
      createdAt: '2026-08-12T00:02:00.000Z',
      labelEn: 'C:\\secret.txt',
    }),
  ]);
  const controller = new DdaNotificationControllerV1(unsafe, requestContext());

  await assert.rejects(
    () => controller.list({}, { limit: 20 }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_503',
  );
});

void test('[IAM-002] rejects client-supplied tenant or actor authority fields and malformed cursors', async () => {
  const controller = new DdaNotificationControllerV1(repository(), requestContext());

  await assert.rejects(
    () => controller.list({ workspaceId: ids.workspace }, { limit: 20 }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_400',
  );
  await assert.rejects(
    () => controller.list({}, { limit: 20, cursor: 'not-an-opaque-cursor' }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_400',
  );
  await assert.rejects(
    () => controller.list({ query: { actorId: ids.actor } }, { limit: 20 }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_400',
  );
  await assert.rejects(
    () => controller.list({}, { limit: 51 }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_400',
  );
});

void test('[NCO-012] notification mutation requires the generated command schema version', async () => {
  const controller = new DdaNotificationControllerV1(repository(), requestContext());

  await assert.rejects(
    () =>
      controller.setState({}, ids.first, {
        schemaVersion: 2 as never,
        state: 'READ',
        expectedRevision: 1,
        idempotencyKey: 'notification-invalid-schema',
      }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_400',
  );
});

void test('[IAM-002] maps authentication failure without leaking notification state', async () => {
  const requestTenantContext: RequestTenantContextPortV1 = {
    resolve: () => Promise.reject(new RequestTenantContextProblemError('AUTHENTICATION_FAILED')),
  };
  const controller = new DdaNotificationControllerV1(repository(), requestTenantContext);

  await assert.rejects(
    () => controller.list({}, { limit: 20 }),
    (error: unknown) => error instanceof Error && error.message === 'HTTP_401',
  );
});
