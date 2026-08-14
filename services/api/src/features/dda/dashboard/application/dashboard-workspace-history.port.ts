import { createHash } from 'node:crypto';

import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../../iam/application/tenant-context.js';

export const DASHBOARD_WORKSPACE_HISTORY_PORT = Symbol('DASHBOARD_WORKSPACE_HISTORY_PORT');

/** DDA-026, DDA-033: intentionally content-safe history metadata only. */
export interface DashboardWorkspaceHistoryCandidateV1 {
  readonly kind: 'ANALYSIS' | 'DASHBOARD';
  readonly subjectId: string;
  readonly title: { readonly vi: string; readonly en: string };
  readonly updatedAt: string;
  readonly safeStatus?: 'CURRENT' | 'STALE' | 'BLOCKED';
}

export interface DashboardWorkspaceHistoryListInputV1 {
  readonly tenantScope: TenantScopeV1;
  readonly cursor?: string;
  readonly limit: number;
}

export interface DashboardWorkspaceHistoryCandidatePageV1 {
  readonly items: readonly DashboardWorkspaceHistoryCandidateV1[];
  readonly nextCursor?: string;
}

export type DashboardWorkspaceHistoryAuthorizationDecisionV1 = 'ALLOWED' | 'DENIED' | 'UNAVAILABLE';

/**
 * The persistence port only returns metadata candidates within the requested TenantScope.
 * The service still performs a fresh subject authorization before exposing each candidate.
 */
export interface DashboardWorkspaceHistoryPortV1 {
  list(
    input: DashboardWorkspaceHistoryListInputV1,
  ): Promise<DashboardWorkspaceHistoryCandidatePageV1>;
  reauthorize(input: {
    readonly context?: IamTenantContextV1;
    readonly tenantScope: TenantScopeV1;
    readonly actorId: IamTenantContextV1['actorId'];
    readonly kind: DashboardWorkspaceHistoryCandidateV1['kind'];
    readonly subjectId: string;
  }): Promise<DashboardWorkspaceHistoryAuthorizationDecisionV1>;
}

export interface DashboardWorkspaceHistoryCursorV1 {
  readonly updatedAt: string;
  readonly subjectId: string;
}

export class DashboardWorkspaceHistoryCursorProblemV1 extends Error {
  public constructor() {
    super('DASHBOARD_WORKSPACE_HISTORY_CURSOR_INVALID');
    this.name = 'DashboardWorkspaceHistoryCursorProblemV1';
  }
}

function scopeFingerprint(scope: TenantScopeV1): string {
  return createHash('sha256').update(tenantScopeKeyV1(scope)).digest('base64url');
}

/** Opaque, scope-bound cursor with no title, source, field, or row content. */
export function encodeDashboardWorkspaceHistoryCursorV1(
  scope: TenantScopeV1,
  cursor: DashboardWorkspaceHistoryCursorV1,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      s: scopeFingerprint(scope),
      u: cursor.updatedAt,
      i: cursor.subjectId,
    }),
    'utf8',
  ).toString('base64url');
}

/** Returns undefined for malformed, tampered, or copied-scope cursor values. */
export function decodeDashboardWorkspaceHistoryCursorV1(
  scope: TenantScopeV1,
  cursor: string | undefined,
): DashboardWorkspaceHistoryCursorV1 | undefined {
  if (cursor === undefined || cursor.length === 0 || cursor.length > 512) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as unknown;
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      Array.isArray(decoded) ||
      Object.keys(decoded).length !== 4
    ) {
      return undefined;
    }
    const record = decoded as Record<string, unknown>;
    if (
      record['v'] !== 1 ||
      record['s'] !== scopeFingerprint(scope) ||
      typeof record['u'] !== 'string' ||
      typeof record['i'] !== 'string'
    ) {
      return undefined;
    }
    const updatedAt = parseStrictUtcTimestampV1(record['u']);
    const subjectId = parseStableIdentifierV1(record['i']);
    if (!updatedAt.accepted || !subjectId.accepted) return undefined;
    return Object.freeze({ updatedAt: updatedAt.value, subjectId: subjectId.value });
  } catch {
    return undefined;
  }
}
