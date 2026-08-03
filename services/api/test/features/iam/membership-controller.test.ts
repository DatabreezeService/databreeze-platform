/* eslint-disable @typescript-eslint/require-await -- controller double mirrors async services. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { IamMembershipController } from '../../../src/features/iam/api/membership.controller.js';
import type { IamMembershipService } from '../../../src/features/iam/application/membership.service.js';

void test('[IAM-004] membership controller forwards invitation and transition fields without authority decisions in the client', async () => {
  const calls: Array<readonly unknown[]> = [];
  const service = {
    list: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: [] as const };
    },
    invite: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: 'invitation' } };
    },
    transition: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: 'membership' } };
    },
    accept: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: 'accepted-membership' } };
    },
    transferOwnership: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: 'transferred-membership' } };
    },
  } as unknown as IamMembershipService;
  const context = { tenantScope: { scopeType: 'organization', organizationId: 'org' } } as never;
  const controller = new IamMembershipController(service, { resolve: async () => context });
  assert.deepEqual(await controller.list({}), { accepted: true, value: [] });
  assert.deepEqual(
    await controller.invite(
      {},
      {
        principalId: 'principal',
        scope: { scopeType: 'organization', organizationId: 'org' },
        roleId: 'viewer',
      },
    ),
    { accepted: true, value: { id: 'invitation' } },
  );
  assert.deepEqual(
    await controller.transition({}, 'membership-id', {
      expectedRevision: 1,
      status: 'SUSPENDED',
    }),
    { accepted: true, value: { id: 'membership' } },
  );
  assert.deepEqual(await controller.accept({}, 'membership-id', { expectedRevision: 1 }), {
    accepted: true,
    value: { id: 'accepted-membership' },
  });
  assert.deepEqual(
    await controller.transferOwnership({}, 'membership-id', { expectedRevision: 1 }),
    { accepted: true, value: { id: 'transferred-membership' } },
  );
  assert.equal(calls.length, 5);
  assert.equal(
    (calls[1]?.[1] as { readonly principalId?: unknown } | undefined)?.principalId,
    'principal',
  );
  assert.equal(calls[2]?.[1], 'membership-id');
  assert.equal(calls[2]?.[2], 1);
  assert.equal(calls[2]?.[3], 'SUSPENDED');
  assert.equal(calls[3]?.[1], 'membership-id');
  assert.equal(calls[3]?.[2], 1);
  assert.equal(calls[4]?.[1], 'membership-id');
  assert.equal(calls[4]?.[2], 1);
});

void test('[IAM-004] membership controller fails closed when durable membership authority is not configured', async () => {
  const controller = new IamMembershipController(undefined, { resolve: async () => ({}) as never });
  assert.deepEqual(await controller.list({}), { accepted: false, code: 'UNAVAILABLE' });
});
