import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type {
  DashboardPublicationApprovalLookupV1,
  DashboardPublicationApprovalInvalidationInstructionV1,
  DashboardPublicationApprovalPortV1,
} from '../application/dashboard-publication-approval.port.js';
import type {
  DashboardPublicationApprovalInvalidationExecutorPortV1,
  DashboardPublicationApprovalInvalidationResultV1,
} from '../application/dashboard-publication-approval-invalidation.port.js';
import type { JraApprovalAuthorityPortV1 } from '../../../jra/application/approval-authority.port.js';
import { sameApprovalScopeV1 } from '../../../jra/application/approval-authority.port.js';

type PublicationAudience = 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';

interface ClockOptions {
  readonly now?: () => Date;
}

/**
 * DDA-025/JRA-028: a publication-specific facade over JRA's canonical authority.
 * DDA never resolves or accepts an approval identifier from the caller.
 */
export class JraDashboardPublicationApprovalAdapter
  implements
    DashboardPublicationApprovalPortV1,
    DashboardPublicationApprovalInvalidationExecutorPortV1
{
  public constructor(
    private readonly authority: JraApprovalAuthorityPortV1,
    private readonly options: ClockOptions = {},
  ) {}

  public async findCurrentPublicationApproval(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly versionId: string;
    readonly canonicalHash: string;
    readonly audience: PublicationAudience;
  }): Promise<DashboardPublicationApprovalLookupV1> {
    const valid = validatedInput(input);
    if (valid === false) return { accepted: false, code: 'INVALID' };
    try {
      const result = await this.authority.findCurrentApproved({
        tenantScope: valid.tenantScope,
        subjectType: 'DASHBOARD_VERSION',
        subjectId: valid.dashboardId,
        subjectHash: input.canonicalHash,
        requestedAction: 'PUBLISH',
        binding: {
          versionId: valid.versionId,
          audience: input.audience,
        },
      });
      if (!result.accepted) {
        return result.code === 'UNAVAILABLE'
          ? { accepted: false, code: 'UNAVAILABLE' }
          : { accepted: false, code: result.code === 'INVALID' ? 'INVALID' : 'NOT_FOUND' };
      }

      const now = this.options.now?.() ?? new Date();
      if (
        result.request.status !== 'APPROVED' ||
        !sameApprovalScopeV1(result.request.tenantScope, input.tenantScope) ||
        result.request.subjectType !== 'DASHBOARD_VERSION' ||
        result.request.subjectId !== input.dashboardId ||
        result.request.subjectHash !== input.canonicalHash ||
        result.request.requestedAction !== 'PUBLISH' ||
        result.policy.status !== 'ACTIVE' ||
        !matchesPolicy(result.policy.actionMatcher, input) ||
        !Number.isFinite(Date.parse(result.validUntil)) ||
        Date.parse(result.validUntil) <= now.getTime()
      ) {
        return { accepted: false, code: 'INVALID' };
      }
      return {
        accepted: true,
        value: Object.freeze({
          approvalId: result.request.requestId,
          tenantScope: input.tenantScope,
          subjectType: 'DASHBOARD_VERSION',
          subjectId: input.dashboardId,
          versionId: input.versionId,
          canonicalHash: input.canonicalHash,
          action: 'PUBLISH',
          audience: input.audience,
          state: 'APPROVED',
          validUntil: result.validUntil,
        }),
      };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }

  public async preparePublicationApprovalInvalidation(input: {
    readonly tenantScope: TenantScopeV1;
    readonly dashboardId: string;
    readonly priorPublishedVersionId: string;
  }): Promise<
    | {
        readonly accepted: true;
        readonly value: DashboardPublicationApprovalInvalidationInstructionV1;
      }
    | { readonly accepted: false; readonly code: 'UNAVAILABLE' | 'INVALID' }
  > {
    await Promise.resolve();
    const scope = parseTenantScopeV1(input.tenantScope);
    const dashboardId = parseStableIdentifierV1(input.dashboardId);
    const priorVersionId = parseStableIdentifierV1(input.priorPublishedVersionId);
    if (!scope.accepted || !dashboardId.accepted || !priorVersionId.accepted) {
      return { accepted: false, code: 'INVALID' };
    }
    return {
      accepted: true,
      value: Object.freeze({
        tenantScope: scope.value,
        dashboardId: dashboardId.value,
        priorPublishedVersionId: priorVersionId.value,
      }),
    };
  }

  /** Executes only a committed outbox instruction; prepare above has no JRA side effect. */
  public async invalidatePublicationApproval(
    input: DashboardPublicationApprovalInvalidationInstructionV1,
  ): Promise<DashboardPublicationApprovalInvalidationResultV1> {
    const scope = parseTenantScopeV1(input.tenantScope);
    const dashboardId = parseStableIdentifierV1(input.dashboardId);
    const priorVersionId = parseStableIdentifierV1(input.priorPublishedVersionId);
    if (!scope.accepted || !dashboardId.accepted || !priorVersionId.accepted) {
      return { accepted: false, code: 'INVALID' };
    }
    try {
      const invalidated = await this.authority.invalidatePriorVersion({
        tenantScope: scope.value,
        subjectType: 'DASHBOARD_VERSION',
        subjectId: dashboardId.value,
        requestedAction: 'PUBLISH',
        priorVersionId: priorVersionId.value,
      });
      if (!invalidated.accepted) return { accepted: false, code: invalidated.code };
      return { accepted: true };
    } catch {
      return { accepted: false, code: 'UNAVAILABLE' };
    }
  }
}

function validatedInput(input: {
  readonly tenantScope: TenantScopeV1;
  readonly dashboardId: string;
  readonly versionId: string;
  readonly canonicalHash: string;
  readonly audience: PublicationAudience;
}):
  | {
      readonly tenantScope: TenantScopeV1;
      readonly dashboardId: StableIdentifierV1;
      readonly versionId: StableIdentifierV1;
    }
  | false {
  const scope = parseTenantScopeV1(input.tenantScope);
  const dashboardId = parseStableIdentifierV1(input.dashboardId);
  const versionId = parseStableIdentifierV1(input.versionId);
  if (!scope.accepted || !dashboardId.accepted || !versionId.accepted) return false;
  if (!/^[0-9a-f]{64}$/u.test(input.canonicalHash)) return false;
  if (
    input.audience !== 'OWNER' &&
    input.audience !== 'WORKSPACE_VIEWERS' &&
    input.audience !== 'PROJECT_VIEWERS'
  ) {
    return false;
  }
  return {
    tenantScope: scope.value,
    dashboardId: dashboardId.value,
    versionId: versionId.value,
  };
}

function matchesPolicy(
  matcher: Readonly<Record<string, string>>,
  input: {
    readonly dashboardId: string;
    readonly versionId: string;
    readonly audience: PublicationAudience;
  },
): boolean {
  return (
    matcher['actionType'] === 'PUBLISH' &&
    matcher['subjectType'] === 'DASHBOARD_VERSION' &&
    matcher['subjectId'] === input.dashboardId &&
    matcher['versionId'] === input.versionId &&
    matcher['audience'] === input.audience
  );
}
