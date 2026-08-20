import { randomUUID } from 'node:crypto';

import {
  AGENT_LEVEL_ORDER_V1,
  defaultAgentGrantLevelForPresetV1,
  isAgentGrantLevelV1,
  lesserAgentGrantLevelV1,
  maxAgentGrantLevelForPresetV1,
  PERMISSIONS_V1,
  roleHasPermissionV1,
  type AgentGrantLevelV1,
  type MembershipAccessPresetV1,
} from '@databreeze/domain/permissions/v1';
import {
  parseStableIdentifierV1,
  type StableIdentifierV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { AccessPresetService } from './access-preset.service.js';
import type {
  AgentGrantDatasetTargetValidationPortV1,
  AgentGrantRepositoryPortV1,
  WorkspaceAgentGrantRecordV1,
  WorkspaceDatasetRestrictionRecordV1,
} from './agent-grant-repository.port.js';
import type { IamRepositoryPortV1 } from './iam-repository.port.js';
import type { IamTenantContextV1 } from './tenant-context.js';

export const IAM_AGENT_GRANT_SERVICE = Symbol('IAM_AGENT_GRANT_SERVICE');

export const AGENT_LEVEL_ORDER = AGENT_LEVEL_ORDER_V1;

export type AgentGrantApplicationCodeV1 =
  | 'INVALID_IDENTIFIER'
  | 'INVALID_LEVEL'
  | 'INVALID_DATASET_RESTRICTIONS'
  | 'INVALID_SCOPE'
  | 'SCOPE_DENIED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'STALE_AUTHORIZATION'
  | 'UNAVAILABLE';

export type AgentGrantApplicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: AgentGrantApplicationCodeV1 };

export interface AgentGrantAuthorizationDecisionV1 {
  readonly effectiveLevel: AgentGrantLevelV1;
  readonly allowed: boolean;
  readonly canMutateDatasets: boolean;
  readonly requiresConfirmation: boolean;
  readonly accessPreset: MembershipAccessPresetV1;
  /** Server-owned restrictions for bounded downstream context projection. */
  readonly deniedDatasetIds: readonly StableIdentifierV1[];
}

export interface EffectiveAgentGrantProjectionV1 {
  readonly level: AgentGrantLevelV1;
  readonly revision: number;
}

export type AgentGrantIdGeneratorV1 = () => string;
export type AgentGrantClockV1 = () => Date;

function accepted<TValue>(value: TValue): AgentGrantApplicationResultV1<TValue> {
  return Object.freeze({ accepted: true, value });
}

function rejected(code: AgentGrantApplicationCodeV1): AgentGrantApplicationResultV1<never> {
  return Object.freeze({ accepted: false, code });
}

function parseId(
  input: unknown,
):
  | { readonly accepted: true; readonly value: StableIdentifierV1 }
  | { readonly accepted: false; readonly code: 'INVALID_IDENTIFIER' } {
  const parsed = parseStableIdentifierV1(input);
  return parsed.accepted ? parsed : { accepted: false, code: 'INVALID_IDENTIFIER' };
}

function applicationError(error: unknown): AgentGrantApplicationCodeV1 {
  const message = error instanceof Error ? error.message : '';
  if (message === 'IAM_SCOPE_DENIED' || message === 'IAM_SCOPE_NARROWING_REQUIRED') {
    return 'SCOPE_DENIED';
  }
  if (message === 'IAM_REVISION_CONFLICT') return 'CONFLICT';
  if (message === 'IAM_INVALID_DATASET_RESTRICTIONS') return 'INVALID_DATASET_RESTRICTIONS';
  if (message === 'IAM_STALE_AUTHORIZATION') return 'STALE_AUTHORIZATION';
  if (message.endsWith('_NOT_FOUND')) return 'NOT_FOUND';
  return 'UNAVAILABLE';
}

function requireWorkspace(context: IamTenantContextV1): boolean {
  return context.tenantScope.scopeType === 'workspace';
}

const MAX_DENIED_DATASET_IDS = 200;

function canonicalDatasetIds(input: unknown):
  | { readonly accepted: true; readonly value: readonly StableIdentifierV1[] }
  | {
      readonly accepted: false;
      readonly code: 'INVALID_DATASET_RESTRICTIONS' | 'INVALID_IDENTIFIER';
    } {
  if (!Array.isArray(input) || input.length > MAX_DENIED_DATASET_IDS) {
    return { accepted: false, code: 'INVALID_DATASET_RESTRICTIONS' };
  }
  const unique = new Set<StableIdentifierV1>();
  for (const candidate of input) {
    const parsed = parseId(candidate);
    if (!parsed.accepted) return parsed;
    unique.add(parsed.value);
  }
  return { accepted: true, value: Object.freeze([...unique].sort()) };
}

class UnavailableAgentGrantDatasetTargetValidationAdapter
  implements AgentGrantDatasetTargetValidationPortV1
{
  public async validate(context: IamTenantContextV1, datasetIds: readonly StableIdentifierV1[]) {
    void context;
    void datasetIds;
    await Promise.resolve();
    return { accepted: false as const, code: 'UNAVAILABLE' as const };
  }
}

/** IAM-024 / IAM-025: independent agent grants that never expand dataset or action permission. */
export class AgentGrantService {
  public constructor(
    private readonly grants: AgentGrantRepositoryPortV1,
    private readonly memberships: IamRepositoryPortV1,
    private readonly accessPresets: AccessPresetService,
    private readonly idGenerator: AgentGrantIdGeneratorV1 = () => randomUUID(),
    private readonly clock: AgentGrantClockV1 = () => new Date(),
    private readonly datasetTargets: AgentGrantDatasetTargetValidationPortV1 = new UnavailableAgentGrantDatasetTargetValidationAdapter(),
  ) {}

  private async requireOwner(
    context: IamTenantContextV1,
  ): Promise<'ALLOWED' | 'DENIED' | 'UNAVAILABLE'> {
    if (!requireWorkspace(context)) return 'DENIED';
    try {
      const membership = await this.memberships.findMembership(context, context.actorId);
      return membership &&
        roleHasPermissionV1(membership.roleId, PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE)
        ? 'ALLOWED'
        : 'DENIED';
    } catch {
      return 'UNAVAILABLE';
    }
  }

  private async resolveMember(
    context: IamTenantContextV1,
    memberId: StableIdentifierV1,
    allowOrganizationActor = false,
  ): Promise<
    | {
        readonly accepted: true;
        readonly membershipId: StableIdentifierV1;
        readonly principalId: StableIdentifierV1;
        readonly preset: MembershipAccessPresetV1;
        readonly membershipScopeType: 'workspace' | 'organization';
      }
    | { readonly accepted: false; readonly code: 'NOT_FOUND' | 'UNAVAILABLE' }
  > {
    try {
      const memberships = await this.memberships.listMemberships(context);
      const matchingMemberships = memberships.filter(
        (item) =>
          item.status === 'ACTIVE' && (item.id === memberId || item.principalId === memberId),
      );
      const membership =
        matchingMemberships.find((item) => item.scope.scopeType === 'workspace') ??
        (allowOrganizationActor
          ? matchingMemberships.find(
              (item) =>
                item.scope.scopeType === 'organization' &&
                item.scope.organizationId === context.tenantScope.organizationId &&
                item.principalId === context.actorId,
            )
          : undefined);
      if (!membership) return { accepted: false, code: 'NOT_FOUND' };
      const membershipScopeType = membership.scope.scopeType;
      if (membershipScopeType !== 'workspace' && membershipScopeType !== 'organization') {
        return { accepted: false, code: 'NOT_FOUND' };
      }
      const preset = this.accessPresets.presetForRoleId(membership.roleId);
      if (!preset) return { accepted: false, code: 'NOT_FOUND' };
      return {
        accepted: true,
        membershipId: membership.id,
        principalId: membership.principalId,
        preset,
        membershipScopeType,
      };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }

  public async getMemberGrant(
    context: IamTenantContextV1,
    input: { readonly memberId: unknown },
  ): Promise<
    AgentGrantApplicationResultV1<
      WorkspaceAgentGrantRecordV1 | { readonly level: AgentGrantLevelV1; readonly revision: 0 }
    >
  > {
    const authority = await this.requireOwner(context);
    if (authority === 'DENIED') return rejected('SCOPE_DENIED');
    if (authority === 'UNAVAILABLE') return rejected('UNAVAILABLE');
    const memberId = parseId(input.memberId);
    if (!memberId.accepted) return rejected(memberId.code);
    const member = await this.resolveMember(context, memberId.value);
    if (!member.accepted) return rejected(member.code);
    try {
      const grant = await this.grants.findGrant(context, member.membershipId);
      if (grant) return accepted(grant);
      return accepted(
        Object.freeze({
          level: defaultAgentGrantLevelForPresetV1(member.preset),
          revision: 0 as const,
        }),
      );
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async setMemberGrant(
    context: IamTenantContextV1,
    input: {
      readonly memberId: unknown;
      readonly level: unknown;
      readonly expectedRevision: unknown;
    },
  ): Promise<AgentGrantApplicationResultV1<WorkspaceAgentGrantRecordV1>> {
    const authority = await this.requireOwner(context);
    if (authority === 'DENIED') return rejected('SCOPE_DENIED');
    if (authority === 'UNAVAILABLE') return rejected('UNAVAILABLE');
    if (!requireWorkspace(context)) return rejected('INVALID_SCOPE');
    const memberId = parseId(input.memberId);
    if (!memberId.accepted) return rejected(memberId.code);
    if (!isAgentGrantLevelV1(input.level)) return rejected('INVALID_LEVEL');
    const level: AgentGrantLevelV1 = input.level;
    if (
      typeof input.expectedRevision !== 'number' ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 1
    ) {
      return rejected('CONFLICT');
    }
    const member = await this.resolveMember(context, memberId.value);
    if (!member.accepted) return rejected(member.code);
    const maximumLevel = maxAgentGrantLevelForPresetV1(member.preset);
    // A grant can never raise the member above the role's capability ceiling.
    // Persist the requested grant capped to that ceiling so settings remain
    // editable without creating an authority that the role cannot exercise.
    const cappedLevel = lesserAgentGrantLevelV1(level, maximumLevel);
    const updatedAt = this.clock().toISOString();
    const generatedId = parseId(this.idGenerator());
    if (!generatedId.accepted) return rejected('INVALID_IDENTIFIER');
    if (context.tenantScope.scopeType !== 'workspace' || !context.tenantScope.workspaceId) {
      return rejected('INVALID_SCOPE');
    }
    const workspaceId = context.tenantScope.workspaceId;
    try {
      return await this.grants.withTransaction(context, async (transaction) => {
        const existing = await transaction.findGrant(context, member.membershipId);
        const nextRevision = existing ? existing.revision + 1 : 1;
        if (existing) {
          if (input.expectedRevision !== existing.revision)
            throw new Error('IAM_REVISION_CONFLICT');
        } else if (input.expectedRevision !== 1) {
          throw new Error('IAM_REVISION_CONFLICT');
        }
        const grant: WorkspaceAgentGrantRecordV1 = Object.freeze({
          id: existing?.id ?? generatedId.value,
          tenantScope: {
            scopeType: 'workspace' as const,
            organizationId: context.tenantScope.organizationId,
            workspaceId,
          },
          memberId: member.membershipId,
          level: cappedLevel,
          revision: nextRevision,
          updatedAt: updatedAt as WorkspaceAgentGrantRecordV1['updatedAt'],
        });
        await transaction.saveGrant(context, grant, input.expectedRevision);
        await transaction.bumpAuthorizationEpoch(context);
        return accepted(grant);
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  /** IAM-024: readable effective level for any active workspace member; mutation remains owner-only. */
  public async getEffectiveGrantProjection(
    context: IamTenantContextV1,
    input: { readonly memberId: unknown },
  ): Promise<AgentGrantApplicationResultV1<EffectiveAgentGrantProjectionV1>> {
    if (!requireWorkspace(context)) return rejected('INVALID_SCOPE');
    try {
      const actor = await this.memberships.findMembership(context, context.actorId);
      if (!actor || !roleHasPermissionV1(actor.roleId, PERMISSIONS_V1.WORKSPACE_SETTINGS_READ)) {
        return rejected('SCOPE_DENIED');
      }
    } catch {
      return rejected('UNAVAILABLE');
    }
    const memberId = parseId(input.memberId);
    if (!memberId.accepted) return rejected(memberId.code);
    const member = await this.resolveMember(context, memberId.value);
    if (!member.accepted) return rejected(member.code);
    try {
      const stored = await this.grants.findGrant(context, member.membershipId);
      const storedLevel = stored?.level ?? defaultAgentGrantLevelForPresetV1(member.preset);
      return accepted({
        level: lesserAgentGrantLevelV1(storedLevel, maxAgentGrantLevelForPresetV1(member.preset)),
        revision: stored?.revision ?? 0,
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async setDatasetRestrictions(
    context: IamTenantContextV1,
    input: {
      readonly memberId: unknown;
      readonly deniedDatasetIds: readonly unknown[];
      readonly expectedRevision: unknown;
    },
  ): Promise<
    AgentGrantApplicationResultV1<{
      readonly memberId: StableIdentifierV1;
      readonly deniedDatasetIds: readonly StableIdentifierV1[];
      readonly revision: number;
    }>
  > {
    const authority = await this.requireOwner(context);
    if (authority === 'DENIED') return rejected('SCOPE_DENIED');
    if (authority === 'UNAVAILABLE') return rejected('UNAVAILABLE');
    const memberId = parseId(input.memberId);
    if (!memberId.accepted) return rejected(memberId.code);
    if (
      typeof input.expectedRevision !== 'number' ||
      !Number.isSafeInteger(input.expectedRevision) ||
      input.expectedRevision < 0
    ) {
      return rejected('CONFLICT');
    }
    const canonical = canonicalDatasetIds(input.deniedDatasetIds);
    if (!canonical.accepted) return rejected(canonical.code);
    const member = await this.resolveMember(context, memberId.value);
    if (!member.accepted) return rejected(member.code);
    let targetValidation: Awaited<ReturnType<AgentGrantDatasetTargetValidationPortV1['validate']>>;
    try {
      targetValidation = await this.datasetTargets.validate(context, canonical.value);
    } catch {
      return rejected('UNAVAILABLE');
    }
    if (!targetValidation.accepted) return rejected(targetValidation.code);
    const updatedAt = this.clock().toISOString();
    try {
      return await this.grants.withTransaction(context, async (transaction) => {
        const existing = await transaction.findDatasetRestrictions(context, member.membershipId);
        const nextRevision = existing ? existing.revision + 1 : 1;
        if (existing) {
          if (input.expectedRevision !== existing.revision)
            throw new Error('IAM_REVISION_CONFLICT');
        } else if (input.expectedRevision !== 0 && input.expectedRevision !== 1) {
          throw new Error('IAM_REVISION_CONFLICT');
        }
        const record: WorkspaceDatasetRestrictionRecordV1 = Object.freeze({
          memberId: member.membershipId,
          deniedDatasetIds: canonical.value,
          revision: nextRevision,
          updatedAt: updatedAt as WorkspaceAgentGrantRecordV1['updatedAt'],
        });
        await transaction.saveDatasetRestrictions(
          context,
          record,
          input.expectedRevision === 0 ? undefined : input.expectedRevision,
        );
        const nextEpoch = await transaction.bumpAuthorizationEpoch(context);
        const durableContext =
          context.workspaceAuthorizationEpoch === undefined
            ? context
            : Object.freeze({ ...context, workspaceAuthorizationEpoch: nextEpoch });
        const durable = await transaction.findDatasetRestrictions(
          durableContext,
          member.membershipId,
        );
        if (!durable) throw new Error('IAM_DATASET_RESTRICTION_PERSISTENCE_UNAVAILABLE');
        return accepted({
          memberId: durable.memberId,
          deniedDatasetIds: durable.deniedDatasetIds,
          revision: durable.revision,
        });
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async getDatasetRestrictions(
    context: IamTenantContextV1,
    input: { readonly memberId: unknown },
  ): Promise<
    AgentGrantApplicationResultV1<{
      readonly memberId: StableIdentifierV1;
      readonly deniedDatasetIds: readonly StableIdentifierV1[];
      readonly revision: number;
    }>
  > {
    const authority = await this.requireOwner(context);
    if (authority === 'DENIED') return rejected('SCOPE_DENIED');
    if (authority === 'UNAVAILABLE') return rejected('UNAVAILABLE');
    const memberId = parseId(input.memberId);
    if (!memberId.accepted) return rejected(memberId.code);
    const member = await this.resolveMember(context, memberId.value);
    if (!member.accepted) return rejected(member.code);
    try {
      const durable = await this.grants.findDatasetRestrictions(context, member.membershipId);
      return accepted({
        memberId: member.membershipId,
        deniedDatasetIds: durable?.deniedDatasetIds ?? Object.freeze([]),
        revision: durable?.revision ?? 0,
      });
    } catch (error) {
      return rejected(applicationError(error));
    }
  }

  public async authorize(input: {
    readonly context: IamTenantContextV1;
    readonly memberId: unknown;
    readonly requestedLevel: unknown;
    readonly resourceIds: readonly unknown[];
    readonly confirmationPresent?: boolean;
  }): Promise<AgentGrantApplicationResultV1<AgentGrantAuthorizationDecisionV1>> {
    if (!requireWorkspace(input.context)) return rejected('INVALID_SCOPE');
    const memberId = parseId(input.memberId);
    if (!memberId.accepted) return rejected(memberId.code);
    if (!isAgentGrantLevelV1(input.requestedLevel)) return rejected('INVALID_LEVEL');
    const resourceIds: StableIdentifierV1[] = [];
    for (const candidate of input.resourceIds) {
      const parsed = parseId(candidate);
      if (!parsed.accepted) return rejected(parsed.code);
      resourceIds.push(parsed.value);
    }
    try {
      const currentEpoch = await this.grants.resolveWorkspaceAuthorizationEpoch(input.context);
      const contextEpoch =
        input.context.workspaceAuthorizationEpoch ?? input.context.authorizationEpoch;
      if (currentEpoch !== contextEpoch) return rejected('STALE_AUTHORIZATION');
      const member = await this.resolveMember(input.context, memberId.value, true);
      if (!member.accepted) return rejected(member.code);
      let deniedDatasetIds: readonly StableIdentifierV1[] = Object.freeze([]);
      let storedLevel = defaultAgentGrantLevelForPresetV1(member.preset);
      if (member.membershipScopeType === 'workspace') {
        const restrictions = await this.grants.findDatasetRestrictions(
          input.context,
          member.membershipId,
        );
        deniedDatasetIds = restrictions?.deniedDatasetIds ?? [];
        if (restrictions) {
          const denied = new Set(deniedDatasetIds);
          if (resourceIds.some((resourceId) => denied.has(resourceId))) {
            return rejected('NOT_FOUND');
          }
        }
        const stored = await this.grants.findGrant(input.context, member.membershipId);
        storedLevel = stored?.level ?? storedLevel;
      }
      const capacity = maxAgentGrantLevelForPresetV1(member.preset);
      const effectiveLevel = lesserAgentGrantLevelV1(
        lesserAgentGrantLevelV1(storedLevel, capacity),
        input.requestedLevel,
      );
      const canMutateDatasets = member.preset !== 'VIEWER';
      const requiresConfirmation =
        input.requestedLevel === 'APPLY_CONFIRMED_CHANGES' && input.confirmationPresent !== true;
      const allowed =
        AGENT_LEVEL_ORDER_V1[effectiveLevel] >= AGENT_LEVEL_ORDER_V1[input.requestedLevel] &&
        !(input.requestedLevel === 'APPLY_CONFIRMED_CHANGES' && requiresConfirmation) &&
        (input.requestedLevel !== 'APPLY_CONFIRMED_CHANGES' || canMutateDatasets);
      const decision = {
        effectiveLevel,
        allowed,
        canMutateDatasets,
        requiresConfirmation,
        accessPreset: member.preset,
      };
      // DDA receives this server-only projection, while IAM HTTP serialization must not enumerate it.
      Object.defineProperty(decision, 'deniedDatasetIds', {
        value: Object.freeze([...deniedDatasetIds]),
        enumerable: false,
      });
      return accepted(Object.freeze(decision) as AgentGrantAuthorizationDecisionV1);
    } catch (error) {
      return rejected(applicationError(error));
    }
  }
}
