import type { PersonalOrganizationBootstrapV1 } from '@databreeze/domain/identity/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export const IDENTITY_BOOTSTRAP_REPOSITORY_PORT = Symbol('IDENTITY_BOOTSTRAP_REPOSITORY_PORT');

export interface IdentityBootstrapTransactionPortV1 {
  findByUserId(userId: StableIdentifierV1): Promise<PersonalOrganizationBootstrapV1 | undefined>;
  save(bootstrap: PersonalOrganizationBootstrapV1): Promise<void>;
}

export interface IdentityBootstrapRepositoryPortV1 extends IdentityBootstrapTransactionPortV1 {
  withTransaction<TValue>(
    work: (transaction: IdentityBootstrapTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export type IdentityBootstrapResultV1 =
  | { readonly accepted: true; readonly value: PersonalOrganizationBootstrapV1 }
  | { readonly accepted: false; readonly code: 'BOOTSTRAP_CONFLICT' };
