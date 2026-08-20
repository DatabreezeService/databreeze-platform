import type {
  DdaNotificationPreferencesAccepted,
  DdaNotificationPreferencesCommand,
} from '@databreeze/contracts/v4';

export const DEFAULT_NOTIFICATION_TIMEZONE_V1 = 'Asia/Ho_Chi_Minh';

const categories = [
  'REVIEWS',
  'DATA',
  'DASHBOARDS',
  'USAGE',
  'SECURITY',
  'BILLING',
  'SYSTEM',
] as const;
const channels = ['IN_APP', 'EMAIL', 'PUSH', 'DESKTOP'] as const;

function isMandatory(category: (typeof categories)[number]): boolean {
  return category === 'SECURITY' || category === 'BILLING';
}

function defaultEntry(
  category: (typeof categories)[number],
  channel: (typeof channels)[number],
): DdaNotificationPreferencesAccepted['preferences'][number] {
  const mandatory = isMandatory(category);
  return {
    category,
    channel,
    enabled: mandatory || channel === 'IN_APP',
    minimumUrgency: mandatory ? 'CRITICAL' : 'NORMAL',
    deliveryMode: channel === 'EMAIL' && !mandatory ? 'DIGEST' : 'IMMEDIATE',
    quietHours: { enabled: false, start: '22:00', end: '07:00' },
    timezone: DEFAULT_NOTIFICATION_TIMEZONE_V1,
    mandatory,
  };
}

export function defaultNotificationPreferencesV1(revision = 1): DdaNotificationPreferencesAccepted {
  return Object.freeze({
    schemaVersion: 4,
    revision,
    preferences: Object.freeze(
      categories.flatMap((category) => channels.map((channel) => defaultEntry(category, channel))),
    ),
  });
}

export function commandPreferencesFromSnapshotV1(
  snapshot: DdaNotificationPreferencesAccepted,
): DdaNotificationPreferencesCommand['preferences'] {
  return snapshot.preferences.map((preference) => ({
    category: preference.category,
    channel: preference.channel,
    enabled: preference.enabled,
    minimumUrgency: preference.minimumUrgency,
    deliveryMode: preference.deliveryMode,
    quietHours: preference.quietHours,
    timezone: preference.timezone,
  }));
}

export function mandatoryNotificationPreferenceV1(category: string): boolean {
  return category === 'SECURITY' || category === 'BILLING';
}
