import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';

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
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M5 5.75A2.75 2.75 0 0 1 7.75 3h8.5A2.75 2.75 0 0 1 19 5.75v7.5A2.75 2.75 0 0 1 16.25 16H12l-3.6 3.05A.75.75 0 0 1 7.17 18.5V16h-.42A2.75 2.75 0 0 1 4 13.25v-7.5C4 4.23 4.67 3 5 3Zm2.75-1.25A1.25 1.25 0 0 0 6.5 5.75v7.5c0 .69.56 1.25 1.25 1.25h.92v2.38L11.5 14.5h4.75c.69 0 1.25-.56 1.25-1.25v-7.5c0-.69-.56-1.25-1.25-1.25h-8.5Z" />
          <path
            d="M8.5 8.5h7M8.5 11.5h4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </aside>
  );
}
