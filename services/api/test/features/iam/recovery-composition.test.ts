import assert from 'node:assert/strict';
import test from 'node:test';

import { PrismaRecoveryRepositoryAdapter } from '../../../src/features/iam/adapter/prisma-recovery-repository.adapter.js';
import { RedisRecoveryAdmissionAdapter } from '../../../src/features/iam/adapter/redis-recovery-admission.adapter.js';
import {
  IAM_RECOVERY_ADMISSION_PORT,
  IAM_RECOVERY_COMPLETION_ADMISSION_PORT,
  IAM_RECOVERY_REPOSITORY_PORT,
} from '../../../src/features/iam/application/recovery-repository.port.js';
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
    recoveryDigestKey: 'test-recovery-key-v1-012345678901234567',
    recoveryDelivery: {
      deliver: async () => {
        await Promise.resolve();
      },
    },
  });
  const repository = provider(configured, IAM_RECOVERY_REPOSITORY_PORT);
  const service = provider(configured, IAM_RECOVERY_SERVICE);
  assert.ok(repository && 'useValue' in repository);
  assert.ok(service && 'useValue' in service);
  if (!repository || !('useValue' in repository) || !service || !('useValue' in service)) return;
  assert.ok(repository.useValue instanceof PrismaRecoveryRepositoryAdapter);
  assert.ok(service.useValue instanceof RecoveryService);
});

void test('[IAM-015] recovery composition selects the shared admission adapter when a Redis counter is provided', () => {
  const configured = IamModule.register({
    recoveryDatabase: {} as never,
    passwordCredentials,
    recoveryDigestKey: 'test-recovery-key-v1-012345678901234567',
    recoveryDelivery: {
      deliver: async () => {
        await Promise.resolve();
      },
    },
    recoveryAdmissionCounter: {
      incrementWindow: async () => {
        await Promise.resolve();
        return 1;
      },
    },
    recoveryAdmissionOptions: { maxAttempts: 5, windowSeconds: 30 },
  });
  const admission = provider(configured, IAM_RECOVERY_ADMISSION_PORT);
  assert.ok(admission && 'useValue' in admission);
  if (!admission || !('useValue' in admission)) return;
  assert.ok(admission.useValue instanceof RedisRecoveryAdmissionAdapter);
});

void test('[IAM-015] recovery composition gives completion counters a separate Redis namespace', () => {
  const configured = IamModule.register({
    recoveryDatabase: {} as never,
    passwordCredentials,
    recoveryDigestKey: 'test-recovery-key-v1-012345678901234567',
    recoveryDelivery: {
      deliver: async () => {
        await Promise.resolve();
      },
    },
    recoveryCompletionAdmissionCounter: {
      incrementWindow: async () => {
        await Promise.resolve();
        return 1;
      },
    },
  });
  const admission = provider(configured, IAM_RECOVERY_COMPLETION_ADMISSION_PORT);
  assert.ok(admission && 'useValue' in admission);
  if (!admission || !('useValue' in admission)) return;
  assert.ok(admission.useValue instanceof RedisRecoveryAdmissionAdapter);
});
