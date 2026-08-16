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
