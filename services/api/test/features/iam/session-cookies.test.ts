import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CSRF_COOKIE_NAME_V1,
  REFRESH_COOKIE_NAME_V1,
  clearCookieV1,
  readCookieValueV1,
  serializeCookieV1,
} from '../../../src/features/iam/api/session-cookies.js';

const token = 'QmFzZTY0dXJsVG9rZW5fMDEyMzQ1Njc4OWFiY2RlZg';
const refreshToken = `00000000-0000-4000-8000-000000000001.${token}`;

void test('serializes bounded session cookies with explicit browser security attributes', () => {
  assert.equal(
    serializeCookieV1(REFRESH_COOKIE_NAME_V1, refreshToken, {
      httpOnly: true,
      maxAgeSeconds: 2_592_000,
    }),
    `${REFRESH_COOKIE_NAME_V1}=${refreshToken}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
  assert.equal(
    serializeCookieV1(CSRF_COOKIE_NAME_V1, token, { httpOnly: false, maxAgeSeconds: 900 }),
    `${CSRF_COOKIE_NAME_V1}=${token}; Max-Age=900; Path=/; Secure; SameSite=Lax`,
  );
});

void test('reads one exact cookie value and fails closed for ambiguity or malformed input', () => {
  assert.equal(
    readCookieValueV1(`${REFRESH_COOKIE_NAME_V1}=${refreshToken}`, REFRESH_COOKIE_NAME_V1),
    refreshToken,
  );
  assert.equal(
    readCookieValueV1(
      `other=value; ${REFRESH_COOKIE_NAME_V1}=${refreshToken}`,
      REFRESH_COOKIE_NAME_V1,
    ),
    refreshToken,
  );
  assert.equal(
    readCookieValueV1(
      `${REFRESH_COOKIE_NAME_V1}=${refreshToken}; ${REFRESH_COOKIE_NAME_V1}=other`,
      REFRESH_COOKIE_NAME_V1,
    ),
    undefined,
  );
  assert.equal(readCookieValueV1('broken-cookie', REFRESH_COOKIE_NAME_V1), undefined);
  assert.equal(readCookieValueV1(undefined, REFRESH_COOKIE_NAME_V1), undefined);
});

void test('rejects cookie headers and fields beyond parser resource bounds', () => {
  assert.equal(
    readCookieValueV1(
      `${REFRESH_COOKIE_NAME_V1}=${refreshToken}; padding=${'a'.repeat(8_192)}`,
      REFRESH_COOKIE_NAME_V1,
    ),
    undefined,
  );
  assert.equal(
    readCookieValueV1(
      `${REFRESH_COOKIE_NAME_V1}=${refreshToken}; ${Array.from({ length: 64 }, (_, index) => `c${index}=v`).join('; ')}`,
      REFRESH_COOKIE_NAME_V1,
    ),
    undefined,
  );
  assert.equal(
    readCookieValueV1(`${REFRESH_COOKIE_NAME_V1}=${'a'.repeat(4_097)}`, REFRESH_COOKIE_NAME_V1),
    undefined,
  );
  assert.throws(
    () => serializeCookieV1('a'.repeat(65), token, { httpOnly: true, maxAgeSeconds: 1 }),
    /Cookie name or value is invalid/,
  );
  assert.throws(
    () =>
      serializeCookieV1(REFRESH_COOKIE_NAME_V1, 'a'.repeat(4_097), {
        httpOnly: true,
        maxAgeSeconds: 1,
      }),
    /Cookie name or value is invalid/,
  );
});

void test('creates deletion cookies without weakening the original security attributes', () => {
  assert.equal(
    clearCookieV1(REFRESH_COOKIE_NAME_V1, { httpOnly: true }),
    `${REFRESH_COOKIE_NAME_V1}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
  assert.equal(
    clearCookieV1(CSRF_COOKIE_NAME_V1, { httpOnly: false }),
    `${CSRF_COOKIE_NAME_V1}=; Max-Age=0; Path=/; Secure; SameSite=Lax`,
  );
});
