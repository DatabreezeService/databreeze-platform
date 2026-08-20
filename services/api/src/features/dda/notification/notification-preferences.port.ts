import { createHash } from 'node:crypto';
import type {
  DdaNotificationPreferencesAccepted,
  DdaNotificationPreferencesCommand,
} from '@databreeze/contracts/v4';
import type { NotificationTenantContextV1 } from './notification-repository.port.js';

export const DDA_NOTIFICATION_PREFERENCES_PORT = Symbol('DDA_NOTIFICATION_PREFERENCES_PORT');

export type NotificationPreferenceCategoryV1 =
  DdaNotificationPreferencesCommand['preferences'][number]['category'];
export type NotificationPreferenceChannelV1 =
  DdaNotificationPreferencesCommand['preferences'][number]['channel'];
export type NotificationPreferenceUrgencyV1 =
  DdaNotificationPreferencesCommand['preferences'][number]['minimumUrgency'];
export type NotificationPreferenceDeliveryModeV1 =
  DdaNotificationPreferencesCommand['preferences'][number]['deliveryMode'];

export type NotificationPreferenceResultV1 =
  | {
      readonly accepted: true;
      readonly value: DdaNotificationPreferencesAccepted;
      readonly replayed?: boolean;
    }
  | {
      readonly accepted: false;
      readonly code:
        | 'INVALID_INPUT'
        | 'UNAUTHORIZED'
        | 'REVISION_CONFLICT'
        | 'IDEMPOTENCY_CONFLICT'
        | 'UNAVAILABLE';
    };

export interface NotificationPreferencesPortV1 {
  get(context: NotificationTenantContextV1): Promise<NotificationPreferenceResultV1>;
  replace(input: {
    readonly context: NotificationTenantContextV1;
    readonly command: DdaNotificationPreferencesCommand;
    readonly idempotencyKey: string;
    readonly fingerprint: string;
  }): Promise<NotificationPreferenceResultV1>;
}

export const NOTIFICATION_PREFERENCE_CATEGORIES_V1 = Object.freeze([
  'REVIEWS',
  'DATA',
  'DASHBOARDS',
  'USAGE',
  'SECURITY',
  'BILLING',
  'SYSTEM',
] as const);

export const NOTIFICATION_PREFERENCE_CHANNELS_V1 = Object.freeze([
  'IN_APP',
  'EMAIL',
  'PUSH',
  'DESKTOP',
] as const);

const preferenceOrder = (value: { readonly category: string; readonly channel: string }): string =>
  `${value.category}\u0000${value.channel}`;

/** NCO-024: canonical request fingerprint excludes tenant/recipient authority. */
export function fingerprintNotificationPreferencesV1(
  command: DdaNotificationPreferencesCommand,
): string {
  const normalized = {
    schemaVersion: command.schemaVersion,
    expectedRevision: command.expectedRevision,
    preferences: [...command.preferences]
      .map((preference) => ({
        category: preference.category,
        channel: preference.channel,
        enabled: preference.enabled,
        minimumUrgency: preference.minimumUrgency,
        deliveryMode: preference.deliveryMode,
        quietHours: {
          enabled: preference.quietHours.enabled,
          start: preference.quietHours.start,
          end: preference.quietHours.end,
        },
        timezone: preference.timezone,
      }))
      .sort((left, right) => preferenceOrder(left).localeCompare(preferenceOrder(right))),
  };
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
}
