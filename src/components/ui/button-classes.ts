import { cn } from '@/lib/utils';

/*
 * The brand's pill button, as classes.
 *
 * SEPARATE FROM button.tsx BECAUSE THAT FILE IS `'use client'`. A client module's exports are
 * all client references — calling one from a server component fails at prerender with
 * "Attempted to call buttonClasses() from the server". This file carries no directive, so a
 * server-rendered <Link> can wear the button's look and the interactive <Button> can import
 * the same strings. One recipe, both sides of the boundary.
 *
 * A call to action that navigates must be an anchor: middle-click, open-in-new-tab and "copy
 * link address" all die on a <button>, and wrapping one in the other nests interactive
 * elements. That is why the look has to be available without the component.
 */

export type ButtonVariant = 'primary' | 'ghost' | 'subtle';

export const BUTTON_BASE = cn(
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

export const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  // White on brand-500 is 7.3:1 — AAA. The brand blue is the only logo colour that
  // carries white text safely; orange is 2.6:1 and must never be a button with a label.
  primary: 'border-brand-500 bg-brand-500 text-white hover:border-brand-700 hover:bg-brand-700',
  // For the dark panels: a white outline on the logo's black.
  ghost: 'border-white/70 bg-transparent text-white hover:bg-white/15',
  subtle: 'border-line bg-surface text-body hover:border-line-strong hover:bg-ink-50',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  options?: { fullWidth?: boolean; className?: string }
) {
  return cn(
    BUTTON_BASE,
    BUTTON_VARIANTS[variant],
    options?.fullWidth && 'w-full',
    options?.className
  );
}
