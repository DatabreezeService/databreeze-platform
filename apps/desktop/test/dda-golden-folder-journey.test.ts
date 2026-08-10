import { describe, expect, it } from 'vitest';

import { FolderSyncService } from '../src/application/folder-sync.service.ts';
import { PublicationProjectionService } from '../src/application/publication-projection.service.ts';

/**
 * Golden Desktop folder journey (prototype): reviewed projection → idempotent sync.
 * Honest limits: DSO stub, no long-running FS watcher, folder UI not in shell nav (085).
 */
describe('DDA golden folder journey', () => {
  it('reviews a hybrid projection then syncs only approved bytes idempotently', async () => {
    const projection = new PublicationProjectionService({
      workspacePolicy: {
        maxProjectionClass: 'DASHBOARD_AGGREGATES',
        allowedFields: ['region', 'amount'],
        allowOriginalContent: false,
      },
    });

    const draft = {
      class: 'DASHBOARD_AGGREGATES' as const,
      fieldAllowlist: ['region', 'amount'],
      rowCount: 1,
      byteCount: 32,
      destination: 'CLOUD_WORKSPACE_PROJECTION' as const,
      evidenceConsequences: ['removes original paths', 'keeps aggregate evidence keys'],
      dataMode: 'HYBRID' as const,
      version: 1,
    };

    const preview = projection.preview(draft);
    expect(preview.accepted).toBe(true);

    const approved = projection.approve(draft);
    expect(approved.accepted).toBe(true);
    if (!approved.accepted) return;

    const uploads: Array<{ idempotencyKey: string; projectionId: string }> = [];
    const sync = new FolderSyncService({
      upload: async (request) => {
        uploads.push({
          idempotencyKey: request.idempotencyKey,
          projectionId: request.projectionId,
        });
        return { accepted: true, receiptId: 'rcpt_golden_1' };
      },
      nowMs: () => 1_700_000_000_000,
    });

    const projectionId = '01GOLDENFOLDERJOURNEY00001';
    const bytes = new TextEncoder().encode('{"region":"HN","amount":1000}');
    const first = await sync.enqueueApprovedProjection({
      projectionId,
      version: approved.value.version,
      class: approved.value.class,
      bytes,
      destination: 'CLOUD_WORKSPACE_PROJECTION',
    });
    expect(first.state).toBe('QUEUED');
    if (first.state !== 'QUEUED') return;

    await expect(sync.flush()).resolves.toMatchObject({ delivered: 1, failed: 0 });

    const replay = await sync.enqueueApprovedProjection({
      projectionId,
      version: approved.value.version,
      class: approved.value.class,
      bytes,
      destination: 'CLOUD_WORKSPACE_PROJECTION',
    });
    expect(replay).toMatchObject({ state: 'QUEUED', idempotencyKey: first.idempotencyKey });
    expect(uploads.every((item) => item.projectionId === projectionId)).toBe(true);
    expect(JSON.stringify(uploads)).not.toMatch(/C:\\\\|Users|Approved/i);
  });
});
