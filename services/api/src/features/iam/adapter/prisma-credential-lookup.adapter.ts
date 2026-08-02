import { normalizeEmailAddressV1 } from '@databreeze/domain/identity/v1';
import { parseStableIdentifierV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  AuthenticatedPrincipalV1,
  CredentialLookupPortV1,
} from '../application/authentication.port.js';

export interface UserIdentityDatabaseRowV1 {
  readonly id: string;
  readonly email: string;
  readonly status: string;
  readonly securityEpoch: number;
}

export interface PasswordCredentialDatabaseRowV1 {
  readonly id: string;
  readonly userId: string;
  readonly algorithm: string;
  readonly encodedHash: string;
}

export interface MembershipIdentityDatabaseRowV1 {
  readonly id: string;
  readonly principalId: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly scopeType: string;
  readonly status: string;
}

export interface WorkspaceIdentityDatabaseRowV1 {
  readonly id: string;
  readonly organizationId: string;
  readonly status: string;
}

export interface OrganizationIdentityDatabaseRowV1 {
  readonly id: string;
  readonly status: string;
}

export interface MfaFactorDatabaseRowV1 {
  readonly id: string;
}

interface UniqueDelegateV1<TRow> {
  findUnique(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<TRow | null>;
}

interface ListDelegateV1<TRow> {
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }): Promise<readonly TRow[]>;
}

export interface CredentialLookupDatabaseClientV1 {
  readonly userIdentity: UniqueDelegateV1<UserIdentityDatabaseRowV1>;
  readonly passwordCredential: UniqueDelegateV1<PasswordCredentialDatabaseRowV1>;
  readonly membershipIdentity: ListDelegateV1<MembershipIdentityDatabaseRowV1>;
  readonly workspaceIdentity: UniqueDelegateV1<WorkspaceIdentityDatabaseRowV1>;
  readonly organizationIdentity: UniqueDelegateV1<OrganizationIdentityDatabaseRowV1>;
  readonly mfaFactor: ListDelegateV1<MfaFactorDatabaseRowV1>;
}

interface ActiveMembershipV1 {
  readonly organizationId: string;
  readonly workspaceId: string;
}

function stableId(input: unknown): string | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function activeMembership(
  row: MembershipIdentityDatabaseRowV1,
  userId: string,
): ActiveMembershipV1 | undefined {
  if (row.principalId !== userId || row.status !== 'ACTIVE' || row.scopeType !== 'WORKSPACE')
    return undefined;
  if (row.projectId !== null) return undefined;
  const organizationId = stableId(row.organizationId);
  const workspaceId = stableId(row.workspaceId);
  if (!organizationId || !workspaceId) return undefined;
  return { organizationId, workspaceId };
}

/**
 * PostgreSQL-backed credential lookup. The adapter deliberately performs the
 * complete ancestry checks instead of trusting a membership row to establish
 * tenant authority.
 */
export class PrismaCredentialLookupAdapter implements CredentialLookupPortV1 {
  public constructor(private readonly client: CredentialLookupDatabaseClientV1) {}

  public async findCredential(emailInput: string): Promise<
    | {
        readonly principal: AuthenticatedPrincipalV1;
        readonly credential: { readonly algorithm: 'argon2id'; readonly encodedHash: string };
      }
    | undefined
  > {
    const normalized = normalizeEmailAddressV1(emailInput);
    if (!normalized.accepted) return undefined;
    const user = await this.client.userIdentity.findUnique({ where: { email: normalized.value } });
    if (!user || user.status !== 'ACTIVE') return undefined;
    const userId = stableId(user.id);
    if (!userId || !Number.isSafeInteger(user.securityEpoch) || user.securityEpoch < 1)
      return undefined;

    const [credential, memberships] = await Promise.all([
      this.client.passwordCredential.findUnique({ where: { userId } }),
      this.client.membershipIdentity.findMany({
        where: { principalId: userId, status: 'ACTIVE' },
        orderBy: { createdAt: 'asc' },
      }),
    ]);
    if (
      !credential ||
      credential.userId !== userId ||
      credential.algorithm !== 'argon2id' ||
      typeof credential.encodedHash !== 'string' ||
      credential.encodedHash.length === 0 ||
      credential.encodedHash.length > 768
    )
      return undefined;

    const selected = memberships
      .map((membership) => activeMembership(membership, userId))
      .find((membership): membership is ActiveMembershipV1 => membership !== undefined);
    if (!selected) return undefined;

    const [organization, workspace, factors] = await Promise.all([
      this.client.organizationIdentity.findUnique({ where: { id: selected.organizationId } }),
      this.client.workspaceIdentity.findUnique({ where: { id: selected.workspaceId } }),
      this.client.mfaFactor.findMany({ where: { userId, status: 'ACTIVE' } }),
    ]);
    if (
      !organization ||
      organization.id !== selected.organizationId ||
      organization.status !== 'ACTIVE' ||
      !workspace ||
      workspace.id !== selected.workspaceId ||
      workspace.organizationId !== selected.organizationId ||
      workspace.status !== 'ACTIVE'
    )
      return undefined;

    return Object.freeze({
      principal: Object.freeze({
        userId,
        organizationId: selected.organizationId,
        workspaceId: selected.workspaceId,
        securityEpoch: user.securityEpoch,
        mfaRequired: factors.length > 0,
      }),
      credential: Object.freeze({
        algorithm: 'argon2id' as const,
        encodedHash: credential.encodedHash,
      }),
    });
  }
}
