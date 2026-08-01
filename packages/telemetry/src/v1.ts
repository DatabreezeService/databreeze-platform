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
  attributes: SafeTelemetryAttributesV1;
}

export interface StructuredLoggerOptionsV1 {
  component: string;
  sink?: (record: TelemetryRecordV1) => void;
  clock?: () => Date;
}

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

const safeAttributeSet = new Set<string>(SAFE_ATTRIBUTE_KEYS_V1);
const forbiddenKeyPattern =
  /(secret|token|password|credential|private.?key|authorization|cookie|path|filename|file.?name|content|payload|body|value|prompt|question|evidence|snippet|formula|transcript|voice|email|phone|address|comment)/iu;
const correlationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const traceIdPattern = /^[0-9a-f]{32}$/iu;
const spanIdPattern = /^[0-9a-f]{16}$/iu;
const eventPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,7}$/u;
const componentPattern = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+){0,5}$/u;
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

function safeScalar(key: string, value: unknown): TelemetryScalarV1 | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number')
    return Number.isFinite(value) && Math.abs(value) <= 1e15 ? value : undefined;
  if (typeof value !== 'string' || value.length > maxStringLength) return undefined;
  if (forbiddenKeyPattern.test(key)) throw new UnsafeTelemetryAttributeErrorV1(key);
  if (/[/\\]/u.test(value) && /(id|route|operation|reasonCode|errorCode|providerCode)/u.test(key))
    return undefined;
  return value;
}

export function sanitizeTelemetryAttributesV1(
  input: Record<string, unknown>,
): SafeTelemetryAttributesV1 {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return {};
  const output: SafeTelemetryAttributesV1 = {};
  for (const [key, value] of Object.entries(input)) {
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
  for (const key of Object.keys(input ?? {})) {
    assertBoundedKey(key);
    if (forbiddenKeyPattern.test(key) || !safeAttributeSet.has(key)) {
      throw new UnsafeTelemetryAttributeErrorV1(key);
    }
    const scalar = safeScalar(key, input[key]);
    if (scalar === undefined) throw new UnsafeTelemetryAttributeErrorV1(key);
  }
}

function assertCorrelationId(value: string): string {
  if (!correlationIdPattern.test(value)) throw new Error('Invalid telemetry correlation ID');
  return value.toLowerCase();
}

export function createCorrelationContextV1(
  input: Partial<CorrelationContextV1> = {},
): CorrelationContextV1 {
  const correlationId = input.correlationId ?? globalThis.crypto.randomUUID();
  const context: CorrelationContextV1 = { correlationId: assertCorrelationId(correlationId) };
  if (input.traceId !== undefined) {
    if (!traceIdPattern.test(input.traceId)) throw new Error('Invalid telemetry trace ID');
    context.traceId = input.traceId.toLowerCase();
  }
  if (input.spanId !== undefined) {
    if (!spanIdPattern.test(input.spanId)) throw new Error('Invalid telemetry span ID');
    context.spanId = input.spanId.toLowerCase();
  }
  return context;
}

export function correlationHeadersV1(context: CorrelationContextV1): Record<string, string> {
  const normalized = createCorrelationContextV1(context);
  const headers: Record<string, string> = {
    [OTEL_CORRELATION_HEADER_V1]: normalized.correlationId,
  };
  if (normalized.traceId && normalized.spanId) {
    headers[OTEL_TRACEPARENT_HEADER_V1] = `00-${normalized.traceId}-${normalized.spanId}-01`;
  }
  return headers;
}

export function correlationFromHeadersV1(
  headers: Record<string, string | string[] | undefined>,
): CorrelationContextV1 {
  const correlationHeader =
    headers[OTEL_CORRELATION_HEADER_V1] ?? headers[OTEL_CORRELATION_HEADER_V1.toUpperCase()];
  const correlationId = Array.isArray(correlationHeader) ? correlationHeader[0] : correlationHeader;
  if (!correlationId) throw new Error('Missing telemetry correlation ID');
  const traceParent =
    headers[OTEL_TRACEPARENT_HEADER_V1] ?? headers[OTEL_TRACEPARENT_HEADER_V1.toUpperCase()];
  const traceParentValue = Array.isArray(traceParent) ? traceParent[0] : traceParent;
  const match = traceParentValue?.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/iu);
  const context: Partial<CorrelationContextV1> = { correlationId };
  if (match?.[1]) context.traceId = match[1];
  if (match?.[2]) context.spanId = match[2];
  return createCorrelationContextV1(context);
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
      if (!eventPattern.test(event)) throw new Error('Invalid telemetry event');
      const record: TelemetryRecordV1 = {
        schemaVersion: TELEMETRY_SCHEMA_VERSION_V1,
        timestamp: clock().toISOString(),
        level,
        event,
        component: options.component,
        correlationId: assertCorrelationId(correlation.correlationId),
        attributes: sanitizeTelemetryAttributesV1(attributes),
      };
      sink(record);
      return record;
    },
  };
}
