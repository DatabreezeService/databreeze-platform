import assert from 'node:assert/strict';
import test from 'node:test';

import { DsoModule } from '../../../src/features/dso/dso.module.js';
import { DEVICE_AUTHORIZATION_REPOSITORY_PORT } from '../../../src/features/dso/application/device-authorization-repository.port.js';
import { PrismaDeviceAuthorizationRepositoryAdapter } from '../../../src/features/dso/adapter/prisma-device-authorization-repository.adapter.js';
import { DEVICE_CAPABILITY_REPOSITORY_PORT } from '../../../src/features/dso/application/device-capability-repository.port.js';
import { PrismaDeviceCapabilityRepositoryAdapter } from '../../../src/features/dso/adapter/prisma-device-capability-repository.adapter.js';
import { DEVICE_SYNC_AUTHORIZATION } from '../../../src/features/dso/application/device-sync-authorization.port.js';
import { DeviceSyncAuthorizationAdapter } from '../../../src/features/dso/adapter/device-sync-authorization.adapter.js';

function provider(module: ReturnType<typeof DsoModule.register>, token: symbol) {
  const match = module.providers?.find(
    (candidate) => typeof candidate === 'object' && candidate !== null && 'provide' in candidate && candidate.provide === token,
  );
  assert.notEqual(match, undefined);
  if (!match || !('useValue' in match)) throw new Error('provider is not a value provider');
  return match.useValue;
}

void test('[DSO-005, IAM-020] production DSO composition selects durable authorization storage', () => {
  const database = {} as never;
  const registered = DsoModule.register({ deviceAuthorizationDatabase: database });
  assert.ok(provider(registered, DEVICE_AUTHORIZATION_REPOSITORY_PORT) instanceof PrismaDeviceAuthorizationRepositoryAdapter);
});

void test('[DSO-003, DSO-005] production DSO composition selects durable capability storage', () => {
  const database = {} as never;
  const registered = DsoModule.register({ deviceCapabilityDatabase: database });
  assert.ok(provider(registered, DEVICE_CAPABILITY_REPOSITORY_PORT) instanceof PrismaDeviceCapabilityRepositoryAdapter);
});

void test('[IAM-020, DSO-005] DSO composition passes the IAM identity authority bridge', () => {
  const authority = { inspect: async () => ({ accepted: false as const, code: 'DEVICE_REVOKED' as const }) };
  const registered = DsoModule.register({ deviceIdentityAuthority: authority });
  assert.ok(provider(registered, DEVICE_SYNC_AUTHORIZATION) instanceof DeviceSyncAuthorizationAdapter);
});
