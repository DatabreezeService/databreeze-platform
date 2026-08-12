import type { AgentStoreV1 } from './agent-store.ts';

export function FloatingAgentButton({
  store,
  locale,
}: {
  readonly store: AgentStoreV1;
  readonly locale: 'en' | 'vi-VN';
}) {
  return (
    <button
      className="floating-agent-button"
      type="button"
      onClick={() => store.setOpen(true)}
    >
      {locale === 'vi-VN' ? 'Mở trợ lý' : 'Open agent'}
    </button>
  );
}
