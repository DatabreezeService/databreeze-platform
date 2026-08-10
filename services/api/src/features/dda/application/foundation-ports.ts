import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ArtifactProcessingContentHandleV1,
  ArtifactProcessingContentResultV1,
} from '../../iae/application/artifact-processing-content.port.js';

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
  /** Bounded immutable processing handle; never exposes object-store credentials. */
  openProcessingContent(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
    readonly expectedContentSha256?: string;
    readonly maximumByteLength: number;
    readonly allowedMediaTypes: readonly string[];
  }): Promise<ArtifactProcessingContentResultV1>;
}

export type { ArtifactProcessingContentHandleV1 };

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

export interface DdaBuaAdmissionReservationV1 {
  readonly reservationId: string;
  readonly usageClass: string;
}

export interface DdaBuaPortV1 {
  requireAdmission(reference: DdaAuthorityReferenceV1, usageClass: string): Promise<void>;
  reserveCapacity(input: {
    readonly reference: DdaAuthorityReferenceV1;
    readonly usageClass: string;
    readonly requestUnits: number;
    readonly imageBytes: number;
    readonly textTokensEstimate: number;
    readonly retryBudget: number;
    readonly costUnitsEstimate: number;
  }): Promise<DdaBuaAdmissionReservationV1>;
  finalizeReservation(input: {
    readonly reservationId: string;
    readonly reference: DdaAuthorityReferenceV1;
    readonly outcome: 'SUCCEEDED' | 'FAILED' | 'DENIED' | 'RELEASED';
  }): Promise<void>;
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
