import {
  appendAuditEventV1,
  createAuditSealV1,
  type AuditDigestPortV1,
  type AuditEventV1,
  type AuditSealV1,
  type AuditResultV1,
} from '@databreeze/domain/audit/v1';

import type { AuditRepositoryPortV1 } from './audit-repository.port.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

export interface AuditLedgerInputV1 {
  readonly eventId: unknown;
  readonly actorType: unknown;
  readonly action: unknown;
  readonly entityType: unknown;
  readonly entityId: unknown;
  readonly entityRevision: unknown;
  readonly occurredAt: unknown;
  readonly summary?: unknown;
}

/** Binds audit identity and scope to IAM context before invoking immutable domain rules. */
export class AuditLedgerService {
  public constructor(
    private readonly repository: AuditRepositoryPortV1,
    private readonly digestPort: AuditDigestPortV1,
  ) {}

  public async append(
    context: IamTenantContextV1,
    input: AuditLedgerInputV1,
  ): Promise<AuditResultV1<AuditEventV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const existing = await transaction.listEventsForScope(context, context.tenantScope);
      const appended = appendAuditEventV1(
        { events: existing },
        {
          eventId: input.eventId,
          action: input.action,
          tenantScope: context.tenantScope,
          actor: { actorType: input.actorType, actorId: context.actorId },
          entityType: input.entityType,
          entityId: input.entityId,
          entityRevision: input.entityRevision,
          occurredAt: input.occurredAt,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
          summary: input.summary,
        },
        this.digestPort,
      );
      if (!appended.accepted) return appended;
      const stored = await transaction.appendEvent(context, appended.value.event);
      return Object.freeze({ accepted: true, value: stored });
    });
  }

  public async seal(
    context: IamTenantContextV1,
    sealedAt: unknown,
  ): Promise<AuditResultV1<AuditSealV1>> {
    return this.repository.withTransaction(context, async (transaction) => {
      const events = await transaction.listEventsForScope(context, context.tenantScope);
      const created = createAuditSealV1(events, context.tenantScope, sealedAt, this.digestPort);
      if (!created.accepted) return created;
      await transaction.saveSeal(context, created.value);
      return created;
    });
  }
}
