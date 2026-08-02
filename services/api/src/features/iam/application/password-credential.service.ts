import {
  createPasswordCredentialV1,
  validatePasswordInputV1,
  type PasswordCredentialResultV1,
  type PasswordCredentialV1,
} from '../domain/password-credential.js';
import type { PasswordHasherPort } from './password-hasher.port.js';

export class PasswordCredentialService {
  constructor(private readonly hasher: PasswordHasherPort) {}

  async create(password: unknown): Promise<PasswordCredentialResultV1<PasswordCredentialV1>> {
    const validated = validatePasswordInputV1(password);
    if (!validated.accepted) return validated;
    try {
      const credential = await this.hasher.hash(validated.value);
      const parsed = createPasswordCredentialV1(credential.encodedHash);
      return parsed.accepted ? parsed : { accepted: false, code: 'HASH_FAILED' };
    } catch {
      return { accepted: false, code: 'HASH_FAILED' };
    }
  }

  async verify(credential: unknown, password: unknown): Promise<boolean> {
    const validatedPassword = validatePasswordInputV1(password);
    if (!validatedPassword.accepted) return false;
    const parsed =
      typeof credential === 'object' && credential !== null
        ? createPasswordCredentialV1((credential as Record<string, unknown>)['encodedHash'])
        : createPasswordCredentialV1(credential);
    if (!parsed.accepted) return false;
    try {
      return await this.hasher.verify(parsed.value, validatedPassword.value);
    } catch {
      return false;
    }
  }
}
