export function ConversationHistory({
  locale,
  items,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly items: readonly {
    readonly conversationId: string;
    readonly title: string;
    readonly datasetLabel: string;
    readonly datasetVersionLabel: string;
  }[];
}) {
  return (
    <aside aria-label={locale === 'vi-VN' ? 'Lịch sử hội thoại' : 'Conversation history'}>
      <ul>
        {items.map((item) => (
          <li key={item.conversationId}>
            <p>{item.title}</p>
            <p>
              {item.datasetLabel} · {item.datasetVersionLabel}
            </p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
