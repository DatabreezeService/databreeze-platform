/* eslint-disable @typescript-eslint/require-await -- identity repository doubles mirror async ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { OidcGoogleIdentityAdapter } from '../../../src/features/iam/adapter/oidc-google-identity.adapter.js';
import { OidcController } from '../../../src/features/iam/api/oidc.controller.js';
import { IdentityLinkingService } from '../../../src/features/iam/application/identity-linking.service.js';
import type { IdentityLinkingRepositoryPortV1 } from '../../../src/features/iam/application/identity-linking.service.js';
import { createIamTenantContextV1 } from '../../../src/features/iam/application/tenant-context.js';
import type { RequestTenantContextPortV1 } from '../../../src/platform/http/request-tenant-context.port.js';

void test('[IAM-023] OIDC callback with valid PKCE/nonce creates link without provider tokens', async () => {
  const links: unknown[] = [];
  const repository: IdentityLinkingRepositoryPortV1 = {
    async findPasswordUserByEmail(email) {
      if (email === 'owner@example.com') return { userId: '00000000-0000-4000-8000-000000000301' };
      return undefined;
    },
    async findLink() {
      return undefined;
    },
    async createLink(input) {
      links.push(input);
    },
  };
  const oidc = new OidcGoogleIdentityAdapter({
    clientId: 'google-client',
    clientSecret: 'google-secret',
    async verify() {
      return {
        issuer: 'https://accounts.google.com',
        subject: 'google-subject-1',
        email: 'owner@example.com',
        emailVerified: true,
        authenticatedAt: '2026-01-01T00:00:00.000Z',
      };
    },
  });
  const service = new IdentityLinkingService({
    oidc,
    repository,
    digestSubject: (value) => `sub:${value}`,
    digestEmail: (value) => `email:${value}`,
  });
  const denied = await service.linkFromAuthorizationCode({
    code: 'auth-code',
    codeVerifier: 'a'.repeat(43),
    redirectUri: 'https://app.databreeze.local/oidc/callback',
    nonce: 'n'.repeat(16),
  });
  assert.deepEqual(denied, { accepted: false, code: 'SILENT_MERGE_DENIED' });

  const linked = await service.linkFromAuthorizationCode({
    code: 'auth-code',
    codeVerifier: 'a'.repeat(43),
    redirectUri: 'https://app.databreeze.local/oidc/callback',
    nonce: 'n'.repeat(16),
    passwordConfirmed: true,
  });
  assert.equal(linked.accepted, true);
  if (!linked.accepted) return;
  assert.equal(linked.value.linked, true);
  assert.equal('accessToken' in linked.value, false);
  assert.equal(links.length, 1);
});

void test('[IAM-023] provider verify failures stay closed', async () => {
  const oidc = new OidcGoogleIdentityAdapter({
    clientId: 'google-client',
    clientSecret: 'google-secret',
    async verify() {
      throw new Error('bad token');
    },
  });
  const result = await oidc.verifyAuthorizationCode({
    code: 'auth-code',
    codeVerifier: 'a'.repeat(43),
    redirectUri: 'https://app.databreeze.local/oidc/callback',
    nonce: 'n'.repeat(16),
  });
  assert.deepEqual(result, { accepted: false, code: 'INVALID_TOKEN' });
});

void test('[IAM-023] OIDC linking derives the actor from trusted request context', async () => {
  const actorId = '00000000-0000-4000-8000-000000000302';
  const context = createIamTenantContextV1({
    tenantScope: {
      scopeType: 'workspace',
      organizationId: '00000000-0000-4000-8000-000000000303',
      workspaceId: '00000000-0000-4000-8000-000000000304',
    },
    actorId,
    correlationId: '00000000-0000-4000-8000-000000000305',
    idempotencyKey: 'oidc-linking-test',
    authorizationEpoch: 1,
  });
  assert.equal(context.accepted, true);
  if (!context.accepted) return;

  let received: Record<string, unknown> | undefined;
  const linking = {
    async linkFromAuthorizationCode(input: Record<string, unknown>) {
      received = input;
      return { accepted: false as const, code: 'SILENT_MERGE_DENIED' as const };
    },
  } as unknown as IdentityLinkingService;
  const requestContext: RequestTenantContextPortV1 = {
    async resolve() {
      return context.value;
    },
  };
  const controller = new OidcController(linking, requestContext);

  await controller.callback({}, {
    code: 'auth-code',
    codeVerifier: 'a'.repeat(43),
    redirectUri: 'https://app.databreeze.local/oidc/callback',
    nonce: 'n'.repeat(16),
    authenticatedUserId: '00000000-0000-4000-8000-000000000399',
    passwordConfirmed: true,
    emailOtpConfirmed: true,
  } as never);

  assert.equal(received?.['authenticatedUserId'], actorId);
  assert.equal('passwordConfirmed' in (received ?? {}), false);
  assert.equal('emailOtpConfirmed' in (received ?? {}), false);
});

void test('[IAM-023] an existing OIDC link cannot be replayed by another actor', async () => {
  const repository: IdentityLinkingRepositoryPortV1 = {
    async findPasswordUserByEmail() {
      return undefined;
    },
    async findLink() {
      return {
        userId: '00000000-0000-4000-8000-000000000301',
        issuer: 'https://accounts.google.com',
        subjectDigest: 'subject-digest',
        emailDigest: 'email-digest',
      };
    },
    async createLink() {},
  };
  const service = new IdentityLinkingService({
    oidc: {
      async verifyAuthorizationCode() {
        return {
          accepted: true as const,
          value: {
            issuer: 'https://accounts.google.com',
            subject: 'google-subject-1',
            email: 'owner@example.com',
            emailVerified: true,
            authenticatedAt: '2026-01-01T00:00:00.000Z',
          },
        };
      },
    },
    repository,
    digestSubject: () => 'subject-digest',
    digestEmail: () => 'email-digest',
  });

  assert.deepEqual(
    await service.linkVerifiedIdentity(
      {
        issuer: 'https://accounts.google.com',
        subject: 'google-subject-1',
        email: 'owner@example.com',
        emailVerified: true,
        authenticatedAt: '2026-01-01T00:00:00.000Z',
      },
      { authenticatedUserId: '00000000-0000-4000-8000-000000000399' },
    ),
    { accepted: false, code: 'SILENT_MERGE_DENIED' },
  );
});
