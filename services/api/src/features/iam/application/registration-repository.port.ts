import type { PasswordCredentialV1 } from '../domain/password-credential.js';
import type { PersonalOrganizationBootstrapV1 } from '@databreeze/domain/identity/v1';

export const IAM_REGISTRATION_REPOSITORY_PORT = Symbol('IAM_REGISTRATION_REPOSITORY_PORT');

export interface RegistrationPersistenceInputV1 {
  readonly email: string;
  readonly credentialId: string;
  readonly credential: PasswordCredentialV1;
  readonly bootstrap: PersonalOrganizationBootstrapV1;
}

export interface RegistrationTransactionPortV1 {
  /** Exact normalized lookup; callers must not use this to disclose account existence. */
  findByEmail(email: string): Promise<boolean>;
  save(input: RegistrationPersistenceInputV1): Promise<void>;
}

export interface RegistrationRepositoryPortV1 {
  withTransaction<TValue>(
    work: (transaction: RegistrationTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

/** Adapter-level signal for a concurrent unique-email race. */
export class RegistrationConflictError extends Error {
  public constructor() {
    super('IAM_REGISTRATION_CONFLICT');
    this.name = 'RegistrationConflictError';
  }
}

export type RegistrationFailureCodeV1 =
  | 'INVALID_INPUT'
  | 'REGISTRATION_REJECTED'
  | 'REGISTRATION_UNAVAILABLE';

export interface RegistrationValueV1 {
  readonly bootstrap?: PersonalOrganizationBootstrapV1;
  readonly email: string;
}

export type RegistrationResultV1 =
  | { readonly accepted: true; readonly value: RegistrationValueV1 }
  | { readonly accepted: false; readonly code: RegistrationFailureCodeV1 };
