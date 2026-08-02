import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PrismaSessionLifecycleAdapter,
  type SessionLifecycleDatabaseClientV1,
  type SessionRecordDatabaseRowV1,
  type RefreshTokenDatabaseRowV1,
  type AccessTokenDatabaseRowV1,
} from '../../../src/features/iam/adapter/prisma-session-lifecycle.adapter.js';

const userId = '00000000-0000-4000-8000-000000000001';
const organizationId = '00000000-0000-4000-8000-000000000002';
const workspaceId = '00000000-0000-4000-8000-000000000003';
const principal = {
  userId,
  organizationId,
  workspaceId,
  securityEpoch: 4,
  mfaRequired: true,
};

function createDatabase(): {
  readonly client: SessionLifecycleDatabaseClientV1;
  readonly sessions: Map<string, SessionRecordDatabaseRowV1>;
  readonly refreshTokens: Map<string, RefreshTokenDatabaseRowV1>;
  readonly accessTokens: Map<string, AccessTokenDatabaseRowV1>;
} {
  const sessions = new Map<string, SessionRecordDatabaseRowV1>();
  const refreshTokens = new Map<string, RefreshTokenDatabaseRowV1>();
  const accessTokens = new Map<string, AccessTokenDatabaseRowV1>();
  const client = {
    sessionRecord: {
      create: async ({ data }: { readonly data: SessionRecordDatabaseRowV1 }) => {
        sessions.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { readonly where: { readonly id: string } }) =>
        sessions.get(where.id) ?? null,
      update: async ({
        where,
        data,
      }: {
        readonly where: { readonly id: string };
        readonly data: Partial<SessionRecordDatabaseRowV1>;
      }) => {
        const current = sessions.get(where.id);
        if (!current) throw new Error('SESSION_NOT_FOUND');
        const updated = { ...current, ...data };
        sessions.set(where.id, updated);
        return updated;
      },
    },
    refreshTokenRecord: {
      create: async ({ data }: { readonly data: RefreshTokenDatabaseRowV1 }) => {
        refreshTokens.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { readonly where: { readonly tokenDigest: string } }) =>
        [...refreshTokens.values()].find((row) => row.tokenDigest === where.tokenDigest) ?? null,
      findMany: async ({
        where,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
      }) =>
        [...refreshTokens.values()].filter((row) =>
          Object.entries(where).every(([key, value]) => row[key as keyof RefreshTokenDatabaseRowV1] === value),
        ),
      updateMany: async ({
        where,
        data,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
        readonly data: Partial<RefreshTokenDatabaseRowV1>;
      }) => {
        let count = 0;
        for (const [id, row] of refreshTokens) {
          if (!Object.entries(where).every(([key, value]) => row[key as keyof RefreshTokenDatabaseRowV1] === value))
            continue;
          refreshTokens.set(id, { ...row, ...data });
          count += 1;
        }
        return { count };
      },
    },
    accessTokenRecord: {
      create: async ({ data }: { readonly data: AccessTokenDatabaseRowV1 }) => {
        accessTokens.set(data.id, data);
        return data;
      },
      findUnique: async ({ where }: { readonly where: { readonly tokenDigest: string } }) =>
        [...accessTokens.values()].find((row) => row.tokenDigest === where.tokenDigest) ?? null,
      updateMany: async ({
        where,
        data,
      }: {
        readonly where: Readonly<Record<string, unknown>>;
        readonly data: Partial<AccessTokenDatabaseRowV1>;
      }) => {
        let count = 0;
        for (const [id, row] of accessTokens) {
          if (!Object.entries(where).every(([key, value]) => row[key as keyof AccessTokenDatabaseRowV1] === value))
            continue;
          accessTokens.set(id, { ...row, ...data });
          count += 1;
        }
        return { count };
      },
    },
    userIdentity: {
      findUnique: async () => ({ id: userId, status: 'ACTIVE', securityEpoch: 4 }),
    },
    membershipIdentity: {
      findMany: async () => [
        {
          id: '00000000-0000-4000-8000-000000000004',
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
    },
    organizationIdentity: {
      findUnique: async () => ({ id: organizationId, status: 'ACTIVE' }),
    },
    mfaFactor: {
      findMany: async () => [{ id: '00000000-0000-4000-8000-000000000005' }],
    },
    $transaction: async <TValue>(work: (transaction: SessionLifecycleDatabaseClientV1) => Promise<TValue>) =>
      work(client),
  } as unknown as SessionLifecycleDatabaseClientV1;
  return { client, sessions, refreshTokens, accessTokens };
}

void test('[IAM-005, IAM-006] Prisma sessions persist opaque bounded access and refresh credentials', async () => {
  const { client, sessions, refreshTokens, accessTokens } = createDatabase();
  const adapter = new PrismaSessionLifecycleAdapter(client, {
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
  });

  const session = await adapter.issue(principal, 'web');
  assert.match(session.sessionId, /^[0-9a-f-]{36}$/u);
  assert.match(session.accessToken, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u);
  assert.match(session.refreshToken, /^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/u);
  assert.equal(sessions.size, 1);
  assert.equal(refreshTokens.size, 1);
  assert.equal(accessTokens.size, 1);
  assert.equal((await adapter.findPrincipal(session.sessionId))?.userId, userId);
  assert.equal((await adapter.findPrincipalByAccessToken(session.accessToken))?.userId, userId);
  assert.equal(await adapter.findPrincipalByAccessToken('not-a-token'), undefined);
});

void test('[IAM-005] refresh rotation is transactional and reuse revokes the complete family', async () => {
  const { client, refreshTokens } = createDatabase();
  const adapter = new PrismaSessionLifecycleAdapter(client, {
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
  });
  const first = await adapter.issue(principal, 'desktop');
  const rotated = await adapter.refresh(first.refreshToken, 'desktop');
  assert.equal(rotated.accepted, true);
  if (!rotated.accepted) return;
  assert.notEqual(rotated.value.refreshToken, first.refreshToken);
  assert.equal([...refreshTokens.values()].filter((row) => row.status === 'USED').length, 1);
  assert.deepEqual(await adapter.refresh(first.refreshToken, 'desktop'), {
    accepted: false,
    code: 'REUSE_DETECTED',
  });
  assert.deepEqual(await adapter.refresh(rotated.value.refreshToken, 'desktop'), {
    accepted: false,
    code: 'REVOKED_FAMILY',
  });
  assert.equal(await adapter.findPrincipal(first.sessionId), undefined);
});

void test('[IAM-005] expired refresh tokens fail closed without returning token material', async () => {
  let now = new Date('2026-01-01T00:00:00.000Z');
  const { client } = createDatabase();
  const adapter = new PrismaSessionLifecycleAdapter(client, { clock: () => new Date(now) });
  const session = await adapter.issue(principal, 'android');
  now = new Date('2026-02-01T00:00:00.000Z');
  assert.deepEqual(await adapter.refresh(session.refreshToken, 'android'), {
    accepted: false,
    code: 'EXPIRED',
  });
  assert.deepEqual(await adapter.refresh('not-a-token', 'android'), {
    accepted: false,
    code: 'INVALID_REFRESH_TOKEN',
  });
});

void test('[IAM-005] revocation is idempotent and hides session principals afterward', async () => {
  const { client } = createDatabase();
  const adapter = new PrismaSessionLifecycleAdapter(client);
  const session = await adapter.issue(principal, 'web');
  assert.equal(await adapter.revoke(session.sessionId), true);
  assert.equal(await adapter.revoke(session.sessionId), true);
  assert.equal(await adapter.findPrincipal(session.sessionId), undefined);
  assert.equal(await adapter.findPrincipalByAccessToken(session.accessToken), undefined);
});
