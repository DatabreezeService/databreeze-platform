import assert from 'node:assert/strict';
import test from 'node:test';

import { RegistrationController } from '../../../src/features/iam/api/registration.controller.js';
import { RegistrationProblemError } from '../../../src/features/iam/application/registration-problem.error.js';
import type { RegistrationService } from '../../../src/features/iam/application/registration.service.js';

const value = {
  bootstrap: {
    user: { id: 'user-id', locale: 'vi-VN' },
    organization: { id: 'organization-id' },
    workspace: { id: 'workspace-id' },
    project: { id: 'project-id' },
    membership: { id: 'membership-id' },
  },
  email: 'user@example.com',
} as never;

void test('[IAM-001] registration controller returns hierarchy identifiers without bearer material', async () => {
  const controller = new RegistrationController({
    register: async () => ({ accepted: true as const, value }),
  } as unknown as RegistrationService);
  const response = await controller.register({
    email: 'user@example.com',
    displayName: 'Nguyen An',
    password: 'correct horse battery staple',
  });
  assert.deepEqual(response, {
    userId: 'user-id',
    organizationId: 'organization-id',
    workspaceId: 'workspace-id',
    projectId: 'project-id',
    membershipId: 'membership-id',
    locale: 'vi-VN',
  });
  assert.equal('email' in response, false);
  assert.equal('accessToken' in response, false);
});

void test('[IAM-001] registration controller maps rejected and unavailable outcomes to stable problems', async () => {
  const rejected = new RegistrationController({
    register: async () => ({ accepted: false as const, code: 'REGISTRATION_REJECTED' as const }),
  } as unknown as RegistrationService);
  await assert.rejects(
    rejected.register({
      email: 'user@example.com',
      displayName: 'Name',
      password: 'valid password here',
    }),
    (error: unknown) =>
      error instanceof RegistrationProblemError && error.code === 'REGISTRATION_REQUEST_REJECTED',
  );
  const unavailable = new RegistrationController({
    register: async () => ({ accepted: false as const, code: 'REGISTRATION_UNAVAILABLE' as const }),
  } as unknown as RegistrationService);
  await assert.rejects(
    unavailable.register({
      email: 'user@example.com',
      displayName: 'Name',
      password: 'valid password here',
    }),
    (error: unknown) =>
      error instanceof RegistrationProblemError && error.code === 'REGISTRATION_UNAVAILABLE',
  );
});

void test('[IAM-001] registration controller fails closed when registration is not composed', async () => {
  const controller = new RegistrationController(undefined);
  await assert.rejects(
    controller.register({
      email: 'user@example.com',
      displayName: 'Name',
      password: 'valid password here',
    }),
    (error: unknown) =>
      error instanceof RegistrationProblemError && error.code === 'REGISTRATION_UNAVAILABLE',
  );
});
