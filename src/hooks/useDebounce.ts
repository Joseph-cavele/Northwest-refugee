'use client';

import { useEffect, useState } from 'react';

/**
 * The value, once it has stopped changing for `delay` milliseconds.
 *
 * For anything that fires a request per keystroke. Typing a beneficiary's name is eight
 * requests the server has to scope and text-index, seven of which are already stale by the
 * time they land — and on a hotspot in Rustenburg the last one is not necessarily the last
 * to arrive, so the results can settle on a prefix of what was typed.
 *
 * The timer is cleared on every change, so only a pause emits.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return settled;
}

export default useDebounce;
