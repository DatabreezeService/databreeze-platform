import type { AgentStoreV1 } from './agent-store.ts';

export function FloatingAgentPanel({
  store,
  locale,
  surface,
}: {
  readonly store: AgentStoreV1;
  readonly locale: 'en' | 'vi-VN';
  readonly surface: 'dashboard' | 'data' | 'analysis';
}) {
  if (surface === 'analysis') {
    return (
      <section aria-label={locale === 'vi-VN' ? 'Phân tích' : 'Analysis'} className="analysis-agent-region">
        <p>
          {locale === 'vi-VN'
            ? 'Trợ lý dùng toàn bộ khu vực Phân tích, không hiện nút nổi thứ hai.'
            : 'The agent uses the full Analysis area. No second floating button.'}
        </p>
        {store.getActiveConversation() ? (
          <p>{store.getActiveConversation()?.title}</p>
        ) : null}
      </section>
    );
  }

  if (!store.isOpen()) return null;
  return (
    <aside aria-label={locale === 'vi-VN' ? 'Trợ lý' : 'Agent'} className="floating-agent-panel">
      <button type="button" onClick={() => store.setOpen(false)}>
        {locale === 'vi-VN' ? 'Đóng' : 'Close'}
      </button>
    </aside>
  );
}
