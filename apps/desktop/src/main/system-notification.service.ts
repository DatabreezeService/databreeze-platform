export type SystemNotificationKind = 'SOURCE_PROBLEM' | 'SYNC_FAILED' | 'REVIEW_ALERT';

export type SystemNotificationRequest = {
  readonly kind: SystemNotificationKind;
  readonly title: string;
  readonly body: string;
};

export type SystemNotificationResult =
  | { readonly accepted: true; readonly minimizedForLockScreen: true }
  | { readonly accepted: false; readonly reason: 'PERMISSION_DENIED' | 'KIND_NOT_ALLOWED' };

const ALLOWED: ReadonlySet<SystemNotificationKind> = new Set([
  'SOURCE_PROBLEM',
  'SYNC_FAILED',
  'REVIEW_ALERT',
]);

export class SystemNotificationService {
  constructor(private readonly permissionGranted: boolean) {}

  notify(request: SystemNotificationRequest): SystemNotificationResult {
    if (!this.permissionGranted) {
      return { accepted: false, reason: 'PERMISSION_DENIED' };
    }
    if (!ALLOWED.has(request.kind)) {
      return { accepted: false, reason: 'KIND_NOT_ALLOWED' };
    }
    // Lock-screen bodies must stay free of source content; callers pass minimized text only.
    if (/[\\/]|\.csv|\.xlsx|receipt|invoice/i.test(request.body)) {
      return { accepted: false, reason: 'KIND_NOT_ALLOWED' };
    }
    return { accepted: true, minimizedForLockScreen: true };
  }
}
