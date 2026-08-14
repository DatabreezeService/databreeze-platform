import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export interface IaeWorkerStoredObjectV1 {
  readonly objectId: string;
  readonly bytes: Uint8Array;
  readonly contentSha256: string;
  readonly contentLength: number;
}

export type IaeWorkerObjectStoreResultV1 =
  | { readonly accepted: true; readonly value: IaeWorkerStoredObjectV1 }
  | {
      readonly accepted: false;
      readonly code:
        | 'OBJECT_NOT_FOUND'
        | 'OBJECT_OVERSIZE'
        | 'OBJECT_IMMUTABLE'
        | 'STORE_UNAVAILABLE';
    };

/**
 * IAE-owned exact-object byte boundary. There is intentionally no list, prefix, URL, path,
 * redirect, bucket, or credential operation on this port (IAE-002, IAE-008, JRA-023).
 */
export const IAE_WORKER_OBJECT_BYTE_STORE_PORT = Symbol('IAE_WORKER_OBJECT_BYTE_STORE_PORT');
export interface IaeWorkerObjectByteStorePortV1 {
  readExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
    readonly maximumByteLength: number;
  }): Promise<IaeWorkerObjectStoreResultV1>;
  writeExact(input: {
    readonly tenantScope: TenantScopeV1;
    readonly objectId: string;
    readonly bytes: Uint8Array;
    readonly contentSha256: string;
    readonly contentLength: number;
    readonly maximumByteLength: number;
  }): Promise<IaeWorkerObjectStoreResultV1>;
}
