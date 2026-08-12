/**
 * Version 1 of the DataBreeze permission vocabulary.
 *
 * Partial foundation coverage: IAM-002, IAM-003, and IAM-004.
 */

export const PERMISSION_SCHEMA_VERSION_V1 = 1 as const;

export const PERMISSIONS_V1 = Object.freeze({
  ORGANIZATION_PROFILE_READ: 'organization.profile.read',
  ORGANIZATION_SETTINGS_MANAGE: 'organization.settings.manage',
  ORGANIZATION_OWNERSHIP_TRANSFER: 'organization.ownership.transfer',
  WORKSPACE_SETTINGS_READ: 'workspace.settings.read',
  WORKSPACE_SETTINGS_MANAGE: 'workspace.settings.manage',
  PROJECT_RECORD_READ: 'project.record.read',
  PROJECT_RECORD_MANAGE: 'project.record.manage',
  ARTIFACT_RECORD_READ: 'artifact.record.read',
  ARTIFACT_ORIGINAL_DOWNLOAD: 'artifact.original.download',
  ARTIFACT_DERIVED_CREATE: 'artifact.derived.create',
  JOB_EXECUTION_READ: 'job.execution.read',
  JOB_EXECUTION_CREATE: 'job.execution.create',
  JOB_EXECUTION_RUN: 'job.execution.run',
  JOB_EXECUTION_CANCEL: 'job.execution.cancel',
  APPROVAL_REQUEST_READ: 'approval.request.read',
  APPROVAL_DECISION_CREATE: 'approval.decision.create',
  BILLING_ACCOUNT_READ: 'billing.account.read',
  BILLING_ACCOUNT_MANAGE: 'billing.account.manage',
  DEVICE_IDENTITY_READ: 'device.identity.read',
  DEVICE_IDENTITY_REVOKE: 'device.identity.revoke',
  SERVICE_ACCOUNT_READ: 'service.account.read',
  SERVICE_ACCOUNT_MANAGE: 'service.account.manage',
  SERVICE_ACCOUNT_REVOKE: 'service.account.revoke',
} as const);

export type PermissionV1 = (typeof PERMISSIONS_V1)[keyof typeof PERMISSIONS_V1];

export const AUTHORIZATION_CHANNELS_V1 = Object.freeze([
  'api',
  'web',
  'desktop',
  'android',
  'worker',
  'sync',
  'stream',
  'shared-link',
] as const);

export type AuthorizationChannelV1 = (typeof AUTHORIZATION_CHANNELS_V1)[number];

export const RESOURCE_TYPES_V1 = Object.freeze([
  'approval-request',
  'artifact',
  'billing-account',
  'device',
  'service-account',
  'job',
  'organization',
  'project',
  'workspace',
] as const);

export type ResourceTypeV1 = (typeof RESOURCE_TYPES_V1)[number];

export interface PermissionApplicabilityV1 {
  readonly resourceType: ResourceTypeV1;
  readonly allowedChannels: readonly AuthorizationChannelV1[];
}

function immutableApplicability(
  resourceType: ResourceTypeV1,
  allowedChannels: readonly AuthorizationChannelV1[],
): PermissionApplicabilityV1 {
  return Object.freeze({ resourceType, allowedChannels: Object.freeze([...allowedChannels]) });
}

/**
 * Closed transport applicability for every v1 permission.
 *
 * A permission being present in a role bundle never implies that it is valid on every channel.
 * New permissions and channels require a new versioned entry instead of inheriting access.
 */
export const PERMISSION_APPLICABILITY_V1: Readonly<
  Record<PermissionV1, PermissionApplicabilityV1>
> = Object.freeze({
  'organization.profile.read': immutableApplicability('organization', [
    'api',
    'web',
    'desktop',
    'android',
  ]),
  'organization.settings.manage': immutableApplicability('organization', ['api', 'web']),
  'organization.ownership.transfer': immutableApplicability('organization', ['api', 'web']),
  'workspace.settings.read': immutableApplicability('workspace', [
    'api',
    'web',
    'desktop',
    'android',
    'worker',
  ]),
  'workspace.settings.manage': immutableApplicability('workspace', ['api', 'web']),
  'project.record.read': immutableApplicability('project', [
    'api',
    'web',
    'desktop',
    'android',
    'worker',
    'sync',
  ]),
  'project.record.manage': immutableApplicability('project', ['api', 'web']),
  'artifact.record.read': immutableApplicability('artifact', [
    'api',
    'web',
    'desktop',
    'android',
    'worker',
    'sync',
    'shared-link',
  ]),
  'artifact.original.download': immutableApplicability('artifact', [
    'api',
    'web',
    'desktop',
    'android',
  ]),
  'artifact.derived.create': immutableApplicability('artifact', [
    'api',
    'web',
    'desktop',
    'worker',
  ]),
  'job.execution.read': immutableApplicability('job', [
    'api',
    'web',
    'desktop',
    'android',
    'worker',
    'sync',
    'stream',
  ]),
  'job.execution.create': immutableApplicability('job', ['api', 'web', 'desktop', 'worker']),
  'job.execution.run': immutableApplicability('job', ['api', 'web', 'desktop', 'worker']),
  'job.execution.cancel': immutableApplicability('job', ['api', 'web', 'desktop']),
  'approval.request.read': immutableApplicability('approval-request', [
    'api',
    'web',
    'desktop',
    'android',
  ]),
  'approval.decision.create': immutableApplicability('approval-request', ['api', 'web', 'android']),
  'billing.account.read': immutableApplicability('billing-account', ['api', 'web']),
  'billing.account.manage': immutableApplicability('billing-account', ['api', 'web']),
  'device.identity.read': immutableApplicability('device', ['api', 'web']),
  'device.identity.revoke': immutableApplicability('device', ['api', 'web']),
  'service.account.read': immutableApplicability('service-account', ['api', 'web']),
  'service.account.manage': immutableApplicability('service-account', ['api', 'web']),
  'service.account.revoke': immutableApplicability('service-account', ['api', 'web']),
});

export const INITIAL_ROLE_IDS_V1 = Object.freeze([
  'owner',
  'admin',
  'analyst',
  'operator',
  'approver',
  'viewer',
] as const);

export type InitialRoleIdV1 = (typeof INITIAL_ROLE_IDS_V1)[number];

export interface InitialRoleBundleV1 {
  readonly id: InitialRoleIdV1;
  readonly name: 'Owner' | 'Admin' | 'Analyst' | 'Operator' | 'Approver' | 'Viewer';
  readonly schemaVersion: typeof PERMISSION_SCHEMA_VERSION_V1;
  readonly permissions: readonly PermissionV1[];
}

function immutableBundle(
  id: InitialRoleIdV1,
  name: InitialRoleBundleV1['name'],
  permissions: readonly PermissionV1[],
): InitialRoleBundleV1 {
  return Object.freeze({
    id,
    name,
    schemaVersion: PERMISSION_SCHEMA_VERSION_V1,
    permissions: Object.freeze([...permissions]),
  });
}

const adminPermissions = [
  PERMISSIONS_V1.ORGANIZATION_PROFILE_READ,
  PERMISSIONS_V1.ORGANIZATION_SETTINGS_MANAGE,
  PERMISSIONS_V1.WORKSPACE_SETTINGS_READ,
  PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE,
  PERMISSIONS_V1.PROJECT_RECORD_READ,
  PERMISSIONS_V1.PROJECT_RECORD_MANAGE,
  PERMISSIONS_V1.JOB_EXECUTION_READ,
  PERMISSIONS_V1.DEVICE_IDENTITY_READ,
  PERMISSIONS_V1.DEVICE_IDENTITY_REVOKE,
  PERMISSIONS_V1.SERVICE_ACCOUNT_READ,
  PERMISSIONS_V1.SERVICE_ACCOUNT_MANAGE,
  PERMISSIONS_V1.SERVICE_ACCOUNT_REVOKE,
] as const;

const ownerPermissionSet = new Set<PermissionV1>([
  ...adminPermissions,
  PERMISSIONS_V1.ORGANIZATION_OWNERSHIP_TRANSFER,
  PERMISSIONS_V1.BILLING_ACCOUNT_READ,
  PERMISSIONS_V1.BILLING_ACCOUNT_MANAGE,
]);
const ownerPermissions = Object.freeze(
  Object.values(PERMISSIONS_V1).filter((permission) => ownerPermissionSet.has(permission)),
);

export const INITIAL_ROLE_BUNDLES_V1: Readonly<Record<InitialRoleIdV1, InitialRoleBundleV1>> =
  Object.freeze({
    owner: immutableBundle('owner', 'Owner', ownerPermissions),
    admin: immutableBundle('admin', 'Admin', adminPermissions),
    analyst: immutableBundle('analyst', 'Analyst', [
      PERMISSIONS_V1.ORGANIZATION_PROFILE_READ,
      PERMISSIONS_V1.WORKSPACE_SETTINGS_READ,
      PERMISSIONS_V1.PROJECT_RECORD_READ,
      PERMISSIONS_V1.ARTIFACT_RECORD_READ,
      PERMISSIONS_V1.ARTIFACT_ORIGINAL_DOWNLOAD,
      PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE,
      PERMISSIONS_V1.JOB_EXECUTION_READ,
      PERMISSIONS_V1.JOB_EXECUTION_CREATE,
      PERMISSIONS_V1.JOB_EXECUTION_RUN,
      PERMISSIONS_V1.JOB_EXECUTION_CANCEL,
    ]),
    operator: immutableBundle('operator', 'Operator', [
      PERMISSIONS_V1.ORGANIZATION_PROFILE_READ,
      PERMISSIONS_V1.WORKSPACE_SETTINGS_READ,
      PERMISSIONS_V1.PROJECT_RECORD_READ,
      PERMISSIONS_V1.ARTIFACT_RECORD_READ,
      PERMISSIONS_V1.ARTIFACT_DERIVED_CREATE,
      PERMISSIONS_V1.JOB_EXECUTION_READ,
      PERMISSIONS_V1.JOB_EXECUTION_RUN,
    ]),
    approver: immutableBundle('approver', 'Approver', [
      PERMISSIONS_V1.ORGANIZATION_PROFILE_READ,
      PERMISSIONS_V1.WORKSPACE_SETTINGS_READ,
      PERMISSIONS_V1.PROJECT_RECORD_READ,
      PERMISSIONS_V1.ARTIFACT_RECORD_READ,
      PERMISSIONS_V1.JOB_EXECUTION_READ,
      PERMISSIONS_V1.APPROVAL_REQUEST_READ,
      PERMISSIONS_V1.APPROVAL_DECISION_CREATE,
    ]),
    viewer: immutableBundle('viewer', 'Viewer', [
      PERMISSIONS_V1.ORGANIZATION_PROFILE_READ,
      PERMISSIONS_V1.WORKSPACE_SETTINGS_READ,
      PERMISSIONS_V1.PROJECT_RECORD_READ,
      PERMISSIONS_V1.ARTIFACT_RECORD_READ,
      PERMISSIONS_V1.JOB_EXECUTION_READ,
    ]),
  });

const permissionSet = new Set<PermissionV1>(Object.values(PERMISSIONS_V1));
const roleSet = new Set<InitialRoleIdV1>(INITIAL_ROLE_IDS_V1);

export function isPermissionV1(value: unknown): value is PermissionV1 {
  return typeof value === 'string' && permissionSet.has(value as PermissionV1);
}

export function isRoleIdV1(value: unknown): value is InitialRoleIdV1 {
  return typeof value === 'string' && roleSet.has(value as InitialRoleIdV1);
}

export function roleHasPermissionV1(roleId: unknown, permission: unknown): boolean {
  if (!isRoleIdV1(roleId) || !isPermissionV1(permission)) {
    return false;
  }

  return INITIAL_ROLE_BUNDLES_V1[roleId].permissions.includes(permission);
}

/**
 * IAM-025: customer-visible access presets. Presentation metadata only; authorization
 * still uses the six canonical server roles and versioned permission constants.
 */
export const MEMBERSHIP_ACCESS_PRESETS_V1 = Object.freeze(['OWNER', 'EDITOR', 'VIEWER'] as const);

export type MembershipAccessPresetV1 = (typeof MEMBERSHIP_ACCESS_PRESETS_V1)[number];

const accessPresetSet = new Set<MembershipAccessPresetV1>(MEMBERSHIP_ACCESS_PRESETS_V1);

export function isMembershipAccessPresetV1(value: unknown): value is MembershipAccessPresetV1 {
  return typeof value === 'string' && accessPresetSet.has(value as MembershipAccessPresetV1);
}

const editorPermissions = Object.freeze(
  Array.from(
    new Set<PermissionV1>([
      ...INITIAL_ROLE_BUNDLES_V1.analyst.permissions,
      PERMISSIONS_V1.PROJECT_RECORD_MANAGE,
    ]),
  ),
);

export interface AccessPresetMappingV1 {
  readonly preset: MembershipAccessPresetV1;
  readonly roleId: InitialRoleIdV1;
  readonly permissions: readonly PermissionV1[];
}

export const ACCESS_PRESET_MAPPINGS_V1: Readonly<
  Record<MembershipAccessPresetV1, AccessPresetMappingV1>
> = Object.freeze({
  OWNER: Object.freeze({
    preset: 'OWNER',
    roleId: 'owner',
    permissions: INITIAL_ROLE_BUNDLES_V1.owner.permissions,
  }),
  EDITOR: Object.freeze({
    preset: 'EDITOR',
    roleId: 'analyst',
    permissions: editorPermissions,
  }),
  VIEWER: Object.freeze({
    preset: 'VIEWER',
    roleId: 'viewer',
    permissions: INITIAL_ROLE_BUNDLES_V1.viewer.permissions,
  }),
});

export function accessPresetForRoleIdV1(roleId: unknown): MembershipAccessPresetV1 | undefined {
  if (!isRoleIdV1(roleId)) return undefined;
  if (roleId === 'owner') return 'OWNER';
  if (roleId === 'analyst') return 'EDITOR';
  if (roleId === 'viewer') return 'VIEWER';
  return undefined;
}

/** IAM-024: closed agent grant levels with monotonic order for lesser-of comparisons. */
export const AGENT_GRANT_LEVELS_V1 = Object.freeze([
  'NONE',
  'ANALYZE',
  'PROPOSE_CHANGES',
  'APPLY_CONFIRMED_CHANGES',
] as const);

export type AgentGrantLevelV1 = (typeof AGENT_GRANT_LEVELS_V1)[number];

export const AGENT_LEVEL_ORDER_V1 = Object.freeze({
  NONE: 0,
  ANALYZE: 1,
  PROPOSE_CHANGES: 2,
  APPLY_CONFIRMED_CHANGES: 3,
} as const);

const agentLevelSet = new Set<AgentGrantLevelV1>(AGENT_GRANT_LEVELS_V1);

export function isAgentGrantLevelV1(value: unknown): value is AgentGrantLevelV1 {
  return typeof value === 'string' && agentLevelSet.has(value as AgentGrantLevelV1);
}

export function lesserAgentGrantLevelV1(
  left: AgentGrantLevelV1,
  right: AgentGrantLevelV1,
): AgentGrantLevelV1 {
  return AGENT_LEVEL_ORDER_V1[left] <= AGENT_LEVEL_ORDER_V1[right] ? left : right;
}

/**
 * IAM-024: Viewer agent capacity tops at ANALYZE; Owner/Editor may reach APPLY after confirmation.
 * Grants never expand dataset or action permission beyond the member's access preset.
 */
export function maxAgentGrantLevelForPresetV1(
  preset: MembershipAccessPresetV1,
): AgentGrantLevelV1 {
  return preset === 'VIEWER' ? 'ANALYZE' : 'APPLY_CONFIRMED_CHANGES';
}

export function defaultAgentGrantLevelForPresetV1(
  preset: MembershipAccessPresetV1,
): AgentGrantLevelV1 {
  return preset === 'VIEWER' ? 'NONE' : 'ANALYZE';
}
