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
  readonly operation: string;
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

const providerKinds = new Set<ProviderKindV1>([
  'object-storage',
  'email',
  'push',
  'ocr',
  'ai',
  'payments',
  'telemetry',
  'secrets',
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCapabilityArray(value: unknown): value is readonly ProviderCapabilityV1[] {
  return Array.isArray(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSafeToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 200 &&
    value.trim() === value &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value)
  );
}

function isPositiveInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= maximum;
}

function isUtcTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/.test(
      value,
    ) &&
    !Number.isNaN(Date.parse(value))
  );
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function defineProviderDescriptorV1<K extends ProviderKindV1>(
  input: ProviderDescriptorInputV1<K>,
): ProviderDescriptorV1<K> {
  if (
    !isRecord(input) ||
    !providerKinds.has(input.kind) ||
    !isSafeToken(input.adapterKey) ||
    !isCapabilityArray(input.capabilities) ||
    input.capabilities.length === 0 ||
    !isRecord(input.dataHandling) ||
    !isRecord(input.resilience) ||
    !isRecord(input.exit)
  ) {
    throw new ProviderContractErrorV1();
  }

  const operations = new Set<string>();
  for (const capability of input.capabilities) {
    if (
      !isRecord(capability) ||
      !isSafeToken(capability['operation']) ||
      operations.has(capability['operation']) ||
      !idempotencyValues.has(capability['idempotency']) ||
      !cancellationValues.has(capability['cancellation']) ||
      !isPositiveInteger(capability['timeoutMs'], 300_000) ||
      !isPositiveInteger(capability['maxAttempts'], 20)
    ) {
      throw new ProviderContractErrorV1();
    }
    operations.add(capability['operation']);
  }

  const dataHandling = input.dataHandling;
  if (
    !isStringArray(dataHandling.regions) ||
    dataHandling.regions.length === 0 ||
    dataHandling.regions.some((region) => !isSafeToken(region)) ||
    !contentRetentionValues.has(dataHandling.contentRetention) ||
    !trainingUseValues.has(dataHandling.trainingUse) ||
    (dataHandling.maximumRetentionSeconds !== undefined &&
      !isPositiveInteger(dataHandling.maximumRetentionSeconds))
  ) {
    throw new ProviderContractErrorV1();
  }

  if (
    !failoverValues.has(input.resilience.failover) ||
    !degradedBehaviorValues.has(input.resilience.degradedBehavior) ||
    !statePortabilityValues.has(input.exit.statePortability) ||
    !isSafeToken(input.exit.exportFormat) ||
    !credentialRevocationValues.has(input.exit.credentialRevocation)
  ) {
    throw new ProviderContractErrorV1();
  }

  return deepFreeze({
    schemaVersion: PROVIDER_PORT_SCHEMA_VERSION_V1,
    kind: input.kind,
    adapterKey: input.adapterKey,
    capabilities: input.capabilities.map((capability) => ({
      operation: capability.operation,
      idempotency: capability.idempotency,
      cancellation: capability.cancellation,
      timeoutMs: capability.timeoutMs,
      maxAttempts: capability.maxAttempts,
    })),
    dataHandling: {
      regions: [...input.dataHandling.regions],
      contentRetention: input.dataHandling.contentRetention,
      ...(input.dataHandling.maximumRetentionSeconds === undefined
        ? {}
        : { maximumRetentionSeconds: input.dataHandling.maximumRetentionSeconds }),
      trainingUse: input.dataHandling.trainingUse,
    },
    resilience: { ...input.resilience },
    exit: { ...input.exit },
  });
}

export interface ProviderAbortSignalV1 {
  readonly aborted: boolean;
}

export interface ProviderInvocationContextInputV1 {
  readonly operationId: string;
  readonly correlationId: string;
  readonly deadlineAt: string;
  readonly timeoutMs: number;
  readonly idempotencyKey?: string;
  readonly abortSignal: ProviderAbortSignalV1;
}

export type ProviderInvocationContextV1 = ProviderInvocationContextInputV1;

export function createProviderInvocationContextV1(
  input: ProviderInvocationContextInputV1,
): ProviderInvocationContextV1 {
  if (
    !isRecord(input) ||
    !isSafeToken(input.operationId) ||
    !isSafeToken(input.correlationId) ||
    !isUtcTimestamp(input.deadlineAt) ||
    !isPositiveInteger(input.timeoutMs, 300_000) ||
    (input.idempotencyKey !== undefined && !isSafeToken(input.idempotencyKey)) ||
    !isRecord(input.abortSignal) ||
    typeof input.abortSignal.aborted !== 'boolean'
  ) {
    throw createProviderFailureV1({
      code: 'INVALID_REQUEST',
      operation: 'create-invocation-context',
      retryable: false,
      safeMessageKey: 'provider.invalid_request',
    });
  }

  const sourceAbortSignal = input.abortSignal;
  const abortSignal: ProviderAbortSignalV1 = Object.freeze({
    get aborted() {
      return sourceAbortSignal.aborted;
    },
  });

  return deepFreeze({
    operationId: input.operationId,
    correlationId: input.correlationId,
    deadlineAt: input.deadlineAt,
    timeoutMs: input.timeoutMs,
    ...(input.idempotencyKey === undefined ? {} : { idempotencyKey: input.idempotencyKey }),
    abortSignal,
  });
}

export interface ProviderFailureInputV1 {
  readonly code: ProviderErrorCodeV1;
  readonly providerKind?: ProviderKindV1;
  readonly operation: string;
  readonly retryable: boolean;
  readonly retryAfterMs?: number;
  readonly safeMessageKey: string;
  readonly providerCause?: unknown;
}

export class ProviderOperationErrorV1 extends Error {
  public readonly code: ProviderErrorCodeV1;
  public readonly providerKind?: ProviderKindV1;
  public readonly operation: string;
  public readonly retryable: boolean;
  public readonly retryAfterMs?: number;
  public readonly safeMessageKey: string;

  public constructor(input: Omit<ProviderFailureInputV1, 'providerCause'>) {
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

  public toJSON(): Readonly<Record<string, unknown>> {
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

export function createProviderFailureV1(input: ProviderFailureInputV1): ProviderOperationErrorV1 {
  void input.providerCause;
  if (
    !errorCodes.has(input.code) ||
    (input.providerKind !== undefined && !providerKinds.has(input.providerKind)) ||
    !isSafeToken(input.operation) ||
    typeof input.retryable !== 'boolean' ||
    (input.retryAfterMs !== undefined && !isPositiveInteger(input.retryAfterMs, 86_400_000)) ||
    !isSafeToken(input.safeMessageKey)
  ) {
    return new ProviderOperationErrorV1({
      code: 'UNKNOWN',
      operation: 'invalid-provider-failure',
      retryable: false,
      safeMessageKey: 'provider.unknown',
    });
  }
  return new ProviderOperationErrorV1(input);
}

export function assertProviderInvocationActiveV1(
  context: ProviderInvocationContextV1,
  now: string,
): void {
  if (context.abortSignal.aborted) {
    throw createProviderFailureV1({
      code: 'ABORTED',
      operation: context.operationId,
      retryable: false,
      safeMessageKey: 'provider.aborted',
    });
  }
  if (!isUtcTimestamp(now) || Date.parse(now) >= Date.parse(context.deadlineAt)) {
    throw createProviderFailureV1({
      code: 'TIMEOUT',
      operation: context.operationId,
      retryable: true,
      safeMessageKey: 'provider.timeout',
    });
  }
}

export function requireProviderIdempotencyV1(context: ProviderInvocationContextV1): string {
  if (!isSafeToken(context.idempotencyKey)) {
    throw createProviderFailureV1({
      code: 'INVALID_REQUEST',
      operation: context.operationId,
      retryable: false,
      safeMessageKey: 'provider.idempotency_required',
    });
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
  if (
    !(['healthy', 'degraded', 'unavailable'] as const).includes(input.status) ||
    !isUtcTimestamp(input.checkedAt) ||
    (input.latencyMs !== undefined &&
      (!Number.isSafeInteger(input.latencyMs) || input.latencyMs < 0)) ||
    !isStringArray(input.safeReasonCodes) ||
    input.safeReasonCodes.some((code) => !isSafeToken(code))
  ) {
    throw new ProviderContractErrorV1();
  }
  return deepFreeze({
    status: input.status,
    checkedAt: input.checkedAt,
    ...(input.latencyMs === undefined ? {} : { latencyMs: input.latencyMs }),
    safeReasonCodes: input.safeReasonCodes.map((code) => code),
  });
}

export interface SecretHandleV1 {
  readonly kind: 'secret-handle';
  readonly expiresAt?: string;
  toString(): '[REDACTED_SECRET_HANDLE]';
  toJSON(): '[REDACTED_SECRET_HANDLE]';
}

const secretHandleIds = new WeakMap<SecretHandleV1, string>();

export function defineSecretHandleV1(input: {
  readonly handleId: string;
  readonly expiresAt?: string;
}): SecretHandleV1 {
  if (
    !isSafeToken(input.handleId) ||
    (input.expiresAt !== undefined && !isUtcTimestamp(input.expiresAt))
  ) {
    throw new ProviderContractErrorV1();
  }
  const handle: SecretHandleV1 = {
    kind: 'secret-handle',
    ...(input.expiresAt === undefined ? {} : { expiresAt: input.expiresAt }),
    toString: () => '[REDACTED_SECRET_HANDLE]',
    toJSON: () => '[REDACTED_SECRET_HANDLE]',
  };
  secretHandleIds.set(handle, input.handleId);
  return Object.freeze(handle);
}

export function secretHandleIdV1(handle: SecretHandleV1): string {
  const id = secretHandleIds.get(handle);
  if (id === undefined) throw new TypeError('Unknown secret handle.');
  return id;
}
