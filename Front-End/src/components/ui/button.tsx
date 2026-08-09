import { Loader2 } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The pill button from the brand.
 *
 * Variants are a plain lookup rather than class-variance-authority — there are three of
 * them and cva would be a dependency to express a Record. Reach for cva when the matrix
 * grows a second axis.
 */

export type ButtonVariant = 'primary' | 'ghost' | 'subtle';

const BASE = cn(
  'inline-flex items-center justify-center gap-2 rounded-full px-8 py-3',
  'text-xs font-semibold tracking-[0.09em] uppercase',
  'border transition-colors active:translate-y-px',
  /*
   * An explicit grey, not `opacity-60` on the variant colour. Faded blue on white reads
   * as lavender — it looks like a rendering fault rather than a disabled control, and
   * the label drops below AA while still being the most prominent thing on the form.
   */
  'disabled:pointer-events-none disabled:border-line disabled:bg-ink-100 disabled:text-ink-400'
);

const VARIANTS: Record<ButtonVariant, string> = {
  // White on brand-500 is 7.3:1 — AAA. The brand blue is the only logo colour that
  // carries white text safely; orange is 2.6:1 and must never be a button with a label.
  primary: 'border-brand-500 bg-brand-500 text-white hover:border-brand-700 hover:bg-brand-700',
  // For the dark panels: a white outline on the logo's black.
  ghost: 'border-white/70 bg-transparent text-white hover:bg-white/15',
  subtle: 'border-line bg-surface text-body hover:border-line-strong hover:bg-ink-50',
};

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
      className={cn(BASE, VARIANTS[variant], fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
