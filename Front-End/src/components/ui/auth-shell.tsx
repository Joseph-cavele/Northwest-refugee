import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The split card the single-purpose auth screens sit in: gabled brand panel on one
 * side, form on the other.
 *
 * Shared by accept-invite, reset-password, forgot-password and the MFA challenge, so
 * arriving from an email lands on something that matches the screen you were on a
 * moment ago. The sliding sign-in switch has its own shell — it needs an overlay track
 * these do not.
 */
export function AuthShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-linear-to-br from-ink-100 to-ink-200 px-4 py-8">
      <div
        className={cn(
          'grid w-full max-w-4xl overflow-hidden rounded-xl bg-surface shadow-2xl',
          // The brand panel is capped so the form keeps the room it needs; below `lg`
          // the two stack and the roof sits above the fields.
          'lg:grid-cols-[minmax(0,22rem)_1fr]',
          className
        )}
      >
        {children}
      </div>
    </main>
  );
}

export default AuthShell;
