import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { argon2id, hash } from 'argon2';

import { loadPrismaClient } from './seed-local.mjs';

const PASSWORD_HASH_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
});

function requiredText(value, code, maximumLength) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized.length === 0 || normalized.length > maximumLength) throw new Error(code);
  return normalized;
}

export function parsePilotOperatorRotationConfiguration(environment = process.env) {
  if (environment.DATABREEZE_PILOT_OPERATOR_ROTATION_ENABLED?.trim().toLowerCase() !== 'true') {
    throw new Error('PILOT_OPERATOR_ROTATION_DISABLED');
  }
  const operatorEmail = requiredText(
    environment.DATABREEZE_PILOT_OPERATOR_EMAIL,
    'PILOT_OPERATOR_EMAIL_REQUIRED',
    254,
  ).toLowerCase();
  const operatorPassword = requiredText(
    environment.DATABREEZE_PILOT_OPERATOR_PASSWORD,
    'PILOT_OPERATOR_PASSWORD_REQUIRED',
    512,
  );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(operatorEmail) || operatorPassword.length < 12) {
    throw new Error('PILOT_OPERATOR_ROTATION_CONFIGURATION_INVALID');
  }
  return Object.freeze({ operatorEmail, operatorPassword });
}

/** IAM-005/IAM-026: explicit credential rotation, security-epoch bump and revocation are atomic. */
export async function rotatePilotOperatorPassword(
  database,
  configuration,
  {
    hashPassword = (password) => hash(password, PASSWORD_HASH_OPTIONS),
    now = () => new Date(),
  } = {},
) {
  const encodedHash = await hashPassword(configuration.operatorPassword);
  const timestamp = now();
  return database.$transaction(async (transaction) => {
    const user = await transaction.userIdentity.findUnique({
      where: { email: configuration.operatorEmail },
    });
    if (user === null || user.status !== 'ACTIVE') throw new Error('PILOT_OPERATOR_NOT_FOUND');
    const [assignment, credential, activeSessions] = await Promise.all([
      transaction.platformOperatorRecord.findUnique({ where: { userId: user.id } }),
      transaction.passwordCredential.findUnique({ where: { userId: user.id } }),
      transaction.sessionRecord.findMany({ where: { userId: user.id, status: 'ACTIVE' } }),
    ]);
    if (
      assignment?.status !== 'ACTIVE' ||
      assignment.role !== 'PLATFORM_OWNER' ||
      credential === null
    ) {
      throw new Error('PILOT_OPERATOR_ROTATION_FORBIDDEN');
    }

    await transaction.passwordCredential.update({
      where: { userId: user.id },
      data: { encodedHash, rotatedAt: timestamp },
    });
    const updatedUser = await transaction.userIdentity.update({
      where: { id: user.id },
      data: { securityEpoch: { increment: 1 } },
    });
    const sessionIds = activeSessions.map((session) => session.id);
    if (sessionIds.length > 0) {
      await transaction.refreshTokenRecord.updateMany({
        where: { sessionId: { in: sessionIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED' },
      });
      await transaction.accessTokenRecord.updateMany({
        where: { sessionId: { in: sessionIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: timestamp },
      });
      await transaction.sessionRecord.updateMany({
        where: { id: { in: sessionIds }, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: timestamp },
      });
    }
    return Object.freeze({
      userId: user.id,
      securityEpoch: updatedUser.securityEpoch,
      revokedSessions: sessionIds.length,
    });
  });
}

export async function runPilotOperatorRotation({
  environment = process.env,
  log = console.log,
} = {}) {
  const configuration = parsePilotOperatorRotationConfiguration(environment);
  const connectionString = requiredText(
    environment.DATABASE_URL,
    'PILOT_OPERATOR_DATABASE_URL_REQUIRED',
    4096,
  );
  const PrismaClient = await loadPrismaClient();
  const database = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  await database.$connect();
  try {
    const result = await rotatePilotOperatorPassword(database, configuration);
    log(
      `Platform operator credential rotated; security epoch ${result.securityEpoch}; revoked sessions ${result.revokedSessions}.`,
    );
    return result;
  } finally {
    await database.$disconnect();
  }
}

if (
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runPilotOperatorRotation().catch((error) => {
    console.error(error instanceof Error ? error.message : 'PILOT_OPERATOR_ROTATION_FAILED');
    process.exitCode = 1;
  });
}
