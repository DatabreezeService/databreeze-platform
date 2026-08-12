import assert from 'node:assert/strict';
import test from 'node:test';

import { OidcGoogleIdentityAdapter } from '../../../src/features/iam/adapter/oidc-google-identity.adapter.js';
import { IdentityLinkingService } from '../../../src/features/iam/application/identity-linking.service.js';
import type { IdentityLinkingRepositoryPortV1 } from '../../../src/features/iam/application/identity-linking.service.js';

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
