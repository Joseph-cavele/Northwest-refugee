'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, toApiError } from '@/api/errors';

/*
 * Submission state for a form: in-flight flag, a top-level error, and the server's
 * field-keyed errors.
 *
 * Every form in this app needs the same three, and every one of them needs the same
 * rule about which is which: when the server names fields, those go under the inputs
 * and the banner stays empty — otherwise the same complaint is shown twice, once in a
 * place the user cannot act on.
 */

export interface SubmitState {
  busy: boolean;
  /** Set only when the failure is NOT field-specific. */
  error: ApiError | null;
  /** Field name → message, straight from the server's `details`. */
  fieldErrors: Record<string, string>;
}

export interface UseSubmitResult<TArgs extends unknown[]> extends SubmitState {
  submit: (...args: TArgs) => Promise<void>;
  /** Drop one field's error — call it when that input changes. */
  clearFieldError: (name: string) => void;
  reset: () => void;
}

export function useSubmit<TArgs extends unknown[], TResult>(
  action: (...args: TArgs) => Promise<TResult>,
  options: { onSuccess?: (result: TResult) => void } = {}
): UseSubmitResult<TArgs> {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /*
   * Held in refs so `submit` keeps a stable identity across renders. Callers pass inline
   * arrows, which are new objects every time — as dependencies they would make `submit`
   * new every render too, and any effect or memo downstream would re-run forever.
   */
  const actionRef = useRef(action);
  const onSuccessRef = useRef(options.onSuccess);

  /*
   * Synced in an effect, not assigned during render.
   *
   * Writing to a ref while rendering is a side effect in what is meant to be a pure
   * function — under StrictMode and concurrent rendering a render can be thrown away,
   * and the write would survive it. No dependency array on purpose: this must run after
   * every commit to keep the latest closures. `submit` is only ever called from an
   * event handler, which is always after commit, so it never sees a stale value.
   */
  useEffect(() => {
    actionRef.current = action;
    onSuccessRef.current = options.onSuccess;
  });

  const submit = useCallback(async (...args: TArgs) => {
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const result = await actionRef.current(...args);
      onSuccessRef.current?.(result);
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.hasFieldErrors) {
        setFieldErrors(apiError.details);
      } else {
        setError(apiError);
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const clearFieldError = useCallback((name: string) => {
    setFieldErrors((prev) => {
      // Returning the same object when there is nothing to clear avoids a re-render on
      // every keystroke in a field that was never in error.
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setFieldErrors({});
  }, []);

  return { submit, busy, error, fieldErrors, clearFieldError, reset };
}
