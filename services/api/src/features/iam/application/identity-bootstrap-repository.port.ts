import type {
  OrganizationIdentityV1,
  PersonalOrganizationBootstrapV1,
  ProjectIdentityV1,
  UserIdentityV1,
  WorkspaceIdentityV1,
} from '@databreeze/domain/identity/v1';
import type { StableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

export const IDENTITY_BOOTSTRAP_REPOSITORY_PORT = Symbol('IDENTITY_BOOTSTRAP_REPOSITORY_PORT');

export type IdentityBootstrapVisibleWorkspaceV1 = WorkspaceIdentityV1 & {
  readonly projects: readonly ProjectIdentityV1[];
};

export type IdentityBootstrapVisibleOrganizationV1 = OrganizationIdentityV1 & {
  readonly workspaces: readonly IdentityBootstrapVisibleWorkspaceV1[];
};

export interface IdentityBootstrapVisibleTreeV1 {
  /** Email is only present on the authenticated actor's own bootstrap view. */
  readonly user: UserIdentityV1 & { readonly email?: string; readonly profileRevision?: number };
  readonly organizations: readonly IdentityBootstrapVisibleOrganizationV1[];
}

export interface IdentityBootstrapTransactionPortV1 {
  findByUserId(userId: StableIdentifierV1): Promise<PersonalOrganizationBootstrapV1 | undefined>;
  save(bootstrap: PersonalOrganizationBootstrapV1): Promise<void>;
}

export interface IdentityBootstrapRepositoryPortV1 extends IdentityBootstrapTransactionPortV1 {
  /** Content-safe member-visible organization/workspace/project tree for Web bootstrap. */
  listVisibleByUserId?(
    userId: StableIdentifierV1,
  ): Promise<IdentityBootstrapVisibleTreeV1 | undefined>;
  withTransaction<TValue>(
    work: (transaction: IdentityBootstrapTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}

export type IdentityBootstrapResultV1 =
  | { readonly accepted: true; readonly value: PersonalOrganizationBootstrapV1 }
  | { readonly accepted: false; readonly code: 'BOOTSTRAP_CONFLICT' };
