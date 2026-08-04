import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceAccountController } from '../../../src/features/iam/api/service-account.controller.js';
import { InMemoryServiceAccountRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-service-account-repository.adapter.js';
import { SERVICE_ACCOUNT_REPOSITORY_PORT } from '../../../src/features/iam/application/service-account-repository.port.js';
import {
  SERVICE_ACCOUNT_SERVICE,
  ServiceAccountService,
} from '../../../src/features/iam/application/service-account.service.js';
import { IamModule } from '../../../src/features/iam/iam.module.js';

void test('[IAM-013] IAM composition registers a replaceable service-account repository and lifecycle service', () => {
  const service = new ServiceAccountService(
    new InMemoryServiceAccountRepositoryAdapter(),
    { findMembership: () => Promise.resolve(undefined) } as never,
    { issue: () => ({ secret: 'dbsa', digest: 'a'.repeat(64) }) },
  );
  const registered = IamModule.register({ serviceAccountService: service });
  assert.ok(registered.controllers?.includes(ServiceAccountController));
  assert.ok(registered.exports?.includes(SERVICE_ACCOUNT_REPOSITORY_PORT));
  assert.ok(registered.exports?.includes(SERVICE_ACCOUNT_SERVICE));
  assert.ok(
    registered.providers?.some(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === SERVICE_ACCOUNT_SERVICE,
    ),
  );
});

void test('[IAM-013] IAM database composition enables service-account lifecycle management', () => {
  const registered = IamModule.register({ iamDatabase: {} as never });
  const provider = registered.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === SERVICE_ACCOUNT_SERVICE,
  );
  assert.ok(provider && 'useValue' in provider);
  if (!provider || !('useValue' in provider)) return;
  assert.ok(provider.useValue instanceof ServiceAccountService);
});

void test('[IAM-013] durable service-account storage requires a stable envelope key', () => {
  assert.throws(
    () => IamModule.register({ iamDatabase: {} as never, serviceAccountDatabase: {} as never }),
    /IAM_SERVICE_ACCOUNT_ENVELOPE_KEY_REQUIRED/u,
  );
  const key = Buffer.alloc(32, 7).toString('base64url');
  const registered = IamModule.register({
    iamDatabase: {} as never,
    serviceAccountDatabase: {} as never,
    serviceAccountSecretEnvelopeKey: key,
  });
  assert.ok(
    registered.providers?.some(
      (provider) =>
        typeof provider === 'object' &&
        provider !== null &&
        'provide' in provider &&
        provider.provide === SERVICE_ACCOUNT_SERVICE,
    ),
  );
});
