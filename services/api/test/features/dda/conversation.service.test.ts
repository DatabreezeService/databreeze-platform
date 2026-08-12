import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryConversationRepositoryAdapter } from '../../../src/features/dda/conversation/adapter/in-memory-conversation-repository.adapter.js';
import { ConversationService } from '../../../src/features/dda/conversation/application/conversation.service.js';

const tenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
} as never;

void test('[DDA-055] create append list and load conversation with workspace ownership', async () => {
  const repo = new InMemoryConversationRepositoryAdapter();
  const service = new ConversationService(repo);
  const created = await service.createConversation(
    { tenantScope, memberAuthorized: true },
    {
      title: 'Sales questions',
      datasetIds: ['00000000-0000-4000-8000-000000000701'],
      datasetVersionIds: {
        '00000000-0000-4000-8000-000000000701': '00000000-0000-4000-8000-000000000702',
      },
    },
    'create-1',
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const appended = await service.appendUserMessage(
    { tenantScope, memberAuthorized: true },
    created.value.conversationId,
    {
      messageId: '00000000-0000-4000-8000-000000000801',
      text: 'Tong doanh thu thang 8 la bao nhieu?',
      idempotencyKey: 'msg-1',
    },
  );
  assert.equal(appended.accepted, true);

  const listed = await service.listConversations({ tenantScope, memberAuthorized: true }, undefined, 20);
  assert.equal(listed.accepted, true);
  if (!listed.accepted) return;
  assert.equal(listed.value.length, 1);

  const loaded = await service.loadConversation(
    { tenantScope, memberAuthorized: true },
    created.value.conversationId,
    undefined,
    50,
  );
  assert.equal(loaded.accepted, true);
  if (!loaded.accepted) return;
  assert.equal(loaded.value.messages.length, 1);
  assert.equal(loaded.value.messages[0]?.text.includes('Tong doanh thu'), true);
});

void test('[DDA-055] denies unauthorized members and cross-workspace reads', async () => {
  const repo = new InMemoryConversationRepositoryAdapter();
  const service = new ConversationService(repo);
  const created = await service.createConversation(
    { tenantScope, memberAuthorized: true },
    {
      title: 'Private',
      datasetIds: ['00000000-0000-4000-8000-000000000701'],
      datasetVersionIds: {
        '00000000-0000-4000-8000-000000000701': '00000000-0000-4000-8000-000000000702',
      },
    },
    'create-2',
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const denied = await service.loadConversation(
    { tenantScope, memberAuthorized: false },
    created.value.conversationId,
    undefined,
    10,
  );
  assert.equal(denied.accepted, false);

  const other = await service.loadConversation(
    {
      tenantScope: {
        scopeType: 'workspace',
        organizationId: '00000000-0000-4000-8000-000000000099',
        workspaceId: '00000000-0000-4000-8000-000000000098',
      } as never,
      memberAuthorized: true,
    },
    created.value.conversationId,
    undefined,
    10,
  );
  assert.equal(other.accepted, false);
});
