import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';

test('canonicalizes full BCP 47 locales and ignores structurally malformed ranges', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');

  assert.equal(negotiateLocaleV1('en-US-u-ca-gregory'), 'en');
  assert.equal(negotiateLocaleV1({ userLocale: 'EN-us-u-CA-gregory', acceptLanguage: 'vi' }), 'en');
  assert.equal(negotiateLocaleV1('en-US-u-ca-gregory;q=0.8,vi;q=0.7'), 'en');
  assert.equal(negotiateLocaleV1('en-1a'), 'vi-VN');
  assert.equal(negotiateLocaleV1('en-1a;q=1,vi;q=0.5'), 'vi-VN');
});

test('scores explicit locale ranges before wildcard fallback', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');

  assert.equal(negotiateLocaleV1('vi;q=0.1,*;q=0.9,en;q=0.4'), 'en');
  assert.equal(negotiateLocaleV1('vi;q=0,*;q=0.9'), 'en');
  assert.equal(negotiateLocaleV1('vi;q=0,en;q=0,*;q=1'), 'vi-VN');
  assert.equal(negotiateLocaleV1('en;q=0.2,en-US;q=0.8,vi;q=0.7'), 'en');
  assert.equal(negotiateLocaleV1('en;q=0.9,en-US;q=0.2,vi;q=0.5'), 'vi-VN');
  assert.equal(negotiateLocaleV1('vi;q=0.8,en;q=0.8'), 'vi-VN');
  assert.equal(negotiateLocaleV1('en;q=0.8,vi;q=0.8'), 'en');
});

test('reads Date instances through the built-in intrinsic and bounds hostile failures', async () => {
  const { formatDateTimeV1, I18nErrorV1 } = await import('../src/v1.ts');
  let overrideCalls = 0;
  class HostileDate extends Date {
    getTime() {
      overrideCalls += 1;
      throw new Error('date-marker-must-not-run');
    }
  }

  assert.match(
    formatDateTimeV1(new HostileDate('2026-08-01T17:30:00.000Z'), {
      locale: 'en',
      timeZone: 'UTC',
    }),
    /2026/u,
  );
  assert.equal(overrideCalls, 0);

  const hostileProxy = new Proxy(new Date(0), {
    get() {
      throw new Error('date-proxy-marker');
    },
  });
  const { proxy: revokedDate, revoke } = Proxy.revocable(new Date(0), {});
  revoke();
  for (const value of [hostileProxy, revokedDate]) {
    assert.throws(
      () => formatDateTimeV1(value, { locale: 'en', timeZone: 'UTC' }),
      (error) => {
        assert.equal(error instanceof I18nErrorV1, true);
        assert.equal(error.code, 'INVALID_DATE');
        assert.doesNotMatch(inspect(error), /date-(?:proxy-)?marker/u);
        return true;
      },
    );
  }
});

test('snapshots list items without holes, accessors, extra keys, or caller iterators', async () => {
  const { formatListV1, I18nErrorV1 } = await import('../src/v1.ts');
  let accessorCalls = 0;
  const accessorList = ['safe'];
  Object.defineProperty(accessorList, '0', {
    enumerable: true,
    get() {
      accessorCalls += 1;
      throw new Error('list-accessor-marker');
    },
  });
  const sparse = new Array(2);
  sparse[1] = 'Android';
  const extra = ['Web'];
  extra.metadata = 'must not survive';
  const symbolExtra = ['Web'];
  symbolExtra[Symbol('hidden')] = 'must not survive';

  for (const value of [accessorList, sparse, extra, symbolExtra]) {
    assert.throws(
      () => formatListV1(value, { locale: 'en' }),
      (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_ARGUMENT',
    );
  }
  assert.equal(accessorCalls, 0);

  let iteratorCalls = 0;
  class HostileList extends Array {
    [Symbol.iterator]() {
      iteratorCalls += 1;
      throw new Error('list-iterator-marker');
    }
  }
  const list = new HostileList();
  list.push('Web', 'Android');
  assert.match(formatListV1(list, { locale: 'en' }), /Web.*and.*Android/u);
  assert.equal(iteratorCalls, 0);
});

test('normalizes safe text and rejects unsafe or unbounded interpolation', async () => {
  const { formatMessageV1, I18nErrorV1 } = await import('../src/v1.ts');

  assert.equal(
    formatMessageV1('vi-VN', 'sync.lastCompletedAt', { time: 'Nguye\u0302\u0303n A\u0301nh' }),
    'Đồng bộ gần nhất lúc Nguyễn Ánh.',
  );
  assert.equal(
    formatMessageV1('en', 'error.genericWithCorrelationId', { correlationId: 'corr-123_ABC.9' }),
    'Something went wrong. Reference code: corr-123_ABC.9.',
  );

  for (const correlationId of [
    'corr 123',
    'corr\n123',
    'corr\u202e123',
    `corr-${String.fromCharCode(0xd800)}`,
    'x'.repeat(129),
  ]) {
    assert.throws(
      () => formatMessageV1('en', 'error.genericWithCorrelationId', { correlationId }),
      (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_PARAMETER',
    );
  }
  assert.throws(
    () => formatMessageV1('en', 'sync.lastCompletedAt', { time: 'x'.repeat(513) }),
    (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_PARAMETER',
  );
});

test('selects grammatically correct retry messages with Intl plural rules', async () => {
  const { formatRetryAfterSecondsV1, I18nErrorV1 } = await import('../src/v1.ts');

  assert.equal(formatRetryAfterSecondsV1('en', 0), 'Try again in 0 seconds.');
  assert.equal(formatRetryAfterSecondsV1('en', 1), 'Try again in 1 second.');
  assert.equal(formatRetryAfterSecondsV1('en', 2), 'Try again in 2 seconds.');
  assert.equal(formatRetryAfterSecondsV1('vi-VN', 0), 'Thử lại sau 0 giây.');
  assert.equal(formatRetryAfterSecondsV1('vi-VN', 1), 'Thử lại sau 1 giây.');
  assert.equal(formatRetryAfterSecondsV1('vi-VN', 2), 'Thử lại sau 2 giây.');
  for (const seconds of [-1, 1.5, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => formatRetryAfterSecondsV1('en', seconds),
      (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_NUMBER',
    );
  }
});
