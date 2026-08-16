import { createHash } from 'node:crypto';

import { tenantScopesEqualV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  ExecutionRequestDescriptorVerifierPortV1,
  ExecutionRequestDescriptorV1,
} from '../../../jra/application/execution-request-descriptor.js';

const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_OBJECT_BYTES = 10 * 1024 * 1024 * 1024;
const CLOUD_WORKER_DATA_MODES = new Set(['Cloud', 'Hybrid']);

export interface IaeExecutionRequestObjectMetadataV1 {
  readonly objectId: string;
  readonly tenantScope: TenantScopeV1;
  readonly dataMode: 'Local' | 'Hybrid' | 'Cloud';
  readonly cloudAvailable: boolean;
  readonly cloudExecutionAllowed?: boolean;
  readonly status: 'ACTIVE' | 'QUARANTINED' | 'DELETED';
  readonly scanState: 'CLEAN' | 'PENDING' | 'QUARANTINED';
  readonly contentSha256: string;
  readonly contentLength: number;
}

/**
 * IAE-owned authority over immutable object metadata and data-mode placement. Implementations
 * resolve one exact opaque reference inside the supplied exact tenant scope and return no bytes,
 * paths, URLs, or credentials.
 */
export interface IaeExecutionRequestObjectAuthorityPortV1 {
  findExactObjectMetadata(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
  }): Promise<IaeExecutionRequestObjectMetadataV1 | undefined>;
}

interface ManifestBindingV1 {
  readonly objectId: string;
  readonly dataMode: IaeExecutionRequestObjectMetadataV1['dataMode'];
  readonly contentSha256: string;
  readonly contentLength: number;
}

function manifestBinding(value: IaeExecutionRequestObjectMetadataV1): ManifestBindingV1 {
  return {
    objectId: value.objectId,
    dataMode: value.dataMode,
    contentSha256: value.contentSha256,
    contentLength: value.contentLength,
  };
}

/** IAE-002/IAE-004: ordered immutable object metadata forms the exact input manifest. */
export function iaeExecutionRequestInputManifestHashV1(
  metadata: readonly IaeExecutionRequestObjectMetadataV1[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: 1,
        objects: metadata.map(manifestBinding),
      }),
      'utf8',
    )
    .digest('hex');
}

function exactMetadata(
  value: IaeExecutionRequestObjectMetadataV1 | undefined,
  descriptor: ExecutionRequestDescriptorV1,
  objectId: string,
): value is IaeExecutionRequestObjectMetadataV1 {
  return (
    value !== undefined &&
    value.objectId === objectId &&
    tenantScopesEqualV1(value.tenantScope, descriptor.tenantScope) &&
    CLOUD_WORKER_DATA_MODES.has(value.dataMode) &&
    value.cloudAvailable === true &&
    value.cloudExecutionAllowed === true &&
    value.status === 'ACTIVE' &&
    value.scanState === 'CLEAN' &&
    SHA256.test(value.contentSha256) &&
    Number.isSafeInteger(value.contentLength) &&
    value.contentLength >= 0 &&
    value.contentLength <= MAX_OBJECT_BYTES
  );
}

/** IAE verifier used by JRA admission; any authority error or metadata drift fails closed. */
export class IaeExecutionRequestDescriptorVerifierAdapter
  implements ExecutionRequestDescriptorVerifierPortV1
{
  public constructor(private readonly objects: IaeExecutionRequestObjectAuthorityPortV1) {}

  public async verify(descriptor: ExecutionRequestDescriptorV1): Promise<boolean> {
    try {
      const metadata: IaeExecutionRequestObjectMetadataV1[] = [];
      let totalBytes = 0;
      for (const objectId of descriptor.inputObjectIds) {
        const value = await this.objects.findExactObjectMetadata({
          tenantScope: descriptor.tenantScope,
          objectId,
        });
        if (!exactMetadata(value, descriptor, objectId)) return false;
        totalBytes += value.contentLength;
        if (!Number.isSafeInteger(totalBytes) || totalBytes > MAX_OBJECT_BYTES) return false;
        metadata.push(value);
      }
      return iaeExecutionRequestInputManifestHashV1(metadata) === descriptor.inputManifestHash;
    } catch {
      return false;
    }
  }
}
