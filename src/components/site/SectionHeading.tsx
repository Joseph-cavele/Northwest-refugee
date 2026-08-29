import { HandHeart, Hand, Heart } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/*
 * The opener every section on this site uses: script eyebrow, large heading, a short lead.
 *
 * REUSABLE, NOT A ONE-OFF BLOCK. The reference repeats this exact lockup at the top of every
 * section on the page, and copying it five times is how five sections end up with five
 * slightly different heading sizes. One component means the rhythm of the page is a property
 * of the page rather than of whoever wrote the last section.
 *
 * THE EYEBROW IS BRAND BLUE HERE, NOT GOLD — the one deliberate departure from the reference,
 * and it is not a preference. The hero's eyebrow is gold on black, which measures 14.9:1.
 * This section sits on white, where the same gold measures 1.37:1: not a marginal call, but
 * invisible. Brand blue on white is 7.3:1 and carries the same job. The rule underneath is
 * the one already written into button-classes.ts — the logo's yellow is a colour for dark
 * grounds, and text on white is never one of its uses.
 */

interface SectionHeadingProps {
  /** The script line above the title. Short — it is handwriting, not a sentence. */
  eyebrow: string;
  /**
   * A node rather than a string, so a caller can accent one word or hang the id its section
   * is labelled by on the line. Keep it to text and spans — anything with its own block
   * layout breaks the heading's own balance and clamp.
   */
  title: ReactNode;
  /** One or two lines. Anything longer belongs in the section body, not its opener. */
  lead?: string;
  /**
   * The drawn hand at the left edge, as in the reference. Off by default: it is a flourish,
   * and a flourish on every section is wallpaper. Hidden below lg, where there is no margin
   * to put it in and it would only crowd the words.
   */
  flourish?: boolean;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  flourish = false,
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn('relative', className)}>
      {flourish && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-0 hidden -translate-y-1/2 lg:block"
        >
          <Hand
            className="size-44 -rotate-12 text-ink-200"
            strokeWidth={1}
            aria-hidden="true"
          />
          {/* The small gold heart the reference tucks into the palm. Gold as a drawn shape
              rather than as text, which is the only way it belongs on a white ground. */}
          <Heart
            className="absolute top-10 left-6 size-8 fill-gold-400 text-gold-400"
            aria-hidden="true"
          />
        </div>
      )}

      <div className="relative mx-auto max-w-3xl text-center">
        {/*
         * DESIGN.md's label-md — Inter 14px / 600 / 0.05em, upper case — and the same eyebrow
         * treatment the hero uses, so the two read as one system.
         *
         * THIS WAS A SCRIPT FACE, at 2xl-3xl, asking for `--font-script`. That variable was
         * Caveat and it no longer exists: layout.tsx defines `--font-ui` and nothing else,
         * because DESIGN.md specifies Inter "exclusively". An undefined var() does not fall
         * back to the next font in a stack — it makes the whole declaration invalid at
         * computed-value time, so this line was inheriting from <body> and rendering in the
         * browser's default serif. The colour is still the mark's blue.
         */}
        <p className="flex items-center justify-center gap-2.5 text-sm font-semibold tracking-[0.05em] text-brand-500 uppercase">
          <HandHeart className="size-6 shrink-0" aria-hidden="true" />
          {eyebrow}
        </p>

        {/*
         * `--font-heading` was Nunito and is gone for the same reason. Inter at 800 with tight
         * tracking IS DESIGN.md's display treatment — the hierarchy is carried by scale and
         * weight rather than by changing family, so this needs no separate face.
         */}
        <h2 className="mt-4 font-(family-name:--font-ui) text-[clamp(2rem,5vw,3.5rem)] leading-[1.08] font-extrabold tracking-[-0.02em] text-balance text-ink-950">
          {title}
        </h2>

        {lead && (
          <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-pretty text-muted sm:text-lg">
            {lead}
          </p>
        )}
      </div>
    </div>
  );
}

export default SectionHeading;
