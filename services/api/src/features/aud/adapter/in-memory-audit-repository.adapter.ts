import {
  tenantScopeContainsV1,
  type AuditEventV1,
  type AuditSealV1,
  type TenantScopeV1,
} from '@databreeze/domain/v1';

import type {
  AuditPageInputV1,
  AuditPageV1,
  AuditRepositoryPortV1,
  AuditTransactionPortV1,
} from '../application/audit-repository.port.js';
import {
  createAuditPageCursorV1,
  parseAuditPageCursorV1,
} from '../application/audit-page-cursor.js';
import { sameAuditEventV1, sameAuditSealV1 } from '../application/audit-equality.js';
import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';

function visibleInScope(context: TenantScopeV1, record: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, record) || tenantScopeContainsV1(record, context);
}

function scopeAllowsMutation(context: IamTenantContextV1, record: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context.tenantScope, record);
}

function cloneEvent(event: AuditEventV1): AuditEventV1 {
  return Object.freeze({
    ...event,
    tenantScope: Object.freeze({ ...event.tenantScope }),
    actor: Object.freeze({ ...event.actor }),
    summary: Object.freeze({ ...event.summary }),
  });
}

function cloneSeal(seal: AuditSealV1): AuditSealV1 {
  return Object.freeze({ ...seal, tenantScope: Object.freeze({ ...seal.tenantScope }) });
}

function pageOffset(
  input: AuditPageInputV1,
  kind: 'events' | 'seals',
  scope: TenantScopeV1,
): number {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100)
    throw new Error('AUD_PAGE_LIMIT_INVALID');
  if (input.cursor === undefined) return 0;
  const parsed = parseAuditPageCursorV1(input.cursor, kind, scope);
  if (!parsed.accepted) throw new Error('AUD_CURSOR_INVALID');
  return parsed.offset;
}

/** In-memory adapter with PostgreSQL-equivalent append-only and scope checks. */
export class InMemoryAuditRepositoryAdapter implements AuditRepositoryPortV1 {
  private events = new Map<string, AuditEventV1>();
  private seals = new Map<string, AuditSealV1>();
  private transactionTail: Promise<void> = Promise.resolve();

  async appendEvent(context: IamTenantContextV1, event: AuditEventV1): Promise<AuditEventV1> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, event.tenantScope))
      throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    const existing = this.events.get(event.eventId);
    if (existing) {
      if (!sameAuditEventV1(existing, event)) throw new Error('AUD_IMMUTABLE_EVENT');
      return cloneEvent(existing);
    }
    const scopedEvents = [...this.events.values()]
      .filter(
        (item) =>
          tenantScopeContainsV1(item.tenantScope, event.tenantScope) &&
          tenantScopeContainsV1(event.tenantScope, item.tenantScope),
      )
      .sort((left, right) => left.sequence - right.sequence);
    const idempotent = scopedEvents.find((item) => item.idempotencyKey === event.idempotencyKey);
    if (idempotent) throw new Error('AUD_IDEMPOTENCY_CONFLICT');
    const previous = scopedEvents.at(-1);
    if (
      event.sequence !== (previous?.sequence ?? 0) + 1 ||
      event.previousDigest !== (previous?.digest ?? null)
    )
      throw new Error('AUD_CHAIN_INVALID');
    const stored = cloneEvent(event);
    this.events.set(stored.eventId, stored);
    return cloneEvent(stored);
  }

  async listEvents(context: IamTenantContextV1): Promise<readonly AuditEventV1[]> {
    await Promise.resolve();
    return [...this.events.values()]
      .filter((event) => visibleInScope(context.tenantScope, event.tenantScope))
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneEvent);
  }

  async listEventPage(
    context: IamTenantContextV1,
    input: AuditPageInputV1,
  ): Promise<AuditPageV1<AuditEventV1>> {
    await Promise.resolve();
    const offset = pageOffset(input, 'events', context.tenantScope);
    const visible = [...this.events.values()]
      .filter((event) => visibleInScope(context.tenantScope, event.tenantScope))
      .sort((left, right) =>
        left.occurredAt === right.occurredAt
          ? left.eventId.localeCompare(right.eventId)
          : left.occurredAt.localeCompare(right.occurredAt),
      );
    const items = visible.slice(offset, offset + input.limit).map(cloneEvent);
    return Object.freeze({
      items: Object.freeze(items),
      ...(visible.length > offset + items.length
        ? {
            nextCursor: createAuditPageCursorV1(
              'events',
              context.tenantScope,
              offset + items.length,
            ),
          }
        : {}),
    });
  }

  async listEventsForScope(
    context: IamTenantContextV1,
    scope: TenantScopeV1,
  ): Promise<readonly AuditEventV1[]> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, scope)) throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    return [...this.events.values()]
      .filter(
        (event) =>
          tenantScopeContainsV1(event.tenantScope, scope) &&
          tenantScopeContainsV1(scope, event.tenantScope),
      )
      .sort((left, right) => left.sequence - right.sequence)
      .map(cloneEvent);
  }

  async saveSeal(context: IamTenantContextV1, seal: AuditSealV1): Promise<void> {
    await Promise.resolve();
    if (!scopeAllowsMutation(context, seal.tenantScope))
      throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    const existing = [...this.seals.values()].find(
      (item) =>
        item.firstSequence === seal.firstSequence &&
        item.lastSequence === seal.lastSequence &&
        tenantScopeContainsV1(item.tenantScope, seal.tenantScope) &&
        tenantScopeContainsV1(seal.tenantScope, item.tenantScope),
    );
    if (existing && !sameAuditSealV1(existing, seal)) throw new Error('AUD_IMMUTABLE_SEAL');
    this.seals.set(seal.rootDigest, cloneSeal(seal));
  }

  async listSeals(context: IamTenantContextV1): Promise<readonly AuditSealV1[]> {
    await Promise.resolve();
    return [...this.seals.values()]
      .filter((seal) => visibleInScope(context.tenantScope, seal.tenantScope))
      .sort((left, right) => left.firstSequence - right.firstSequence)
      .map(cloneSeal);
  }

  async listSealPage(
    context: IamTenantContextV1,
    input: AuditPageInputV1,
  ): Promise<AuditPageV1<AuditSealV1>> {
    await Promise.resolve();
    const offset = pageOffset(input, 'seals', context.tenantScope);
    const visible = [...this.seals.values()]
      .filter((seal) => visibleInScope(context.tenantScope, seal.tenantScope))
      .sort((left, right) =>
        left.sealedAt === right.sealedAt
          ? left.rootDigest.localeCompare(right.rootDigest)
          : left.sealedAt.localeCompare(right.sealedAt),
      );
    const items = visible.slice(offset, offset + input.limit).map(cloneSeal);
    return Object.freeze({
      items: Object.freeze(items),
      ...(visible.length > offset + items.length
        ? {
            nextCursor: createAuditPageCursorV1(
              'seals',
              context.tenantScope,
              offset + items.length,
            ),
          }
        : {}),
    });
  }

  async withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AuditTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    let release!: () => void;
    const previous = this.transactionTail;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    const beforeEvents = new Map(this.events);
    const beforeSeals = new Map(this.seals);
    try {
      return await work({
        appendEvent: this.appendEvent.bind(this),
        listEvents: this.listEvents.bind(this),
        listEventsForScope: this.listEventsForScope.bind(this),
        saveSeal: this.saveSeal.bind(this),
        listSeals: this.listSeals.bind(this),
      });
    } catch (error) {
      this.events = beforeEvents;
      this.seals = beforeSeals;
      throw error;
    } finally {
      release();
    }
  }
}
