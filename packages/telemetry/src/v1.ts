export const TELEMETRY_SCHEMA_VERSION_V1 = 1 as const;
export const OTEL_SERVICE_NAMESPACE_V1 = 'databreeze' as const;
export const OTEL_CORRELATION_HEADER_V1 = 'x-correlation-id' as const;
export const OTEL_TRACEPARENT_HEADER_V1 = 'traceparent' as const;

export type TelemetryLevelV1 = 'debug' | 'info' | 'warn' | 'error';
export type TelemetryScalarV1 = string | number | boolean;

export interface CorrelationContextV1 {
  correlationId: string;
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
}

export interface SafeTelemetryAttributesV1 {
  [key: string]: TelemetryScalarV1;
}

export interface TelemetryRecordV1 {
  schemaVersion: typeof TELEMETRY_SCHEMA_VERSION_V1;
  timestamp: string;
  level: TelemetryLevelV1;
  event: string;
  component: string;
  correlationId: string;
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
  attributes: SafeTelemetryAttributesV1;
}

export interface StructuredLoggerOptionsV1 {
  component: string;
  sink?: (record: TelemetryRecordV1) => void;
  clock?: () => Date;
}

/** The canonical list is mirrored by the Python and Kotlin adapters and checked in CI. */
export const SAFE_ATTRIBUTE_KEYS_V1 = Object.freeze([
  'organizationId',
  'workspaceId',
  'projectId',
  'principalId',
  'deviceId',
  'jobId',
  'attemptId',
  'artifactId',
  'artifactVersionId',
  'datasetId',
  'datasetVersionId',
  'processorVersion',
  'protocolVersion',
  'route',
  'operation',
  'outcome',
  'status',
  'reasonCode',
  'errorCode',
  'providerCode',
  'mode',
  'dataClass',
  'durationMs',
  'queueDelayMs',
  'retryCount',
  'itemCount',
  'byteCount',
  'redactedCount',
  'sampled',
] as const);

export type TelemetryAttributeKeyV1 = (typeof SAFE_ATTRIBUTE_KEYS_V1)[number];

const safeAttributeSet = new Set<string>(SAFE_ATTRIBUTE_KEYS_V1);
const identifierAttributeSet = new Set<string>([
  'organizationId',
  'workspaceId',
  'projectId',
  'principalId',
  'deviceId',
  'jobId',
  'attemptId',
  'artifactId',
  'artifactVersionId',
  'datasetId',
  'datasetVersionId',
]);
const numericAttributeSet = new Set<string>([
  'durationMs',
  'queueDelayMs',
  'retryCount',
  'itemCount',
  'byteCount',
  'redactedCount',
]);
const tokenAttributeSet = new Set<string>([
  'processorVersion',
  'protocolVersion',
  'operation',
  'outcome',
  'reasonCode',
  'errorCode',
  'providerCode',
  'mode',
  'dataClass',
]);
const forbiddenKeyPattern =
  /(secret|token|password|credential|private.?key|authorization|cookie|path|filename|file.?name|content|payload|body|value|prompt|question|evidence|snippet|formula|transcript|voice|email|phone|address|comment)/iu;
const unsafeStringPattern =
  /(?:[\\/]|^[a-z]:|:\/\/|[@]|\.(?:xlsx?|csv|pdf|docx?|pptx?|png|jpe?g|gif|zip|json|xml|parquet|txt|log|db|sqlite|avro|orc)$)/iu;
const tokenPattern = /^(?=.*[A-Za-z])[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const routePattern = /^\/?[A-Za-z0-9._~/-]{1,255}$/u;
const correlationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const traceIdPattern = /^(?!0{32}$)[0-9a-f]{32}$/iu;
const spanIdPattern = /^(?!0{16}$)[0-9a-f]{16}$/iu;
const traceFlagsPattern = /^[0-9a-f]{2}$/iu;
const traceParentPattern = /^([0-9a-f]{2})-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/iu;
const eventPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$/u;
const componentPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,5}$/u;
const levelSet = new Set<TelemetryLevelV1>(['debug', 'info', 'warn', 'error']);
const maxStringLength = 256;

export class UnsafeTelemetryAttributeErrorV1 extends Error {
  readonly key: string;

  constructor(key: string) {
    super(`Telemetry attribute is not allowed: ${key}`);
    this.name = 'UnsafeTelemetryAttributeErrorV1';
    this.key = key;
  }
}

function assertBoundedKey(key: string): void {
  if (key.length === 0 || key.length > 64 || !/^[A-Za-z][A-Za-z0-9]*$/u.test(key)) {
    throw new UnsafeTelemetryAttributeErrorV1(key);
  }
}

function safeNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > 1e15) {
    return undefined;
  }
  return value;
}

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeString(key: string, value: string): string | undefined {
  if (value.length > maxStringLength || containsControlCharacter(value)) return undefined;
  if (unsafeStringPattern.test(value)) return undefined;
  if (key === 'route') return routePattern.test(value) ? value : undefined;
  if (!identifierAttributeSet.has(key) && !tokenAttributeSet.has(key)) return undefined;
  return tokenPattern.test(value) ? value : undefined;
}

function safeScalar(key: string, value: unknown): TelemetryScalarV1 | undefined {
  if (key === 'sampled') return typeof value === 'boolean' ? value : undefined;
  if (numericAttributeSet.has(key) || key === 'status') return safeNumber(value);
  if (typeof value !== 'string') return undefined;
  return safeString(key, value);
}

function readOwnDataEntries(input: Record<string, unknown>): {
  entries: Array<[string, unknown]>;
  readable: boolean;
} {
  const entries: Array<[string, unknown]> = [];
  try {
    for (const key of Object.keys(input)) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      if (!descriptor || !('value' in descriptor)) return { entries: [], readable: false };
      entries.push([key, descriptor.value]);
    }
  } catch {
    return { entries: [], readable: false };
  }
  return { entries, readable: true };
}

function ownDataEntries(input: Record<string, unknown>): Array<[string, unknown]> {
  return readOwnDataEntries(input).entries;
}

export function sanitizeTelemetryAttributesV1(
  input: Record<string, unknown>,
): SafeTelemetryAttributesV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: SafeTelemetryAttributesV1 = {};
  for (const [key, value] of ownDataEntries(input)) {
    assertBoundedKey(key);
    if (!safeAttributeSet.has(key)) continue;
    const scalar = safeScalar(key, value);
    if (scalar !== undefined) output[key] = scalar;
  }
  return output;
}

export function assertSafeTelemetryAttributesV1(
  input: Record<string, unknown>,
): asserts input is SafeTelemetryAttributesV1 {
  const readable = readOwnDataEntries(input ?? {});
  if (!readable.readable) throw new UnsafeTelemetryAttributeErrorV1('unreadable');
  for (const [key, value] of readable.entries) {
    assertBoundedKey(key);
    if (forbiddenKeyPattern.test(key) || !safeAttributeSet.has(key)) {
      throw new UnsafeTelemetryAttributeErrorV1(key);
    }
    if (safeScalar(key, value) === undefined) {
      throw new UnsafeTelemetryAttributeErrorV1(key);
    }
  }
}

function assertCorrelationId(value: string): string {
  if (!correlationIdPattern.test(value)) throw new Error('Invalid telemetry correlation ID');
  return value.toLowerCase();
}

function assertTraceId(value: string): string {
  if (!traceIdPattern.test(value)) throw new Error('Invalid telemetry trace ID');
  return value.toLowerCase();
}

function assertSpanId(value: string): string {
  if (!spanIdPattern.test(value)) throw new Error('Invalid telemetry span ID');
  return value.toLowerCase();
}

function assertTraceFlags(value: string): string {
  if (!traceFlagsPattern.test(value)) throw new Error('Invalid telemetry trace flags');
  return value.toLowerCase();
}

export function createCorrelationContextV1(
  input: Partial<CorrelationContextV1> = {},
): CorrelationContextV1 {
  const correlationId = input.correlationId ?? globalThis.crypto.randomUUID();
  const context: CorrelationContextV1 = { correlationId: assertCorrelationId(correlationId) };
  const hasTraceId = input.traceId !== undefined;
  const hasSpanId = input.spanId !== undefined;
  if (hasTraceId !== hasSpanId) throw new Error('Trace and span IDs must be supplied together');
  if (hasTraceId && hasSpanId) {
    context.traceId = assertTraceId(input.traceId as string);
    context.spanId = assertSpanId(input.spanId as string);
    context.traceFlags = assertTraceFlags(input.traceFlags ?? '01');
  } else if (input.traceFlags !== undefined) {
    throw new Error('Trace flags require trace and span IDs');
  }
  return context;
}

export function correlationHeadersV1(context: CorrelationContextV1): Record<string, string> {
  const normalized = createCorrelationContextV1(context);
  const headers: Record<string, string> = {
    [OTEL_CORRELATION_HEADER_V1]: normalized.correlationId,
  };
  if (normalized.traceId && normalized.spanId) {
    headers[OTEL_TRACEPARENT_HEADER_V1] =
      `00-${normalized.traceId}-${normalized.spanId}-${normalized.traceFlags ?? '01'}`;
  }
  return headers;
}

function readSingleHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const values: string[] = [];
  let keys: string[];
  try {
    keys = Object.keys(headers);
  } catch {
    throw new Error(`Unreadable telemetry ${name} header`);
  }
  for (const key of keys) {
    let descriptor: PropertyDescriptor | undefined;
    try {
      descriptor = Object.getOwnPropertyDescriptor(headers, key);
    } catch {
      throw new Error(`Unreadable telemetry ${name} header`);
    }
    if (!descriptor || !('value' in descriptor))
      throw new Error(`Unreadable telemetry ${name} header`);
    const value = descriptor.value as string | string[] | undefined;
    if (key.toLowerCase() !== name) continue;
    let arrayValue = false;
    try {
      arrayValue = Array.isArray(value);
    } catch {
      throw new Error(`Unreadable telemetry ${name} header`);
    }
    if (arrayValue) {
      let valid = false;
      try {
        valid = Array.prototype.every.call(value, (item: unknown) => typeof item === 'string');
      } catch {
        throw new Error(`Unreadable telemetry ${name} header`);
      }
      if (!valid) {
        throw new Error(`Unreadable telemetry ${name} header`);
      }
      try {
        values.push(...(value as string[]));
      } catch {
        throw new Error(`Unreadable telemetry ${name} header`);
      }
    } else if (value !== undefined) {
      if (typeof value !== 'string') throw new Error(`Unreadable telemetry ${name} header`);
      values.push(value);
    }
  }
  if (values.length > 1) throw new Error(`Ambiguous telemetry ${name} header`);
  if (values.length === 0) return undefined;
  const value = values[0];
  if (!value) throw new Error(`Empty telemetry ${name} header`);
  return value;
}

export function correlationFromHeadersV1(
  headers: Record<string, string | string[] | undefined>,
): CorrelationContextV1 {
  const correlationId = readSingleHeader(headers, OTEL_CORRELATION_HEADER_V1);
  if (!correlationId) throw new Error('Missing telemetry correlation ID');
  const traceParent = readSingleHeader(headers, OTEL_TRACEPARENT_HEADER_V1);
  if (traceParent === undefined) return createCorrelationContextV1({ correlationId });
  const match = traceParent.match(traceParentPattern);
  if (!match || match[1]?.toLowerCase() === 'ff') {
    throw new Error('Invalid telemetry traceparent');
  }
  const traceId = match[2];
  const spanId = match[3];
  const traceFlags = match[4];
  if (traceId === undefined || spanId === undefined || traceFlags === undefined) {
    throw new Error('Invalid telemetry traceparent');
  }
  return createCorrelationContextV1({
    correlationId,
    traceId,
    spanId,
    traceFlags,
  });
}

export function createStructuredLoggerV1(options: StructuredLoggerOptionsV1) {
  if (!componentPattern.test(options.component)) throw new Error('Invalid telemetry component');
  const sink = options.sink ?? ((record: TelemetryRecordV1) => console.log(JSON.stringify(record)));
  const clock = options.clock ?? (() => new Date());
  return {
    emit(
      level: TelemetryLevelV1,
      event: string,
      correlation: CorrelationContextV1,
      attributes: Record<string, unknown> = {},
    ): TelemetryRecordV1 {
      if (!levelSet.has(level)) throw new Error('Invalid telemetry level');
      if (!eventPattern.test(event)) throw new Error('Invalid telemetry event');
      const normalized = createCorrelationContextV1(correlation);
      const record: TelemetryRecordV1 = {
        schemaVersion: TELEMETRY_SCHEMA_VERSION_V1,
        timestamp: clock().toISOString(),
        level,
        event,
        component: options.component,
        correlationId: normalized.correlationId,
        attributes: sanitizeTelemetryAttributesV1(attributes),
      };
      if (normalized.traceId && normalized.spanId) {
        record.traceId = normalized.traceId;
        record.spanId = normalized.spanId;
        if (normalized.traceFlags !== undefined) record.traceFlags = normalized.traceFlags;
      }
      sink(record);
      return record;
    },
  };
}
