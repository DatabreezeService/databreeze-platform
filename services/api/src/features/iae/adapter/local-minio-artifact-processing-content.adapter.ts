import { createHash } from 'node:crypto';

import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { parseStableIdentifierV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import { createIamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type { ArtifactRepositoryPortV1 } from '../application/artifact-repository.port.js';
import type {
  ArtifactProcessingContentVersionReaderV1,
  ArtifactProcessingContentVersionRecordV1,
} from './object-storage-artifact-processing-content.adapter.js';

const LOCAL_ACTOR_ID = '00000000-0000-4000-8000-0000000000a0';

/**
 * Local-only processing reader for the Compose MinIO bucket.
 *
 * It deliberately follows the same artifact repository checks as production
 * processing content: the version must be exact-scope, active, clean, and have
 * an available CLOUD placement whose hash matches the immutable version. The
 * object key is a local convention and is never exposed through a public API.
 */
export class LocalMinioArtifactProcessingContentReader
  implements ArtifactProcessingContentVersionReaderV1
{
  public constructor(
    private readonly options: {
      readonly artifacts: ArtifactRepositoryPortV1;
      readonly client: S3Client;
      readonly bucket: string;
    },
  ) {}

  public async loadVersion(input: {
    readonly tenantScope: TenantScopeV1;
    readonly artifactVersionId: string;
  }): Promise<ArtifactProcessingContentVersionRecordV1 | undefined> {
    const parsedVersionId = parseStableIdentifierV1(input.artifactVersionId);
    if (!parsedVersionId.accepted) return undefined;
    const contextResult = createIamTenantContextV1({
      tenantScope: input.tenantScope,
      actorId: LOCAL_ACTOR_ID,
      // The foundation context requires a stable UUID correlation id. Reuse the
      // immutable version id rather than constructing an invalid prefixed value.
      correlationId: parsedVersionId.value,
      idempotencyKey: `local-processing-${parsedVersionId.value}`,
      authorizationEpoch: 1,
      mfaReenrollmentRequired: false,
    });
    if (!contextResult.accepted) return undefined;

    const version = await this.options.artifacts.findVersion(
      contextResult.value,
      parsedVersionId.value,
    );
    if (version === undefined || version.status !== 'ACTIVE' || version.scanState !== 'CLEAN') {
      return undefined;
    }
    const placements = await this.options.artifacts.listPlacements(
      contextResult.value,
      version.versionId,
    );
    const placement = placements.find(
      (candidate) =>
        candidate.kind === 'CLOUD' &&
        candidate.available &&
        candidate.contentSha256 === version.contentSha256,
    );
    if (placement === undefined || !('workspaceId' in version.tenantScope)) return undefined;

    const objectKey = [
      'local/web-intake',
      version.tenantScope.organizationId,
      version.tenantScope.workspaceId,
      version.versionId,
    ].join('/');
    const response = await this.options.client.send(
      new GetObjectCommand({ Bucket: this.options.bucket, Key: objectKey }),
    );
    const body = response.Body;
    if (body === undefined || typeof body.transformToByteArray !== 'function') return undefined;
    const bytes = new Uint8Array(await body.transformToByteArray());
    const contentSha256 = createHash('sha256').update(bytes).digest('hex');
    if (contentSha256 !== version.contentSha256 || bytes.byteLength !== version.byteSize) {
      return undefined;
    }
    return Object.freeze({
      artifactVersionId: version.versionId,
      tenantScope: version.tenantScope,
      contentSha256,
      mediaType: version.mediaType,
      bytes,
    });
  }
}
