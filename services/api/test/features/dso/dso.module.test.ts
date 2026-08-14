import assert from 'node:assert/strict';
import test from 'node:test';

import { DsoModule } from '../../../src/features/dso/dso.module.js';
import { DEVICE_AUTHORIZATION_REPOSITORY_PORT } from '../../../src/features/dso/application/device-authorization-repository.port.js';
import { PrismaDeviceAuthorizationRepositoryAdapter } from '../../../src/features/dso/adapter/prisma-device-authorization-repository.adapter.js';
import { DEVICE_CAPABILITY_REPOSITORY_PORT } from '../../../src/features/dso/application/device-capability-repository.port.js';
import { PrismaDeviceCapabilityRepositoryAdapter } from '../../../src/features/dso/adapter/prisma-device-capability-repository.adapter.js';
import { DEVICE_SYNC_AUTHORIZATION } from '../../../src/features/dso/application/device-sync-authorization.port.js';
import { DeviceSyncAuthorizationAdapter } from '../../../src/features/dso/adapter/device-sync-authorization.adapter.js';
import { DATA_MODE_POLICY_REPOSITORY_PORT } from '../../../src/features/dso/application/data-mode-policy-repository.port.js';
import { PrismaDataModePolicyRepositoryAdapter } from '../../../src/features/dso/adapter/prisma-data-mode-policy-repository.adapter.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import {
  UnavailableWorkspaceDataModePolicyActivationUseCase,
  WORKSPACE_DATA_MODE_POLICY_ACTIVATION_USE_CASE,
} from '../../../src/features/dso/application/workspace-data-mode-policy-activation.port.js';

function provider(module: ReturnType<typeof DsoModule.register>, token: symbol): unknown {
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

void test('[DSO-005, IAM-020] production DSO composition selects durable authorization storage', () => {
  const database = {} as never;
  const registered = DsoModule.register({ deviceAuthorizationDatabase: database });
  assert.ok(
    provider(registered, DEVICE_AUTHORIZATION_REPOSITORY_PORT) instanceof
      PrismaDeviceAuthorizationRepositoryAdapter,
  );
});

void test('[DSO-003, DSO-005] production DSO composition selects durable capability storage', () => {
  const database = {} as never;
  const registered = DsoModule.register({ deviceCapabilityDatabase: database });
  assert.ok(
    provider(registered, DEVICE_CAPABILITY_REPOSITORY_PORT) instanceof
      PrismaDeviceCapabilityRepositoryAdapter,
  );
});

void test('[IAM-020, DSO-005] DSO composition passes the IAM identity authority bridge', () => {
  const authority = {
    inspect: () => Promise.resolve({ accepted: false as const, code: 'DEVICE_REVOKED' as const }),
  };
  const registered = DsoModule.register({ deviceIdentityAuthority: authority });
  assert.ok(
    provider(registered, DEVICE_SYNC_AUTHORIZATION) instanceof DeviceSyncAuthorizationAdapter,
  );
});

void test('[DSO-008, DSO-026] production DSO composition selects durable data-mode policy storage', () => {
  const database = {} as never;
  const registered = DsoModule.register({ dataModePolicyDatabase: database });
  assert.ok(
    provider(registered, DATA_MODE_POLICY_REPOSITORY_PORT) instanceof
      PrismaDataModePolicyRepositoryAdapter,
  );
});

void test('[DSO-018/026/027] database storage alone never enables policy activation', () => {
  const registered = DsoModule.register({ dataModePolicyDatabase: {} as never });
  assert.ok(
    provider(registered, WORKSPACE_DATA_MODE_POLICY_ACTIVATION_USE_CASE) instanceof
      UnavailableWorkspaceDataModePolicyActivationUseCase,
  );
});

void test('[IAM-020, DSO-005] default DSO composition fails closed without an IAM device bridge', async () => {
  const context = createIamTenantContextV1({
    actorId: '00000000-0000-4000-8000-000000000661',
    correlationId: '00000000-0000-4000-8000-000000000662',
    tenantScope: {
      scopeType: 'workspace',
      organizationId: '00000000-0000-4000-8000-000000000663',
      workspaceId: '00000000-0000-4000-8000-000000000664',
    },
    idempotencyKey: 'default-authority',
    authorizationEpoch: 1,
  });
  assert.equal(context.accepted, true);
  if (!context.accepted) return;
  const registered = DsoModule.register();
  const authorization = provider(
    registered,
    DEVICE_SYNC_AUTHORIZATION,
  ) as DeviceSyncAuthorizationAdapter;
  assert.deepEqual(
    await authorization.authorize(context.value, {
      deviceId: '00000000-0000-4000-8000-000000000665',
      tenantScope: context.value.tenantScope,
      grantId: '00000000-0000-4000-8000-000000000666',
      effect: 'READ',
      now: '2026-01-01T00:00:00.000Z',
    }),
    { accepted: false, code: 'AUTHORIZATION_UNAVAILABLE' },
  );
});
