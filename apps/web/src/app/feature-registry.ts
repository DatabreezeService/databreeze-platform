import type { MessageKeyV1 } from '@databreeze/i18n/v1';
import type { NavigationKey } from './navigation.ts';

export interface WebFeatureRegistration {
  readonly key: NavigationKey;
  readonly messageKey?: MessageKeyV1;
  readonly path: string;
}

/** Static registry: arbitrary runtime feature code is intentionally unsupported. Partial WEB-022. */
export const WEB_FEATURE_REGISTRY = Object.freeze([
  { key: 'workspace', messageKey: 'nav.home', path: 'workspace' },
  { key: 'inbox', messageKey: 'nav.inbox', path: 'inbox' },
  { key: 'jobs', messageKey: 'nav.jobs', path: 'jobs' },
  { key: 'reviews', messageKey: 'nav.reviews', path: 'reviews' },
  { key: 'autopilot', path: 'autopilot' },
  { key: 'approvals', messageKey: 'nav.approvals', path: 'approvals' },
  { key: 'reports', messageKey: 'nav.reports', path: 'reports' },
  { key: 'devices', messageKey: 'nav.devices', path: 'devices' },
  { key: 'administration', messageKey: 'nav.settings', path: 'administration' },
  { key: 'usage', path: 'usage' },
  { key: 'audit', messageKey: 'nav.audit', path: 'audit' },
] satisfies readonly WebFeatureRegistration[]);

export function getFeatureRegistration(key: NavigationKey): WebFeatureRegistration {
  const registration = WEB_FEATURE_REGISTRY.find((item) => item.key === key);
  if (registration === undefined) {
    throw new Error('UNKNOWN_BUILD_TIME_FEATURE');
  }
  return registration;
}
