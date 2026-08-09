'use client';

import { useState } from 'react';
import type { SubmitEvent } from 'react';
import Link from 'next/link';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { AuthShell } from '@/components/ui/auth-shell';
import { BrandPanel } from '@/components/ui/brand-panel';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { forgotPassword } from '@/api/auth.api';
import { useSubmit } from '@/hooks/useSubmit';
import { PATHS } from '@/routes/paths';

/*
 * /forgot-password — ask for a reset link.
 *
 * The server answers identically whether or not the address belongs to an account, and
 * the email send is swallowed on its side for the same reason. So this screen shows one
 * acknowledgement and never reports success or failure per address.
 *
 * Resist making this friendlier. "We couldn't find that email" would turn the form into
 * a test for whether a given person works at NWHR.
 */

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);

  const { submit, busy, error } = useSubmit(forgotPassword, {
    onSuccess: (result) => setSent(result.message),
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(email);
  }

  return (
    <AuthShell>
      <BrandPanel eyebrow="Account recovery" heading="Reset your password">
        We will email a link to set a new one.
      </BrandPanel>

      {sent ? (
        <div className="flex flex-col justify-center gap-4 p-8 lg:p-10">
          <Alert tone="success">{sent}</Alert>
          <p className="text-sm text-muted">
            The link expires, so use it soon. Check your spam folder if it has not arrived in
            a few minutes.
          </p>
          <Link className="text-sm text-brand-500 underline underline-offset-2" href={PATHS.signIn}>
            Back to sign in
          </Link>
        </div>
      ) : (
        <form className="flex flex-col justify-center gap-4 p-8 lg:p-10" onSubmit={handleSubmit}>
          <p className="text-sm text-muted">
            Enter the email address on your staff account and we will send you a reset link.
          </p>

          {error && <ErrorAlert error={error} />}

          <Field label="Email">
            {(field) => (
              <Input
                {...field}
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                disabled={busy}
              />
            )}
          </Field>

          <Button type="submit" loading={busy} fullWidth>
            {busy ? 'Sending…' : 'Send reset link'}
          </Button>

          <Link className="text-sm text-muted underline underline-offset-2" href={PATHS.signIn}>
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
