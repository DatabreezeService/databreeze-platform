/* eslint-disable @typescript-eslint/require-await -- test doubles mirror async ports. */
import assert from 'node:assert/strict';
import test from 'node:test';

import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';
import { HttpException } from '@nestjs/common';

import { IamHierarchyController } from '../../../src/features/iam/api/hierarchy.controller.js';
import type { IamHierarchyService } from '../../../src/features/iam/application/hierarchy.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';

const ids = {
  principal: '00000000-0000-4000-8000-000000000141',
  correlation: '00000000-0000-4000-8000-000000000142',
  organization: '00000000-0000-4000-8000-000000000143',
  workspace: '00000000-0000-4000-8000-000000000144',
  project: '00000000-0000-4000-8000-000000000145',
};

function stable(value: string) {
  const result = parseStableIdentifierV1(value);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid hierarchy controller fixture identifier');
  return result.value;
}

function tenantContext() {
  const result = createIamTenantContextV1({
    tenantScope: { scopeType: 'organization', organizationId: stable(ids.organization) },
    actorId: stable(ids.principal),
    correlationId: stable(ids.correlation),
    idempotencyKey: 'hierarchy-controller-001',
    authorizationEpoch: 1,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error('invalid hierarchy controller fixture context');
  return result.value;
}

void test('[IAM-001, IAM-003] hierarchy controller forwards authenticated context and strips body identity fields', async () => {
  const calls: Array<readonly unknown[]> = [];
  const service = {
    getOrganization: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: ids.organization } };
    },
    listWorkspaces: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: [] as const };
    },
    createWorkspace: async (...input: unknown[]) => {
      calls.push(input);
      return {
        accepted: true as const,
        value: {
          workspace: {
            id: ids.workspace,
            organizationId: ids.organization,
            name: 'Operations',
            status: 'ACTIVE',
            dataMode: 'HYBRID',
            createdAt: '2026-08-17T09:00:00.000Z',
          },
          defaultProject: { id: ids.project, kind: 'INTERNAL', name: 'Private project' },
          dataMode: 'HYBRID' as const,
        },
      };
    },
    getWorkspace: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: ids.workspace } };
    },
    listProjects: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: [] as const };
    },
    createProject: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: ids.project } };
    },
    getProject: async (...input: unknown[]) => {
      calls.push(input);
      return { accepted: true as const, value: { id: ids.project } };
    },
  } as unknown as IamHierarchyService;
  const context = tenantContext();
  const controller = new IamHierarchyController(service, {
    resolve: async () => context,
  });

  assert.deepEqual(await controller.getOrganization({}, ids.organization), {
    accepted: true,
    value: { id: ids.organization },
  });
  assert.deepEqual(await controller.listWorkspaces({}, ids.organization), {
    accepted: true,
    value: [],
  });
  assert.deepEqual(
    await controller.createWorkspace({}, ids.organization, {
      schemaVersion: 4,
      name: 'Operations',
    }),
    {
      schemaVersion: 4,
      workspace: {
        id: ids.workspace,
        organizationId: ids.organization,
        name: 'Operations',
        status: 'ACTIVE',
        dataMode: 'HYBRID',
        createdAt: '2026-08-17T09:00:00.000Z',
      },
      defaultProject: { id: ids.project, kind: 'INTERNAL', name: 'Private project' },
    },
  );
  // IAM-027: the closed command contract rejects body identity/policy fields outright.
  await assert.rejects(
    controller.createWorkspace({}, ids.organization, {
      schemaVersion: 4,
      name: 'Operations',
      organizationId: 'body-must-not-be-used',
    } as never),
    (error: unknown) => error instanceof HttpException && error.getStatus() === 400,
  );
  assert.deepEqual(await controller.getWorkspace({}, ids.workspace), {
    accepted: true,
    value: { id: ids.workspace },
  });
  assert.deepEqual(await controller.listProjects({}, ids.workspace), {
    accepted: true,
    value: [],
  });
  assert.deepEqual(
    await controller.createProject({}, ids.workspace, {
      kind: 'CLIENT',
      name: 'Northwind',
      workspaceId: 'body-must-not-be-used',
    } as unknown as { readonly kind: 'CLIENT'; readonly name: string }),
    { accepted: true, value: { id: ids.project } },
  );
  assert.deepEqual(await controller.getProject({}, ids.project), {
    accepted: true,
    value: { id: ids.project },
  });
  assert.equal(calls.length, 7);
  for (const call of calls) assert.equal(call[0], context);
  assert.equal(calls[2]?.[1], ids.organization);
  assert.equal(calls[2]?.[2], 'Operations');
  assert.equal(calls[5]?.[1], ids.workspace);
  assert.equal(calls[5]?.[2], 'CLIENT');
  assert.equal(calls[5]?.[3], 'Northwind');
});

void test('[IAM-003, IAM-019] hierarchy controller preserves safe rejected service results', async () => {
  const service = {
    getOrganization: async () => ({ accepted: false as const, code: 'NOT_FOUND' as const }),
    listWorkspaces: async () => ({ accepted: false as const, code: 'SCOPE_DENIED' as const }),
    createWorkspace: async () => ({ accepted: false as const, code: 'CONFLICT' as const }),
    getWorkspace: async () => ({ accepted: false as const, code: 'NOT_FOUND' as const }),
    listProjects: async () => ({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    createProject: async () => ({ accepted: false as const, code: 'INVALID_KIND' as const }),
    getProject: async () => ({ accepted: false as const, code: 'NOT_FOUND' as const }),
  } as unknown as IamHierarchyService;
  const controller = new IamHierarchyController(service, {
    resolve: async () => tenantContext(),
  });
  assert.deepEqual(await controller.getOrganization({}, ids.organization), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  const statuses: number[] = [];
  const reply = {
    code(status: number) {
      statuses.push(status);
      return this;
    },
  };
  assert.deepEqual(await controller.getOrganization({}, ids.organization, reply as never), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  assert.deepEqual(await controller.getWorkspace({}, ids.workspace, reply as never), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  assert.deepEqual(await controller.getProject({}, ids.project, reply as never), {
    accepted: false,
    code: 'NOT_FOUND',
  });
  assert.deepEqual(statuses, [404, 404, 404]);
  assert.deepEqual(
    await controller.createProject({}, ids.workspace, { kind: 'CLIENT', name: 'x' }),
    {
      accepted: false,
      code: 'INVALID_KIND',
    },
  );
});
