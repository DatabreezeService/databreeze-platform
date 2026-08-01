import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';

import type { AuthenticatedPrincipalV1, AuthenticationPortV1 } from './authentication.port.js';

export type AuthenticationFailureCodeV1 = 'INVALID_CREDENTIALS' | 'AUTHENTICATION_UNAVAILABLE';
export type AuthenticationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AuthenticationFailureCodeV1 };

export class AuthenticationService {
  constructor(private readonly ports: AuthenticationPortV1) {}

  async signIn(input: {
    readonly email: unknown;
    readonly password: unknown;
    readonly clientPlatform: 'android' | 'desktop' | 'web';
  }): Promise<
    AuthenticationResultV1<{
      readonly principal: AuthenticatedPrincipalV1;
      readonly session: Awaited<ReturnType<AuthenticationPortV1['sessions']['issue']>>;
    }>
  > {
    const email = normalizeEmailAddressV1(input.email);
    if (!email.accepted) return { accepted: false, code: 'INVALID_CREDENTIALS' };
    try {
      const found = await this.ports.credentials.findCredential(email.value);
      if (!found) return { accepted: false, code: 'INVALID_CREDENTIALS' };
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
