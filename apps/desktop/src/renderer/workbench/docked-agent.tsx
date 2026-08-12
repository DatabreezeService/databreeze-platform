import { useState, type FormEvent } from 'react';
import type { DesktopLocale } from '../../shared/desktop-contract-v1.ts';

export type DockedAgentProperties = {
  readonly locale: DesktopLocale;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSubmit: (message: string) => void;
};

const LABELS = {
  'vi-VN': {
    region: 'Tác nhân không gian làm việc',
    input: 'Tin nhắn tới tác nhân',
    send: 'Gửi',
    hide: 'Ẩn tác nhân',
    show: 'Hiện tác nhân',
  },
  en: {
    region: 'Workspace agent',
    input: 'Message to agent',
    send: 'Send',
    hide: 'Hide agent',
    show: 'Show agent',
  },
} as const;

export function DockedAgent({ locale, open, onOpenChange, onSubmit }: DockedAgentProperties) {
  const copy = LABELS[locale];
  const [message, setMessage] = useState('');

  if (!open) {
    return (
      <button className="docked-agent__show" onClick={() => onOpenChange(true)} type="button">
        {copy.show}
      </button>
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = message.trim();
    if (trimmed.length === 0) return;
    onSubmit(trimmed);
    setMessage('');
  }

  return (
    <aside aria-label={copy.region} className="docked-agent">
      <div className="docked-agent__header">
        <h2>{copy.region}</h2>
        <button onClick={() => onOpenChange(false)} type="button">
          {copy.hide}
        </button>
      </div>
      <form className="docked-agent__form" onSubmit={handleSubmit}>
        <label className="sr-only" htmlFor="docked-agent-input">
          {copy.input}
        </label>
        <textarea
          id="docked-agent-input"
          aria-label={copy.input}
          onChange={(event) => setMessage(event.target.value)}
          rows={4}
          value={message}
        />
        <button type="submit">{copy.send}</button>
      </form>
    </aside>
  );
}
