import { createHash } from 'node:crypto';

import { tenantScopeContainsV1 } from '@databreeze/domain/tenant-scope/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ArtifactProcessingContentHandleV1,
  ArtifactProcessingContentPortV1,
  ArtifactProcessingContentResultV1,
} from '../application/artifact-processing-content.port.js';

export interface ArtifactProcessingContentVersionRecordV1 {
  readonly artifactVersionId: string;
  readonly tenantScope: TenantScopeV1;
  readonly contentSha256: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
  readonly imageWidth?: number;
  readonly imageHeight?: number;
  readonly pageCount?: number;
}

export interface ArtifactProcessingContentVersionReaderV1 {
  loadVersion(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
  }): Promise<ArtifactProcessingContentVersionRecordV1 | undefined>;
}

/**
 * IAE-owned processing-content adapter. Bytes stay in-process; no public URL or
 * object-store credential is exposed through this port (plan 403 Task 2).
 */
export class ObjectStorageArtifactProcessingContentAdapter
  implements ArtifactProcessingContentPortV1
{
  public constructor(private readonly reader?: ArtifactProcessingContentVersionReaderV1) {}

  public async openProcessingContent(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
    readonly expectedContentSha256?: string;
    readonly maximumByteLength: number;
    readonly allowedMediaTypes: readonly string[];
  }): Promise<ArtifactProcessingContentResultV1> {
    if (!this.reader) {
      return Object.freeze({ accepted: false, code: 'PROCESSING_CONTENT_UNAVAILABLE' as const });
    }

    const record = await this.reader.loadVersion({
      tenantScope: input.tenantScope,
      artifactVersionId: input.artifactVersionId,
    });
    if (!record) {
      return Object.freeze({ accepted: false, code: 'PROCESSING_CONTENT_SCOPE_DENIED' as const });
    }
    if (!tenantScopeContainsV1(input.tenantScope, record.tenantScope)) {
      return Object.freeze({ accepted: false, code: 'PROCESSING_CONTENT_SCOPE_DENIED' as const });
    }
    if (!input.allowedMediaTypes.includes(record.mediaType)) {
      return Object.freeze({
        accepted: false,
        code: 'PROCESSING_CONTENT_UNSUPPORTED_MEDIA_TYPE' as const,
      });
    }
    if (record.bytes.byteLength > input.maximumByteLength) {
      return Object.freeze({ accepted: false, code: 'PROCESSING_CONTENT_OVERSIZE' as const });
    }
    const digest = createHash('sha256').update(record.bytes).digest('hex');
    if (digest !== record.contentSha256) {
      return Object.freeze({ accepted: false, code: 'PROCESSING_CONTENT_HASH_MISMATCH' as const });
    }
    if (
      input.expectedContentSha256 !== undefined &&
      input.expectedContentSha256 !== record.contentSha256
    ) {
      return Object.freeze({ accepted: false, code: 'PROCESSING_CONTENT_HASH_MISMATCH' as const });
    }

    const handle: ArtifactProcessingContentHandleV1 = Object.freeze({
      artifactVersionId: record.artifactVersionId,
      tenantScope: record.tenantScope,
      contentSha256: record.contentSha256,
      mediaType: record.mediaType,
      byteLength: record.bytes.byteLength,
      bytes: record.bytes,
      ...(record.imageWidth !== undefined ? { imageWidth: record.imageWidth } : {}),
      ...(record.imageHeight !== undefined ? { imageHeight: record.imageHeight } : {}),
      ...(record.pageCount !== undefined ? { pageCount: record.pageCount } : {}),
    });
    return Object.freeze({ accepted: true, value: handle });
  }
}
