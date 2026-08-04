import {
  AUDIT_ACTIONS_V1,
  sanitizeAuditSummaryV1,
  verifyAuditChainV1,
  verifyAuditEventDigestV1,
  type AuditActorTypeV1,
  type AuditEventV1,
  type AuditSealV1,
  type AuditDigestPortV1,
} from '@databreeze/domain/audit/v1';
import {
  parseStableIdentifierV1,
  parseStrictUtcTimestampV1,
  parseTenantScopeV1,
  tenantScopeContainsV1,
  tenantScopeKeyV1,
  type TenantScopeV1,
} from '@databreeze/domain/tenant-scope/v1';
import { randomUUID } from 'node:crypto';

import type { IamTenantContextV1 } from '../../iam/application/tenant-context.js';
import type {
  AuditPageInputV1,
  AuditPageV1,
  AuditRepositoryPortV1,
  AuditSealSelectorV1,
  AuditTransactionPortV1,
} from '../application/audit-repository.port.js';
import { createAuditPageCursorV1, auditPageOffsetV1 } from '../application/audit-page-cursor.js';
import { sameAuditEventV1, sameAuditSealV1 } from '../application/audit-equality.js';

export interface AuditEventDatabaseRowV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly action: string;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly actorType: string;
  readonly actorId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly entityRevision: number;
  readonly sequence: number;
  readonly occurredAt: Date;
  readonly correlationId: string;
  readonly idempotencyKey: string;
  readonly summary: unknown;
  readonly previousDigest: string | null;
  readonly digest: string;
  readonly createdAt: Date;
}

export interface AuditSealDatabaseRowV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly scopeKey: string;
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly firstSequence: number;
  readonly lastSequence: number;
  readonly eventCount: number;
  readonly rootDigest: string;
  readonly sealedAt: Date;
  readonly createdAt: Date;
}

interface AuditEventCreateDataV1 extends Omit<AuditEventDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}

interface AuditSealCreateDataV1 extends Omit<AuditSealDatabaseRowV1, 'createdAt'> {
  readonly createdAt: Date;
}

interface AuditEventDelegateV1 {
  create(input: { readonly data: AuditEventCreateDataV1 }): Promise<AuditEventDatabaseRowV1>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy?: { readonly sequence: 'asc' | 'desc' };
  }): Promise<AuditEventDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy:
      | Readonly<Record<string, 'asc' | 'desc'>>
      | readonly Readonly<Record<string, 'asc' | 'desc'>>[];
    readonly skip?: number;
    readonly take?: number;
  }): Promise<readonly AuditEventDatabaseRowV1[]>;
}

interface AuditSealDelegateV1 {
  create(input: { readonly data: AuditSealCreateDataV1 }): Promise<AuditSealDatabaseRowV1>;
  findFirst(input: {
    readonly where: Readonly<Record<string, unknown>>;
  }): Promise<AuditSealDatabaseRowV1 | null>;
  findMany(input: {
    readonly where: Readonly<Record<string, unknown>>;
    readonly orderBy:
      | Readonly<Record<string, 'asc' | 'desc'>>
      | readonly Readonly<Record<string, 'asc' | 'desc'>>[];
    readonly skip?: number;
    readonly take?: number;
  }): Promise<readonly AuditSealDatabaseRowV1[]>;
}

export interface AuditDatabaseClientV1 {
  readonly auditEventRecord: AuditEventDelegateV1;
  readonly auditSealRecord: AuditSealDelegateV1;
  $transaction<TValue>(
    work: (transaction: AuditDatabaseClientV1) => Promise<TValue>,
  ): Promise<TValue>;
}

function databaseScope(scope: TenantScopeV1) {
  return {
    scopeType: scope.scopeType,
    organizationId: scope.organizationId,
    workspaceId: scope.scopeType === 'organization' ? null : scope.workspaceId,
    projectId: scope.scopeType === 'project' ? scope.projectId : null,
  } as const;
}

function persistedScope(row: {
  readonly scopeType: string;
  readonly organizationId: string;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
}): TenantScopeV1 {
  const parsed = parseTenantScopeV1({
    scopeType: row.scopeType,
    organizationId: row.organizationId,
    ...(row.workspaceId === null ? {} : { workspaceId: row.workspaceId }),
    ...(row.projectId === null ? {} : { projectId: row.projectId }),
  });
  if (!parsed.accepted) throw new Error('AUD_PERSISTED_SCOPE_INVALID');
  return parsed.value;
}

function text(input: unknown, maxLength: number): string | undefined {
  if (typeof input !== 'string' || input.length === 0 || input.length > maxLength) return undefined;
  if (/\p{Cc}/u.test(input)) return undefined;
  const normalized = input.normalize('NFC').trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : undefined;
}

function positiveInteger(input: unknown): number | undefined {
  return typeof input === 'number' && Number.isSafeInteger(input) && input >= 1 ? input : undefined;
}

function persistedEvent(row: AuditEventDatabaseRowV1): AuditEventV1 {
  const eventId = parseStableIdentifierV1(row.id);
  const organizationId = parseStableIdentifierV1(row.organizationId);
  const workspaceId =
    row.workspaceId === null ? undefined : parseStableIdentifierV1(row.workspaceId);
  const projectId = row.projectId === null ? undefined : parseStableIdentifierV1(row.projectId);
  const actorId = parseStableIdentifierV1(row.actorId);
  const entityId = parseStableIdentifierV1(row.entityId);
  const correlationId = parseStableIdentifierV1(row.correlationId);
  const occurredAt = parseStrictUtcTimestampV1(row.occurredAt.toISOString());
  const tenantScope = persistedScope(row);
  const summary = sanitizeAuditSummaryV1(row.summary);
  if (
    row.schemaVersion !== 1 ||
    !eventId.accepted ||
    !organizationId.accepted ||
    (row.workspaceId !== null && !workspaceId?.accepted) ||
    (row.projectId !== null && !projectId?.accepted) ||
    !actorId.accepted ||
    !entityId.accepted ||
    !correlationId.accepted ||
    !occurredAt.accepted ||
    !summary.accepted ||
    !AUDIT_ACTIONS_V1.includes(row.action as (typeof AUDIT_ACTIONS_V1)[number]) ||
    !['USER', 'SERVICE_ACCOUNT', 'DEVICE', 'SYSTEM'].includes(row.actorType) ||
    !text(row.entityType, 80) ||
    !positiveInteger(row.entityRevision) ||
    !positiveInteger(row.sequence) ||
    !text(row.idempotencyKey, 200) ||
    !text(row.digest, 512) ||
    (row.previousDigest !== null && !text(row.previousDigest, 512))
  ) {
    throw new Error('AUD_PERSISTED_EVENT_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    eventId: eventId.value,
    action: row.action as AuditEventV1['action'],
    tenantScope,
    actor: Object.freeze({
      actorType: row.actorType as AuditActorTypeV1,
      actorId: actorId.value,
    }),
    entityType: row.entityType,
    entityId: entityId.value,
    entityRevision: row.entityRevision,
    sequence: row.sequence,
    occurredAt: occurredAt.value,
    correlationId: correlationId.value,
    idempotencyKey: row.idempotencyKey,
    summary: summary.value,
    previousDigest: row.previousDigest,
    digest: row.digest,
  });
}

function persistedSeal(row: AuditSealDatabaseRowV1): AuditSealV1 {
  const scope = persistedScope(row);
  if (
    row.schemaVersion !== 1 ||
    !positiveInteger(row.firstSequence) ||
    !positiveInteger(row.lastSequence) ||
    row.lastSequence < row.firstSequence ||
    !positiveInteger(row.eventCount) ||
    !text(row.rootDigest, 512) ||
    !parseStrictUtcTimestampV1(row.sealedAt.toISOString()).accepted
  ) {
    throw new Error('AUD_PERSISTED_SEAL_INVALID');
  }
  const sealedAt = parseStrictUtcTimestampV1(row.sealedAt.toISOString());
  if (!sealedAt.accepted) throw new Error('AUD_PERSISTED_SEAL_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    tenantScope: scope,
    firstSequence: row.firstSequence,
    lastSequence: row.lastSequence,
    eventCount: row.eventCount,
    rootDigest: row.rootDigest,
    sealedAt: sealedAt.value,
  });
}

function eventCreateData(event: AuditEventV1): AuditEventCreateDataV1 {
  return {
    ...databaseScope(event.tenantScope),
    id: event.eventId,
    schemaVersion: event.schemaVersion,
    action: event.action,
    scopeKey: tenantScopeKeyV1(event.tenantScope),
    actorType: event.actor.actorType,
    actorId: event.actor.actorId,
    entityType: event.entityType,
    entityId: event.entityId,
    entityRevision: event.entityRevision,
    sequence: event.sequence,
    occurredAt: new Date(event.occurredAt),
    correlationId: event.correlationId,
    idempotencyKey: event.idempotencyKey,
    summary: event.summary,
    previousDigest: event.previousDigest,
    digest: event.digest,
    createdAt: new Date(),
  };
}

function sealCreateData(seal: AuditSealV1): AuditSealCreateDataV1 {
  return {
    ...databaseScope(seal.tenantScope),
    id: randomUUID(),
    schemaVersion: seal.schemaVersion,
    scopeKey: tenantScopeKeyV1(seal.tenantScope),
    firstSequence: seal.firstSequence,
    lastSequence: seal.lastSequence,
    eventCount: seal.eventCount,
    rootDigest: seal.rootDigest,
    sealedAt: new Date(seal.sealedAt),
    createdAt: new Date(),
  };
}

function visible(context: TenantScopeV1, candidate: TenantScopeV1): boolean {
  return tenantScopeContainsV1(context, candidate) || tenantScopeContainsV1(candidate, context);
}

function visibilityWhere(scope: TenantScopeV1): Readonly<Record<string, unknown>> {
  if (scope.scopeType === 'organization') return { organizationId: scope.organizationId };
  if (scope.scopeType === 'workspace') {
    return {
      organizationId: scope.organizationId,
      OR: [{ scopeType: 'organization' }, { workspaceId: scope.workspaceId }],
    };
  }
  return {
    organizationId: scope.organizationId,
    OR: [
      { scopeType: 'organization' },
      { scopeType: 'workspace', workspaceId: scope.workspaceId },
      { scopeType: 'project', projectId: scope.projectId },
    ],
  };
}

class PrismaAuditTransactionAdapter implements AuditTransactionPortV1 {
  public constructor(
    private readonly client: AuditDatabaseClientV1,
    private readonly digestPort: AuditDigestPortV1,
  ) {}

  public async appendEvent(
    context: IamTenantContextV1,
    event: AuditEventV1,
  ): Promise<AuditEventV1> {
    if (!tenantScopeContainsV1(context.tenantScope, event.tenantScope))
      throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.auditEventRecord.findFirst({
      where: {
        id: event.eventId,
        organizationId: context.tenantScope.organizationId,
      },
    });
    if (existing !== null) {
      const current = persistedEvent(existing);
      if (!sameAuditEventV1(current, event)) throw new Error('AUD_IMMUTABLE_EVENT');
      return current;
    }
    const eventScopeKey = tenantScopeKeyV1(event.tenantScope);
    const [duplicate, latest] = await Promise.all([
      this.client.auditEventRecord.findFirst({
        where: { scopeKey: eventScopeKey, idempotencyKey: event.idempotencyKey },
      }),
      this.client.auditEventRecord.findFirst({
        where: { scopeKey: eventScopeKey },
        orderBy: { sequence: 'desc' },
      }),
    ]);
    if (duplicate !== null) throw new Error('AUD_IDEMPOTENCY_CONFLICT');
    if (
      latest !== null &&
      (event.sequence !== latest.sequence + 1 || event.previousDigest !== latest.digest)
    ) {
      throw new Error('AUD_SEQUENCE_CONFLICT');
    }
    const created = await this.client.auditEventRecord.create({ data: eventCreateData(event) });
    return persistedEvent(created);
  }

  public async listEvents(context: IamTenantContextV1): Promise<readonly AuditEventV1[]> {
    const rows = await this.client.auditEventRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { sequence: 'asc' },
    });
    const events = rows
      .filter((row) => visible(context.tenantScope, persistedScope(row)))
      .map(persistedEvent);
    const verified = verifyAuditChainV1(events, this.digestPort);
    if (!verified.accepted) throw new Error('AUD_CHAIN_INVALID');
    return events;
  }

  public async listEventsForScope(
    context: IamTenantContextV1,
    scope: TenantScopeV1,
  ): Promise<readonly AuditEventV1[]> {
    if (!tenantScopeContainsV1(context.tenantScope, scope))
      throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    const rows = await this.client.auditEventRecord.findMany({
      where: { scopeKey: tenantScopeKeyV1(scope) },
      orderBy: { sequence: 'asc' },
    });
    const events = rows.map(persistedEvent);
    const verified = verifyAuditChainV1(events, this.digestPort);
    if (!verified.accepted) throw new Error('AUD_CHAIN_INVALID');
    return events;
  }

  public async saveSeal(context: IamTenantContextV1, seal: AuditSealV1): Promise<void> {
    if (!tenantScopeContainsV1(context.tenantScope, seal.tenantScope))
      throw new Error('AUD_SCOPE_NARROWING_REQUIRED');
    const existing = await this.client.auditSealRecord.findFirst({
      where: {
        scopeKey: tenantScopeKeyV1(seal.tenantScope),
        firstSequence: seal.firstSequence,
        lastSequence: seal.lastSequence,
      },
    });
    if (existing !== null) {
      if (!sameAuditSealV1(persistedSeal(existing), seal)) throw new Error('AUD_IMMUTABLE_SEAL');
      return;
    }
    await this.client.auditSealRecord.create({ data: sealCreateData(seal) });
  }

  public async listSeals(context: IamTenantContextV1): Promise<readonly AuditSealV1[]> {
    const rows = await this.client.auditSealRecord.findMany({
      where: { organizationId: context.tenantScope.organizationId },
      orderBy: { lastSequence: 'asc' },
    });
    return rows
      .filter((row) => visible(context.tenantScope, persistedScope(row)))
      .map(persistedSeal);
  }

  public async findSeal(
    context: IamTenantContextV1,
    selector: AuditSealSelectorV1,
  ): Promise<AuditSealV1 | undefined> {
    if (!visible(context.tenantScope, selector.tenantScope)) return undefined;
    const row = await this.client.auditSealRecord.findFirst({
      where: {
        scopeKey: tenantScopeKeyV1(selector.tenantScope),
        firstSequence: selector.firstSequence,
        lastSequence: selector.lastSequence,
        rootDigest: selector.rootDigest,
      },
    });
    if (!row) return undefined;
    const seal = persistedSeal(row);
    return visible(context.tenantScope, seal.tenantScope) ? seal : undefined;
  }
}

export class PrismaAuditRepositoryAdapter implements AuditRepositoryPortV1 {
  public constructor(
    private readonly client: AuditDatabaseClientV1,
    private readonly digestPort: AuditDigestPortV1,
  ) {}

  public withTransaction<TValue>(
    context: IamTenantContextV1,
    work: (transaction: AuditTransactionPortV1) => Promise<TValue>,
  ): Promise<TValue> {
    return this.client.$transaction((transaction) =>
      work(new PrismaAuditTransactionAdapter(transaction, this.digestPort)),
    );
  }

  public appendEvent(context: IamTenantContextV1, event: AuditEventV1): Promise<AuditEventV1> {
    return new PrismaAuditTransactionAdapter(this.client, this.digestPort).appendEvent(
      context,
      event,
    );
  }

  public async listEventPage(
    context: IamTenantContextV1,
    input: AuditPageInputV1,
  ): Promise<AuditPageV1<AuditEventV1>> {
    const offset = auditPageOffsetV1(input, 'events', context.tenantScope);
    const rows = await this.client.auditEventRecord.findMany({
      where: visibilityWhere(context.tenantScope),
      orderBy: [{ scopeKey: 'asc' }, { sequence: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: input.limit + 1,
    });
    const visibleRows = rows.filter((row) => visible(context.tenantScope, persistedScope(row)));
    const pageRows = visibleRows.slice(0, input.limit);
    const items = pageRows.map(persistedEvent);
    if (items.some((event) => !verifyAuditEventDigestV1(event, this.digestPort).accepted))
      throw new Error('AUD_CHAIN_INVALID');
    return Object.freeze({
      items: Object.freeze(items),
      ...(visibleRows.length > pageRows.length
        ? {
            nextCursor: createAuditPageCursorV1(
              'events',
              context.tenantScope,
              offset + pageRows.length,
            ),
          }
        : {}),
    });
  }

  public listEvents(context: IamTenantContextV1): Promise<readonly AuditEventV1[]> {
    return new PrismaAuditTransactionAdapter(this.client, this.digestPort).listEvents(context);
  }

  public async listSealPage(
    context: IamTenantContextV1,
    input: AuditPageInputV1,
  ): Promise<AuditPageV1<AuditSealV1>> {
    const offset = auditPageOffsetV1(input, 'seals', context.tenantScope);
    const rows = await this.client.auditSealRecord.findMany({
      where: visibilityWhere(context.tenantScope),
      orderBy: [{ scopeKey: 'asc' }, { lastSequence: 'asc' }, { id: 'asc' }],
      skip: offset,
      take: input.limit + 1,
    });
    const visibleRows = rows.filter((row) => visible(context.tenantScope, persistedScope(row)));
    const pageRows = visibleRows.slice(0, input.limit);
    return Object.freeze({
      items: Object.freeze(pageRows.map(persistedSeal)),
      ...(visibleRows.length > pageRows.length
        ? {
            nextCursor: createAuditPageCursorV1(
              'seals',
              context.tenantScope,
              offset + pageRows.length,
            ),
          }
        : {}),
    });
  }

  public listEventsForScope(
    context: IamTenantContextV1,
    scope: TenantScopeV1,
  ): Promise<readonly AuditEventV1[]> {
    return new PrismaAuditTransactionAdapter(this.client, this.digestPort).listEventsForScope(
      context,
      scope,
    );
  }

  public saveSeal(context: IamTenantContextV1, seal: AuditSealV1): Promise<void> {
    return new PrismaAuditTransactionAdapter(this.client, this.digestPort).saveSeal(context, seal);
  }

  public listSeals(context: IamTenantContextV1): Promise<readonly AuditSealV1[]> {
    return new PrismaAuditTransactionAdapter(this.client, this.digestPort).listSeals(context);
  }

  public findSeal(
    context: IamTenantContextV1,
    selector: AuditSealSelectorV1,
  ): Promise<AuditSealV1 | undefined> {
    return new PrismaAuditTransactionAdapter(this.client, this.digestPort).findSeal(
      context,
      selector,
    );
  }
}
