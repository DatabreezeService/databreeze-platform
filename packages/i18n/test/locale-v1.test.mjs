import assert from 'node:assert/strict';
import test from 'node:test';

test('[IAM-016] defaults exactly to Vietnamese for absent, empty, unsupported, and malformed preferences', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');

  for (const input of [
    undefined,
    null,
    '',
    '   ',
    'fr-FR',
    'en;q=bogus',
    'en;q=1.1',
    'en;q=.5',
    'en;q=0',
    42,
    [],
  ]) {
    assert.equal(negotiateLocaleV1(input), 'vi-VN', `input ${String(input)} must fail safely`);
  }
});

test('canonicalizes supported language and region variants', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');

  for (const input of ['vi', 'VI', 'vi-vn', 'vi-VN', 'vi-US']) {
    assert.equal(negotiateLocaleV1(input), 'vi-VN');
  }
  for (const input of ['en', 'EN', 'en-us', 'en-GB']) {
    assert.equal(negotiateLocaleV1(input), 'en');
  }
});

test('uses quality weights, stable source order, and the highest duplicate weight', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');

  assert.equal(negotiateLocaleV1('en;q=0.8, vi-VN;q=0.9'), 'vi-VN');
  assert.equal(negotiateLocaleV1('en;q=0.9, vi;q=0.9'), 'en');
  assert.equal(negotiateLocaleV1('en;q=0.2, en-US;q=0.8, vi;q=0.7'), 'en');
  assert.equal(negotiateLocaleV1('en;q=0, en-US;q=0.8, vi;q=0.7'), 'en');
  assert.equal(negotiateLocaleV1('fr;q=1, en;q=0.5'), 'en');
});

test('applies wildcard policy without reviving an explicitly excluded locale', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');

  assert.equal(negotiateLocaleV1('*;q=0.5'), 'vi-VN');
  assert.equal(negotiateLocaleV1('vi;q=0, *;q=0.5'), 'en');
  assert.equal(negotiateLocaleV1('vi;q=0, en;q=0, *;q=1'), 'vi-VN');
  assert.equal(negotiateLocaleV1('*;q=0, en;q=0.4'), 'en');
});

test('gives a supported explicit user preference priority over Accept-Language', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');

  assert.equal(negotiateLocaleV1({ userLocale: 'EN-gb', acceptLanguage: 'vi;q=1' }), 'en');
  assert.equal(negotiateLocaleV1({ userLocale: 'fr', acceptLanguage: 'en;q=0.8' }), 'en');
  assert.equal(negotiateLocaleV1({ userLocale: '', acceptLanguage: 'en' }), 'en');
});

test('does not execute hostile locale accessors and falls back safely for hostile objects', async () => {
  const { negotiateLocaleV1 } = await import('../src/v1.ts');
  let getterCalls = 0;
  const hostileAccessor = {};
  Object.defineProperties(hostileAccessor, {
    userLocale: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('must not run');
      },
    },
    acceptLanguage: {
      enumerable: true,
      get() {
        getterCalls += 1;
        return 'en';
      },
    },
  });
  const hostileProxy = new Proxy(
    {},
    {
      getOwnPropertyDescriptor() {
        throw new Error('must fail closed');
      },
    },
  );

  assert.equal(negotiateLocaleV1(hostileAccessor), 'vi-VN');
  assert.equal(getterCalls, 0);
  assert.equal(negotiateLocaleV1(hostileProxy), 'vi-VN');
});
