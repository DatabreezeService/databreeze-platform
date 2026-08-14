/* eslint-disable @typescript-eslint/require-await -- registration doubles implement asynchronous ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { RegistrationController } from '../../../src/features/iam/api/registration.controller.js';
import { RegistrationProblemError } from '../../../src/features/iam/application/registration-problem.error.js';

const acceptedService = {
  requestEmailVerification: async () => ({
    accepted: true as const,
    value: { requested: true as const, challengeId: '00000000-0000-4000-8000-000000000301' },
  }),
};

void test('[IAM-022] registration controller returns versioned opaque challenge and no display name', async () => {
  const controller = new RegistrationController(acceptedService as never);
  assert.deepEqual(
    await controller.register({
      schemaVersion: 4,
      email: 'owner@example.com',
      password: 'correct horse battery staple',
      locale: 'vi-VN',
    }),
    {
      schemaVersion: 4,
      accepted: true,
      value: { requested: true, challengeId: '00000000-0000-4000-8000-000000000301' },
    },
  );
});

void test('[IAM-022] missing delivery/service fails closed', async () => {
  const controller = new RegistrationController(undefined);
  await assert.rejects(
    () =>
      controller.register({
        schemaVersion: 4,
        email: 'owner@example.com',
        password: 'correct horse battery staple',
      }),
    (error: unknown) => error instanceof RegistrationProblemError,
  );
});

void test('[IAM-022] production admission rejects before the expensive service call', async () => {
  let called = false;
  const controller = new RegistrationController(
    {
      requestEmailVerification: async () => {
        called = true;
        return acceptedService.requestEmailVerification();
      },
    } as never,
    { allow: async () => false },
    { allow: async () => true },
    { digestCandidates: () => ['digest'] },
  );
  await assert.rejects(
    () =>
      controller.register(
        { schemaVersion: 4, email: 'owner@example.com', password: 'correct horse battery staple' },
        { ip: '127.0.0.1' },
      ),
    (error: unknown) => error instanceof RegistrationProblemError,
  );
  assert.equal(called, false);
});
