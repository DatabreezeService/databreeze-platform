import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';

import type {
  AuthenticatedPrincipalV1,
  CredentialLookupPortV1,
} from '../application/authentication.port.js';

interface StoredCredentialV1 {
  readonly principal: AuthenticatedPrincipalV1;
  readonly credential: { readonly algorithm: 'argon2id'; readonly encodedHash: string };
}

/** Test/dogfood adapter; production composition supplies the PostgreSQL credential port. */
export class InMemoryCredentialLookupAdapter implements CredentialLookupPortV1 {
  private readonly credentials = new Map<string, StoredCredentialV1>();

  public seed(
    emailInput: unknown,
    principal: AuthenticatedPrincipalV1,
    credential: StoredCredentialV1['credential'],
  ): void {
    const email = normalizeEmailAddressV1(emailInput);
    if (!email.accepted) throw new Error('IAM_INVALID_EMAIL');
    this.credentials.set(
      email.value,
      Object.freeze({
        principal: Object.freeze({ ...principal }),
        credential: Object.freeze({ ...credential }),
      }),
    );
  }

  public findCredential(email: string): Promise<StoredCredentialV1 | undefined> {
    return Promise.resolve(this.credentials.get(email));
  }
}
