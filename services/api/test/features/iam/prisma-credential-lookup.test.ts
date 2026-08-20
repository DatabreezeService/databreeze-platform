/* eslint-disable @typescript-eslint/require-await -- Prisma delegate doubles intentionally mirror async client signatures. */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PrismaCredentialLookupAdapter,
  type CredentialLookupDatabaseClientV1,
} from '../../../src/features/iam/adapter/prisma-credential-lookup.adapter.js';

const userId = '00000000-0000-4000-8000-000000000001';
const organizationId = '00000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-4000-8000-000000000003';
const membershipId = '00000000-0000-4000-8000-000000000004';

function database(
  overrides: Partial<CredentialLookupDatabaseClientV1> = {},
): CredentialLookupDatabaseClientV1 {
  return {
    userIdentity: {
      findUnique: async () => ({
        id: userId,
        email: 'user@example.com',
        status: 'ACTIVE',
        securityEpoch: 3,
        mfaReenrollmentRequired: false,
      }),
    },
    passwordCredential: {
      findUnique: async () => ({
        id: '00000000-0000-4000-8000-000000000005',
        userId,
        algorithm: 'argon2id',
        encodedHash: '$argon2id$v=19$m=19456,t=2,p=1$hash',
      }),
    },
    membershipIdentity: {
      findMany: async () => [
        {
          id: membershipId,
          principalId: userId,
          organizationId,
          workspaceId,
          projectId: null,
          scopeType: 'WORKSPACE',
          status: 'ACTIVE',
        },
      ],
    },
    workspaceIdentity: {
      findUnique: async () => ({ id: workspaceId, organizationId, status: 'ACTIVE' }),
      findMany: async () => [{ id: workspaceId, organizationId, status: 'ACTIVE' }],
    },
    organizationIdentity: {
      findUnique: async () => ({ id: organizationId, status: 'ACTIVE' }),
    },
    mfaFactor: {
      findMany: async () => [{ id: '00000000-0000-4000-8000-000000000006' }],
    },
    ...overrides,
  };
}

void test('[IAM-001, IAM-002, IAM-009] credential lookup returns only an active, scoped principal', async () => {
  const adapter = new PrismaCredentialLookupAdapter(database());
  const result = await adapter.findCredential('USER@EXAMPLE.COM');

  assert.deepEqual(result, {
    principal: {
      userId,
      organizationId,
      workspaceId,
      securityEpoch: 3,
      mfaRequired: true,
      mfaReenrollmentRequired: false,
    },
    credential: {
      algorithm: 'argon2id',
      encodedHash: '$argon2id$v=19$m=19456,t=2,p=1$hash',
    },
  });
});

void test('[IAM-001, IAM-009] lookup fails closed when persisted tenancy is inactive or malformed', async () => {
  const inactive = new PrismaCredentialLookupAdapter(
    database({
      organizationIdentity: {
        findUnique: async () => ({ id: organizationId, status: 'SUSPENDED' }),
      },
    }),
  );
  assert.equal(await inactive.findCredential('user@example.com'), undefined);

  const malformed = new PrismaCredentialLookupAdapter(
    database({
      membershipIdentity: {
        findMany: async () => [
          {
            id: membershipId,
            principalId: userId,
            organizationId: 'not-a-uuid',
            workspaceId,
            projectId: null,
            scopeType: 'WORKSPACE',
            status: 'ACTIVE',
          },
        ],
      },
    }),
  );
  assert.equal(await malformed.findCredential('user@example.com'), undefined);
});

void test('[IAM-015] credential lookup carries the live MFA re-enrollment gate when recovery set it', async () => {
  const adapter = new PrismaCredentialLookupAdapter(
    database({
      userIdentity: {
        findUnique: async () => ({
          id: userId,
          email: 'user@example.com',
          status: 'ACTIVE',
          securityEpoch: 4,
          mfaReenrollmentRequired: true,
        }),
      },
    }),
  );
  assert.equal(
    (await adapter.findCredential('user@example.com'))?.principal.mfaReenrollmentRequired,
    true,
  );
});

void test('[IAM-001, IAM-002] lookup does not authenticate users without an active workspace membership', async () => {
  const adapter = new PrismaCredentialLookupAdapter(
    database({
      membershipIdentity: { findMany: async () => [] },
    }),
  );

  assert.equal(await adapter.findCredential('user@example.com'), undefined);
});

void test('[IAM-026] active platform operators authenticate without receiving tenant scope', async () => {
  const client = database({
    membershipIdentity: { findMany: async () => [] },
  }) as CredentialLookupDatabaseClientV1 & {
    readonly platformOperatorRecord: {
      findUnique(input: { readonly where: { readonly userId: string } }): Promise<{
        readonly userId: string;
        readonly role: string;
        readonly status: string;
      } | null>;
    };
  };
  Object.assign(client, {
    platformOperatorRecord: {
      findUnique: async () => ({ userId, role: 'PLATFORM_OWNER', status: 'ACTIVE' }),
    },
  });
  const adapter = new PrismaCredentialLookupAdapter(client);

  const result = await adapter.findCredential('user@example.com');

  assert.deepEqual(result?.principal, {
    scopeType: 'PLATFORM',
    userId,
    securityEpoch: 3,
    mfaRequired: true,
    mfaReenrollmentRequired: false,
  });
});

void test('[IAM-001, IAM-009] an organization owner resolves the canonical active workspace', async () => {
  const adapter = new PrismaCredentialLookupAdapter(
    database({
      membershipIdentity: {
        findMany: async () => [
          {
            id: membershipId,
            principalId: userId,
            organizationId,
            workspaceId: null,
            projectId: null,
            scopeType: 'ORGANIZATION',
            status: 'ACTIVE',
          },
        ],
      },
    }),
  );

  const result = await adapter.findCredential('user@example.com');
  assert.equal(
    result !== undefined && 'organizationId' in result.principal
      ? result.principal.organizationId
      : undefined,
    organizationId,
  );
  assert.equal(
    result !== undefined && 'workspaceId' in result.principal
      ? result.principal.workspaceId
      : undefined,
    workspaceId,
  );
});

void test('[IAM-002] workspace membership selection is deterministic', async () => {
  const secondWorkspaceId = '00000000-0000-4000-8000-000000000007';
  const adapter = new PrismaCredentialLookupAdapter(
    database({
      membershipIdentity: {
        findMany: async () => [
          {
            id: '00000000-0000-4000-8000-000000000008',
            principalId: userId,
            organizationId,
            workspaceId: secondWorkspaceId,
            projectId: null,
            scopeType: 'WORKSPACE',
            status: 'ACTIVE',
          },
          {
            id: membershipId,
            principalId: userId,
            organizationId,
            workspaceId,
            projectId: null,
            scopeType: 'WORKSPACE',
            status: 'ACTIVE',
          },
        ],
      },
    }),
  );

  const result = await adapter.findCredential('user@example.com');
  assert.equal(
    result !== undefined && 'workspaceId' in result.principal
      ? result.principal.workspaceId
      : undefined,
    workspaceId,
  );
});
