import { useEffect, useId, useRef, useState } from 'react';

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

function LocaleFlag({ locale }: { readonly locale: AuthLocale }) {
  if (locale === 'vi-VN') {
    return (
      <svg
        className="auth-locale__flag"
        viewBox="0 0 18 12"
        width="18"
        height="12"
        aria-hidden="true"
      >
        <rect width="18" height="12" fill="#da251d" />
        <polygon
          fill="#ff0"
          points="9,1.55 10.08,5.08 13.8,5.08 10.8,7.2 11.88,10.7 9,8.55 6.12,10.7 7.2,7.2 4.2,5.08 7.92,5.08"
        />
      </svg>
    );
  }

  return (
    <svg
      className="auth-locale__flag"
      viewBox="0 0 18 12"
      width="18"
      height="12"
      aria-hidden="true"
    >
      <rect width="18" height="12" fill="#b22234" />
      <rect y="1" width="18" height="1" fill="#fff" />
      <rect y="3" width="18" height="1" fill="#fff" />
      <rect y="5" width="18" height="1" fill="#fff" />
      <rect y="7" width="18" height="1" fill="#fff" />
      <rect y="9" width="18" height="1" fill="#fff" />
      <rect y="11" width="18" height="1" fill="#fff" />
      <rect width="8" height="6.5" fill="#3c3b6e" />
    </svg>
  );
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
