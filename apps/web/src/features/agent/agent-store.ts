export interface AgentConversationSummaryV1 {
  readonly conversationId: string;
  readonly title: string;
  readonly datasetLabel: string;
  readonly datasetVersionLabel: string;
}

export interface AgentStoreV1 {
  readonly getActiveConversation: () => AgentConversationSummaryV1 | undefined;
  readonly setActiveConversation: (conversation: AgentConversationSummaryV1 | undefined) => void;
  readonly isOpen: () => boolean;
  readonly setOpen: (open: boolean) => void;
}

/** One agent store persists conversation context across destinations. */
export function createAgentStore(initial?: AgentConversationSummaryV1): AgentStoreV1 {
  let active = initial;
  let open = false;
  return {
    getActiveConversation: () => active,
    setActiveConversation: (conversation) => {
      active = conversation;
    },
    isOpen: () => open,
    setOpen: (next) => {
      open = next;
    },
  };
}
