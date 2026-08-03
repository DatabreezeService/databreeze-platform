import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

export type AuditPageKindV1 = 'events' | 'seals';

export type AuditPageCursorResultV1 =
  | { readonly accepted: true; readonly offset: number }
  | { readonly accepted: false; readonly code: 'INVALID_CURSOR' };

const MAX_CURSOR_LENGTH_V1 = 512;

function scopeKey(scope: TenantScopeV1): string {
  if (scope.scopeType === 'organization') return `organization:${scope.organizationId}`;
  if (scope.scopeType === 'workspace')
    return `workspace:${scope.organizationId}:${scope.workspaceId}`;
  return `project:${scope.organizationId}:${scope.workspaceId}:${scope.projectId}`;
}

function rejected(): AuditPageCursorResultV1 {
  return Object.freeze({ accepted: false, code: 'INVALID_CURSOR' });
}

export function createAuditPageCursorV1(
  kind: AuditPageKindV1,
  scope: TenantScopeV1,
  offset: number,
): string {
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('AUD_CURSOR_OFFSET_INVALID');
  return Buffer.from(
    JSON.stringify({ version: 1, kind, scope: scopeKey(scope), offset }),
    'utf8',
  ).toString('base64url');
}

export function parseAuditPageCursorV1(
  cursor: unknown,
  kind: AuditPageKindV1,
  scope: TenantScopeV1,
): AuditPageCursorResultV1 {
  if (
    typeof cursor !== 'string' ||
    cursor.length === 0 ||
    cursor.length > MAX_CURSOR_LENGTH_V1 ||
    !/^[A-Za-z0-9_-]+$/u.test(cursor)
  )
    return rejected();
  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return rejected();
    const record = parsed as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'kind,offset,scope,version' ||
      record['version'] !== 1 ||
      record['kind'] !== kind ||
      record['scope'] !== scopeKey(scope) ||
      !Number.isSafeInteger(record['offset']) ||
      (record['offset'] as number) < 0
    )
      return rejected();
    return Object.freeze({ accepted: true, offset: record['offset'] as number });
  } catch {
    return rejected();
  }
}
