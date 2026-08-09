import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ErrorAlert } from '@/components/ui/alert';
import { AuthShell } from '@/components/ui/auth-shell';
import { BrandPanel } from '@/components/ui/brand-panel';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { verifyMfa } from '@/api/auth.api';
import { useAuth } from '../useAuth';
import { useSubmit } from '@/hooks/useSubmit';
import { PATHS } from '@/routes/paths';

/*
 * /auth/mfa — second stage of sign-in.
 *
 * The challenge token arrives in router state, not a query parameter. It is a bearer
 * credential for the remaining half of an authentication: in a URL it would land in
 * browser history, the Referer header of anything the page loads, and every proxy log
 * between here and the server.
 *
 * The cost of that choice is that the token does not survive a reload — which is
 * correct. The challenge is valid for five minutes; anyone who refreshes this page
 * should start again rather than have the credential persisted somewhere to make the
 * refresh work.
 */

interface MfaLocationState {
  challengeToken?: string;
}

export default function MfaChallenge() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');

  const challengeToken = (location.state as MfaLocationState | null)?.challengeToken;

  const { submit, busy, error } = useSubmit(verifyMfa, {
    onSuccess: (session) => {
      signIn(session);
      navigate(session.dashboard, { replace: true });
    },
  });

  // Arrived without a challenge — a direct visit, or a reload. There is nothing to
  // verify, so send them back to the start rather than showing a form that cannot work.
  if (!challengeToken) {
    return <Navigate to={PATHS.signIn} replace />;
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challengeToken) return;
    void submit(challengeToken, code);
  }

  return (
    <AuthShell>
      <BrandPanel eyebrow="Two-factor authentication" heading="Enter your code">
        Open your authenticator app and enter the six-digit code for {' '}
        North West House of Refuge.
      </BrandPanel>

      <form className="flex flex-col justify-center gap-4 p-8 lg:p-10" onSubmit={handleSubmit}>
        {error && <ErrorAlert error={error} />}

        <Field label="Authentication code" hint="The code changes every 30 seconds.">
          {(field) => (
            <Input
              {...field}
              // `one-time-code` is what lets iOS and Android offer the code from the
              // keyboard; inputMode numeric brings up the digit pad rather than QWERTY.
              autoComplete="one-time-code"
              inputMode="numeric"
              pattern="[0-9]{6}"
              maxLength={6}
              autoFocus
              required
              disabled={busy}
              value={code}
              // Strip anything that is not a digit rather than rejecting it. People
              // paste the code with a space in the middle, and the server takes exactly
              // six digits.
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center font-mono text-lg tracking-[0.4em]"
            />
          )}
        </Field>

        <Button type="submit" loading={busy} disabled={code.length !== 6} fullWidth>
          {busy ? 'Verifying…' : 'Verify and sign in'}
        </Button>

        <Link className="text-sm text-muted underline underline-offset-2" to={PATHS.signIn}>
          Cancel and sign in again
        </Link>
      </form>
    </AuthShell>
  );
}
