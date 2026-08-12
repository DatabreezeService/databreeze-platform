export function ConversationThread({
  locale,
  title,
}: {
  readonly locale: 'en' | 'vi-VN';
  readonly title: string;
}) {
  return (
    <section aria-label={locale === 'vi-VN' ? 'Luồng hội thoại' : 'Conversation thread'}>
      <h2>{title}</h2>
    </section>
  );
}
