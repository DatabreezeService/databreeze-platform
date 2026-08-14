import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import { InMemoryIamRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-iam-repository.adapter.js';
import type { IamMembershipRecordV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import { IamNotificationRecipientResolverAdapter } from '../../../src/features/dda/notification/iam-notification-recipient-resolver.adapter.js';
import type {
  CommittedNotificationEventV1,
  NotificationResourceAuthorizationPortV1,
} from '../../../src/features/dda/notification/notification-projection-consumer.js';

const ids = {
  organization: '00000000-0000-4000-8000-000000000301',
  otherOrganization: '00000000-0000-4000-8000-000000000302',
  workspace: '00000000-0000-4000-8000-000000000303',
  siblingWorkspace: '00000000-0000-4000-8000-000000000304',
  subject: '00000000-0000-4000-8000-000000000305',
  activeRecipient: '00000000-0000-4000-8000-000000000306',
  organizationRecipient: '00000000-0000-4000-8000-000000000307',
  invitedRecipient: '00000000-0000-4000-8000-000000000308',
  suspendedRecipient: '00000000-0000-4000-8000-000000000309',
  expiredRecipient: '00000000-0000-4000-8000-000000000310',
  siblingRecipient: '00000000-0000-4000-8000-000000000311',
  otherTenantRecipient: '00000000-0000-4000-8000-000000000312',
  event: '00000000-0000-4000-8000-000000000313',
  correlation: '00000000-0000-4000-8000-000000000314',
};

const now = '2026-08-14T08:00:00.000Z';

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_INVALID_IDENTIFIER');
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseStrictUtcTimestampV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('TEST_INVALID_TIMESTAMP');
  return parsed.value;
}

function membership(
  id: string,
  scope: TenantScopeV1,
  status: IamMembershipRecordV1['status'] = 'ACTIVE',
  expiresAt?: string,
): IamMembershipRecordV1 {
  return {
    id: stable(id),
    principalId: stable(id),
    scope,
    roleId: 'viewer',
    status,
    revision: 1,
    ...(expiresAt === undefined ? {} : { expiresAt: timestamp(expiresAt) }),
  };
}

function event(): CommittedNotificationEventV1 {
  return {
    committed: true,
    tenantScope: {
      scopeType: 'workspace',
      organizationId: ids.organization,
      workspaceId: ids.workspace,
    },
    eventId: ids.event,
    eventHash: 'a'.repeat(64),
    subjectId: ids.subject,
    kind: 'SYNC_FAILED',
    unresolved: true,
    createdAt: now,
    correlationId: ids.correlation,
  };
}

const allowResourceAuthorization: NotificationResourceAuthorizationPortV1 = {
  authorize: () => Promise.resolve({ accepted: true as const }),
};

void test('[NCO-004][NCO-005] IAM resolver returns only active memberships in the exact tenant scope', async () => {
  const organizationScope: TenantScopeV1 = {
    scopeType: 'organization',
    organizationId: stable(ids.organization),
  };
  const workspaceScope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  };
  const siblingScope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.siblingWorkspace),
  };
  const otherTenantScope: TenantScopeV1 = {
    scopeType: 'organization',
    organizationId: stable(ids.otherOrganization),
  };
  const repository = new InMemoryIamRepositoryAdapter();
  repository.seed([
    membership(ids.activeRecipient, workspaceScope),
    membership(ids.organizationRecipient, organizationScope),
    membership(ids.invitedRecipient, workspaceScope, 'INVITED'),
    membership(ids.suspendedRecipient, workspaceScope, 'SUSPENDED'),
    membership(ids.expiredRecipient, workspaceScope, 'ACTIVE', '2026-08-13T08:00:00.000Z'),
    membership(ids.siblingRecipient, siblingScope),
    membership(ids.otherTenantRecipient, otherTenantScope),
  ]);

  const resolver = new IamNotificationRecipientResolverAdapter(
    repository,
    allowResourceAuthorization,
    () => new Date(now),
  );
  const result = await resolver.resolve(event());

  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('TEST_RESOLUTION_REJECTED');
  assert.deepEqual(
    result.recipients.map((recipient) => recipient.recipientId),
    [ids.activeRecipient, ids.organizationRecipient],
  );
  for (const recipient of result.recipients) {
    assert.equal(recipient.proof.organizationId, ids.organization);
    assert.equal(recipient.proof.workspaceId, ids.workspace);
    assert.equal(recipient.proof.eventId, ids.event);
    assert.equal(recipient.proof.subjectId, ids.subject);
  }
});

void test('[NCO-004][NCO-005] resource authorization can suppress an active tenant member', async () => {
  const workspaceScope: TenantScopeV1 = {
    scopeType: 'workspace',
    organizationId: stable(ids.organization),
    workspaceId: stable(ids.workspace),
  };
  const repository = new InMemoryIamRepositoryAdapter();
  repository.seed([
    membership(ids.activeRecipient, workspaceScope),
    membership(ids.organizationRecipient, workspaceScope),
  ]);
  const resourceAuthorization: NotificationResourceAuthorizationPortV1 = {
    authorize: ({ recipientId }) =>
      Promise.resolve(
        recipientId === ids.activeRecipient
          ? { accepted: false as const, code: 'DENIED' as const }
          : { accepted: true as const },
      ),
  };

  const resolver = new IamNotificationRecipientResolverAdapter(
    repository,
    resourceAuthorization,
    () => new Date(now),
  );
  const result = await resolver.resolve(event());

  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('TEST_RESOLUTION_REJECTED');
  assert.deepEqual(
    result.recipients.map((recipient) => recipient.recipientId),
    [ids.organizationRecipient],
  );
});
