export interface ConversationRetentionPortV1 {
  isHeld(conversationId: string): Promise<boolean>;
}

export class NoHoldConversationRetentionAdapter implements ConversationRetentionPortV1 {
  public isHeld(): Promise<boolean> {
    return Promise.resolve(false);
  }
}
