import { randomUUID, timingSafeEqual } from 'node:crypto';

import {
  consumeInvitationTokenV1,
  createInvitationTokenV1,
  revokeInvitationTokenV1,
  type InvitationTokenV1,
} from '@databreeze/domain/invitation/v1';
import { normalizeEmailAddressV1, validateMembershipV1 } from '@databreeze/domain/identity/v1';
import {
  ACCESS_PRESET_MAPPINGS_V1,
  isMembershipAccessPresetV1,
  roleHasPermissionV1,
  PERMISSIONS_V1,
} from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopeContainsV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamMembershipRecordV1 } from './iam-repository.port.js';
import type {
  IamInvitationRepositoryPortV1,
  IamInvitationTransactionPortV1,
} from './invitation-repository.port.js';
import type { IamTenantContextV1 } from './tenant-context.js';

export const IAM_INVITATION_SERVICE = Symbol('IAM_INVITATION_SERVICE');
export const IAM_PRINCIPAL_EMAIL_LOOKUP_PORT = Symbol('IAM_PRINCIPAL_EMAIL_LOOKUP_PORT');

export type IamInvitationApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_TEXT'
  | 'INVALID_EMAIL'
  | 'INVALID_ROLE'
  | 'INVALID_TOKEN'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'RECIPIENT_MISMATCH'
  | 'CONFLICT'
  | 'DELIVERY_UNAVAILABLE'
  | 'UNAVAILABLE';

export type IamInvitationApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: IamInvitationApplicationCodeV1 };

export interface IamInvitationDigestPortV1 {
  digestToken(rawToken: string): string;
  digestEmail(normalizedEmail: string): string;
}

export type IamInvitationIdGeneratorV1 = () => string;
export type IamInvitationTokenGeneratorV1 = () => string;
export type IamInvitationMembershipIdGeneratorV1 = () => string;
export type IamInvitationClockV1 = () => Date;

export interface IamPrincipalEmailLookupPortV1 {
  findEmail(principalId: StableIdentifierV1): Promise<string | undefined>;
  /** Resolve an already-registered active principal without exposing credentials. */
  findPrincipalIdByEmail?(normalizedEmail: string): Promise<StableIdentifierV1 | undefined>;
}

/** Raw bearer material is deliberately confined to this delivery port. */
export interface IamInvitationDeliveryPortV1 {
  deliver(input: {
    readonly invitationId: StableIdentifierV1;
    readonly membershipId: StableIdentifierV1;
    readonly recipientEmail: string;
    readonly rawToken: string;
    readonly expiresAt: string;
  }): Promise<void>;
}

export interface IamIssuedInvitationV1 {
  readonly invitationId: StableIdentifierV1;
  readonly membershipId: StableIdentifierV1;
  readonly expiresAt: InvitationTokenV1['expiresAt'];
  readonly deliveryStatus: 'DELIVERED';
}

function accepted<TValue>(value: TValue): IamInvitationApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: IamInvitationApplicationCodeV1): IamInvitationApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function stable(input: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed.value : undefined;
}

function rawToken(input: unknown): string | undefined {
  if (typeof input !== 'string' || input.length < 32 || input.length > 512) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  return input;
}

function safeDigestEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function applicationError(error: unknown): IamInvitationApplicationCodeV1 {
  const message = error instanceof Error ? error.message : '';
  if (message === 'IAM_SCOPE_DENIED' || message === 'IAM_SCOPE_NARROWING_REQUIRED')
    return 'SCOPE_DENIED';
  if (
    message === 'IAM_INVITATION_CONFLICT' ||
    message === 'IAM_REVISION_CONFLICT' ||
    message === 'IAM_INVITATION_REVISION_CONFLICT' ||
    message === 'IAM_INVITATION_SCOPE_IMMUTABLE' ||
    message === 'IAM_MEMBERSHIP_SCOPE_IMMUTABLE'
  )
    return 'CONFLICT';
  if (message === 'IAM_INVITATION_INVALID') return 'INVALID_TOKEN';
  return 'UNAVAILABLE';
}

/** IAM-010: issue and redeem one-time invitations without exposing bearer material. */
export class IamInvitationService {
  private readonly deliveryBlocked = new Set<string>();

  public constructor(
    private readonly repository: IamInvitationRepositoryPortV1,
    private readonly principalEmails: IamPrincipalEmailLookupPortV1,
    private readonly idGenerator: IamInvitationIdGeneratorV1,
    private readonly tokenGenerator: IamInvitationTokenGeneratorV1,
    private readonly digest: IamInvitationDigestPortV1,
    private readonly delivery: IamInvitationDeliveryPortV1,
    private readonly clock: IamInvitationClockV1 = () => new Date(),
    private readonly membershipIdGenerator: IamInvitationMembershipIdGeneratorV1 = () =>
      randomUUID(),
  ) {}

  private now(): string | undefined {
    try {
      const value = this.clock();
      return value instanceof Date && Number.isFinite(value.getTime())
        ? value.toISOString()
        : undefined;
    } catch {
      return undefined;
    }
  }

  private async authorize(
    context: IamTenantContextV1,
    target: IamMembershipRecordV1,
    transaction: IamInvitationTransactionPortV1,
  ): Promise<'ALLOWED' | 'DENIED' | 'UNAVAILABLE'> {
    if (!tenantScopeContainsV1(context.tenantScope, target.scope)) return 'DENIED';
    try {
      const actor = await transaction.findMembershipForPrincipal(context, context.actorId);
      return actor && roleHasPermissionV1(actor.roleId, PERMISSIONS_V1.ORGANIZATION_SETTINGS_MANAGE)
        ? 'ALLOWED'
        : 'DENIED';
    } catch {
      return 'UNAVAILABLE';
    }
  }

  public async issue(
    context: IamTenantContextV1,
    input: { readonly membershipId: unknown; readonly recipientEmail: unknown },
  ): Promise<IamInvitationApplicationResultV1<IamIssuedInvitationV1>> {
    const membershipId = stable(input.membershipId);
    if (!membershipId) return rejected('INVALID_IDENTIFIER');
    const normalizedEmail = normalizeEmailAddressV1(input.recipientEmail);
    if (!normalizedEmail.accepted) return rejected('INVALID_EMAIL');
    const issuedAt = this.now();
    if (!issuedAt) return rejected('UNAVAILABLE');
    let invitationId: string;
    let raw: string;
    try {
      invitationId = this.idGenerator();
      raw = this.tokenGenerator();
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (!stable(invitationId) || !rawToken(raw)) return rejected('UNAVAILABLE');
    let pendingDelivery: {
      readonly token: InvitationTokenV1;
      readonly rawToken: string;
      readonly recipientEmail: string;
    };
    try {
      const persisted = await this.repository.withTransaction(context, async (transaction) => {
        const membership = await transaction.findMembershipById(context, membershipId);
        if (!membership) return rejected('NOT_FOUND');
        if (membership.status !== 'INVITED') return rejected('INVALID_STATE');
        const authorization = await this.authorize(context, membership, transaction);
        if (authorization !== 'ALLOWED')
          return rejected(authorization === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SCOPE_DENIED');
        const recipientEmail = await this.principalEmails.findEmail(membership.principalId);
        const normalizedRecipient = normalizeEmailAddressV1(recipientEmail);
        if (!normalizedRecipient.accepted || normalizedRecipient.value !== normalizedEmail.value)
          return rejected('RECIPIENT_MISMATCH');
        if (await transaction.findActiveInvitationForMembership(context, membership.id))
          return rejected('CONFLICT');
        const expiresAt = new Date(Date.parse(issuedAt) + 7 * 24 * 60 * 60 * 1_000).toISOString();
        const token = createInvitationTokenV1({
          id: invitationId,
          membershipId: membership.id,
          principalId: membership.principalId,
          scope: membership.scope,
          roleId: membership.roleId,
          tokenDigest: this.digest.digestToken(raw),
          emailDigest: this.digest.digestEmail(normalizedEmail.value),
          issuedAt,
          expiresAt,
        });
        if (!token.accepted) return rejected('UNAVAILABLE');
        await transaction.saveInvitation(context, token.value);
        return {
          pending: {
            token: token.value,
            rawToken: raw,
            recipientEmail: normalizedEmail.value,
          },
        } as const;
      });
      if (!('pending' in persisted)) return persisted;
      pendingDelivery = persisted.pending;
    } catch (error) {
      return rejected(applicationError(error));
    }

    try {
      await this.delivery.deliver({
        invitationId: pendingDelivery.token.id,
        membershipId: pendingDelivery.token.membershipId,
        recipientEmail: pendingDelivery.recipientEmail,
        rawToken: pendingDelivery.rawToken,
        expiresAt: pendingDelivery.token.expiresAt,
      });
    } catch {
      try {
        await this.repository.withTransaction(context, async (transaction) => {
          const current = await transaction.findInvitationByDigest(
            context,
            pendingDelivery.token.tokenDigest,
          );
          if (!current || current.status !== 'ACTIVE') return;
          const revoked = revokeInvitationTokenV1(current, this.now() ?? issuedAt);
          if (!revoked.accepted) throw new Error('IAM_INVITATION_REVOCATION_INVALID');
          await transaction.saveInvitation(context, revoked.value);
        });
      } catch {
        try {
          await this.repository.withTransaction(context, async (transaction) => {
            if (!transaction.recordDeliveryFailure)
              throw new Error('IAM_INVITATION_MARKER_UNAVAILABLE');
            await transaction.recordDeliveryFailure(
              context,
              pendingDelivery.token.tokenDigest,
              this.now() ?? issuedAt,
            );
          });
        } catch {
          this.deliveryBlocked.add(pendingDelivery.token.tokenDigest);
        }
      }
      return rejected('DELIVERY_UNAVAILABLE');
    }
    return accepted({
      invitationId: pendingDelivery.token.id,
      membershipId: pendingDelivery.token.membershipId,
      expiresAt: pendingDelivery.token.expiresAt,
      deliveryStatus: 'DELIVERED' as const,
    });
  }

  /**
   * IAM-010: create the invited membership and its one-time invitation in the
   * same transaction. The browser supplies only an email and presentation
   * preset; scope, principal, role lifetime, IDs, and bearer material remain
   * server-owned.
   */
  public async issueForEmail(
    context: IamTenantContextV1,
    input: { readonly recipientEmail: unknown; readonly accessPreset: unknown },
  ): Promise<IamInvitationApplicationResultV1<IamIssuedInvitationV1>> {
    if (!isMembershipAccessPresetV1(input.accessPreset)) return rejected('INVALID_ROLE');
    const normalizedEmail = normalizeEmailAddressV1(input.recipientEmail);
    if (!normalizedEmail.accepted) return rejected('INVALID_EMAIL');
    if (this.principalEmails.findPrincipalIdByEmail === undefined) return rejected('UNAVAILABLE');
    let principalId: StableIdentifierV1;
    try {
      const resolved = await this.principalEmails.findPrincipalIdByEmail(normalizedEmail.value);
      if (resolved === undefined) return rejected('NOT_FOUND');
      principalId = resolved;
      const registeredEmail = normalizeEmailAddressV1(
        await this.principalEmails.findEmail(resolved),
      );
      if (!registeredEmail.accepted || registeredEmail.value !== normalizedEmail.value)
        return rejected('RECIPIENT_MISMATCH');
    } catch {
      return rejected('UNAVAILABLE');
    }

    const issuedAt = this.now();
    if (!issuedAt) return rejected('UNAVAILABLE');
    let membershipId: string;
    let invitationId: string;
    let raw: string;
    try {
      membershipId = this.membershipIdGenerator();
      invitationId = this.idGenerator();
      raw = this.tokenGenerator();
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (!stable(membershipId) || !stable(invitationId) || !rawToken(raw))
      return rejected('UNAVAILABLE');

    const expiresAt = new Date(Date.parse(issuedAt) + 7 * 24 * 60 * 60 * 1_000).toISOString();
    const parsedExpiresAt = parseStrictUtcTimestampV1(expiresAt);
    if (!parsedExpiresAt.accepted) return rejected('UNAVAILABLE');
    const candidate = validateMembershipV1({
      id: membershipId,
      principalType: 'USER',
      principalId,
      scope: context.tenantScope,
      roleId: ACCESS_PRESET_MAPPINGS_V1[input.accessPreset].roleId,
      status: 'INVITED',
      startsAt: issuedAt,
      expiresAt,
      revision: 1,
    });
    if (!candidate.accepted) {
      if (candidate.code === 'INVALID_IDENTIFIER') return rejected('INVALID_IDENTIFIER');
      if (candidate.code === 'INVALID_SCOPE') return rejected('INVALID_TEXT');
      if (candidate.code === 'INVALID_ROLE') return rejected('INVALID_ROLE');
      return rejected('INVALID_TEXT');
    }
    const candidateRecord: IamMembershipRecordV1 = Object.freeze({
      id: candidate.value.id,
      principalId: candidate.value.principalId,
      scope: candidate.value.scope,
      roleId: candidate.value.roleId,
      status: candidate.value.status,
      ...(candidate.value.startsAt === undefined ? {} : { startsAt: candidate.value.startsAt }),
      ...(candidate.value.expiresAt === undefined ? {} : { expiresAt: candidate.value.expiresAt }),
      revision: candidate.value.revision,
    });

    let pendingDelivery: {
      readonly token: InvitationTokenV1;
      readonly rawToken: string;
      readonly recipientEmail: string;
    };
    try {
      const persisted = await this.repository.withTransaction(context, async (transaction) => {
        if (await transaction.findMembershipForPrincipal(context, principalId))
          return rejected('CONFLICT');
        const previousInvite = transaction.findInvitedMembershipForPrincipal
          ? await transaction.findInvitedMembershipForPrincipal(context, principalId)
          : undefined;
        let membershipForInvite = candidateRecord;
        if (previousInvite !== undefined) {
          // A delivery failure revokes the token after the membership transaction has
          // committed. Reuse that exact identity instead of attempting a duplicate
          // principal/scope row, and extend only its bounded invitation lifetime.
          if (
            previousInvite.roleId !== candidateRecord.roleId ||
            !tenantScopesEqualV1(previousInvite.scope, context.tenantScope)
          )
            return rejected('CONFLICT');
          if (await transaction.findActiveInvitationForMembership(context, previousInvite.id))
            return rejected('CONFLICT');
          membershipForInvite = Object.freeze({
            ...previousInvite,
            expiresAt: parsedExpiresAt.value,
            revision: previousInvite.revision + 1,
          });
        }
        const authorization = await this.authorize(context, membershipForInvite, transaction);
        if (authorization !== 'ALLOWED')
          return rejected(authorization === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'SCOPE_DENIED');
        if (membershipForInvite.roleId === 'owner') {
          if (context.tenantScope.scopeType !== 'organization') return rejected('INVALID_STATE');
          const actor = await transaction.findMembershipForPrincipal(context, context.actorId);
          if (!actor || actor.roleId !== 'owner') return rejected('SCOPE_DENIED');
        }
        const token = createInvitationTokenV1({
          id: invitationId,
          membershipId: membershipForInvite.id,
          principalId: membershipForInvite.principalId,
          scope: membershipForInvite.scope,
          roleId: membershipForInvite.roleId,
          tokenDigest: this.digest.digestToken(raw),
          emailDigest: this.digest.digestEmail(normalizedEmail.value),
          issuedAt,
          expiresAt,
        });
        if (!token.accepted) return rejected('UNAVAILABLE');
        if (previousInvite !== undefined)
          await transaction.saveMembership(context, membershipForInvite);
        else await transaction.saveMembership(context, candidateRecord);
        await transaction.saveInvitation(context, token.value);
        return {
          pending: {
            token: token.value,
            rawToken: raw,
            recipientEmail: normalizedEmail.value,
          },
        } as const;
      });
      if (!('pending' in persisted)) return persisted;
      pendingDelivery = persisted.pending;
    } catch (error) {
      return rejected(applicationError(error));
    }

    try {
      await this.delivery.deliver({
        invitationId: pendingDelivery.token.id,
        membershipId: pendingDelivery.token.membershipId,
        recipientEmail: pendingDelivery.recipientEmail,
        rawToken: pendingDelivery.rawToken,
        expiresAt: pendingDelivery.token.expiresAt,
      });
    } catch {
      try {
        await this.repository.withTransaction(context, async (transaction) => {
          const current = await transaction.findInvitationByDigest(
            context,
            pendingDelivery.token.tokenDigest,
          );
          if (!current || current.status !== 'ACTIVE') return;
          const revoked = revokeInvitationTokenV1(current, this.now() ?? issuedAt);
          if (!revoked.accepted) throw new Error('IAM_INVITATION_REVOCATION_INVALID');
          await transaction.saveInvitation(context, revoked.value);
        });
      } catch {
        try {
          await this.repository.withTransaction(context, async (transaction) => {
            if (!transaction.recordDeliveryFailure)
              throw new Error('IAM_INVITATION_MARKER_UNAVAILABLE');
            await transaction.recordDeliveryFailure(
              context,
              pendingDelivery.token.tokenDigest,
              this.now() ?? issuedAt,
            );
          });
        } catch {
          this.deliveryBlocked.add(pendingDelivery.token.tokenDigest);
        }
      }
      return rejected('DELIVERY_UNAVAILABLE');
    }
    return accepted({
      invitationId: pendingDelivery.token.id,
      membershipId: pendingDelivery.token.membershipId,
      expiresAt: pendingDelivery.token.expiresAt,
      deliveryStatus: 'DELIVERED' as const,
    });
  }

  public async accept(
    context: IamTenantContextV1,
    rawInput: unknown,
  ): Promise<IamInvitationApplicationResultV1<IamMembershipRecordV1>> {
    const raw = rawToken(rawInput);
    if (!raw) return rejected('INVALID_TEXT');
    let digest: string;
    try {
      digest = this.digest.digestToken(raw);
    } catch {
      return rejected('UNAVAILABLE');
    }
    try {
      if (this.deliveryBlocked.has(digest)) return rejected('INVALID_TOKEN');
      return await this.repository.withTransaction(context, async (transaction) => {
        if (transaction.isDeliveryBlocked && (await transaction.isDeliveryBlocked(context, digest)))
          return rejected('INVALID_TOKEN');
        const token = await transaction.findInvitationByDigest(context, digest);
        if (!token) return rejected('INVALID_TOKEN');
        if (token.principalId !== context.actorId) return rejected('INVALID_TOKEN');
        const recipientEmail = await this.principalEmails.findEmail(context.actorId);
        const normalizedEmail = normalizeEmailAddressV1(recipientEmail);
        if (
          !normalizedEmail.accepted ||
          !safeDigestEqual(this.digest.digestEmail(normalizedEmail.value), token.emailDigest)
        )
          return rejected('INVALID_TOKEN');
        if (!tenantScopeContainsV1(context.tenantScope, token.scope))
          return rejected('INVALID_TOKEN');
        const membership = await transaction.findMembershipById(context, token.membershipId);
        if (
          !membership ||
          membership.status !== 'INVITED' ||
          membership.principalId !== token.principalId ||
          membership.roleId !== token.roleId ||
          !tenantScopesEqualV1(membership.scope, token.scope)
        )
          return rejected('INVALID_TOKEN');
        const now = this.now();
        if (!now) return rejected('UNAVAILABLE');
        const consumed = consumeInvitationTokenV1(token, now);
        if (!consumed.accepted) return rejected('INVALID_TOKEN');
        const {
          startsAt: _startsAt,
          expiresAt: _expiresAt,
          ...membershipWithoutLifetime
        } = membership;
        void _startsAt;
        void _expiresAt;
        const next: IamMembershipRecordV1 = Object.freeze({
          ...membershipWithoutLifetime,
          status: 'ACTIVE',
          revision: membership.revision + 1,
        });
        await transaction.saveInvitation(context, consumed.value);
        await transaction.saveMembership(context, next);
        return accepted(next);
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }
}
