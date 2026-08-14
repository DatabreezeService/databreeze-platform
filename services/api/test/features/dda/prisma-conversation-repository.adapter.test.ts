import assert from 'node:assert/strict';
import test from 'node:test';

import { PrismaConversationRepositoryAdapter } from '../../../src/features/dda/conversation/adapter/prisma-conversation-repository.adapter.js';
import { ConversationService } from '../../../src/features/dda/conversation/application/conversation.service.js';
import type {
  ConversationContextEventRecordV1,
  ConversationCreateResultV1,
  ConversationMessageAppendResultV1,
  ConversationMessageRecordV1,
  ConversationRecordV1,
  ConversationSummaryRecordV1,
} from '../../../src/features/dda/conversation/application/conversation-repository.port.js';
import type { TenantScopeV1 } from '@databreeze/domain/tenant-scope/v1';

const tenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
} as Extract<TenantScopeV1, { readonly scopeType: 'workspace' }>;

const projectAScope = {
  scopeType: 'project',
  organizationId: tenantScope.organizationId,
  workspaceId: tenantScope.workspaceId,
  projectId: '00000000-0000-4000-8000-000000000003',
} as Extract<TenantScopeV1, { readonly scopeType: 'project' }>;

const projectBScope = {
  scopeType: 'project',
  organizationId: tenantScope.organizationId,
  workspaceId: tenantScope.workspaceId,
  projectId: '00000000-0000-4000-8000-000000000004',
} as Extract<TenantScopeV1, { readonly scopeType: 'project' }>;

const otherTenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000005',
  workspaceId: '00000000-0000-4000-8000-000000000006',
} as Extract<TenantScopeV1, { readonly scopeType: 'workspace' }>;

const datasetId = '00000000-0000-4000-8000-000000000101';
const datasetVersionId = '00000000-0000-4000-8000-000000000102';

type Row = Record<string, unknown>;
type ModelName = 'conversation' | 'message' | 'event' | 'summary';

interface QueryLogEntry {
  readonly model: ModelName;
  readonly where: Row;
  readonly take: number | undefined;
}

function copyValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map((item) => copyValue(item));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copyValue(item)]));
  }
  return value;
}

function copyRow(row: Row): Row {
  return copyValue(row) as Row;
}

function matches(row: Row, where: Row): boolean {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR' && Array.isArray(value)) {
      return value.some((candidate) => matches(row, candidate as Row));
    }
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const operators = value as Row;
      if (Object.prototype.hasOwnProperty.call(operators, 'lt')) {
        return compareValues(row[key], operators['lt']) < 0;
      }
    }
    if (row[key] instanceof Date && value instanceof Date) {
      return row[key].getTime() === value.getTime();
    }
    return row[key] === value;
  });
}

function valueForSort(value: unknown): number | string {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number' || typeof value === 'string') return value;
  return String(value);
}

function compareValues(left: unknown, right: unknown): number {
  const a = valueForSort(left);
  const b = valueForSort(right);
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

class FakePrismaDatabase {
  public readonly conversations: Row[] = [];
  public readonly messages: Row[] = [];
  public readonly events: Row[] = [];
  public readonly summaries: Row[] = [];
  public readonly queries: QueryLogEntry[] = [];
  public readonly writes: { readonly model: ModelName; readonly data: Row }[] = [];
  public failureAfterMutation: ModelName | undefined;
  private transactionTail: Promise<void> = Promise.resolve();

  public readonly ddaConversation = this.delegate('conversation');
  public readonly ddaConversationMessage = this.delegate('message');
  public readonly ddaConversationContextEvent = this.delegate('event');
  public readonly ddaConversationSummary = this.delegate('summary');

  public failNextMutation(model: ModelName): void {
    this.failureAfterMutation = model;
  }

  public async $transaction<TValue>(work: (transaction: this) => Promise<TValue>): Promise<TValue> {
    const previous = this.transactionTail;
    let release!: () => void;
    this.transactionTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const snapshot = {
      conversations: this.conversations.map(copyRow),
      messages: this.messages.map(copyRow),
      events: this.events.map(copyRow),
      summaries: this.summaries.map(copyRow),
    };
    try {
      return await work(this);
    } catch (error) {
      this.conversations.splice(0, this.conversations.length, ...snapshot.conversations);
      this.messages.splice(0, this.messages.length, ...snapshot.messages);
      this.events.splice(0, this.events.length, ...snapshot.events);
      this.summaries.splice(0, this.summaries.length, ...snapshot.summaries);
      throw error;
    } finally {
      release();
    }
  }

  private rows(model: ModelName): Row[] {
    if (model === 'conversation') return this.conversations;
    if (model === 'message') return this.messages;
    if (model === 'event') return this.events;
    return this.summaries;
  }

  private delegate(model: ModelName) {
    return {
      findFirst: async (input: { readonly where: Row; readonly orderBy?: readonly Row[] }) => {
        await Promise.resolve();
        this.queries.push({ model, where: copyRow(input.where), take: undefined });
        let found = this.rows(model).filter((row) => matches(row, input.where));
        if (input.orderBy !== undefined) {
          found = [...found].sort((left, right) => {
            for (const ordering of input.orderBy ?? []) {
              const [key, direction] = Object.entries(ordering)[0] ?? [];
              if (key === undefined) continue;
              const compared = compareValues(left[key], right[key]);
              if (compared !== 0) return direction === 'desc' ? -compared : compared;
            }
            return 0;
          });
        }
        const row = found[0];
        return row === undefined ? null : copyRow(row);
      },
      findMany: async (input: {
        readonly where: Row;
        readonly orderBy?: readonly Row[];
        readonly take?: number;
      }) => {
        await Promise.resolve();
        this.queries.push({ model, where: copyRow(input.where), take: input.take });
        let found = this.rows(model).filter((row) => matches(row, input.where));
        if (input.orderBy !== undefined) {
          found = [...found].sort((left, right) => {
            for (const ordering of input.orderBy ?? []) {
              const [key, direction] = Object.entries(ordering)[0] ?? [];
              if (key === undefined) continue;
              const compared = compareValues(left[key], right[key]);
              if (compared !== 0) return direction === 'desc' ? -compared : compared;
            }
            return 0;
          });
        }
        return (input.take === undefined ? found : found.slice(0, input.take)).map(copyRow);
      },
      create: async (input: { readonly data: Row }) => {
        await Promise.resolve();
        const rows = this.rows(model);
        if (model === 'conversation' && rows.some((row) => row['id'] === input.data['id'])) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        if (
          model === 'conversation' &&
          rows.some(
            (row) =>
              row['organizationId'] === input.data['organizationId'] &&
              row['workspaceId'] === input.data['workspaceId'] &&
              row['scopeType'] === input.data['scopeType'] &&
              row['createIdempotencyScopeKey'] === input.data['createIdempotencyScopeKey'] &&
              row['createIdempotencyKey'] === input.data['createIdempotencyKey'],
          )
        ) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        if (
          model === 'message' &&
          rows.some(
            (row) =>
              row['organizationId'] === input.data['organizationId'] &&
              row['workspaceId'] === input.data['workspaceId'] &&
              row['conversationId'] === input.data['conversationId'] &&
              row['idempotencyKey'] === input.data['idempotencyKey'],
          )
        ) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        if (
          model === 'message' &&
          rows.some(
            (row) =>
              row['organizationId'] === input.data['organizationId'] &&
              row['workspaceId'] === input.data['workspaceId'] &&
              row['conversationId'] === input.data['conversationId'] &&
              row['sequence'] === input.data['sequence'],
          )
        ) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        if (
          model === 'event' &&
          rows.some(
            (row) =>
              row['id'] === input.data['id'] ||
              (input.data['idempotencyKey'] !== null &&
                row['organizationId'] === input.data['organizationId'] &&
                row['workspaceId'] === input.data['workspaceId'] &&
                row['scopeType'] === input.data['scopeType'] &&
                row['projectId'] === input.data['projectId'] &&
                row['conversationId'] === input.data['conversationId'] &&
                row['idempotencyKey'] === input.data['idempotencyKey']) ||
              (row['organizationId'] === input.data['organizationId'] &&
                row['workspaceId'] === input.data['workspaceId'] &&
                row['conversationId'] === input.data['conversationId'] &&
                row['sequence'] === input.data['sequence']),
          )
        ) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        if (
          model === 'summary' &&
          rows.some((row) => row['conversationId'] === input.data['conversationId'])
        ) {
          throw Object.assign(new Error('unique'), { code: 'P2002' });
        }
        const row = copyRow(input.data);
        rows.push(row);
        this.writes.push({ model, data: copyRow(input.data) });
        if (this.failureAfterMutation === model) {
          this.failureAfterMutation = undefined;
          throw new Error('FAKE_ROLLBACK');
        }
        return copyRow(row);
      },
      updateMany: async (input: { readonly where: Row; readonly data: Row }) => {
        await Promise.resolve();
        this.queries.push({ model, where: copyRow(input.where), take: undefined });
        const rows = this.rows(model);
        const matching = rows.filter((row) => matches(row, input.where));
        for (const row of matching) Object.assign(row, copyValue(input.data));
        if (matching.length > 0) {
          this.writes.push({ model, data: copyRow(input.data) });
          if (this.failureAfterMutation === model) {
            this.failureAfterMutation = undefined;
            throw new Error('FAKE_ROLLBACK');
          }
        }
        return { count: matching.length };
      },
    };
  }
}

function createRepository(database: FakePrismaDatabase): PrismaConversationRepositoryAdapter {
  return new PrismaConversationRepositoryAdapter(database as never);
}

function createdValue(result: ConversationCreateResultV1) {
  if (result === 'IDEMPOTENCY_CONFLICT') throw new Error('test create conflict');
  return result;
}

function messageValue(result: ConversationMessageAppendResultV1): ConversationMessageRecordV1 {
  if (typeof result === 'string') throw new Error(`test message result ${result}`);
  return 'message' in result ? result.message : result;
}

function conversation(
  conversationId: string,
  scope: TenantScopeV1 = tenantScope,
  overrides: Partial<ConversationRecordV1> = {},
): ConversationRecordV1 {
  return Object.freeze({
    conversationId,
    tenantScope: scope,
    title: 'Sales',
    activeDatasetIds: Object.freeze([datasetId]),
    activeDatasetVersionIds: Object.freeze({ [datasetId]: datasetVersionId }),
    retentionHold: false,
    revision: 1,
    createdAt: '2026-08-13T00:00:00.000Z',
    updatedAt: '2026-08-13T00:00:00.000Z',
    ...overrides,
  });
}

function message(
  messageId: string,
  conversationId: string,
  idempotencyKey: string,
  text: string,
  scope: TenantScopeV1 = tenantScope,
): ConversationMessageRecordV1 {
  return Object.freeze({
    messageId,
    conversationId,
    tenantScope: scope,
    role: 'USER',
    text,
    sequence: 0,
    idempotencyKey,
    createdAt: '2026-08-13T00:00:01.000Z',
  });
}

function contextEvent(
  eventId: string,
  conversationId: string,
  scope: TenantScopeV1 = tenantScope,
): ConversationContextEventRecordV1 {
  return Object.freeze({
    eventId,
    conversationId,
    tenantScope: scope,
    kind: 'CONTEXT_RESTORED',
    occurredAt: '2026-08-13T00:00:02.000Z',
  });
}

function summary(
  conversationId: string,
  revision: number,
  text: string,
  scope: TenantScopeV1 = tenantScope,
): ConversationSummaryRecordV1 {
  return Object.freeze({
    conversationId,
    tenantScope: scope,
    text,
    revision,
    updatedAt: '2026-08-13T00:00:03.000Z',
  });
}

void test('[DDA-055] restart/recreate replays durable create and rejects a fingerprint conflict', async () => {
  const database = new FakePrismaDatabase();
  const first = createdValue(
    await createRepository(database).createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000201'),
      'create-1',
    ),
  );
  const replay = createdValue(
    await createRepository(database).createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000202'),
      'create-1',
    ),
  );
  const conflict = await createRepository(database).createWithIdempotency(
    conversation('00000000-0000-4000-8000-000000000203', tenantScope, { title: 'Other' }),
    'create-1',
  );
  const otherTenant = createdValue(
    await createRepository(database).createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000204', otherTenantScope),
      'create-1',
    ),
  );

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.conversation.conversationId, first.conversation.conversationId);
  assert.equal(conflict, 'IDEMPOTENCY_CONFLICT');
  assert.equal(otherTenant.replayed, false);
  assert.equal(database.conversations.length, 2);
});

void test('[DDA-055] concurrent creates produce one row and one replay', async () => {
  const database = new FakePrismaDatabase();
  const results = await Promise.all([
    createRepository(database).createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000211'),
      'create-concurrent',
    ),
    createRepository(database).createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000212'),
      'create-concurrent',
    ),
  ]);

  assert.equal(
    results.filter((result) => result !== 'IDEMPOTENCY_CONFLICT' && result.replayed).length,
    1,
  );
  assert.equal(
    results.filter((result) => result !== 'IDEMPOTENCY_CONFLICT' && !result.replayed).length,
    1,
  );
  assert.equal(database.conversations.length, 1);
});

void test('[DDA-055] service surfaces durable create idempotency conflict', async () => {
  const database = new FakePrismaDatabase();
  const service = new ConversationService(createRepository(database));
  const input = {
    title: 'Service create',
    datasetIds: [datasetId],
    datasetVersionIds: { [datasetId]: datasetVersionId },
  };
  const first = await service.createConversation(
    { tenantScope, memberAuthorized: true },
    input,
    'service-create',
  );
  const replay = await service.createConversation(
    { tenantScope, memberAuthorized: true },
    input,
    'service-create',
  );
  const conflict = await service.createConversation(
    { tenantScope, memberAuthorized: true },
    { ...input, title: 'Changed' },
    'service-create',
  );

  assert.equal(first.accepted, true);
  assert.equal(replay.accepted, true);
  if (!first.accepted || !replay.accepted) return;
  assert.equal(replay.value.conversationId, first.value.conversationId);
  assert.deepEqual(conflict, {
    accepted: false,
    code: 'DDA_CONVERSATION_IDEMPOTENCY_CONFLICT',
  });
});

void test('[DDA-055] list and ID lookups use exact project scope and reject unknown cursors', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  await repository.createWithIdempotency(
    conversation('00000000-0000-4000-8000-000000000221', projectAScope),
    'project-shared',
  );
  await repository.createWithIdempotency(
    conversation('00000000-0000-4000-8000-000000000222', projectBScope),
    'project-shared',
  );

  assert.equal(
    await repository.findById(projectBScope, '00000000-0000-4000-8000-000000000221'),
    undefined,
  );
  assert.equal(
    await repository.findById(otherTenantScope, '00000000-0000-4000-8000-000000000221'),
    undefined,
  );
  const listed = await repository.list(projectAScope, undefined, 50);
  assert.deepEqual(
    listed.map((item) => item.conversationId),
    ['00000000-0000-4000-8000-000000000221'],
  );
  for (let index = 0; index < 51; index += 1) {
    const suffix = String(400 + index).padStart(12, '0');
    await repository.createWithIdempotency(
      conversation(`00000000-0000-4000-8000-${suffix}`),
      `bounded-${index}`,
    );
  }
  assert.equal((await repository.list(tenantScope, undefined, 200)).length, 50);
  await assert.rejects(
    repository.list(projectAScope, '00000000-0000-4000-8000-000000000299', 50),
    /DDA_CONVERSATION_CURSOR_INVALID/u,
  );

  for (const query of database.queries) {
    assert.equal(typeof query.where['organizationId'], 'string');
    assert.equal(typeof query.where['workspaceId'], 'string');
    assert.equal(typeof query.where['scopeType'], 'string');
    assert.equal(Object.prototype.hasOwnProperty.call(query.where, 'projectId'), true);
  }
  assert.equal(
    database.queries.some((query) => query.where['projectId'] === projectAScope.projectId),
    true,
  );
  assert.equal(
    database.queries.some((query) => query.where['projectId'] === projectBScope.projectId),
    true,
  );
});

void test('[DDA-055] Prisma pages use opaque keyset cursors and a database-bounded limit plus one', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  await repository.createWithIdempotency(
    conversation('00000000-0000-4000-8000-000000000311', tenantScope, {
      updatedAt: '2026-08-13T00:00:03.000Z',
    }),
    'page-1',
  );
  await repository.createWithIdempotency(
    conversation('00000000-0000-4000-8000-000000000312', tenantScope, {
      updatedAt: '2026-08-13T00:00:02.000Z',
    }),
    'page-2',
  );
  await repository.createWithIdempotency(
    conversation('00000000-0000-4000-8000-000000000313', tenantScope, {
      updatedAt: '2026-08-13T00:00:01.000Z',
    }),
    'page-3',
  );

  const first = await repository.listPage(tenantScope, undefined, 2);
  assert.deepEqual(
    first.items.map((item) => item.conversationId),
    ['00000000-0000-4000-8000-000000000311', '00000000-0000-4000-8000-000000000312'],
  );
  assert.match(first.nextCursor ?? '', /^[A-Za-z0-9_-]+$/u);
  assert.notEqual(first.nextCursor, '00000000-0000-4000-8000-000000000312');
  assert.equal(
    database.queries.some((query) => query.model === 'conversation' && query.take === 3),
    true,
  );

  const second = await repository.listPage(tenantScope, first.nextCursor, 2);
  assert.deepEqual(
    second.items.map((item) => item.conversationId),
    ['00000000-0000-4000-8000-000000000313'],
  );
  const keysetQuery = database.queries.find(
    (query) => query.model === 'conversation' && query.where['OR'] !== undefined,
  );
  assert.equal(typeof keysetQuery?.where['organizationId'], 'string');
  assert.equal(typeof keysetQuery?.where['workspaceId'], 'string');
  assert.equal(keysetQuery?.where['scopeType'], 'workspace');
});

void test('[DDA-055] message pages use sequence keysets and expose provenance safely', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000321'),
      'message-page-parent',
    ),
  );
  for (let index = 1; index <= 3; index += 1) {
    await repository.appendMessage(
      message(
        `00000000-0000-4000-8000-00000000032${index}`,
        created.conversation.conversationId,
        `message-page-${index}`,
        `message-${index}`,
      ),
    );
  }

  const first = await repository.listMessagesPage(
    tenantScope,
    created.conversation.conversationId,
    undefined,
    2,
  );
  assert.deepEqual(
    first.items.map((item) => item.sequence),
    [2, 3],
  );
  assert.equal(first.items[0]?.datasetVersionId, undefined);
  assert.equal(first.items[0]?.sequence, 2);
  assert.match(first.nextCursor ?? '', /^[A-Za-z0-9_-]+$/u);
  assert.equal(
    database.queries.some((query) => query.model === 'message' && query.take === 3),
    true,
  );

  const previous = await repository.listMessagesPage(
    tenantScope,
    created.conversation.conversationId,
    first.nextCursor,
    2,
  );
  assert.deepEqual(
    previous.items.map((item) => item.sequence),
    [1],
  );
});

void test('[DDA-055] messages allocate unique sequences and distinguish idempotency replay from conflict', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000231'),
      'message-parent',
    ),
  );

  const concurrent = await Promise.all([
    repository.appendMessage(
      message(
        '00000000-0000-4000-8000-000000000241',
        created.conversation.conversationId,
        'message-1',
        'one',
      ),
    ),
    repository.appendMessage(
      message(
        '00000000-0000-4000-8000-000000000242',
        created.conversation.conversationId,
        'message-2',
        'two',
      ),
    ),
  ]);
  const sequences = concurrent.map((result) => messageValue(result).sequence);
  assert.deepEqual(
    [...sequences].sort((left, right) => left - right),
    [1, 2],
  );

  const replay = await repository.appendMessage(
    message(
      '00000000-0000-4000-8000-000000000241',
      created.conversation.conversationId,
      'message-1',
      'one',
    ),
  );
  assert.equal(typeof replay, 'object');
  if (typeof replay === 'object' && 'message' in replay) {
    assert.equal(replay.outcome, 'REPLAY');
    assert.equal(replay.message.sequence, 1);
  }
  assert.equal(
    await repository.appendMessage(
      message(
        '00000000-0000-4000-8000-000000000249',
        created.conversation.conversationId,
        'message-1',
        'different',
      ),
    ),
    'IDEMPOTENCY_CONFLICT',
  );
  const secondConversation = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000243'),
      'message-parent-2',
    ),
  );
  const sameKeyDifferentConversation = await repository.appendMessage(
    message(
      '00000000-0000-4000-8000-000000000244',
      secondConversation.conversation.conversationId,
      'message-1',
      'different conversation',
    ),
  );
  assert.equal(messageValue(sameKeyDifferentConversation).sequence, 1);
  await assert.rejects(
    repository.listMessages(
      tenantScope,
      created.conversation.conversationId,
      '00000000-0000-4000-8000-000000000299',
      50,
    ),
    /DDA_CONVERSATION_CURSOR_INVALID/u,
  );
});

void test('[DDA-055] corrupt rows fail the scoped operation without trusting casts', async () => {
  const database = new FakePrismaDatabase();
  database.conversations.push({
    id: '00000000-0000-4000-8000-000000000251',
    scopeType: 'workspace',
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.workspaceId,
    projectId: null,
    title: 'Corrupt',
    activeDatasetIds: 'not-an-array',
    activeDatasetVersionIds: {},
    dashboardId: null,
    filterContext: null,
    retentionState: 'ACTIVE',
    retentionHold: false,
    revision: 1,
    createIdempotencyScopeKey: null,
    createIdempotencyKey: null,
    createRequestFingerprint: null,
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
  });
  const repository = createRepository(database);

  await assert.rejects(
    repository.findById(tenantScope, '00000000-0000-4000-8000-000000000251'),
    /DDA_CONVERSATION_INTEGRITY_UNAVAILABLE/u,
  );
  await assert.rejects(
    repository.list(tenantScope, undefined, 50),
    /DDA_CONVERSATION_INTEGRITY_UNAVAILABLE/u,
  );

  database.messages.push({
    id: '00000000-0000-4000-8000-000000000261',
    scopeType: 'workspace',
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.workspaceId,
    projectId: null,
    conversationId: '00000000-0000-4000-8000-000000000251',
    sequence: 1,
    idempotencyKey: 'bad',
    requestFingerprint: 'bad',
    role: 'USER',
    text: 42,
    textDigest: 'bad',
    textLength: 2,
    datasetVersionId: null,
    createdAt: new Date('2026-08-13T00:00:01.000Z'),
  });
  await assert.rejects(
    repository.listMessages(tenantScope, '00000000-0000-4000-8000-000000000251', undefined, 50),
    /DDA_CONVERSATION_INTEGRITY_UNAVAILABLE/u,
  );
});

void test('[DDA-055] additive migration legacy conversation metadata remains readable', async () => {
  const database = new FakePrismaDatabase();
  const conversationId = '00000000-0000-4000-8000-000000000261';
  database.conversations.push({
    id: conversationId,
    scopeType: 'workspace',
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.workspaceId,
    projectId: null,
    title: 'Legacy thread',
    activeDatasetIds: [],
    activeDatasetVersionIds: {},
    dashboardId: null,
    filterContext: null,
    retentionState: 'ACTIVE',
    retentionHold: false,
    nextSequence: 1,
    revision: 1,
    createIdempotencyScopeKey: `workspace:${tenantScope.organizationId}:${tenantScope.workspaceId}`,
    createIdempotencyKey: `legacy:${conversationId}`,
    createRequestFingerprint: '0'.repeat(64),
    createdAt: new Date('2026-08-13T00:00:00.000Z'),
    updatedAt: new Date('2026-08-13T00:00:00.000Z'),
  });

  const found = await createRepository(database).findById(tenantScope, conversationId);
  assert.equal(found?.title, 'Legacy thread');
  assert.deepEqual(found?.activeDatasetIds, []);
});

void test('[DDA-055][DDA-056] corrupt events and summaries fail their scoped reads', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000265'),
      'corrupt-related-parent',
    ),
  );
  database.events.push({
    id: '00000000-0000-4000-8000-000000000266',
    scopeType: 'workspace',
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.workspaceId,
    projectId: null,
    conversationId: created.conversation.conversationId,
    sequence: 1,
    datasetId: null,
    idempotencyScopeKey: null,
    idempotencyKey: null,
    requestFingerprint: null,
    kind: 'CORRUPT',
    beforeVersionId: null,
    afterVersionId: null,
    occurredAt: new Date('2026-08-13T00:00:01.000Z'),
    createdAt: new Date('2026-08-13T00:00:01.000Z'),
  });
  await assert.rejects(
    repository.listContextEvents(tenantScope, created.conversation.conversationId),
    /DDA_CONVERSATION_INTEGRITY_UNAVAILABLE/u,
  );
  database.events[0] = {
    ...database.events[0],
    kind: 'DATASET_VERSION_ADVANCED',
    beforeVersionId: datasetVersionId,
    afterVersionId: '00000000-0000-4000-8000-000000000267',
  };
  delete database.events[0]?.['datasetId'];
  await assert.rejects(
    repository.listContextEvents(tenantScope, created.conversation.conversationId),
    /DDA_CONVERSATION_INTEGRITY_UNAVAILABLE/u,
  );
  database.summaries.push({
    conversationId: created.conversation.conversationId,
    scopeType: 'workspace',
    organizationId: tenantScope.organizationId,
    workspaceId: tenantScope.workspaceId,
    projectId: null,
    text: 'summary',
    summaryDigest: 'bad',
    revision: 1,
    updatedAt: new Date('2026-08-13T00:00:01.000Z'),
  });
  await assert.rejects(
    repository.findSummary(tenantScope, created.conversation.conversationId),
    /DDA_CONVERSATION_INTEGRITY_UNAVAILABLE/u,
  );
});

void test('[DDA-056] context events require an existing scoped conversation and share safe sequence allocation', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000271'),
      'context-parent',
    ),
  );
  await repository.appendMessage(
    message(
      '00000000-0000-4000-8000-000000000272',
      created.conversation.conversationId,
      'context-message',
      'message',
    ),
  );
  const event = await repository.appendContextEvent(
    contextEvent('00000000-0000-4000-8000-000000000273', created.conversation.conversationId),
  );
  assert.equal(event.sequence, 2);
  assert.equal(
    (await repository.listContextEvents(tenantScope, created.conversation.conversationId))[0]
      ?.eventId,
    event.eventId,
  );
  await assert.rejects(
    repository.appendContextEvent(
      contextEvent(
        '00000000-0000-4000-8000-000000000274',
        created.conversation.conversationId,
        otherTenantScope,
      ),
    ),
    /DDA_CONVERSATION_NOT_FOUND/u,
  );
});

void test('[DDA-056] context advancement is durable, idempotent, CAS-protected, and atomic with its event', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000275'),
      'context-advance-parent',
    ),
  );
  const input = {
    tenantScope,
    conversationId: created.conversation.conversationId,
    datasetId,
    beforeVersionId: datasetVersionId,
    afterVersionId: '00000000-0000-4000-8000-000000000103',
    idempotencyKey: 'context-turn-1',
    eventId: '00000000-0000-4000-8000-000000000276',
    occurredAt: '2026-08-13T00:00:04.000Z',
  } as const;

  const advanced = await repository.advanceContext(input);
  if (typeof advanced === 'string') throw new Error(`UNEXPECTED_CONTEXT_RESULT:${advanced}`);
  assert.equal(advanced.outcome, 'ADVANCED');
  assert.equal(advanced.conversation.activeDatasetVersionIds[datasetId], input.afterVersionId);
  assert.equal(advanced.event.afterVersionId, input.afterVersionId);

  const replay = await repository.advanceContext({
    ...input,
    eventId: '00000000-0000-4000-8000-000000000277',
  });
  if (typeof replay === 'string') throw new Error(`UNEXPECTED_CONTEXT_RESULT:${replay}`);
  assert.equal(replay.outcome, 'REPLAY');
  assert.equal(replay.event.eventId, input.eventId);
  assert.equal(database.events.length, 1);

  const conflict = await repository.advanceContext({
    ...input,
    afterVersionId: '00000000-0000-4000-8000-000000000104',
    eventId: '00000000-0000-4000-8000-000000000278',
  });
  assert.equal(conflict, 'IDEMPOTENCY_CONFLICT');

  database.failNextMutation('event');
  await assert.rejects(
    repository.advanceContext({
      ...input,
      beforeVersionId: input.afterVersionId,
      afterVersionId: '00000000-0000-4000-8000-000000000105',
      idempotencyKey: 'context-turn-2',
      eventId: '00000000-0000-4000-8000-000000000279',
    }),
    /FAKE_ROLLBACK/u,
  );
  const current = await repository.findById(tenantScope, created.conversation.conversationId);
  assert.equal(current?.activeDatasetVersionIds[datasetId], input.afterVersionId);
  assert.equal(database.events.length, 1);
});

void test('[DDA-056] concurrent context advancement with one idempotency key produces one event', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000285'),
      'context-concurrent-parent',
    ),
  );
  const base = {
    tenantScope,
    conversationId: created.conversation.conversationId,
    datasetId,
    beforeVersionId: datasetVersionId,
    afterVersionId: '00000000-0000-4000-8000-000000000106',
    idempotencyKey: 'context-concurrent-1',
    occurredAt: '2026-08-13T00:00:05.000Z',
  } as const;
  const results = await Promise.all([
    repository.advanceContext({
      ...base,
      eventId: '00000000-0000-4000-8000-000000000286',
    }),
    repository.advanceContext({
      ...base,
      eventId: '00000000-0000-4000-8000-000000000287',
    }),
  ]);
  assert.deepEqual(
    results.map((result) => (typeof result === 'string' ? result : result.outcome)).sort(),
    ['ADVANCED', 'REPLAY'],
  );
  assert.equal(database.events.length, 1);
});

void test('[DDA-055] summary writes use atomic compare-and-set and preserve rollback', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000281'),
      'summary-parent',
    ),
  );

  const initial = await repository.saveSummary(
    summary(created.conversation.conversationId, 1, 'one'),
  );
  assert.notEqual(initial, 'REVISION_CONFLICT');
  const revisions = await Promise.all([
    repository.saveSummary(summary(created.conversation.conversationId, 2, 'two')),
    repository.saveSummary(summary(created.conversation.conversationId, 2, 'also two')),
  ]);
  assert.equal(revisions.filter((result) => result === 'REVISION_CONFLICT').length, 1);

  database.failNextMutation('summary');
  await assert.rejects(
    repository.saveSummary(summary(created.conversation.conversationId, 3, 'three')),
    /FAKE_ROLLBACK/u,
  );
  const current = await repository.findSummary(tenantScope, created.conversation.conversationId);
  assert.equal(current?.revision, 2);
});

void test('[DDA-055] retention hold cannot be cleared by a conversation update', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000291', tenantScope, {
        retentionHold: true,
      }),
      'hold-parent',
    ),
  );
  const updated = await repository.update({
    ...created.conversation,
    retentionHold: false,
    title: 'Renamed',
  });
  assert.equal(updated.retentionHold, true);
  const replay = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000292', tenantScope, {
        retentionHold: true,
      }),
      'hold-parent',
    ),
  );
  assert.equal(replay.replayed, true);
  assert.equal(replay.conversation.conversationId, created.conversation.conversationId);
});

void test('[DDA-055] failed transactional appends roll back all durable rows', async () => {
  const database = new FakePrismaDatabase();
  const repository = createRepository(database);
  const created = createdValue(
    await repository.createWithIdempotency(
      conversation('00000000-0000-4000-8000-000000000301'),
      'rollback-parent',
    ),
  );
  database.failNextMutation('event');

  await assert.rejects(
    repository.appendContextEvent(
      contextEvent('00000000-0000-4000-8000-000000000302', created.conversation.conversationId),
    ),
    /FAKE_ROLLBACK/u,
  );
  assert.equal(database.events.length, 0);
});
