import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

/** Content-safe foundation seams used by refresh without foreign persistence access. */
export interface RefreshJobAdmissionPortV1 {
  admitMaterializationJob(input: {
    readonly tenantScope: TenantScopeV1;
    readonly refreshId: string;
    readonly definitionIds: readonly string[];
  }): Promise<{ readonly jobId: string }>;
}

export interface RefreshAuditPortV1 {
  emitContentSafeSummary(input: {
    readonly tenantScope: TenantScopeV1;
    readonly action: string;
    readonly outcome: string;
    readonly correlationId: string;
    readonly references: readonly string[];
  }): Promise<void>;
}
