import { createHash } from 'node:crypto';
import type { FolderProjectionClass } from '../shared/folder-binding-contract-v1.ts';

export type FolderSyncReason =
  | 'NETWORK_OFFLINE'
  | 'DEVICE_REVOKED'
  | 'SOURCE_STALE'
  | 'PROJECTION_REJECTED'
  | 'PARTIAL_UPLOAD'
  | 'SERVER_RECEIPT_LOSS';

export interface ApprovedProjectionUpload {
  readonly projectionId: string;
  readonly version: number;
  readonly class: FolderProjectionClass;
  readonly bytes: Uint8Array;
  readonly destination: 'CLOUD_WORKSPACE_PROJECTION';
}

export type FolderSyncEnqueueResult =
  | { readonly state: 'QUEUED'; readonly idempotencyKey: string }
  | { readonly state: 'REJECTED'; readonly reason: FolderSyncReason };

export interface FolderSyncFlushResult {
  readonly delivered: number;
  readonly failed: number;
  readonly reason?: FolderSyncReason;
}

export interface FolderSyncUploadPort {
  (request: {
    readonly idempotencyKey: string;
    readonly bytes: Uint8Array;
    readonly projectionId: string;
  }): Promise<
    | { readonly accepted: true; readonly receiptId: string }
    | { readonly accepted: false; readonly code: FolderSyncReason }
  >;
}

interface QueueItem {
  readonly idempotencyKey: string;
  readonly projectionId: string;
  readonly bytes: Uint8Array;
}

export class FolderSyncService {
  readonly #upload: FolderSyncUploadPort;
  readonly #queue = new Map<string, QueueItem>();
  readonly #rejected = new Map<string, FolderSyncReason>();
  #autoReroute = false;

  constructor(input: { readonly upload: FolderSyncUploadPort; readonly nowMs: () => number }) {
    this.#upload = input.upload;
    void input.nowMs;
  }

  enqueueApprovedProjection(
    projection: ApprovedProjectionUpload,
  ): Promise<FolderSyncEnqueueResult> {
    const rejected = this.#rejected.get(projection.projectionId);
    if (rejected !== undefined) {
      return { state: 'REJECTED', reason: rejected };
    }

    const idempotencyKey = createHash('sha256')
      .update(projection.projectionId)
      .update(':')
      .update(String(projection.version))
      .update(':')
      .update(projection.class)
      .update(':')
      .update(projection.bytes)
      .digest('hex');

    this.#queue.set(idempotencyKey, {
      idempotencyKey,
      projectionId: projection.projectionId,
      bytes: projection.bytes,
    });
    return Promise.resolve({ state: 'QUEUED', idempotencyKey });
  }

  async flush(): Promise<FolderSyncFlushResult> {
    let delivered = 0;
    let failed = 0;
    let reason: FolderSyncReason | undefined;
    for (const [key, item] of [...this.#queue.entries()]) {
      const result = await this.#upload({
        idempotencyKey: item.idempotencyKey,
        bytes: item.bytes,
        projectionId: item.projectionId,
      });
      if (result.accepted) {
        this.#queue.delete(key);
        delivered += 1;
      } else {
        failed += 1;
        reason = result.code;
        // Remain queued for resume; never auto-reroute or substitute.
        this.#autoReroute = false;
        break;
      }
    }
    return { delivered, failed, ...(reason === undefined ? {} : { reason }) };
  }

  markProjectionRejected(projectionId: string, reason: FolderSyncReason): void {
    this.#rejected.set(projectionId, reason);
    for (const [key, item] of this.#queue) {
      if (item.projectionId === projectionId) this.#queue.delete(key);
    }
  }

  didAutoReroute(): boolean {
    return this.#autoReroute;
  }
}
