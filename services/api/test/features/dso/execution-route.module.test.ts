import assert from 'node:assert/strict';
import test from 'node:test';

import { PrismaExecutionRouteRepositoryAdapter } from '../../../src/features/dso/adapter/prisma-execution-route-repository.adapter.js';
import { DsoModule } from '../../../src/features/dso/dso.module.js';
import { EXECUTION_ROUTE_AUTHORITY_PORT } from '../../../src/features/dso/application/execution-route.service.js';
import { EXECUTION_ROUTE_REPOSITORY_PORT } from '../../../src/features/dso/application/execution-route-repository.port.js';

function valueProvider(module: ReturnType<typeof DsoModule.register>, token: symbol): unknown {
  const match = module.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
  assert.notEqual(match, undefined);
  if (!match || !('useValue' in match)) throw new Error('provider is not a value provider');
  return match.useValue as unknown;
}

void test('[DSO-024/026/027] module publishes the narrow route authority with durable storage when configured', () => {
  const registered = DsoModule.register({
    executionRouteDatabase: {} as never,
    executionRouteWorkspacePolicyAuthority: {
      resolveCurrentWorkspacePolicy: () => Promise.resolve(undefined),
    },
  });
  assert.ok(
    valueProvider(registered, EXECUTION_ROUTE_REPOSITORY_PORT) instanceof
      PrismaExecutionRouteRepositoryAdapter,
  );
  assert.ok(registered.exports?.includes(EXECUTION_ROUTE_AUTHORITY_PORT));
});

void test('[DSO-024/026] default route authority remains callable and fails closed without current policy', async () => {
  const registered = DsoModule.register();
  const authority = valueProvider(registered, EXECUTION_ROUTE_AUTHORITY_PORT) as {
    authorize(input: unknown): Promise<unknown>;
  };
  assert.deepEqual(
    await authority.authorize({
      tenantScope: {
        scopeType: 'workspace',
        organizationId: '50000000-0000-4000-8000-000000000001',
        workspaceId: '50000000-0000-4000-8000-000000000002',
      },
      decisionId: '50000000-0000-4000-8000-000000000003',
      subject: {},
      expectedDecisionSubjectHash: 'a'.repeat(64),
      currentAuthorizationEpoch: 1,
    }),
    { accepted: false, code: 'ROUTE_NOT_FOUND' },
  );
});
