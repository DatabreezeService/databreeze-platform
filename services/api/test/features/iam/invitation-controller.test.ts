import assert from 'node:assert/strict';
import test from 'node:test';

import { IamInvitationController } from '../../../src/features/iam/api/invitation.controller.js';
import { InvitationProblemError } from '../../../src/features/iam/application/invitation-problem.error.js';
import type { IamInvitationService } from '../../../src/features/iam/application/invitation.service.js';

void test('[IAM-010] invitation controller forwards bounded issue and accept commands without returning bearer material', async () => {
  const calls: Array<readonly unknown[]> = [];
  const service = {
    issue: async (...input: unknown[]) => {
      await Promise.resolve();
      calls.push(input);
      return {
        accepted: true as const,
        value: {
          invitationId: 'invitation-id',
          membershipId: 'membership-id',
          expiresAt: '2026-08-10T00:00:00.000Z',
          deliveryStatus: 'DELIVERED' as const,
        },
      };
    },
    accept: async (...input: unknown[]) => {
      await Promise.resolve();
      calls.push(input);
      return {
        accepted: true as const,
        value: { id: 'membership-id', status: 'ACTIVE' },
      };
    },
  } as unknown as IamInvitationService;
  const context = { actorId: 'actor', tenantScope: { scopeType: 'organization' } } as never;
  const controller = new IamInvitationController(service, {
    resolve: async () => {
      await Promise.resolve();
      return context;
    },
  });
  const issued = await controller.issue(
    {},
    { membershipId: 'membership-id', recipientEmail: 'invitee@example.com' },
  );
  const accepted = await controller.accept(
    {},
    { token: 'raw-token-abcdefghijklmnopqrstuvwxyz123456' },
  );
  assert.deepEqual(issued, {
    invitationId: 'invitation-id',
    membershipId: 'membership-id',
    expiresAt: '2026-08-10T00:00:00.000Z',
    deliveryStatus: 'DELIVERED',
  });
  assert.deepEqual(accepted, { id: 'membership-id', status: 'ACTIVE' });
  assert.equal(calls.length, 2);
  assert.equal(
    (calls[0]?.[1] as { readonly recipientEmail?: string }).recipientEmail,
    'invitee@example.com',
  );
  assert.equal(calls[1]?.[1], 'raw-token-abcdefghijklmnopqrstuvwxyz123456');
});

void test('[IAM-010] invitation controller maps rejected application outcomes to safe problem codes', async () => {
  const service = {
    issue: async () => {
      await Promise.resolve();
      return { accepted: false as const, code: 'SCOPE_DENIED' as const };
    },
    accept: async () => {
      await Promise.resolve();
      return { accepted: false as const, code: 'INVALID_TOKEN' as const };
    },
  } as unknown as IamInvitationService;
  const controller = new IamInvitationController(service, {
    resolve: async () => {
      await Promise.resolve();
      return {} as never;
    },
  });
  await assert.rejects(
    controller.issue({}, { membershipId: 'membership-id', recipientEmail: 'invitee@example.com' }),
    (error: unknown) =>
      error instanceof InvitationProblemError && error.code === 'INVITATION_SCOPE_DENIED',
  );
  await assert.rejects(
    controller.accept({}, { token: 'raw-token-abcdefghijklmnopqrstuvwxyz123456' }),
    (error: unknown) =>
      error instanceof InvitationProblemError && error.code === 'INVITATION_REQUEST_REJECTED',
  );
});

void test('[IAM-010] invitation controller fails closed when service composition is incomplete', async () => {
  const controller = new IamInvitationController(undefined, {
    resolve: async () => {
      await Promise.resolve();
      return {} as never;
    },
  });
  await assert.rejects(
    controller.issue({}, { membershipId: 'membership-id', recipientEmail: 'invitee@example.com' }),
    (error: unknown) =>
      error instanceof InvitationProblemError && error.code === 'INVITATION_UNAVAILABLE',
  );
});
