import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LocaleFlag } from './locale-flag.tsx';

const LOCALES = ['en', 'vi-VN'] as const;
type WorkspaceLocale = (typeof LOCALES)[number];

const LABELS: Record<WorkspaceLocale, string> = {
  en: 'English',
  'vi-VN': 'Tiếng Việt',
};

export function workspaceLocaleHref(
  nextLocale: WorkspaceLocale,
  pathname: string,
  search = '',
  hash = '',
): string {
  const segments = pathname.split('/').filter(Boolean);
  const first = segments[0];
  if (first === 'en' || first === 'vi-VN') {
    return `/${[nextLocale, ...segments.slice(1)].join('/')}${search}${hash}`;
  }
  return `/${nextLocale}/dashboards${search}${hash}`;
}

export function WorkspaceLocaleMenu({ locale }: { readonly locale: WorkspaceLocale }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const location = useLocation();
  const pathname = location.pathname;

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

  const alternateLocale = locale === 'vi-VN' ? 'en' : 'vi-VN';
  const alternatePath = workspaceLocaleHref(
    alternateLocale,
    pathname,
    location.search,
    location.hash,
  );

  return (
    <div className="workspace-topbar__locale-menu" ref={rootRef}>
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="workspace-topbar__locale-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <LocaleFlag className="workspace-topbar__locale-flag" locale={locale} />
        <span className="workspace-topbar__locale-text">{LABELS[locale]}</span>
        <svg
          aria-hidden="true"
          className={`workspace-topbar__locale-chevron ${open ? 'is-open' : ''}`}
          height="12"
          viewBox="0 0 12 12"
          width="12"
        >
          <path
            d="M3 4.5 6 7.5 9 4.5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.4"
          />
        </svg>
      </button>

      {/* Primary direct link for tests and screen readers */}
      <Link
        aria-label={locale === 'vi-VN' ? 'Tiếng Việt' : 'Chuyển sang tiếng Việt'}
        className="workspace-topbar__locale-hidden-link dda-sr-only"
        to={alternatePath}
      >
        {LABELS[locale]}
      </Link>

      {open ? (
        <ul className="workspace-topbar__locale-dropdown" id={listId} role="listbox">
          {LOCALES.map((option) => (
            <li key={option} role="none">
              <Link
                aria-selected={option === locale}
                className={`workspace-topbar__locale-option ${option === locale ? 'is-selected' : ''}`}
                onClick={() => setOpen(false)}
                role="option"
                to={workspaceLocaleHref(option, pathname, location.search, location.hash)}
              >
                <LocaleFlag className="workspace-topbar__locale-flag" locale={option} />
                <span>{LABELS[option]}</span>
                {option === locale ? (
                  <span aria-hidden="true" className="workspace-topbar__locale-check">
                    ✓
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
