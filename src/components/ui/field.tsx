'use client';

import { useId } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Label } from './label';

/*
 * A labelled form control: label, control, error, hint — wired together.
 *
 * `children` is a render function rather than plain nodes so all four share one
 * generated id without the caller declaring it three times. The alternatives —
 * cloneElement, or a context per field — are both more code and fail silently the
 * moment someone nests a wrapper div around the input.
 *
 *   <Field label="Work email" error={fieldErrors.email}>
 *     {(field) => <Input {...field} type="email" value={…} onChange={…} />}
 *   </Field>
 *
 * The control's appearance comes from ./input, not from here. This file owns the
 * relationships between the parts; that one owns what they look like.
 */

/** The props a Field hands its control. Spread them onto the input. */
export interface FieldRenderProps {
  id: string;
  'aria-invalid': true | undefined;
  'aria-describedby': string | undefined;
}

export interface FieldProps {
  label: ReactNode;
  /** Server-side message for this field. Its presence is what marks the control invalid. */
  error?: string | undefined;
  /** Persistent helper text, announced alongside the field. */
  hint?: ReactNode;
  optional?: boolean;
  className?: string;
  children: (field: FieldRenderProps) => ReactNode;
}

export function Field({ label, error, hint, optional, className, children }: FieldProps) {
  const uid = useId();
  const id = `${uid}-control`;
  const errorId = `${uid}-error`;
  const hintId = `${uid}-hint`;

  // Order matters to a screen reader: the error comes before the hint, because the
  // thing blocking submission should be heard first.
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ');

  return (
    <div className={cn('flex min-w-0 flex-col gap-1', className)}>
      <Label htmlFor={id} optional={optional}>
        {label}
      </Label>

      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy || undefined,
      })}

      {error && (
        <span id={errorId} className="text-xs text-danger-700" role="alert">
          {error}
        </span>
      )}
      {hint && (
        <span id={hintId} className="text-xs text-subtle">
          {hint}
        </span>
      )}
    </div>
  );
}
