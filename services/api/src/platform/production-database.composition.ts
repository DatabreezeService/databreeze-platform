import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { PrismaPg } from '@prisma/adapter-pg';
import { SESv2Client } from '@aws-sdk/client-sesv2';
import { createClient as createRedisClient } from 'redis';

import type { ApiApplicationOptions } from '../bootstrap.js';
import { Argon2PasswordHasherAdapter } from '../features/iam/adapter/argon2-password-hasher.adapter.js';
import { PasswordCredentialService } from '../features/iam/application/password-credential.service.js';
import { Ed25519DeviceEnrollmentProofVerifierAdapter } from '../features/iam/adapter/ed25519-device-enrollment-proof-verifier.adapter.js';
import { UnavailableMfaFactorProofVerifier } from '../features/iam/application/mfa.service.js';
import { HmacSha256EmailVerificationDigestAdapter } from '../features/iam/adapter/in-memory-email-verification-repository.adapter.js';
import { Aes256GcmEmailVerificationEnvelopeAdapter } from '../features/iam/adapter/email-verification-envelope.adapter.js';
import { HmacSha256IamRegistrationAdmissionDigestAdapter } from '../features/iam/adapter/iam-registration-crypto.adapter.js';
import { HmacSha256IamRecoveryDigestAdapter } from '../features/iam/adapter/iam-recovery-crypto.adapter.js';
import {
  RedisEvalRecoveryAdmissionCounterAdapter,
  RedisRecoveryAdmissionAdapter,
} from '../features/iam/adapter/redis-recovery-admission.adapter.js';
import {
  NodeRedisEvalClientAdapter,
  type NodeRedisEvalPortV1,
} from '../features/iam/adapter/node-redis-admission-counter.adapter.js';
import { AwsSesEmailVerificationDeliveryAdapter } from '../features/iam/adapter/aws-ses-email-verification-delivery.adapter.js';
import { AwsSesPasswordRecoveryDeliveryAdapter } from '../features/iam/adapter/aws-ses-password-recovery-delivery.adapter.js';
import {
  AwsSesV2SenderAdapter,
  type AwsSesV2SendClientPortV1,
} from '../features/iam/adapter/aws-ses-v2-sender.adapter.js';
import { DatabaseReadinessAdapter } from '../features/system/adapter/database-readiness.adapter.js';
import { createS3ArtifactUploadStorageAdapterV1 } from '../features/iae/adapter/s3-artifact-upload-storage.adapter.js';
import { createS3WorkerObjectByteStoreAdapterV1 } from '../features/iae/adapter/s3-worker-object-byte-store.adapter.js';
import type { SourceCatalogDatabaseClientV1 } from '../features/dda/source-catalog/adapter/prisma-source-catalog-repository.adapter.js';
import {
  createLocalDatabaseComposition,
  createPilotDatabaseComposition,
  LOCAL_RUNTIME_PROFILE,
  PILOT_RUNTIME_PROFILE,
  type LocalDatabaseComposition,
  type LocalDatabaseCompositionDependencies,
} from './local-database.composition.js';

export const PRODUCTION_DATABASE_URL_ERROR = 'PRODUCTION_DATABASE_URL_INVALID';
export const PRODUCTION_CSRF_ORIGINS_ERROR = 'PRODUCTION_CSRF_ALLOWED_ORIGINS_INVALID';
export const PRODUCTION_DATABASE_CLIENT_ERROR = 'PRODUCTION_DATABASE_CLIENT_UNAVAILABLE';
export const PRODUCTION_OPENAI_CONFIGURATION_ERROR = 'PRODUCTION_OPENAI_CONFIGURATION_INVALID';
export const PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR = 'PRODUCTION_SERVICE_ACCOUNT_SECRET_INVALID';
export const PRODUCTION_IAM_EMAIL_VERIFICATION_SECRET_ERROR =
  'PRODUCTION_IAM_EMAIL_VERIFICATION_SECRET_INVALID';
export const PRODUCTION_IAM_REGISTRATION_ADMISSION_SECRET_ERROR =
  'PRODUCTION_IAM_REGISTRATION_ADMISSION_SECRET_INVALID';
export const PRODUCTION_IAM_RECOVERY_SECRET_ERROR = 'PRODUCTION_IAM_RECOVERY_SECRET_INVALID';
export const PRODUCTION_IAM_REDIS_URL_ERROR = 'PRODUCTION_IAM_REDIS_URL_INVALID';
export const PRODUCTION_IAM_EMAIL_DELIVERY_CONFIGURATION_ERROR =
  'PRODUCTION_IAM_EMAIL_DELIVERY_CONFIGURATION_INVALID';
export const PRODUCTION_IAM_PROVIDER_UNAVAILABLE = 'PRODUCTION_IAM_PROVIDER_UNAVAILABLE';
export const PRODUCTION_IAE_ARTIFACT_STORAGE_CONFIGURATION_ERROR =
  'PRODUCTION_IAE_ARTIFACT_STORAGE_CONFIGURATION_INVALID';
export const PRODUCTION_IAE_WORKER_CAPABILITY_SIGNING_SECRET_ERROR =
  'PRODUCTION_IAE_WORKER_CAPABILITY_SIGNING_SECRET_INVALID';
export const PRODUCTION_SHUTDOWN_DEADLINE_ERROR = 'PRODUCTION_SHUTDOWN_DEADLINE_EXCEEDED';
export const PRODUCTION_SHUTDOWN_DEADLINE_CONFIG_ERROR = 'PRODUCTION_SHUTDOWN_DEADLINE_INVALID';
const MAX_PRODUCTION_CSRF_ORIGINS = 16;
const MAX_PRODUCTION_CSRF_ORIGINS_LIST_LENGTH = 4_096;
const DEFAULT_PRODUCTION_SHUTDOWN_DEADLINE_MS = 25_000;
const MIN_PRODUCTION_SHUTDOWN_DEADLINE_MS = 1;
const MAX_PRODUCTION_SHUTDOWN_DEADLINE_MS = 29_000;
const OPENAI_MODEL_PATTERN = /^[a-z0-9][a-z0-9._:-]{0,127}$/iu;
const OPENAI_SECRET_PATTERN = /^sk-[a-z0-9_-]{8,}$/iu;
const OPENAI_MIN_TIMEOUT_MS = 1_000;
const OPENAI_MAX_TIMEOUT_MS = 60_000;
const OPENAI_MIN_OUTPUT_TOKENS = 128;
const OPENAI_MAX_OUTPUT_TOKENS = 4_096;
const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini-2024-07-18';
const OPENAI_DEFAULT_IMAGE_DETAIL = 'high';
const PRODUCTION_SERVICE_ACCOUNT_SECRET_ENV = 'DATABREEZE_SERVICE_ACCOUNT_SECRET_ENVELOPE_KEY';
const PRODUCTION_SERVICE_ACCOUNT_SECRET_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const PRODUCTION_IAM_EMAIL_DIGEST_KEY_ENV = 'DATABREEZE_IAM_EMAIL_VERIFICATION_DIGEST_KEY';
const PRODUCTION_IAM_EMAIL_ENVELOPE_KEY_ENV = 'DATABREEZE_IAM_EMAIL_VERIFICATION_ENVELOPE_KEY';
const PRODUCTION_IAM_REGISTRATION_ADMISSION_KEY_ENV = 'DATABREEZE_IAM_REGISTRATION_ADMISSION_KEY';
const PRODUCTION_IAM_RECOVERY_DIGEST_KEY_ENV = 'DATABREEZE_IAM_RECOVERY_DIGEST_KEY';
const PRODUCTION_IAM_REDIS_URL_ENV = 'DATABREEZE_REDIS_URL';
const PRODUCTION_IAM_EMAIL_FROM_ADDRESS_ENV = 'DATABREEZE_IAM_EMAIL_FROM_ADDRESS';
const PRODUCTION_IAM_EMAIL_SES_REGION_ENV = 'DATABREEZE_IAM_EMAIL_SES_REGION';
const PRODUCTION_IAM_EMAIL_ADDRESS_PATTERN =
  /^[^\s@]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9.-]{0,251}[A-Za-z0-9])?$/u;
const PRODUCTION_AWS_REGION_PATTERN = /^[a-z]{2}(?:-gov)?-[a-z]+-\d$/u;
const PRODUCTION_IAE_ARTIFACT_BUCKET_ENV = 'DATABREEZE_IAE_ARTIFACT_BUCKET';
const PRODUCTION_IAE_ARTIFACT_REGION_ENV = 'DATABREEZE_IAE_ARTIFACT_REGION';
const PRODUCTION_IAE_ARTIFACT_KMS_KEY_ENV = 'DATABREEZE_IAE_ARTIFACT_KMS_KEY_ARN';
const PRODUCTION_IAE_WORKER_CAPABILITY_SIGNING_KEY_ENV =
  'DATABREEZE_IAE_WORKER_CAPABILITY_SIGNING_KEY';

type DatabaseOptionKey =
  | 'credentialDatabase'
  | 'sessionDatabase'
  | 'identityBootstrapDatabase'
  | 'profileMutationDatabase'
  | 'mfaDatabase'
  | 'iamDatabase'
  | 'hierarchyDatabase'
  | 'agentGrantDatabase'
  | 'invitationDatabase'
  | 'invitationPrincipalEmailDatabase'
  | 'registrationDatabase'
  | 'recoveryDatabase'
  | 'deviceIdentityDatabase'
  | 'serviceAccountDatabase'
  | 'artifactIntakeDatabase'
  | 'artifactDatabase'
  | 'artifactLineageDatabase'
  | 'artifactRetentionDatabase'
  | 'artifactExportDatabase'
  | 'artifactUploadDatabase'
  | 'workerCapabilityDatabase'
  | 'workerResultFinalizationDatabase'
  | 'protectedDocumentUnlockDatabase'
  | 'evidenceGrantDatabase'
  | 'governedDatasetDatabase'
  | 'mappingDatabase'
  | 'ruleSetDatabase'
  | 'referenceEntityDatabase'
  | 'datasetVersionDatabase'
  | 'datasetQualityDatabase'
  | 'datasetProfileDatabase'
  | 'datasetExportDatabase'
  | 'deviceSyncDatabase'
  | 'deviceAuthorizationDatabase'
  | 'deviceCapabilityDatabase'
  | 'dataModePolicyDatabase'
  | 'executionRouteDatabase'
  | 'auditDatabase'
  | 'auditAttestationDatabase'
  | 'entitlementDatabase'
  | 'paymentDatabase'
  | 'resultUsageSettlementBindingDatabase'
  | 'entitlementLeaseDatabase'
  | 'spreadsheetAuditDatabase'
  | 'approvalDatabase'
  | 'jobHistoryDatabase'
  | 'reportDatabase'
  | 'mobileDatabase'
  | 'jraWorkerDatabase'
  | 'ddaDatabase'
  | 'landingFeedbackDatabase';

export type ProductionDatabaseOptions = {
  readonly [TKey in DatabaseOptionKey]: NonNullable<ApiApplicationOptions[TKey]>;
} & Pick<
  ApiApplicationOptions,
  'runtimeMode' | 'allowInMemoryAdapters' | 'notificationOutboxWorker'
> & {
    readonly requestContext: NonNullable<ApiApplicationOptions['requestContext']>;
    readonly readinessPort: NonNullable<ApiApplicationOptions['readinessPort']>;
    readonly passwordCredentials: NonNullable<ApiApplicationOptions['passwordCredentials']>;
    readonly registrationIpAdmission: NonNullable<ApiApplicationOptions['registrationIpAdmission']>;
    readonly registrationEmailAdmission: NonNullable<
      ApiApplicationOptions['registrationEmailAdmission']
    >;
    readonly registrationAdmissionDigest: NonNullable<
      ApiApplicationOptions['registrationAdmissionDigest']
    >;
    readonly recoveryDigest: NonNullable<ApiApplicationOptions['recoveryDigest']>;
    readonly emailVerificationDigest: NonNullable<ApiApplicationOptions['emailVerificationDigest']>;
    readonly emailVerificationEnvelope: NonNullable<
      ApiApplicationOptions['emailVerificationEnvelope']
    >;
    readonly emailVerificationDelivery: NonNullable<
      ApiApplicationOptions['emailVerificationDelivery']
    >;
    readonly recoveryDelivery: NonNullable<ApiApplicationOptions['recoveryDelivery']>;
    readonly landingFeedbackIpAdmission: NonNullable<
      ApiApplicationOptions['landingFeedbackIpAdmission']
    >;
    readonly landingFeedbackAdmissionDigest: NonNullable<
      ApiApplicationOptions['landingFeedbackAdmissionDigest']
    >;
    readonly mfaFactorProofVerifier: NonNullable<ApiApplicationOptions['mfaFactorProofVerifier']>;
    readonly deviceEnrollmentProofVerifier: NonNullable<
      ApiApplicationOptions['deviceEnrollmentProofVerifier']
    >;
    readonly serviceAccountSecretEnvelopeKey: NonNullable<
      ApiApplicationOptions['serviceAccountSecretEnvelopeKey']
    >;
    readonly artifactUploadStorage: NonNullable<ApiApplicationOptions['artifactUploadStorage']>;
    readonly workerObjectByteStore: NonNullable<ApiApplicationOptions['workerObjectByteStore']>;
    readonly workerCapabilitySigningSecret?: NonNullable<
      ApiApplicationOptions['workerCapabilitySigningSecret']
    >;
  };

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface ProductionDatabaseClient extends SourceCatalogDatabaseClientV1 {
  readonly $connect: () => Promise<void>;
  readonly $disconnect: () => Promise<void>;
  readonly $queryRaw: (query: TemplateStringsArray) => Promise<unknown>;
  readonly userIdentity: { readonly findUnique: (...argumentsList: never[]) => unknown };
  readonly dashboardRecord: { readonly findMany: (...argumentsList: never[]) => unknown };
}

type GeneratedPrismaClient = ProductionDatabaseClient;

interface GeneratedPrismaClientConstructor {
  new (options: { readonly adapter: unknown }): GeneratedPrismaClient;
}

export interface ProductionDatabaseComposition {
  readonly client: GeneratedPrismaClient;
  readonly options: ProductionDatabaseOptions;
  readonly disconnect: () => Promise<void>;
}

export interface ProductionDatabaseCompositionDependencies {
  readonly createClient?: (
    connectionString: string,
  ) => ProductionDatabaseClient | Promise<ProductionDatabaseClient>;
  readonly createRedisClient?: (url: string) => ProductionRedisClient;
  readonly createSesClient?: (region: string) => AwsSesV2SendClientPortV1;
}

export interface ProductionRedisClient extends NodeRedisEvalPortV1 {
  readonly connect: () => Promise<unknown>;
  readonly disconnect: () => Promise<unknown>;
}

type ProductionSignal = 'SIGINT' | 'SIGTERM';

type SignalProcess = {
  readonly on: (signal: ProductionSignal, handler: () => void) => unknown;
  readonly removeListener: (signal: ProductionSignal, handler: () => void) => unknown;
};

type ProductionShutdownRegistrationOptions = {
  readonly process?: SignalProcess;
  readonly forceTerminate?: (signal: ProductionSignal) => void;
  readonly deadlineMs?: number;
};

function databaseUrl(environment: RuntimeEnvironment): string {
  const candidate = environment['DATABASE_URL']?.trim();
  if (!candidate) throw new Error(PRODUCTION_DATABASE_URL_ERROR);

  try {
    const parsed = new URL(candidate);
    const supportedProtocol = parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
    const hasDatabaseName = parsed.pathname.length > 1 && parsed.pathname !== '/';
    if (
      !supportedProtocol ||
      parsed.username.length === 0 ||
      parsed.password.length === 0 ||
      parsed.hostname.length === 0 ||
      !hasDatabaseName ||
      parsed.hash.length > 0
    ) {
      throw new Error(PRODUCTION_DATABASE_URL_ERROR);
    }
    return candidate;
  } catch {
    throw new Error(PRODUCTION_DATABASE_URL_ERROR);
  }
}

function productionRequestContext(
  environment: RuntimeEnvironment,
): NonNullable<ApiApplicationOptions['requestContext']> {
  const configuredOrigins = environment['DATABREEZE_CSRF_ALLOWED_ORIGINS'];
  if (
    configuredOrigins === undefined ||
    configuredOrigins.trim().length === 0 ||
    configuredOrigins.length > MAX_PRODUCTION_CSRF_ORIGINS_LIST_LENGTH
  ) {
    throw new Error(PRODUCTION_CSRF_ORIGINS_ERROR);
  }

  const values = configuredOrigins.split(',');
  if (values.length > MAX_PRODUCTION_CSRF_ORIGINS) {
    throw new Error(PRODUCTION_CSRF_ORIGINS_ERROR);
  }

  const origins = new Set<string>();
  for (const value of values) {
    const candidate = value.trim();
    if (candidate.length === 0 || candidate.includes('*')) {
      throw new Error(PRODUCTION_CSRF_ORIGINS_ERROR);
    }

    try {
      const parsed = new URL(candidate);
      if (
        parsed.protocol !== 'https:' ||
        candidate.includes('@') ||
        candidate.includes('?') ||
        candidate.includes('#') ||
        candidate.endsWith('/') ||
        parsed.username !== '' ||
        parsed.password !== '' ||
        parsed.pathname !== '/' ||
        parsed.search !== '' ||
        parsed.hash !== '' ||
        parsed.hostname.includes('*') ||
        parsed.origin === 'null'
      ) {
        throw new Error(PRODUCTION_CSRF_ORIGINS_ERROR);
      }
      origins.add(parsed.origin);
    } catch {
      throw new Error(PRODUCTION_CSRF_ORIGINS_ERROR);
    }
  }

  if (origins.size === 0) throw new Error(PRODUCTION_CSRF_ORIGINS_ERROR);

  return Object.freeze({
    csrf: Object.freeze({ allowedOrigins: Object.freeze([...origins]) }),
  });
}

function productionServiceAccountSecretEnvelopeKey(environment: RuntimeEnvironment): string {
  const candidate = environment[PRODUCTION_SERVICE_ACCOUNT_SECRET_ENV]?.trim();
  if (!candidate || !PRODUCTION_SERVICE_ACCOUNT_SECRET_KEY_PATTERN.test(candidate)) {
    throw new Error(PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR);
  }

  try {
    const decoded = Buffer.from(candidate, 'base64url');
    if (decoded.length !== 32 || decoded.toString('base64url') !== candidate) {
      throw new Error(PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR);
    }
  } catch {
    throw new Error(PRODUCTION_SERVICE_ACCOUNT_SECRET_ERROR);
  }
  return candidate;
}

function productionManaged32ByteKey(
  environment: RuntimeEnvironment,
  name: string,
  stableError: string,
): Uint8Array {
  const candidate = environment[name]?.trim();
  if (!candidate || !PRODUCTION_SERVICE_ACCOUNT_SECRET_KEY_PATTERN.test(candidate)) {
    throw new Error(stableError);
  }
  try {
    const decoded = Buffer.from(candidate, 'base64url');
    if (decoded.byteLength !== 32 || decoded.toString('base64url') !== candidate) {
      throw new Error(stableError);
    }
    return decoded;
  } catch {
    throw new Error(stableError);
  }
}

function productionOptionalManaged32ByteKey(
  environment: RuntimeEnvironment,
  name: string,
  stableError: string,
): Uint8Array | undefined {
  if (environment[name]?.trim() === undefined || environment[name]?.trim() === '') return undefined;
  return productionManaged32ByteKey(environment, name, stableError);
}

function productionIamRedisUrl(environment: RuntimeEnvironment): string {
  const candidate = environment[PRODUCTION_IAM_REDIS_URL_ENV]?.trim();
  if (!candidate || candidate.length > 2_048) throw new Error(PRODUCTION_IAM_REDIS_URL_ERROR);
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== 'rediss:' ||
      parsed.hostname.length === 0 ||
      parsed.port !== '6379' ||
      parsed.username !== '' ||
      parsed.password !== '' ||
      (parsed.pathname !== '' && parsed.pathname !== '/') ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      throw new Error(PRODUCTION_IAM_REDIS_URL_ERROR);
    }
    return candidate;
  } catch {
    throw new Error(PRODUCTION_IAM_REDIS_URL_ERROR);
  }
}

function productionIamEmailDeliveryConfiguration(environment: RuntimeEnvironment): {
  readonly fromAddress: string;
  readonly region: string;
} {
  const fromAddress = environment[PRODUCTION_IAM_EMAIL_FROM_ADDRESS_ENV]?.trim();
  const region = environment[PRODUCTION_IAM_EMAIL_SES_REGION_ENV]?.trim();
  if (
    !fromAddress ||
    fromAddress.length > 320 ||
    ![...fromAddress].every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 32 && codePoint !== 127;
    }) ||
    !PRODUCTION_IAM_EMAIL_ADDRESS_PATTERN.test(fromAddress) ||
    !region ||
    !PRODUCTION_AWS_REGION_PATTERN.test(region)
  ) {
    throw new Error(PRODUCTION_IAM_EMAIL_DELIVERY_CONFIGURATION_ERROR);
  }
  return Object.freeze({ fromAddress, region });
}

export function productionIaeArtifactStorageConfiguration(environment: RuntimeEnvironment): {
  readonly bucket: string;
  readonly region: string;
  readonly kmsKeyId: string;
  readonly keyPrefix: string;
} {
  const bucket = environment[PRODUCTION_IAE_ARTIFACT_BUCKET_ENV]?.trim();
  const region = environment[PRODUCTION_IAE_ARTIFACT_REGION_ENV]?.trim();
  const kmsKeyId = environment[PRODUCTION_IAE_ARTIFACT_KMS_KEY_ENV]?.trim();
  if (
    !bucket ||
    !/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/u.test(bucket) ||
    bucket.includes('..') ||
    !region ||
    !PRODUCTION_AWS_REGION_PATTERN.test(region) ||
    !kmsKeyId ||
    !new RegExp(`^arn:[^:]+:kms:${region}:[0-9]{12}:key/[A-Za-z0-9-]{1,128}$`, 'u').test(kmsKeyId)
  ) {
    throw new Error(PRODUCTION_IAE_ARTIFACT_STORAGE_CONFIGURATION_ERROR);
  }
  return Object.freeze({ bucket, region, kmsKeyId, keyPrefix: 'iae-v1' });
}

function openAiFlag(environment: RuntimeEnvironment, name: string): boolean {
  const configured = environment[name];
  if (configured === undefined || configured === 'false') return false;
  if (configured === 'true') return true;
  throw new Error(PRODUCTION_OPENAI_CONFIGURATION_ERROR);
}

function openAiModel(environment: RuntimeEnvironment, name: string): string {
  const configured = environment[name];
  const model = configured === undefined ? OPENAI_DEFAULT_MODEL : configured.trim();
  if (!OPENAI_MODEL_PATTERN.test(model)) {
    throw new Error(PRODUCTION_OPENAI_CONFIGURATION_ERROR);
  }
  return model;
}

function boundedOpenAiInteger(
  environment: RuntimeEnvironment,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const configured = environment[name];
  if (configured === undefined) return fallback;
  const normalized = configured.trim();
  if (!/^\d+$/u.test(normalized)) {
    throw new Error(PRODUCTION_OPENAI_CONFIGURATION_ERROR);
  }
  const value = Number(normalized);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(PRODUCTION_OPENAI_CONFIGURATION_ERROR);
  }
  return value;
}

function productionOpenAiConfiguration(environment: RuntimeEnvironment): void {
  const agentEnabled = openAiFlag(environment, 'DATABREEZE_OPENAI_AGENT_ENABLED');
  const receiptEnabled = openAiFlag(environment, 'DATABREEZE_OPENAI_RECEIPT_ENABLED');
  const dashboardEnabled = openAiFlag(environment, 'DATABREEZE_OPENAI_DASHBOARD_ENABLED');
  const apiKey = environment['OPENAI_API_KEY']?.trim();

  if (
    (agentEnabled || receiptEnabled || dashboardEnabled) &&
    (apiKey === undefined || !OPENAI_SECRET_PATTERN.test(apiKey))
  ) {
    throw new Error(PRODUCTION_OPENAI_CONFIGURATION_ERROR);
  }

  openAiModel(environment, 'DATABREEZE_OPENAI_AGENT_MODEL');
  boundedOpenAiInteger(
    environment,
    'DATABREEZE_OPENAI_AGENT_TIMEOUT_MS',
    30_000,
    OPENAI_MIN_TIMEOUT_MS,
    OPENAI_MAX_TIMEOUT_MS,
  );
  boundedOpenAiInteger(
    environment,
    'DATABREEZE_OPENAI_AGENT_MAX_OUTPUT_TOKENS',
    2_048,
    OPENAI_MIN_OUTPUT_TOKENS,
    OPENAI_MAX_OUTPUT_TOKENS,
  );
  openAiModel(environment, 'DATABREEZE_OPENAI_RECEIPT_MODEL');
  openAiModel(environment, 'DATABREEZE_OPENAI_DASHBOARD_MODEL');
  const imageDetail = environment['DATABREEZE_OPENAI_IMAGE_DETAIL'] ?? OPENAI_DEFAULT_IMAGE_DETAIL;
  if (imageDetail !== 'low' && imageDetail !== 'high' && imageDetail !== 'original') {
    throw new Error(PRODUCTION_OPENAI_CONFIGURATION_ERROR);
  }
  boundedOpenAiInteger(
    environment,
    'DATABREEZE_OPENAI_TIMEOUT_MS',
    30_000,
    OPENAI_MIN_TIMEOUT_MS,
    OPENAI_MAX_TIMEOUT_MS,
  );
  boundedOpenAiInteger(
    environment,
    'DATABREEZE_OPENAI_MAX_OUTPUT_TOKENS',
    2_048,
    OPENAI_MIN_OUTPUT_TOKENS,
    OPENAI_MAX_OUTPUT_TOKENS,
  );
}

function ensureProductionOpenAiDefaults(environment: RuntimeEnvironment): void {
  if (environment !== process.env) return;
  process.env['DATABREEZE_OPENAI_AGENT_ENABLED'] ??= 'false';
  process.env['DATABREEZE_OPENAI_RECEIPT_ENABLED'] ??= 'false';
  process.env['DATABREEZE_OPENAI_DASHBOARD_ENABLED'] ??= 'false';
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

  throw new Error(PRODUCTION_DATABASE_CLIENT_ERROR);
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

async function loadGeneratedPrismaClient(): Promise<GeneratedPrismaClientConstructor> {
  const clientPath = generatedClientPath();
  try {
    if (clientPath.endsWith('.ts')) registerGeneratedClientTypescriptResolver(clientPath);
    const generated = (await import(pathToFileURL(clientPath).href)) as {
      readonly PrismaClient: GeneratedPrismaClientConstructor;
    };
    return generated.PrismaClient;
  } catch {
    throw new Error(PRODUCTION_DATABASE_CLIENT_ERROR);
  }
}

export function productionShutdownDeadlineMs(
  environment: RuntimeEnvironment = process.env,
): number {
  const configured = environment['DATABREEZE_PRODUCTION_SHUTDOWN_DEADLINE_MS'];
  if (configured === undefined || configured.trim() === '') {
    return DEFAULT_PRODUCTION_SHUTDOWN_DEADLINE_MS;
  }

  const normalized = configured.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(PRODUCTION_SHUTDOWN_DEADLINE_CONFIG_ERROR);
  }

  const deadlineMs = Number(normalized);
  if (!validProductionShutdownDeadline(deadlineMs)) {
    throw new Error(PRODUCTION_SHUTDOWN_DEADLINE_CONFIG_ERROR);
  }
  return deadlineMs;
}

function validProductionShutdownDeadline(deadlineMs: number): boolean {
  return (
    Number.isSafeInteger(deadlineMs) &&
    deadlineMs >= MIN_PRODUCTION_SHUTDOWN_DEADLINE_MS &&
    deadlineMs <= MAX_PRODUCTION_SHUTDOWN_DEADLINE_MS
  );
}

/**
 * The generated `Prisma.UserIdentityDelegate` and `Prisma.DashboardRecordDelegate` expose
 * model-specific `UserIdentityFindUniqueArgs`/`DashboardRecordFindFirstArgs` and generated
 * payloads, while the existing `CredentialLookupDatabaseClientV1` and
 * `DdaDashboardDatabaseClientV1` ports require `Readonly<Record<string, unknown>>`, domain
 * row/input contracts, and callbacks typed to the narrow port. Those method surfaces are not
 * structurally assignable in TypeScript even though each adapter consumes the corresponding
 * generated delegate at runtime. This is the single audited boundary where the shared client is
 * narrowed to the existing module ports; tenant checks remain in the feature adapters and no
 * cross-feature delegate is invoked here.
 */
function asDatabasePort<TKey extends DatabaseOptionKey>(
  client: GeneratedPrismaClient,
): ProductionDatabaseOptions[TKey] {
  return client as unknown as ProductionDatabaseOptions[TKey];
}

function optionsFor(
  client: GeneratedPrismaClient,
  requestContext: NonNullable<ApiApplicationOptions['requestContext']>,
  serviceAccountSecretEnvelopeKey: string,
  workerCapabilitySigningSecret: string | undefined,
  artifactUploadStorage: NonNullable<ApiApplicationOptions['artifactUploadStorage']>,
  workerObjectByteStore: NonNullable<ApiApplicationOptions['workerObjectByteStore']>,
  iamProviders: {
    readonly registrationIpAdmission: NonNullable<ApiApplicationOptions['registrationIpAdmission']>;
    readonly registrationEmailAdmission: NonNullable<
      ApiApplicationOptions['registrationEmailAdmission']
    >;
    readonly registrationAdmissionDigest: NonNullable<
      ApiApplicationOptions['registrationAdmissionDigest']
    >;
    readonly recoveryDigest: NonNullable<ApiApplicationOptions['recoveryDigest']>;
    readonly emailVerificationDigest: NonNullable<ApiApplicationOptions['emailVerificationDigest']>;
    readonly emailVerificationEnvelope: NonNullable<
      ApiApplicationOptions['emailVerificationEnvelope']
    >;
    readonly emailVerificationDelivery: NonNullable<
      ApiApplicationOptions['emailVerificationDelivery']
    >;
    readonly recoveryDelivery: NonNullable<ApiApplicationOptions['recoveryDelivery']>;
    readonly landingFeedbackIpAdmission: NonNullable<
      ApiApplicationOptions['landingFeedbackIpAdmission']
    >;
    readonly landingFeedbackAdmissionDigest: NonNullable<
      ApiApplicationOptions['landingFeedbackAdmissionDigest']
    >;
  },
): ProductionDatabaseOptions {
  return {
    runtimeMode: 'production',
    allowInMemoryAdapters: false,
    notificationOutboxWorker: Object.freeze({
      workerId: 'dda-notification-outbox-worker',
    }),
    requestContext,
    readinessPort: new DatabaseReadinessAdapter(() => client.$queryRaw`SELECT 1`),
    passwordCredentials: new PasswordCredentialService(new Argon2PasswordHasherAdapter()),
    ...iamProviders,
    mfaFactorProofVerifier: new UnavailableMfaFactorProofVerifier(),
    deviceEnrollmentProofVerifier: new Ed25519DeviceEnrollmentProofVerifierAdapter(),
    serviceAccountSecretEnvelopeKey,
    ...(workerCapabilitySigningSecret === undefined ? {} : { workerCapabilitySigningSecret }),
    artifactUploadStorage,
    workerObjectByteStore,
    credentialDatabase: asDatabasePort<'credentialDatabase'>(client),
    sessionDatabase: asDatabasePort<'sessionDatabase'>(client),
    identityBootstrapDatabase: asDatabasePort<'identityBootstrapDatabase'>(client),
    profileMutationDatabase: asDatabasePort<'profileMutationDatabase'>(client),
    mfaDatabase: asDatabasePort<'mfaDatabase'>(client),
    iamDatabase: asDatabasePort<'iamDatabase'>(client),
    hierarchyDatabase: asDatabasePort<'hierarchyDatabase'>(client),
    agentGrantDatabase: asDatabasePort<'agentGrantDatabase'>(client),
    invitationDatabase: asDatabasePort<'invitationDatabase'>(client),
    invitationPrincipalEmailDatabase: asDatabasePort<'invitationPrincipalEmailDatabase'>(client),
    registrationDatabase: asDatabasePort<'registrationDatabase'>(client),
    recoveryDatabase: asDatabasePort<'recoveryDatabase'>(client),
    deviceIdentityDatabase: asDatabasePort<'deviceIdentityDatabase'>(client),
    serviceAccountDatabase: asDatabasePort<'serviceAccountDatabase'>(client),
    artifactIntakeDatabase: asDatabasePort<'artifactIntakeDatabase'>(client),
    artifactDatabase: asDatabasePort<'artifactDatabase'>(client),
    artifactLineageDatabase: asDatabasePort<'artifactLineageDatabase'>(client),
    artifactRetentionDatabase: asDatabasePort<'artifactRetentionDatabase'>(client),
    artifactExportDatabase: asDatabasePort<'artifactExportDatabase'>(client),
    artifactUploadDatabase: asDatabasePort<'artifactUploadDatabase'>(client),
    workerCapabilityDatabase: asDatabasePort<'workerCapabilityDatabase'>(client),
    workerResultFinalizationDatabase: asDatabasePort<'workerResultFinalizationDatabase'>(client),
    protectedDocumentUnlockDatabase: asDatabasePort<'protectedDocumentUnlockDatabase'>(client),
    evidenceGrantDatabase: asDatabasePort<'evidenceGrantDatabase'>(client),
    governedDatasetDatabase: asDatabasePort<'governedDatasetDatabase'>(client),
    mappingDatabase: asDatabasePort<'mappingDatabase'>(client),
    ruleSetDatabase: asDatabasePort<'ruleSetDatabase'>(client),
    referenceEntityDatabase: asDatabasePort<'referenceEntityDatabase'>(client),
    datasetVersionDatabase: asDatabasePort<'datasetVersionDatabase'>(client),
    datasetQualityDatabase: asDatabasePort<'datasetQualityDatabase'>(client),
    datasetProfileDatabase: asDatabasePort<'datasetProfileDatabase'>(client),
    datasetExportDatabase: asDatabasePort<'datasetExportDatabase'>(client),
    deviceSyncDatabase: asDatabasePort<'deviceSyncDatabase'>(client),
    deviceAuthorizationDatabase: asDatabasePort<'deviceAuthorizationDatabase'>(client),
    deviceCapabilityDatabase: asDatabasePort<'deviceCapabilityDatabase'>(client),
    dataModePolicyDatabase: asDatabasePort<'dataModePolicyDatabase'>(client),
    executionRouteDatabase: asDatabasePort<'executionRouteDatabase'>(client),
    auditDatabase: asDatabasePort<'auditDatabase'>(client),
    auditAttestationDatabase: asDatabasePort<'auditAttestationDatabase'>(client),
    entitlementDatabase: asDatabasePort<'entitlementDatabase'>(client),
    paymentDatabase: asDatabasePort<'paymentDatabase'>(client),
    resultUsageSettlementBindingDatabase:
      asDatabasePort<'resultUsageSettlementBindingDatabase'>(client),
    entitlementLeaseDatabase: asDatabasePort<'entitlementLeaseDatabase'>(client),
    spreadsheetAuditDatabase: asDatabasePort<'spreadsheetAuditDatabase'>(client),
    approvalDatabase: asDatabasePort<'approvalDatabase'>(client),
    jobHistoryDatabase: asDatabasePort<'jobHistoryDatabase'>(client),
    reportDatabase: asDatabasePort<'reportDatabase'>(client),
    mobileDatabase: asDatabasePort<'mobileDatabase'>(client),
    jraWorkerDatabase: asDatabasePort<'jraWorkerDatabase'>(client),
    ddaDatabase: asDatabasePort<'ddaDatabase'>(client),
    landingFeedbackDatabase: asDatabasePort<'landingFeedbackDatabase'>(client),
  };
}

export async function createProductionDatabaseComposition(
  environment: RuntimeEnvironment = process.env,
  dependencies: ProductionDatabaseCompositionDependencies = {},
): Promise<ProductionDatabaseComposition> {
  const connectionString = databaseUrl(environment);
  const requestContext = productionRequestContext(environment);
  productionOpenAiConfiguration(environment);
  const serviceAccountSecretEnvelopeKey = productionServiceAccountSecretEnvelopeKey(environment);
  const workerCapabilitySigningKey = productionOptionalManaged32ByteKey(
    environment,
    PRODUCTION_IAE_WORKER_CAPABILITY_SIGNING_KEY_ENV,
    PRODUCTION_IAE_WORKER_CAPABILITY_SIGNING_SECRET_ERROR,
  );
  const workerCapabilitySigningSecret = workerCapabilitySigningKey
    ? Buffer.from(workerCapabilitySigningKey).toString('base64url')
    : undefined;
  const emailVerificationDigestKey = productionManaged32ByteKey(
    environment,
    PRODUCTION_IAM_EMAIL_DIGEST_KEY_ENV,
    PRODUCTION_IAM_EMAIL_VERIFICATION_SECRET_ERROR,
  );
  const emailVerificationEnvelopeKey = productionManaged32ByteKey(
    environment,
    PRODUCTION_IAM_EMAIL_ENVELOPE_KEY_ENV,
    PRODUCTION_IAM_EMAIL_VERIFICATION_SECRET_ERROR,
  );
  const registrationAdmissionKey = productionManaged32ByteKey(
    environment,
    PRODUCTION_IAM_REGISTRATION_ADMISSION_KEY_ENV,
    PRODUCTION_IAM_REGISTRATION_ADMISSION_SECRET_ERROR,
  );
  const recoveryDigestKey = productionManaged32ByteKey(
    environment,
    PRODUCTION_IAM_RECOVERY_DIGEST_KEY_ENV,
    PRODUCTION_IAM_RECOVERY_SECRET_ERROR,
  );
  const redisUrl = productionIamRedisUrl(environment);
  const emailDeliveryConfiguration = productionIamEmailDeliveryConfiguration(environment);
  const artifactStorageConfiguration = productionIaeArtifactStorageConfiguration(environment);
  const artifactUploadStorage = createS3ArtifactUploadStorageAdapterV1(
    artifactStorageConfiguration,
  );
  const workerObjectByteStore = createS3WorkerObjectByteStoreAdapterV1(
    artifactStorageConfiguration,
  );
  let client: GeneratedPrismaClient | undefined;
  let redisClient: ProductionRedisClient | undefined;
  let disconnectPromise: Promise<void> | undefined;
  const disconnect = (): Promise<void> => {
    if (client === undefined && redisClient === undefined) return Promise.resolve();
    const clientToDisconnect = client;
    const redisClientToDisconnect = redisClient;
    disconnectPromise ??= Promise.resolve().then(async () => {
      try {
        await clientToDisconnect?.$disconnect();
      } finally {
        await redisClientToDisconnect?.disconnect();
      }
    });
    return disconnectPromise;
  };

  let emailVerificationDelivery: AwsSesEmailVerificationDeliveryAdapter;
  let recoveryDelivery: AwsSesPasswordRecoveryDeliveryAdapter;
  try {
    redisClient = dependencies.createRedisClient
      ? dependencies.createRedisClient(redisUrl)
      : (createRedisClient({ url: redisUrl }) as unknown as ProductionRedisClient);
    const sesClient = dependencies.createSesClient
      ? dependencies.createSesClient(emailDeliveryConfiguration.region)
      : new SESv2Client({ region: emailDeliveryConfiguration.region });
    const sesSender = new AwsSesV2SenderAdapter(sesClient);
    const browserOrigin = requestContext.csrf?.allowedOrigins?.[0];
    if (!browserOrigin) throw new Error(PRODUCTION_IAM_EMAIL_DELIVERY_CONFIGURATION_ERROR);
    emailVerificationDelivery = new AwsSesEmailVerificationDeliveryAdapter(
      sesSender,
      emailDeliveryConfiguration.fromAddress,
    );
    recoveryDelivery = new AwsSesPasswordRecoveryDeliveryAdapter(
      sesSender,
      emailDeliveryConfiguration.fromAddress,
      browserOrigin,
    );
    await redisClient.connect();
  } catch {
    try {
      await disconnect();
    } catch {
      // Preserve the stable provider-unavailable error if cleanup also fails.
    }
    throw new Error(PRODUCTION_IAM_PROVIDER_UNAVAILABLE);
  }

  const redisCounter = new RedisEvalRecoveryAdmissionCounterAdapter(
    new NodeRedisEvalClientAdapter(redisClient),
  );
  const iamProviders = Object.freeze({
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
    landingFeedbackIpAdmission: new RedisRecoveryAdmissionAdapter(redisCounter, {
      keyPrefix: 'databreeze:lfb:landing-feedback:ip:v1:',
      maxAttempts: 5,
      windowSeconds: 3600,
    }),
    registrationAdmissionDigest: new HmacSha256IamRegistrationAdmissionDigestAdapter(
      registrationAdmissionKey,
    ),
    landingFeedbackAdmissionDigest: new HmacSha256IamRegistrationAdmissionDigestAdapter(
      registrationAdmissionKey,
    ),
    recoveryDigest: new HmacSha256IamRecoveryDigestAdapter(recoveryDigestKey),
    emailVerificationDigest: new HmacSha256EmailVerificationDigestAdapter(
      emailVerificationDigestKey,
    ),
    emailVerificationEnvelope: new Aes256GcmEmailVerificationEnvelopeAdapter(
      emailVerificationEnvelopeKey,
    ),
    emailVerificationDelivery,
    recoveryDelivery,
  });

  try {
    const constructedClient = dependencies.createClient
      ? await dependencies.createClient(connectionString)
      : new (await loadGeneratedPrismaClient())({
          adapter: new PrismaPg({ connectionString }),
        });
    client = constructedClient;
    await constructedClient.$connect();
    return Object.freeze({
      client: constructedClient,
      options: Object.freeze(
        optionsFor(
          constructedClient,
          requestContext,
          serviceAccountSecretEnvelopeKey,
          workerCapabilitySigningSecret,
          artifactUploadStorage,
          workerObjectByteStore,
          iamProviders,
        ),
      ),
      disconnect,
    });
  } catch {
    if (client !== undefined) {
      try {
        await disconnect();
      } catch {
        // Preserve the stable client-unavailable error even if cleanup fails.
      }
    }
    throw new Error(PRODUCTION_DATABASE_CLIENT_ERROR);
  }
}

export function createDatabaseCompositionForRuntime(
  environment: RuntimeEnvironment = process.env,
  dependencies: {
    readonly production?: ProductionDatabaseCompositionDependencies;
    readonly local?: LocalDatabaseCompositionDependencies;
    readonly pilot?: LocalDatabaseCompositionDependencies;
  } = {},
): Promise<ProductionDatabaseComposition | LocalDatabaseComposition | undefined> {
  if (environment['DATABREEZE_RUNTIME_PROFILE'] === LOCAL_RUNTIME_PROFILE) {
    return createLocalDatabaseComposition(environment, dependencies.local);
  }
  if (environment['DATABREEZE_RUNTIME_PROFILE'] === PILOT_RUNTIME_PROFILE) {
    return createPilotDatabaseComposition(environment, dependencies.pilot ?? dependencies.local);
  }
  if (environment['NODE_ENV'] !== 'production') return Promise.resolve(undefined);
  ensureProductionOpenAiDefaults(environment);
  return createProductionDatabaseComposition(environment, dependencies.production);
}

export function createGracefulShutdownHandler(
  closeApplication: () => Promise<void>,
  disconnectDatabase: () => Promise<void>,
  options: { readonly deadlineMs?: number } = {},
): () => Promise<void> {
  let shutdownPromise: Promise<void> | undefined;
  const deadlineMs = options.deadlineMs ?? DEFAULT_PRODUCTION_SHUTDOWN_DEADLINE_MS;
  if (!validProductionShutdownDeadline(deadlineMs)) {
    throw new Error(PRODUCTION_SHUTDOWN_DEADLINE_CONFIG_ERROR);
  }

  async function runWithRemainingDeadline(
    operation: () => Promise<void>,
    deadlineAt: number,
  ): Promise<void> {
    const remainingMs = deadlineAt - Date.now();
    if (remainingMs <= 0) {
      throw new Error(PRODUCTION_SHUTDOWN_DEADLINE_ERROR);
    }
    const operationPromise = operation();

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        operationPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(PRODUCTION_SHUTDOWN_DEADLINE_ERROR)),
            remainingMs,
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return () => {
    shutdownPromise ??= (async () => {
      const deadlineAt = Date.now() + deadlineMs;
      let shutdownError: Error | undefined;

      try {
        await runWithRemainingDeadline(closeApplication, deadlineAt);
      } catch (error: unknown) {
        shutdownError =
          error instanceof Error ? error : new Error(PRODUCTION_SHUTDOWN_DEADLINE_ERROR);
      }

      try {
        await runWithRemainingDeadline(disconnectDatabase, deadlineAt);
      } catch (error: unknown) {
        shutdownError ??=
          error instanceof Error ? error : new Error(PRODUCTION_SHUTDOWN_DEADLINE_ERROR);
      }

      if (shutdownError !== undefined) {
        throw shutdownError;
      }
    })();
    return shutdownPromise;
  };
}

export function registerProductionShutdownHandlers(
  shutdown: () => Promise<void>,
  options: ProductionShutdownRegistrationOptions = {},
): () => void {
  const signalProcess = options.process ?? process;
  const forceTerminate =
    options.forceTerminate ??
    (() => {
      process.exitCode = 1;
      process.exit(1);
    });
  const deadlineMs = options.deadlineMs ?? DEFAULT_PRODUCTION_SHUTDOWN_DEADLINE_MS;
  if (!validProductionShutdownDeadline(deadlineMs)) {
    throw new Error(PRODUCTION_SHUTDOWN_DEADLINE_CONFIG_ERROR);
  }
  let shutdownStarted = false;
  let shutdownCompleted = false;
  let disposed = false;
  let forceTimer: ReturnType<typeof setTimeout> | undefined;

  const handlers: Readonly<Record<ProductionSignal, () => void>> = {
    SIGINT: () => startShutdown('SIGINT'),
    SIGTERM: () => startShutdown('SIGTERM'),
  };

  function startShutdown(signal: ProductionSignal): void {
    if (shutdownStarted) {
      forceTerminate(signal);
      return;
    }
    shutdownStarted = true;
    forceTimer = setTimeout(() => {
      if (!shutdownCompleted) forceTerminate(signal);
    }, deadlineMs);
    void shutdown().then(
      () => {
        shutdownCompleted = true;
        dispose();
      },
      () => {
        shutdownCompleted = true;
        dispose();
        forceTerminate(signal);
      },
    );
  }

  function clearForceTimer(): void {
    if (forceTimer === undefined) return;
    clearTimeout(forceTimer);
    forceTimer = undefined;
  }

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    clearForceTimer();
    signalProcess.removeListener('SIGINT', handlers.SIGINT);
    signalProcess.removeListener('SIGTERM', handlers.SIGTERM);
  }

  signalProcess.on('SIGINT', handlers.SIGINT);
  signalProcess.on('SIGTERM', handlers.SIGTERM);
  return dispose;
}

export function createStartupCleanupHandler(
  disposeSignalHandlers: () => void,
  shutdown: () => Promise<void>,
): () => Promise<void> {
  let cleanupPromise: Promise<void> | undefined;
  return () => {
    cleanupPromise ??= (async () => {
      disposeSignalHandlers();
      await shutdown();
    })();
    return cleanupPromise;
  };
}
