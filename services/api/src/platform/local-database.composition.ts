import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { S3Client } from '@aws-sdk/client-s3';
import { createClient as createRedisClient } from 'redis';

import type { ApiApplicationOptions } from '../bootstrap.js';
import { Argon2PasswordHasherAdapter } from '../features/iam/adapter/argon2-password-hasher.adapter.js';
import { Aes256GcmEmailVerificationEnvelopeAdapter } from '../features/iam/adapter/email-verification-envelope.adapter.js';
import { HmacSha256EmailVerificationDigestAdapter } from '../features/iam/adapter/in-memory-email-verification-repository.adapter.js';
import { HmacSha256IamRegistrationAdmissionDigestAdapter } from '../features/iam/adapter/iam-registration-crypto.adapter.js';
import { HmacSha256IamRecoveryDigestAdapter } from '../features/iam/adapter/iam-recovery-crypto.adapter.js';
import {
  GmailSmtpEmailVerificationDeliveryAdapter,
  GmailSmtpSenderAdapter,
  type GmailSmtpSenderOptionsV1,
} from '../features/iam/adapter/gmail-smtp-email-verification-delivery.adapter.js';
import {
  MailpitSmtpEmailVerificationDeliveryAdapter,
  NodeLoopbackSmtpSenderAdapter,
  type NodeLoopbackSmtpOptionsV1,
  type SmtpSenderPortV1,
} from '../features/iam/adapter/mailpit-smtp-email-verification-delivery.adapter.js';
import { SmtpPasswordRecoveryDeliveryAdapter } from '../features/iam/adapter/smtp-password-recovery-delivery.adapter.js';
import {
  NodeRedisEvalClientAdapter,
  type NodeRedisEvalPortV1,
} from '../features/iam/adapter/node-redis-admission-counter.adapter.js';
import {
  RedisEvalRecoveryAdmissionCounterAdapter,
  RedisRecoveryAdmissionAdapter,
} from '../features/iam/adapter/redis-recovery-admission.adapter.js';
import { PasswordCredentialService } from '../features/iam/application/password-credential.service.js';
import {
  PrismaInitialWorkspacePolicyProvisionerAdapter,
  type InitialWorkspacePolicyDatabaseClientV1,
} from '../features/dso/adapter/prisma-initial-workspace-policy-provisioner.adapter.js';
import { Ed25519DeviceEnrollmentProofVerifierAdapter } from '../features/iam/adapter/ed25519-device-enrollment-proof-verifier.adapter.js';
import { UnavailableMfaFactorProofVerifier } from '../features/iam/application/mfa.service.js';
import { DatabaseReadinessAdapter } from '../features/system/adapter/database-readiness.adapter.js';
import { LocalMinioWebIntakeObjectStoreAdapter } from '../features/iae/adapter/local-minio-web-intake-object-store.adapter.js';
import type { LocalWebIntakeDatabaseV1 } from '../features/iae/adapter/local-web-intake.adapter.js';

export const LOCAL_RUNTIME_PROFILE = 'local';
export const PILOT_RUNTIME_PROFILE = 'pilot';
export const LOCAL_RUNTIME_PROFILE_ERROR = 'LOCAL_RUNTIME_PROFILE_INVALID';
export const LOCAL_DATABASE_URL_ERROR = 'LOCAL_DATABASE_URL_INVALID';
export const LOCAL_REDIS_URL_ERROR = 'LOCAL_REDIS_URL_INVALID';
export const LOCAL_SMTP_CONFIGURATION_ERROR = 'LOCAL_SMTP_CONFIGURATION_INVALID';
export const LOCAL_HTTPS_ORIGIN_ERROR = 'LOCAL_HTTPS_ORIGIN_INVALID';
export const LOCAL_IAM_KEY_ERROR = 'LOCAL_IAM_KEY_INVALID';
export const LOCAL_PROVIDER_UNAVAILABLE = 'LOCAL_PROVIDER_UNAVAILABLE';
export const LOCAL_MINIO_CONFIGURATION_ERROR = 'LOCAL_MINIO_CONFIGURATION_INVALID';

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface LocalDatabaseClient {
  readonly $connect: () => Promise<void>;
  readonly $disconnect: () => Promise<void>;
  readonly $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
}

interface LocalGeneratedPrismaClientConstructor {
  new (options: { readonly adapter: unknown }): LocalDatabaseClient;
}

export interface LocalRedisClient extends NodeRedisEvalPortV1 {
  readonly connect: () => Promise<unknown>;
  readonly disconnect: () => Promise<unknown>;
}

export interface LocalDatabaseCompositionDependencies {
  readonly createClient?: (
    connectionString: string,
  ) => LocalDatabaseClient | Promise<LocalDatabaseClient>;
  readonly createRedisClient?: (url: string) => LocalRedisClient;
  readonly createSmtpSender?: (configuration: NodeLoopbackSmtpOptionsV1) => SmtpSenderPortV1;
  readonly createGmailSmtpSender?: (configuration: GmailSmtpSenderOptionsV1) => SmtpSenderPortV1;
}

export interface LocalDatabaseComposition {
  readonly client: LocalDatabaseClient;
  readonly options: ApiApplicationOptions;
  readonly disconnect: () => Promise<void>;
}

const DATABASE_OPTION_KEYS = [
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
  'emailVerificationDatabase',
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
  'paymentDatabase',
  'resultUsageSettlementBindingDatabase',
  'entitlementLeaseDatabase',
  'spreadsheetAuditDatabase',
  'approvalDatabase',
  'mobileDatabase',
  'jraWorkerDatabase',
  'ddaDatabase',
] as const;

function isLoopback(hostname: string): boolean {
  return (
    hostname === '127.0.0.1' ||
    hostname === 'localhost' ||
    hostname === '[::1]' ||
    hostname === '::1'
  );
}

function isLocalDatabaseHost(hostname: string): boolean {
  return isLoopback(hostname) || hostname === 'postgres';
}

function isLocalRedisHost(hostname: string): boolean {
  return isLoopback(hostname) || hostname === 'redis';
}

function isLocalSmtpHost(hostname: string): boolean {
  return isLoopback(hostname) || hostname === 'mailpit';
}

function localEmailProvider(environment: RuntimeEnvironment): 'mailpit' | 'gmail' {
  const provider = environment['DATABREEZE_LOCAL_EMAIL_PROVIDER']?.trim() || 'mailpit';
  if (provider !== 'mailpit' && provider !== 'gmail') {
    throw new Error(LOCAL_SMTP_CONFIGURATION_ERROR);
  }
  return provider;
}

function localMinioOptions(environment: RuntimeEnvironment):
  | {
      readonly endpoint: string;
      readonly accessKeyId: string;
      readonly secretAccessKey: string;
      readonly bucket: string;
    }
  | undefined {
  const rawEndpoint = environment['DATABREEZE_LOCAL_MINIO_ENDPOINT']?.trim();
  const rawAccessKey = environment['DATABREEZE_LOCAL_MINIO_ACCESS_KEY']?.trim();
  const rawSecretKey = environment['DATABREEZE_LOCAL_MINIO_SECRET_KEY']?.trim();
  const rawBucket = environment['DATABREEZE_LOCAL_MINIO_BUCKET']?.trim();
  if (!rawEndpoint && !rawAccessKey && !rawSecretKey && !rawBucket) return undefined;
  if (!rawEndpoint || !rawAccessKey || !rawSecretKey || !rawBucket)
    throw new Error(LOCAL_MINIO_CONFIGURATION_ERROR);
  let parsed: URL;
  try {
    parsed = new URL(rawEndpoint);
  } catch {
    throw new Error(LOCAL_MINIO_CONFIGURATION_ERROR);
  }
  if (
    parsed.protocol !== 'http:' ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    (!isLoopback(parsed.hostname) && parsed.hostname !== 'minio')
  )
    throw new Error(LOCAL_MINIO_CONFIGURATION_ERROR);
  if (!/^[a-z0-9][a-z0-9.-]{2,62}$/u.test(rawBucket))
    throw new Error(LOCAL_MINIO_CONFIGURATION_ERROR);
  return Object.freeze({
    endpoint: parsed.toString().replace(/\/$/u, ''),
    accessKeyId: rawAccessKey,
    secretAccessKey: rawSecretKey,
    bucket: rawBucket,
  });
}

function localDatabaseUrl(environment: RuntimeEnvironment): string {
  const candidate = environment['DATABASE_URL']?.trim();
  if (!candidate) throw new Error(LOCAL_DATABASE_URL_ERROR);
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') ||
      !isLocalDatabaseHost(parsed.hostname) ||
      parsed.username.length === 0 ||
      parsed.password.length === 0 ||
      parsed.pathname.length <= 1 ||
      parsed.hash.length > 0
    ) {
      throw new Error(LOCAL_DATABASE_URL_ERROR);
    }
    return candidate;
  } catch {
    throw new Error(LOCAL_DATABASE_URL_ERROR);
  }
}

function localRedisUrl(environment: RuntimeEnvironment): string {
  const candidate = environment['DATABREEZE_REDIS_URL']?.trim();
  if (!candidate || candidate.length > 2_048) throw new Error(LOCAL_REDIS_URL_ERROR);
  try {
    const parsed = new URL(candidate);
    const port = parsed.port === '' ? 6379 : Number(parsed.port);
    if (
      parsed.protocol !== 'redis:' ||
      !isLocalRedisHost(parsed.hostname) ||
      !Number.isSafeInteger(port) ||
      port < 1 ||
      port > 65_535 ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      (parsed.pathname !== '' && parsed.pathname !== '/') ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      throw new Error(LOCAL_REDIS_URL_ERROR);
    }
    return candidate;
  } catch {
    throw new Error(LOCAL_REDIS_URL_ERROR);
  }
}

function localBrowserOrigin(
  environment: RuntimeEnvironment,
  profile: typeof LOCAL_RUNTIME_PROFILE | typeof PILOT_RUNTIME_PROFILE,
): string {
  const hmrHttp =
    profile === LOCAL_RUNTIME_PROFILE && environment['DATABREEZE_LOCAL_HMR_HTTP'] === 'true';
  const hmrCandidate = environment['DATABREEZE_LOCAL_HMR_ORIGIN']?.trim();
  const candidate = hmrHttp
    ? hmrCandidate
    : environment[
        profile === PILOT_RUNTIME_PROFILE
          ? 'DATABREEZE_PILOT_HTTPS_ORIGIN'
          : 'DATABREEZE_LOCAL_HTTPS_ORIGIN'
      ]?.trim();
  if (!candidate) throw new Error(LOCAL_HTTPS_ORIGIN_ERROR);
  try {
    const parsed = new URL(candidate);
    if (
      (hmrHttp ? parsed.protocol !== 'http:' : parsed.protocol !== 'https:') ||
      (hmrHttp || profile === LOCAL_RUNTIME_PROFILE
        ? !isLoopback(parsed.hostname)
        : isLoopback(parsed.hostname)) ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      candidate !== parsed.origin
    ) {
      throw new Error(LOCAL_HTTPS_ORIGIN_ERROR);
    }
    return parsed.origin;
  } catch {
    throw new Error(LOCAL_HTTPS_ORIGIN_ERROR);
  }
}

function localManagedKey(environment: RuntimeEnvironment, name: string): Uint8Array {
  const candidate = environment[name]?.trim();
  if (!candidate || !/^[A-Za-z0-9_-]{43}$/u.test(candidate)) {
    throw new Error(LOCAL_IAM_KEY_ERROR);
  }
  try {
    const decoded = Buffer.from(candidate, 'base64url');
    if (decoded.byteLength !== 32 || decoded.toString('base64url') !== candidate) {
      throw new Error(LOCAL_IAM_KEY_ERROR);
    }
    return decoded;
  } catch {
    throw new Error(LOCAL_IAM_KEY_ERROR);
  }
}

function localSmtpOptions(environment: RuntimeEnvironment): NodeLoopbackSmtpOptionsV1 {
  const host = environment['DATABREEZE_IAM_SMTP_HOST']?.trim();
  const portValue = environment['DATABREEZE_IAM_SMTP_PORT']?.trim();
  const port = portValue && /^\d{1,5}$/u.test(portValue) ? Number(portValue) : Number.NaN;
  if (!host || !isLocalSmtpHost(host) || !Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error(LOCAL_SMTP_CONFIGURATION_ERROR);
  }
  return Object.freeze({ host, port });
}

function localGmailSmtpOptions(environment: RuntimeEnvironment): GmailSmtpSenderOptionsV1 {
  const host = environment['DATABREEZE_IAM_SMTP_HOST']?.trim();
  const portValue = environment['DATABREEZE_IAM_SMTP_PORT']?.trim();
  const port = portValue && /^\d{1,5}$/u.test(portValue) ? Number(portValue) : Number.NaN;
  const username = environment['DATABREEZE_IAM_SMTP_USERNAME']?.trim();
  const appPassword = environment['DATABREEZE_IAM_SMTP_APP_PASSWORD']?.trim();
  if (
    host !== 'smtp.gmail.com' ||
    port !== 465 ||
    !username ||
    !appPassword ||
    !/^[A-Za-z0-9]{16}$/u.test(appPassword.replace(/\s/gu, ''))
  ) {
    throw new Error(LOCAL_SMTP_CONFIGURATION_ERROR);
  }
  return Object.freeze({ host, port, username, appPassword });
}

function localFromAddress(environment: RuntimeEnvironment): string {
  const candidate = environment['DATABREEZE_IAM_EMAIL_FROM_ADDRESS']?.trim();
  if (!candidate) throw new Error(LOCAL_SMTP_CONFIGURATION_ERROR);
  return candidate;
}

function generatedClientPath(): string {
  const candidates = [
    resolve(process.cwd(), 'build/prisma-client'),
    resolve(process.cwd(), 'services/api/build/prisma-client'),
  ];
  for (const directory of candidates) {
    const typescriptClient = resolve(directory, 'client.ts');
    if (existsSync(typescriptClient)) return typescriptClient;
    const javascriptClient = resolve(directory, 'client.js');
    if (existsSync(javascriptClient) && existsSync(resolve(directory, 'internal/class.js'))) {
      return javascriptClient;
    }
  }
  throw new Error(LOCAL_PROVIDER_UNAVAILABLE);
}

let registeredGeneratedClientDirectory: string | undefined;

function registerGeneratedClientTypescriptResolver(clientPath: string): void {
  const generatedDirectory = `${pathToFileURL(resolve(clientPath, '..')).href}/`;
  if (registeredGeneratedClientDirectory === generatedDirectory) return;
  const loaderSource = `
    const generatedDirectory = ${JSON.stringify(generatedDirectory)};
    export async function resolve(specifier, context, nextResolve) {
      if (context.parentURL?.startsWith(generatedDirectory) && specifier.endsWith('.js')) {
        return nextResolve(specifier.slice(0, -3) + '.ts', context);
      }
      return nextResolve(specifier, context);
    }
  `;
  register(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`, {
    parentURL: import.meta.url,
  });
  registeredGeneratedClientDirectory = generatedDirectory;
}

async function loadGeneratedPrismaClient(): Promise<LocalGeneratedPrismaClientConstructor> {
  try {
    const clientPath = generatedClientPath();
    if (clientPath.endsWith('.ts')) registerGeneratedClientTypescriptResolver(clientPath);
    const generated = (await import(pathToFileURL(clientPath).href)) as {
      readonly PrismaClient: LocalGeneratedPrismaClientConstructor;
    };
    return generated.PrismaClient;
  } catch {
    throw new Error(LOCAL_PROVIDER_UNAVAILABLE);
  }
}

function databaseOptions(client: LocalDatabaseClient): Readonly<Record<string, unknown>> {
  return Object.freeze(
    Object.fromEntries(DATABASE_OPTION_KEYS.map((option) => [option, client] as const)),
  );
}

/** Plan 408 / IAM-022/IAM-023: production-shaped Compose root using durable dependencies only. */
async function createComposeDatabaseComposition(
  environment: RuntimeEnvironment = process.env,
  dependencies: LocalDatabaseCompositionDependencies = {},
  profile: typeof LOCAL_RUNTIME_PROFILE | typeof PILOT_RUNTIME_PROFILE = LOCAL_RUNTIME_PROFILE,
): Promise<LocalDatabaseComposition> {
  if (
    environment['DATABREEZE_RUNTIME_PROFILE'] !== profile ||
    environment['NODE_ENV'] !== 'production'
  ) {
    throw new Error(LOCAL_RUNTIME_PROFILE_ERROR);
  }
  const connectionString = localDatabaseUrl(environment);
  const redisUrl = localRedisUrl(environment);
  const httpsOrigin = localBrowserOrigin(environment, profile);
  const emailProvider = localEmailProvider(environment);
  const smtpOptions = emailProvider === 'mailpit' ? localSmtpOptions(environment) : undefined;
  const gmailSmtpOptions =
    emailProvider === 'gmail' ? localGmailSmtpOptions(environment) : undefined;
  const fromAddress = localFromAddress(environment);
  if (
    emailProvider === 'gmail' &&
    gmailSmtpOptions &&
    fromAddress.toLowerCase() !== gmailSmtpOptions.username.toLowerCase()
  ) {
    throw new Error(LOCAL_SMTP_CONFIGURATION_ERROR);
  }
  const minio = localMinioOptions(environment);
  const emailDigestKey = localManagedKey(
    environment,
    'DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY',
  );
  const emailEnvelopeKey = localManagedKey(
    environment,
    'DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY',
  );
  const registrationAdmissionKey = localManagedKey(
    environment,
    'DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY',
  );
  const recoveryDigestKey = localManagedKey(environment, 'DATABREEZE_IAM_RECOVERY_DIGEST_KEY');
  localManagedKey(environment, 'DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY');
  const serviceAccountKey = environment['DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY']?.trim();
  if (!serviceAccountKey) throw new Error(LOCAL_IAM_KEY_ERROR);

  let redisClient: LocalRedisClient | undefined;
  let client: LocalDatabaseClient | undefined;
  let disconnectPromise: Promise<void> | undefined;
  const disconnect = (): Promise<void> => {
    if (!client && !redisClient) return Promise.resolve();
    const database = client;
    const redis = redisClient;
    disconnectPromise ??= Promise.resolve().then(async () => {
      try {
        await database?.$disconnect();
      } finally {
        await redis?.disconnect();
      }
    });
    return disconnectPromise;
  };

  try {
    redisClient = dependencies.createRedisClient
      ? dependencies.createRedisClient(redisUrl)
      : (createRedisClient({ url: redisUrl }) as unknown as LocalRedisClient);
    await redisClient.connect();
    const constructedClient = dependencies.createClient
      ? await dependencies.createClient(connectionString)
      : new (await loadGeneratedPrismaClient())({
          adapter: new PrismaPg({ connectionString }),
        });
    client = constructedClient;
    await constructedClient.$connect();

    const redisCounter = new RedisEvalRecoveryAdmissionCounterAdapter(
      new NodeRedisEvalClientAdapter(redisClient),
    );
    const smtpSender = (() => {
      if (emailProvider === 'gmail') {
        if (!gmailSmtpOptions) throw new Error(LOCAL_SMTP_CONFIGURATION_ERROR);
        return dependencies.createGmailSmtpSender
          ? dependencies.createGmailSmtpSender(gmailSmtpOptions)
          : new GmailSmtpSenderAdapter(gmailSmtpOptions);
      }
      if (!smtpOptions) throw new Error(LOCAL_SMTP_CONFIGURATION_ERROR);
      return dependencies.createSmtpSender
        ? dependencies.createSmtpSender(smtpOptions)
        : new NodeLoopbackSmtpSenderAdapter(smtpOptions);
    })();
    const options = Object.freeze({
      runtimeMode: 'production' as const,
      allowInMemoryAdapters: false,
      notificationOutboxWorker: Object.freeze({ workerId: 'dda-notification-outbox-worker' }),
      requestContext: Object.freeze({
        csrf: Object.freeze({ allowedOrigins: Object.freeze([httpsOrigin]) }),
      }),
      readinessPort: new DatabaseReadinessAdapter(() => constructedClient.$queryRaw`SELECT 1`),
      passwordCredentials: new PasswordCredentialService(new Argon2PasswordHasherAdapter()),
      registrationIpAdmission: new RedisRecoveryAdmissionAdapter(redisCounter, {
        keyPrefix: 'databreeze:iam:registration:ip:v1:',
        maxAttempts: 5,
        windowSeconds: 15 * 60,
      }),
      registrationEmailAdmission: new RedisRecoveryAdmissionAdapter(redisCounter, {
        keyPrefix: 'databreeze:iam:registration:email:v1:',
        maxAttempts: 5,
        windowSeconds: 15 * 60,
      }),
      registrationAdmissionDigest: new HmacSha256IamRegistrationAdmissionDigestAdapter(
        registrationAdmissionKey,
      ),
      emailVerificationDigest: new HmacSha256EmailVerificationDigestAdapter(emailDigestKey),
      emailVerificationEnvelope: new Aes256GcmEmailVerificationEnvelopeAdapter(emailEnvelopeKey),
      recoveryDigest: new HmacSha256IamRecoveryDigestAdapter(recoveryDigestKey),
      emailVerificationDelivery:
        emailProvider === 'gmail'
          ? new GmailSmtpEmailVerificationDeliveryAdapter(smtpSender, fromAddress)
          : new MailpitSmtpEmailVerificationDeliveryAdapter(smtpSender, fromAddress),
      recoveryDelivery: new SmtpPasswordRecoveryDeliveryAdapter(
        smtpSender,
        fromAddress,
        httpsOrigin,
        profile === LOCAL_RUNTIME_PROFILE && environment['DATABREEZE_LOCAL_HMR_HTTP'] === 'true',
      ),
      identityBootstrapPolicyProvisionerFactory: (transaction: unknown) =>
        new PrismaInitialWorkspacePolicyProvisionerAdapter(
          transaction as InitialWorkspacePolicyDatabaseClientV1,
        ),
      mfaFactorProofVerifier: new UnavailableMfaFactorProofVerifier(),
      // Local Android integration tests use the same cryptographic proof verifier as
      // production. Provider credentials are still local-only; enrollment must never
      // fall back to an invented device identity.
      deviceEnrollmentProofVerifier: new Ed25519DeviceEnrollmentProofVerifierAdapter(),
      serviceAccountSecretEnvelopeKey: serviceAccountKey,
      ...(minio === undefined
        ? {}
        : {
            localWebIntakeDatabase: constructedClient as unknown as LocalWebIntakeDatabaseV1,
            localWebIntakeObjectStore: new LocalMinioWebIntakeObjectStoreAdapter({
              client: new S3Client({
                endpoint: minio.endpoint,
                forcePathStyle: true,
                region: 'us-east-1',
                credentials: {
                  accessKeyId: minio.accessKeyId,
                  secretAccessKey: minio.secretAccessKey,
                },
              }),
              bucket: minio.bucket,
            }),
          }),
      ...databaseOptions(constructedClient),
    }) as unknown as ApiApplicationOptions;
    return Object.freeze({ client: constructedClient, options, disconnect });
  } catch (error) {
    try {
      await disconnect();
    } catch {
      // Preserve the stable local-provider error if cleanup also fails.
    }
    if (
      error instanceof Error &&
      [
        LOCAL_RUNTIME_PROFILE_ERROR,
        LOCAL_DATABASE_URL_ERROR,
        LOCAL_REDIS_URL_ERROR,
        LOCAL_SMTP_CONFIGURATION_ERROR,
        LOCAL_HTTPS_ORIGIN_ERROR,
        LOCAL_IAM_KEY_ERROR,
        LOCAL_MINIO_CONFIGURATION_ERROR,
      ].includes(error.message)
    ) {
      throw error;
    }
    throw new Error(LOCAL_PROVIDER_UNAVAILABLE);
  }
}

/** Plan 408 / IAM-022/IAM-023: loopback-only durable local root. */
export function createLocalDatabaseComposition(
  environment: RuntimeEnvironment = process.env,
  dependencies: LocalDatabaseCompositionDependencies = {},
): Promise<LocalDatabaseComposition> {
  return createComposeDatabaseComposition(environment, dependencies, LOCAL_RUNTIME_PROFILE);
}

/** Plan 409: durable single-host pilot root with one explicit public HTTPS origin. */
export function createPilotDatabaseComposition(
  environment: RuntimeEnvironment = process.env,
  dependencies: LocalDatabaseCompositionDependencies = {},
): Promise<LocalDatabaseComposition> {
  return createComposeDatabaseComposition(environment, dependencies, PILOT_RUNTIME_PROFILE);
}
