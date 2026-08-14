/* eslint-disable @typescript-eslint/require-await -- Promise-shaped authority test doubles. */

import assert from 'node:assert/strict';
import test from 'node:test';

import type { DashboardAuthorizationPortV1 } from '../../../src/features/dda/dashboard/application/dashboard-authorization.port.js';
import { DashboardNotificationResourceAuthorizationAdapter } from '../../../src/features/dda/notification/dashboard-notification-resource-authorization.adapter.js';
import type { CommittedNotificationEventV1 } from '../../../src/features/dda/notification/notification-projection-consumer.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000611',
  workspace: '00000000-0000-4000-8000-000000000612',
  recipient: '00000000-0000-4000-8000-000000000613',
  dashboard: '00000000-0000-4000-8000-000000000614',
  event: '00000000-0000-4000-8000-000000000615',
  correlation: '00000000-0000-4000-8000-000000000616',
};

const event: CommittedNotificationEventV1 = {
  committed: true,
  tenantScope: {
    scopeType: 'workspace',
    organizationId: ids.organization,
    workspaceId: ids.workspace,
  },
  eventId: ids.event,
  eventHash: 'a'.repeat(64),
  subjectId: ids.dashboard,
  kind: 'SYNC_FAILED',
  unresolved: true,
  createdAt: '2026-08-14T08:00:00.000Z',
  correlationId: ids.correlation,
};

function authorization(decision: { readonly allowed: boolean }): DashboardAuthorizationPortV1 {
  return {
    authorizeDashboardAction: async () => ({
      ...decision,
      grantsDatasetAccess: decision.allowed,
    }),
    projectVisibleFields: async () => [],
  };
}

void test('[NCO-004][NCO-005] canonical dashboard authorization receives exact tenant, recipient, and subject scope', async () => {
  let received: Parameters<DashboardAuthorizationPortV1['authorizeDashboardAction']>[0] | undefined;
  const canonical: DashboardAuthorizationPortV1 = {
    authorizeDashboardAction: async (input) => {
      received = input;
      return { allowed: true, grantsDatasetAccess: true };
    },
    projectVisibleFields: async () => [],
  };
  const adapter = new DashboardNotificationResourceAuthorizationAdapter(canonical);

  assert.deepEqual(await adapter.authorize({ event, recipientId: ids.recipient }), {
    accepted: true,
  });
  assert.equal(received?.actorId, ids.recipient);
  assert.equal(received?.dashboardId, ids.dashboard);
  assert.equal(received?.action, 'VIEW');
  assert.deepEqual(received?.tenantScope, event.tenantScope);
  assert.equal(received?.context?.actorId, ids.recipient);
  assert.equal(received?.context?.tenantScope.scopeType, 'workspace');
});

void test('[NCO-004][NCO-005] canonical denial and unavailable errors never authorize delivery', async () => {
  const denied = new DashboardNotificationResourceAuthorizationAdapter(
    authorization({ allowed: false }),
  );
  assert.deepEqual(await denied.authorize({ event, recipientId: ids.recipient }), {
    accepted: false,
    code: 'DENIED',
  });

  const unavailable = new DashboardNotificationResourceAuthorizationAdapter({
    authorizeDashboardAction: async () => {
      throw new Error('IAM_UNAVAILABLE');
    },
    projectVisibleFields: async () => [],
  });
  assert.deepEqual(await unavailable.authorize({ event, recipientId: ids.recipient }), {
    accepted: false,
    code: 'UNAVAILABLE',
  });
});
