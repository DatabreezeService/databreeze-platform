import assert from 'node:assert/strict';
import test from 'node:test';

import { PrismaRegistrationRepositoryAdapter } from '../../../src/features/iam/adapter/prisma-registration-repository.adapter.js';
import { IAM_REGISTRATION_REPOSITORY_PORT } from '../../../src/features/iam/application/registration-repository.port.js';
import {
  IAM_REGISTRATION_SERVICE,
  RegistrationService,
} from '../../../src/features/iam/application/registration.service.js';
import { IamModule } from '../../../src/features/iam/iam.module.js';
import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';

function provider(module: ReturnType<typeof IamModule.register>, token: symbol) {
  return module.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
}

const passwordCredentials = new PasswordCredentialService({
  hash: async () => ({
    schemaVersion: 1,
    algorithm: 'argon2id',
    encodedHash: '$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$ZWZmZw==',
  }),
  verify: async () => true,
});

void test('[IAM-001] registration composition exports an explicitly supplied service and controller', () => {
  const service = {} as RegistrationService;
  const registered = IamModule.register({ registrationService: service });
  const configured = provider(registered, IAM_REGISTRATION_SERVICE);
  assert.ok(configured && 'useValue' in configured);
  if (!configured || !('useValue' in configured)) return;
  assert.equal(configured.useValue, service);
  assert.ok(
    registered.controllers?.some((controller) => controller.name === 'RegistrationController'),
  );
});

void test('[IAM-001] durable registration requires password credentials before composing the service', () => {
  const withoutPassword = IamModule.register({ registrationDatabase: {} as never });
  assert.equal(provider(withoutPassword, IAM_REGISTRATION_SERVICE), undefined);
  const configured = IamModule.register({
    registrationDatabase: {} as never,
    passwordCredentials,
  });
  const repository = provider(configured, IAM_REGISTRATION_REPOSITORY_PORT);
  const service = provider(configured, IAM_REGISTRATION_SERVICE);
  assert.ok(repository && 'useValue' in repository);
  assert.ok(service && 'useValue' in service);
  if (!repository || !('useValue' in repository) || !service || !('useValue' in service)) return;
  assert.ok(repository.useValue instanceof PrismaRegistrationRepositoryAdapter);
  assert.ok(service.useValue instanceof RegistrationService);
});
