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
  ]) {
    assert.throws(() => assertSafeTelemetryAttributesV1(input), UnsafeTelemetryAttributeErrorV1);
  }
  assert.deepEqual(
    sanitizeTelemetryAttributesV1({ path: 'C:\\private\\file.xlsx', outcome: 'failed' }),
    { outcome: 'failed' },
  );
});

test('correlation headers round-trip without accepting malformed identifiers', () => {
  const context = createCorrelationContextV1({
    correlationId,
    traceId: '0123456789abcdef0123456789abcdef',
    spanId: '0123456789abcdef',
  });
  const headers = correlationHeadersV1(context);
  assert.deepEqual(correlationFromHeadersV1(headers), context);
  assert.throws(() => createCorrelationContextV1({ correlationId: 'not-a-uuid' }));
  assert.throws(() => correlationFromHeadersV1({}));
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
