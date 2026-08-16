import { formatMessageV1 } from '@databreeze/i18n/v1';
import { useEffect } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { getFeatureRegistration } from '../app/feature-registry.ts';
import { appMessage } from '../app/messages.ts';
import type { NavigationItem } from '../app/navigation.ts';
import {
  udwPrimaryNavLabelV1,
  type UdwPrimaryNavItemV1,
} from '../app/unified-primary-navigation.ts';
import { DATABREEZE_MARK_SRC } from '../app/brand-assets.ts';
import {
  BellIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MenuIcon,
  SearchIcon,
  XIcon,
} from './icons.tsx';

export interface ApplicationRailProperties {
  readonly collapsed?: boolean;
  readonly isMobile?: boolean;
  readonly items: readonly UdwPrimaryNavItemV1[];
  readonly locale: 'en' | 'vi-VN';
  readonly mobileOpen: boolean;
  readonly onCollapsedChange?: (collapsed: boolean) => void;
  readonly onMobileOpenChange: (open: boolean) => void;
  readonly secondaryItems?: readonly NavigationItem[];
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

function SecondaryIcon({ itemKey }: { readonly itemKey: NavigationItem['key'] }) {
  if (itemKey === 'inbox') return <BellIcon />;
  if (itemKey === 'reviews') return <SearchIcon />;
  return <MenuIcon />;
}

function secondaryLabel(locale: 'en' | 'vi-VN', item: NavigationItem): string {
  const registration = getFeatureRegistration(item.key);
  return registration.messageKey === undefined
    ? item.key
    : formatMessageV1(locale, registration.messageKey);
}

/** WEB-002/013/014/022: compact, build-time registered primary navigation. */
export function ApplicationRail({
  collapsed = false,
  isMobile = false,
  items,
  locale,
  mobileOpen,
  onCollapsedChange = () => undefined,
  onMobileOpenChange,
  secondaryItems = [],
}: ApplicationRailProperties) {
  useEffect(() => {
    if (!isMobile || !mobileOpen) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileOpenChange(false);
    };
    globalThis.addEventListener('keydown', closeOnEscape);
    return () => globalThis.removeEventListener('keydown', closeOnEscape);
  }, [isMobile, mobileOpen, onMobileOpenChange]);

  const effectivelyCollapsed = isMobile ? false : collapsed;
  const collapseLabel =
    locale === 'vi-VN'
      ? effectivelyCollapsed
        ? 'Mở rộng thanh bên'
        : 'Thu gọn thanh bên'
      : effectivelyCollapsed
        ? 'Expand sidebar'
        : 'Collapse sidebar';
  const workspaceLabel = locale === 'vi-VN' ? 'Không gian làm việc' : 'Workspace';
  const toolsLabel = locale === 'vi-VN' ? 'Công cụ' : 'Tools';

  return (
    <nav
      aria-label={appMessage(locale, 'nav.label')}
      className={`application-rail${isMobile ? ' application-rail--mobile' : ''}${
        mobileOpen ? ' is-mobile-open' : ''
      }`}
      data-collapsed={effectivelyCollapsed}
      hidden={isMobile && !mobileOpen}
      id="primary-navigation"
    >
      <div className="application-rail__header">
        <Link
          aria-label="DataBreeze"
          className="application-rail__brand"
          to={`/${locale}/dashboards`}
        >
          <img
            alt=""
            className="application-rail__brand-icon"
            height="32"
            src={DATABREEZE_MARK_SRC}
            width="32"
          />
        </Link>
        {!isMobile ? (
          <button
            aria-expanded={!effectivelyCollapsed}
            aria-label={collapseLabel}
            className="application-rail__collapse"
            onClick={() => onCollapsedChange(!effectivelyCollapsed)}
            title={collapseLabel}
            type="button"
          >
            <span
              aria-hidden="true"
              className="application-rail__collapse-arrow"
              data-point={effectivelyCollapsed ? 'right' : 'left'}
            >
              {effectivelyCollapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
            </span>
          </button>
        ) : null}
      </div>
      {isMobile ? (
        <button
          aria-label={appMessage(locale, 'nav.close')}
          className="application-rail__mobile-close"
          onClick={() => onMobileOpenChange(false)}
          type="button"
        >
          <XIcon />
        </button>
      ) : null}
      <p className="application-rail__group-label">{workspaceLabel}</p>
      <ul
        aria-label={workspaceLabel}
        className="application-rail__items application-rail__items--primary"
      >
        {items.map((item) => {
          const label = udwPrimaryNavLabelV1(locale, item.key);
          return (
            <li key={item.key}>
              <NavLink
                className={({ isActive }) =>
                  isActive ? 'application-rail__link is-active' : 'application-rail__link'
                }
                end
                onClick={() => {
                  if (isMobile) onMobileOpenChange(false);
                }}
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
      {secondaryItems.length > 0 ? (
        <div className="application-rail__secondary">
          <p className="application-rail__group-label">{toolsLabel}</p>
          <ul
            aria-label={toolsLabel}
            className="application-rail__items application-rail__items--secondary"
          >
            {secondaryItems.map((item) => {
              const label = secondaryLabel(locale, item);
              return (
                <li key={item.key}>
                  <NavLink
                    className={({ isActive }) =>
                      isActive ? 'application-rail__link is-active' : 'application-rail__link'
                    }
                    onClick={() => {
                      if (isMobile) onMobileOpenChange(false);
                    }}
                    title={label}
                    to={`/${locale}/${item.path}`}
                  >
                    <SecondaryIcon itemKey={item.key} />
                    <span className="application-rail__label">{label}</span>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
