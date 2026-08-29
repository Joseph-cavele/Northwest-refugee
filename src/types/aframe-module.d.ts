/*
 * A-Frame has no types, and no @types/aframe exists for v1.8.
 *
 * THIS FILE DELIBERATELY HAS NO IMPORTS. A .d.ts containing a top-level import is a MODULE,
 * and inside a module `declare module 'aframe'` means "augment the existing declaration for
 * aframe" — which fails silently when there is no existing declaration to augment. Without
 * imports the file is a global script, and the same line becomes the ambient declaration it
 * was meant to be.
 *
 * That is why this is separate from aframe.d.ts, which declares the JSX elements and does
 * need to import React's types. Merging the two would break this one.
 *
 * Declared bare rather than typed: the import exists only for its side effect — it registers
 * <a-scene> and the rest as custom elements — so nothing calls into it and there is no API
 * worth inventing.
 */

declare module 'aframe';
