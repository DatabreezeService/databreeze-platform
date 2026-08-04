import assert from 'node:assert/strict';
import test from 'node:test';

import { RegistrationController } from '../../../src/features/iam/api/registration.controller.js';
import { RegistrationProblemError } from '../../../src/features/iam/application/registration-problem.error.js';
import type { RegistrationService } from '../../../src/features/iam/application/registration.service.js';

void test('[IAM-001] registration controller returns a generic accepted response without bearer material', async () => {
  const controller = new RegistrationController({
    register: async () => {
      await Promise.resolve();
      return { accepted: true as const, value: { email: 'user@example.com' } };
    },
  } as unknown as RegistrationService);
  const response = await controller.register({
    email: 'user@example.com',
    displayName: 'Nguyen An',
    password: 'correct horse battery staple',
  });
  assert.deepEqual(response, { accepted: true });
  assert.equal('email' in response, false);
  assert.equal('accessToken' in response, false);
});

void test('[IAM-001] registration controller maps rejected and unavailable outcomes to stable problems', async () => {
  const rejected = new RegistrationController({
    register: async () => {
      await Promise.resolve();
      return { accepted: false as const, code: 'REGISTRATION_REJECTED' as const };
    },
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
    register: async () => {
      await Promise.resolve();
      return { accepted: false as const, code: 'REGISTRATION_UNAVAILABLE' as const };
    },
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

void test('[IAM-001] registration admission rejects before invoking password hashing or persistence', async () => {
  let serviceCalls = 0;
  let ipCalls = 0;
  let emailCalls = 0;
  const controller = new RegistrationController(
    {
      register: async () => {
        serviceCalls += 1;
        return { accepted: true as const, value: { email: 'user@example.com' } };
      },
    } as unknown as RegistrationService,
    {
      allow: async (keyDigest: string, issuedAt: string) => {
        ipCalls += 1;
        assert.match(keyDigest, /^[a-f0-9]{64}$/u);
        assert.match(issuedAt, /^\d{4}-\d{2}-\d{2}T/u);
        return false;
      },
    },
    {
      allow: async (keyDigest: string, issuedAt: string) => {
        emailCalls += 1;
        assert.match(keyDigest, /^[a-f0-9]{64}$/u);
        assert.match(issuedAt, /^\d{4}-\d{2}-\d{2}T/u);
        return true;
      },
    },
  );

  await assert.rejects(
    controller.register(
      {
        email: 'User@example.com',
        displayName: 'Name',
        password: 'valid password here',
      },
      { ip: '203.0.113.10' },
    ),
    (error: unknown) =>
      error instanceof RegistrationProblemError && error.code === 'REGISTRATION_REQUEST_REJECTED',
  );
  assert.equal(ipCalls, 1);
  assert.equal(emailCalls, 1);
  assert.equal(serviceCalls, 0);
});

void test('[IAM-001] registration admission digests are normalized, domain-separated, and content-free', async () => {
  const ipDigests: string[] = [];
  const emailDigests: string[] = [];
  const controller = new RegistrationController(
    {
      register: async () => ({ accepted: true as const, value: { email: 'user@example.com' } }),
    } as unknown as RegistrationService,
    {
      allow: async (digest: string) => {
        ipDigests.push(digest);
        return true;
      },
    },
    {
      allow: async (digest: string) => {
        emailDigests.push(digest);
        return true;
      },
    },
  );

  await controller.register(
    {
      email: 'User@example.com',
      displayName: 'Name',
      password: 'valid password here',
    },
    { ip: '203.0.113.10' },
  );
  await controller.register(
    {
      email: 'user@example.com',
      displayName: 'Name',
      password: 'valid password here',
    },
    { ip: '203.0.113.10' },
  );

  assert.equal(ipDigests.length, 2);
  assert.equal(emailDigests.length, 2);
  assert.match(ipDigests[0] ?? '', /^[a-f0-9]{64}$/u);
  assert.match(emailDigests[0] ?? '', /^[a-f0-9]{64}$/u);
  assert.notEqual(ipDigests[0], emailDigests[0]);
  assert.equal(ipDigests[0], ipDigests[1]);
  assert.equal(emailDigests[0], emailDigests[1]);
  assert.equal(
    ipDigests.some((digest) => digest.includes('203.0.113.10')),
    false,
  );
  assert.equal(
    emailDigests.some((digest) => digest.includes('user@example.com')),
    false,
  );
});
