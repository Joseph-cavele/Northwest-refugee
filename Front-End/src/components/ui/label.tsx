import type { LabelHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * A form label.
 *
 * Always a real <label htmlFor>, never a styled <span> or placeholder text. Placeholder
 * text disappears on the first keystroke, so anyone checking their work, returning to a
 * half-filled form, or using a screen reader is left with an unlabelled box — and these
 * forms are filled in by people whose first language is often not English.
 */

export interface LabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /**
   * Appends "(optional)" rather than marking everything else required.
   * On a form where most fields are mandatory, flagging the exceptions is less visual
   * noise than an asterisk on every row.
   */
  optional?: boolean;
  children: ReactNode;
}

export function Label({ optional, className, children, ...rest }: LabelProps) {
  return (
    <label className={cn('text-xs font-medium text-muted', className)} {...rest}>
      {children}
      {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
    </label>
  );
}
