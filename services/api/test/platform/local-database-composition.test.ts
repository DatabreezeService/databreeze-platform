/* eslint-disable @typescript-eslint/require-await -- lifecycle doubles implement runtime ports. */

import assert from 'node:assert/strict';
import test from 'node:test';

import { PasswordCredentialService } from '../../src/features/iam/application/password-credential.service.js';
import { RedisRecoveryAdmissionAdapter } from '../../src/features/iam/adapter/redis-recovery-admission.adapter.js';
import { MailpitSmtpEmailVerificationDeliveryAdapter } from '../../src/features/iam/adapter/mailpit-smtp-email-verification-delivery.adapter.js';
import { GmailSmtpEmailVerificationDeliveryAdapter } from '../../src/features/iam/adapter/gmail-smtp-email-verification-delivery.adapter.js';
import { SmtpPasswordRecoveryDeliveryAdapter } from '../../src/features/iam/adapter/smtp-password-recovery-delivery.adapter.js';
import {
  createLocalDatabaseComposition,
  LOCAL_DATABASE_URL_ERROR,
  LOCAL_HTTPS_ORIGIN_ERROR,
  LOCAL_IAM_KEY_ERROR,
  LOCAL_PROVIDER_UNAVAILABLE,
  LOCAL_REDIS_URL_ERROR,
  LOCAL_RUNTIME_PROFILE,
  LOCAL_SMTP_CONFIGURATION_ERROR,
  PILOT_RUNTIME_PROFILE,
  createPilotDatabaseComposition,
  type LocalDatabaseClient,
} from '../../src/platform/local-database.composition.js';
import { createDatabaseCompositionForRuntime } from '../../src/platform/production-database.composition.js';

const key = (value: number): string => Buffer.alloc(32, value).toString('base64url');

const environment = {
  NODE_ENV: 'production',
  DATABREEZE_RUNTIME_PROFILE: LOCAL_RUNTIME_PROFILE,
  DATABASE_URL: 'postgresql://databreeze:local-password@127.0.0.1:5432/databreeze?schema=public',
  DATABREEZE_LOCAL_HTTPS_ORIGIN: 'https://127.0.0.1:8443',
  DATABREEZE_REDIS_URL: 'redis://127.0.0.1:6379',
  DATABREEZE_IAM_SMTP_HOST: '127.0.0.1',
  DATABREEZE_IAM_SMTP_PORT: '1025',
  DATABREEZE_IAM_EMAIL_FROM_ADDRESS: 'verify@databreeze.local',
  DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY: key(1),
  DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY: key(2),
  DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY: key(3),
  DATABREEZE_IAM_RECOVERY_DIGEST_KEY: key(5),
  DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY: key(4),
} as const;

const hmrEnvironment = {
  ...environment,
  DATABREEZE_LOCAL_HMR_HTTP: 'true',
  DATABREEZE_LOCAL_HMR_ORIGIN: 'http://127.0.0.1:5173',
} as const;

const pilotEnvironment = {
  ...environment,
  DATABREEZE_RUNTIME_PROFILE: PILOT_RUNTIME_PROFILE,
  DATABREEZE_PILOT_HTTPS_ORIGIN: 'https://pilot.example.com',
} as const;

const gmailEnvironment = {
  ...environment,
  DATABREEZE_LOCAL_EMAIL_PROVIDER: 'gmail',
  DATABREEZE_IAM_SMTP_HOST: 'smtp.gmail.com',
  DATABREEZE_IAM_SMTP_PORT: '465',
  DATABREEZE_IAM_SMTP_USERNAME: 'owner@gmail.com',
  DATABREEZE_IAM_SMTP_APP_PASSWORD: 'abcdefghijklmnop',
  DATABREEZE_IAM_EMAIL_FROM_ADDRESS: 'owner@gmail.com',
} as const;

function databaseClient(events: string[]): LocalDatabaseClient {
  return {
    $connect: async () => void events.push('database-connect'),
    $disconnect: async () => void events.push('database-disconnect'),
    $queryRaw: async () => [{ ready: 1 }],
  } as unknown as LocalDatabaseClient;
}

void test('[FND-003, IAM-005, IAM-022, IAM-023] local profile composes durable Prisma IAM, Redis admission and Mailpit with production security mode', async () => {
  const events: string[] = [];
  const client = databaseClient(events);
  const composition = await createLocalDatabaseComposition(environment, {
    createClient: (url) => {
      assert.equal(url, environment.DATABASE_URL);
      events.push('database-construct');
      return client;
    },
    createRedisClient: (url) => {
      assert.equal(url, environment.DATABREEZE_REDIS_URL);
      return {
        connect: async () => void events.push('redis-connect'),
        disconnect: async () => void events.push('redis-disconnect'),
        eval: async () => 1,
      };
    },
    createSmtpSender: (configuration) => {
      assert.deepEqual(configuration, { host: '127.0.0.1', port: 1025 });
      return { send: async () => undefined };
    },
  });

  try {
    assert.deepEqual(events, ['redis-connect', 'database-construct', 'database-connect']);
    assert.equal(composition.options.runtimeMode, 'production');
    assert.equal(composition.options.allowInMemoryAdapters, false);
    assert.deepEqual(composition.options.requestContext?.csrf?.allowedOrigins, [
      environment.DATABREEZE_LOCAL_HTTPS_ORIGIN,
    ]);
    assert.ok(composition.options.passwordCredentials instanceof PasswordCredentialService);
    assert.ok(composition.options.registrationIpAdmission instanceof RedisRecoveryAdmissionAdapter);
    assert.ok(
      composition.options.registrationEmailAdmission instanceof RedisRecoveryAdmissionAdapter,
    );
    assert.ok(
      composition.options.emailVerificationDelivery instanceof
        MailpitSmtpEmailVerificationDeliveryAdapter,
    );
    assert.ok(composition.options.recoveryDelivery instanceof SmtpPasswordRecoveryDeliveryAdapter);
    for (const option of [
      'credentialDatabase',
      'sessionDatabase',
      'identityBootstrapDatabase',
      'iamDatabase',
      'hierarchyDatabase',
      'registrationDatabase',
      'emailVerificationDatabase',
      'approvalDatabase',
      'ddaDatabase',
    ] as const) {
      assert.equal(composition.options[option], client, `${option} must use the shared client`);
    }
  } finally {
    await composition.disconnect();
  }
  assert.deepEqual(events, [
    'redis-connect',
    'database-construct',
    'database-connect',
    'database-disconnect',
    'redis-disconnect',
  ]);
});

void test('[FND-003, WEB-004] local HMR profile allows only the explicit loopback browser origin', async () => {
  const composition = await createLocalDatabaseComposition(hmrEnvironment, {
    createClient: () => databaseClient([]),
    createRedisClient: () => ({
      connect: async () => undefined,
      disconnect: async () => undefined,
      eval: async () => 1,
    }),
    createSmtpSender: () => ({ send: async () => undefined }),
  });

  try {
    assert.deepEqual(composition.options.requestContext?.csrf?.allowedOrigins, [
      hmrEnvironment.DATABREEZE_LOCAL_HMR_ORIGIN,
    ]);
  } finally {
    await composition.disconnect();
  }
});

void test('[IAM-022] explicit local Gmail provider composes TLS SMTP delivery without changing the default Mailpit path', async () => {
  let received: unknown;
  const composition = await createLocalDatabaseComposition(gmailEnvironment, {
    createClient: () => databaseClient([]),
    createRedisClient: () => ({
      connect: async () => undefined,
      disconnect: async () => undefined,
      eval: async () => 1,
    }),
    createGmailSmtpSender: (configuration) => {
      received = configuration;
      return { send: async () => undefined };
    },
  });

  try {
    assert.deepEqual(received, {
      host: 'smtp.gmail.com',
      port: 465,
      username: 'owner@gmail.com',
      appPassword: 'abcdefghijklmnop',
    });
    assert.ok(
      composition.options.emailVerificationDelivery instanceof
        GmailSmtpEmailVerificationDeliveryAdapter,
    );
    assert.ok(composition.options.recoveryDelivery instanceof SmtpPasswordRecoveryDeliveryAdapter);
  } finally {
    await composition.disconnect();
  }
});

void test('[IAM-022] local Gmail provider rejects a sender address different from the authenticated account', async () => {
  await assert.rejects(
    createLocalDatabaseComposition(
      { ...gmailEnvironment, DATABREEZE_IAM_EMAIL_FROM_ADDRESS: 'spoof@example.com' },
      {
        createClient: () => databaseClient([]),
        createRedisClient: () => ({
          connect: async () => undefined,
          disconnect: async () => undefined,
          eval: async () => 1,
        }),
        createGmailSmtpSender: () => ({ send: async () => undefined }),
      },
    ),
    (error: unknown) => error instanceof Error && error.message === LOCAL_SMTP_CONFIGURATION_ERROR,
  );
});

void test('[FND-003] explicit local discriminator selects local composition while ordinary development remains unchanged', async () => {
  const events: string[] = [];
  const composition = await createDatabaseCompositionForRuntime(environment, {
    local: {
      createClient: () => databaseClient(events),
      createRedisClient: () => ({
        connect: async () => undefined,
        disconnect: async () => undefined,
        eval: async () => 1,
      }),
      createSmtpSender: () => ({ send: async () => undefined }),
    },
  });
  assert.ok(composition);
  await composition.disconnect();
  assert.equal(await createDatabaseCompositionForRuntime({ NODE_ENV: 'development' }), undefined);
});

void test('[FND-003, IAM-022] pilot profile accepts one exact public HTTPS origin while reusing durable local providers', async () => {
  const events: string[] = [];
  const composition = await createPilotDatabaseComposition(pilotEnvironment, {
    createClient: (url) => {
      assert.equal(url, environment.DATABASE_URL);
      events.push('database-construct');
      return databaseClient(events);
    },
    createRedisClient: (url) => {
      assert.equal(url, environment.DATABREEZE_REDIS_URL);
      return {
        connect: async () => void events.push('redis-connect'),
        disconnect: async () => void events.push('redis-disconnect'),
        eval: async () => 1,
      };
    },
    createSmtpSender: (configuration) => {
      assert.deepEqual(configuration, { host: '127.0.0.1', port: 1025 });
      return { send: async () => undefined };
    },
  });

  try {
    assert.equal(composition.options.runtimeMode, 'production');
    assert.equal(composition.options.allowInMemoryAdapters, false);
    assert.deepEqual(composition.options.requestContext?.csrf?.allowedOrigins, [
      pilotEnvironment.DATABREEZE_PILOT_HTTPS_ORIGIN,
    ]);
  } finally {
    await composition.disconnect();
  }
  assert.deepEqual(events, [
    'redis-connect',
    'database-construct',
    'database-connect',
    'database-disconnect',
    'redis-disconnect',
  ]);
});

void test('[FND-003, IAM-022] pilot profile rejects missing, non-HTTPS, and non-origin public values', async () => {
  const candidates = [
    { ...pilotEnvironment, DATABREEZE_PILOT_HTTPS_ORIGIN: undefined },
    { ...pilotEnvironment, DATABREEZE_PILOT_HTTPS_ORIGIN: 'http://pilot.example.com' },
    { ...pilotEnvironment, DATABREEZE_PILOT_HTTPS_ORIGIN: 'https://pilot.example.com/path' },
    { ...pilotEnvironment, DATABREEZE_PILOT_HTTPS_ORIGIN: 'https://user:pass@pilot.example.com' },
  ] as const;
  for (const candidate of candidates) {
    await assert.rejects(
      createPilotDatabaseComposition(candidate, {
        createClient: () => databaseClient([]),
        createRedisClient: () => ({
          connect: async () => undefined,
          disconnect: async () => undefined,
          eval: async () => 1,
        }),
        createSmtpSender: () => ({ send: async () => undefined }),
      }),
      (error: unknown) => error instanceof Error && error.message === LOCAL_HTTPS_ORIGIN_ERROR,
    );
  }
});

void test('[FND-003, IAM-022] local composition accepts only loopback providers, HTTPS origin and managed-size keys', async () => {
  const cases = [
    [
      { ...environment, DATABASE_URL: 'postgresql://u:p@db.internal:5432/databreeze' },
      LOCAL_DATABASE_URL_ERROR,
    ],
    [
      { ...environment, DATABREEZE_REDIS_URL: 'rediss://redis.internal:6379' },
      LOCAL_REDIS_URL_ERROR,
    ],
    [
      { ...environment, DATABREEZE_IAM_SMTP_HOST: 'smtp.example.com' },
      LOCAL_SMTP_CONFIGURATION_ERROR,
    ],
    [
      {
        ...gmailEnvironment,
        DATABREEZE_IAM_SMTP_HOST: 'smtp.example.com',
      },
      LOCAL_SMTP_CONFIGURATION_ERROR,
    ],
    [
      { ...environment, DATABREEZE_LOCAL_HTTPS_ORIGIN: 'http://127.0.0.1:8443' },
      LOCAL_HTTPS_ORIGIN_ERROR,
    ],
    [
      { ...environment, DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY: 'not-a-key' },
      LOCAL_IAM_KEY_ERROR,
    ],
  ] as const;
  for (const [candidate, expected] of cases) {
    await assert.rejects(
      createLocalDatabaseComposition(candidate, {
        createClient: () => databaseClient([]),
        createRedisClient: () => ({
          connect: async () => undefined,
          disconnect: async () => undefined,
          eval: async () => 1,
        }),
        createSmtpSender: () => ({ send: async () => undefined }),
      }),
      (error: unknown) => error instanceof Error && error.message === expected,
    );
  }
});

void test('[IAM-022] local provider startup fails closed with one content-safe error and cleans up Redis', async () => {
  const events: string[] = [];
  await assert.rejects(
    createLocalDatabaseComposition(environment, {
      createClient: () => {
        throw new Error(`provider leaked ${environment.DATABASE_URL}`);
      },
      createRedisClient: () => ({
        connect: async () => void events.push('redis-connect'),
        disconnect: async () => void events.push('redis-disconnect'),
        eval: async () => 1,
      }),
      createSmtpSender: () => ({ send: async () => undefined }),
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === LOCAL_PROVIDER_UNAVAILABLE &&
      !error.message.includes(environment.DATABASE_URL),
  );
  assert.deepEqual(events, ['redis-connect', 'redis-disconnect']);
});
