import assert from 'node:assert/strict';
import test from 'node:test';

import { PrismaRecoveryRepositoryAdapter } from '../../../src/features/iam/adapter/prisma-recovery-repository.adapter.js';
import { IAM_RECOVERY_REPOSITORY_PORT } from '../../../src/features/iam/application/recovery-repository.port.js';
import {
  IAM_RECOVERY_SERVICE,
  RecoveryService,
} from '../../../src/features/iam/application/recovery.service.js';
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

void test('[IAM-015] explicitly supplied recovery service is exported with a public controller', () => {
  const service = {} as RecoveryService;
  const registered = IamModule.register({ recoveryService: service });
  const configured = provider(registered, IAM_RECOVERY_SERVICE);
  assert.ok(configured && 'useValue' in configured);
  if (!configured || !('useValue' in configured)) return;
  assert.equal(configured.useValue, service);
  assert.ok(registered.controllers?.some((controller) => controller.name === 'RecoveryController'));
});

void test('[IAM-015] durable recovery composition requires password, digest, delivery, and persistence ports', () => {
  const incomplete = IamModule.register({ recoveryDatabase: {} as never });
  assert.equal(provider(incomplete, IAM_RECOVERY_SERVICE), undefined);
  const configured = IamModule.register({
    recoveryDatabase: {} as never,
    passwordCredentials,
    recoveryDigestKey: 'test-recovery-key',
    recoveryDelivery: { deliver: async () => undefined },
  });
  const repository = provider(configured, IAM_RECOVERY_REPOSITORY_PORT);
  const service = provider(configured, IAM_RECOVERY_SERVICE);
  assert.ok(repository && 'useValue' in repository);
  assert.ok(service && 'useValue' in service);
  if (!repository || !('useValue' in repository) || !service || !('useValue' in service)) return;
  assert.ok(repository.useValue instanceof PrismaRecoveryRepositoryAdapter);
  assert.ok(service.useValue instanceof RecoveryService);
});
