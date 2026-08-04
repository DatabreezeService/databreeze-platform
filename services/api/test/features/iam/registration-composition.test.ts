import assert from 'node:assert/strict';
import test from 'node:test';

import { PrismaRegistrationRepositoryAdapter } from '../../../src/features/iam/adapter/prisma-registration-repository.adapter.js';
import { RedisRecoveryAdmissionAdapter } from '../../../src/features/iam/adapter/redis-recovery-admission.adapter.js';
import {
  IAM_REGISTRATION_EMAIL_ADMISSION,
  IAM_REGISTRATION_IP_ADMISSION,
} from '../../../src/features/iam/application/registration-repository.port.js';
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
  hash: async () => {
    await Promise.resolve();
    return {
      schemaVersion: 1,
      algorithm: 'argon2id',
      encodedHash: '$argon2id$v=19$m=65536,p=1,t=3$YWJjZA==$ZWZmZw==',
    };
  },
  verify: async () => {
    await Promise.resolve();
    return true;
  },
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

void test('[IAM-001] registration admission uses separate shared Redis namespaces for IP and email', async () => {
  const keys: string[] = [];
  const counter = {
    incrementWindow: async (input: { readonly key: string; readonly ttlMs: number }) => {
      keys.push(input.key);
      return 1;
    },
  };
  const configured = IamModule.register({
    registrationService: {} as RegistrationService,
    registrationIpAdmissionCounter: counter,
    registrationEmailAdmissionCounter: counter,
  });
  const ip = provider(configured, IAM_REGISTRATION_IP_ADMISSION);
  const email = provider(configured, IAM_REGISTRATION_EMAIL_ADMISSION);
  assert.ok(ip && 'useValue' in ip && ip.useValue instanceof RedisRecoveryAdmissionAdapter);
  assert.ok(
    email && 'useValue' in email && email.useValue instanceof RedisRecoveryAdmissionAdapter,
  );
  if (!ip || !('useValue' in ip) || !email || !('useValue' in email)) return;
  await ip.useValue.allow('a'.repeat(64), '2026-01-01T00:00:00.000Z');
  await email.useValue.allow('b'.repeat(64), '2026-01-01T00:00:00.000Z');
  assert.match(keys[0] ?? '', /databreeze:iam:registration:ip:v1:/u);
  assert.match(keys[1] ?? '', /databreeze:iam:registration:email:v1:/u);
});
