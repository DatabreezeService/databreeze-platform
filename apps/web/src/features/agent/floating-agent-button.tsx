import { useSyncExternalStore } from 'react';
import brandMarkUrl from '@databreeze/design-tokens/brand/generated/web/favicon-32.png';

import type { AgentStoreV1 } from './agent-store.ts';

export function FloatingAgentButton({
  store,
  locale,
}: {
  readonly store: AgentStoreV1;
  readonly locale: 'en' | 'vi-VN';
}) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return (
    <button
      aria-expanded={snapshot.open}
      className="floating-agent-button"
      type="button"
      onClick={() => store.setOpen(!snapshot.open)}
    >
      <img alt="" aria-hidden="true" src={brandMarkUrl} />
      <span>{locale === 'vi-VN' ? 'Mở trợ lý' : 'Open agent'}</span>
    </button>
  );
}
