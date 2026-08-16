import { useSyncExternalStore } from 'react';

import { DATABREEZE_MARK_SRC } from '../../app/brand-assets.ts';
import type { AgentStoreV1 } from './agent-store.ts';

export function FloatingAgentButton({
  store,
  locale,
}: {
  readonly store: AgentStoreV1;
  readonly locale: 'en' | 'vi-VN';
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const label = locale === 'vi-VN' ? 'Mở trợ lý' : 'Open agent';
  return (
    <button
      aria-expanded={snapshot.open}
      aria-label={label}
      className="floating-agent-button"
      type="button"
      onClick={() => store.setOpen(!snapshot.open)}
    >
      <img alt="" aria-hidden="true" src={DATABREEZE_MARK_SRC} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
