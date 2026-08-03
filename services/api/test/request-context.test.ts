import assert from 'node:assert/strict';
import test from 'node:test';

const requestId = '018f1f08-7b2c-7c74-8e12-f639c7c92b15';
const suppliedCorrelationId = '123e4567-e89b-42d3-a456-426614174000';

void test('accepts zero or one valid bounded UUID correlation header and rejects ambiguous or unsafe input', async () => {
  const requestContextModule = await import('../src/platform/http/request-context.js');
  const parseCorrelationHeader = requestContextModule.parseCorrelationHeader;
  const parseTraceparentHeader = requestContextModule.parseTraceparentHeader;
  assert.equal(typeof parseCorrelationHeader, 'function');
  assert.equal(typeof parseTraceparentHeader, 'function');

  assert.deepEqual(parseCorrelationHeader([], requestId), {
    accepted: true,
    correlationId: requestId,
  });
  assert.deepEqual(parseCorrelationHeader([suppliedCorrelationId], requestId), {
    accepted: true,
    correlationId: suppliedCorrelationId,
  });
  for (const values of [
    ['not-a-uuid'],
    [suppliedCorrelationId, requestId],
    [`${suppliedCorrelationId}\r\nleaked-marker`],
    ['a'.repeat(129)],
  ]) {
    assert.deepEqual(parseCorrelationHeader(values, requestId), { accepted: false });
  }

  assert.deepEqual(
    parseTraceparentHeader(['00-0123456789abcdef0123456789abcdef-0123456789abcdef-01']),
    {
      accepted: true,
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: '01',
    },
  );
  for (const values of [
    ['not-a-traceparent'],
    ['00-00000000000000000000000000000000-0123456789abcdef-01'],
    ['00-0123456789abcdef0123456789abcdef-0000000000000000-01'],
    ['ff-0123456789abcdef0123456789abcdef-0123456789abcdef-01'],
    [
      '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
      '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    ],
  ]) {
    assert.deepEqual(parseTraceparentHeader(values), { accepted: false });
  }
});
