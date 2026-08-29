'use client';

import Image from 'next/image';
import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';

/*
 * An image that widens and un-zooms as it scrolls into view.
 *
 * FOUR DELIBERATE DIFFERENCES FROM THE SOURCE THIS WAS COPIED FROM.
 *
 * 1. `motion/react`, NOT `framer-motion`. Same library — renamed at v11, and `framer-motion`
 *    is now the legacy alias. Installing both names ships two copies of the same engine.
 *
 * 2. REDUCED MOTION IS HONOURED, and here that is not a courtesy. The whole effect is a
 *    scroll-coupled scale on a full-width image, which is precisely the class of movement
 *    that provokes nausea in people with vestibular disorders. Under the preference the
 *    component renders at its FINAL state — full width, unzoomed, final radius — so nothing
 *    is missing and nothing moves.
 *
 * 3. `quality` defaults to 85, not 100. At 100 next/image barely compresses; on a photograph
 *    that is often two to three times the bytes for a difference nobody can see, and this
 *    site is read on metered mobile data.
 *
 * 4. Hooks are called UNCONDITIONALLY and the reduced-motion check is applied to the style
 *    object, not wrapped around the hooks. Branching before a hook is how a component breaks
 *    the moment the preference changes mid-session.
 *
 * WHERE THIS WORKS, AND WHERE IT DOES NOT. The default offset `["start end", "start start"]`
 * measures from "the element's top touches the bottom of the viewport" to "the element's top
 * touches the top". An element ALREADY ON SCREEN AT PAGE LOAD is past both, so progress pins
 * at 1 and nothing animates — which makes this a below-the-fold component. On a hero it is
 * inert. See the note where it is mounted.
 */

export interface ScrollRevealImageProps {
  src: string;
  /** What the picture shows. Read aloud, so never "hero image". */
  alt: string;
  quality?: number;
  priority?: boolean;

  height?: string;
  fromWidth?: string;
  toWidth?: string;
  fromRadius?: string;
  toRadius?: string;
  /** Scroll progress (0–1) at which the corner radius starts moving. */
  radiusStart?: number;

  /** The inner layer is wider than the frame, which is what gives the zoom room to move. */
  innerWidth?: string;
  fromScale?: number;
  toScale?: number;

  stiffness?: number;
  damping?: number;

  scrollOffset?: NonNullable<Parameters<typeof useScroll>[0]>['offset'];
  /** A scrollable ancestor. Defaults to the viewport. */
  container?: React.RefObject<HTMLElement | null>;

  className?: string;
  imageClassName?: string;
}

export function ScrollRevealImage({
  src,
  alt,
  quality = 85,
  priority = false,
  height = '80vh',
  fromWidth = '40vw',
  toWidth = '95vw',
  fromRadius = '0px',
  toRadius = '22px',
  radiusStart = 0.5,
  innerWidth = '95vw',
  fromScale = 1.6,
  toScale = 1,
  stiffness = 120,
  damping = 80,
  scrollOffset = ['start end', 'start start'] as const,
  container,
  className,
  imageClassName,
}: ScrollRevealImageProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: containerRef,
    container,
    offset: scrollOffset,
  });

  const width = useTransform(scrollYProgress, [0, 1], [fromWidth, toWidth]);
  const scale = useTransform(scrollYProgress, [0, 1], [fromScale, toScale]);
  const radius = useTransform(scrollYProgress, [radiusStart, 1], [fromRadius, toRadius]);

  const smoothWidth = useSpring(width, { stiffness, damping });
  const smoothScale = useSpring(scale, { stiffness, damping });
  const smoothRadius = useSpring(radius, { stiffness, damping });

  return (
    <motion.div
      ref={containerRef}
      className={className}
      style={{
        position: 'relative',
        height,
        overflow: 'hidden',
        margin: '0 auto',
        // The finished state is the reduced-motion state: full width, final radius.
        width: still ? toWidth : smoothWidth,
        borderRadius: still ? toRadius : smoothRadius,
      }}
    >
      <motion.div
        style={{
          position: 'absolute',
          left: '50%',
          x: '-50%',
          width: innerWidth,
          height: '100%',
          originX: 0.5,
          originY: 0.5,
          scale: still ? toScale : smoothScale,
        }}
      >
        <Image
          src={src}
          alt={alt}
          fill
          quality={quality}
          priority={priority}
          sizes="100vw"
          className={`object-cover${imageClassName ? ` ${imageClassName}` : ''}`}
        />
      </motion.div>
    </motion.div>
  );
}

export default ScrollRevealImage;
