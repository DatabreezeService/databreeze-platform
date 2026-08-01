import { parseV1Contract } from '@databreeze/contracts/v1';

export const PROVIDER_PORT_SCHEMA_VERSION_V1 = 1 as const;

export type ProviderKindV1 =
  | 'object-storage'
  | 'email'
  | 'push'
  | 'ocr'
  | 'ai'
  | 'payments'
  | 'telemetry'
  | 'secrets';

export const PROVIDER_OPERATIONS_BY_KIND_V1 = Object.freeze({
  'object-storage': Object.freeze([
    'begin-multipart-upload',
    'upload-part',
    'complete-multipart-upload',
    'abort-multipart-upload',
    'read-range',
    'verify-digest',
    'apply-retention',
    'delete-verified',
    'create-read-grant',
    'export-object-manifest',
  ] as const),
  email: Object.freeze([
    'send-template',
    'verify-delivery-webhook',
    'suppress-recipient',
    'export-suppression-manifest',
  ] as const),
  push: Object.freeze([
    'send-push',
    'verify-delivery-webhook',
    'suppress-recipient',
    'export-suppression-manifest',
  ] as const),
  ocr: Object.freeze(['extract'] as const),
  ai: Object.freeze(['generate-structured'] as const),
  payments: Object.freeze([
    'create-hosted-subscription-checkout',
    'create-subscription-portal',
    'upsert-databreeze-subscription',
    'verify-subscription-webhook',
    'reconcile-databreeze-subscription',
    'export-subscription-migration',
  ] as const),
  telemetry: Object.freeze(['export-telemetry-batch'] as const),
  secrets: Object.freeze(['resolve-handle', 'revoke-handle', 'describe-portability'] as const),
} satisfies Readonly<Record<ProviderKindV1, readonly string[]>>);

export type ProviderOperationV1 =
  | (typeof PROVIDER_OPERATIONS_BY_KIND_V1)[ProviderKindV1][number]
  | 'contract-validation';

export type ProviderErrorCodeV1 =
  | 'INVALID_REQUEST'
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'UNAVAILABLE'
  | 'POLICY_DENIED'
  | 'UNSUPPORTED'
  | 'INTEGRITY_FAILED'
  | 'UNKNOWN';

export type ProviderIdempotencyV1 = 'required' | 'supported' | 'not_applicable';
export type ProviderCancellationV1 = 'cooperative' | 'supported' | 'not_supported';
export type ProviderHealthStatusV1 = 'healthy' | 'degraded' | 'unavailable';
export type ProviderContentRetentionV1 = 'none' | 'transient' | 'durable' | 'provider_policy';
export type ProviderTrainingUseV1 = 'prohibited' | 'policy_controlled' | 'not_applicable';
export type ProviderFailoverV1 = 'none' | 'manual' | 'automatic';
export type ProviderDegradedBehaviorV1 =
  | 'fail_closed'
  | 'queue'
  | 'local_fallback'
  | 'in_app_only'
  | 'read_only';
export type ProviderStatePortabilityV1 = 'none' | 'manifest' | 'full';
export type ProviderCredentialRevocationV1 = 'not_applicable' | 'supported' | 'manual';

export interface ProviderCapabilityV1 {
  readonly operation: ProviderOperationV1;
  readonly idempotency: ProviderIdempotencyV1;
  readonly cancellation: ProviderCancellationV1;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
}

export interface ProviderDataHandlingV1 {
  readonly regions: readonly string[];
  readonly contentRetention: ProviderContentRetentionV1;
  readonly maximumRetentionSeconds?: number;
  readonly trainingUse: ProviderTrainingUseV1;
}

export interface ProviderResilienceV1 {
  readonly failover: ProviderFailoverV1;
  readonly degradedBehavior: ProviderDegradedBehaviorV1;
}

export interface ProviderExitV1 {
  readonly statePortability: ProviderStatePortabilityV1;
  readonly exportFormat: string;
  readonly credentialRevocation: ProviderCredentialRevocationV1;
}

export interface ProviderDescriptorInputV1<K extends ProviderKindV1 = ProviderKindV1> {
  readonly kind: K;
  readonly adapterKey: string;
  readonly capabilities: readonly ProviderCapabilityV1[];
  readonly dataHandling: ProviderDataHandlingV1;
  readonly resilience: ProviderResilienceV1;
  readonly exit: ProviderExitV1;
}

export interface ProviderDescriptorV1<K extends ProviderKindV1 = ProviderKindV1>
  extends ProviderDescriptorInputV1<K> {
  readonly schemaVersion: typeof PROVIDER_PORT_SCHEMA_VERSION_V1;
}

export class ProviderContractErrorV1 extends Error {
  public readonly code = 'INVALID_DESCRIPTOR' as const;

  public constructor() {
    super('Provider contract is invalid.');
    this.name = 'ProviderContractErrorV1';
    Object.freeze(this);
  }

  public toJSON(): Readonly<{ name: string; code: 'INVALID_DESCRIPTOR' }> {
    return Object.freeze({ name: this.name, code: this.code });
  }
}

type UnknownRecord = Record<string, unknown>;

const providerKinds = new Set<ProviderKindV1>(
  Object.keys(PROVIDER_OPERATIONS_BY_KIND_V1) as ProviderKindV1[],
);
const providerOperations = new Set<ProviderOperationV1>([
  ...Object.values(PROVIDER_OPERATIONS_BY_KIND_V1).flat(),
  'contract-validation',
]);
const idempotencyValues = new Set<ProviderIdempotencyV1>([
  'required',
  'supported',
  'not_applicable',
]);
const cancellationValues = new Set<ProviderCancellationV1>([
  'cooperative',
  'supported',
  'not_supported',
]);
const contentRetentionValues = new Set<ProviderContentRetentionV1>([
  'none',
  'transient',
  'durable',
  'provider_policy',
]);
const trainingUseValues = new Set<ProviderTrainingUseV1>([
  'prohibited',
  'policy_controlled',
  'not_applicable',
]);
const failoverValues = new Set<ProviderFailoverV1>(['none', 'manual', 'automatic']);
const degradedBehaviorValues = new Set<ProviderDegradedBehaviorV1>([
  'fail_closed',
  'queue',
  'local_fallback',
  'in_app_only',
  'read_only',
]);
const statePortabilityValues = new Set<ProviderStatePortabilityV1>(['none', 'manifest', 'full']);
const credentialRevocationValues = new Set<ProviderCredentialRevocationV1>([
  'not_applicable',
  'supported',
  'manual',
]);
const errorCodes = new Set<ProviderErrorCodeV1>([
  'INVALID_REQUEST',
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_DENIED',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'QUOTA_EXCEEDED',
  'TIMEOUT',
  'ABORTED',
  'UNAVAILABLE',
  'POLICY_DENIED',
  'UNSUPPORTED',
  'INTEGRITY_FAILED',
  'UNKNOWN',
]);
const nonRetryableErrorCodes = new Set<ProviderErrorCodeV1>([
  'INVALID_REQUEST',
  'AUTHENTICATION_FAILED',
  'AUTHORIZATION_DENIED',
  'NOT_FOUND',
  'ABORTED',
  'POLICY_DENIED',
  'UNSUPPORTED',
  'INTEGRITY_FAILED',
]);
const healthReasonCodes = new Set([
  'AUTHENTICATION_FAILED',
  'DEGRADED_CAPACITY',
  'POLICY_RESTRICTED',
  'UPSTREAM_RATE_LIMITED',
  'UPSTREAM_UNAVAILABLE',
]);
const errorMessageKeys: Readonly<Record<ProviderErrorCodeV1, string>> = Object.freeze({
  INVALID_REQUEST: 'provider.invalid_request',
  AUTHENTICATION_FAILED: 'provider.authentication_failed',
  AUTHORIZATION_DENIED: 'provider.authorization_denied',
  NOT_FOUND: 'provider.not_found',
  CONFLICT: 'provider.conflict',
  RATE_LIMITED: 'provider.rate_limited',
  QUOTA_EXCEEDED: 'provider.quota_exceeded',
  TIMEOUT: 'provider.timeout',
  ABORTED: 'provider.aborted',
  UNAVAILABLE: 'provider.unavailable',
  POLICY_DENIED: 'provider.policy_denied',
  UNSUPPORTED: 'provider.unsupported',
  INTEGRITY_FAILED: 'provider.integrity_failed',
  UNKNOWN: 'provider.unknown',
});
const UTC_TIMESTAMP_SCHEMA_ID = 'https://schemas.databreeze.dev/contracts/v1/utc-timestamp';

function isObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

function readClosedRecord(
  value: unknown,
  allowedKeys: readonly string[],
): UnknownRecord | undefined {
  if (!isObject(value)) return undefined;
  const allowed = new Set(allowedKeys);
  const result: UnknownRecord = Object.create(null) as UnknownRecord;
  try {
    if (Array.isArray(value)) return undefined;
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string' || !allowed.has(key)) return undefined;
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !('value' in descriptor)) return undefined;
      result[key] = descriptor.value;
    }
  } catch {
    return undefined;
  }
  return result;
}

function readArray(value: unknown, maximum = 100): readonly unknown[] | undefined {
  let descriptors: Record<string, PropertyDescriptor>;
  try {
    if (!Array.isArray(value)) return undefined;
    descriptors = Object.getOwnPropertyDescriptors(value) as Record<string, PropertyDescriptor>;
  } catch {
    return undefined;
  }
  const lengthDescriptor = descriptors['length'];
  if (
    lengthDescriptor === undefined ||
    !('value' in lengthDescriptor) ||
    !Number.isSafeInteger(lengthDescriptor.value) ||
    lengthDescriptor.value < 0 ||
    lengthDescriptor.value > maximum
  ) {
    return undefined;
  }
  const length = lengthDescriptor.value as number;
  const result: unknown[] = [];
  for (const key of Object.keys(descriptors)) {
    if (key === 'length') continue;
    if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= length) return undefined;
  }
  for (let index = 0; index < length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (descriptor === undefined || !('value' in descriptor)) return undefined;
    result.push(descriptor.value);
  }
  return result;
}

function isSafeToken(value: unknown, maximum = 200): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isRegion(value: unknown): value is string {
  return typeof value === 'string' && /^(?:local|global|[a-z]{2}(?:-[a-z0-9]+)+)$/.test(value);
}

function isPositiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum;
}

function isUtcTimestamp(value: unknown): value is string {
  return parseV1Contract(UTC_TIMESTAMP_SCHEMA_ID, value).accepted;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sameStringSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((value) => right.has(value));
}

export function defineProviderDescriptorV1<K extends ProviderKindV1>(
  input: ProviderDescriptorInputV1<K>,
): ProviderDescriptorV1<K> {
  const root = readClosedRecord(input, [
    'kind',
    'adapterKey',
    'capabilities',
    'dataHandling',
    'resilience',
    'exit',
  ]);
  if (
    root === undefined ||
    !providerKinds.has(root['kind'] as ProviderKindV1) ||
    !isSafeToken(root['adapterKey'])
  ) {
    throw new ProviderContractErrorV1();
  }
  const kind = root['kind'] as K;
  const rawCapabilities = readArray(root['capabilities'], 32);
  if (rawCapabilities === undefined || rawCapabilities.length === 0) {
    throw new ProviderContractErrorV1();
  }
  const capabilities: ProviderCapabilityV1[] = [];
  const operations = new Set<string>();
  for (const rawCapability of rawCapabilities) {
    const capability = readClosedRecord(rawCapability, [
      'operation',
      'idempotency',
      'cancellation',
      'timeoutMs',
      'maxAttempts',
    ]);
    if (
      capability === undefined ||
      !providerOperations.has(capability['operation'] as ProviderOperationV1) ||
      operations.has(capability['operation'] as string) ||
      !idempotencyValues.has(capability['idempotency'] as ProviderIdempotencyV1) ||
      !cancellationValues.has(capability['cancellation'] as ProviderCancellationV1) ||
      !isPositiveInteger(capability['timeoutMs'], 300_000) ||
      !isPositiveInteger(capability['maxAttempts'], 20)
    ) {
      throw new ProviderContractErrorV1();
    }
    operations.add(capability['operation'] as string);
    capabilities.push({
      operation: capability['operation'] as ProviderOperationV1,
      idempotency: capability['idempotency'] as ProviderIdempotencyV1,
      cancellation: capability['cancellation'] as ProviderCancellationV1,
      timeoutMs: capability['timeoutMs'],
      maxAttempts: capability['maxAttempts'],
    });
  }
  if (!sameStringSet(operations, new Set(PROVIDER_OPERATIONS_BY_KIND_V1[kind]))) {
    throw new ProviderContractErrorV1();
  }

  const dataHandling = readClosedRecord(root['dataHandling'], [
    'regions',
    'contentRetention',
    'maximumRetentionSeconds',
    'trainingUse',
  ]);
  const rawRegions =
    dataHandling === undefined ? undefined : readArray(dataHandling['regions'], 32);
  if (
    dataHandling === undefined ||
    rawRegions === undefined ||
    rawRegions.length === 0 ||
    rawRegions.some((region) => !isRegion(region)) ||
    new Set(rawRegions).size !== rawRegions.length ||
    !contentRetentionValues.has(dataHandling['contentRetention'] as ProviderContentRetentionV1) ||
    !trainingUseValues.has(dataHandling['trainingUse'] as ProviderTrainingUseV1)
  ) {
    throw new ProviderContractErrorV1();
  }
  const retention = dataHandling['contentRetention'] as ProviderContentRetentionV1;
  const maximumRetentionSeconds = dataHandling['maximumRetentionSeconds'];
  if (
    (retention === 'none' && maximumRetentionSeconds !== undefined) ||
    (retention === 'transient' && !isPositiveInteger(maximumRetentionSeconds, 31_536_000)) ||
    ((retention === 'durable' || retention === 'provider_policy') &&
      maximumRetentionSeconds !== undefined &&
      !isPositiveInteger(maximumRetentionSeconds))
  ) {
    throw new ProviderContractErrorV1();
  }
  const trainingUse = dataHandling['trainingUse'] as ProviderTrainingUseV1;
  if (
    (kind === 'ai' && trainingUse === 'not_applicable') ||
    (kind !== 'ai' && trainingUse !== 'not_applicable')
  ) {
    throw new ProviderContractErrorV1();
  }

  const resilience = readClosedRecord(root['resilience'], ['failover', 'degradedBehavior']);
  const exit = readClosedRecord(root['exit'], [
    'statePortability',
    'exportFormat',
    'credentialRevocation',
  ]);
  if (
    resilience === undefined ||
    exit === undefined ||
    !failoverValues.has(resilience['failover'] as ProviderFailoverV1) ||
    !degradedBehaviorValues.has(resilience['degradedBehavior'] as ProviderDegradedBehaviorV1) ||
    !statePortabilityValues.has(exit['statePortability'] as ProviderStatePortabilityV1) ||
    !isSafeToken(exit['exportFormat']) ||
    !credentialRevocationValues.has(exit['credentialRevocation'] as ProviderCredentialRevocationV1)
  ) {
    throw new ProviderContractErrorV1();
  }
  const statePortability = exit['statePortability'] as ProviderStatePortabilityV1;
  const statefulKind = new Set<ProviderKindV1>([
    'object-storage',
    'email',
    'push',
    'payments',
    'secrets',
  ]).has(kind);
  if (
    (statePortability === 'none' && exit['exportFormat'] !== 'not-applicable') ||
    (statePortability !== 'none' && exit['exportFormat'] === 'not-applicable') ||
    (statefulKind && statePortability === 'none') ||
    (!statefulKind && statePortability !== 'none') ||
    (kind === 'secrets' && exit['credentialRevocation'] === 'not_applicable')
  ) {
    throw new ProviderContractErrorV1();
  }

  return deepFreeze({
    schemaVersion: PROVIDER_PORT_SCHEMA_VERSION_V1,
    kind,
    adapterKey: root['adapterKey'],
    capabilities,
    dataHandling: {
      regions: rawRegions as string[],
      contentRetention: retention,
      ...(maximumRetentionSeconds === undefined
        ? {}
        : { maximumRetentionSeconds: maximumRetentionSeconds as number }),
      trainingUse,
    },
    resilience: {
      failover: resilience['failover'] as ProviderFailoverV1,
      degradedBehavior: resilience['degradedBehavior'] as ProviderDegradedBehaviorV1,
    },
    exit: {
      statePortability,
      exportFormat: exit['exportFormat'],
      credentialRevocation: exit['credentialRevocation'] as ProviderCredentialRevocationV1,
    },
  });
}

export interface ProviderAbortSignalV1 {
  readonly aborted: boolean;
}

export interface ProviderInvocationContextInputV1 {
  readonly operation: ProviderOperationV1;
  readonly operationId: string;
  readonly correlationId: string;
  readonly deadlineAt: string;
  readonly timeoutMs: number;
  readonly idempotencyKey?: string;
  readonly abortSignal: ProviderAbortSignalV1;
}

export type ProviderInvocationContextV1 = ProviderInvocationContextInputV1;

const invocationContexts = new WeakSet<object>();

export function createProviderInvocationContextV1(
  input: ProviderInvocationContextInputV1,
): ProviderInvocationContextV1 {
  const record = readClosedRecord(input, [
    'operation',
    'operationId',
    'correlationId',
    'deadlineAt',
    'timeoutMs',
    'idempotencyKey',
    'abortSignal',
  ]);
  const abortRecord =
    record === undefined ? undefined : readClosedRecord(record['abortSignal'], ['aborted']);
  if (
    record === undefined ||
    !providerOperations.has(record['operation'] as ProviderOperationV1) ||
    !isSafeToken(record['operationId']) ||
    !isSafeToken(record['correlationId']) ||
    !isUtcTimestamp(record['deadlineAt']) ||
    !isPositiveInteger(record['timeoutMs'], 300_000) ||
    (record['idempotencyKey'] !== undefined && !isSafeToken(record['idempotencyKey'])) ||
    abortRecord === undefined ||
    typeof abortRecord['aborted'] !== 'boolean'
  ) {
    throw createProviderFailureV1({
      code: 'INVALID_REQUEST',
      operation: 'contract-validation',
      retryable: false,
    });
  }

  const sourceAbortSignal = record['abortSignal'] as object;
  const abortSignal: ProviderAbortSignalV1 = Object.freeze({
    get aborted(): boolean {
      try {
        const descriptor = Reflect.getOwnPropertyDescriptor(sourceAbortSignal, 'aborted');
        return descriptor === undefined || !('value' in descriptor) || descriptor.value !== false;
      } catch {
        return true;
      }
    },
  });
  const context = deepFreeze({
    operation: record['operation'] as ProviderOperationV1,
    operationId: record['operationId'],
    correlationId: record['correlationId'],
    deadlineAt: record['deadlineAt'],
    timeoutMs: record['timeoutMs'],
    ...(record['idempotencyKey'] === undefined ? {} : { idempotencyKey: record['idempotencyKey'] }),
    abortSignal,
  });
  invocationContexts.add(context);
  return context;
}

export interface ProviderFailureInputV1 {
  readonly code: ProviderErrorCodeV1;
  readonly providerKind?: ProviderKindV1;
  readonly operation: ProviderOperationV1;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
}

interface NormalizedProviderFailureV1 extends ProviderFailureInputV1 {
  readonly safeMessageKey: string;
}

const providerErrorFactoryToken = Symbol('ProviderOperationErrorV1.factory');

export class ProviderOperationErrorV1 extends Error {
  public readonly code: ProviderErrorCodeV1;
  public readonly providerKind?: ProviderKindV1;
  public readonly operation: ProviderOperationV1;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly safeMessageKey: string;

  private constructor(token: symbol, input: NormalizedProviderFailureV1) {
    if (token !== providerErrorFactoryToken) throw new TypeError('Use createProviderFailureV1.');
    super('Provider operation failed.');
    this.name = 'ProviderOperationErrorV1';
    this.code = input.code;
    if (input.providerKind !== undefined) this.providerKind = input.providerKind;
    this.operation = input.operation;
    this.retryable = input.retryable;
    if (input.retryAfterMs !== undefined) this.retryAfterMs = input.retryAfterMs;
    this.safeMessageKey = input.safeMessageKey;
    Object.freeze(this);
  }

  public toJSON(): Readonly<{
    name: string;
    code: ProviderErrorCodeV1;
    providerKind?: ProviderKindV1;
    operation: ProviderOperationV1;
    retryable: boolean;
    retryAfterMs?: number;
    safeMessageKey: string;
  }> {
    return Object.freeze({
      name: this.name,
      code: this.code,
      ...(this.providerKind === undefined ? {} : { providerKind: this.providerKind }),
      operation: this.operation,
      retryable: this.retryable,
      ...(this.retryAfterMs === undefined ? {} : { retryAfterMs: this.retryAfterMs }),
      safeMessageKey: this.safeMessageKey,
    });
  }
}

function constructProviderError(input: NormalizedProviderFailureV1): ProviderOperationErrorV1 {
  const FactoryConstructor = ProviderOperationErrorV1 as unknown as new (
    token: symbol,
    normalized: NormalizedProviderFailureV1,
  ) => ProviderOperationErrorV1;
  return new FactoryConstructor(providerErrorFactoryToken, input);
}

function fallbackProviderError(): ProviderOperationErrorV1 {
  return constructProviderError({
    code: 'UNKNOWN',
    operation: 'contract-validation',
    retryable: false,
    safeMessageKey: errorMessageKeys.UNKNOWN,
  });
}

export function createProviderFailureV1(input: ProviderFailureInputV1): ProviderOperationErrorV1 {
  if (!isObject(input)) return fallbackProviderError();
  let keys: readonly (string | symbol)[];
  try {
    if (Array.isArray(input)) return fallbackProviderError();
    keys = Reflect.ownKeys(input);
  } catch {
    return fallbackProviderError();
  }
  const allowed = new Set(['code', 'providerKind', 'operation', 'retryable', 'retryAfterMs']);
  const record: UnknownRecord = Object.create(null) as UnknownRecord;
  for (const key of keys) {
    if (key === 'providerCause') continue;
    if (typeof key !== 'string' || !allowed.has(key)) return fallbackProviderError();
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Reflect.getOwnPropertyDescriptor(input, key);
    } catch {
      return fallbackProviderError();
    }
    if (descriptor === undefined || !('value' in descriptor)) return fallbackProviderError();
    record[key] = descriptor.value;
  }
  if (
    !errorCodes.has(record['code'] as ProviderErrorCodeV1) ||
    (record['providerKind'] !== undefined &&
      !providerKinds.has(record['providerKind'] as ProviderKindV1)) ||
    !providerOperations.has(record['operation'] as ProviderOperationV1) ||
    typeof record['retryable'] !== 'boolean' ||
    (record['retryAfterMs'] !== undefined && !isPositiveInteger(record['retryAfterMs'], 86_400_000))
  ) {
    return fallbackProviderError();
  }
  const code = record['code'] as ProviderErrorCodeV1;
  const retryable = record['retryable'];
  if (
    (nonRetryableErrorCodes.has(code) && retryable) ||
    (record['retryAfterMs'] !== undefined && !retryable)
  ) {
    return fallbackProviderError();
  }
  return constructProviderError({
    code,
    ...(record['providerKind'] === undefined
      ? {}
      : { providerKind: record['providerKind'] as ProviderKindV1 }),
    operation: record['operation'] as ProviderOperationV1,
    retryable,
    ...(record['retryAfterMs'] === undefined ? {} : { retryAfterMs: record['retryAfterMs'] }),
    safeMessageKey: errorMessageKeys[code],
  });
}

function invalidInvocation(): ProviderOperationErrorV1 {
  return createProviderFailureV1({
    code: 'INVALID_REQUEST',
    operation: 'contract-validation',
    retryable: false,
  });
}

export function assertProviderInvocationActiveV1(
  context: ProviderInvocationContextV1,
  now: string,
): void {
  if (!isObject(context) || !invocationContexts.has(context) || !isUtcTimestamp(now)) {
    throw invalidInvocation();
  }
  if (context.abortSignal.aborted) {
    throw createProviderFailureV1({
      code: 'ABORTED',
      operation: context.operation,
      retryable: false,
    });
  }
  if (Date.parse(now) >= Date.parse(context.deadlineAt)) {
    throw createProviderFailureV1({
      code: 'TIMEOUT',
      operation: context.operation,
      retryable: true,
    });
  }
}

export function requireProviderIdempotencyV1(context: ProviderInvocationContextV1): string {
  if (
    !isObject(context) ||
    !invocationContexts.has(context) ||
    !isSafeToken(context.idempotencyKey)
  ) {
    throw invalidInvocation();
  }
  return context.idempotencyKey;
}

export interface ProviderHealthInputV1 {
  readonly status: ProviderHealthStatusV1;
  readonly checkedAt: string;
  readonly latencyMs?: number;
  readonly safeReasonCodes: readonly string[];
}

export type ProviderHealthV1 = ProviderHealthInputV1;

export function defineProviderHealthV1(input: ProviderHealthInputV1): ProviderHealthV1 {
  const record = readClosedRecord(input, ['status', 'checkedAt', 'latencyMs', 'safeReasonCodes']);
  const reasons = record === undefined ? undefined : readArray(record['safeReasonCodes'], 16);
  if (
    record === undefined ||
    !(['healthy', 'degraded', 'unavailable'] as const).includes(
      record['status'] as ProviderHealthStatusV1,
    ) ||
    !isUtcTimestamp(record['checkedAt']) ||
    (record['latencyMs'] !== undefined &&
      (!Number.isSafeInteger(record['latencyMs']) || (record['latencyMs'] as number) < 0)) ||
    reasons === undefined ||
    reasons.some((code) => typeof code !== 'string' || !healthReasonCodes.has(code)) ||
    new Set(reasons).size !== reasons.length ||
    (record['status'] === 'healthy' && reasons.length !== 0) ||
    (record['status'] !== 'healthy' && reasons.length === 0)
  ) {
    throw new ProviderContractErrorV1();
  }
  return deepFreeze({
    status: record['status'] as ProviderHealthStatusV1,
    checkedAt: record['checkedAt'],
    ...(record['latencyMs'] === undefined ? {} : { latencyMs: record['latencyMs'] as number }),
    safeReasonCodes: reasons as string[],
  });
}

const secretReferenceBrandV1: unique symbol = Symbol('SecretReferenceV1');

export interface SecretReferenceV1 {
  readonly [secretReferenceBrandV1]: true;
  readonly kind: 'secret-reference';
  readonly namespace: string;
  readonly pathSegments: readonly string[];
  readonly version?: string;
  toString(): '[REDACTED_SECRET_REFERENCE]';
  toJSON(): '[REDACTED_SECRET_REFERENCE]';
}

const secretReferences = new WeakSet<object>();
const secretSegmentPattern = /^[a-z0-9][a-z0-9._-]{0,62}$/;

export function defineSecretReferenceV1(input: {
  readonly namespace: string;
  readonly pathSegments: readonly string[];
  readonly version?: string;
}): SecretReferenceV1 {
  const record = readClosedRecord(input, ['namespace', 'pathSegments', 'version']);
  const segments = record === undefined ? undefined : readArray(record['pathSegments'], 32);
  if (
    record === undefined ||
    typeof record['namespace'] !== 'string' ||
    !secretSegmentPattern.test(record['namespace']) ||
    record['namespace'] === '.' ||
    record['namespace'] === '..' ||
    segments === undefined ||
    segments.length === 0 ||
    segments.some(
      (segment) =>
        typeof segment !== 'string' ||
        !secretSegmentPattern.test(segment) ||
        segment === '.' ||
        segment === '..',
    ) ||
    (record['version'] !== undefined &&
      (typeof record['version'] !== 'string' || !secretSegmentPattern.test(record['version'])))
  ) {
    throw new ProviderContractErrorV1();
  }
  const reference: SecretReferenceV1 = deepFreeze({
    [secretReferenceBrandV1]: true,
    kind: 'secret-reference',
    namespace: record['namespace'],
    pathSegments: segments as string[],
    ...(record['version'] === undefined ? {} : { version: record['version'] }),
    toString: () => '[REDACTED_SECRET_REFERENCE]',
    toJSON: () => '[REDACTED_SECRET_REFERENCE]',
  });
  secretReferences.add(reference);
  return reference;
}

const secretHandleBrandV1: unique symbol = Symbol('SecretHandleV1');

export interface SecretHandleV1 {
  readonly [secretHandleBrandV1]: true;
  readonly kind: 'secret-handle';
  readonly reference: SecretReferenceV1;
  readonly expiresAt?: string;
  toString(): '[REDACTED_SECRET_HANDLE]';
  toJSON(): '[REDACTED_SECRET_HANDLE]';
}

export function defineSecretHandleV1(input: {
  readonly reference: SecretReferenceV1;
  readonly expiresAt?: string;
}): SecretHandleV1 {
  const record = readClosedRecord(input, ['reference', 'expiresAt']);
  if (
    record === undefined ||
    !isObject(record['reference']) ||
    !secretReferences.has(record['reference']) ||
    (record['expiresAt'] !== undefined && !isUtcTimestamp(record['expiresAt']))
  ) {
    throw new ProviderContractErrorV1();
  }
  return deepFreeze({
    [secretHandleBrandV1]: true,
    kind: 'secret-handle',
    reference: record['reference'] as SecretReferenceV1,
    ...(record['expiresAt'] === undefined ? {} : { expiresAt: record['expiresAt'] }),
    toString: () => '[REDACTED_SECRET_HANDLE]',
    toJSON: () => '[REDACTED_SECRET_HANDLE]',
  });
}
