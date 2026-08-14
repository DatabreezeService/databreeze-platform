import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

import type { DashboardAuthorizationPortV1 } from './dashboard-authorization.port.js';

/** Optional HTTP seams. Production composition must bind these to server-owned authorities. */
export const DASHBOARD_AUTHORIZATION_PORT = Symbol('DASHBOARD_AUTHORIZATION_PORT');
export const DASHBOARD_RESULT_READER_PORT = Symbol('DASHBOARD_RESULT_READER_PORT');
export const DASHBOARD_PERMISSION_PROJECTION_PORT = Symbol('DASHBOARD_PERMISSION_PROJECTION_PORT');

export type DashboardResultReaderResultV1 =
  | {
      readonly accepted: true;
      readonly rows: readonly Record<string, string>[];
    }
  | {
      readonly accepted: false;
      readonly code: 'NOT_FOUND' | 'UNAUTHORIZED' | 'UNAVAILABLE';
    };

/** Reads a permission-filtered, server-owned materialized result; it never accepts browser rows. */
export interface DashboardResultReaderPortV1 {
  read(input: {
    readonly context: IamTenantContextV1;
    readonly snapshotId: string;
  }): Promise<DashboardResultReaderResultV1>;
}

export class UnavailableDashboardResultReaderV1 implements DashboardResultReaderPortV1 {
  public read(): Promise<DashboardResultReaderResultV1> {
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    );
  }
}

export type DashboardPermissionProjectionResultV1 =
  | {
      readonly accepted: true;
      readonly permissionProjectionVersionId: string;
    }
  | {
      readonly accepted: false;
      readonly code: 'PERMISSION_REVOKED' | 'UNAVAILABLE';
    };

/** Resolves the current actor's permission projection without accepting a client-supplied version. */
export interface DashboardPermissionProjectionPortV1 {
  resolve(input: {
    readonly context: IamTenantContextV1;
    readonly dashboardId?: string;
    readonly snapshotId?: string;
  }): Promise<DashboardPermissionProjectionResultV1>;
}

export class UnavailableDashboardPermissionProjectionPortV1
  implements DashboardPermissionProjectionPortV1
{
  public resolve(): Promise<DashboardPermissionProjectionResultV1> {
    return Promise.resolve(
      Object.freeze({ accepted: false as const, code: 'UNAVAILABLE' as const }),
    );
  }
}

export type DashboardHttpAuthorizationPortV1 = DashboardAuthorizationPortV1;

const CLIENT_AUTHORITY_FIELDS = new Set([
  'context',
  'tenantScope',
  'actorId',
  'memberId',
  'organizationId',
  'workspaceId',
  'projectId',
  'authorized',
  'authorization',
  'authorizationEpoch',
  'permissionProjectionVersionId',
  'authorizedPermissionProjectionVersionId',
  'grantsDatasetAccess',
  'grantsOriginalAccess',
  'grantsEvidenceAccess',
  'grantsAnalysisAccess',
  'grantsFolderAccess',
  'grantsRowFieldExpansion',
  'memberAuthorized',
  'accessPreset',
  'effectiveAgentLevel',
  'requiredIamAction',
  'rows',
  'resultRows',
  'resultCells',
  'resultValues',
  'payloadValues',
  'nowMs',
  'currentTimeMs',
  'currentTime',
  'serverNow',
]);

/** Maximum JSON object/array nesting accepted before authority scanning rejects input. */
export const MAX_CLIENT_AUTHORITY_SCAN_DEPTH = 64;

/** Maximum distinct object/array nodes visited by one authority scan. */
export const MAX_CLIENT_AUTHORITY_SCAN_NODES = 4_096;

/** Maximum object keys visited by one authority scan. */
export const MAX_CLIENT_AUTHORITY_SCAN_KEYS = 4_096;

/** Maximum array items visited by one authority scan. */
export const MAX_CLIENT_AUTHORITY_SCAN_ARRAY_ITEMS = 4_096;

type AuthorityScanFrame =
  | { readonly value: object; readonly depth: number; readonly leave: false }
  | { readonly value: object; readonly depth: number; readonly leave: true };

function hasClientAuthorityField(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;

  const stack: AuthorityScanFrame[] = [{ value, depth: 0, leave: false }];
  const active = new WeakSet<object>();
  const visited = new WeakSet<object>();
  let visitedNodes = 0;
  let visitedKeys = 0;
  let visitedArrayItems = 0;

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) continue;

    if (frame.leave) {
      active.delete(frame.value);
      continue;
    }
    if (frame.depth > MAX_CLIENT_AUTHORITY_SCAN_DEPTH || active.has(frame.value)) {
      return true;
    }
    if (visited.has(frame.value)) continue;
    if (visitedNodes >= MAX_CLIENT_AUTHORITY_SCAN_NODES) return true;

    visitedNodes += 1;
    visited.add(frame.value);
    active.add(frame.value);
    stack.push({ value: frame.value, depth: frame.depth, leave: true });

    if (Array.isArray(frame.value)) {
      const arrayValue: readonly unknown[] = frame.value;
      if (
        arrayValue.length > MAX_CLIENT_AUTHORITY_SCAN_ARRAY_ITEMS ||
        visitedArrayItems + arrayValue.length > MAX_CLIENT_AUTHORITY_SCAN_ARRAY_ITEMS
      ) {
        return true;
      }
      visitedArrayItems += arrayValue.length;
      for (let index = arrayValue.length - 1; index >= 0; index -= 1) {
        const child = arrayValue[index];
        if (typeof child === 'object' && child !== null) {
          stack.push({ value: child, depth: frame.depth + 1, leave: false });
        }
      }
      continue;
    }

    let keys: string[];
    try {
      keys = Object.keys(frame.value);
    } catch {
      return true;
    }
    if (visitedKeys + keys.length > MAX_CLIENT_AUTHORITY_SCAN_KEYS) return true;
    visitedKeys += keys.length;

    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index];
      if (key === undefined) continue;
      if (CLIENT_AUTHORITY_FIELDS.has(key)) return true;
      let child: unknown;
      try {
        child = (frame.value as Record<string, unknown>)[key];
      } catch {
        return true;
      }
      if (typeof child === 'object' && child !== null) {
        stack.push({ value: child, depth: frame.depth + 1, leave: false });
      }
    }
  }

  return false;
}

/** Checks body/query/params recursively so authority cannot be smuggled through nested JSON. */
export function hasClientAuthorityFields(request: unknown, body?: unknown): boolean {
  if (hasClientAuthorityField(body)) return true;
  if (typeof request !== 'object' || request === null || Array.isArray(request)) return false;
  const requestRecord = request as Record<string, unknown>;
  return (
    hasClientAuthorityField(requestRecord['body']) ||
    hasClientAuthorityField(requestRecord['query']) ||
    hasClientAuthorityField(requestRecord['params'])
  );
}
