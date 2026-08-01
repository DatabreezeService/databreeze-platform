import assert from 'node:assert/strict';
import test from 'node:test';

import { PasswordCredentialService } from '../../../src/features/iam/application/password-credential.service.js';
import { Argon2PasswordHasherAdapter } from '../../../src/features/iam/adapter/argon2-password-hasher.adapter.js';
import {
  createPasswordCredentialV1,
  validatePasswordInputV1,
} from '../../../src/features/iam/domain/password-credential.js';

const password = 'correct horse battery staple';

void test('[IAM-001] rejects short, overlong, and line-breaking password inputs', () => {
  assert.deepEqual(validatePasswordInputV1('short'), {
    accepted: false,
    code: 'INVALID_PASSWORD',
  });
  assert.deepEqual(validatePasswordInputV1('a'.repeat(129)), {
    accepted: false,
    code: 'INVALID_PASSWORD',
  });
  assert.deepEqual(validatePasswordInputV1('valid-password\n'), {
    accepted: false,
    code: 'INVALID_PASSWORD',
  });
});

void test('[IAM-001] Argon2id credentials hash and verify without exposing plaintext', async () => {
  const service = new PasswordCredentialService(new Argon2PasswordHasherAdapter());
  const created = await service.create(password);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.value.algorithm, 'argon2id');
  assert.match(created.value.encodedHash, /^\$argon2id\$v=19\$/u);
  assert.doesNotMatch(created.value.encodedHash, /correct horse/u);
  assert.equal(await service.verify(created.value, password), true);
  assert.equal(await service.verify(created.value, 'incorrect password'), false);
});

void test('[IAM-001] malformed or legacy credentials fail closed', async () => {
  const service = new PasswordCredentialService(new Argon2PasswordHasherAdapter());
  assert.equal(await service.verify('plaintext', password), false);
  assert.deepEqual(createPasswordCredentialV1('$2b$10$legacy'), {
    accepted: false,
    code: 'INVALID_HASH',
  });
});
