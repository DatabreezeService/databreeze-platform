import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';

import type {
  AuthenticationInputV1,
  AuthenticationPortV1,
  AuthenticationResultV1,
  AuthenticationUseCaseV1,
} from './authentication.port.js';

export type { AuthenticationFailureCodeV1 } from './authentication.port.js';

export class AuthenticationService implements AuthenticationUseCaseV1 {
  constructor(private readonly ports: AuthenticationPortV1) {}

  async signIn(input: AuthenticationInputV1): Promise<AuthenticationResultV1> {
    const email = normalizeEmailAddressV1(input.email);
    if (!email.accepted) return { accepted: false, code: 'INVALID_CREDENTIALS' };
    try {
      const found = await this.ports.credentials.findCredential(email.value);
      if (!found) return { accepted: false, code: 'INVALID_CREDENTIALS' };
      if (typeof found.principal.mfaReenrollmentRequired !== 'boolean')
        return { accepted: false, code: 'AUTHENTICATION_UNAVAILABLE' };
      const valid = await this.ports.passwordCredentials.verify(found.credential, input.password);
      if (!valid) return { accepted: false, code: 'INVALID_CREDENTIALS' };
      const session = await this.ports.sessions.issue(found.principal, input.clientPlatform);
      return Object.freeze({
        accepted: true,
        value: Object.freeze({ principal: found.principal, session }),
      });
    } catch {
      return { accepted: false, code: 'AUTHENTICATION_UNAVAILABLE' };
    }
  }
}
