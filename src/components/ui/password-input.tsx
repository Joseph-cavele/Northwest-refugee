'use client';

import { useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { controlClasses } from './input';

/*
 * A password box with a reveal toggle.
 *
 * Reveal, rather than a second "confirm password" field wherever one can be avoided.
 * Staff passwords here are at least ten characters, and this is filled in on a phone as
 * often as a desktop; being able to check what was typed is what stops the fifth
 * attempt locking the account (Backend caps failed logins and then locks).
 *
 * The toggle is a real <button> with an aria-label and aria-pressed, not an icon with a
 * click handler — it has to be reachable by keyboard and announce its state.
 */

export interface PasswordInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'className'> {
  className?: string;
}

export function PasswordInput({ className, disabled, ...rest }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        // Right padding clears the toggle, so a long password never runs under the icon.
        className={cn(controlClasses, 'pr-11', className)}
        disabled={disabled}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        // Hidden while disabled: revealing a field the user cannot edit is pointless,
        // and it would still be focusable.
        className={cn(
          'absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md',
          'text-subtle transition-colors hover:text-body',
          disabled && 'pointer-events-none opacity-0'
        )}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        tabIndex={disabled ? -1 : 0}
      >
        {visible ? (
          <EyeOff className="size-4" aria-hidden="true" />
        ) : (
          <Eye className="size-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
