import assert from 'node:assert/strict';
import test from 'node:test';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
} from '@databreeze/domain/tenant-scope/v1';

import {
  IamInvitationService,
  type IamInvitationDigestPortV1,
  type IamInvitationDeliveryPortV1,
  type IamInvitationIdGeneratorV1,
  type IamInvitationTokenGeneratorV1,
  type IamPrincipalEmailLookupPortV1,
} from '../../../src/features/iam/application/invitation.service.js';
import type {
  IamInvitationRepositoryPortV1,
  IamInvitationTransactionPortV1,
} from '../../../src/features/iam/application/invitation-repository.port.js';
import type { IamMembershipRecordV1 } from '../../../src/features/iam/application/iam-repository.port.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { InvitationTokenV1 } from '@databreeze/domain/invitation/v1';

const ids = {
  owner: '00000000-0000-4000-8000-000000000311',
  invitee: '00000000-0000-4000-8000-000000000312',
  organization: '00000000-0000-4000-8000-000000000313',
  ownerMembership: '00000000-0000-4000-8000-000000000314',
  invitedMembership: '00000000-0000-4000-8000-000000000315',
  invitation: '00000000-0000-4000-8000-000000000316',
};
const now = new Date('2026-08-03T00:00:00.000Z');
const RAW_TOKEN = 'raw-token-abcdefghijklmnopqrstuvwxyz123456';

function stable(value: string) {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid invitation fixture identifier');
  return parsed.value;
}

function timestamp(value: string) {
  const parsed = parseStrictUtcTimestampV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid invitation fixture timestamp');
  return parsed.value;
}

function context(actorId: string, key: string) {
  const parsed = createIamTenantContextV1({
    tenantScope: { scopeType: 'organization', organizationId: ids.organization },
    actorId,
    correlationId: '00000000-0000-4000-8000-000000000317',
    idempotencyKey: key,
    authorizationEpoch: 1,
  });
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('invalid invitation fixture context');
  return parsed.value;
}

class Repository implements IamInvitationRepositoryPortV1 {
  memberships: IamMembershipRecordV1[] = [
    {
      id: stable(ids.ownerMembership),
      principalId: stable(ids.owner),
      scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
      roleId: 'owner',
      status: 'ACTIVE',
      revision: 1,
    },
    {
      id: stable(ids.invitedMembership),
      principalId: stable(ids.invitee),
      scope: { scopeType: 'organization', organizationId: stable(ids.organization) },
      roleId: 'viewer',
      status: 'INVITED',
      startsAt: timestamp(now.toISOString()),
      expiresAt: timestamp(new Date(now.getTime() + 86_400_000).toISOString()),
      revision: 1,
    },
  ];
  invitations: InvitationTokenV1[] = [];
  saveInvitationError?: string;
  saveMembershipError?: string;
  private tail: Promise<void> = Promise.resolve();

  async withTransaction<TValue>(
    _context: Parameters<IamInvitationRepositoryPortV1['withTransaction']>[0],
    work: (transaction: IamInvitationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const prior = this.tail;
    this.tail = new Promise<void>((resolve) => (release = resolve));
    await prior;
    const memberships = this.memberships.map((item) => ({ ...item, scope: { ...item.scope } }));
    const invitations = [...this.invitations];
    try {
      return await work({
        findMembershipForPrincipal: async (_context, principalId) => {
          await Promise.resolve();
          return this.memberships.find(
            (membership) =>
              membership.principalId === principalId && membership.status === 'ACTIVE',
          );
        },
        findMembershipById: async (_context, id) => {
          await Promise.resolve();
          return this.memberships.find((membership) => membership.id === id);
        },
        findInvitationByDigest: async (_context, digest) => {
          await Promise.resolve();
          return this.invitations.find((invitation) => invitation.tokenDigest === digest);
        },
        findActiveInvitationForMembership: async (_context, membershipId) => {
          await Promise.resolve();
          return this.invitations.find(
            (invitation) =>
              invitation.membershipId === membershipId && invitation.status === 'ACTIVE',
          );
        },
        saveInvitation: async (_context, invitation) => {
          await Promise.resolve();
          if (this.saveInvitationError) throw new Error(this.saveInvitationError);
          const index = this.invitations.findIndex((item) => item.id === invitation.id);
          if (index >= 0) {
            if (this.invitations[index]?.revision !== invitation.revision - 1)
              throw new Error('IAM_INVITATION_REVISION_CONFLICT');
            this.invitations[index] = invitation;
          } else {
            if (this.invitations.some((item) => item.tokenDigest === invitation.tokenDigest))
              throw new Error('IAM_INVITATION_CONFLICT');
            this.invitations.push(invitation);
          }
        },
        saveMembership: async (_context, membership) => {
          await Promise.resolve();
          if (this.saveMembershipError) throw new Error(this.saveMembershipError);
          const index = this.memberships.findIndex((item) => item.id === membership.id);
          if (index < 0 || this.memberships[index]?.revision !== membership.revision - 1)
            throw new Error('IAM_REVISION_CONFLICT');
          this.memberships[index] = membership;
        },
      });
    } catch (error) {
      this.memberships = memberships;
      this.invitations = invitations;
      throw error;
    } finally {
      release();
    }
  }
}

class EmailLookup implements IamPrincipalEmailLookupPortV1 {
  async findEmail(principalId: string): Promise<string | undefined> {
    await Promise.resolve();
    return principalId === ids.invitee ? 'invitee@example.com' : 'owner@example.com';
  }
}

class Digest implements IamInvitationDigestPortV1 {
  digestToken(value: string): string {
    return value === RAW_TOKEN ? 'a'.repeat(64) : 'c'.repeat(64);
  }

  digestEmail(value: string): string {
    return value === 'invitee@example.com' ? 'b'.repeat(64) : 'd'.repeat(64);
  }
}

class Delivery implements IamInvitationDeliveryPortV1 {
  readonly sent: Array<{ readonly token: string; readonly email: string }> = [];

  constructor(private readonly onDeliver?: () => void) {}

  async deliver(input: {
    readonly rawToken: string;
    readonly recipientEmail: string;
  }): Promise<void> {
    await Promise.resolve();
    this.onDeliver?.();
    this.sent.push({ token: input.rawToken, email: input.recipientEmail });
  }
}

function service(repository: Repository, delivery: IamInvitationDeliveryPortV1 = new Delivery()) {
  const idsQueue: string[] = [ids.invitation, ids.invitation];
  const idGenerator: IamInvitationIdGeneratorV1 = () => {
    const next = idsQueue.shift();
    if (!next) throw new Error('invitation id generator exhausted');
    return next;
  };
  const tokenGenerator: IamInvitationTokenGeneratorV1 = () => RAW_TOKEN;
  return {
    service: new IamInvitationService(
      repository,
      new EmailLookup(),
      idGenerator,
      tokenGenerator,
      new Digest(),
      delivery,
      () => now,
    ),
    delivery: delivery as Delivery,
  };
}

void test('[IAM-010] issuing an invitation delivers a raw token but returns only safe metadata', async () => {
  const repository = new Repository();
  const composed = service(repository);
  const result = await composed.service.issue(context(ids.owner, 'invitation-issue-001'), {
    membershipId: ids.invitedMembership,
    recipientEmail: 'INVITEE@example.com',
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) return;
  assert.equal(result.value.membershipId, stable(ids.invitedMembership));
  assert.equal('rawToken' in result.value, false);
  assert.equal('tokenDigest' in result.value, false);
  assert.deepEqual(composed.delivery.sent, [{ token: RAW_TOKEN, email: 'invitee@example.com' }]);
});

void test('[IAM-010] invitation persistence commits before raw-token delivery', async () => {
  const repository = new Repository();
  let persistedDuringDelivery = false;
  const composed = service(
    repository,
    new Delivery(() => {
      persistedDuringDelivery = repository.invitations[0]?.status === 'ACTIVE';
    }),
  );

  assert.equal(
    (
      await composed.service.issue(context(ids.owner, 'invitation-issue-persisted-first'), {
        membershipId: ids.invitedMembership,
        recipientEmail: 'invitee@example.com',
      })
    ).accepted,
    true,
  );
  assert.equal(persistedDuringDelivery, true);
});

void test('[IAM-010] delivery acknowledgement failures revoke and block the invitation bearer', async () => {
  const repository = new Repository();
  const composed = service(repository, {
    deliver: async () => {
      await Promise.resolve();
      throw new Error('provider acknowledgement unavailable');
    },
  });
  assert.deepEqual(
    await composed.service.issue(context(ids.owner, 'invitation-delivery-failure'), {
      membershipId: ids.invitedMembership,
      recipientEmail: 'invitee@example.com',
    }),
    { accepted: false, code: 'DELIVERY_UNAVAILABLE' },
  );
  assert.equal(repository.invitations[0]?.status, 'REVOKED');
  assert.deepEqual(
    await composed.service.accept(context(ids.invitee, 'invitation-delivery-accept'), RAW_TOKEN),
    { accepted: false, code: 'INVALID_TOKEN' },
  );
});

void test('[IAM-010] email mismatch and non-owner issuance are denied without persistence', async () => {
  const repository = new Repository();
  const composed = service(repository);
  assert.deepEqual(
    await composed.service.issue(context(ids.owner, 'invitation-issue-002'), {
      membershipId: ids.invitedMembership,
      recipientEmail: 'other@example.com',
    }),
    { accepted: false, code: 'RECIPIENT_MISMATCH' },
  );
  assert.deepEqual(
    await composed.service.issue(context(ids.invitee, 'invitation-issue-003'), {
      membershipId: ids.invitedMembership,
      recipientEmail: 'invitee@example.com',
    }),
    { accepted: false, code: 'SCOPE_DENIED' },
  );
  assert.equal(repository.invitations.length, 0);
});

void test('[IAM-010] invitation invariant conflicts map to a stable conflict outcome', async () => {
  const issueRepository = new Repository();
  issueRepository.saveInvitationError = 'IAM_INVITATION_SCOPE_IMMUTABLE';
  const issueComposed = service(issueRepository);
  assert.deepEqual(
    await issueComposed.service.issue(context(ids.owner, 'invitation-conflict-issue'), {
      membershipId: ids.invitedMembership,
      recipientEmail: 'invitee@example.com',
    }),
    { accepted: false, code: 'CONFLICT' },
  );

  const acceptRepository = new Repository();
  const acceptComposed = service(acceptRepository);
  assert.equal(
    (
      await acceptComposed.service.issue(context(ids.owner, 'invitation-conflict-accept-issue'), {
        membershipId: ids.invitedMembership,
        recipientEmail: 'invitee@example.com',
      })
    ).accepted,
    true,
  );
  acceptRepository.saveMembershipError = 'IAM_MEMBERSHIP_SCOPE_IMMUTABLE';
  assert.deepEqual(
    await acceptComposed.service.accept(
      context(ids.invitee, 'invitation-conflict-accept'),
      RAW_TOKEN,
    ),
    { accepted: false, code: 'CONFLICT' },
  );
});

void test('[IAM-010] acceptance binds token, principal, email, role, and scope then consumes once', async () => {
  const repository = new Repository();
  const composed = service(repository);
  const issued = await composed.service.issue(context(ids.owner, 'invitation-accept-001'), {
    membershipId: ids.invitedMembership,
    recipientEmail: 'invitee@example.com',
  });
  assert.equal(issued.accepted, true);
  const accepted = await composed.service.accept(
    context(ids.invitee, 'invitation-accept-002'),
    RAW_TOKEN,
  );
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) return;
  assert.equal(accepted.value.status, 'ACTIVE');
  assert.equal(repository.invitations[0]?.status, 'REDEEMED');
  assert.deepEqual(
    await composed.service.accept(context(ids.invitee, 'invitation-accept-003'), RAW_TOKEN),
    { accepted: false, code: 'INVALID_TOKEN' },
  );
});

void test('[IAM-010] concurrent acceptance has one winner and no duplicate activation', async () => {
  const repository = new Repository();
  const composed = service(repository);
  await composed.service.issue(context(ids.owner, 'invitation-race-001'), {
    membershipId: ids.invitedMembership,
    recipientEmail: 'invitee@example.com',
  });
  const results = await Promise.all([
    composed.service.accept(context(ids.invitee, 'invitation-race-002'), RAW_TOKEN),
    composed.service.accept(context(ids.invitee, 'invitation-race-003'), RAW_TOKEN),
  ]);
  assert.equal(results.filter((result) => result.accepted).length, 1);
  assert.equal(results.filter((result) => !result.accepted).length, 1);
  assert.equal(
    repository.memberships.find((item) => item.id === stable(ids.invitedMembership))?.revision,
    2,
  );
});
