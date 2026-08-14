import { createHash } from 'node:crypto';

import { tenantScopeKeyV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type {
  IaeWorkerObjectByteStorePortV1,
  IaeWorkerObjectStoreResultV1,
  IaeWorkerStoredObjectV1,
} from '../application/worker-object-transfer.port.js';

export interface InMemoryWorkerObjectSeedV1 extends IaeWorkerStoredObjectV1 {
  readonly tenantScope: TenantScopeV1;
}

function key(tenantScope: TenantScopeV1, objectId: string): string {
  return `${tenantScopeKeyV1(tenantScope)}:${objectId}`;
}

function clone(record: IaeWorkerStoredObjectV1): IaeWorkerStoredObjectV1 {
  return Object.freeze({ ...record, bytes: new Uint8Array(record.bytes) });
}

function verified(input: {
  readonly bytes: Uint8Array;
  readonly contentSha256: string;
  readonly contentLength: number;
}): boolean {
  return (
    input.bytes.byteLength === input.contentLength &&
    createHash('sha256').update(input.bytes).digest('hex') === input.contentSha256
  );
}

/** Exact-scope immutable byte adapter used by focused IAE tests and local composition only. */
export class InMemoryWorkerObjectByteStoreAdapter implements IaeWorkerObjectByteStorePortV1 {
  private readonly records = new Map<string, IaeWorkerStoredObjectV1>();

  public constructor(seeds: readonly InMemoryWorkerObjectSeedV1[] = []) {
    for (const seed of seeds) {
      if (!verified(seed)) throw new Error('IAE_WORKER_OBJECT_SEED_INTEGRITY_INVALID');
      this.records.set(key(seed.tenantScope, seed.objectId), clone(seed));
    }
  }

  public async readExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
    readonly maximumByteLength: number;
  }): Promise<IaeWorkerObjectStoreResultV1> {
    await Promise.resolve();
    const record = this.records.get(key(input.tenantScope, input.objectId));
    if (!record) return Object.freeze({ accepted: false, code: 'OBJECT_NOT_FOUND' as const });
    if (record.contentLength > input.maximumByteLength)
      return Object.freeze({ accepted: false, code: 'OBJECT_OVERSIZE' as const });
    return Object.freeze({ accepted: true, value: clone(record) });
  }

  public async writeExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
    readonly bytes: Uint8Array;
    readonly contentSha256: string;
    readonly contentLength: number;
    readonly maximumByteLength: number;
  }): Promise<IaeWorkerObjectStoreResultV1> {
    await Promise.resolve();
    if (
      input.contentLength > input.maximumByteLength ||
      input.bytes.byteLength > input.maximumByteLength
    )
      return Object.freeze({ accepted: false, code: 'OBJECT_OVERSIZE' as const });
    if (!verified(input))
      return Object.freeze({ accepted: false, code: 'STORE_UNAVAILABLE' as const });
    const objectKey = key(input.tenantScope, input.objectId);
    const existing = this.records.get(objectKey);
    if (existing) {
      if (
        existing.contentSha256 !== input.contentSha256 ||
        existing.contentLength !== input.contentLength
      )
        return Object.freeze({ accepted: false, code: 'OBJECT_IMMUTABLE' as const });
      return Object.freeze({ accepted: true, value: clone(existing) });
    }
    const stored = clone({
      objectId: input.objectId,
      bytes: input.bytes,
      contentSha256: input.contentSha256,
      contentLength: input.contentLength,
    });
    this.records.set(objectKey, stored);
    return Object.freeze({ accepted: true, value: clone(stored) });
  }
}
