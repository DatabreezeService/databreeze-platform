import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

/**
 * IAE public composition port for bounded immutable processing content.
 * DDA never reads IAE persistence or object-store credentials directly.
 */
export const ARTIFACT_PROCESSING_CONTENT_PORT = Symbol('ARTIFACT_PROCESSING_CONTENT_PORT');

export type ArtifactProcessingContentErrorCodeV1 =
  | 'PROCESSING_CONTENT_SCOPE_DENIED'
  | 'PROCESSING_CONTENT_NOT_FOUND'
  | 'PROCESSING_CONTENT_UNSUPPORTED_MEDIA_TYPE'
  | 'PROCESSING_CONTENT_HASH_MISMATCH'
  | 'PROCESSING_CONTENT_OVERSIZE'
  | 'PROCESSING_CONTENT_UNAVAILABLE';

export interface ArtifactProcessingContentHandleV1 {
  readonly artifactVersionId: string;
  readonly tenantScope: TenantScopeV1;
  readonly contentSha256: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly imageWidth?: number;
  readonly imageHeight?: number;
  readonly pageCount?: number;
  /** Approved bytes available only inside the server process. */
  readonly bytes: Uint8Array;
}

export type ArtifactProcessingContentResultV1 =
  | { readonly accepted: true; readonly value: ArtifactProcessingContentHandleV1 }
  | { readonly accepted: false; readonly code: ArtifactProcessingContentErrorCodeV1 };

export interface ArtifactProcessingContentPortV1 {
  openProcessingContent(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
    readonly expectedContentSha256?: string;
    readonly maximumByteLength: number;
    readonly allowedMediaTypes: readonly string[];
  }): Promise<ArtifactProcessingContentResultV1>;
}
