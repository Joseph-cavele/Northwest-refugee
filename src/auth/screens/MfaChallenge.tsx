'use client';

import { useEffect, useRef, useState } from 'react';
import type { SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorAlert } from '@/components/ui/alert';
import { AuthShell } from '@/components/ui/auth-shell';
import { BrandPanel } from '@/components/ui/brand-panel';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { verifyMfa } from '@/api/auth.api';
import { useAuth } from '../useAuth';
import { takeMfaChallenge } from '../mfaChallengeStore';
import { useSubmit } from '@/hooks/useSubmit';
import { PATHS } from '@/lib/paths';

/*
 * /auth/mfa — second stage of sign-in.
 *
 * The challenge token arrives in memory (auth/mfaChallengeStore.ts), not a query
 * parameter. It is a bearer credential for the remaining half of an authentication: in a
 * URL it would land in browser history, the Referer header of anything the page loads, and
 * every proxy log between here and the server. React Router carried it as router state;
 * the App Router has no such channel, so a module variable does the same job.
 *
 * The cost of that choice is that the token does not survive a reload — which is
 * correct. The challenge is valid for five minutes; anyone who refreshes this page
 * should start again rather than have the credential persisted somewhere to make the
 * refresh work.
 */

export default function MfaChallenge() {
  const router = useRouter();
  const { signIn } = useAuth();
  const [code, setCode] = useState('');

  /*
   * Taken once, on mount, into a ref.
   *
   * takeMfaChallenge() clears as it reads, so it must not run on every render — the second
   * render would find null and bounce a user who is mid-verification back to sign-in. A
   * ref holds it for the lifetime of this screen and nothing else can reach it.
   */
  const challengeToken = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    challengeToken.current = takeMfaChallenge();
    // Arrived without a challenge — a direct visit, or a reload. There is nothing to
    // verify, so go back to the start rather than show a form that cannot work.
    if (!challengeToken.current) router.replace(PATHS.signIn);
    else setReady(true);
  }, [router]);

  const { submit, busy, error } = useSubmit(verifyMfa, {
    onSuccess: (session) => {
      signIn(session);
      router.replace(session.dashboard);
    },
  });

  if (!ready) return null;

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = challengeToken.current;
    if (!token) return;
    void submit(token, code);
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

        <Link className="text-sm text-muted underline underline-offset-2" href={PATHS.signIn}>
          Cancel and sign in again
        </Link>
      </form>
    </AuthShell>
  );
}
