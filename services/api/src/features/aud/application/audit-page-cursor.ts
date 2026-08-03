import { tenantScopeKeyV1, type TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';
import type { AuditPageInputV1 } from './audit-repository.port.js';

export type AuditPageKindV1 = 'events' | 'seals';
export const AUDIT_PAGE_LIMIT_MAX_V1 = 100 as const;

export type AuditPageCursorResultV1 =
  | { readonly accepted: true; readonly offset: number }
  | { readonly accepted: false; readonly code: 'INVALID_CURSOR' };

const MAX_CURSOR_LENGTH_V1 = 512;

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
    JSON.stringify({ version: 1, kind, scope: tenantScopeKeyV1(scope), offset }),
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
      record['scope'] !== tenantScopeKeyV1(scope) ||
      !Number.isSafeInteger(record['offset']) ||
      (record['offset'] as number) < 0
    )
      return rejected();
    return Object.freeze({ accepted: true, offset: record['offset'] as number });
  } catch {
    return rejected();
  }
}

export function auditPageOffsetV1(
  input: AuditPageInputV1,
  kind: AuditPageKindV1,
  scope: TenantScopeV1,
): number {
  if (
    !Number.isSafeInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > AUDIT_PAGE_LIMIT_MAX_V1
  )
    throw new Error('AUD_PAGE_LIMIT_INVALID');
  if (input.cursor === undefined) return 0;
  const parsed = parseAuditPageCursorV1(input.cursor, kind, scope);
  if (!parsed.accepted) throw new Error('AUD_CURSOR_INVALID');
  return parsed.offset;
}
