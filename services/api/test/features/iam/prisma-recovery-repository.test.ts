import assert from 'node:assert/strict';
import test from 'node:test';

import { createRecoveryChallengeV1 } from '@databreeze/domain/recovery/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';
import {
  PrismaRecoveryRepositoryAdapter,
  type RecoveryDatabaseClientV1,
} from '../../../src/features/iam/adapter/prisma-recovery-repository.adapter.js';

const userId = '00000000-0000-4000-8000-000000000001';
const challengeId = '00000000-0000-4000-8000-000000000002';
const issuedAt = new Date('2026-08-03T00:00:00.000Z');

function stable(value: string): StableIdentifierV1 {
  const parsed = parseStableIdentifierV1(value);
  assert.equal(parsed.accepted, true);
  if (!parsed.accepted) throw new Error('fixture identifier invalid');
  return parsed.value;
}

function challenge(status: 'ACTIVE' | 'CONSUMED' = 'ACTIVE') {
  const created = createRecoveryChallengeV1({
    id: challengeId,
    userId,
    tokenDigest: 'a'.repeat(64),
    emailDigest: 'b'.repeat(64),
    issuedAt: issuedAt.toISOString(),
    expiresAt: '2026-08-03T00:30:00.000Z',
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error('fixture invalid');
  if (status === 'ACTIVE') return created.value;
  const consumed = {
    ...created.value,
    status: 'CONSUMED' as const,
    consumedAt: '2026-08-03T00:10:00.000Z',
    revision: 2,
  };
  return consumed;
}

function database() {
  const users = new Map<string, Record<string, unknown>>([
    [
      userId,
      {
        id: userId,
        email: 'user@example.com',
        status: 'ACTIVE',
        securityEpoch: 1,
        mfaReenrollmentRequired: false,
      },
    ],
  ]);
  const challenges = new Map<string, Record<string, unknown>>();
  const credentials = new Map<string, Record<string, unknown>>([[userId, { userId }]]);
  const sessionId = '00000000-0000-4000-8000-000000000003';
  const sessions = new Map<string, Record<string, unknown>>([
    [
      sessionId,
      {
        id: sessionId,
        userId,
        familyId: 'family-1',
        status: 'ACTIVE',
      },
    ],
  ]);
  const calls = { transactions: 0, refresh: 0, access: 0, sessions: 0, mfa: 0 };
  let client!: RecoveryDatabaseClientV1;
  const unique = (records: Map<string, Record<string, unknown>>) => ({
    findUnique: async ({ where }: { readonly where: Record<string, string> }) => {
      if (where['id']) return records.get(where['id']) ?? null;
      if (where['email'])
        return [...records.values()].find((row) => row['email'] === where['email']) ?? null;
      if (where['tokenDigest'])
        return (
          [...records.values()].find((row) => row['tokenDigest'] === where['tokenDigest']) ?? null
        );
      return null;
    },
  });
  client = {
    userIdentity: {
      ...unique(users),
      updateMany: async ({
        where,
        data,
      }: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }) => {
        const row = users.get(String(where['id']));
        if (!row || row['securityEpoch'] !== where['securityEpoch']) return { count: 0 };
        users.set(String(where['id']), { ...row, ...data });
        return { count: 1 };
      },
    },
    recoveryChallenge: {
      ...unique(challenges),
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        [...challenges.values()].filter(
          (row) => row['userId'] === where['userId'] && row['status'] === where['status'],
        ),
      create: async ({ data }: { data: Record<string, unknown> }) => {
        challenges.set(String(data['id']), data);
        return data;
      },
      update: async ({
        where,
        data,
      }: {
        where: Record<string, string>;
        data: Record<string, unknown>;
      }) => {
        const row = challenges.get(String(where['id']));
        if (!row) throw new Error('missing');
        challenges.set(String(where['id']), { ...row, ...data });
        return { ...row, ...data };
      },
    },
    passwordCredential: {
      update: async ({
        where,
        data,
      }: {
        where: Record<string, string>;
        data: Record<string, unknown>;
      }) => {
        const row = credentials.get(String(where['userId']));
        if (!row) throw new Error('credential missing');
        credentials.set(String(where['userId']), { ...row, ...data });
        return { ...row, ...data };
      },
    },
    sessionRecord: {
      findMany: async () => [...sessions.values()],
      update: async ({
        where,
        data,
      }: {
        where: Record<string, string>;
        data: Record<string, unknown>;
      }) => {
        calls.sessions += 1;
        const row = sessions.get(String(where['id']));
        if (!row) throw new Error('session missing');
        sessions.set(String(where['id']), { ...row, ...data });
        return { ...row, ...data };
      },
    },
    refreshTokenRecord: {
      updateMany: async () => {
        calls.refresh += 1;
        return { count: 1 };
      },
    },
    accessTokenRecord: {
      updateMany: async () => {
        calls.access += 1;
        return { count: 1 };
      },
    },
    mfaFactor: {
      updateMany: async () => {
        calls.mfa += 1;
        return { count: 1 };
      },
    },
    $transaction: async (work: (transaction: RecoveryDatabaseClientV1) => Promise<unknown>) => {
      calls.transactions += 1;
      return work(client);
    },
  } as unknown as RecoveryDatabaseClientV1;
  return { client, users, challenges, credentials, sessions, calls };
}

void test('[IAM-015] Prisma recovery adapter persists and reads exact challenge versions', async () => {
  const state = database();
  const adapter = new PrismaRecoveryRepositoryAdapter(state.client);
  await adapter.withTransaction((transaction) => transaction.saveChallenge(challenge()));
  assert.equal(state.calls.transactions, 1);
  assert.equal(
    await adapter.withTransaction((transaction) =>
      transaction.findUserIdByEmail('USER@example.com'),
    ),
    stable(userId),
  );
  assert.equal(
    (
      await adapter.withTransaction((transaction) =>
        transaction.findChallengeByTokenDigest('a'.repeat(64)),
      )
    )?.status,
    'ACTIVE',
  );
  assert.equal(
    (
      await adapter.withTransaction((transaction) =>
        transaction.findActiveChallengeForUser(stable(userId)),
      )
    )?.id,
    challengeId,
  );
});

void test('[IAM-015] Prisma recovery completion rotates credential, epoch, MFA state, sessions, and challenge atomically', async () => {
  const state = database();
  const adapter = new PrismaRecoveryRepositoryAdapter(state.client);
  await adapter.withTransaction((transaction) => transaction.saveChallenge(challenge()));
  await adapter.withTransaction((transaction) =>
    transaction.completeRecovery({
      challenge: challenge('CONSUMED'),
      credentialId: stable('00000000-0000-4000-8000-000000000004'),
      credential: {
        schemaVersion: 1,
        algorithm: 'argon2id',
        encodedHash: '$argon2id$v=19$m=1,p=1,t=1$YWJjZA==$ZWZmZw==',
      },
    }),
  );
  assert.equal(state.users.get(userId)?.['securityEpoch'], 2);
  assert.equal(state.users.get(userId)?.['mfaReenrollmentRequired'], true);
  assert.equal(
    state.credentials.get(userId)?.['encodedHash'],
    '$argon2id$v=19$m=1,p=1,t=1$YWJjZA==$ZWZmZw==',
  );
  assert.equal(state.sessions.get('00000000-0000-4000-8000-000000000003')?.['status'], 'REVOKED');
  assert.equal(state.calls.refresh, 1);
  assert.equal(state.calls.access, 1);
  assert.equal(state.calls.mfa, 1);
  assert.equal(state.challenges.get(challengeId)?.['status'], 'CONSUMED');
});
