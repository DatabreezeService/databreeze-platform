import { useEffect, useId, useRef, useState } from 'react';
import { LocaleFlag } from '../../components/locale-flag.tsx';

const LOCALES = ['en', 'vi-VN'] as const;
type AuthLocale = (typeof LOCALES)[number];

const LABELS: Record<AuthLocale, string> = {
  en: 'English',
  'vi-VN': 'Tiếng Việt',
};

export function authLocaleHref(nextLocale: AuthLocale, pathname?: string): string {
  const path = pathname ?? (typeof window === 'undefined' ? '' : window.location.pathname);
  const segments = path.split('/').filter(Boolean);
  const first = segments[0];
  if (first === 'en' || first === 'vi-VN') {
    return `/${[nextLocale, ...segments.slice(1)].join('/')}`;
  }
  return `/${nextLocale}/sign-in`;
}

export function AuthLocaleMenu({ locale }: { readonly locale: AuthLocale }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const pathname = typeof window === 'undefined' ? '' : window.location.pathname;

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="auth-locale" ref={rootRef}>
      <button
        type="button"
        className="auth-locale__button"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <LocaleFlag locale={locale} />
        <span>{LABELS[locale]}</span>
        <svg
          className="auth-locale__chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          aria-hidden="true"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <ul className="auth-locale__menu" id={listId} role="listbox">
          {LOCALES.map((option) => (
            <li key={option} role="none">
              <a
                className="auth-locale__option"
                href={authLocaleHref(option, pathname)}
                role="option"
                aria-selected={option === locale}
              >
                <LocaleFlag locale={option} />
                <span>{LABELS[option]}</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
