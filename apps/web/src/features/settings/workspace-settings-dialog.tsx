import type { SupportedLocaleV1 } from '@databreeze/i18n/v1';
import { createPortal } from 'react-dom';
import { useEffect, useRef, type KeyboardEvent } from 'react';
import { appMessage } from '../../app/messages.ts';
import { WorkspaceSettingsRoutePage } from './workspace-settings-page.tsx';

export interface WorkspaceSettingsDialogProperties {
  readonly locale: SupportedLocaleV1;
  readonly onClose: () => void;
}

function focusableElements(dialog: HTMLDialogElement): readonly HTMLElement[] {
  return Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/** The avatar entry point uses the same governed settings surface without changing routes. */
export function WorkspaceSettingsDialog({ locale, onClose }: WorkspaceSettingsDialogProperties) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousBodyOverflow;
    };
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = focusableElements(dialogRef.current as HTMLDialogElement);
    if (focusable.length === 0) {
      event.preventDefault();
      dialogRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  const dialog = (
    <dialog
      aria-label={appMessage(locale, 'settings.workspace.title')}
      aria-modal="true"
      className="workspace-settings-dialog"
      data-settings-dialog="true"
      id="workspace-settings-dialog"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleKeyDown}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      open
      ref={dialogRef}
      tabIndex={-1}
    >
      <div className="workspace-settings-dialog__panel" data-settings-dialog-panel="true">
        <button
          aria-label={appMessage(locale, 'settings.workspace.close')}
          className="workspace-settings-dialog__close"
          data-settings-dialog-close="true"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
        <div className="workspace-settings-dialog__body">
          <WorkspaceSettingsRoutePage locale={locale} presentation="dialog" />
        </div>
      </div>
    </dialog>
  );

  return typeof document === 'undefined' ? null : createPortal(dialog, document.body);
}
