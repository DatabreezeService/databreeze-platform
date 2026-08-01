import { argon2id, hash, verify } from 'argon2';

import {
  createPasswordCredentialV1,
  PASSWORD_HASH_ALGORITHM_V1,
  type PasswordCredentialV1,
} from '../domain/password-credential.js';
import type { PasswordHasherPort } from '../application/password-hasher.port.js';

const ARGON2ID_OPTIONS = Object.freeze({
  type: argon2id,
  memoryCost: 64 * 1024,
  timeCost: 3,
  parallelism: 1,
  hashLength: 32,
  saltLength: 16,
});

export class Argon2PasswordHasherAdapter implements PasswordHasherPort {
  async hash(password: string): Promise<PasswordCredentialV1> {
    const encodedHash = await hash(password, ARGON2ID_OPTIONS);
    const credential = createPasswordCredentialV1(encodedHash);
    if (!credential.accepted || credential.value.algorithm !== PASSWORD_HASH_ALGORITHM_V1)
      throw new Error('Argon2id returned an invalid credential');
    return credential.value;
  }

  async verify(credential: PasswordCredentialV1, password: string): Promise<boolean> {
    if (credential.algorithm !== PASSWORD_HASH_ALGORITHM_V1) return false;
    return verify(credential.encodedHash, password);
  }
}
