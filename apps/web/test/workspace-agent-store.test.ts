import { describe, expect, it } from 'vitest';

import { workspaceAgentStore } from '../src/features/agent/workspace-agent-store.ts';

describe('workspace agent store [WEB-024, DDA-031]', () => {
  it('retains the active authorized context for every destination importing the store', () => {
    const conversation = {
      conversationId: 'conversation-1',
      title: 'Revenue review',
      datasetLabel: 'Sales',
      datasetVersionLabel: 'version 8',
    };

    workspaceAgentStore.setActiveConversation(conversation);

    expect(workspaceAgentStore.getActiveConversation()).toEqual(conversation);
    workspaceAgentStore.setActiveConversation(undefined);
  });

  it('switches only among supplied authorized conversation summaries', () => {
    const conversations = [
      {
        conversationId: 'conversation-sales',
        title: 'Revenue review',
        datasetLabel: 'Sales',
        datasetVersionLabel: 'version 8',
      },
      {
        conversationId: 'conversation-orders',
        title: 'Order anomalies',
        datasetLabel: 'Orders',
        datasetVersionLabel: 'version 3',
      },
    ];

    workspaceAgentStore.setConversations(conversations);
    workspaceAgentStore.selectConversation('conversation-orders');
    expect(workspaceAgentStore.getActiveConversation()?.conversationId).toBe(
      'conversation-orders',
    );

    workspaceAgentStore.selectConversation('conversation-hidden');
    expect(workspaceAgentStore.getActiveConversation()?.conversationId).toBe(
      'conversation-orders',
    );
    workspaceAgentStore.setActiveConversation(undefined);
  });
});
