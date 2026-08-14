import wordmarkUrl from '@databreeze/design-tokens/brand/generated/web/navigation-wordmark-blue-204x50.png';
import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { appMessage } from '../app/messages.ts';
import {
  udwPrimaryNavLabelV1,
  type UdwPrimaryNavItemV1,
} from '../app/unified-primary-navigation.ts';

export interface ApplicationRailProperties {
  readonly isMobile?: boolean;
  readonly items: readonly UdwPrimaryNavItemV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly mobileOpen: boolean;
  readonly onMobileOpenChange: (open: boolean) => void;
}

function RailIcon({ itemKey }: { readonly itemKey: UdwPrimaryNavItemV1['key'] }) {
  const properties = {
    'aria-hidden': true,
    fill: 'none',
    height: 20,
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    strokeWidth: 1.8,
    viewBox: '0 0 24 24',
    width: 20,
  };

  if (itemKey === 'analysis') {
    return (
      <svg {...properties}>
        <path d="M4 19V5m0 14h16" />
        <path d="m7 15 4-4 3 2 4-6" />
        <path d="M16 7h2v2" />
      </svg>
    );
  }

  if (itemKey === 'data') {
    return (
      <svg {...properties}>
        <ellipse cx="12" cy="5.5" rx="7" ry="3" />
        <path d="M5 5.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
        <path d="M5 11.5v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </svg>
    );
  }

  return (
    <svg {...properties}>
      <rect height="13" rx="2" width="15" x="4.5" y="5.5" />
      <path d="M8 15v-3m4 3V9m4 6v-5" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

/** WEB-002/013/014/022: compact, build-time registered primary navigation. */
export function ApplicationRail({
  isMobile = false,
  items,
  locale,
  mobileOpen,
  onMobileOpenChange,
}: ApplicationRailProperties) {
  useEffect(() => {
    if (!isMobile || !mobileOpen) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileOpenChange(false);
    };
    globalThis.addEventListener('keydown', closeOnEscape);
    return () => globalThis.removeEventListener('keydown', closeOnEscape);
  }, [isMobile, mobileOpen, onMobileOpenChange]);

  return (
    <nav
      aria-label={appMessage(locale, 'nav.label')}
      className={`application-rail${isMobile ? ' application-rail--mobile' : ''}${
        mobileOpen ? ' is-mobile-open' : ''
      }`}
      hidden={isMobile && !mobileOpen}
      id="primary-navigation"
    >
      <Link
        aria-label="DataBreeze"
        className="application-rail__brand"
        to={`/${locale}/dashboards`}
      >
        <span className="application-rail__brand-mark" aria-hidden="true">
          <img alt="" height="50" src={wordmarkUrl} width="204" />
        </span>
      </Link>
      {isMobile ? (
        <button
          aria-label={appMessage(locale, 'nav.close')}
          className="application-rail__mobile-close"
          onClick={() => onMobileOpenChange(false)}
          type="button"
        >
          <CloseIcon />
        </button>
      ) : null}
      <ul className="application-rail__items">
        {items.map((item) => {
          const label = udwPrimaryNavLabelV1(locale, item.key);
          return (
            <li key={item.key}>
              <NavLink
                className={({ isActive }) =>
                  isActive ? 'application-rail__link is-active' : 'application-rail__link'
                }
                end
                title={label}
                to={`/${locale}/${item.path}`}
              >
                <RailIcon itemKey={item.key} />
                <span className="application-rail__label">{label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
