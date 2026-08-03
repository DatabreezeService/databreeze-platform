import assert from 'node:assert/strict';
import test from 'node:test';

import {
  UnsafeTelemetryAttributeErrorV1,
  assertSafeTelemetryAttributesV1,
  correlationFromHeadersV1,
  correlationHeadersV1,
  createCorrelationContextV1,
  createStructuredLoggerV1,
  sanitizeTelemetryAttributesV1,
} from '../src/v1.ts';

const correlationId = '00000000-0000-4000-8000-000000000001';

test('allowlist keeps bounded operational metadata and drops unknown values', () => {
  assert.deepEqual(
    sanitizeTelemetryAttributesV1({
      workspaceId: 'workspace-1',
      outcome: 'success',
      durationMs: 42,
      unknown: 'discarded',
      itemCount: Number.POSITIVE_INFINITY,
    }),
    { workspaceId: 'workspace-1', outcome: 'success', durationMs: 42 },
  );
});

test('strict assertions reject secrets, paths, content, and unbounded values', () => {
  for (const input of [
    { accessToken: 'secret' },
    { path: 'C:\\Users\\someone\\source.xlsx' },
    { outcome: 'x'.repeat(257) },
    { sourceValue: '42' },
    { status: 'C:\\Users\\someone\\source.xlsx' },
    { outcome: 'customer@example.com' },
    { reasonCode: 'invoice total 123' },
    { dataClass: 'source.xlsx' },
  ]) {
    assert.throws(() => assertSafeTelemetryAttributesV1(input), UnsafeTelemetryAttributeErrorV1);
  }
  assert.deepEqual(
    sanitizeTelemetryAttributesV1({
      path: 'C:\\private\\file.xlsx',
      status: 'C:\\private\\file.xlsx',
      outcome: 'customer@example.com',
      reasonCode: 'invoice total 123',
      dataClass: 'source.xlsx',
    }),
    {},
  );
  assert.deepEqual(
    sanitizeTelemetryAttributesV1({ path: 'C:\\private\\file.xlsx', outcome: 'failed' }),
    { outcome: 'failed' },
  );
});

test('telemetry never executes accessor-backed attributes', () => {
  let accessed = false;
  const hostile = {};
  Object.defineProperty(hostile, 'outcome', {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error('hostile getter');
    },
  });

  assert.deepEqual(sanitizeTelemetryAttributesV1(hostile), {});
  assert.throws(() => assertSafeTelemetryAttributesV1(hostile), UnsafeTelemetryAttributeErrorV1);
  assert.equal(accessed, false);
});

test('telemetry never executes accessor-backed correlation headers', () => {
  let accessed = false;
  const hostile = {};
  Object.defineProperty(hostile, 'x-correlation-id', {
    enumerable: true,
    get() {
      accessed = true;
      throw new Error('hostile header getter');
    },
  });
  assert.throws(() => correlationFromHeadersV1(hostile), /Unreadable telemetry/u);
  assert.equal(accessed, false);
});

test('telemetry rejects proxies that fail during reflection without exposing trap errors', () => {
  const hostileAttributes = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error('attribute trap cause');
      },
    },
  );
  assert.deepEqual(sanitizeTelemetryAttributesV1(hostileAttributes), {});
  assert.throws(
    () => assertSafeTelemetryAttributesV1(hostileAttributes),
    (error) => {
      assert.ok(error instanceof UnsafeTelemetryAttributeErrorV1);
      assert.equal(error.key, 'unreadable');
      assert.equal(error.message, 'Telemetry attribute is not allowed: unreadable');
      assert.doesNotMatch(error.message, /attribute trap cause/u);
      return true;
    },
  );

  const hostileHeaders = new Proxy(
    {},
    {
      ownKeys() {
        throw new Error('header trap cause');
      },
    },
  );
  assert.throws(
    () => correlationFromHeadersV1(hostileHeaders),
    (error) => {
      assert.equal(error.message, 'Unreadable telemetry x-correlation-id header');
      assert.doesNotMatch(error.message, /header trap cause/u);
      return true;
    },
  );
});

test('correlation headers round-trip without accepting malformed identifiers', () => {
  const context = createCorrelationContextV1({
    correlationId,
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
    traceFlags: '01',
  });
  const headers = correlationHeadersV1(context);
  assert.deepEqual(correlationFromHeadersV1(headers), context);
  assert.throws(() => createCorrelationContextV1({ correlationId: 'not-a-uuid' }));
  assert.throws(() =>
    createCorrelationContextV1({
      correlationId,
      traceId: '0'.repeat(32),
      spanId: '0123456789abcdef',
    }),
  );
  assert.throws(() =>
    createCorrelationContextV1({
      correlationId,
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0'.repeat(16),
    }),
  );
  assert.throws(() =>
    createCorrelationContextV1({
      correlationId,
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: 'zz',
    }),
  );
  assert.throws(() => correlationFromHeadersV1({}));
  assert.throws(
    () => correlationFromHeadersV1({ 'x-correlation-id': 1 }),
    (error) => {
      assert.equal(error.message, 'Unreadable telemetry x-correlation-id header');
      return true;
    },
  );
  assert.throws(() =>
    correlationFromHeadersV1({ 'x-correlation-id': [correlationId, correlationId] }),
  );
  assert.throws(() =>
    correlationFromHeadersV1({
      'x-correlation-id': correlationId,
      traceparent: [
        '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
        '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      ],
    }),
  );
  assert.deepEqual(
    correlationFromHeadersV1({
      'X-Correlation-Id': correlationId,
      TrAcEpArEnT: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    }),
    context,
  );
  assert.throws(() =>
    correlationFromHeadersV1({
      'x-correlation-id': correlationId,
      traceparent: '00-00000000000000000000000000000000-0123456789abcdef-01',
    }),
  );
  assert.throws(() =>
    correlationFromHeadersV1({
      'x-correlation-id': correlationId,
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-zz',
    }),
  );
});

test('structured logger emits a stable record and never forwards unknown attributes', () => {
  const records = [];
  const logger = createStructuredLoggerV1({
    component: 'api',
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
    sink: (record) => records.push(record),
  });
  const record = logger.emit(
    'info',
    'request.completed',
    { correlationId },
    { status: 200, body: 'never' },
  );
  assert.equal(records.length, 1);
  assert.equal(record.schemaVersion, 1);
  assert.equal(record.timestamp, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(record.attributes, { status: 200 });
});

test('structured logger carries normalized trace context into the record', () => {
  const logger = createStructuredLoggerV1({ component: 'api', sink: () => undefined });
  const record = logger.emit(
    'info',
    'request.completed',
    {
      correlationId,
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: '00',
    },
    {},
  );
  assert.equal(record.traceId, '0123456789abcdef0123456789abcdef');
  assert.equal(record.spanId, '0123456789abcdef');
  assert.equal(record.traceFlags, '00');
});

test('structured logger isolates exporter outages from product workflows', () => {
  const logger = createStructuredLoggerV1({
    component: 'api',
    clock: () => new Date('2026-01-01T00:00:00.000Z'),
    sink() {
      throw new Error('provider cause with customer source value');
    },
  });

  const record = logger.emit(
    'warn',
    'telemetry.export_failed',
    createCorrelationContextV1({ correlationId }),
    { outcome: 'degraded', payload: 'must not be serialized' },
  );

  assert.equal(record.event, 'telemetry.export_failed');
  assert.deepEqual(record.attributes, { outcome: 'degraded' });
  assert.doesNotMatch(JSON.stringify(record), /provider cause|customer source|must not/u);
});
