import type {
  DashboardVersionV1,
  DdaEvidenceStateV1,
  DdaFreshnessStateV1,
  DdaMaterializationV1,
} from '@databreeze/domain/data-to-dashboard/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export type DashboardPublicationMaterializationResolutionV1 =
  | {
      readonly accepted: true;
      readonly value: {
        readonly materializations: readonly DdaMaterializationV1[];
        /** Server-owned proof linking each result to its exact definition/cache identity. */
        readonly bindingProof: readonly DashboardPublicationMaterializationBindingProofV1[];
        readonly freshnessState: DdaFreshnessStateV1;
        readonly evidenceState: DdaEvidenceStateV1;
      };
    }
  | {
      readonly accepted: false;
      readonly code: 'UNAVAILABLE' | 'INVALID' | 'INCOMPLETE' | 'MIXED_SCOPE';
    };

export interface DashboardPublicationMaterializationBindingProofV1 {
  readonly schemaVersion: DdaMaterializationV1['schemaVersion'];
  readonly materializationId: DdaMaterializationV1['materializationId'];
  readonly tenantScope: DdaMaterializationV1['tenantScope'];
  readonly dashboardVersionId: DdaMaterializationV1['dashboardVersionId'];
  readonly widgetId: DdaMaterializationV1['widgetId'];
  readonly analysisPlanVersionId: DdaMaterializationV1['analysisPlanVersionId'];
  readonly datasetVersionId: DdaMaterializationV1['datasetVersionId'];
  readonly semanticVersionId: DdaMaterializationV1['semanticVersionId'];
  readonly metricVersionId: DdaMaterializationV1['metricVersionId'];
  readonly materializationDefinitionId: DashboardVersionV1['widgets'][number]['binding']['materializationDefinitionId'];
  readonly resultManifestId: DdaMaterializationV1['resultManifestId'];
  readonly permissionProjectionVersionId: DdaMaterializationV1['permissionProjectionVersionId'];
  readonly parameterHash: DdaMaterializationV1['parameterHash'];
  readonly locale: DdaMaterializationV1['locale'];
  readonly timezone: DdaMaterializationV1['timezone'];
  readonly engineVersion: DdaMaterializationV1['engineVersion'];
  readonly adapterVersion: DdaMaterializationV1['adapterVersion'];
  readonly effectivePolicyVersionId: DdaMaterializationV1['effectivePolicyVersionId'];
  readonly cacheIdentityHash: DdaMaterializationV1['cacheIdentityHash'];
  readonly materializationCreatedAt: DdaMaterializationV1['createdAt'];
}

/** Server-owned lookup of complete, verified materialization rows for one version. */
export interface DashboardPublicationMaterializationPortV1 {
  resolvePublicationMaterializations(input: {
    readonly context: IamTenantContextV1;
    readonly dashboardId: string;
    readonly version: DashboardVersionV1;
    readonly audience: 'OWNER' | 'WORKSPACE_VIEWERS' | 'PROJECT_VIEWERS';
  }): Promise<DashboardPublicationMaterializationResolutionV1>;
}
