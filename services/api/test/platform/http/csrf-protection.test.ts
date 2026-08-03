import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateCsrfRequestV1 } from '../../../src/platform/http/csrf-protection.js';

const token = 'QmFzZTY0dXJsVG9rZW5fMDEyMzQ1Njc4OWFiY2RlZg';

const allowedOrigins = ['https://app.databreeze.example'];

void test('allows safe methods and non-cookie clients without a CSRF token', () => {
  assert.deepEqual(evaluateCsrfRequestV1({ method: 'GET', headers: {} }, { allowedOrigins }), {
    accepted: true,
  });
  assert.deepEqual(
    evaluateCsrfRequestV1(
      { method: 'POST', headers: { authorization: 'Bearer access-token' } },
      { allowedOrigins },
    ),
    { accepted: true },
  );
});

void test('requires a valid double-submit token for cookie-authenticated mutations', () => {
  const base = {
    method: 'POST',
    headers: {
      cookie: 'databreeze_refresh=session-value',
      origin: 'https://app.databreeze.example',
    },
  } as const;

  assert.deepEqual(evaluateCsrfRequestV1(base, { allowedOrigins }), {
    accepted: false,
    code: 'CSRF_REQUIRED',
  });
  assert.deepEqual(
    evaluateCsrfRequestV1(
      {
        ...base,
        headers: {
          ...base.headers,
          cookie: `databreeze_refresh=session-value; databreeze_csrf=${token}`,
          'x-csrf-token': `${token}x`,
        },
      },
      { allowedOrigins },
    ),
    { accepted: false, code: 'CSRF_INVALID' },
  );
  assert.deepEqual(
    evaluateCsrfRequestV1(
      {
        ...base,
        headers: {
          ...base.headers,
          cookie: `databreeze_refresh=session-value; databreeze_csrf=${token}`,
          'x-csrf-token': token,
        },
      },
      { allowedOrigins },
    ),
    { accepted: true },
  );
});

void test('rejects hostile, ambiguous, or missing browser origin signals', () => {
  const headers = {
    cookie: `databreeze_refresh=session-value; databreeze_csrf=${token}`,
    'x-csrf-token': token,
  };

  assert.deepEqual(
    evaluateCsrfRequestV1(
      { method: 'POST', headers: { ...headers, origin: 'https://evil.example' } },
      { allowedOrigins },
    ),
    { accepted: false, code: 'ORIGIN_INVALID' },
  );
  assert.deepEqual(
    evaluateCsrfRequestV1(
      {
        method: 'POST',
        headers: { ...headers, origin: ['https://app.databreeze.example', 'https://evil.example'] },
      },
      { allowedOrigins },
    ),
    { accepted: false, code: 'ORIGIN_INVALID' },
  );
  assert.deepEqual(evaluateCsrfRequestV1({ method: 'POST', headers }, { allowedOrigins }), {
    accepted: false,
    code: 'ORIGIN_INVALID',
  });
  assert.deepEqual(
    evaluateCsrfRequestV1(
      {
        method: 'POST',
        headers: { ...headers, 'sec-fetch-site': 'same-origin' },
      },
      { allowedOrigins },
    ),
    { accepted: true },
  );
});

void test('fails closed for duplicate cookies and duplicate token headers', () => {
  assert.deepEqual(
    evaluateCsrfRequestV1(
      {
        method: 'PATCH',
        headers: {
          cookie: `databreeze_refresh=session-value; databreeze_csrf=${token}; databreeze_csrf=${token}`,
          origin: 'https://app.databreeze.example',
          'x-csrf-token': [token, token],
        },
      },
      { allowedOrigins },
    ),
    { accepted: false, code: 'CSRF_INVALID' },
  );
});
