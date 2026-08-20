import type { SVGProps } from 'react';

type IconProperties = Omit<SVGProps<SVGSVGElement>, 'children'>;

const baseProperties = {
  'aria-hidden': true,
  fill: 'none',
  height: 20,
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  strokeWidth: 1.8,
  viewBox: '0 0 24 24',
  width: 20,
} as const;

export function BellIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </svg>
  );
}

export function MenuIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function ChevronLeftIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}

export function ChevronRightIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function SearchIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}

export function XIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function SettingsIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" />
      <path d="m19.4 15 .1.1a1.9 1.9 0 0 1-2.7 2.7l-.1-.1a1.9 1.9 0 0 0-3.2 1.3v.2a1.9 1.9 0 0 1-3.8 0V19a1.9 1.9 0 0 0-3.2-1.3l-.1.1a1.9 1.9 0 0 1-2.7-2.7l.1-.1A1.9 1.9 0 0 0 2.5 12a1.9 1.9 0 0 1 0-3.8h.2A1.9 1.9 0 0 0 4 5l-.1-.1a1.9 1.9 0 0 1 2.7-2.7l.1.1A1.9 1.9 0 0 0 10 1.5h.2a1.9 1.9 0 0 1 3.8 0v.2A1.9 1.9 0 0 0 17.2 3l.1-.1A1.9 1.9 0 0 1 20 5.6l-.1.1A1.9 1.9 0 0 0 21.2 9h.2a1.9 1.9 0 0 1 0 3.8h-.2a1.9 1.9 0 0 0-1.8 2.2Z" />
    </svg>
  );
}

export function LogOutIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}

export function UserIcon(properties: IconProperties) {
  return (
    <svg {...baseProperties} {...properties}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}
