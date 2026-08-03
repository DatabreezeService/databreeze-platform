import assert from 'node:assert/strict';
import test from 'node:test';

import { IamBootstrapController } from '../../../src/features/iam/api/bootstrap.controller.js';
import type { IdentityBootstrapService } from '../../../src/features/iam/application/identity-bootstrap.service.js';

const bootstrap = {
  user: {
    schemaVersion: 1 as const,
    id: '00000000-0000-4000-8000-000000000001' as never,
    status: 'ACTIVE' as const,
    displayName: 'Nguyen An',
    locale: 'vi-VN' as const,
    securityEpoch: 1,
    createdAt: '2026-01-01T00:00:00.000Z' as never,
  },
  organization: {
    schemaVersion: 1 as const,
    id: '00000000-0000-4000-8000-000000000002' as never,
    name: "Nguyen An's DataBreeze",
    personal: true,
    status: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00.000Z' as never,
  },
  workspace: {
    schemaVersion: 1 as const,
    id: '00000000-0000-4000-8000-000000000003' as never,
    organizationId: '00000000-0000-4000-8000-000000000002' as never,
    name: 'Personal workspace',
    status: 'ACTIVE' as const,
    authorizationEpoch: 1,
    createdAt: '2026-01-01T00:00:00.000Z' as never,
  },
  project: {
    schemaVersion: 1 as const,
    id: '00000000-0000-4000-8000-000000000004' as never,
    organizationId: '00000000-0000-4000-8000-000000000002' as never,
    workspaceId: '00000000-0000-4000-8000-000000000003' as never,
    kind: 'INTERNAL' as const,
    name: 'Personal project',
    status: 'ACTIVE' as const,
    createdAt: '2026-01-01T00:00:00.000Z' as never,
  },
  membership: {
    schemaVersion: 1 as const,
    id: '00000000-0000-4000-8000-000000000005' as never,
    principalType: 'USER' as const,
    principalId: '00000000-0000-4000-8000-000000000001' as never,
    scope: {
      scopeType: 'organization' as const,
      organizationId: '00000000-0000-4000-8000-000000000002' as never,
    },
    roleId: 'owner' as const,
    status: 'ACTIVE' as const,
    revision: 1,
  },
};

void test('[IAM-001, IAM-009] bootstrap controller derives the actor from the authenticated request context', async () => {
  const calls: unknown[] = [];
  const service = {
    find: async (actorId: unknown) => {
      calls.push(actorId);
      return { accepted: true as const, value: bootstrap };
    },
  } as unknown as IdentityBootstrapService;
  const context = {
    actorId: bootstrap.user.id,
    tenantScope: {
      scopeType: 'workspace' as const,
      organizationId: bootstrap.organization.id,
      workspaceId: bootstrap.workspace.id,
    },
    authorizationEpoch: 1,
    mfaRequired: true,
  } as never;
  const controller = new IamBootstrapController(service, { resolve: async () => context });
  const result = await controller.bootstrap({});
  assert.equal((result as { readonly accepted: boolean }).accepted, true);
  assert.deepEqual(calls, [bootstrap.user.id]);
  assert.equal((result as { readonly value: { readonly user: { readonly id: string } } }).value.user.id, bootstrap.user.id);
});

void test('[IAM-001] bootstrap controller fails closed when durable identity storage is unavailable', async () => {
  const controller = new IamBootstrapController(undefined, { resolve: async () => ({}) as never });
  assert.deepEqual(await controller.bootstrap({}), { accepted: false, code: 'UNAVAILABLE' });
});
