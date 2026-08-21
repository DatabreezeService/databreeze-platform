import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  applyPlatformAdminRows,
  buildConversationAndNotifications,
  buildLandingFeedbackRows,
  buildPlatformAnalyticsRows,
  readPlatformAdminMetrics,
  upsertRows,
} from '../scripts/seed-local.mjs';
import { runPlatformAdminLocalSeed } from '../scripts/apply-platform-admin-local-seed.mjs';
import { LOCAL_FEEDBACK_EMAILS } from '../scripts/local-feedback-seed.mjs';

const apiDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const seedScriptPath = path.join(apiDirectory, 'scripts', 'seed-local.mjs');
const pilotSeedModulePath = new URL('../scripts/seed-pilot.mjs', import.meta.url).href;
const pilotRotationModulePath = new URL(
  '../scripts/rotate-pilot-operator-password.mjs',
  import.meta.url,
).href;

async function loadPilotSeedModule() {
  const module = await import(pilotSeedModulePath).catch(() => undefined);
  assert.ok(module, 'pilot seed module must exist');
  return module;
}

async function loadPilotRotationModule() {
  const module = await import(pilotRotationModulePath).catch(() => undefined);
  assert.ok(module, 'pilot operator rotation module must exist');
  return module;
}

const expectedFeedbackIdentities = Object.freeze([
  ['Lê Thanh Hải', 'lethanhhai177@gmail.com'],
  ['Duy Đỗ', 'doychanne11802@gmail.com'],
  ['Lâm Gia Kiệt', 'lamgiakiet.2005@gmail.com'],
  ['Trần Đặng Minh Quân', 'trandangminhquan2005@gmail.com'],
  ['Mai Nguyễn Duy Khánh', 'mndkhanh@gmail.com'],
  ['Hoàng Đức', 'duc1402056@gmail.com'],
  ['Huỳnh An Khương', 'huynhanhkuong0511@gmail.com'],
  ['Nhi Phạm', 'xpnhi023@gmail.com'],
  ['Lê Trần Gia Huy', 'huyletran188205@gmail.com'],
  ['Nguyễn Phan Mạnh Tú', 'manhtuhere@gmail.com'],
  ['Nguyễn Trần Minh Quân', 'quannt1206@gmail.com'],
  ['Nguyễn Quốc Huy', 'huynguyenfpt@gmail.com'],
]);

test('local seed provisions the platform owner from the ignored password environment', async () => {
  const source = await readFile(seedScriptPath, 'utf8');

  assert.match(source, /DATABREEZE_LOCAL_SEED_PASSWORD/);
  assert.match(source, /email: 'platform-owner@databreeze\.local'/);
  assert.match(source, /\{ id: ids\(7005\), userId: ID\.platformOwner \}/);
  assert.match(source, /'platformOperatorRecord'/);
  assert.match(source, /role: 'PLATFORM_OWNER'/);
  assert.match(source, /encodedHash: encodedPassword/);
  assert.doesNotMatch(source, /console\.log\(`Password:\s*\$\{password\}`\)/u);
});

test('[WEB-026/WEB-027] local feedback seed is restricted to the selected email list', () => {
  const rows = buildLandingFeedbackRows();

  assert.equal(rows.length, 12);
  assert.deepEqual(
    rows.map((row) => [row.name, row.email]),
    expectedFeedbackIdentities,
  );
  assert.deepEqual(
    rows.map((row) => row.email),
    LOCAL_FEEDBACK_EMAILS,
  );
  assert.equal(new Set(rows.map((row) => row.email)).size, 12);
});

test('[WEB-026/WEB-027] feedback contacts map to seeded organization subscriptions', () => {
  const feedbackRows = buildLandingFeedbackRows();
  const analytics = buildPlatformAnalyticsRows();
  const usersByEmail = new Map(analytics.users.map((user) => [user.email, user]));
  const subscriptionScopes = new Set(analytics.subscriptions.map((row) => row.scopeKey));

  for (const feedback of feedbackRows) {
    const user = usersByEmail.get(feedback.email);
    assert.ok(user, `missing seeded identity for ${feedback.email}`);
    assert.ok(
      subscriptionScopes.has(`organization:${user.organizationId}`),
      `missing subscription for ${feedback.email}`,
    );
  }
});

test('[WEB-026/WEB-027] local feedback seed preserves the exact requested records', () => {
  const rows = buildLandingFeedbackRows();

  assert.deepEqual(
    rows.map(({ id, role, experience, category, rating, contactPermission }) => ({
      id,
      role,
      experience,
      category,
      rating,
      contactPermission,
    })),
    [
      {
        id: '00000000-0000-4000-8000-000000008900',
        role: 'owner',
        experience: 'active',
        category: 'product',
        rating: 5,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008901',
        role: 'operations',
        experience: 'active',
        category: 'feature',
        rating: 5,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008902',
        role: 'accounting',
        experience: 'trial',
        category: 'data-trust',
        rating: 5,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008903',
        role: 'analyst',
        experience: 'active',
        category: 'performance',
        rating: 5,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008904',
        role: 'owner',
        experience: 'active',
        category: 'design',
        rating: 5,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008905',
        role: 'technology',
        experience: 'trial',
        category: 'feature',
        rating: 4,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008906',
        role: 'operations',
        experience: 'trial',
        category: 'product',
        rating: 4,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008907',
        role: 'analyst',
        experience: 'active',
        category: 'feature',
        rating: 5,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008908',
        role: 'accounting',
        experience: 'trial',
        category: 'data-trust',
        rating: 5,
        contactPermission: false,
      },
      {
        id: '00000000-0000-4000-8000-000000008909',
        role: 'operations',
        experience: 'exploring',
        category: 'design',
        rating: 4,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008910',
        role: 'technology',
        experience: 'trial',
        category: 'performance',
        rating: 5,
        contactPermission: true,
      },
      {
        id: '00000000-0000-4000-8000-000000008911',
        role: 'other',
        experience: 'exploring',
        category: 'other',
        rating: 4,
        contactPermission: true,
      },
    ],
  );
  assert.equal(rows[8].contactPermission, false);
});

test('[IAM-026][BUA-024] platform overview seed uses 63 valid, unique supplied customer emails', () => {
  const analytics = buildPlatformAnalyticsRows();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

  assert.equal(analytics.users.length, 63);
  assert.ok(analytics.users.every((user) => emailPattern.test(user.email)));
  assert.ok(analytics.users.every((user) => !user.email.endsWith('@example.test')));
  assert.equal(new Set(analytics.users.map((user) => user.email)).size, 63);
});

test('[IAM-026][BUA-024] platform overview registrations use a smaller July cohort and a larger pre-August-14 cohort', () => {
  const { users } = buildPlatformAnalyticsRows();
  const registrationsByMonth = Object.fromEntries(
    ['2026-07', '2026-08'].map((month) => [
      month,
      users.filter((user) => user.createdAt.toISOString().startsWith(month)).length,
    ]),
  );

  assert.deepEqual(registrationsByMonth, {
    '2026-07': 16,
    '2026-08': 47,
  });
  assert.ok(
    users.every(
      (user) =>
        user.createdAt >= new Date('2026-07-01T00:00:00.000Z') &&
        user.createdAt < new Date('2026-08-14T00:00:00.000Z'),
    ),
  );
});

test('[IAM-026][BUA-024] platform overview seed models 21 distinct paid actors at 3,129,000 VND', () => {
  const analytics = buildPlatformAnalyticsRows();
  const paidOrders = analytics.paymentOrders.filter((order) => order.status === 'PAID');
  const paidInvoices = analytics.invoices.filter((invoice) => invoice.status === 'PAID');

  assert.equal(paidOrders.length, 21);
  assert.equal(new Set(paidOrders.map((order) => order.actorId)).size, 21);
  assert.ok(paidOrders.every((order) => order.amountVnd === 149_000));
  assert.equal(
    paidInvoices.reduce((revenueVnd, invoice) => revenueVnd + invoice.amountVnd, 0),
    3_129_000,
  );
  assert.equal(paidInvoices.length, 21);
});

test('[IAM-026][BUA-024] platform overview seed has 21 active Personal monthly subscriptions and 68 total users', () => {
  const analytics = buildPlatformAnalyticsRows();
  // owner, admin, platform owner, analyst, and viewer are seeded outside the analytics model.
  const foundationLocalAccounts = 5;

  assert.equal(analytics.subscriptions.length, 21);
  assert.ok(analytics.subscriptions.every((subscription) => subscription.status === 'ACTIVE'));
  assert.ok(
    analytics.subscriptions.every((subscription) => subscription.planId === 'personal-monthly'),
  );
  assert.equal(foundationLocalAccounts + analytics.users.length, 68);
});

test('[WEB-026/WEB-027] repeated local feedback upserts remain idempotent', async () => {
  const stored = new Map();
  const database = {
    landingFeedbackRecord: {
      upsert: async ({ where, create, update }) => {
        const existing = stored.get(where.id);
        stored.set(where.id, existing === undefined ? { ...create } : { ...existing, ...update });
      },
    },
  };
  const rows = buildLandingFeedbackRows();

  await upsertRows(database, 'landingFeedbackRecord', rows);
  await upsertRows(database, 'landingFeedbackRecord', rows);

  assert.equal(stored.size, 12);
  assert.deepEqual(
    [...stored.values()].map((row) => row.id).sort(),
    rows.map((row) => row.id).sort(),
  );
});

test('[IAM-026][BUA-024][WEB-027] targeted platform-admin apply is upsert-only and bounded', async () => {
  const calls = [];
  const delegates = [
    'organizationIdentity',
    'userIdentity',
    'membershipIdentity',
    'paymentOrderRecord',
    'subscriptionRecord',
    'invoiceRecord',
    'landingFeedbackRecord',
  ];
  const transaction = Object.fromEntries(
    delegates.map((delegateName) => [
      delegateName,
      {
        upsert: async (input) => {
          calls.push({ delegateName, input });
        },
      },
    ]),
  );
  const database = {
    $transaction: async (operation) => operation(transaction),
  };

  const summary = await applyPlatformAdminRows(database);

  assert.deepEqual(new Set(calls.map((call) => call.delegateName)), new Set(delegates));
  assert.equal(calls.filter((call) => call.delegateName === 'organizationIdentity').length, 21);
  assert.equal(calls.filter((call) => call.delegateName === 'userIdentity').length, 63);
  assert.equal(calls.filter((call) => call.delegateName === 'membershipIdentity').length, 63);
  assert.equal(calls.filter((call) => call.delegateName === 'paymentOrderRecord').length, 21);
  assert.equal(calls.filter((call) => call.delegateName === 'subscriptionRecord').length, 21);
  assert.equal(calls.filter((call) => call.delegateName === 'invoiceRecord').length, 21);
  assert.equal(calls.filter((call) => call.delegateName === 'landingFeedbackRecord').length, 12);
  assert.deepEqual(summary, {
    organizations: 21,
    users: 63,
    memberships: 63,
    paymentOrders: 21,
    subscriptions: 21,
    invoices: 21,
    feedbacks: 12,
    paidUsers: 21,
    activeSubscriptions: 21,
    settledRevenueVnd: 3_129_000,
  });
});

test('[IAM-026][BUA-024][WEB-027] focused platform-admin CLI reports only targeted apply results', async () => {
  const lines = [];
  let applyCount = 0;
  const summary = {
    organizations: 21,
    users: 63,
    memberships: 63,
    paymentOrders: 21,
    subscriptions: 21,
    invoices: 21,
    feedbacks: 12,
    paidUsers: 21,
    activeSubscriptions: 21,
    settledRevenueVnd: 3_129_000,
  };

  const result = await runPlatformAdminLocalSeed({
    apply: async () => {
      applyCount += 1;
      return summary;
    },
    readMetrics: async () => ({
      totalUsers: 68,
      paidUsers: 21,
      activeSubscriptions: 21,
      settledRevenueVnd: 3_129_000,
      feedbacks: 12,
    }),
    log: (line) => lines.push(line),
  });

  assert.equal(applyCount, 1);
  assert.deepEqual(result, {
    seeded: summary,
    actual: {
      totalUsers: 68,
      paidUsers: 21,
      activeSubscriptions: 21,
      settledRevenueVnd: 3_129_000,
      feedbacks: 12,
    },
  });
  assert.deepEqual(lines, [
    'Platform-admin local fixture applied with bounded upserts.',
    'Rows: 21 organizations, 63 users, 63 memberships, 21 payment orders, 21 subscriptions, 21 invoices, 12 feedbacks.',
    'Authoritative overview rows: 68 total users, 21 paid users, 21 active subscriptions, 3,129,000 VND paid revenue, 12 feedbacks.',
  ]);
});

test('[IAM-026][BUA-024][WEB-027] targeted verification reads authoritative admin totals only', async () => {
  const database = {
    userIdentity: { count: async () => 68 },
    paymentOrderRecord: {
      groupBy: async () =>
        Array.from({ length: 21 }, (_, index) => ({ actorId: `actor-${index}` })),
    },
    subscriptionRecord: { count: async () => 21 },
    invoiceRecord: {
      aggregate: async () => ({ _sum: { amountVnd: 3_129_000 } }),
    },
    landingFeedbackRecord: { count: async () => 12 },
  };

  assert.deepEqual(await readPlatformAdminMetrics(database), {
    totalUsers: 68,
    paidUsers: 21,
    activeSubscriptions: 21,
    settledRevenueVnd: 3_129_000,
    feedbacks: 12,
  });
});

test('[IAM-026][BUA-024] pilot seed is disabled unless the protected host explicitly enables it', async () => {
  const { parsePilotSeedConfiguration } = await loadPilotSeedModule();

  assert.throws(
    () => parsePilotSeedConfiguration({ DATABREEZE_PILOT_SEED_ENABLED: 'false' }),
    /PILOT_SEED_DISABLED/u,
  );
});

test('[IAM-026] pilot operator configuration has no repository email or password default', async () => {
  const { parsePilotSeedConfiguration } = await loadPilotSeedModule();

  assert.throws(
    () => parsePilotSeedConfiguration({ DATABREEZE_PILOT_SEED_ENABLED: 'true' }),
    /PILOT_SEED_OPERATOR_EMAIL_REQUIRED/u,
  );
  assert.throws(
    () =>
      parsePilotSeedConfiguration({
        DATABREEZE_PILOT_SEED_ENABLED: 'true',
        DATABREEZE_PILOT_OPERATOR_EMAIL: 'owner@example.com',
        DATABREEZE_PILOT_OPERATOR_DISPLAY_NAME: 'Pilot owner',
      }),
    /PILOT_SEED_OPERATOR_PASSWORD_REQUIRED/u,
  );
});

test('[IAM-026] pilot operator replay preserves an existing credential and active assignment', async () => {
  const { provisionPilotOperator } = await loadPilotSeedModule();
  const users = new Map();
  const credentials = new Map();
  const assignments = new Map();
  let passwordHashCalls = 0;
  let sequence = 0;
  const nextId = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`;
  const transaction = {
    userIdentity: {
      findUnique: async ({ where }) => users.get(where.email) ?? null,
      create: async ({ data }) => {
        users.set(data.email, data);
        return data;
      },
      upsert: async ({ where, create, update }) => {
        const current = users.get(where.email);
        const row = current === undefined ? create : { ...current, ...update };
        users.set(where.email, row);
        return row;
      },
    },
    passwordCredential: {
      findUnique: async ({ where }) => credentials.get(where.userId) ?? null,
      create: async ({ data }) => {
        credentials.set(data.userId, data);
        return data;
      },
    },
    platformOperatorRecord: {
      findUnique: async ({ where }) => assignments.get(where.userId) ?? null,
      upsert: async ({ where, create, update }) => {
        const current = assignments.get(where.userId);
        const row = current === undefined ? create : { ...current, ...update };
        assignments.set(where.userId, row);
        return row;
      },
    },
  };
  const database = { $transaction: async (operation) => operation(transaction) };
  const configuration = {
    operatorEmail: 'owner@example.com',
    operatorDisplayName: 'Pilot owner',
    operatorPassword: 'correct-horse-battery-staple',
  };
  const dependencies = {
    hashPassword: async () => {
      passwordHashCalls += 1;
      return 'argon2id-pilot-hash';
    },
    idGenerator: nextId,
    now: () => new Date('2026-08-20T00:00:00.000Z'),
  };

  const first = await provisionPilotOperator(database, configuration, dependencies);
  const second = await provisionPilotOperator(database, configuration, dependencies);

  assert.equal(users.size, 5);
  assert.equal(credentials.size, 1);
  assert.equal(assignments.size, 1);
  assert.equal(passwordHashCalls, 1);
  assert.equal(first.userId, second.userId);
  assert.equal(assignments.get(first.userId).role, 'PLATFORM_OWNER');
  assert.equal(assignments.get(first.userId).status, 'ACTIVE');
  assert.equal(assignments.get(first.userId).revokedAt, null);
});

test('[IAM-005][IAM-026] explicit operator rotation replaces the credential and revokes sessions', async () => {
  const { rotatePilotOperatorPassword } = await loadPilotRotationModule();
  const sessions = [
    { id: 'session-1', familyId: 'family-1', status: 'ACTIVE', revokedAt: null },
    { id: 'session-2', familyId: 'family-2', status: 'REVOKED', revokedAt: new Date(0) },
  ];
  const credential = { userId: 'user-1', encodedHash: 'old-hash', rotatedAt: null };
  const user = { id: 'user-1', email: 'owner@example.com', status: 'ACTIVE', securityEpoch: 4 };
  const transaction = {
    userIdentity: {
      findUnique: async () => user,
      update: async ({ data }) => {
        user.securityEpoch += data.securityEpoch.increment;
        return user;
      },
    },
    platformOperatorRecord: {
      findUnique: async () => ({ userId: user.id, role: 'PLATFORM_OWNER', status: 'ACTIVE' }),
    },
    passwordCredential: {
      findUnique: async () => credential,
      update: async ({ data }) => Object.assign(credential, data),
    },
    sessionRecord: {
      findMany: async () => sessions.filter((row) => row.status === 'ACTIVE'),
      updateMany: async ({ data }) => {
        for (const row of sessions) {
          if (row.status === 'ACTIVE') Object.assign(row, data);
        }
        return { count: 1 };
      },
    },
    refreshTokenRecord: { updateMany: async () => ({ count: 1 }) },
    accessTokenRecord: { updateMany: async () => ({ count: 1 }) },
  };
  const database = { $transaction: async (operation) => operation(transaction) };

  const result = await rotatePilotOperatorPassword(
    database,
    { operatorEmail: user.email, operatorPassword: 'same-protected-password' },
    {
      hashPassword: async () => 'new-argon2id-hash',
      now: () => new Date('2026-08-21T00:00:00.000Z'),
    },
  );

  assert.equal(credential.encodedHash, 'new-argon2id-hash');
  assert.equal(user.securityEpoch, 5);
  assert.equal(sessions[0].status, 'REVOKED');
  assert.deepEqual(result, { userId: user.id, securityEpoch: 5, revokedSessions: 1 });
});

test('[DDA-055] seeded conversation binds each dataset to its active version', () => {
  const { conversationRows } = buildConversationAndNotifications();

  assert.equal(conversationRows.length, 1);
  assert.deepEqual(conversationRows[0].activeDatasetVersionIds, {
    '00000000-0000-4000-8000-000000000100': '00000000-0000-4000-8000-000000000108',
  });
});
