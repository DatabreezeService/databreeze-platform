import {
  parseStableIdentifierV1,
  parseTenantScopeV1,
  tenantScopesEqualV1,
  type StableIdentifierV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import type {
  DashboardSnapshotV1,
  DashboardVersionV1,
  DdaAnalysisPlanV1,
} from '@databreeze/domain/data-to-dashboard/v1';
import {
  PERMISSIONS_V1,
  roleHasPermissionV1,
  type PermissionV1,
} from '@databreeze/domain/permissions/v1';

import type { AccessPresetService } from '../features/iam/application/access-preset.service.js';
import type { IamRepositoryPortV1 } from '../features/iam/application/iam-repository.port.js';
import type { IamTenantContextV1 } from '../features/iam/application/tenant-context.js';
import type { DatasetVersionRepositoryPortV1 } from '../features/dsm/application/dataset-version-repository.port.js';
import type { GovernedDatasetAuthorizationPortV1 } from '../features/dsm/application/governed-dataset-authorization.port.js';
import type {
  DdaIaePortV1,
  DdaJraPortV1,
  DdaDsmPortV1,
} from '../features/dda/application/foundation-ports.js';
import type { AnalysisPlanRepositoryPortV1 } from '../features/dda/application/analysis-plan-repository.port.js';
import type {
  AnalysisCatalogAuthorityPortV1,
  AnalysisCatalogAuthorityRequestV1,
  AnalysisCatalogAuthoritySnapshotV1,
} from '../features/dda/analyst/application/analysis-catalog.port.js';
import { AnalysisCatalogResolverServiceV1 } from '../features/dda/analyst/application/analysis-catalog-resolver.service.js';
import type {
  DeterministicResultResponseV1,
  DeterministicResultPortV1,
} from '../features/dda/analyst/application/deterministic-result.port.js';
import type { DashboardAuthorizationPortV1 } from '../features/dda/dashboard/application/dashboard-authorization.port.js';
import type {
  DashboardPermissionProjectionPortV1,
  DashboardPermissionProjectionResultV1,
  DashboardResultReaderPortV1,
  DashboardResultReaderResultV1,
} from '../features/dda/dashboard/application/dashboard-http-ports.js';
import type { DashboardDraftRepositoryPortV1 } from '../features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardRepositoryPortV1 } from '../features/dda/application/dashboard-repository.port.js';
import {
  readDashboardSnapshotBindingProofV1,
  validateDashboardSnapshotBindingProofV1,
} from '../features/dda/dashboard/application/dashboard-repository.port.js';
import type { DashboardPublicationMaterializationBindingProofV1 } from '../features/dda/dashboard/application/dashboard-publication-materialization.port.js';
import type { RefreshRepositoryPortV1 } from '../features/dda/application/refresh-repository.port.js';
import type { ResultManifestRepositoryPortV1 } from '../features/jra/application/result-manifest-repository.port.js';

const MAX_RESULT_BYTES = 4 * 1024 * 1024;
const MAX_RESULT_ROWS = 50_000;
const MAX_RESULT_COLUMNS = 256;
const MAX_RESULT_TEXT = 8_192;

type DashboardBindingV1 = DashboardVersionV1['datasetBindings'][number];

function denied(): {
  readonly allowed: false;
  readonly grantsDatasetAccess: false;
  readonly grantsOriginalAccess: false;
  readonly grantsEvidenceAccess: false;
  readonly grantsAnalysisAccess: false;
  readonly grantsFolderAccess: false;
  readonly grantsRowFieldExpansion: false;
} {
  return Object.freeze({
    allowed: false,
    grantsDatasetAccess: false,
    grantsOriginalAccess: false,
    grantsEvidenceAccess: false,
    grantsAnalysisAccess: false,
    grantsFolderAccess: false,
    grantsRowFieldExpansion: false,
  });
}

function parseId(value: unknown): StableIdentifierV1 | undefined {
  const parsed = parseStableIdentifierV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function parseScope(value: unknown): TenantScopeV1 | undefined {
  const parsed = parseTenantScopeV1(value);
  return parsed.accepted ? parsed.value : undefined;
}

function trustedContext(input: {
  readonly context?: IamTenantContextV1;
  readonly tenantScope: unknown;
  readonly actorId: unknown;
}): IamTenantContextV1 | undefined {
  if (input.context === undefined) return undefined;
  const scope = parseScope(input.tenantScope);
  const actorId = parseId(input.actorId);
  if (
    scope === undefined ||
    actorId === undefined ||
    actorId !== input.context.actorId ||
    !tenantScopesEqualV1(scope, input.context.tenantScope)
  ) {
    return undefined;
  }
  return input.context;
}

function permissionForAction(action: string): PermissionV1 | undefined {
  if (
    action === 'VIEW' ||
    action === 'FILTER' ||
    action === 'DRILL' ||
    action === 'DOWNLOAD' ||
    action === 'SUBSCRIBE' ||
    action === 'RESOLVE_SHARE' ||
    action === 'EXPORT'
  ) {
    return PERMISSIONS_V1.PROJECT_RECORD_READ;
  }
  if (action === 'EDIT' || action === 'PUBLISH' || action === 'SHARE') {
    return PERMISSIONS_V1.PROJECT_RECORD_MANAGE;
  }
  return undefined;
}

function activeMembership(
  membership: Awaited<ReturnType<IamRepositoryPortV1['findMembership']>>,
): membership is NonNullable<typeof membership> {
  if (membership === undefined || membership.status !== 'ACTIVE') return false;
  const now = Date.now();
  if (membership.startsAt !== undefined && Date.parse(membership.startsAt) > now) return false;
  if (membership.expiresAt !== undefined && Date.parse(membership.expiresAt) <= now) return false;
  return true;
}

async function findVersion(
  dashboards: DashboardRepositoryPortV1,
  drafts: DashboardDraftRepositoryPortV1 | undefined,
  context: IamTenantContextV1,
  versionId: string | undefined,
): Promise<DashboardVersionV1 | undefined> {
  if (versionId === undefined) return undefined;
  const fromDashboard = await dashboards.findVersion(context.tenantScope, versionId);
  if (fromDashboard !== undefined) return fromDashboard;
  return drafts?.findVersion(context.tenantScope, versionId);
}

function versionBindings(version: DashboardVersionV1): readonly DashboardBindingV1[] {
  return Object.freeze(
    [...version.datasetBindings].sort((left, right) =>
      left.datasetVersionId.localeCompare(right.datasetVersionId),
    ),
  );
}

function proofBindings(
  version: DashboardVersionV1,
  proof: readonly DashboardPublicationMaterializationBindingProofV1[],
): readonly DashboardBindingV1[] | undefined {
  const seen = new Set<string>();
  const bindings: DashboardBindingV1[] = [];
  for (const materialization of proof) {
    const widget = version.widgets.find((item) => item.widgetId === materialization.widgetId);
    if (
      widget === undefined ||
      widget.binding.analysisPlanVersionId !== materialization.analysisPlanVersionId ||
      !version.datasetBindings.some(
        (binding) =>
          binding.datasetVersionId === materialization.datasetVersionId &&
          binding.semanticVersionId === materialization.semanticVersionId &&
          binding.metricVersionId === materialization.metricVersionId,
      )
    ) {
      return undefined;
    }
    const key = `${materialization.datasetVersionId}:${materialization.semanticVersionId}:${materialization.metricVersionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bindings.push({
      datasetVersionId: materialization.datasetVersionId,
      semanticVersionId: materialization.semanticVersionId,
      metricVersionId: materialization.metricVersionId,
    });
  }
  return Object.freeze(bindings);
}

interface ResolvedDashboardResourceV1 {
  readonly dashboardId?: string;
  readonly dashboardVersion?: DashboardVersionV1;
  readonly bindings: readonly DashboardBindingV1[];
  readonly snapshot?: DashboardSnapshotV1;
  readonly proof?: readonly DashboardPublicationMaterializationBindingProofV1[];
}

/**
 * Root-composed dashboard authorization. It re-resolves IAM membership, role
 * permissions, DSM version ownership, and dataset restrictions for every call.
 */
export class IamDashboardAuthorizationAdapterV1 implements DashboardAuthorizationPortV1 {
  public constructor(
    private readonly dependencies: {
      readonly iam: IamRepositoryPortV1;
      readonly accessPresets: AccessPresetService;
      readonly datasets: DatasetVersionRepositoryPortV1;
      readonly datasetAuthorization: GovernedDatasetAuthorizationPortV1;
      readonly refresh: RefreshRepositoryPortV1;
      readonly dashboards: DashboardRepositoryPortV1;
      readonly drafts?: DashboardDraftRepositoryPortV1;
      readonly analysisPlans?: AnalysisPlanRepositoryPortV1;
      readonly catalogs?: AnalysisCatalogAuthorityPortV1;
    },
  ) {}

  public async authorizeDashboardAction(input: {
    readonly context?: IamTenantContextV1;
    readonly tenantScope: unknown;
    readonly actorId: unknown;
    readonly snapshotId?: string;
    readonly dashboardId?: string;
    readonly action: Parameters<
      DashboardAuthorizationPortV1['authorizeDashboardAction']
    >[0]['action'];
  }) {
    const context = trustedContext(input);
    const permission = permissionForAction(input.action);
    if (context === undefined || permission === undefined) return denied();

    try {
      const membership = await this.dependencies.iam.findMembership(context, context.actorId);
      const preset = activeMembership(membership)
        ? this.dependencies.accessPresets.presetForRoleId(membership.roleId)
        : undefined;
      const presetPermissions =
        preset === undefined
          ? undefined
          : this.dependencies.accessPresets.resolvePresetPermissions(preset);
      if (
        !activeMembership(membership) ||
        membership.principalId !== context.actorId ||
        !tenantScopesEqualV1(membership.scope, context.tenantScope) ||
        preset === undefined ||
        presetPermissions?.accepted !== true ||
        (!roleHasPermissionV1(membership.roleId, permission) &&
          !presetPermissions.value.permissions.includes(permission))
      ) {
        return denied();
      }

      const resource = await this.resolveResource(context, {
        ...(input.snapshotId === undefined ? {} : { snapshotId: input.snapshotId }),
        ...(input.dashboardId === undefined ? {} : { dashboardId: input.dashboardId }),
        action: input.action,
      });
      if (resource === undefined) return denied();
      const datasetsAllowed = await this.datasetsAllowed(context, resource.bindings);
      if (!datasetsAllowed) return denied();

      const grantsDatasetAccess =
        input.action !== 'VIEW' && resource.bindings.length > 0 && datasetsAllowed;
      const grantsAnalysisAccess =
        grantsDatasetAccess &&
        (roleHasPermissionV1(membership.roleId, PERMISSIONS_V1.JOB_EXECUTION_CREATE) ||
          (presetPermissions?.accepted === true &&
            presetPermissions.value.permissions.includes(PERMISSIONS_V1.JOB_EXECUTION_CREATE)));
      return Object.freeze({
        allowed: true as const,
        grantsDatasetAccess,
        grantsOriginalAccess: false as const,
        grantsEvidenceAccess: false as const,
        grantsAnalysisAccess,
        grantsFolderAccess: false as const,
        grantsRowFieldExpansion: false as const,
      });
    } catch {
      return denied();
    }
  }

  public async projectVisibleFields(input: {
    readonly context?: IamTenantContextV1;
    readonly tenantScope: unknown;
    readonly actorId: unknown;
    readonly snapshotId: string;
  }): Promise<readonly string[]> {
    const context = trustedContext(input);
    if (
      context === undefined ||
      this.dependencies.analysisPlans === undefined ||
      this.dependencies.catalogs === undefined
    ) {
      return Object.freeze([]);
    }

    try {
      const resource = await this.resolveResource(context, {
        snapshotId: input.snapshotId,
        action: 'VIEW',
      });
      if (resource?.snapshot === undefined || resource.proof === undefined)
        return Object.freeze([]);
      const decision = await this.authorizeDashboardAction({
        context,
        tenantScope: context.tenantScope,
        actorId: context.actorId,
        snapshotId: input.snapshotId,
        action: 'VIEW',
      });
      if (!decision.allowed) return Object.freeze([]);

      const fieldSets: string[][] = [];
      for (const materialization of resource.proof) {
        const plan = await this.dependencies.analysisPlans.findByVersionId(
          context.tenantScope,
          materialization.analysisPlanVersionId,
        );
        if (
          plan === undefined ||
          plan.datasetVersionId !== materialization.datasetVersionId ||
          plan.semanticVersionId !== materialization.semanticVersionId ||
          plan.metricVersionId !== materialization.metricVersionId ||
          plan.permissionProjectionVersionId !== materialization.permissionProjectionVersionId
        ) {
          return Object.freeze([]);
        }
        const catalog = await new AnalysisCatalogResolverServiceV1(
          this.dependencies.catalogs,
        ).resolve(context, {
          datasetVersionId: plan.datasetVersionId,
          semanticVersionId: plan.semanticVersionId,
          metricVersionId: plan.metricVersionId,
          permissionProjectionVersionId: plan.permissionProjectionVersionId,
        });
        if (!catalog.accepted) return Object.freeze([]);
        fieldSets.push([...catalog.value.authorizedFields]);
      }
      if (fieldSets.length === 0) return Object.freeze([]);
      const visible = new Set(fieldSets[0]);
      for (const fields of fieldSets.slice(1)) {
        const allowed = new Set(fields);
        for (const field of visible) if (!allowed.has(field)) visible.delete(field);
      }
      return Object.freeze([...visible].sort());
    } catch {
      return Object.freeze([]);
    }
  }

  private async resolveResource(
    context: IamTenantContextV1,
    input: {
      readonly snapshotId?: string;
      readonly dashboardId?: string;
      readonly action: string;
    },
  ): Promise<ResolvedDashboardResourceV1 | undefined> {
    if (input.snapshotId !== undefined) {
      const snapshotId = parseId(input.snapshotId);
      if (snapshotId === undefined) return undefined;
      const snapshot = await this.dependencies.refresh.findSnapshot(
        context.tenantScope,
        snapshotId,
      );
      if (
        snapshot === undefined ||
        snapshot.snapshotId !== snapshotId ||
        !tenantScopesEqualV1(snapshot.tenantScope, context.tenantScope)
      ) {
        return undefined;
      }
      const rawProof = readDashboardSnapshotBindingProofV1(snapshot);
      const proof =
        rawProof === undefined
          ? undefined
          : validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof: rawProof });
      if (proof === undefined) return undefined;
      const dashboardVersion = await findVersion(
        this.dependencies.dashboards,
        this.dependencies.drafts,
        context,
        snapshot.dashboardVersionId,
      );
      if (
        dashboardVersion === undefined ||
        !tenantScopesEqualV1(dashboardVersion.tenantScope, context.tenantScope)
      ) {
        return undefined;
      }
      const bindings = proofBindings(dashboardVersion, proof);
      if (bindings === undefined) return undefined;
      return Object.freeze({
        dashboardId: dashboardVersion.dashboardId,
        dashboardVersion,
        bindings,
        snapshot,
        proof,
      });
    }

    const dashboardId = parseId(input.dashboardId);
    if (dashboardId === undefined) return undefined;
    const identity =
      (await this.dependencies.drafts?.findIdentity(context.tenantScope, dashboardId)) ??
      (await this.dependencies.dashboards.findByDashboardId(context.tenantScope, dashboardId));
    if (
      identity === undefined ||
      identity.dashboardId !== dashboardId ||
      !tenantScopesEqualV1(identity.tenantScope, context.tenantScope)
    ) {
      return undefined;
    }
    const versionId =
      input.action === 'EDIT' || input.action === 'PUBLISH' || input.action === 'SHARE'
        ? (identity.draftVersionId ?? identity.publishedVersionId)
        : (identity.publishedVersionId ?? identity.draftVersionId);
    const dashboardVersion = await findVersion(
      this.dependencies.dashboards,
      this.dependencies.drafts,
      context,
      versionId,
    );
    if (dashboardVersion === undefined) return undefined;
    return Object.freeze({
      dashboardId,
      dashboardVersion,
      bindings: versionBindings(dashboardVersion),
    });
  }

  private async datasetsAllowed(
    context: IamTenantContextV1,
    bindings: readonly DashboardBindingV1[],
  ): Promise<boolean> {
    for (const binding of bindings) {
      const datasetVersion = await this.dependencies.datasets.find(
        context,
        binding.datasetVersionId,
      );
      if (
        datasetVersion === undefined ||
        datasetVersion.versionId !== binding.datasetVersionId ||
        !tenantScopesEqualV1(datasetVersion.tenantScope, context.tenantScope)
      ) {
        return false;
      }
      const authorized = await this.dependencies.datasetAuthorization.authorize(context, {
        action: 'READ_VERSION',
        datasetId: datasetVersion.datasetId,
        versionId: datasetVersion.versionId,
      });
      if (!authorized.accepted) return false;
    }
    return true;
  }
}

/** Reads immutable manifests and IAE-owned bytes after exact snapshot/projection checks. */
export class DashboardMaterializedResultReaderAdapterV1 implements DashboardResultReaderPortV1 {
  public constructor(
    private readonly dependencies: {
      readonly refresh: RefreshRepositoryPortV1;
      readonly dashboards: DashboardRepositoryPortV1;
      readonly manifests: ResultManifestRepositoryPortV1;
      readonly iae: DdaIaePortV1;
      readonly authorization: DashboardAuthorizationPortV1;
      readonly projection: DashboardPermissionProjectionPortV1;
    },
  ) {}

  public async read(input: {
    readonly context: IamTenantContextV1;
    readonly snapshotId: string;
  }): Promise<DashboardResultReaderResultV1> {
    const snapshotId = parseId(input.snapshotId);
    if (snapshotId === undefined) return Object.freeze({ accepted: false, code: 'NOT_FOUND' });
    try {
      const snapshot = await this.dependencies.refresh.findSnapshot(
        input.context.tenantScope,
        snapshotId,
      );
      if (
        snapshot === undefined ||
        snapshot.snapshotId !== snapshotId ||
        !tenantScopesEqualV1(snapshot.tenantScope, input.context.tenantScope)
      ) {
        return Object.freeze({ accepted: false, code: 'NOT_FOUND' });
      }
      const rawProof = readDashboardSnapshotBindingProofV1(snapshot);
      const proof =
        rawProof === undefined
          ? undefined
          : validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof: rawProof });
      const version = await this.dependencies.dashboards.findVersion(
        input.context.tenantScope,
        snapshot.dashboardVersionId,
      );
      if (
        proof === undefined ||
        version === undefined ||
        !sameVersionScope(version, input.context.tenantScope)
      ) {
        return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
      }
      if (!proofBindings(version, proof))
        return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });

      const authorization = await this.dependencies.authorization.authorizeDashboardAction({
        context: input.context,
        tenantScope: input.context.tenantScope,
        actorId: input.context.actorId,
        snapshotId,
        action: 'VIEW',
      });
      if (!authorization.allowed) return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' });

      const projection = await this.dependencies.projection.resolve({
        context: input.context,
        snapshotId,
      });
      if (!projection.accepted) {
        return Object.freeze({
          accepted: false,
          code:
            projection.code === 'PERMISSION_REVOKED'
              ? ('UNAUTHORIZED' as const)
              : ('UNAVAILABLE' as const),
        });
      }
      if (projection.permissionProjectionVersionId !== snapshot.permissionProjectionVersionId) {
        return Object.freeze({ accepted: false, code: 'UNAUTHORIZED' });
      }

      const rows: Record<string, string>[] = [];
      for (const materialization of proof) {
        const manifestId = parseId(materialization.resultManifestId);
        if (manifestId === undefined)
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        const manifest = await this.dependencies.manifests.find(input.context, manifestId);
        if (
          manifest === undefined ||
          !sameScope(manifest.tenantScope, input.context.tenantScope) ||
          manifest.resultManifestId !== manifestId ||
          manifest.resultManifestId !== materialization.resultManifestId ||
          manifest.engineVersion !== materialization.engineVersion ||
          manifest.approvalState === 'PENDING' ||
          manifest.approvalState === 'REJECTED' ||
          manifest.outputIds.length !== manifest.outputHashes.length
        ) {
          return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
        }
        for (let index = 0; index < manifest.outputIds.length; index += 1) {
          const outputId = manifest.outputIds[index];
          const outputHash = manifest.outputHashes[index];
          if (outputId === undefined || outputHash === undefined) {
            return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
          }
          const content = await this.dependencies.iae.openProcessingContent({
            tenantScope: input.context.tenantScope,
            artifactVersionId: outputId,
            expectedContentSha256: outputHash,
            maximumByteLength: MAX_RESULT_BYTES,
            allowedMediaTypes: ['application/json'],
          });
          if (!content.accepted) return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
          const decoded = decodeRows(content.value.bytes);
          if (decoded === undefined || rows.length + decoded.length > MAX_RESULT_ROWS) {
            return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
          }
          rows.push(...decoded);
        }
      }
      return Object.freeze({ accepted: true, rows: Object.freeze(rows) });
    } catch {
      return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
    }
  }
}

/** Permission projection is current-authority derived, never read from the request. */
export class DashboardPermissionProjectionAdapterV1 implements DashboardPermissionProjectionPortV1 {
  public constructor(
    private readonly dependencies: {
      readonly refresh: RefreshRepositoryPortV1;
      readonly analysisPlans: AnalysisPlanRepositoryPortV1;
      readonly catalogs: AnalysisCatalogAuthorityPortV1;
      readonly authorization: DashboardAuthorizationPortV1;
    },
  ) {}

  public async resolve(input: {
    readonly context: IamTenantContextV1;
    readonly dashboardId?: string;
    readonly snapshotId?: string;
  }): Promise<DashboardPermissionProjectionResultV1> {
    try {
      const snapshot =
        input.snapshotId === undefined
          ? input.dashboardId === undefined
            ? undefined
            : await this.dependencies.refresh.findLatestSnapshotForDashboard(
                input.context.tenantScope,
                input.dashboardId,
              )
          : await this.dependencies.refresh.findSnapshot(
              input.context.tenantScope,
              input.snapshotId,
            );
      if (
        snapshot === undefined ||
        !sameScope(snapshot.tenantScope, input.context.tenantScope) ||
        (input.snapshotId !== undefined && snapshot.snapshotId !== input.snapshotId)
      ) {
        return Object.freeze({ accepted: false, code: 'PERMISSION_REVOKED' });
      }
      const authorization = await this.dependencies.authorization.authorizeDashboardAction({
        context: input.context,
        tenantScope: input.context.tenantScope,
        actorId: input.context.actorId,
        ...(input.snapshotId === undefined
          ? input.dashboardId === undefined
            ? {}
            : { dashboardId: input.dashboardId }
          : { snapshotId: input.snapshotId }),
        action: 'VIEW',
      });
      if (!authorization.allowed)
        return Object.freeze({ accepted: false, code: 'PERMISSION_REVOKED' });
      const rawProof = readDashboardSnapshotBindingProofV1(snapshot);
      const proof =
        rawProof === undefined
          ? undefined
          : validateDashboardSnapshotBindingProofV1({ snapshot, bindingProof: rawProof });
      if (proof === undefined) return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
      for (const materialization of proof) {
        const plan = await this.dependencies.analysisPlans.findByVersionId(
          input.context.tenantScope,
          materialization.analysisPlanVersionId,
        );
        if (
          plan === undefined ||
          plan.datasetVersionId !== materialization.datasetVersionId ||
          plan.semanticVersionId !== materialization.semanticVersionId ||
          plan.metricVersionId !== materialization.metricVersionId ||
          plan.permissionProjectionVersionId !== materialization.permissionProjectionVersionId
        ) {
          return Object.freeze({ accepted: false, code: 'PERMISSION_REVOKED' });
        }
        const resolved = await new AnalysisCatalogResolverServiceV1(
          this.dependencies.catalogs,
        ).resolve(input.context, {
          datasetVersionId: plan.datasetVersionId,
          semanticVersionId: plan.semanticVersionId,
          metricVersionId: plan.metricVersionId,
          permissionProjectionVersionId: plan.permissionProjectionVersionId,
        });
        if (
          !resolved.accepted ||
          resolved.value.permissionProjectionVersionId !== snapshot.permissionProjectionVersionId
        ) {
          return Object.freeze({ accepted: false, code: 'PERMISSION_REVOKED' });
        }
      }
      return Object.freeze({
        accepted: true,
        permissionProjectionVersionId: snapshot.permissionProjectionVersionId,
      });
    } catch {
      return Object.freeze({ accepted: false, code: 'UNAVAILABLE' });
    }
  }
}

export interface AnalysisCatalogMetadataSourcePortV1 {
  load(input: {
    readonly context: IamTenantContextV1;
    readonly datasetVersionId: StableIdentifierV1;
    readonly semanticVersionId: StableIdentifierV1;
    readonly metricVersionId: StableIdentifierV1;
    readonly permissionProjectionVersionId: StableIdentifierV1;
  }): Promise<
    | Pick<
        AnalysisCatalogAuthoritySnapshotV1,
        | 'authorizedFields'
        | 'authorizedJoins'
        | 'units'
        | 'grains'
        | 'versionState'
        | 'blockedReason'
      >
    | undefined
  >;
}

/** DSM/IAM-backed catalog authority; it owns no catalog persistence. */
export class IamDsmAnalysisCatalogAuthorityAdapterV1 implements AnalysisCatalogAuthorityPortV1 {
  public constructor(
    private readonly dependencies: {
      readonly iam: IamRepositoryPortV1;
      readonly datasets: DatasetVersionRepositoryPortV1;
      readonly datasetAuthorization: GovernedDatasetAuthorizationPortV1;
      readonly dsm: DdaDsmPortV1;
      readonly source: AnalysisCatalogMetadataSourcePortV1;
    },
  ) {}

  public async load(context: IamTenantContextV1, request: AnalysisCatalogAuthorityRequestV1) {
    try {
      const membership = await this.dependencies.iam.findMembership(context, context.actorId);
      if (
        !activeMembership(membership) ||
        membership.principalId !== context.actorId ||
        !sameScope(membership.scope, context.tenantScope) ||
        request.memberId !== context.actorId
      ) {
        return Object.freeze({ status: 'RESTRICTED' as const });
      }
      const datasetVersion = await this.dependencies.datasets.find(
        context,
        request.datasetVersionId,
      );
      if (
        datasetVersion === undefined ||
        datasetVersion.versionId !== request.datasetVersionId ||
        !sameScope(datasetVersion.tenantScope, context.tenantScope)
      ) {
        return Object.freeze({ status: 'NOT_FOUND' as const });
      }
      const authorized = await this.dependencies.datasetAuthorization.authorize(context, {
        action: 'READ_VERSION',
        datasetId: datasetVersion.datasetId,
        versionId: datasetVersion.versionId,
      });
      if (!authorized.accepted) return Object.freeze({ status: 'RESTRICTED' as const });
      await this.dependencies.dsm.requireDatasetVersion({
        id: request.datasetVersionId,
        tenantScope: context.tenantScope,
      });
      await this.dependencies.dsm.requireSemanticVersion({
        id: request.semanticVersionId,
        tenantScope: context.tenantScope,
      });
      await this.dependencies.dsm.requireMetricVersion({
        id: request.metricVersionId,
        tenantScope: context.tenantScope,
      });
      const metadata = await this.dependencies.source.load({ context, ...request });
      if (metadata === undefined) return Object.freeze({ status: 'UNAVAILABLE' as const });
      return Object.freeze({
        status: 'AUTHORIZED' as const,
        catalog: Object.freeze({
          datasetVersionId: request.datasetVersionId,
          semanticVersionId: request.semanticVersionId,
          metricVersionId: request.metricVersionId,
          permissionProjectionVersionId: request.permissionProjectionVersionId,
          tenantScope: context.tenantScope,
          memberId: context.actorId,
          authorizationEpoch: context.authorizationEpoch,
          authorizedFields: Object.freeze([...metadata.authorizedFields]),
          authorizedJoins: Object.freeze([...metadata.authorizedJoins]),
          units: Object.freeze({ ...metadata.units }),
          grains: Object.freeze([...metadata.grains]),
          versionState: metadata.versionState,
          ...(metadata.blockedReason === undefined
            ? {}
            : { blockedReason: metadata.blockedReason }),
        }),
      });
    } catch {
      return Object.freeze({ status: 'UNAVAILABLE' as const });
    }
  }
}

export interface DeterministicAnalysisEnginePortV1 {
  execute(input: {
    readonly context: IamTenantContextV1;
    readonly plan: DdaAnalysisPlanV1;
    readonly catalog: AnalysisCatalogAuthoritySnapshotV1;
  }): Promise<DeterministicResultResponseV1>;
}

/**
 * Deterministic analysis composition. The engine is the only value producer;
 * DSM/catalog checks happen before it and JRA/IAE remain the result authorities.
 */
export class PublicPortDeterministicResultAdapterV1 implements DeterministicResultPortV1 {
  public constructor(
    private readonly dependencies: {
      readonly catalogs: AnalysisCatalogAuthorityPortV1;
      readonly dsm: DdaDsmPortV1;
      readonly jra?: DdaJraPortV1;
      readonly engine: DeterministicAnalysisEnginePortV1;
      readonly analysisPlanRepository?: AnalysisPlanRepositoryPortV1;
    },
  ) {}

  public async execute(input: {
    readonly plan: DdaAnalysisPlanV1;
    readonly tenantScope: unknown;
    readonly context?: IamTenantContextV1;
  }): Promise<DeterministicResultResponseV1> {
    const scope = parseScope(input.tenantScope);
    const context = input.context;
    if (
      context === undefined ||
      scope === undefined ||
      !sameScope(scope, context.tenantScope) ||
      !sameScope(scope, input.plan.tenantScope)
    ) {
      return Object.freeze({ status: 'STALE_INPUT' as const });
    }
    try {
      if (this.dependencies.analysisPlanRepository !== undefined) {
        const persisted = await this.dependencies.analysisPlanRepository.findByVersionId(
          context.tenantScope,
          input.plan.planVersionId,
        );
        if (
          persisted === undefined ||
          persisted.planHash !== input.plan.planHash ||
          persisted.tenantScope.scopeType !== input.plan.tenantScope.scopeType
        ) {
          return Object.freeze({ status: 'STALE_INPUT' as const });
        }
      }
      const resolved = await new AnalysisCatalogResolverServiceV1(
        this.dependencies.catalogs,
      ).resolve(context, {
        datasetVersionId: input.plan.datasetVersionId,
        semanticVersionId: input.plan.semanticVersionId,
        metricVersionId: input.plan.metricVersionId,
        permissionProjectionVersionId: input.plan.permissionProjectionVersionId,
      });
      if (!resolved.accepted) {
        return Object.freeze({
          status:
            resolved.code === 'STALE_INPUT'
              ? ('STALE_INPUT' as const)
              : resolved.code === 'BUDGET_DENIED'
                ? ('BUDGET_DENIED' as const)
                : ('SOURCE_UNAVAILABLE' as const),
        });
      }
      const references = [
        { id: input.plan.datasetVersionId, tenantScope: context.tenantScope },
        { id: input.plan.semanticVersionId, tenantScope: context.tenantScope },
        { id: input.plan.metricVersionId, tenantScope: context.tenantScope },
      ] as const;
      await this.dependencies.dsm.requireDatasetVersion(references[0]);
      await this.dependencies.dsm.requireSemanticVersion(references[1]);
      await this.dependencies.dsm.requireMetricVersion(references[2]);

      const response = await this.dependencies.engine.execute({
        context,
        plan: input.plan,
        catalog: resolved.value,
      });
      if ('status' in response) return response;
      if (this.dependencies.jra !== undefined) {
        const resultId = parseId(response.resultId);
        if (resultId === undefined) return Object.freeze({ status: 'SOURCE_UNAVAILABLE' as const });
        await this.dependencies.jra.requireResultManifest({
          id: resultId,
          tenantScope: context.tenantScope,
        });
      }
      if (
        !Number.isSafeInteger(response.cells.length) ||
        response.cells.length > input.plan.output.maxRows ||
        response.provenance.planVersionId !== input.plan.planVersionId ||
        response.provenance.datasetVersionId !== input.plan.datasetVersionId ||
        typeof response.provenance.engineVersion !== 'string' ||
        response.provenance.engineVersion.length === 0
      ) {
        return Object.freeze({ status: 'ADAPTER_UNAVAILABLE' as const });
      }
      const allowedFields = new Set(resolved.value.authorizedFields);
      for (const cell of response.cells) {
        if (
          parseId(cell.cellId) === undefined ||
          cell.planVersionId !== input.plan.planVersionId ||
          cell.metricVersionId !== input.plan.metricVersionId ||
          !allowedFields.has(cell.field) ||
          !Number.isFinite(cell.value) ||
          typeof cell.unit !== 'string' ||
          cell.unit.length === 0
        ) {
          return Object.freeze({ status: 'ADAPTER_UNAVAILABLE' as const });
        }
      }
      return Object.freeze({
        resultId: response.resultId,
        cells: Object.freeze([...response.cells]),
        provenance: Object.freeze({ ...response.provenance }),
      });
    } catch {
      return Object.freeze({ status: 'SOURCE_UNAVAILABLE' as const });
    }
  }
}

function sameScope(left: TenantScopeV1, right: TenantScopeV1): boolean {
  return tenantScopesEqualV1(left, right);
}

function sameVersionScope(version: DashboardVersionV1, scope: TenantScopeV1): boolean {
  return sameScope(version.tenantScope, scope);
}

function decodeRows(bytes: Uint8Array): readonly Record<string, string>[] | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    return undefined;
  }
  const candidate = Array.isArray(parsed)
    ? parsed
    : typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)['rows']
      : undefined;
  if (!Array.isArray(candidate) || candidate.length > MAX_RESULT_ROWS) return undefined;
  const rows: Record<string, string>[] = [];
  for (const row of candidate) {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) return undefined;
    const entries = Object.entries(row as Record<string, unknown>);
    if (entries.length > MAX_RESULT_COLUMNS) return undefined;
    const normalized: Record<string, string> = {};
    for (const [key, value] of entries) {
      if (
        key.length === 0 ||
        key.length > 256 ||
        (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') ||
        (typeof value === 'string' && value.length > MAX_RESULT_TEXT) ||
        (typeof value === 'number' && !Number.isFinite(value))
      ) {
        return undefined;
      }
      normalized[key] = String(value);
    }
    rows.push(Object.freeze(normalized));
  }
  return Object.freeze(rows);
}
