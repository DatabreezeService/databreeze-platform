import assert from 'node:assert/strict';
import test from 'node:test';

test('interpolates declared string and numeric parameters deterministically', async () => {
  const { formatMessageV1 } = await import('../src/v1.ts');

  assert.equal(
    formatMessageV1('vi-VN', 'error.genericWithCorrelationId', { correlationId: 'corr-123' }),
    'Đã xảy ra lỗi. Mã đối chiếu: corr-123.',
  );
  assert.equal(
    formatMessageV1('en', 'retry.afterSeconds', { seconds: 15 }),
    'Try again in 15 seconds.',
  );
  assert.equal(
    formatMessageV1('vi-VN', 'accessibility.progressLabel', { current: 2, total: 5 }),
    'Tiến độ: 2 trên 5.',
  );
});

test('[WEB-021, NCO-017] requires every declared parameter and rejects extras', async () => {
  const { formatMessageV1, I18nErrorV1 } = await import('../src/v1.ts');

  assert.throws(
    () => formatMessageV1('en', 'retry.afterSeconds', {}),
    (error) => error instanceof I18nErrorV1 && error.code === 'MISSING_PARAMETER',
  );
  assert.throws(
    () => formatMessageV1('en', 'retry.afterSeconds', { seconds: 2, undeclared: 'no' }),
    (error) => error instanceof I18nErrorV1 && error.code === 'EXTRA_PARAMETER',
  );
  assert.throws(
    () => formatMessageV1('en', 'action.save', { unexpected: 'no' }),
    (error) => error instanceof I18nErrorV1 && error.code === 'EXTRA_PARAMETER',
  );
});

test('rejects wrong parameter types, non-finite numbers, missing keys, and unsupported locales', async () => {
  const { formatMessageV1, I18nErrorV1 } = await import('../src/v1.ts');

  const cases = [
    [() => formatMessageV1('en', 'retry.afterSeconds', { seconds: '2' }), 'INVALID_PARAMETER'],
    [
      () => formatMessageV1('en', 'retry.afterSeconds', { seconds: Number.NaN }),
      'INVALID_PARAMETER',
    ],
    [() => formatMessageV1('en', 'missing.key', {}), 'MISSING_MESSAGE'],
    [() => formatMessageV1('fr', 'action.save', {}), 'INVALID_LOCALE'],
  ];
  for (const [operation, code] of cases) {
    assert.throws(operation, (error) => error instanceof I18nErrorV1 && error.code === code);
  }
});

test('performs literal text interpolation without interpreting HTML', async () => {
  const { formatMessageV1 } = await import('../src/v1.ts');
  const marker = '<strong>& customer</strong>';

  assert.equal(
    formatMessageV1('en', 'error.genericWithCorrelationId', { correlationId: marker }),
    `Something went wrong. Reference code: ${marker}.`,
  );
});

test('rejects accessor-backed parameter bags without invoking them', async () => {
  const { formatMessageV1, I18nErrorV1 } = await import('../src/v1.ts');
  let getterCalls = 0;
  const parameters = {};
  Object.defineProperty(parameters, 'seconds', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 5;
    },
  });

  assert.throws(
    () => formatMessageV1('en', 'retry.afterSeconds', parameters),
    (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_ARGUMENT',
  );
  assert.equal(getterCalls, 0);
});
