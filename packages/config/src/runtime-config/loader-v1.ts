import {
  ConfigValidationErrorV1,
  RUNTIME_CONFIG_SCHEMA_VERSION_V1,
  createSecretReferenceV1,
} from './types-v1.ts';
import type {
  ActiveDocumentProviderConfigV1,
  AiConfigV1,
  ConfigIssueV1,
  EmailConfigV1,
  EnvironmentEntriesV1,
  LoadRuntimeConfigInputV1,
  ObjectStorageConfigV1,
  OcrConfigV1,
  PaymentsConfigV1,
  ProviderRuntimeConfigV1,
  PushConfigV1,
  RuntimeConfigV1,
  RuntimeProfileV1,
  SecretReferenceV1,
  SecretsConfigV1,
  TelemetryConfigV1,
} from './types-v1.ts';

type UnknownRecord = Record<string, unknown>;
type EnvironmentValueKind = 'boolean' | 'integer' | 'string';

interface EnvironmentDefinition {
  readonly path: readonly string[];
  readonly kind: EnvironmentValueKind;
}

const profiles = new Set<RuntimeProfileV1>([
  'development',
  'test',
  'preview',
  'staging',
  'production',
]);

const strictProfiles = new Set<RuntimeProfileV1>(['preview', 'staging', 'production']);

const providerKeys = [
  'objectStorage',
  'email',
  'push',
  'ocr',
  'ai',
  'payments',
  'telemetry',
  'secrets',
] as const;

const environmentDefinitions: Readonly<Record<string, EnvironmentDefinition>> = {
  DATABREEZE_PROFILE: { path: ['profile'], kind: 'string' },
  DATABREEZE_PROVIDER_TIMEOUT_MS: {
    path: ['providerPolicy', 'timeoutMs'],
    kind: 'integer',
  },
  DATABREEZE_PROVIDER_MAX_ATTEMPTS: {
    path: ['providerPolicy', 'maxAttempts'],
    kind: 'integer',
  },
  DATABREEZE_OBJECT_STORAGE_MODE: {
    path: ['providers', 'objectStorage', 'mode'],
    kind: 'string',
  },
  DATABREEZE_OBJECT_STORAGE_ENDPOINT_URL: {
    path: ['providers', 'objectStorage', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_OBJECT_STORAGE_REGION: {
    path: ['providers', 'objectStorage', 'region'],
    kind: 'string',
  },
  DATABREEZE_OBJECT_STORAGE_BUCKET: {
    path: ['providers', 'objectStorage', 'bucket'],
    kind: 'string',
  },
  DATABREEZE_OBJECT_STORAGE_CREDENTIAL_REF: {
    path: ['providers', 'objectStorage', 'credentialRef'],
    kind: 'string',
  },
  DATABREEZE_OBJECT_STORAGE_FORCE_PATH_STYLE: {
    path: ['providers', 'objectStorage', 'forcePathStyle'],
    kind: 'boolean',
  },
  DATABREEZE_EMAIL_MODE: { path: ['providers', 'email', 'mode'], kind: 'string' },
  DATABREEZE_EMAIL_ENDPOINT_URL: {
    path: ['providers', 'email', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_EMAIL_FROM_ADDRESS: {
    path: ['providers', 'email', 'fromAddress'],
    kind: 'string',
  },
  DATABREEZE_EMAIL_CREDENTIAL_REF: {
    path: ['providers', 'email', 'credentialRef'],
    kind: 'string',
  },
  DATABREEZE_PUSH_MODE: { path: ['providers', 'push', 'mode'], kind: 'string' },
  DATABREEZE_PUSH_ENDPOINT_URL: {
    path: ['providers', 'push', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_PUSH_APPLICATION_ID: {
    path: ['providers', 'push', 'applicationId'],
    kind: 'string',
  },
  DATABREEZE_PUSH_CREDENTIAL_REF: {
    path: ['providers', 'push', 'credentialRef'],
    kind: 'string',
  },
  DATABREEZE_OCR_MODE: { path: ['providers', 'ocr', 'mode'], kind: 'string' },
  DATABREEZE_OCR_ENDPOINT_URL: {
    path: ['providers', 'ocr', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_OCR_CREDENTIAL_REF: {
    path: ['providers', 'ocr', 'credentialRef'],
    kind: 'string',
  },
  DATABREEZE_AI_MODE: { path: ['providers', 'ai', 'mode'], kind: 'string' },
  DATABREEZE_AI_ENDPOINT_URL: {
    path: ['providers', 'ai', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_AI_CREDENTIAL_REF: {
    path: ['providers', 'ai', 'credentialRef'],
    kind: 'string',
  },
  DATABREEZE_PAYMENTS_MODE: { path: ['providers', 'payments', 'mode'], kind: 'string' },
  DATABREEZE_PAYMENTS_ENDPOINT_URL: {
    path: ['providers', 'payments', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_PAYMENTS_CREDENTIAL_REF: {
    path: ['providers', 'payments', 'credentialRef'],
    kind: 'string',
  },
  DATABREEZE_PAYMENTS_WEBHOOK_SECRET_REF: {
    path: ['providers', 'payments', 'webhookSecretRef'],
    kind: 'string',
  },
  DATABREEZE_TELEMETRY_MODE: {
    path: ['providers', 'telemetry', 'mode'],
    kind: 'string',
  },
  DATABREEZE_TELEMETRY_ENDPOINT_URL: {
    path: ['providers', 'telemetry', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_TELEMETRY_CREDENTIAL_REF: {
    path: ['providers', 'telemetry', 'credentialRef'],
    kind: 'string',
  },
  DATABREEZE_SECRETS_MODE: { path: ['providers', 'secrets', 'mode'], kind: 'string' },
  DATABREEZE_SECRETS_ENDPOINT_URL: {
    path: ['providers', 'secrets', 'endpointUrl'],
    kind: 'string',
  },
  DATABREEZE_SECRETS_NAMESPACE: {
    path: ['providers', 'secrets', 'namespace'],
    kind: 'string',
  },
};

const allowedOverrideKeys: Readonly<Record<string, readonly string[]>> = {
  '': ['profile', 'providerPolicy', 'providers'],
  providerPolicy: ['timeoutMs', 'maxAttempts'],
  providers: [...providerKeys],
  'providers.objectStorage': [
    'mode',
    'endpointUrl',
    'region',
    'bucket',
    'credentialRef',
    'forcePathStyle',
  ],
  'providers.email': ['mode', 'endpointUrl', 'fromAddress', 'credentialRef'],
  'providers.push': ['mode', 'endpointUrl', 'applicationId', 'credentialRef'],
  'providers.ocr': ['mode', 'endpointUrl', 'credentialRef'],
  'providers.ai': ['mode', 'endpointUrl', 'credentialRef'],
  'providers.payments': ['mode', 'endpointUrl', 'credentialRef', 'webhookSecretRef'],
  'providers.telemetry': ['mode', 'endpointUrl', 'credentialRef'],
  'providers.secrets': ['mode', 'endpointUrl', 'namespace'],
};

const placeholderSegments = new Set([
  'changeme',
  'change-me',
  'dummy',
  'example',
  'password',
  'placeholder',
  'replace-me',
  'secret',
  'todo',
]);

function isRecord(value: unknown): value is UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    Object.freeze(value);
  }
  return value;
}

function environmentEntries(
  environment: EnvironmentEntriesV1 | undefined,
): readonly (readonly [string, string | undefined])[] {
  if (environment === undefined) {
    return [];
  }
  if (!Array.isArray(environment)) {
    return Object.entries(environment);
  }
  return environment as readonly (readonly [string, string | undefined])[];
}

function validateOverrideKeys(value: unknown, issues: ConfigIssueV1[], path = ''): void {
  if (!isRecord(value)) {
    if (path === '') {
      issues.push({ path: 'overrides', code: 'invalid_string' });
    }
    return;
  }

  const allowed = allowedOverrideKeys[path];
  if (allowed === undefined) {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    const childPath = path === '' ? key : `${path}.${key}`;
    if (!allowed.includes(key)) {
      issues.push({ path: `overrides.${childPath}`, code: 'unknown_key' });
      continue;
    }
    if (allowedOverrideKeys[childPath] !== undefined) {
      if (!isRecord(child)) {
        issues.push({ path: `overrides.${childPath}`, code: 'invalid_string' });
      } else {
        validateOverrideKeys(child, issues, childPath);
      }
    }
  }
}

function setPath(target: UnknownRecord, path: readonly string[], value: unknown): void {
  let cursor = target;
  for (const segment of path.slice(0, -1)) {
    const existing = cursor[segment];
    if (!isRecord(existing)) {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as UnknownRecord;
  }
  const finalSegment = path.at(-1);
  if (finalSegment !== undefined) {
    cursor[finalSegment] = value;
  }
}

function mergeRecords(base: UnknownRecord, overlay: UnknownRecord): UnknownRecord {
  const result: UnknownRecord = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    const current = result[key];
    result[key] = isRecord(current) && isRecord(value) ? mergeRecords(current, value) : value;
  }
  return result;
}

function parseEnvironmentValue(
  value: string,
  definition: EnvironmentDefinition,
  issues: ConfigIssueV1[],
): unknown {
  const path = definition.path.join('.');
  if (definition.kind === 'string') {
    return value;
  }
  if (definition.kind === 'boolean') {
    if (value === 'true') return true;
    if (value === 'false') return false;
    issues.push({ path, code: 'invalid_boolean' });
    return undefined;
  }
  if (!/^(0|[1-9][0-9]*)$/.test(value)) {
    issues.push({ path, code: 'invalid_integer' });
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    issues.push({ path, code: 'invalid_integer' });
    return undefined;
  }
  return parsed;
}

function readEnvironment(
  environment: EnvironmentEntriesV1 | undefined,
  issues: ConfigIssueV1[],
): UnknownRecord {
  const seen = new Set<string>();
  const result: UnknownRecord = {};

  for (const [key, value] of environmentEntries(environment)) {
    if (seen.has(key)) {
      issues.push({ path: `environment.${key}`, code: 'duplicate' });
      continue;
    }
    seen.add(key);

    const definition = environmentDefinitions[key];
    if (definition === undefined) {
      if (key.startsWith('DATABREEZE_')) {
        issues.push({ path: `environment.${key}`, code: 'unknown_key' });
      }
      continue;
    }
    if (value === undefined) {
      continue;
    }
    const parsed = parseEnvironmentValue(value, definition, issues);
    if (parsed !== undefined) {
      setPath(result, definition.path, parsed);
    }
  }
  return result;
}

function profileDefaults(profile: RuntimeProfileV1): UnknownRecord {
  const providerPolicy = { timeoutMs: 10_000, maxAttempts: 3 };
  if (profile === 'development') {
    return {
      profile,
      providerPolicy,
      providers: {
        objectStorage: {
          mode: 'local',
          endpointUrl: 'http://127.0.0.1:9000',
          region: 'local',
          bucket: 'databreeze-development',
          forcePathStyle: true,
        },
        email: {
          mode: 'local',
          endpointUrl: 'smtp://127.0.0.1:1025',
          fromAddress: 'noreply@databreeze.local',
        },
        push: { mode: 'disabled' },
        ocr: { mode: 'disabled' },
        ai: { mode: 'disabled' },
        payments: { mode: 'disabled' },
        telemetry: { mode: 'local', endpointUrl: 'http://127.0.0.1:4318' },
        secrets: { mode: 'memory', namespace: 'development' },
      },
    };
  }
  if (profile === 'test') {
    return {
      profile,
      providerPolicy,
      providers: {
        objectStorage: {
          mode: 'local',
          endpointUrl: 'http://127.0.0.1:9000',
          region: 'local',
          bucket: 'databreeze-test',
          forcePathStyle: true,
        },
        email: { mode: 'disabled' },
        push: { mode: 'disabled' },
        ocr: { mode: 'disabled' },
        ai: { mode: 'disabled' },
        payments: { mode: 'disabled' },
        telemetry: { mode: 'disabled' },
        secrets: { mode: 'memory', namespace: 'test' },
      },
    };
  }
  return { profile, providerPolicy, providers: {} };
}

function requiredString(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ConfigIssueV1[],
): string {
  const value = record[key];
  if (value === undefined) {
    issues.push({ path, code: 'required' });
    return '';
  }
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    issues.push({ path, code: 'invalid_string' });
    return '';
  }
  return value;
}

function requiredBoolean(
  record: UnknownRecord,
  key: string,
  path: string,
  issues: ConfigIssueV1[],
): boolean {
  const value = record[key];
  if (value === undefined) {
    issues.push({ path, code: 'required' });
    return false;
  }
  if (typeof value !== 'boolean') {
    issues.push({ path, code: 'invalid_boolean' });
    return false;
  }
  return value;
}

function requiredInteger(
  record: UnknownRecord,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
  issues: ConfigIssueV1[],
): number {
  const value = record[key];
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    issues.push({ path, code: 'invalid_integer' });
    return minimum;
  }
  return value;
}

function recordAt(record: UnknownRecord, key: string): UnknownRecord {
  const value = record[key];
  return isRecord(value) ? value : {};
}

function validEndpoint(
  value: string,
  path: string,
  profile: RuntimeProfileV1,
  mode: string,
  kind: 'email' | 'network',
  issues: ConfigIssueV1[],
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    issues.push({ path, code: 'unsafe_url' });
    return value;
  }

  if (
    parsed.username !== '' ||
    parsed.password !== '' ||
    parsed.search !== '' ||
    parsed.hash !== ''
  ) {
    issues.push({ path, code: 'unsafe_url' });
    return value;
  }

  const secureProtocols = kind === 'email' ? new Set(['https:', 'smtps:']) : new Set(['https:']);
  if (secureProtocols.has(parsed.protocol)) {
    return value;
  }

  const localProtocols = kind === 'email' ? new Set(['http:', 'smtp:']) : new Set(['http:']);
  const hostname = parsed.hostname.toLowerCase();
  const loopback = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  const safeLocal =
    (profile === 'development' || profile === 'test') &&
    mode === 'local' &&
    loopback &&
    localProtocols.has(parsed.protocol);
  if (!safeLocal) {
    issues.push({ path, code: 'unsafe_url' });
  }
  return value;
}

function secretReference(
  value: unknown,
  path: string,
  issues: ConfigIssueV1[],
  required: boolean,
): SecretReferenceV1 | undefined {
  if (value === undefined) {
    if (required) issues.push({ path, code: 'required' });
    return undefined;
  }
  if (typeof value !== 'string' || value.trim() !== value) {
    issues.push({ path, code: 'invalid_secret_reference' });
    return undefined;
  }
  const match =
    /^secret:\/\/([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._/-]*)(?:#[a-z0-9._-]+)?$/.exec(value);
  const segments = match?.slice(1).flatMap((part) => part.split(/[./_-]+/)) ?? [];
  if (match === null || segments.some((segment) => placeholderSegments.has(segment))) {
    issues.push({ path, code: 'invalid_secret_reference' });
    return undefined;
  }
  return createSecretReferenceV1(value);
}

function modeOf(
  record: UnknownRecord,
  path: string,
  allowed: readonly string[],
  issues: ConfigIssueV1[],
): string {
  const mode = record['mode'];
  if (mode === undefined) {
    issues.push({ path: `${path}.mode`, code: 'required' });
    return '';
  }
  if (typeof mode !== 'string' || !allowed.includes(mode)) {
    issues.push({ path: `${path}.mode`, code: 'invalid_mode' });
    return '';
  }
  return mode;
}

function forbidDisabledFields(
  record: UnknownRecord,
  path: string,
  fields: readonly string[],
  issues: ConfigIssueV1[],
): void {
  for (const field of fields) {
    if (record[field] !== undefined) {
      issues.push({ path: `${path}.${field}`, code: 'forbidden_when_disabled' });
    }
  }
}

function validateObjectStorage(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  issues: ConfigIssueV1[],
): ObjectStorageConfigV1 {
  const path = 'providers.objectStorage';
  const mode = modeOf(record, path, ['local', 'remote'], issues);
  if (strictProfiles.has(profile) && mode !== '' && mode !== 'remote') {
    issues.push({ path: `${path}.mode`, code: 'invalid_mode' });
  }
  const endpointUrl = validEndpoint(
    requiredString(record, 'endpointUrl', `${path}.endpointUrl`, issues),
    `${path}.endpointUrl`,
    profile,
    mode,
    'network',
    issues,
  );
  const region = requiredString(record, 'region', `${path}.region`, issues);
  const bucket = requiredString(record, 'bucket', `${path}.bucket`, issues);
  const forcePathStyle = requiredBoolean(
    record,
    'forcePathStyle',
    `${path}.forcePathStyle`,
    issues,
  );
  const credentialRef = secretReference(
    record['credentialRef'],
    `${path}.credentialRef`,
    issues,
    mode === 'remote',
  );
  return {
    mode: mode === 'remote' ? 'remote' : 'local',
    endpointUrl,
    region,
    bucket,
    ...(credentialRef === undefined ? {} : { credentialRef }),
    forcePathStyle,
  };
}

function validateEmail(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  issues: ConfigIssueV1[],
): EmailConfigV1 {
  const path = 'providers.email';
  const mode = modeOf(record, path, ['disabled', 'local', 'remote'], issues);
  if (mode === 'disabled') {
    forbidDisabledFields(record, path, ['endpointUrl', 'fromAddress', 'credentialRef'], issues);
    return { mode: 'disabled' };
  }
  if (strictProfiles.has(profile) && mode === 'local') {
    issues.push({ path: `${path}.mode`, code: 'invalid_mode' });
  }
  const endpointUrl = validEndpoint(
    requiredString(record, 'endpointUrl', `${path}.endpointUrl`, issues),
    `${path}.endpointUrl`,
    profile,
    mode,
    'email',
    issues,
  );
  const fromAddress = requiredString(record, 'fromAddress', `${path}.fromAddress`, issues);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fromAddress)) {
    issues.push({ path: `${path}.fromAddress`, code: 'invalid_email' });
  }
  const credentialRef = secretReference(
    record['credentialRef'],
    `${path}.credentialRef`,
    issues,
    mode === 'remote',
  );
  return {
    mode: mode === 'remote' ? 'remote' : 'local',
    endpointUrl,
    fromAddress,
    ...(credentialRef === undefined ? {} : { credentialRef }),
  };
}

function validatePush(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  issues: ConfigIssueV1[],
): PushConfigV1 {
  const path = 'providers.push';
  const mode = modeOf(record, path, ['disabled', 'remote'], issues);
  if (mode === 'disabled') {
    forbidDisabledFields(record, path, ['endpointUrl', 'applicationId', 'credentialRef'], issues);
    return { mode: 'disabled' };
  }
  const endpointUrl = validEndpoint(
    requiredString(record, 'endpointUrl', `${path}.endpointUrl`, issues),
    `${path}.endpointUrl`,
    profile,
    mode,
    'network',
    issues,
  );
  const applicationId = requiredString(record, 'applicationId', `${path}.applicationId`, issues);
  const credentialRef = secretReference(
    record['credentialRef'],
    `${path}.credentialRef`,
    issues,
    true,
  );
  return {
    mode: 'remote',
    endpointUrl,
    applicationId,
    credentialRef: credentialRef as SecretReferenceV1,
  };
}

function validateDocumentProvider(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  name: 'ocr' | 'ai',
  issues: ConfigIssueV1[],
): ActiveDocumentProviderConfigV1 | { readonly mode: 'disabled' } {
  const path = `providers.${name}`;
  const mode = modeOf(record, path, ['disabled', 'local', 'remote'], issues);
  if (mode === 'disabled') {
    forbidDisabledFields(record, path, ['endpointUrl', 'credentialRef'], issues);
    return { mode: 'disabled' };
  }
  if (strictProfiles.has(profile) && mode === 'local') {
    issues.push({ path: `${path}.mode`, code: 'invalid_mode' });
  }
  const endpointUrl = validEndpoint(
    requiredString(record, 'endpointUrl', `${path}.endpointUrl`, issues),
    `${path}.endpointUrl`,
    profile,
    mode,
    'network',
    issues,
  );
  const credentialRef = secretReference(
    record['credentialRef'],
    `${path}.credentialRef`,
    issues,
    mode === 'remote',
  );
  return {
    mode: mode === 'remote' ? 'remote' : 'local',
    endpointUrl,
    ...(credentialRef === undefined ? {} : { credentialRef }),
  };
}

function validatePayments(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  issues: ConfigIssueV1[],
): PaymentsConfigV1 {
  const path = 'providers.payments';
  const mode = modeOf(record, path, ['disabled', 'remote'], issues);
  if (mode === 'disabled') {
    forbidDisabledFields(
      record,
      path,
      ['endpointUrl', 'credentialRef', 'webhookSecretRef'],
      issues,
    );
    return { mode: 'disabled' };
  }
  const endpointUrl = validEndpoint(
    requiredString(record, 'endpointUrl', `${path}.endpointUrl`, issues),
    `${path}.endpointUrl`,
    profile,
    mode,
    'network',
    issues,
  );
  const credentialRef = secretReference(
    record['credentialRef'],
    `${path}.credentialRef`,
    issues,
    true,
  );
  const webhookSecretRef = secretReference(
    record['webhookSecretRef'],
    `${path}.webhookSecretRef`,
    issues,
    true,
  );
  return {
    mode: 'remote',
    endpointUrl,
    credentialRef: credentialRef as SecretReferenceV1,
    webhookSecretRef: webhookSecretRef as SecretReferenceV1,
  };
}

function validateTelemetry(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  issues: ConfigIssueV1[],
): TelemetryConfigV1 {
  const path = 'providers.telemetry';
  const mode = modeOf(record, path, ['disabled', 'local', 'remote'], issues);
  if (mode === 'disabled') {
    forbidDisabledFields(record, path, ['endpointUrl', 'credentialRef'], issues);
    return { mode: 'disabled' };
  }
  if (strictProfiles.has(profile) && mode === 'local') {
    issues.push({ path: `${path}.mode`, code: 'invalid_mode' });
  }
  const endpointUrl = validEndpoint(
    requiredString(record, 'endpointUrl', `${path}.endpointUrl`, issues),
    `${path}.endpointUrl`,
    profile,
    mode,
    'network',
    issues,
  );
  const credentialRef = secretReference(
    record['credentialRef'],
    `${path}.credentialRef`,
    issues,
    false,
  );
  return {
    mode: mode === 'remote' ? 'remote' : 'local',
    endpointUrl,
    ...(credentialRef === undefined ? {} : { credentialRef }),
  };
}

function validateSecrets(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  issues: ConfigIssueV1[],
): SecretsConfigV1 {
  const path = 'providers.secrets';
  const mode = modeOf(record, path, ['memory', 'remote'], issues);
  if (strictProfiles.has(profile) && mode !== '' && mode !== 'remote') {
    issues.push({ path: `${path}.mode`, code: 'invalid_mode' });
  }
  const namespace = requiredString(record, 'namespace', `${path}.namespace`, issues);
  if (mode === 'remote') {
    return {
      mode: 'remote',
      endpointUrl: validEndpoint(
        requiredString(record, 'endpointUrl', `${path}.endpointUrl`, issues),
        `${path}.endpointUrl`,
        profile,
        mode,
        'network',
        issues,
      ),
      namespace,
    };
  }
  if (record['endpointUrl'] !== undefined) {
    issues.push({ path: `${path}.endpointUrl`, code: 'forbidden_when_disabled' });
  }
  return { mode: 'memory', namespace };
}

function validateProviders(
  record: UnknownRecord,
  profile: RuntimeProfileV1,
  issues: ConfigIssueV1[],
): ProviderRuntimeConfigV1 {
  return {
    objectStorage: validateObjectStorage(recordAt(record, 'objectStorage'), profile, issues),
    email: validateEmail(recordAt(record, 'email'), profile, issues),
    push: validatePush(recordAt(record, 'push'), profile, issues),
    ocr: validateDocumentProvider(recordAt(record, 'ocr'), profile, 'ocr', issues) as OcrConfigV1,
    ai: validateDocumentProvider(recordAt(record, 'ai'), profile, 'ai', issues) as AiConfigV1,
    payments: validatePayments(recordAt(record, 'payments'), profile, issues),
    telemetry: validateTelemetry(recordAt(record, 'telemetry'), profile, issues),
    secrets: validateSecrets(recordAt(record, 'secrets'), profile, issues),
  };
}

function selectedProfile(
  environment: UnknownRecord,
  overrides: UnknownRecord,
  issues: ConfigIssueV1[],
): RuntimeProfileV1 | undefined {
  const value = overrides['profile'] ?? environment['profile'];
  if (value === undefined) {
    issues.push({ path: 'profile', code: 'required' });
    return undefined;
  }
  if (typeof value !== 'string' || !profiles.has(value as RuntimeProfileV1)) {
    issues.push({ path: 'profile', code: 'invalid_profile' });
    return undefined;
  }
  return value as RuntimeProfileV1;
}

export function loadRuntimeConfigV1(input: LoadRuntimeConfigInputV1 = {}): RuntimeConfigV1 {
  const issues: ConfigIssueV1[] = [];
  const environment = readEnvironment(input.environment, issues);
  const overrides = input.overrides === undefined ? {} : input.overrides;
  validateOverrideKeys(overrides, issues);
  const overrideRecord = isRecord(overrides) ? overrides : {};
  const profile = selectedProfile(environment, overrideRecord, issues);

  if (profile === undefined) {
    throw new ConfigValidationErrorV1(issues);
  }

  const merged = mergeRecords(mergeRecords(profileDefaults(profile), environment), overrideRecord);
  const providerPolicyRecord = recordAt(merged, 'providerPolicy');
  const providerPolicy = {
    timeoutMs: requiredInteger(
      providerPolicyRecord,
      'timeoutMs',
      'providerPolicy.timeoutMs',
      100,
      120_000,
      issues,
    ),
    maxAttempts: requiredInteger(
      providerPolicyRecord,
      'maxAttempts',
      'providerPolicy.maxAttempts',
      1,
      10,
      issues,
    ),
  };
  const providers = validateProviders(recordAt(merged, 'providers'), profile, issues);

  if (issues.length > 0) {
    throw new ConfigValidationErrorV1(issues);
  }

  return deepFreeze({
    schemaVersion: RUNTIME_CONFIG_SCHEMA_VERSION_V1,
    profile,
    providerPolicy,
    providers,
  });
}
