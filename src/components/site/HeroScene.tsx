'use client';

import { useEffect, useState } from 'react';

/*
 * A small WebXR object in the hero, built with A-Frame.
 *
 * THE HONEST FRAMING FIRST. A-Frame is 560 KB minified on the wire — three.js is inside it —
 * against a page whose entire HTML is about 34 KB. It is, by a wide margin, the most
 * expensive thing here, and it carries no information: the six doors in the assistant are
 * what help somebody find a service. It is an atmosphere, and it is loaded on those terms.
 *
 * So it loads on a budget, and refuses itself whenever the cost is likely to land on
 * somebody who cannot afford it:
 *
 *   SAVE-DATA        the browser says the user has asked for less data. Nothing loads.
 *   2G / SLOW-2G     effectiveType says the connection cannot carry it. Nothing loads.
 *   REDUCED MOTION   the object's only content is its movement, so a still version would be
 *                    560 KB for a picture. Nothing loads.
 *
 * In each case the hero is unchanged and nothing is missing — there is no empty box and no
 * spinner, because a decorative object that failed to arrive should be indistinguishable
 * from one that was never there.
 *
 * It also loads AFTER first paint, never during it. The headline, the assistant and the six
 * options are server-rendered and must not wait behind a 3D engine.
 *
 * THREE A-FRAME DEFAULTS ARE TURNED OFF, and each would be a real problem on this page:
 *   vr-mode-ui                      an unexplained goggles button on a page about permits
 *   look-controls / wasd-controls   the scene would swing when somebody drags past it
 *   device-orientation-permission   an iOS permission prompt nobody asked for, on a page
 *                                   read by people with good reason to distrust prompts
 */

/** The logo's four figures, as four colours. */
const FIGURES = [
  { colour: '#344CB7', position: '0.85 0 0' },
  { colour: '#F28529', position: '0 0 0.85' },
  { colour: '#FDD731', position: '-0.85 0 0' },
  { colour: '#DB1B1D', position: '0 0 -0.85' },
];

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** Whether it is fair to spend half a megabyte on decoration for this visitor. */
function shouldLoad(): boolean {
  if (typeof window === 'undefined') return false;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (connection?.saveData) return false;
  if (connection?.effectiveType && /(^|-)2g$/.test(connection.effectiveType)) return false;

  return true;
}

export function HeroScene() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!shouldLoad()) return;

    let cancelled = false;

    /*
     * requestIdleCallback, not an immediate import: this waits for the browser to have
     * nothing better to do, so the engine cannot compete with the assistant becoming
     * interactive. Safari has no idle callback, hence the timeout fallback.
     */
    const start = () => {
      import('aframe')
        .then(() => {
          if (!cancelled) setReady(true);
        })
        .catch(() => {
          // A failed import leaves the hero exactly as it was. Nothing to report to
          // somebody looking for help with a permit.
        });
    };

    // `typeof … === 'function'` rather than a truthiness check: TypeScript types
    // requestIdleCallback as always present, so `if (idle)` is a condition it can prove is
    // always true — and Safari is the browser that actually lacks it.
    const supportsIdle = typeof window.requestIdleCallback === 'function';
    const handle = supportsIdle
      ? window.requestIdleCallback(start, { timeout: 3000 })
      : window.setTimeout(start, 1200);

    return () => {
      cancelled = true;
      if (supportsIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, []);

  // Nothing at all until it is both wanted and loaded — no placeholder, no reserved gap.
  if (!ready) return null;

  return (
    <div aria-hidden="true" className="mt-10 h-64 w-full max-w-sm">
      <a-scene
        embedded
        vr-mode-ui="enabled: false"
        device-orientation-permission-ui="enabled: false"
        renderer="alpha: true; antialias: false; colorManagement: true"
        style={{ width: '100%', height: '100%' }}
      >
        <a-camera
          position="0 1.6 0"
          look-controls="enabled: false"
          wasd-controls="enabled: false"
        />

        <a-entity light="type: ambient; intensity: 0.75" />
        <a-entity light="type: directional; intensity: 0.6" position="1 2 1" />

        {/* One slow revolution. Low segment counts: this runs on a phone that is already
            working hard, and at this size nobody can see the facets. */}
        <a-entity
          position="0 1.55 -3.2"
          animation="property: rotation; to: 0 360 0; loop: true; dur: 32000; easing: linear"
        >
          {FIGURES.map((figure) => (
            <a-sphere
              key={figure.colour}
              position={figure.position}
              radius="0.3"
              segments-width="14"
              segments-height="10"
              material={`color: ${figure.colour}; metalness: 0.1; roughness: 0.75`}
            />
          ))}

          {/* The black square the four figures sit inside, as a ring around them. */}
          <a-torus
            rotation="90 0 0"
            radius="0.85"
            radius-tubular="0.035"
            segments-radial="8"
            segments-tubular="28"
            material="color: #000000; metalness: 0.1; roughness: 0.9"
          />
        </a-entity>
      </a-scene>
    </div>
  );
}

export default HeroScene;
