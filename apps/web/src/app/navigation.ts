import { PERMISSIONS_V1, type PermissionV1 } from '@databreeze/domain/permissions/v1';

export const WEB_ENTITLEMENTS = [
  'administration',
  'audit',
  'automation',
  'billing',
  'devices',
  'governance',
  'reports',
] as const;

export type WebEntitlement = (typeof WEB_ENTITLEMENTS)[number];

export interface WebAccessContext {
  readonly entitlements: readonly WebEntitlement[];
  readonly permissions: readonly PermissionV1[];
}

export type NavigationKey =
  | 'administration'
  | 'approvals'
  | 'autopilot'
  | 'audit'
  | 'devices'
  | 'inbox'
  | 'jobs'
  | 'reports'
  | 'reviews'
  | 'usage'
  | 'workspace';

export interface NavigationItem {
  readonly key: NavigationKey;
  readonly path: string;
  readonly requiredEntitlements: readonly WebEntitlement[];
  readonly requiredPermissions: readonly PermissionV1[];
}

function navigationItem(
  key: NavigationKey,
  path: string,
  requiredPermissions: readonly PermissionV1[] = [],
  requiredEntitlements: readonly WebEntitlement[] = [],
): NavigationItem {
  return Object.freeze({
    key,
    path,
    requiredEntitlements: Object.freeze([...requiredEntitlements]),
    requiredPermissions: Object.freeze([...requiredPermissions]),
  });
}

/** Build-time registry only. Client hints never replace server authorization. Partial WEB-002/022. */
export const WEB_NAVIGATION_REGISTRY = Object.freeze([
  navigationItem('workspace', 'workspace'),
  navigationItem('inbox', 'inbox', [PERMISSIONS_V1.ARTIFACT_RECORD_READ]),
  navigationItem('jobs', 'jobs', [PERMISSIONS_V1.JOB_EXECUTION_READ], ['automation']),
  navigationItem('reviews', 'reviews', [PERMISSIONS_V1.JOB_EXECUTION_READ], ['automation']),
  navigationItem('autopilot', 'autopilot', [PERMISSIONS_V1.JOB_EXECUTION_READ], ['automation']),
  navigationItem('approvals', 'approvals', [PERMISSIONS_V1.APPROVAL_REQUEST_READ], ['governance']),
  navigationItem('reports', 'reports', [PERMISSIONS_V1.ARTIFACT_RECORD_READ], ['reports']),
  navigationItem('devices', 'devices', [PERMISSIONS_V1.DEVICE_IDENTITY_READ], ['devices']),
  navigationItem(
    'administration',
    'administration',
    [PERMISSIONS_V1.ORGANIZATION_SETTINGS_MANAGE],
    ['administration'],
  ),
  navigationItem('usage', 'usage', [PERMISSIONS_V1.BILLING_ACCOUNT_READ], ['billing']),
  navigationItem('audit', 'audit', [PERMISSIONS_V1.ORGANIZATION_PROFILE_READ], ['audit']),
] satisfies readonly NavigationItem[]);

export const DEFAULT_ACCESS_CONTEXT: WebAccessContext = Object.freeze({
  entitlements: Object.freeze([...WEB_ENTITLEMENTS]),
  permissions: Object.freeze(Object.values(PERMISSIONS_V1)),
});

export function filterNavigationItems(
  accessContext: WebAccessContext = DEFAULT_ACCESS_CONTEXT,
): readonly NavigationItem[] {
  const permissions = new Set(accessContext.permissions);
  const entitlements = new Set(accessContext.entitlements);
  return WEB_NAVIGATION_REGISTRY.filter(
    (item) =>
      item.requiredPermissions.every((permission) => permissions.has(permission)) &&
      item.requiredEntitlements.every((entitlement) => entitlements.has(entitlement)),
  );
}
