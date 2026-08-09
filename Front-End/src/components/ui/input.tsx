import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/utils';

/*
 * The three form controls, sharing one appearance.
 *
 * `controlClasses` is the single definition of what an input looks like in this app.
 * It lived inline in four different files before this; the copies had already started
 * to drift, which is how a select ends up a pixel taller than the input beside it.
 *
 * Anything needing the look without these components — a third-party widget, a
 * contenteditable — imports `controlClasses` rather than re-typing it.
 */

export const controlClasses = cn(
  'w-full rounded-md border border-transparent bg-ink-50 p-3 text-sm text-body',
  'transition-colors hover:bg-ink-100',
  'focus:border-brand-500 focus:bg-surface focus:ring-3 focus:ring-brand-100 focus:outline-none',
  'disabled:cursor-not-allowed disabled:opacity-60',
  /*
   * The invalid style keys off the aria attribute, not a separate `error` class. The
   * thing that tells assistive technology is then the same thing that turns the border
   * red, so the two can never disagree — a red box a screen reader calls valid is worse
   * than no styling at all.
   */
  'aria-[invalid=true]:border-danger-500 aria-[invalid=true]:bg-danger-50'
);

/*
 * ComponentPropsWithRef, not InputHTMLAttributes.
 *
 * React 19 passes `ref` to function components as an ordinary prop — no forwardRef — but
 * the *Attributes types do not include it, so `<Input ref={…}>` fails to typecheck while
 * working perfectly at runtime. This variant carries the ref through.
 */
export type InputProps = ComponentPropsWithRef<'input'>;

export function Input({ className, ...rest }: InputProps) {
  return <input className={cn(controlClasses, className)} {...rest} />;
}

export type TextareaProps = ComponentPropsWithRef<'textarea'>;

export function Textarea({ className, ...rest }: TextareaProps) {
  // Vertical resize only: horizontal dragging breaks the grid the field sits in.
  return <textarea className={cn(controlClasses, 'min-h-18 resize-y', className)} {...rest} />;
}

export interface SelectProps extends ComponentPropsWithRef<'select'> {
  /**
   * The empty first option. Its text carries the control's state — "Loading…" while
   * options are in flight, something else once they have failed — so a select whose
   * source never answers does not sit on "Loading…" for the life of the page.
   */
  placeholder?: string;
}

export function Select({ placeholder, className, children, ...rest }: SelectProps) {
  return (
    <select className={cn(controlClasses, className)} {...rest}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {children}
    </select>
  );
}
