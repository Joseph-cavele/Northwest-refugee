'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/*
 * The loading indicator. One definition, so every waiting state in the app looks the
 * same and a user learns it once.
 *
 * `label` always resolves to something announceable: a spinner with no accessible name
 * is a screen reader saying nothing while the page appears to have stopped.
 */

export type SpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<SpinnerSize, string> = {
  sm: 'size-4',
  md: 'size-6',
  lg: 'size-8',
};

export interface SpinnerProps {
  /** Announced to assistive technology. Name what is loading where you can. */
  label?: string;
  size?: SpinnerSize;
  /** Centres it in the viewport — for a route-level Suspense fallback. */
  full?: boolean;
  className?: string;
}

export function Spinner({ label = 'Loading', size = 'md', full = false, className }: SpinnerProps) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-center justify-center text-subtle',
        full && 'min-h-screen bg-canvas',
        className
      )}
    >
      {/* animate-spin is disabled by the reduced-motion rules in globals.css; the
          role="status" text is what carries the meaning either way. */}
      <Loader2 className={cn(SIZES[size], 'animate-spin')} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </div>
  );
}

export default Spinner;
