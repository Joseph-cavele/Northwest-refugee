'use client';

import { cn } from '@/lib/utils';

/*
 * The NWHR mark, from public/Assets/logo.png.
 *
 * The file is transparent around a black rounded square, so it sits correctly on a dark
 * panel and reads as a floating tile on a light one. It already contains the "NWHR"
 * lettering, which is why there is no separate wordmark prop — pairing the two would
 * print the name twice.
 *
 * PERFORMANCE: the source is a 1024x1024 PNG weighing ~1.4 MB. That is far too heavy for
 * a login screen reached over a shared phone hotspot, and it is the largest thing on the
 * page by two orders of magnitude. Export a 128px and a 256px WebP and swap the src.
 * Until then `width`/`height` are always set so the layout does not jump while it loads,
 * and `fetchPriority="high"` is deliberately NOT used — the form matters more.
 */

const SRC = '/Assets/logo.png';

export interface LogoProps {
  /** Rendered size in pixels. Also sets width/height so nothing reflows on load. */
  size?: number;
  /**
   * Pass `true` where the organisation's name is already written next to the mark.
   * A screen reader announcing "North West House of Refuge" beside the words "North
   * West House of Refuge" is noise, so it becomes alt="" and leaves the a11y tree.
   */
  decorative?: boolean;
  className?: string;
}

export function Logo({ size = 48, decorative = false, className }: LogoProps) {
  return (
    <img
      src={SRC}
      width={size}
      height={size}
      alt={decorative ? '' : 'North West House of Refuge'}
      aria-hidden={decorative || undefined}
      // Eager rather than lazy: on every screen that uses it, the mark is above the
      // fold, and lazy-loading something already in the viewport only delays it.
      loading="eager"
      decoding="async"
      className={cn('select-none object-contain', className)}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * The four figures from the mark, as a rule. Gives a small logo enough brand presence
 * to anchor a panel without scaling the image up.
 */
export function BrandRule({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('brand-rule h-1 w-16 rounded-full', className)} />;
}

export default Logo;
