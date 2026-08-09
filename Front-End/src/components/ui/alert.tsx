import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { ApiError } from '@/api/errors';

/*
 * Inline messages.
 *
 * Colour is never the only signal — every variant's message says in words what it is,
 * because roughly one in twelve men cannot separate the red from the green, and this
 * interface is used under pressure.
 */

export type AlertTone = 'error' | 'success' | 'info';

const TONES: Record<AlertTone, string> = {
  error: 'border-danger-500 bg-danger-50 text-danger-700',
  success: 'border-success-500 bg-success-50 text-success-700',
  info: 'border-info-500 bg-info-50 text-info-700',
};

/*
 * `role` differs by tone on purpose. "alert" interrupts a screen reader immediately,
 * which is right for a failure the user must act on and wrong for a confirmation —
 * "status" queues politely instead.
 */
const ROLES: Record<AlertTone, 'alert' | 'status' | undefined> = {
  error: 'alert',
  success: 'status',
  info: undefined,
};

export interface AlertProps {
  tone: AlertTone;
  children: ReactNode;
  className?: string;
}

export function Alert({ tone, children, className }: AlertProps) {
  return (
    <div className={cn('rounded-md border p-3 text-sm', TONES[tone], className)} role={ROLES[tone]}>
      {children}
    </div>
  );
}

export interface ErrorAlertProps {
  error: ApiError;
  /** Extra guidance for a specific code, e.g. "ask for a new invitation". */
  children?: ReactNode;
}

/**
 * An ApiError, rendered whole.
 *
 * The requestId is shown because it is the only thing that lets support find the exact
 * log line without the user having to describe what they were doing — which, on this
 * system, often means describing someone's immigration status over the phone.
 */
export function ErrorAlert({ error, children }: ErrorAlertProps) {
  return (
    <Alert tone="error">
      {error.message}
      {children && <span className="mt-1 block">{children}</span>}
      {error.requestId && (
        <span className="mt-1 block font-mono text-xs opacity-80">
          Reference: {error.requestId}
        </span>
      )}
    </Alert>
  );
}
