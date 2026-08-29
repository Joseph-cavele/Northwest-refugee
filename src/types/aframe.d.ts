import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/*
 * A-Frame's custom elements, declared for JSX.
 *
 * A-Frame is HTML-first: it registers <a-scene>, <a-sphere> and the rest as custom elements
 * at import time. React will render unknown tags happily, but TypeScript will not accept
 * them without a declaration, and every attribute is a string — `position="0 1.6 0"`, not an
 * object — because A-Frame parses them itself.
 *
 * Kept narrow on purpose: only the primitives actually used. A blanket `[key: string]: any`
 * would silence the checker everywhere and hide a typo in a tag name, which in A-Frame fails
 * as nothing rendering rather than as an error.
 */

// The `declare module 'aframe'` that pairs with this lives in aframe-module.d.ts, which
// has no imports on purpose — see the note there.

type AFrameElement = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> &
  Record<string, unknown>;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'a-scene': AFrameElement;
      'a-entity': AFrameElement;
      'a-sphere': AFrameElement;
      'a-torus': AFrameElement;
      'a-camera': AFrameElement;
    }
  }
}
