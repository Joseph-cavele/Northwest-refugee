'use client';

import { useState } from 'react';
import type { ReactNode, SubmitEvent } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from './button';
import { ErrorAlert } from './alert';
import { Field } from './field';
import { PasswordInput } from './password-input';
import { useSubmit } from '@/hooks/useSubmit';
import { cn } from '@/lib/utils';

/*
 * Choose a password, twice, against the server's rules.
 *
 * Shared by the two screens that set one: accepting an invitation and completing a
 * password reset. They differ only in which endpoint they call and what happens
 * afterwards, so both are props — the fields, the live rule list, the confirmation
 * check and the error handling are identical and belong in one place.
 */

/**
 * Mirrors `strongPassword` in Backend/src/modules/auth/auth.schema.js, rule for rule.
 *
 * Duplicated deliberately. The server is the authority and rejects anything failing
 * these — but someone choosing a password they cannot see needs the rules before they
 * submit, not a 422 afterwards. If that schema changes, change this with it.
 */
export const PASSWORD_RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: 'At least 10 characters', test: (v) => v.length >= 10 },
  { label: 'Contains a letter', test: (v) => /[A-Za-z]/.test(v) },
  { label: 'Contains a number', test: (v) => /[0-9]/.test(v) },
  { label: 'No more than 128 characters', test: (v) => v.length <= 128 },
];

export function isStrongPassword(value: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(value));
}

function RuleList({ password, id }: { password: string; id: string }) {
  return (
    /*
     * aria-live is deliberately absent. Announcing four items on every keystroke makes
     * the field unusable with a screen reader; the list is tied to the input through
     * aria-describedby instead, so it is read on focus and available on demand.
     */
    <ul id={id} className="flex flex-col gap-1">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li
            key={rule.label}
            className={cn(
              'flex items-center gap-2 text-xs',
              met ? 'text-success-700' : 'text-subtle'
            )}
          >
            {met ? (
              <Check className="size-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <X className="size-3.5 shrink-0 text-ink-400" aria-hidden="true" />
            )}
            <span>
              {rule.label}
              {/* The tick is decorative, so the state is carried in words too. */}
              <span className="sr-only">{met ? ' — met' : ' — not yet met'}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export interface SetPasswordFormProps<TResult> {
  /** Called with the chosen password. Owns the endpoint and the payload. */
  action: (password: string) => Promise<TResult>;
  onDone: (result: TResult) => void;
  submitLabel: string;
  busyLabel: string;
  /**
   * Shown when the server answers BAD_REQUEST — which on both of these screens means a
   * spent or expired one-time token, not a bad password. Retyping will never fix it, so
   * the message has to point at the way out.
   */
  expiredHint: string;
  /** Small print under the button. */
  note?: ReactNode;
  className?: string;
}

export function SetPasswordForm<TResult>({
  action,
  onDone,
  submitLabel,
  busyLabel,
  expiredHint,
  note,
  className,
}: SetPasswordFormProps<TResult>) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const { submit, busy, error } = useSubmit(action, {
    onSuccess: (result) => {
      // Neither field outlives the request.
      setPassword('');
      setConfirm('');
      onDone(result);
    },
  });

  // Only complain once the second field has something in it. Flagging a mismatch
  // against an empty box while someone is still typing is noise, not help.
  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = isStrongPassword(password) && confirm.length > 0 && !mismatch;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(password);
  }

  return (
    <form
      className={cn('flex flex-col justify-center gap-4 p-8 lg:p-10', className)}
      onSubmit={handleSubmit}
    >
      {error && (
        <ErrorAlert error={error}>{error.code === 'BAD_REQUEST' && expiredHint}</ErrorAlert>
      )}

      <Field label="New password">
        {(field) => (
          <>
            <PasswordInput
              {...field}
              aria-describedby={`${field.id}-rules`}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              disabled={busy}
            />
            <RuleList password={password} id={`${field.id}-rules`} />
          </>
        )}
      </Field>

      <Field
        label="Confirm password"
        error={mismatch ? 'The two passwords do not match.' : undefined}
      >
        {(field) => (
          <PasswordInput
            {...field}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
            disabled={busy}
          />
        )}
      </Field>

      <Button type="submit" loading={busy} disabled={!canSubmit} fullWidth>
        {busy ? busyLabel : submitLabel}
      </Button>

      {note && <p className="text-xs text-subtle">{note}</p>}
    </form>
  );
}
