/* eslint-disable @typescript-eslint/require-await -- shutdown callbacks mirror async runtime services. */

import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { resolve } from 'node:path';

import assert from 'node:assert/strict';
import test from 'node:test';

import { AppModule } from '../../src/app.module.js';
import { DdaModule } from '../../src/features/dda/dda.module.js';
import {
  DDA_NOTIFICATION_OUTBOX_WORKER,
  NotificationOutboxProjectionWorkerV1,
} from '../../src/features/dda/notification/notification-outbox.worker.js';
import {
  DDA_NOTIFICATION_RESOURCE_AUTHORIZATION,
  DashboardNotificationResourceAuthorizationAdapter,
} from '../../src/features/dda/notification/dashboard-notification-resource-authorization.adapter.js';
import { AuthenticationService } from '../../src/features/iam/application/authentication.service.js';
import { AUTHENTICATION_USE_CASE } from '../../src/features/iam/application/authentication.port.js';
import {
  DEVICE_IDENTITY_SERVICE,
  DeviceIdentityService,
} from '../../src/features/iam/application/device-identity.service.js';
import { Ed25519DeviceEnrollmentProofVerifierAdapter } from '../../src/features/iam/adapter/ed25519-device-enrollment-proof-verifier.adapter.js';
import {
  IAM_INVITATION_SERVICE,
  IAM_PRINCIPAL_EMAIL_LOOKUP_PORT,
} from '../../src/features/iam/application/invitation.service.js';
import { IAM_INVITATION_REPOSITORY_PORT } from '../../src/features/iam/application/invitation-repository.port.js';
import {
  MFA_SERVICE,
  MfaService,
  UnavailableMfaFactorProofVerifier,
} from '../../src/features/iam/application/mfa.service.js';
import { IAM_RECOVERY_SERVICE } from '../../src/features/iam/application/recovery.service.js';
import { IAM_RECOVERY_REPOSITORY_PORT } from '../../src/features/iam/application/recovery-repository.port.js';
import {
  IAM_REGISTRATION_SERVICE,
  RegistrationService,
} from '../../src/features/iam/application/registration.service.js';
import { IamModule } from '../../src/features/iam/iam.module.js';
import { PasswordCredentialService } from '../../src/features/iam/application/password-credential.service.js';
import { validateRequestContextOptionsV1 } from '../../src/platform/http/request-context.js';
import {
  createDatabaseCompositionForRuntime,
  createGracefulShutdownHandler,
  createProductionDatabaseComposition,
  createStartupCleanupHandler,
  productionShutdownDeadlineMs,
  PRODUCTION_CSRF_ORIGINS_ERROR,
  PRODUCTION_DATABASE_CLIENT_ERROR,
  PRODUCTION_DATABASE_URL_ERROR,
  PRODUCTION_OPENAI_CONFIGURATION_ERROR,
  PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR,
  PRODUCTION_IAM_EMAIL_VERIFICATION_SECRET_ERROR,
  PRODUCTION_IAM_REGISTRATION_ADMISSION_SECRET_ERROR,
  PRODUCTION_IAM_REDIS_URL_ERROR,
  PRODUCTION_IAM_EMAIL_DELIVERY_CONFIGURATION_ERROR,
  PRODUCTION_IAM_PROVIDER_UNAVAILABLE,
  PRODUCTION_IAE_ARTIFACT_STORAGE_CONFIGURATION_ERROR,
  PRODUCTION_IAE_WORKER_CAPABILITY_SIGNING_SECRET_ERROR,
  registerProductionShutdownHandlers,
} from '../../src/platform/production-database.composition.js';
import type { SourceCatalogDatabaseClientV1 } from '../../src/features/dda/source-catalog/adapter/prisma-source-catalog-repository.adapter.js';
import type { ServiceAccountDatabaseClientV1 } from '../../src/features/iam/adapter/prisma-service-account-repository.adapter.js';
import { IAM_EMAIL_VERIFICATION_SERVICE } from '../../src/features/iam/application/email-verification.service.js';
import { RedisRecoveryAdmissionAdapter } from '../../src/features/iam/adapter/redis-recovery-admission.adapter.js';

const databaseOptionKeys = [
  'credentialDatabase',
  'sessionDatabase',
  'identityBootstrapDatabase',
  'mfaDatabase',
  'iamDatabase',
  'hierarchyDatabase',
  'agentGrantDatabase',
  'invitationDatabase',
  'invitationPrincipalEmailDatabase',
  'registrationDatabase',
  'recoveryDatabase',
  'deviceIdentityDatabase',
  'serviceAccountDatabase',
  'artifactIntakeDatabase',
  'artifactDatabase',
  'artifactLineageDatabase',
  'artifactRetentionDatabase',
  'artifactExportDatabase',
  'artifactUploadDatabase',
  'workerCapabilityDatabase',
  'workerResultFinalizationDatabase',
  'protectedDocumentUnlockDatabase',
  'evidenceGrantDatabase',
  'governedDatasetDatabase',
  'mappingDatabase',
  'ruleSetDatabase',
  'referenceEntityDatabase',
  'datasetVersionDatabase',
  'datasetQualityDatabase',
  'datasetProfileDatabase',
  'datasetExportDatabase',
  'deviceSyncDatabase',
  'deviceAuthorizationDatabase',
  'deviceCapabilityDatabase',
  'dataModePolicyDatabase',
  'executionRouteDatabase',
  'auditDatabase',
  'auditAttestationDatabase',
  'entitlementDatabase',
  'entitlementLeaseDatabase',
  'spreadsheetAuditDatabase',
  'approvalDatabase',
  'jraWorkerDatabase',
  'ddaDatabase',
] as const;

const environment = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://app_user:secret-value@db.internal:5432/databreeze?schema=public',
  DATABREEZE_CSRF_ALLOWED_ORIGINS:
    ' https://app.databreeze.example, https://desktop.databreeze.example, https://app.databreeze.example ',
  DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY: Buffer.alloc(32, 7).toString('base64url'),
  DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY: Buffer.alloc(32, 12).toString('base64url'),
  DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY: Buffer.alloc(32, 8).toString('base64url'),
  DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY: Buffer.alloc(32, 9).toString('base64url'),
  DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY: Buffer.alloc(32, 10).toString('base64url'),
  DATABREEZE_REDIS_URL: 'rediss://redis.internal:6379',
  DATABREEZE_IAM_EMAIL_FROM_ADDRESS: 'verify@databreeze.example',
  DATABREEZE_IAM_EMAIL_SES_REGION: 'ap-southeast-1',
  DATABREEZE_IAE_ARTIFACT_BUCKET: 'databreeze-production-artifacts',
  DATABREEZE_IAE_ARTIFACT_REGION: 'ap-southeast-1',
  DATABREEZE_IAE_ARTIFACT_KMS_KEY_ARN:
    'arn:aws:kms:ap-southeast-1:123456789012:key/00000000-0000-4000-8000-000000000001',
} as const;

type TestDatabaseClient = SourceCatalogDatabaseClientV1 & {
  readonly $connect: () => Promise<void>;
  readonly $disconnect: () => Promise<void>;
  readonly $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
  readonly userIdentity: { readonly findUnique: (...argumentsList: never[]) => unknown };
  readonly dashboardRecord: { readonly findMany: (...argumentsList: never[]) => unknown };
};

function createTestDatabaseClient(
  overrides: {
    readonly connect?: () => Promise<void>;
    readonly disconnect?: () => Promise<void>;
    readonly queryRaw?: (query: TemplateStringsArray) => Promise<unknown>;
  } = {},
): TestDatabaseClient {
  return {
    $connect: overrides.connect ?? (async () => undefined),
    $disconnect: overrides.disconnect ?? (async () => undefined),
    $queryRaw: overrides.queryRaw ?? (async () => [{ ready: 1 }]),
    userIdentity: { findUnique: () => undefined },
    dashboardRecord: { findMany: () => [] },
    ddaDatasetSource: {
      findMany: async () => [],
      findFirst: async () => null,
    },
    ddaSourceAssignment: { findMany: async () => [] },
  };
}

const testIamProviderDependencies = {
  createRedisClient: () => ({
    connect: async () => undefined,
    disconnect: async () => undefined,
    eval: async () => 1,
  }),
  createSesClient: () => ({ send: async () => ({}) }),
} as const;

function iamDynamicModuleFor(options: Parameters<typeof AppModule.register>[0]): {
  readonly providers?: readonly unknown[];
} {
  const application = AppModule.register(options);
  const iam = application.imports?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'module' in candidate &&
      candidate.module === IamModule,
  );
  assert.ok(iam && typeof iam === 'object');
  return iam as { readonly providers?: readonly unknown[] };
}

function providerValue(
  module: { readonly providers?: readonly unknown[] },
  token: symbol,
): unknown {
  const provider = module.providers?.find(
    (candidate) =>
      typeof candidate === 'object' &&
      candidate !== null &&
      'provide' in candidate &&
      candidate.provide === token,
  );
  return provider && typeof provider === 'object' && 'useValue' in provider
    ? provider.useValue
    : undefined;
}

void test('[DDA-036, IAM-022, IAM-023, IAE-003, DSM-001, DDA-003, DDA-004, DDA-045, AUD-001, BUA-001, JRA-028] production composition creates one generated client for every durable module port', async () => {
  const events: string[] = [];
  const readinessQueries: string[] = [];
  const client = createTestDatabaseClient({
    connect: async () => {
      events.push('connect');
    },
    disconnect: async () => {
      events.push('disconnect');
    },
    queryRaw: async (query) => {
      readinessQueries.push(Array.from(query.raw).join(''));
      return [{ ready: 1 }];
    },
  });
  const composition = await createProductionDatabaseComposition(environment, {
    ...testIamProviderDependencies,
    createClient: (connectionString) => {
      assert.equal(connectionString, environment.DATABASE_URL);
      events.push('construct');
      return client;
    },
  });

  try {
    assert.deepEqual(events, ['construct', 'connect']);
    assert.equal(composition.client, client);
    assert.equal(typeof composition.client.$connect, 'function');
    assert.equal(typeof composition.client.$disconnect, 'function');
    assert.equal(typeof composition.client.userIdentity.findUnique, 'function');
    assert.equal(typeof composition.client.dashboardRecord.findMany, 'function');
    assert.equal(typeof composition.client.ddaDatasetSource.findMany, 'function');
    assert.equal(typeof composition.client.ddaSourceAssignment.findMany, 'function');
    assert.equal(composition.options.runtimeMode, 'production');
    assert.equal(composition.options.allowInMemoryAdapters, false);
    assert.deepEqual(composition.options.notificationOutboxWorker, {
      workerId: 'dda-notification-outbox-worker',
    });
    assert.equal(
      composition.options.serviceAccountSecretEnvelopeKey,
      environment.DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY,
    );
    assert.equal(
      composition.options.workerCapabilitySigningSecret,
      environment.DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY,
    );
    assert.ok(composition.options.passwordCredentials instanceof PasswordCredentialService);
    assert.ok(
      composition.options.mfaFactorProofVerifier instanceof UnavailableMfaFactorProofVerifier,
    );
    assert.ok(
      composition.options.deviceEnrollmentProofVerifier instanceof
        Ed25519DeviceEnrollmentProofVerifierAdapter,
    );
    const createdCredential = await composition.options.passwordCredentials.create(
      'production-test-password-123!',
    );
    assert.equal(createdCredential.accepted, true);
    if (createdCredential.accepted) assert.equal(createdCredential.value.algorithm, 'argon2id');
    assert.deepEqual(composition.options.requestContext, {
      csrf: {
        allowedOrigins: ['https://app.databreeze.example', 'https://desktop.databreeze.example'],
      },
    });
    assert.doesNotThrow(() =>
      validateRequestContextOptionsV1(composition.options.requestContext, 'production'),
    );
    assert.equal(await composition.options.readinessPort.check(), true);
    assert.deepEqual(readinessQueries, ['SELECT 1']);

    for (const key of databaseOptionKeys) {
      assert.equal(composition.options[key], composition.client, key);
    }

    const iam = iamDynamicModuleFor(composition.options);
    assert.ok(providerValue(iam, AUTHENTICATION_USE_CASE) instanceof AuthenticationService);
    assert.ok(providerValue(iam, IAM_REGISTRATION_SERVICE) instanceof RegistrationService);
    assert.ok(providerValue(iam, MFA_SERVICE) instanceof MfaService);
    assert.ok(providerValue(iam, DEVICE_IDENTITY_SERVICE) instanceof DeviceIdentityService);
    assert.ok(providerValue(iam, IAM_INVITATION_REPOSITORY_PORT));
    assert.ok(providerValue(iam, IAM_PRINCIPAL_EMAIL_LOOKUP_PORT));
    assert.ok(providerValue(iam, IAM_RECOVERY_REPOSITORY_PORT));
    assert.equal(providerValue(iam, IAM_INVITATION_SERVICE), undefined);
    assert.equal(providerValue(iam, IAM_RECOVERY_SERVICE), undefined);

    const application = AppModule.register(composition.options);
    const dda = application.imports?.find(
      (candidate) =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'module' in candidate &&
        candidate.module === DdaModule,
    );
    assert.ok(dda && typeof dda === 'object');
    assert.ok(
      providerValue(
        dda as { readonly providers?: readonly unknown[] },
        DDA_NOTIFICATION_OUTBOX_WORKER,
      ) instanceof NotificationOutboxProjectionWorkerV1,
    );
    assert.ok(
      providerValue(
        dda as { readonly providers?: readonly unknown[] },
        DDA_NOTIFICATION_RESOURCE_AUTHORIZATION,
      ) instanceof DashboardNotificationResourceAuthorizationAdapter,
    );
  } finally {
    await composition.disconnect();
    assert.deepEqual(events, ['construct', 'connect', 'disconnect']);
  }
});

void test('[IAM-022, IAM-023] production root rejects a missing or malformed managed service-account envelope key without reflecting it', async () => {
  const invalidKeys = [
    undefined,
    '',
    'not-base64url',
    Buffer.alloc(31, 7).toString('base64url'),
    `${environment.DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY}!`,
  ];

  for (const key of invalidKeys) {
    const candidateEnvironment = {
      ...environment,
      ...(key === undefined
        ? { DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY: undefined }
        : { DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY: key }),
    };
    await assert.rejects(
      createProductionDatabaseComposition(candidateEnvironment, {
        createClient: () => {
          throw new Error('client must not be constructed before secret validation');
        },
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR &&
        !error.message.includes(environment.DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY),
    );
  }
});

void test('[IAM-022] production composes durable OTP delivery and two shared Redis admission policies', async () => {
  const lifecycle: string[] = [];
  const redisUrls: string[] = [];
  const sesRegions: string[] = [];
  const composition = await createProductionDatabaseComposition(environment, {
    createClient: () =>
      createTestDatabaseClient({
        connect: async () => void lifecycle.push('database-connect'),
        disconnect: async () => void lifecycle.push('database-disconnect'),
      }),
    createRedisClient: (url) => {
      redisUrls.push(url);
      return {
        connect: async () => void lifecycle.push('redis-connect'),
        disconnect: async () => void lifecycle.push('redis-disconnect'),
        eval: async () => 1,
      };
    },
    createSesClient: (region) => {
      sesRegions.push(region);
      return { send: async () => ({}) };
    },
  });

  try {
    assert.deepEqual(redisUrls, ['rediss://redis.internal:6379']);
    assert.deepEqual(sesRegions, ['ap-southeast-1']);
    assert.deepEqual(lifecycle, ['redis-connect', 'database-connect']);
    assert.ok(composition.options.registrationIpAdmission instanceof RedisRecoveryAdmissionAdapter);
    assert.ok(
      composition.options.registrationEmailAdmission instanceof RedisRecoveryAdmissionAdapter,
    );
    const iam = iamDynamicModuleFor(composition.options);
    assert.ok(providerValue(iam, IAM_EMAIL_VERIFICATION_SERVICE));
  } finally {
    await composition.disconnect();
  }
  assert.deepEqual(lifecycle, [
    'redis-connect',
    'database-connect',
    'database-disconnect',
    'redis-disconnect',
  ]);
});

void test('[IAM-022] production IAM configuration rejects malformed protected values before provider access', async () => {
  const cases = [
    {
      environment: { ...environment, DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY: 'bad-key' },
      expected: PRODUCTION_IAM_EMAIL_VERIFICATION_SECRET_ERROR,
    },
    {
      environment: {
        ...environment,
        DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY: Buffer.alloc(31, 9).toString('base64url'),
      },
      expected: PRODUCTION_IAM_EMAIL_VERIFICATION_SECRET_ERROR,
    },
    {
      environment: { ...environment, DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY: 'bad-key' },
      expected: PRODUCTION_IAM_REGISTRATION_ADMISSION_SECRET_ERROR,
    },
    {
      environment: {
        ...environment,
        DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY: Buffer.alloc(31, 12).toString('base64url'),
      },
      expected: PRODUCTION_IAE_WORKER_CAPABILITY_SIGNING_SECRET_ERROR,
    },
    {
      environment: { ...environment, DATABREEZE_REDIS_URL: 'redis://redis.internal:6379' },
      expected: PRODUCTION_IAM_REDIS_URL_ERROR,
    },
    {
      environment: {
        ...environment,
        DATABREEZE_IAM_EMAIL_FROM_ADDRESS: 'verify@databreeze.example\r\nBcc:attacker@example.com',
      },
      expected: PRODUCTION_IAM_EMAIL_DELIVERY_CONFIGURATION_ERROR,
    },
    {
      environment: { ...environment, DATABREEZE_IAM_EMAIL_SES_REGION: 'not-a-region' },
      expected: PRODUCTION_IAM_EMAIL_DELIVERY_CONFIGURATION_ERROR,
    },
  ] as const;

  for (const candidate of cases) {
    let providerCalls = 0;
    await assert.rejects(
      createProductionDatabaseComposition(candidate.environment, {
        createClient: () => {
          providerCalls += 1;
          return createTestDatabaseClient();
        },
        createRedisClient: () => {
          providerCalls += 1;
          throw new Error('must not be called');
        },
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === candidate.expected &&
        !error.message.includes('bad-key') &&
        !error.message.includes('attacker@example.com'),
    );
    assert.equal(providerCalls, 0);
  }
});

void test('[IAM-022] production hides Redis and SES provider failures behind one stable error', async () => {
  await assert.rejects(
    createProductionDatabaseComposition(environment, {
      createClient: () => createTestDatabaseClient(),
      createRedisClient: () => ({
        connect: async () => {
          throw new Error('redis provider body with redis.internal');
        },
        disconnect: async () => undefined,
        eval: async () => 1,
      }),
      createSesClient: () => ({ send: async () => ({}) }),
    }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === PRODUCTION_IAM_PROVIDER_UNAVAILABLE &&
      !error.message.includes('redis.internal'),
  );
});

void test('[IAM-022, IAM-023] AppModule fails closed when a durable service-account database has no envelope configuration', () => {
  const serviceAccountDatabase =
    createTestDatabaseClient() as unknown as ServiceAccountDatabaseClientV1;

  assert.throws(
    () =>
      AppModule.register({
        runtimeMode: 'production',
        allowInMemoryAdapters: false,
        serviceAccountDatabase,
      }),
    (error: unknown) =>
      error instanceof Error &&
      error.message === 'IAM_SERVICE_ACCOUNT_ENVELOPE_KEY_REQUIRED' &&
      !error.message.includes('secret-value'),
  );
});

void test('[DDA-036] a production database connect failure disconnects the same client once and exposes only a stable error', async () => {
  const events: string[] = [];
  const client = createTestDatabaseClient({
    connect: async () => {
      events.push('connect');
      throw new Error('provider detail DATABASE_URL=postgresql://user:secret@db.internal:5432/app');
    },
    disconnect: async () => {
      events.push('disconnect');
      throw new Error('disconnect detail from provider');
    },
  });

  await assert.rejects(
    (async () => {
      await createProductionDatabaseComposition(environment, {
        ...testIamProviderDependencies,
        createClient: () => {
          events.push('construct');
          return client;
        },
      });
    })(),
    (error: unknown) =>
      error instanceof Error &&
      error.message === PRODUCTION_DATABASE_CLIENT_ERROR &&
      !error.message.includes('secret') &&
      !error.message.includes('db.internal') &&
      !error.message.includes('provider detail'),
  );
  assert.deepEqual(events, ['construct', 'connect', 'disconnect']);
});

void test('[DDA-036] production CSRF origin environment is strict and content-safe', async () => {
  const invalidOrigins = [
    undefined,
    '',
    '   ',
    ',',
    'https://app.databreeze.example,',
    ',https://app.databreeze.example',
    'https://app.databreeze.example,,https://desktop.databreeze.example',
    'http://app.databreeze.example',
    'https://user:secret-value@app.databreeze.example',
    'https://@app.databreeze.example',
    'https://app.databreeze.example/',
    'https://app.databreeze.example/path',
    'https://app.databreeze.example?tenant=one',
    'https://app.databreeze.example?',
    'https://app.databreeze.example#fragment',
    'https://app.databreeze.example#',
    'https://*.databreeze.example',
    'not-an-origin',
    Array.from({ length: 17 }, (_, index) => `https://app-${index}.databreeze.example`).join(','),
  ];

  for (const origins of invalidOrigins) {
    await assert.rejects(
      createProductionDatabaseComposition({
        NODE_ENV: 'production',
        DATABASE_URL: environment.DATABASE_URL,
        ...(origins === undefined ? {} : { DATABREEZE_CSRF_ALLOWED_ORIGINS: origins }),
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === PRODUCTION_CSRF_ORIGINS_ERROR &&
        !error.message.includes('secret-value') &&
        !error.message.includes('db.internal'),
    );
  }
});

void test('[DDA-036] production OpenAI flags require a valid key and bounded non-secret settings', async () => {
  const validEnvironment = {
    ...environment,
    DATABREEZE_OPENAI_AGENT_ENABLED: 'true',
    DATABREEZE_OPENAI_AGENT_MODEL: 'gpt-4o-mini-2024-07-18',
    DATABREEZE_OPENAI_AGENT_TIMEOUT_MS: '1000',
    DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS: '128',
    DATABREEZE_OPENAI_RECEIPT_ENABLED: 'true',
    DATABREEZE_OPENAI_RECEIPT_MODEL: 'gpt-4o-mini-2024-07-18',
    DATABREEZE_OPENAI_IMAGE_DETAIL: 'high',
    DATABREEZE_OPENAI_TIMEOUT_MS: '1000',
    DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS: '128',
    OPENAI_API_KEY: 'sk-proj-test-key-1234567890',
  };
  const composition = await createProductionDatabaseComposition(validEnvironment, {
    ...testIamProviderDependencies,
    createClient: () => createTestDatabaseClient(),
  });
  await composition.disconnect();

  const invalidEnvironments = [
    {
      ...environment,
      DATABREEZE_OPENAI_AGENT_ENABLED: 'true',
    },
    {
      ...environment,
      DATABREEZE_OPENAI_RECEIPT_ENABLED: 'true',
      OPENAI_API_KEY: 'not-an-openai-key',
    },
    {
      ...validEnvironment,
      DATABREEZE_OPENAI_AGENT_TIMEOUT_MS: '999',
    },
    {
      ...validEnvironment,
      DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS: '4097',
    },
    {
      ...validEnvironment,
      DATABREEZE_OPENAI_RECEIPT_MODEL: 'bad model',
    },
    {
      ...validEnvironment,
      DATABREEZE_OPENAI_IMAGE_DETAIL: 'invalid',
    },
    {
      ...validEnvironment,
      DATABREEZE_OPENAI_TIMEOUT_MS: '0',
    },
    {
      ...validEnvironment,
      DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS: '4097',
    },
    {
      ...validEnvironment,
      DATABREEZE_OPENAI_AGENT_ENABLED: 'yes',
    },
  ];

  for (const invalidEnvironment of invalidEnvironments) {
    await assert.rejects(
      createProductionDatabaseComposition(invalidEnvironment, {
        createClient: () => createTestDatabaseClient(),
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === PRODUCTION_OPENAI_CONFIGURATION_ERROR &&
        !error.message.includes('sk-proj-test-key-1234567890'),
    );
  }
});

void test('[IAE-014] production artifact storage requires exact private S3 configuration', async () => {
  for (const candidate of [
    { ...environment, DATABREEZE_IAE_ARTIFACT_BUCKET: '' },
    { ...environment, DATABREEZE_IAE_ARTIFACT_BUCKET: 'Invalid_Bucket' },
    { ...environment, DATABREEZE_IAE_ARTIFACT_REGION: 'not-a-region' },
    {
      ...environment,
      DATABREEZE_IAE_ARTIFACT_KMS_KEY_ARN:
        'arn:aws:kms:us-east-1:123456789012:key/00000000-0000-4000-8000-000000000001',
    },
  ]) {
    await assert.rejects(
      createProductionDatabaseComposition(candidate, {
        ...testIamProviderDependencies,
        createClient: () => createTestDatabaseClient(),
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === PRODUCTION_IAE_ARTIFACT_STORAGE_CONFIGURATION_ERROR,
    );
  }
});

void test('[DDA-036] development and test runtimes do not construct or connect a production database client implicitly', async () => {
  assert.equal(
    await createDatabaseCompositionForRuntime({
      NODE_ENV: 'development',
      DATABASE_URL: 'not-a-url',
    }),
    undefined,
  );
  assert.equal(
    await createDatabaseCompositionForRuntime({
      NODE_ENV: 'test',
      DATABASE_URL: environment.DATABASE_URL,
    }),
    undefined,
  );
});

void test('[DDA-036] missing or invalid production DATABASE_URL fails with one content-safe error', async () => {
  for (const candidate of [
    undefined,
    '',
    'mysql://app_user:secret-value@db.internal:3306/databreeze',
    'postgresql://app_user@db.internal:5432/databreeze',
    'postgresql://app_user:secret-value@/databreeze',
  ]) {
    await assert.rejects(
      createProductionDatabaseComposition({
        NODE_ENV: 'production',
        ...(candidate === undefined ? {} : { DATABASE_URL: candidate }),
      }),
      (error: unknown) =>
        error instanceof Error &&
        error.message === PRODUCTION_DATABASE_URL_ERROR &&
        !error.message.includes('secret-value'),
    );
  }
});

void test('[DDA-036] graceful shutdown closes the application before disconnecting the shared client once', async () => {
  const events: string[] = [];
  const shutdown = createGracefulShutdownHandler(
    async () => {
      events.push('app');
    },
    async () => {
      events.push('database');
    },
  );

  const first = shutdown();
  const second = shutdown();
  assert.equal(first, second);
  await first;
  assert.deepEqual(events, ['app', 'database']);
});

void test('[DDA-036] graceful shutdown still disconnects the shared client when application close rejects', async () => {
  const events: string[] = [];
  const closeError = new Error('application close failed');
  const shutdown = createGracefulShutdownHandler(
    async () => {
      events.push('app');
      throw closeError;
    },
    async () => {
      events.push('database');
    },
  );

  await assert.rejects(shutdown(), (error: unknown) => error === closeError);
  assert.deepEqual(events, ['app', 'database']);
});

void test('[DDA-036] graceful shutdown rejects when the shared production deadline expires', async () => {
  let resolveApplicationClose: (() => void) | undefined;
  const events: string[] = [];
  const shutdown = createGracefulShutdownHandler(
    () =>
      new Promise<void>((resolve) => {
        resolveApplicationClose = resolve;
      }),
    async () => {
      events.push('database');
    },
    { deadlineMs: 10 },
  );

  const result = await Promise.race([
    shutdown().then(
      () => 'completed',
      (error: unknown) => (error instanceof Error ? error.message : 'rejected'),
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve('test-observer-timed-out'), 250);
    }),
  ]);

  assert.equal(result, 'PRODUCTION_SHUTDOWN_DEADLINE_EXCEEDED');
  assert.deepEqual(events, []);
  resolveApplicationClose?.();
});

void test('[DDA-036] production shutdown deadline configuration defaults safely and rejects unbounded values', () => {
  assert.equal(productionShutdownDeadlineMs({}), 25_000);
  assert.equal(
    productionShutdownDeadlineMs({ DATABREEZE_PRODUCTION_SHUTDOWN_DEADLINE_MS: '1000' }),
    1_000,
  );
  for (const value of ['0', '-1', 'not-a-number', '29001', '30000']) {
    assert.throws(
      () => productionShutdownDeadlineMs({ DATABREEZE_PRODUCTION_SHUTDOWN_DEADLINE_MS: value }),
      (error: unknown) =>
        error instanceof Error && error.message === 'PRODUCTION_SHUTDOWN_DEADLINE_INVALID',
    );
  }
});

void test('[DDA-036] production signal registration keeps a real second-signal handler reachable until clean shutdown', async () => {
  const registered = new Map<string, Array<() => void>>();
  const removeCalls: string[] = [];
  const signalProcess = {
    on(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void {
      registered.set(signal, [...(registered.get(signal) ?? []), handler]);
    },
    removeListener(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void {
      removeCalls.push(signal);
      registered.set(
        signal,
        (registered.get(signal) ?? []).filter((candidate) => candidate !== handler),
      );
    },
  };
  let resolveShutdown: (() => void) | undefined;
  let shutdownCalls = 0;
  const forceCalls: string[] = [];
  const dispose = registerProductionShutdownHandlers(
    () => {
      shutdownCalls += 1;
      return new Promise<void>((resolve) => {
        resolveShutdown = resolve;
      });
    },
    {
      process: signalProcess,
      deadlineMs: 1000,
      forceTerminate: (signal) => forceCalls.push(signal),
    },
  );

  const sigtermHandler = registered.get('SIGTERM')?.[0];
  const sigintHandler = registered.get('SIGINT')?.[0];
  assert.ok(sigtermHandler);
  assert.ok(sigintHandler);
  sigtermHandler?.();
  assert.deepEqual(removeCalls, []);
  assert.equal(registered.get('SIGINT')?.length, 1);
  assert.equal(registered.get('SIGTERM')?.length, 1);
  assert.equal(shutdownCalls, 1);

  sigintHandler?.();
  assert.deepEqual(forceCalls, ['SIGINT']);

  resolveShutdown?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(removeCalls, ['SIGINT', 'SIGTERM']);
  dispose();
  dispose();
  assert.deepEqual(removeCalls, ['SIGINT', 'SIGTERM']);
});

void test('[DDA-036] production shutdown force-terminates after the hard cleanup deadline', async () => {
  const registered = new Map<string, Array<() => void>>();
  const signalProcess = {
    on(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void {
      registered.set(signal, [...(registered.get(signal) ?? []), handler]);
    },
    removeListener(): void {
      // The test invokes retained named handlers to model a second signal after removal.
    },
  };
  const forcedSignal = new Promise<string>((resolve) => {
    registerProductionShutdownHandlers(() => new Promise<void>(() => undefined), {
      process: signalProcess,
      deadlineMs: 10,
      forceTerminate: resolve,
    });
    registered.get('SIGTERM')?.[0]?.();
  });

  assert.equal(await forcedSignal, 'SIGTERM');
});

void test('[DDA-036] a rejected shutdown force-terminates instead of leaving the process alive', async () => {
  const registered = new Map<string, Array<() => void>>();
  const signalProcess = {
    on(signal: 'SIGINT' | 'SIGTERM', handler: () => void): void {
      registered.set(signal, [...(registered.get(signal) ?? []), handler]);
    },
    removeListener(): void {
      // The force callback is the terminal path for this test.
    },
  };
  const forcedSignals: string[] = [];
  registerProductionShutdownHandlers(
    async () => {
      throw new Error('shutdown failed');
    },
    {
      process: signalProcess,
      deadlineMs: 1000,
      forceTerminate: (signal) => forcedSignals.push(signal),
    },
  );
  registered.get('SIGTERM')?.[0]?.();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(forcedSignals, ['SIGTERM']);
});

void test('[DDA-036] the real child process signal lifecycle reaches forced termination on a second signal', async () => {
  const child = spawn(
    process.execPath,
    [resolve(process.cwd(), 'test/platform/production-shutdown-child.mjs')],
    {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );

  try {
    assert.ok(child.stdout);
    const childReady = once(child.stdout, 'data') as Promise<[Buffer]>;
    await once(child, 'spawn');
    const childExit = once(child, 'exit') as Promise<[number | null, string | null]>;
    await Promise.race([
      childReady,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('child did not register signal handlers')), 5_000),
      ),
    ]);
    await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 100));
    if (process.platform === 'win32') {
      child.send?.('SIGTERM');
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 25));
      child.send?.('SIGTERM');
    } else {
      child.kill('SIGTERM');
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 25));
      child.kill('SIGTERM');
    }
    const [exitCode] = await Promise.race([
      childExit,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('child did not force-terminate')), 1_000),
      ),
    ]);
    assert.equal(exitCode, 73);
  } finally {
    if (child.exitCode === null) child.kill();
  }
});

void test('[DDA-036] API startup source composes and connects before it calls listen', async () => {
  const source = await readFile(resolve(process.cwd(), 'src/main.ts'), 'utf8');
  const compositionIndex = source.indexOf('database = await createDatabaseCompositionForRuntime');
  const applicationIndex = source.indexOf('createApiApplication(database?.options ?? {})');
  const listenIndex = source.indexOf('await app.listen');
  assert.ok(compositionIndex >= 0);
  assert.ok(applicationIndex > compositionIndex);
  assert.ok(listenIndex > applicationIndex);
  assert.match(source, /registerProductionShutdownHandlers/u);
});

void test('[DDA-036] listen-failure cleanup disposes signal registration before closing application and database once', async () => {
  const events: string[] = [];
  const cleanup = createStartupCleanupHandler(
    () => {
      events.push('dispose-signals');
    },
    async () => {
      events.push('close-application');
      events.push('disconnect-database');
    },
  );

  await cleanup();
  await cleanup();
  assert.deepEqual(events, ['dispose-signals', 'close-application', 'disconnect-database']);
});
