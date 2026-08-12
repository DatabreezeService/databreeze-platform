import { describe, expect, it } from 'vitest';
import { SystemNotificationService } from '../src/main/system-notification.service.ts';

describe('Desktop system notifications', () => {
  it('allows only source/sync/review alerts with lock-screen minimization', () => {
    const service = new SystemNotificationService(true);
    expect(
      service.notify({
        kind: 'SYNC_FAILED',
        title: 'Sync failed',
        body: 'A connected folder needs attention',
      }),
    ).toEqual({ accepted: true, minimizedForLockScreen: true });
    expect(
      service.notify({
        kind: 'SYNC_FAILED',
        title: 'Sync failed',
        body: 'C:\\Secrets\\receipt.png failed',
      }),
    ).toEqual({ accepted: false, reason: 'KIND_NOT_ALLOWED' });
  });

  it('falls back when OS permission is denied', () => {
    const service = new SystemNotificationService(false);
    expect(
      service.notify({
        kind: 'REVIEW_ALERT',
        title: 'Review',
        body: 'Pending review',
      }),
    ).toEqual({ accepted: false, reason: 'PERMISSION_DENIED' });
  });
});
