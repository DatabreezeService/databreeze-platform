import assert from 'node:assert/strict';
import test from 'node:test';

import { InMemoryConversationRepositoryAdapter } from '../../../src/features/dda/conversation/adapter/in-memory-conversation-repository.adapter.js';
import { ConversationContextService } from '../../../src/features/dda/conversation/application/conversation-context.service.js';
import { ConversationService } from '../../../src/features/dda/conversation/application/conversation.service.js';

const tenantScope = {
  scopeType: 'workspace',
  organizationId: '00000000-0000-4000-8000-000000000001',
  workspaceId: '00000000-0000-4000-8000-000000000002',
} as never;

const datasetId = '00000000-0000-4000-8000-000000000701';
const oldVersion = '00000000-0000-4000-8000-000000000702';
const newVersion = '00000000-0000-4000-8000-000000000703';

void test('[DDA-056] compatible latest version emits one DATASET_VERSION_ADVANCED event', async () => {
  const repo = new InMemoryConversationRepositoryAdapter();
  const conversations = new ConversationService(repo);
  const context = new ConversationContextService(repo);
  const created = await conversations.createConversation(
    { tenantScope, memberAuthorized: true },
    {
      title: 'Versioned',
      datasetIds: [datasetId],
      datasetVersionIds: { [datasetId]: oldVersion },
    },
    'create-ctx-1',
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const resolved = await context.resolveTurnContext({
    tenantScope,
    conversationId: created.value.conversationId,
    latestCompatibleVersions: { [datasetId]: newVersion },
  });
  assert.equal(resolved.accepted, true);
  if (!resolved.accepted) return;
  assert.equal(resolved.event?.kind, 'DATASET_VERSION_ADVANCED');
  assert.equal(resolved.event?.beforeVersionId, oldVersion);
  assert.equal(resolved.event?.afterVersionId, newVersion);
  assert.equal(resolved.conversation.activeDatasetVersionIds[datasetId], newVersion);
});

void test('[DDA-056] incompatible drift leaves active version unchanged', async () => {
  const repo = new InMemoryConversationRepositoryAdapter();
  const conversations = new ConversationService(repo);
  const context = new ConversationContextService(repo);
  const created = await conversations.createConversation(
    { tenantScope, memberAuthorized: true },
    {
      title: 'Drift',
      datasetIds: [datasetId],
      datasetVersionIds: { [datasetId]: oldVersion },
    },
    'create-ctx-2',
  );
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const resolved = await context.resolveTurnContext({
    tenantScope,
    conversationId: created.value.conversationId,
    latestCompatibleVersions: { [datasetId]: newVersion },
    incompatibleDatasetIds: [datasetId],
  });
  assert.equal(resolved.accepted, false);
  if (resolved.accepted) return;
  assert.equal(resolved.code, 'CONTEXT_REVIEW_REQUIRED');
  const loaded = await conversations.loadConversation(
    { tenantScope, memberAuthorized: true },
    created.value.conversationId,
    undefined,
    10,
  );
  assert.equal(loaded.accepted, true);
  if (!loaded.accepted) return;
  assert.equal(loaded.value.conversation.activeDatasetVersionIds[datasetId], oldVersion);
});
