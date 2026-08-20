import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';

import {
  applyPlatformAdminRows,
  loadPrismaClient,
  readPlatformAdminMetrics,
} from './seed-local.mjs';

const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
});

const PILOT_BASE_IDENTITIES = Object.freeze([
  Object.freeze({
    email: 'owner@databreeze.local',
    displayName: 'Pilot workspace owner',
  }),
  Object.freeze({
    email: 'admin@databreeze.local',
    displayName: 'Pilot workspace administrator',
  }),
  Object.freeze({
    email: 'analyst@databreeze.local',
    displayName: 'Pilot analyst',
  }),
  Object.freeze({
    email: 'viewer@databreeze.local',
    displayName: 'Pilot viewer',
  }),
]);

function requiredText(value, code, maximumLength) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length === 0) throw new Error(code);
  const containsControlCharacter = Array.from(normalized).some((character) => {
    const codePoint = character.charCodeAt(0);
    return codePoint <= 31 || codePoint === 127;
  });
  if (normalized.length > maximumLength || containsControlCharacter) {
    throw new Error(`${code}_INVALID`);
  }
  return normalized;
}

function deterministicUuid(value) {
  const bytes = Buffer.from(createHash('sha256').update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hexadecimal = bytes.toString('hex');
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`;
}

export function parsePilotSeedConfiguration(environment = process.env) {
  if (environment.DATABREEZE_PILOT_SEED_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error('PILOT_SEED_DISABLED');
  }

  const operatorEmail = requiredText(
    environment.DATABREEZE_PILOT_OPERATOR_EMAIL,
    'PILOT_SEED_OPERATOR_EMAIL_REQUIRED',
    254,
  ).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(operatorEmail)) {
    throw new Error('PILOT_SEED_OPERATOR_EMAIL_INVALID');
  }

  const operatorDisplayName = requiredText(
    environment.DATABREEZE_PILOT_OPERATOR_DISPLAY_NAME,
    'PILOT_SEED_OPERATOR_DISPLAY_NAME_REQUIRED',
    200,
  );
  const operatorPassword = requiredText(
    environment.DATABREEZE_PILOT_OPERATOR_PASSWORD,
    'PILOT_SEED_OPERATOR_PASSWORD_REQUIRED',
    512,
  );
  if (operatorPassword.length < 12) throw new Error('PILOT_SEED_OPERATOR_PASSWORD_INVALID');

  return Object.freeze({ operatorEmail, operatorDisplayName, operatorPassword });
}

export async function provisionPilotOperator(
  database,
  configuration,
  {
    hashPassword = (password) => hash(password, PASSWORD_HASH_OPTIONS),
    idGenerator = randomUUID,
    now = () => new Date(),
  } = {},
) {
  return database.$transaction(async (transaction) => {
    const timestamp = now();
    for (const identity of PILOT_BASE_IDENTITIES) {
      await transaction.userIdentity.upsert({
        where: { email: identity.email },
        create: {
          id: deterministicUuid(`databreeze-pilot:${identity.email}`),
          email: identity.email,
          displayName: identity.displayName,
          locale: 'vi-VN',
          status: 'ACTIVE',
          securityEpoch: 1,
          profileRevision: 1,
          mfaReenrollmentRequired: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        update: {},
      });
    }

    let operator = await transaction.userIdentity.findUnique({
      where: { email: configuration.operatorEmail },
    });
    if (operator === null) {
      operator = await transaction.userIdentity.create({
        data: {
          id: idGenerator(),
          email: configuration.operatorEmail,
          displayName: configuration.operatorDisplayName,
          locale: 'vi-VN',
          status: 'ACTIVE',
          securityEpoch: 1,
          profileRevision: 1,
          mfaReenrollmentRequired: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      });
    }

    const existingCredential = await transaction.passwordCredential.findUnique({
      where: { userId: operator.id },
    });
    if (existingCredential === null) {
      await transaction.passwordCredential.create({
        data: {
          id: idGenerator(),
          userId: operator.id,
          algorithm: 'argon2id',
          encodedHash: await hashPassword(configuration.operatorPassword),
          createdAt: timestamp,
          rotatedAt: timestamp,
        },
      });
    }

    const existingAssignment = await transaction.platformOperatorRecord.findUnique({
      where: { userId: operator.id },
    });
    const assignment = await transaction.platformOperatorRecord.upsert({
      where: { userId: operator.id },
      create: {
        userId: operator.id,
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE',
        assignedBy: null,
        assignedAt: timestamp,
        revokedAt: null,
        revision: 1,
        updatedAt: timestamp,
      },
      update: {
        role: 'PLATFORM_OWNER',
        status: 'ACTIVE',
        revokedAt: null,
        revision: (existingAssignment?.revision ?? 0) + 1,
        updatedAt: timestamp,
      },
    });

    return Object.freeze({
      userId: operator.id,
      createdCredential: existingCredential === null,
      assignmentRevision: assignment.revision,
    });
  });
}

export async function runPilotSeed({ environment = process.env, log = console.log } = {}) {
  const configuration = parsePilotSeedConfiguration(environment);
  const connectionString = requiredText(
    environment.DATABASE_URL,
    'PILOT_SEED_DATABASE_URL_REQUIRED',
    4096,
  );
  const PrismaClient = await loadPrismaClient();
  const database = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  await database.$connect();
  try {
    const seeded = await applyPlatformAdminRows(database);
    const operator = await provisionPilotOperator(database, configuration);
    const actual = await readPlatformAdminMetrics(database);
    log('Pilot fixture applied with bounded upserts.');
    log(
      `Rows requested: ${seeded.organizations} organizations, ${seeded.users} users, ${seeded.memberships} memberships, ${seeded.paymentOrders} payment orders, ${seeded.subscriptions} subscriptions, ${seeded.invoices} invoices, ${seeded.feedbacks} feedbacks.`,
    );
    log(
      `Authoritative rows: ${actual.totalUsers} total users, ${actual.paidUsers} paid users, ${actual.activeSubscriptions} active subscriptions, ${actual.settledRevenueVnd.toLocaleString('en-US')} VND paid revenue, ${actual.feedbacks} feedbacks.`,
    );
    log(
      `Platform operator ready; credential created: ${operator.createdCredential ? 'yes' : 'no'}.`,
    );
    return Object.freeze({ seeded, operator, actual });
  } finally {
    await database.$disconnect();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runPilotSeed().catch((error) => {
    console.error(error instanceof Error ? error.message : 'PILOT_SEED_FAILED');
    process.exitCode = 1;
  });
}
