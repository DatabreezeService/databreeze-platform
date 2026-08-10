import { describe, expect, it } from 'vitest';
import { FolderSyncService } from '../src/application/folder-sync.service.ts';

describe('DDA-037/DDA-039 folder sync idempotency', () => {
  it('syncs approved projection bytes idempotently and resumes offline queue without path leakage', async () => {
    const uploads: Array<{ idempotencyKey: string; bytes: Uint8Array; projectionId: string }> = [];
    const sync = new FolderSyncService({
      upload: async (request) => {
        uploads.push(request);
        if (uploads.length === 1) return { accepted: false, code: 'NETWORK_OFFLINE' };
        return { accepted: true, receiptId: 'rcpt_1' };
      },
      nowMs: () => 1_700_000_000_000,
    });

    const projection = {
      projectionId: '01JJJJJJJJJJJJJJJJJJJJJJJJ',
      version: 1,
      class: 'DASHBOARD_AGGREGATES' as const,
      bytes: new TextEncoder().encode('{"amount":10}'),
      destination: 'CLOUD_WORKSPACE_PROJECTION' as const,
    };

    const first = await sync.enqueueApprovedProjection(projection);
    expect(first.state).toBe('QUEUED');
    if (first.state !== 'QUEUED') return;

    const offline = await sync.flush();
    expect(offline).toMatchObject({ delivered: 0, failed: 1, reason: 'NETWORK_OFFLINE' });

    const replay = await sync.enqueueApprovedProjection(projection);
    expect(replay).toMatchObject({ state: 'QUEUED', idempotencyKey: first.idempotencyKey });

    const delivered = await sync.flush();
    expect(delivered).toMatchObject({ delivered: 1, failed: 0 });
    expect(uploads).toHaveLength(2);
    expect(uploads[0]?.idempotencyKey).toBe(uploads[1]?.idempotencyKey);
    expect(JSON.stringify(uploads[0])).not.toMatch(/C:\\\\|Approved|Users/i);
  });

  it('handles revocation, stale device, rejected projection, and never auto-reroutes', async () => {
    const sync = new FolderSyncService({
      upload: async () => ({ accepted: false, code: 'DEVICE_REVOKED' }),
      nowMs: () => 1,
    });

    await sync.enqueueApprovedProjection({
      projectionId: '01KKKKKKKKKKKKKKKKKKKKKKKK',
      version: 1,
      class: 'METADATA_ONLY',
      bytes: new Uint8Array([1, 2, 3]),
      destination: 'CLOUD_WORKSPACE_PROJECTION',
    });
    await expect(sync.flush()).resolves.toMatchObject({
      delivered: 0,
      failed: 1,
      reason: 'DEVICE_REVOKED',
    });
    expect(sync.didAutoReroute()).toBe(false);

    sync.markProjectionRejected('01KKKKKKKKKKKKKKKKKKKKKKKK', 'PROJECTION_REJECTED');
    await expect(
      sync.enqueueApprovedProjection({
        projectionId: '01KKKKKKKKKKKKKKKKKKKKKKKK',
        version: 1,
        class: 'METADATA_ONLY',
        bytes: new Uint8Array([1, 2, 3]),
        destination: 'CLOUD_WORKSPACE_PROJECTION',
      }),
    ).resolves.toMatchObject({ state: 'REJECTED', reason: 'PROJECTION_REJECTED' });
  });
});
