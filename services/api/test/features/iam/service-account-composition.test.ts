import assert from 'node:assert/strict';
import test from 'node:test';

import { ServiceAccountController } from '../../../src/features/iam/api/service-account.controller.js';
import { InMemoryServiceAccountRepositoryAdapter } from '../../../src/features/iam/adapter/in-memory-service-account-repository.adapter.js';
import {
  SERVICE_ACCOUNT_REPOSITORY_PORT,
} from '../../../src/features/iam/application/service-account-repository.port.js';
import { SERVICE_ACCOUNT_SERVICE, ServiceAccountService } from '../../../src/features/iam/application/service-account.service.js';
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
      (provider) => typeof provider === 'object' && provider !== null && 'provide' in provider && provider.provide === SERVICE_ACCOUNT_SERVICE,
    ),
  );
});
