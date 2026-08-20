import type { NotificationPreferencesPortV1 } from './notification-preferences.port.js';

/** Production default until the durable DDA database delegate is composed. */
export class UnavailableNotificationPreferencesAdapter implements NotificationPreferencesPortV1 {
  public get(): Promise<{ readonly accepted: false; readonly code: 'UNAVAILABLE' }> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }

  public replace(): Promise<{ readonly accepted: false; readonly code: 'UNAVAILABLE' }> {
    return Promise.resolve({ accepted: false, code: 'UNAVAILABLE' });
  }
}
