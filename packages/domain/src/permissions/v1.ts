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
} as const);

export type PermissionV1 = (typeof PERMISSIONS_V1)[keyof typeof PERMISSIONS_V1];

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
] as const;

export const INITIAL_ROLE_BUNDLES_V1: Readonly<Record<InitialRoleIdV1, InitialRoleBundleV1>> =
  Object.freeze({
    owner: immutableBundle('owner', 'Owner', [
      PERMISSIONS_V1.ORGANIZATION_PROFILE_READ,
      PERMISSIONS_V1.ORGANIZATION_SETTINGS_MANAGE,
      PERMISSIONS_V1.ORGANIZATION_OWNERSHIP_TRANSFER,
      PERMISSIONS_V1.WORKSPACE_SETTINGS_READ,
      PERMISSIONS_V1.WORKSPACE_SETTINGS_MANAGE,
      PERMISSIONS_V1.PROJECT_RECORD_READ,
      PERMISSIONS_V1.PROJECT_RECORD_MANAGE,
      PERMISSIONS_V1.JOB_EXECUTION_READ,
      PERMISSIONS_V1.BILLING_ACCOUNT_READ,
      PERMISSIONS_V1.BILLING_ACCOUNT_MANAGE,
      PERMISSIONS_V1.DEVICE_IDENTITY_READ,
      PERMISSIONS_V1.DEVICE_IDENTITY_REVOKE,
    ]),
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
