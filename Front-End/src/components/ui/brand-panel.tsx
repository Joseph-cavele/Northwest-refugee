import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Logo } from './logo';

/*
 * The dark half of a split auth screen.
 *
 * SIGNATURE ELEMENT. The mark is a house — a roof over four people — so this panel is
 * cut to a gable rather than left as a rectangle: the form literally sits under a roof.
 * It is the one bold move on these screens, which is why everything around it is quiet.
 *
 * The apex is shallow (a 9% rise) on purpose. A steep pitch turns the panel into a
 * decorative arrow and eats the space the logo needs; this reads as architecture at a
 * glance and gets out of the way.
 *
 * `clip-path` is ~99% supported. Where it is not, the panel stays a rectangle and
 * nothing else changes — the layout does not depend on the shape.
 */

/** The gable. Apex centred, eaves at 9% down each side. */
const GABLE = 'polygon(0 9%, 50% 0, 100% 9%, 100% 100%, 0 100%)';

export interface BrandPanelProps {
  /** Small caps line above the heading — says what this screen is. */
  eyebrow?: string;
  heading: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}

export function BrandPanel({ eyebrow, heading, children, footer, className }: BrandPanelProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col justify-center gap-6 bg-ink-950 text-white',
        // Top padding clears the eaves so nothing sits in the clipped corners.
        'px-8 pt-16 pb-10 lg:px-10 lg:pt-20 lg:pb-12',
        className
      )}
      style={{ clipPath: GABLE }}
    >
      {/*
        * The four figures from the mark, spanning the full width under the roof —
        * the structural claim of the logo restated: different people, one roof.
        * Positioned rather than inline so it reads as part of the building.
        */}
      <div aria-hidden="true" className="brand-rule absolute inset-x-0 bottom-0 h-1.5" />

      <div className="flex flex-col gap-5">
        {/*
          * Not decorative: on the invitation screen this is the only place the
          * organisation is named, and someone arriving from an email needs to know
          * whose system is asking them for a password.
          */}
        <Logo size={104} className="drop-shadow-[0_0_24px_rgba(255,255,255,0.14)]" />

        <div>
          {eyebrow && (
            <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/55 uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-2 text-3xl leading-[1.1] font-semibold tracking-[-0.02em]">
            {heading}
          </h1>
          {children && (
            <p className="mt-3 max-w-[32ch] text-sm leading-relaxed text-white/70">{children}</p>
          )}
        </div>

        {footer}
      </div>
    </div>
  );
}
