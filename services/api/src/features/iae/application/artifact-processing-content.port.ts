import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type {
  ArtifactProcessingContentErrorCodeV1,
  ArtifactProcessingContentHandleV1,
  ArtifactProcessingContentResultV1,
} from '@databreeze/domain/artifact-processing-content/v1';

/**
 * IAE public composition port for bounded immutable processing content.
 * DDA never reads IAE persistence or object-store credentials directly.
 */
export const ARTIFACT_PROCESSING_CONTENT_PORT = Symbol('ARTIFACT_PROCESSING_CONTENT_PORT');

export interface ArtifactProcessingContentPortV1 {
  openProcessingContent(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
    readonly expectedContentSha256?: string;
    readonly maximumByteLength: number;
    readonly allowedMediaTypes: readonly string[];
  }): Promise<ArtifactProcessingContentResultV1>;
}

/** Compatibility re-exports for IAE adapters while the value authority lives in domain. */
export type {
  ArtifactProcessingContentErrorCodeV1,
  ArtifactProcessingContentHandleV1,
  ArtifactProcessingContentResultV1,
};
