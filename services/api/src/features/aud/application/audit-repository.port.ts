import type { AuditEventV1, AuditSealV1 } from '@databreeze/domain/audit/v1';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export const AUDIT_REPOSITORY_PORT = Symbol('AUDIT_REPOSITORY_PORT');

export interface AuditPageInputV1 {
  readonly limit: number;
  readonly cursor?: string;
}

export interface AuditPageV1<TItem> {
  readonly items: readonly TItem[];
  readonly nextCursor?: string;
}

export interface AuditTransactionPortV1 {
  appendEvent(context: IamTenantContextV1, event: AuditEventV1): Promise<AuditEventV1>;
  listEvents(context: IamTenantContextV1): Promise<readonly AuditEventV1[]>;
  listEventsForScope(
    context: IamTenantContextV1,
    scope: TenantScopeV1,
  ): Promise<readonly AuditEventV1[]>;
  saveSeal(context: IamTenantContextV1, seal: AuditSealV1): Promise<void>;
  listSeals(context: IamTenantContextV1): Promise<readonly AuditSealV1[]>;
}

export interface AuditRepositoryPortV1 extends AuditTransactionPortV1 {
  listEventPage(
    context: IamTenantContextV1,
    input: AuditPageInputV1,
  ): Promise<AuditPageV1<AuditEventV1>>;
  listSealPage(
    context: IamTenantContextV1,
    input: AuditPageInputV1,
  ): Promise<AuditPageV1<AuditSealV1>>;
  withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AuditTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue>;
}
