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
  readonly mfaReenrollmentRequired?: boolean;
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
  findUnique(input: { readonly where: Readonly<Record<string, unknown>> }): Promise<TRow | null>;
}

interface WorkspaceLookupDelegateV1 extends UniqueDelegateV1<WorkspaceIdentityDatabaseRowV1> {
  readonly findMany?: (input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: Readonly<Record<string, 'asc' | 'desc'>>;
  }) => Promise<readonly WorkspaceIdentityDatabaseRowV1[]>;
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
  readonly workspaceIdentity: WorkspaceLookupDelegateV1;
  readonly organizationIdentity: UniqueDelegateV1<OrganizationIdentityDatabaseRowV1>;
  readonly mfaFactor: ListDelegateV1<MfaFactorDatabaseRowV1>;
}

interface ActiveMembershipV1 {
  readonly organizationId: string;
  readonly workspaceId?: string;
}

function stableId(input: unknown): string | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function activeMembership(
  row: MembershipIdentityDatabaseRowV1,
  userId: string,
): ActiveMembershipV1 | undefined {
  if (row.principalId !== userId || row.status !== 'ACTIVE') return undefined;
  const organizationId = stableId(row.organizationId);
  if (!organizationId) return undefined;
  if (row.scopeType === 'WORKSPACE') {
    if (row.projectId !== null) return undefined;
    const workspaceId = stableId(row.workspaceId);
    return workspaceId ? { organizationId, workspaceId } : undefined;
  }
  if (row.scopeType === 'ORGANIZATION' && row.workspaceId === null && row.projectId === null)
    return { organizationId };
  return undefined;
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
      .filter((membership): membership is ActiveMembershipV1 => membership !== undefined)
      .sort((left, right) =>
        `${left.organizationId}:${left.workspaceId ?? ''}`.localeCompare(
          `${right.organizationId}:${right.workspaceId ?? ''}`,
        ),
      )
      .at(0);
    if (!selected) return undefined;

    const [organization, factors] = await Promise.all([
      this.client.organizationIdentity.findUnique({ where: { id: selected.organizationId } }),
      this.client.mfaFactor.findMany({ where: { userId, status: 'ACTIVE' } }),
    ]);
    let workspaceId = selected.workspaceId;
    if (!workspaceId) {
      if (!this.client.workspaceIdentity.findMany) return undefined;
      const workspaces = await this.client.workspaceIdentity.findMany({
        where: { organizationId: selected.organizationId, status: 'ACTIVE' },
        orderBy: { id: 'asc' },
      });
      const workspace = workspaces.find(
        (candidate) =>
          candidate.organizationId === selected.organizationId && candidate.status === 'ACTIVE',
      );
      workspaceId = workspace ? stableId(workspace.id) : undefined;
    }
    if (!workspaceId) return undefined;
    const workspace = await this.client.workspaceIdentity.findUnique({
      where: { id: workspaceId },
    });
    if (
      !organization ||
      organization.id !== selected.organizationId ||
      organization.status !== 'ACTIVE' ||
      !workspace ||
      workspace.id !== workspaceId ||
      workspace.organizationId !== selected.organizationId ||
      workspace.status !== 'ACTIVE'
    )
      return undefined;

    return Object.freeze({
      principal: Object.freeze({
        userId,
        organizationId: selected.organizationId,
        workspaceId,
        securityEpoch: user.securityEpoch,
        mfaRequired: factors.length > 0,
        ...(user.mfaReenrollmentRequired === undefined
          ? {}
          : { mfaReenrollmentRequired: user.mfaReenrollmentRequired }),
      }),
      credential: Object.freeze({
        algorithm: 'argon2id' as const,
        encodedHash: credential.encodedHash,
      }),
    });
  }
}
