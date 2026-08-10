import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

/** DDA-001: composition ports naming foreign authorities without owning them. */
export const DDA_IAE_PORT = Symbol('DDA_IAE_PORT');
export const DDA_DSM_PORT = Symbol('DDA_DSM_PORT');
export const DDA_JRA_PORT = Symbol('DDA_JRA_PORT');
export const DDA_DSO_PORT = Symbol('DDA_DSO_PORT');
export const DDA_BUA_PORT = Symbol('DDA_BUA_PORT');
export const DDA_AUD_PORT = Symbol('DDA_AUD_PORT');

export interface DdaAuthorityReferenceV1 {
  readonly id: string;
  readonly tenantScope: TenantScopeV1;
}

export interface DdaIaePortV1 {
  requireArtifactVersion(reference: DdaAuthorityReferenceV1): Promise<void>;
  requireEvidenceReference(reference: DdaAuthorityReferenceV1): Promise<void>;
  addRetentionConstraint(reference: DdaAuthorityReferenceV1, holdReason: string): Promise<void>;
}

export interface DdaDsmPortV1 {
  requireDatasetVersion(reference: DdaAuthorityReferenceV1): Promise<void>;
  requireSemanticVersion(reference: DdaAuthorityReferenceV1): Promise<void>;
  requireMetricVersion(reference: DdaAuthorityReferenceV1): Promise<void>;
}

export interface DdaJraPortV1 {
  requireJob(reference: DdaAuthorityReferenceV1): Promise<void>;
  requireResultManifest(reference: DdaAuthorityReferenceV1): Promise<void>;
}

export interface DdaDsoPortV1 {
  requireCapabilityGrant(reference: DdaAuthorityReferenceV1): Promise<void>;
  requireProjection(reference: DdaAuthorityReferenceV1): Promise<void>;
}

export interface DdaBuaPortV1 {
  requireAdmission(reference: DdaAuthorityReferenceV1, usageClass: string): Promise<void>;
}

export interface DdaAudComposePortV1 {
  emitContentSafeSummary(input: {
    readonly tenantScope: TenantScopeV1;
    readonly action: string;
    readonly outcome: string;
    readonly correlationId: string;
    readonly references: readonly string[];
  }): Promise<void>;
}
