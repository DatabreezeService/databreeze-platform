import type {
  AuthenticationResultV1,
  AuthenticationUseCaseV1,
} from '../application/authentication.port.js';

/** Safe default for environments that have not configured a credential provider yet. */
export class UnavailableAuthenticationAdapter implements AuthenticationUseCaseV1 {
  signIn(): Promise<AuthenticationResultV1> {
    return Promise.resolve({ accepted: false, code: 'AUTHENTICATION_UNAVAILABLE' });
  }
}
