import type { HTMLAttributes, ReactNode } from 'react';

export type StatusKindV1 = 'danger' | 'info' | 'success' | 'warning';

export interface StatusPropsV1 extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  readonly children: ReactNode;
  readonly kind: StatusKindV1;
}

const icons: Readonly<Record<StatusKindV1, string>> = Object.freeze({
  danger: '×',
  info: 'i',
  success: '✓',
  warning: '!',
});

export function Status({ children, className, kind, ...properties }: StatusPropsV1) {
  const classes = ['db-status', className].filter(Boolean).join(' ');
  return (
    <span {...properties} aria-live="polite" className={classes} data-status={kind} role="status">
      <span aria-hidden="true" className="db-status__icon">
        {icons[kind]}
      </span>
      <span>{children}</span>
    </span>
  );
}
