import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';

export type ButtonVariantV1 = 'danger' | 'primary' | 'secondary';

export interface ButtonPropsV1 extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariantV1;
}

export const Button = forwardRef<HTMLButtonElement, ButtonPropsV1>(function Button(
  { className, variant = 'primary', ...properties },
  reference,
) {
  const classes = ['db-button', `db-button--${variant}`, className].filter(Boolean).join(' ');
  return <button {...properties} className={classes} data-variant={variant} ref={reference} />;
});
