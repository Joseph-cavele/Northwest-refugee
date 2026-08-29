'use client';

import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { buttonClasses } from './button-classes';
import type { ButtonVariant } from './button-classes';

/*
 * The pill button from the brand.
 *
 * Variants are a plain lookup rather than class-variance-authority — there are three of
 * them and cva would be a dependency to express a Record. Reach for cva when the matrix
 * grows a second axis.
 *
 * The classes themselves live in button-classes.ts, which carries no 'use client' — a
 * server-rendered <Link> needs the same look, and it cannot call a function exported from a
 * client module. Re-exported here so importers do not have to know that.
 */

export type { ButtonVariant };
export { buttonClasses };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Shows a spinner and disables the button. Use for in-flight requests. */
  loading?: boolean;
  fullWidth?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  loading = false,
  fullWidth = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      // Defaulted rather than required: a <button> inside a <form> submits it unless
      // told otherwise, and an unlabelled type is the most common accidental submit.
      type={type}
      disabled={disabled || loading}
      // Tells assistive tech the control is working. `disabled` alone just goes quiet.
      aria-busy={loading || undefined}
      className={buttonClasses(variant, { fullWidth, className })}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
