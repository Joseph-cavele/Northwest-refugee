'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

/*
 * Fullscreen, from the reference layout.
 *
 * Kept — unlike the dark-mode switch beside it in that template — because it does something
 * here. The register and the approval queue are wide tables, and a front-desk machine gains
 * a browser chrome's worth of rows from this.
 *
 * State is READ FROM THE DOM, never assumed from the click: Escape and F11 both exit
 * without going through this button, and a toggle whose icon disagrees with the window is
 * worse than no toggle.
 *
 * useSyncExternalStore rather than useState + useEffect. The fullscreen flag is external
 * browser state, which is precisely what this hook exists to read — and it avoids the
 * synchronous setState inside an effect that the first version of this file had, where a
 * capability check scheduled a second render before the browser had painted the first.
 */

/** Capability never changes for the life of the page, so there is nothing to subscribe to. */
const noopSubscribe = () => () => {};

export function FullscreenToggle({ className }: { className?: string }) {
  const subscribe = useCallback((onChange: () => void) => {
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const isFullscreen = useSyncExternalStore(
    subscribe,
    () => Boolean(document.fullscreenElement),
    // On the server there is no window to be full.
    () => false
  );

  /*
   * iPhone Safari has no Fullscreen API at all. The server snapshot is `false`, so the
   * button is absent in the HTML and appears on hydration where it works — which is the
   * right way round: better to arrive late than to be there and do nothing.
   */
  const supported = useSyncExternalStore(
    noopSubscribe,
    () => typeof document !== 'undefined' && Boolean(document.documentElement.requestFullscreen),
    () => false
  );

  if (!supported) return null;

  async function toggle() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch {
      // Refused by the browser — some policies block it outside a trusted gesture. The
      // subscription keeps the icon honest either way, so there is nothing to report.
    }
  }

  const Icon = isFullscreen ? Minimize2 : Maximize2;

  return (
    <button
      type="button"
      onClick={toggle}
      className={className}
      // The label names what the next press does, not the current state.
      aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
    >
      <Icon className="size-5" aria-hidden="true" />
    </button>
  );
}

export default FullscreenToggle;
