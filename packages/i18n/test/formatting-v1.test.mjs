import assert from 'node:assert/strict';
import test from 'node:test';

function visibleSpaces(value) {
  return value.replace(/[\u00a0\u202f]/gu, ' ');
}

test('[WEB-013] formats one instant in an explicit time zone without using the host time zone', async () => {
  const { formatDateTimeV1 } = await import('../src/v1.ts');
  const instant = Date.parse('2026-08-01T17:30:00.000Z');
  const vietnamese = visibleSpaces(
    formatDateTimeV1(instant, {
      locale: 'vi-VN',
      timeZone: 'Asia/Ho_Chi_Minh',
      dateStyle: 'short',
      timeStyle: 'short',
    }),
  );
  const englishUtc = visibleSpaces(
    formatDateTimeV1(instant, {
      locale: 'en',
      timeZone: 'UTC',
      dateStyle: 'short',
      timeStyle: 'short',
      hour12: false,
    }),
  );

  assert.match(vietnamese, /2\/8\/(?:26|2026)/u);
  assert.match(vietnamese, /00:30/u);
  assert.match(englishUtc, /8\/1\/(?:26|2026)/u);
  assert.match(englishUtc, /17:30/u);
});

test('formats decimal, VND and other currencies, and percentages without changing input values', async () => {
  const { formatCurrencyV1, formatDecimalV1, formatPercentV1 } = await import('../src/v1.ts');
  const amount = 1234.5;

  assert.equal(visibleSpaces(formatDecimalV1(amount, { locale: 'vi-VN' })), '1.234,5');
  assert.equal(visibleSpaces(formatDecimalV1(amount, { locale: 'en' })), '1,234.5');
  assert.match(
    visibleSpaces(
      formatCurrencyV1(amount, {
        locale: 'vi-VN',
        currency: 'VND',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }),
    ),
    /1\.234,5.*₫/u,
  );
  assert.match(
    visibleSpaces(formatCurrencyV1(amount, { locale: 'en', currency: 'USD' })),
    /\$1,234\.50/u,
  );
  assert.match(visibleSpaces(formatPercentV1(0.125, { locale: 'vi-VN' })), /12,5.*%/u);
  assert.equal(amount, 1234.5);
});

test('formats lists, relative time, and plural categories for both locales', async () => {
  const { formatListV1, formatRelativeTimeV1, selectPluralCategoryV1 } = await import(
    '../src/v1.ts'
  );

  const viList = formatListV1(['Web', 'Máy tính', 'Android'], { locale: 'vi-VN' });
  const enList = formatListV1(['Web', 'Desktop', 'Android'], { locale: 'en' });
  assert.match(viList, /Web.*Máy tính.*Android/u);
  assert.match(enList, /Web.*Desktop.*and.*Android/u);
  assert.match(formatRelativeTimeV1(-2, 'day', { locale: 'vi-VN' }), /2 ngày trước/u);
  assert.match(formatRelativeTimeV1(-2, 'day', { locale: 'en' }), /2 days ago/u);
  assert.equal(selectPluralCategoryV1(1, { locale: 'en' }), 'one');
  assert.equal(selectPluralCategoryV1(2, { locale: 'en' }), 'other');
  assert.equal(selectPluralCategoryV1(1, { locale: 'vi-VN' }), 'other');
});

test('accepts every plural relative-time unit admitted by the public TypeScript type', async () => {
  const { formatRelativeTimeV1 } = await import('../src/v1.ts');
  const cases = [
    ['years', '2 years ago'],
    ['quarters', '2 quarters ago'],
    ['months', '2 months ago'],
    ['weeks', '2 weeks ago'],
    ['days', '2 days ago'],
    ['hours', '2 hours ago'],
    ['minutes', '2 minutes ago'],
    ['seconds', '2 seconds ago'],
  ];

  for (const [unit, expected] of cases) {
    assert.equal(formatRelativeTimeV1(-2, unit, { locale: 'en' }), expected);
  }
});

test('rejects invalid locale, time zone, date, currency, numeric values, units, and option keys', async () => {
  const { formatCurrencyV1, formatDateTimeV1, formatDecimalV1, formatRelativeTimeV1, I18nErrorV1 } =
    await import('../src/v1.ts');
  const cases = [
    [() => formatDecimalV1(1, { locale: 'fr' }), 'INVALID_LOCALE'],
    [() => formatDecimalV1(Infinity, { locale: 'en' }), 'INVALID_NUMBER'],
    [() => formatDateTimeV1(Number.NaN, { locale: 'en', timeZone: 'UTC' }), 'INVALID_DATE'],
    [() => formatDateTimeV1(8.64e15 + 1, { locale: 'en', timeZone: 'UTC' }), 'INVALID_DATE'],
    [() => formatDateTimeV1(0, { locale: 'en' }), 'INVALID_TIME_ZONE'],
    [() => formatDateTimeV1(0, { locale: 'en', timeZone: 'Moon/Base' }), 'INVALID_TIME_ZONE'],
    [() => formatCurrencyV1(1, { locale: 'en', currency: 'usd' }), 'INVALID_CURRENCY'],
    [() => formatRelativeTimeV1(1, 'fortnight', { locale: 'en' }), 'INVALID_ARGUMENT'],
    [() => formatDecimalV1(1, { locale: 'en', rawProviderOption: true }), 'INVALID_ARGUMENT'],
  ];

  for (const [operation, code] of cases) {
    assert.throws(operation, (error) => error instanceof I18nErrorV1 && error.code === code);
  }
});

test('rejects impossible fraction ranges and accessor-backed formatter options safely', async () => {
  const { formatDecimalV1, I18nErrorV1 } = await import('../src/v1.ts');
  let getterCalls = 0;
  const options = {};
  Object.defineProperty(options, 'locale', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'en';
    },
  });

  assert.throws(
    () =>
      formatDecimalV1(1, {
        locale: 'en',
        minimumFractionDigits: 3,
        maximumFractionDigits: 2,
      }),
    (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_ARGUMENT',
  );
  assert.throws(
    () => formatDecimalV1(1, options),
    (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_ARGUMENT',
  );
  assert.equal(getterCalls, 0);

  const { proxy, revoke } = Proxy.revocable({}, {});
  revoke();
  assert.throws(
    () => formatDecimalV1(1, proxy),
    (error) => error instanceof I18nErrorV1 && error.code === 'INVALID_ARGUMENT',
  );
});
