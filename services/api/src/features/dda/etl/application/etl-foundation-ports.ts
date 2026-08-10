import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export const ETL_IAE_PORT = Symbol('ETL_IAE_PORT');
export const ETL_DSM_PORT = Symbol('ETL_DSM_PORT');
export const ETL_JRA_PORT = Symbol('ETL_JRA_PORT');
export const ETL_BUA_PORT = Symbol('ETL_BUA_PORT');
export const ETL_AUD_PORT = Symbol('ETL_AUD_PORT');
export const ETL_POLICY_PORT = Symbol('ETL_POLICY_PORT');

export interface EtlIaePortV1 {
  registerDerivative(input: {
    readonly tenantScope: TenantScopeV1;
    readonly parentArtifactVersionId: string;
    readonly contentHash: string;
    readonly schemaHash: string;
    readonly rejectBundleId?: string;
  }): Promise<
    | { readonly accepted: true; readonly artifactVersionId: string }
    | { readonly accepted: false; readonly code: 'IAE_REGISTER_FAILED' }
  >;
}

export interface EtlDsmPortV1 {
  registerDatasetVersion(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
    readonly schemaHash: string;
    readonly contentHash: string;
    readonly lineageParentIds: readonly string[];
    readonly expectedRevision?: number;
  }): Promise<
    | { readonly accepted: true; readonly datasetVersionId: string; readonly revision: number }
    | {
        readonly accepted: false;
        readonly code: 'DSM_REGISTER_FAILED' | 'DSM_REVISION_CONFLICT' | 'DSM_ORIGINAL_MUTATION';
      }
  >;
}

export interface EtlJraPortV1 {
  createTypedJob(input: {
    readonly tenantScope: TenantScopeV1;
    readonly proposalId: string;
    readonly idempotencyKey: string;
    readonly engineBindingId: string;
  }): Promise<
    | { readonly accepted: true; readonly jobId: string; readonly replayed: boolean }
    | { readonly accepted: false; readonly code: 'JRA_CREATE_FAILED' }
  >;
  awaitResultManifest(input: {
    readonly tenantScope: TenantScopeV1;
    readonly jobId: string;
  }): Promise<
    | {
        readonly accepted: true;
        readonly manifest: {
          readonly rowCount: number;
          readonly contentHash: string;
          readonly schemaHash: string;
          readonly rejectBundleId: string | null;
          readonly lineageIds: readonly string[];
          readonly partial: boolean;
        };
      }
    | { readonly accepted: false; readonly code: 'JRA_RESULT_FAILED' | 'JRA_RETRY' }
  >;
}

export interface EtlBuaPortV1 {
  admit(input: {
    readonly tenantScope: TenantScopeV1;
    readonly usageClass: 'DETERMINISTIC_ETL';
  }): Promise<{ readonly accepted: true } | { readonly accepted: false; readonly code: 'BUA_DENIED' }>;
}

export interface EtlAudPortV1 {
  emit(input: {
    readonly tenantScope: TenantScopeV1;
    readonly action: string;
    readonly outcome: 'SUCCEEDED' | 'FAILED';
    readonly correlationId: string;
    readonly references: readonly string[];
  }): Promise<{ readonly accepted: true } | { readonly accepted: false; readonly code: 'AUD_FAILED' }>;
}

export interface EtlPolicyPortV1 {
  currentPolicyVersionId(tenantScope: TenantScopeV1): Promise<string>;
}
