import { createHash } from 'node:crypto';

import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { ArtifactProcessingContentVersionReaderV1 } from './object-storage-artifact-processing-content.adapter.js';
import type {
  IaeWorkerObjectByteStorePortV1,
  IaeWorkerObjectStoreResultV1,
} from '../application/worker-object-transfer.port.js';

function rejected(
  code: Exclude<IaeWorkerObjectStoreResultV1, { readonly accepted: true }>['code'],
): IaeWorkerObjectStoreResultV1 {
  return Object.freeze({ accepted: false, code });
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Plan 425 / IAE-024: local-only composition for the worker byte boundary.
 *
 * Reads are resolved through the existing exact ArtifactVersion processing
 * reader, which re-checks tenant scope, ACTIVE/CLEAN state, cloud placement,
 * immutable hash, and byte length before returning bytes. Writes remain on the
 * create-only worker-result quarantine store. Keeping those authorities
 * separate prevents a result object ID from ever being interpreted as a source
 * object location and avoids exposing a bucket key or credential to the worker.
 */
export class LocalWorkerObjectByteStoreAdapter implements IaeWorkerObjectByteStorePortV1 {
  public constructor(
    private readonly dependencies: {
      readonly input: ArtifactProcessingContentVersionReaderV1;
      readonly output: IaeWorkerObjectByteStorePortV1;
    },
  ) {}

  public async readExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
    readonly maximumByteLength: number;
  }): Promise<IaeWorkerObjectStoreResultV1> {
    if (!Number.isSafeInteger(input.maximumByteLength) || input.maximumByteLength < 0)
      return rejected('STORE_UNAVAILABLE');
    try {
      const record = await this.dependencies.input.loadVersion({
        tenantScope: input.tenantScope,
        artifactVersionId: input.objectId,
      });
      if (record === undefined) return rejected('OBJECT_NOT_FOUND');
      if (record.artifactVersionId !== input.objectId) return rejected('STORE_UNAVAILABLE');
      if (record.bytes.byteLength > input.maximumByteLength) return rejected('OBJECT_OVERSIZE');
      if (
        digest(record.bytes) !== record.contentSha256 ||
        record.bytes.byteLength < 0 ||
        !Number.isSafeInteger(record.bytes.byteLength)
      )
        return rejected('STORE_UNAVAILABLE');
      return Object.freeze({
        accepted: true,
        value: Object.freeze({
          objectId: input.objectId,
          bytes: new Uint8Array(record.bytes),
          contentSha256: record.contentSha256,
          contentLength: record.bytes.byteLength,
        }),
      });
    } catch {
      return rejected('STORE_UNAVAILABLE');
    }
  }

  public writeExact(input: Parameters<IaeWorkerObjectByteStorePortV1['writeExact']>[0]) {
    return this.dependencies.output.writeExact(input);
  }
}
