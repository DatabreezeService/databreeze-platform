import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

import { DATABREEZE_MARK_SRC } from '../../app/brand-assets.ts';
import '../../styles/dashboard-agent.css';

export interface AgentInvitationProps {
  readonly locale: SupportedLocaleV1;
  readonly visible: boolean;
  readonly onOpen: () => void;
  readonly onDismiss: () => void;
}

function label(locale: SupportedLocaleV1, vi: string, en: string): string {
  return locale === 'vi-VN' ? vi : en;
}

/** DDA-015/DDA-024: a dismissible first-use invitation with a persistent dashboard-local entry point. */
export function AgentInvitation({ locale, visible, onOpen, onDismiss }: AgentInvitationProps) {
  return (
    <aside
      className="dda-agent-invitation"
      aria-label={label(locale, 'Trợ lý biểu đồ', 'Chart assistant')}
    >
      {visible ? (
        <div className="dda-agent-invitation__bubble" role="status">
          <p>
            {label(
              locale,
              'Muốn thêm biểu đồ mới hoặc chỉnh biểu đồ hiện tại? Nói với tôi.',
              'Want a new chart or a change to this one? Talk to me.',
            )}
          </p>
          <button
            type="button"
            className="dda-agent-invitation__dismiss"
            aria-label={label(
              locale,
              'Ẩn lời mời trợ lý biểu đồ',
              'Dismiss chart assistant invitation',
            )}
            onClick={onDismiss}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
      <button
        type="button"
        className="dda-agent-invitation__button"
        aria-label={label(locale, 'Mở trợ lý biểu đồ', 'Open chart assistant')}
        onClick={onOpen}
      >
        <img alt="" aria-hidden="true" src={DATABREEZE_MARK_SRC} />
      </button>
    </aside>
  );
}
