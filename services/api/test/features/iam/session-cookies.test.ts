import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CSRF_COOKIE_NAME_V1,
  REFRESH_COOKIE_NAME_V1,
  readCookieValueV1,
  serializeCookieV1,
} from '../../../src/features/iam/api/session-cookies.js';

const token = 'QmFzZTY0dXJsVG9rZW5fMDEyMzQ1Njc4OWFiY2RlZg';

test('serializes bounded session cookies with explicit browser security attributes', () => {
  assert.equal(
    serializeCookieV1(REFRESH_COOKIE_NAME_V1, token, { httpOnly: true, maxAgeSeconds: 2_592_000 }),
    `${REFRESH_COOKIE_NAME_V1}=${token}; Max-Age=2592000; Path=/; HttpOnly; Secure; SameSite=Lax`,
  );
  assert.equal(
    serializeCookieV1(CSRF_COOKIE_NAME_V1, token, { httpOnly: false, maxAgeSeconds: 900 }),
    `${CSRF_COOKIE_NAME_V1}=${token}; Max-Age=900; Path=/; Secure; SameSite=Lax`,
  );
});

test('reads one exact cookie value and fails closed for ambiguity or malformed input', () => {
  assert.equal(readCookieValueV1(`${REFRESH_COOKIE_NAME_V1}=${token}`, REFRESH_COOKIE_NAME_V1), token);
  assert.equal(
    readCookieValueV1(`other=value; ${REFRESH_COOKIE_NAME_V1}=${token}`, REFRESH_COOKIE_NAME_V1),
    token,
  );
  assert.equal(
    readCookieValueV1(`${REFRESH_COOKIE_NAME_V1}=${token}; ${REFRESH_COOKIE_NAME_V1}=other`, REFRESH_COOKIE_NAME_V1),
    undefined,
  );
  assert.equal(readCookieValueV1('broken-cookie', REFRESH_COOKIE_NAME_V1), undefined);
  assert.equal(readCookieValueV1(undefined, REFRESH_COOKIE_NAME_V1), undefined);
});
