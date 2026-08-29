'use client';

import { cn } from '@/lib/utils';

/*
 * The NWHR mark: a black rounded tile holding a white house — a roof over two posts —
 * sheltering five figures, four of them in the brand's four colours around a larger dark
 * one at the centre.
 *
 * The file is transparent around that tile (verified: alpha is 0 at every corner), so it
 * sits correctly on a dark panel and reads as a floating tile on a light one. It already
 * contains the "NWHR" lettering, which is why there is no separate wordmark prop — pairing
 * the two would print the name twice.
 *
 * PERFORMANCE, now fixed. The source is 1024x1024 and weighs 1.4 MB, which on every page of
 * a site read over a shared phone hotspot in Rustenburg made the logo comfortably the
 * largest thing on the wire — bigger than the rest of the page put together. Three resized
 * copies now sit beside it and the browser picks one from `srcSet`:
 *
 *     logo-128.png     8.8 KB
 *     logo-256.png    30.2 KB
 *     logo-512.png   128.8 KB
 *     logo.png      1397.2 KB   ← the master. NOT served; kept for re-export.
 *
 * The largest rendering anywhere is 104px (brand-panel.tsx), so 512 covers even a 3x screen
 * with room to spare. `src` points at the 256 rather than the master, so a client that
 * somehow ignores srcSet still gets 30 KB and not 1.4 MB.
 *
 * REGENERATING after the logo is redrawn: resize from logo.png with alpha preserved (a
 * naive resize onto a white canvas will fringe the black tile), and re-sample the palette
 * in globals.css from the master rather than from these.
 *
 * `width`/`height` are always set so the layout does not jump while it loads, and
 * `fetchPriority="high"` is deliberately NOT used — on the auth screens the form matters more.
 */

const SRC = '/images/logo-256.png';
const SRC_SET = '/images/logo-128.png 128w, /images/logo-256.png 256w, /images/logo-512.png 512w';

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
      srcSet={SRC_SET}
      // The rendered CSS width. This is what lets the browser multiply by the device pixel
      // ratio and choose the right entry from srcSet — without it, it assumes 100vw and
      // fetches the largest every time.
      sizes={`${size}px`}
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
