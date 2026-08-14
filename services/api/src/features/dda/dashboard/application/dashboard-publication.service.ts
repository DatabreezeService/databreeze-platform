import type {
  DashboardSnapshotV1,
  DashboardVersionV1,
} from '@databreeze/domain/data-to-dashboard/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';
import type { DashboardAuthorizationPortV1 } from './dashboard-authorization.port.js';
import {
  validateDashboardPublicationResolvedProjectionV1,
  type DashboardDraftRepositoryPortV1,
  type DashboardPublicationResolvedProjectionV1,
} from './dashboard-repository.port.js';
import type {
  DashboardPublicationApprovalPortV1,
  DashboardPublicationApprovalInvalidationInstructionV1,
  DashboardPublicationApprovalV1,
} from './dashboard-publication-approval.port.js';
import type { DashboardPublicationAudiencePortV1 } from './dashboard-publication-audience.port.js';
import type {
  DashboardPublicationAuditOutboxMetadataV1,
  DashboardPublicationAuditOutboxPortV1,
} from './dashboard-publication-audit-outbox.port.js';
import type { DashboardPublicationMaterializationPortV1 } from './dashboard-publication-materialization.port.js';

export type DashboardPublicationErrorV1 =
  | 'UNAUTHORIZED'
  | 'VERSION_NOT_FOUND'
  | 'REVISION_CONFLICT'
  | 'APPROVAL_INVALIDATED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_SNAPSHOT';

export type DashboardPublicationResultV1<TValue> =
  | { readonly accepted: true; readonly value: TValue }
  | { readonly accepted: false; readonly code: DashboardPublicationErrorV1 };

export interface DashboardPublicationDependenciesV1 {
  readonly materializations: DashboardPublicationMaterializationPortV1;
  readonly approvals: DashboardPublicationApprovalPortV1;
  readonly audience: DashboardPublicationAudiencePortV1;
  readonly auditOutbox: DashboardPublicationAuditOutboxPortV1;
}

function sameScope(
  left: IamTenantContextV1['tenantScope'],
  right: DashboardVersionV1['tenantScope'],
): boolean {
  if (left.scopeType !== right.scopeType || left.organizationId !== right.organizationId) {
    return false;
  }
  if ('workspaceId' in left || 'workspaceId' in right) {
    if (
      !('workspaceId' in left) ||
      !('workspaceId' in right) ||
      left.workspaceId !== right.workspaceId
    ) {
      return false;
    }
  }
  if ('projectId' in left || 'projectId' in right) {
    if (!('projectId' in left) || !('projectId' in right) || left.projectId !== right.projectId) {
      return false;
    }
  }
  return true;
}

function validateResolvedMaterializations(
  context: IamTenantContextV1,
  version: DashboardVersionV1,
  materializations: unknown,
  bindingProof: unknown,
  freshnessState: unknown,
  evidenceState: unknown,
):
  | ({ readonly accepted: true } & DashboardPublicationResolvedProjectionV1)
  | { readonly accepted: false } {
  const checked = validateDashboardPublicationResolvedProjectionV1({
    tenantScope: context.tenantScope,
    version,
    projection: {
      materializations: materializations as never,
      bindingProof: bindingProof as never,
      freshnessState: freshnessState as never,
      evidenceState: evidenceState as never,
    },
  });
  if (!checked.accepted) return checked;
  return { accepted: true, ...checked.value };
}

function validApproval(
  approval: DashboardPublicationApprovalV1,
  context: IamTenantContextV1,
  dashboardId: string,
  version: DashboardVersionV1,
  audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS',
): boolean {
  if (
    approval.state !== 'APPROVED' ||
    approval.subjectType !== 'DASHBOARD_VERSION' ||
    approval.subjectId !== dashboardId ||
    approval.versionId !== version.versionId ||
    approval.canonicalHash !== version.canonicalHash ||
    approval.action !== 'PUBLISH' ||
    approval.audience !== audience ||
    !sameScope(context.tenantScope, approval.tenantScope)
  ) {
    return false;
  }
  return approval.validUntil === undefined || Date.parse(approval.validUntil) > Date.now();
}

function validAuditMetadata(
  metadata: DashboardPublicationAuditOutboxMetadataV1,
  context: IamTenantContextV1,
  approvalId?: string,
): boolean {
  return (
    metadata.actorId === context.actorId &&
    metadata.correlationId === context.correlationId &&
    metadata.authorizationEpoch === context.authorizationEpoch &&
    metadata.approvalId === approvalId
  );
}

/** DDA-025/026/032 and AUD-003: server-owned publication admission and atomic commit. */
export class DashboardPublicationServiceV1 {
  public constructor(
    private readonly repository: DashboardDraftRepositoryPortV1,
    private readonly authorization: DashboardAuthorizationPortV1,
    private readonly dependencies?: DashboardPublicationDependenciesV1,
  ) {}

  public async publish(
    context: IamTenantContextV1,
    input: {
      readonly dashboardId: string;
      readonly versionId: string;
      readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS' | 'SHARED_LINK';
      /** Retained for contract compatibility; server publication never reads it. */
      readonly materializationIds?: readonly string[];
      /** Retained for contract compatibility; server publication never reads it. */
      readonly permissionProjectionVersionId?: string;
      readonly expectedRevision: number;
      readonly idempotencyKey: string;
      /** Retained for contract compatibility; server publication never reads it. */
      readonly approvalId?: string;
    },
  ): Promise<DashboardPublicationResultV1<DashboardSnapshotV1>> {
    const auth = await this.authorization.authorizeDashboardAction({
      context,
      tenantScope: context.tenantScope,
      actorId: context.actorId,
      dashboardId: input.dashboardId,
      action: 'PUBLISH',
    });
    if (!auth.allowed) return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const });

    if (input.audience === 'SHARED_LINK') {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }
    const dependencies = this.dependencies;
    if (dependencies === undefined) {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }

    const audience = await dependencies.audience.authorizePublicationAudience({
      tenantScope: context.tenantScope,
      actorId: context.actorId,
      dashboardId: input.dashboardId,
      versionId: input.versionId,
      audience: input.audience,
      authorizationEpoch: context.authorizationEpoch,
    });
    if (!audience.allowed) return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' as const });

    const replay = await this.repository.findPublicationReplay?.({
      tenantScope: context.tenantScope,
      dashboardId: input.dashboardId,
      versionId: input.versionId,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      audience: input.audience,
    });
    if (replay?.kind === 'REPLAY') {
      return Object.freeze({ accepted: true, value: replay.snapshot });
    }
    if (replay?.kind === 'CONFLICT') {
      return Object.freeze({ accepted: false, code: 'IDEMPOTENCY_CONFLICT' as const });
    }
    if (replay?.kind === 'INVALID') {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }

    const version = await this.repository.findVersion(context.tenantScope, input.versionId);
    const identity = await this.repository.findIdentity(context.tenantScope, input.dashboardId);
    if (
      version === undefined ||
      identity === undefined ||
      version.dashboardId !== input.dashboardId ||
      version.versionId !== input.versionId ||
      !sameScope(context.tenantScope, version.tenantScope) ||
      !sameScope(context.tenantScope, identity.tenantScope)
    ) {
      return Object.freeze({ accepted: false, code: 'VERSION_NOT_FOUND' as const });
    }
    // Admission is deliberately before resolver and approval work. A stale
    // revision must not cause any approval-side effects or preparation.
    if (identity.revision !== input.expectedRevision) {
      return Object.freeze({ accepted: false, code: 'REVISION_CONFLICT' as const });
    }
    // DRAFT_ONLY is not an authoritative publication policy. Fail closed
    // before any mutable resolver, approval, or commit work, even if a stale
    // or otherwise valid JRA decision happens to exist.
    if (version.publicationPolicy === 'DRAFT_ONLY') {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }

    const resolved = await dependencies.materializations.resolvePublicationMaterializations({
      context,
      dashboardId: input.dashboardId,
      version,
      audience: input.audience,
    });
    if (!resolved.accepted) {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }
    const projection = validateResolvedMaterializations(
      context,
      version,
      resolved.value.materializations,
      resolved.value.bindingProof,
      resolved.value.freshnessState,
      resolved.value.evidenceState,
    );
    if (!projection.accepted) {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }

    const materialChange =
      identity.publishedVersionId !== undefined &&
      identity.publishedVersionId !== version.versionId;
    let approvalInvalidation: DashboardPublicationApprovalInvalidationInstructionV1 | undefined;
    if (materialChange) {
      const preparedInvalidation =
        await dependencies.approvals.preparePublicationApprovalInvalidation({
          tenantScope: context.tenantScope,
          dashboardId: input.dashboardId,
          priorPublishedVersionId: identity.publishedVersionId,
        });
      if (!preparedInvalidation.accepted) {
        return Object.freeze({ accepted: false, code: 'APPROVAL_INVALIDATED' as const });
      }
      approvalInvalidation = preparedInvalidation.value;
    }

    // REVIEWED and CERTIFIED require the exact current JRA decision. DRAFT_ONLY
    // was rejected above because this boundary has no authoritative publish
    // permission for it.
    const current = await dependencies.approvals.findCurrentPublicationApproval({
      tenantScope: context.tenantScope,
      dashboardId: input.dashboardId,
      versionId: version.versionId,
      canonicalHash: version.canonicalHash,
      audience: input.audience,
    });
    if (
      !current.accepted ||
      !validApproval(current.value, context, input.dashboardId, version, input.audience)
    ) {
      return Object.freeze({ accepted: false, code: 'APPROVAL_INVALIDATED' as const });
    }
    const approval: DashboardPublicationApprovalV1 = current.value;

    const preparedAudit = await dependencies.auditOutbox.preparePublicationAudit({
      context,
      dashboardId: input.dashboardId,
      versionId: version.versionId,
      audience: input.audience,
      ...(approval === undefined ? {} : { approvalId: approval.approvalId }),
    });
    if (
      !preparedAudit.accepted ||
      !validAuditMetadata(
        preparedAudit.value,
        context,
        approval === undefined ? undefined : approval.approvalId,
      )
    ) {
      return Object.freeze({ accepted: false, code: 'INVALID_SNAPSHOT' as const });
    }

    if (this.repository.commitPublication === undefined)
      throw new Error('DDA_PUBLICATION_REPOSITORY_UNAVAILABLE');
    const committed = await this.repository.commitPublication({
      tenantScope: context.tenantScope,
      dashboardId: input.dashboardId,
      versionId: input.versionId,
      expectedRevision: input.expectedRevision,
      idempotencyKey: input.idempotencyKey,
      audience: input.audience,
      resolvedProjection: projection,
      auditMetadata: preparedAudit.value,
      ...(approvalInvalidation === undefined ? {} : { approvalInvalidation }),
    });
    if (!committed.accepted) {
      return Object.freeze({ accepted: false, code: committed.code });
    }
    return Object.freeze({ accepted: true, value: committed.snapshot });
  }
}
