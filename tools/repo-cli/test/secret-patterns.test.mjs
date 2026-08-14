import assert from 'node:assert/strict';
import test from 'node:test';

import { SECRET_PATTERNS, scanTextForSecrets } from '../src/secret-patterns.mjs';

test('secret patterns include OpenAI key shapes without embedding a contiguous key', () => {
  const names = SECRET_PATTERNS.map((item) => item.name);
  assert.ok(names.includes('OpenAI API key'));
  assert.ok(names.includes('OpenAI project key'));

  const prefix = 'sk';
  const mid = '-proj-';
  const body = 'A'.repeat(20) + 'B'.repeat(20);
  const assembledProject = `${prefix}${mid}${body}`;
  const assembledLegacy = `${prefix}-${'x'.repeat(48)}`;

  assert.deepEqual(scanTextForSecrets(assembledProject), ['OpenAI project key']);
  assert.deepEqual(scanTextForSecrets(assembledLegacy), ['OpenAI API key']);
  assert.deepEqual(scanTextForSecrets('no secrets here'), []);
  assert.ok(!SECRET_PATTERNS.some((item) => item.pattern.source.includes(assembledLegacy)));
});

test('secret patterns still catch private keys and cloud tokens', () => {
  const begin = '-----BEGIN ' + 'PRIVATE KEY-----';
  const end = '-----END ' + 'PRIVATE KEY-----';
  assert.ok(scanTextForSecrets(`${begin}\nabc\n${end}`).includes('private key'));
  assert.ok(scanTextForSecrets('AKIA' + '0123456789ABCDEF').includes('AWS access key'));
});
