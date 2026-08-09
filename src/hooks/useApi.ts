'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, toApiError } from '@/api/errors';

/*
 * The read-side counterpart to useSubmit: fetch on mount, and expose the three states a
 * screen has to render — loading, failed, loaded.
 *
 * `loading` is DERIVED, never assigned. Setting a flag at the top of the effect is the
 * obvious way to write this and it is the one react-hooks/set-state-in-effect refuses:
 * a synchronous setState in an effect body schedules a second render before the browser
 * has painted the first. "Nothing has arrived yet" is already fully described by the
 * state we hold, so the flag was redundant as well as costly.
 *
 * The contract that falls out of that, stated plainly:
 *
 *   loading  — there is nothing to show yet: the first request, or one after reload().
 *   data     — SURVIVES a deps change. When `deps` move, the previous response stays on
 *              screen until the next one lands (stale-while-revalidate), because
 *              blanking a populated table to a spinner on every filter change is worse
 *              than briefly showing the row count the user just moved away from.
 *   reload() — clears both, so the screen returns to `loading`. It is an event handler,
 *              which is exactly where a setState of this kind belongs.
 */

export interface UseApiResult<T> {
  data: T | null;
  /** True when there is nothing to render yet — not merely "a request is in flight". */
  loading: boolean;
  error: ApiError | null;
  /** Re-run the request from scratch — for a retry button, or after a mutation elsewhere. */
  reload: () => void;
}

interface Settled<T> {
  data: T | null;
  error: ApiError | null;
}

/**
 * @param fetcher receives an AbortSignal; pass it through to the api call.
 * @param deps    re-fetch when these change. Same contract as useEffect's array.
 */
export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[] = []
): UseApiResult<T> {
  const [settled, setSettled] = useState<Settled<T>>({ data: null, error: null });
  const [attempt, setAttempt] = useState(0);

  /*
   * Held in a ref for the same reason useSubmit does it: callers pass an inline arrow,
   * which is a new function every render. As a dependency it would re-fetch forever.
   * `deps` is what decides when to re-run, exactly as the caller declared it.
   */
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    const controller = new AbortController();

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        // One atomic transition: a response can never be on screen beside the error from
        // the request it replaced.
        setSettled({ data: result, error: null });
      })
      .catch((err: unknown) => {
        /*
         * An abort is this component unmounting or its deps changing — not a failure.
         * Rendering "something went wrong" over a view the user has already left is
         * noise, and on a re-fetch it would replace good data with an error.
         */
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSettled({ data: null, error: toApiError(err) });
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, ...deps]);

  const reload = useCallback(() => {
    setSettled({ data: null, error: null });
    setAttempt((n) => n + 1);
  }, []);

  return {
    data: settled.data,
    error: settled.error,
    loading: settled.data === null && settled.error === null,
    reload,
  };
}

export default useApi;
