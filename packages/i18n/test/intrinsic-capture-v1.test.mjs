import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import test from 'node:test';

function replaceProperty(target, key, replacement) {
  const original = Object.getOwnPropertyDescriptor(target, key);
  assert.notEqual(original, undefined, `missing intrinsic ${String(key)}`);
  Object.defineProperty(target, key, replacement(original));
  return () => Object.defineProperty(target, key, original);
}

function replaceValue(target, key, value) {
  return replaceProperty(target, key, (original) => ({ ...original, value }));
}

function restoreAll(restorations) {
  for (let index = restorations.length - 1; index >= 0; index -= 1) {
    restorations[index]();
  }
}

function hostileFunction(calls, marker) {
  return function hostileIntrinsic() {
    calls.push(marker);
    throw new Error(marker);
  };
}

test('rejects every lone surrogate without leaking input and accepts valid astral text', async () => {
  const { formatMessageV1, I18nErrorV1 } = await import('../src/v1.ts');
  const high = String.fromCharCode(0xd800);
  const low = String.fromCharCode(0xdc00);
  const invalidValues = [
    `${high}surrogate-marker-leading-high`,
    `surrogate-marker-${high}-middle-high`,
    `surrogate-marker-trailing-high${high}`,
    `${low}surrogate-marker-leading-low`,
    `surrogate-marker-${low}-middle-low`,
    `surrogate-marker-trailing-low${low}`,
  ];

  for (const time of invalidValues) {
    assert.throws(
      () => formatMessageV1('en', 'sync.lastCompletedAt', { time }),
      (error) => {
        assert.equal(error instanceof I18nErrorV1, true);
        assert.equal(error.code, 'INVALID_PARAMETER');
        assert.doesNotMatch(inspect(error), /surrogate-marker/u);
        return true;
      },
    );
  }
  assert.equal(
    formatMessageV1('en', 'sync.lastCompletedAt', { time: 'Launch \u{1f680}' }),
    'Last synchronized at Launch 🚀.',
  );
});

test('uses captured locale canonicalization, constructor, and language getter intrinsics', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const LocaleIntrinsic = Intl.Locale;

  try {
    restorations.push(
      replaceValue(Intl, 'getCanonicalLocales', hostileFunction(calls, 'canonical-marker')),
    );
    restorations.push(
      replaceValue(Intl, 'Locale', hostileFunction(calls, 'locale-constructor-marker')),
    );
    restorations.push(
      replaceProperty(LocaleIntrinsic.prototype, 'language', (original) => ({
        ...original,
        get: hostileFunction(calls, 'locale-language-marker'),
      })),
    );

    assert.equal(negotiateLocaleV1('en-US-u-ca-gregory'), 'en');
    assert.deepEqual(calls, []);
  } finally {
    restoreAll(restorations);
  }
});

test('uses captured Date and DateTimeFormat constructor and method intrinsics', async () => {
  const { formatDateTimeV1 } = await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const DateIntrinsic = Date;
  const DateTimeFormatIntrinsic = Intl.DateTimeFormat;

  try {
    restorations.push(
      replaceValue(globalThis, 'Date', hostileFunction(calls, 'date-constructor-marker')),
    );
    restorations.push(
      replaceValue(
        DateIntrinsic.prototype,
        'getTime',
        hostileFunction(calls, 'date-get-time-marker'),
      ),
    );
    restorations.push(
      replaceValue(Intl, 'DateTimeFormat', hostileFunction(calls, 'date-time-constructor-marker')),
    );
    restorations.push(
      replaceProperty(DateTimeFormatIntrinsic.prototype, 'format', (original) => ({
        ...original,
        get: hostileFunction(calls, 'date-time-format-marker'),
      })),
    );

    assert.match(formatDateTimeV1(0, { locale: 'en', timeZone: 'UTC' }), /1970/u);
    assert.deepEqual(calls, []);
  } finally {
    restoreAll(restorations);
  }
});

test('uses captured NumberFormat constructor and format getter intrinsics', async () => {
  const { formatDecimalV1 } = await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const NumberFormatIntrinsic = Intl.NumberFormat;

  try {
    restorations.push(
      replaceValue(Intl, 'NumberFormat', hostileFunction(calls, 'number-constructor-marker')),
    );
    restorations.push(
      replaceProperty(NumberFormatIntrinsic.prototype, 'format', (original) => ({
        ...original,
        get: hostileFunction(calls, 'number-format-marker'),
      })),
    );

    assert.equal(formatDecimalV1(1234.5, { locale: 'en' }), '1,234.5');
    assert.deepEqual(calls, []);
  } finally {
    restoreAll(restorations);
  }
});

test('uses captured ListFormat constructor and format method intrinsics', async () => {
  const { formatListV1 } = await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const ListFormatIntrinsic = Intl.ListFormat;

  try {
    restorations.push(
      replaceValue(Intl, 'ListFormat', hostileFunction(calls, 'list-constructor-marker')),
    );
    restorations.push(
      replaceValue(
        ListFormatIntrinsic.prototype,
        'format',
        hostileFunction(calls, 'list-format-marker'),
      ),
    );

    assert.equal(formatListV1(['Web', 'Android'], { locale: 'en' }), 'Web and Android');
    assert.deepEqual(calls, []);
  } finally {
    restoreAll(restorations);
  }
});

test('uses captured RelativeTimeFormat constructor and format method intrinsics', async () => {
  const { formatRelativeTimeV1 } = await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const RelativeTimeFormatIntrinsic = Intl.RelativeTimeFormat;

  try {
    restorations.push(
      replaceValue(
        Intl,
        'RelativeTimeFormat',
        hostileFunction(calls, 'relative-constructor-marker'),
      ),
    );
    restorations.push(
      replaceValue(
        RelativeTimeFormatIntrinsic.prototype,
        'format',
        hostileFunction(calls, 'relative-format-marker'),
      ),
    );

    assert.equal(formatRelativeTimeV1(-2, 'day', { locale: 'en' }), '2 days ago');
    assert.deepEqual(calls, []);
  } finally {
    restoreAll(restorations);
  }
});

test('uses captured PluralRules constructor and select method for both plural APIs', async () => {
  const { formatRetryAfterSecondsV1, selectPluralCategoryV1 } = await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const PluralRulesIntrinsic = Intl.PluralRules;

  try {
    restorations.push(
      replaceValue(Intl, 'PluralRules', hostileFunction(calls, 'plural-constructor-marker')),
    );
    restorations.push(
      replaceValue(
        PluralRulesIntrinsic.prototype,
        'select',
        hostileFunction(calls, 'plural-select-marker'),
      ),
    );

    assert.equal(selectPluralCategoryV1(1, { locale: 'en' }), 'one');
    assert.equal(formatRetryAfterSecondsV1('en', 2), 'Try again in 2 seconds.');
    assert.deepEqual(calls, []);
  } finally {
    restoreAll(restorations);
  }
});

test('describes invalid retry seconds without claiming every failure is non-finite', async () => {
  const { formatRetryAfterSecondsV1, I18nErrorV1 } = await import('../src/v1.ts');

  for (const seconds of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => formatRetryAfterSecondsV1('en', seconds),
      (error) =>
        error instanceof I18nErrorV1 &&
        error.code === 'INVALID_NUMBER' &&
        error.message === 'The numeric value is invalid or outside the supported range.',
    );
  }
});

test('preserves valid i18n outputs after global String and prototype methods are replaced', async () => {
  const { formatListV1, formatMessageV1, formatRetryAfterSecondsV1, negotiateLocaleV1 } =
    await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const StringIntrinsic = String;
  let actual;

  try {
    for (const method of ['replace', 'replaceAll', 'startsWith', 'includes']) {
      restorations.push(
        replaceValue(
          StringIntrinsic.prototype,
          method,
          hostileFunction(calls, `string-${method}-marker`),
        ),
      );
    }
    restorations.push(
      replaceValue(globalThis, 'String', hostileFunction(calls, 'string-constructor-marker')),
    );

    actual = {
      error: formatMessageV1('en', 'error.generic'),
      list: formatListV1(['Web', 'Android'], { locale: 'en' }),
      message: formatMessageV1('en', 'accessibility.progressLabel', { current: 2, total: 5 }),
      negotiated: negotiateLocaleV1('en-US-u-ca-gregory'),
      plural: formatRetryAfterSecondsV1('en', 1),
    };
  } finally {
    restoreAll(restorations);
  }

  assert.deepEqual(actual, {
    error: 'Something went wrong. Your data has been preserved.',
    list: 'Web and Android',
    message: 'Progress: 2 of 5.',
    negotiated: 'en',
    plural: 'Try again in 1 second.',
  });
  assert.deepEqual(calls, []);
});

test('keeps extra-parameter errors stable when global String conversion is replaced', async () => {
  const { formatMessageV1, I18nErrorV1 } = await import('../src/v1.ts');
  const calls = [];
  const restorations = [];
  const StringIntrinsic = String;
  const parameters = { [Symbol('extra-parameter-marker')]: 'hidden' };
  let caught;

  try {
    restorations.push(
      replaceValue(
        StringIntrinsic.prototype,
        'replace',
        hostileFunction(calls, 'string-replace-marker'),
      ),
    );
    restorations.push(
      replaceValue(globalThis, 'String', hostileFunction(calls, 'string-constructor-marker')),
    );
    try {
      formatMessageV1('en', 'action.save', parameters);
    } catch (error) {
      caught = error;
    }
  } finally {
    restoreAll(restorations);
  }

  assert.equal(caught instanceof I18nErrorV1, true);
  assert.equal(caught.code, 'EXTRA_PARAMETER');
  assert.doesNotMatch(
    inspect(caught),
    /(?:extra-parameter|string-(?:constructor|replace))-marker/u,
  );
  assert.deepEqual(calls, []);
});
