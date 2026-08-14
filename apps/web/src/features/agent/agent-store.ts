export interface AgentMessagePresentationV1 {
  readonly messageId: string;
  readonly role: 'USER' | 'ASSISTANT';
  readonly text: string;
  readonly createdLabel?: string;
}

export interface AgentConversationSummaryV1 {
  readonly conversationId: string;
  readonly title: string;
  readonly datasetLabel: string;
  readonly datasetVersionLabel: string;
  readonly messages?: readonly AgentMessagePresentationV1[];
}

export interface AgentStoreV1 {
  readonly getActiveConversation: () => AgentConversationSummaryV1 | undefined;
  readonly getConversations: () => readonly AgentConversationSummaryV1[];
  readonly selectConversation: (conversationId: string) => void;
  readonly setActiveConversation: (conversation: AgentConversationSummaryV1 | undefined) => void;
  readonly setConversations: (conversations: readonly AgentConversationSummaryV1[]) => void;
  readonly isOpen: () => boolean;
  readonly setOpen: (open: boolean) => void;
  readonly getSnapshot: () => AgentStoreSnapshotV1;
  readonly subscribe: (listener: () => void) => () => void;
}

export interface AgentStoreSnapshotV1 {
  readonly activeConversation?: AgentConversationSummaryV1;
  readonly conversations: readonly AgentConversationSummaryV1[];
  readonly open: boolean;
}

/** One agent store persists conversation context across destinations. */
export function createAgentStore(initial?: AgentConversationSummaryV1): AgentStoreV1 {
  let active = initial;
  let conversations: readonly AgentConversationSummaryV1[] = Object.freeze(
    initial === undefined ? [] : [initial],
  );
  let open = false;
  let snapshot: AgentStoreSnapshotV1 = Object.freeze({
    ...(active === undefined ? {} : { activeConversation: active }),
    conversations,
    open,
  });
  const listeners = new Set<() => void>();
  const emit = () => {
    snapshot = Object.freeze({
      ...(active === undefined ? {} : { activeConversation: active }),
      conversations,
      open,
    });
    for (const listener of listeners) listener();
  };
  return {
    getActiveConversation: () => active,
    getConversations: () => conversations,
    selectConversation: (conversationId) => {
      const next = conversations.find(
        (conversation) => conversation.conversationId === conversationId,
      );
      if (next === undefined || next.conversationId === active?.conversationId) return;
      active = next;
      emit();
    },
    setActiveConversation: (conversation) => {
      active = conversation;
      if (conversation === undefined) {
        conversations = Object.freeze([]);
      } else {
        conversations = Object.freeze([
          conversation,
          ...conversations.filter(
            (candidate) => candidate.conversationId !== conversation.conversationId,
          ),
        ]);
      }
      emit();
    },
    setConversations: (nextConversations) => {
      conversations = Object.freeze([...nextConversations]);
      if (conversations.length === 0) active = undefined;
      else {
        active =
          conversations.find(
            (conversation) => conversation.conversationId === active?.conversationId,
          ) ?? conversations[0];
      }
      emit();
    },
    isOpen: () => open,
    setOpen: (next) => {
      open = next;
      emit();
    },
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
