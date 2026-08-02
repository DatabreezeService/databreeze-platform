import type { PasswordCredentialV1 } from '../domain/password-credential.js';

export const PASSWORD_HASHER_PORT = Symbol('PASSWORD_HASHER_PORT');

/** Provider boundary: plaintext is accepted only for the duration of this call. */
export interface PasswordHasherPort {
  hash(password: string): Promise<PasswordCredentialV1>;
  verify(credential: PasswordCredentialV1, password: string): Promise<boolean>;
}
