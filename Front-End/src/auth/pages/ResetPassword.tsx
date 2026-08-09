import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { SetPasswordForm } from '@/components/ui/set-password-form';
import { Alert } from '@/components/ui/alert';
import { BrandPanel } from '@/components/ui/brand-panel';
import { AuthShell } from '@/components/ui/auth-shell';
import { resetPassword } from '@/api/auth.api';
import { PATHS, TOKEN_PARAM } from '@/routes/paths';

/*
 * /reset-password?token=… — finish a password reset.
 *
 * The path is fixed by the server, which builds the recovery email as
 * `${APP_URL}/reset-password?token=…`. See routes/paths.ts.
 *
 * Unlike accepting an invitation, this does NOT sign the person in. The server bumps
 * `tokenVersion` and revokes every session — the whole point being that a stolen
 * session cannot survive a reset — so the only correct ending is "now sign in".
 */

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get(TOKEN_PARAM);
  const [done, setDone] = useState(false);

  if (!token) {
    return (
      <AuthShell>
        <BrandPanel eyebrow="Password reset" heading="Something is missing">
          Every reset link carries a one-time token.
        </BrandPanel>
        <div className="flex flex-col justify-center gap-4 p-8 lg:p-10">
          <Alert tone="error">This reset link is incomplete.</Alert>
          <p className="text-sm text-muted">
            Open the link directly from the email rather than copying it — long links are
            often broken across two lines. If it still fails, request a new one.
          </p>
          <Link
            className="text-sm text-brand-500 underline underline-offset-2"
            to={PATHS.forgotPassword}
          >
            Request a new reset link
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell>
        <BrandPanel eyebrow="Password reset" heading="Password updated">
          Every other device has been signed out.
        </BrandPanel>
        <div className="flex flex-col justify-center gap-4 p-8 lg:p-10">
          <Alert tone="success">Your password has been changed.</Alert>
          {/*
            * Named explicitly rather than left as a surprise. Resetting revokes every
            * session, so anyone signed in on a phone or a shared office machine is now
            * signed out — they should hear that from us, not discover it.
            */}
          <p className="text-sm text-muted">
            For your security, you have been signed out everywhere. Sign in again with your
            new password.
          </p>
          <Link className="text-sm text-brand-500 underline underline-offset-2" to={PATHS.signIn}>
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <BrandPanel eyebrow="Password reset" heading="Choose a new password">
        Pick something you have not used on this account before.
      </BrandPanel>
      <SetPasswordForm
        action={(password) => resetPassword(token, password)}
        onDone={() => setDone(true)}
        submitLabel="Update password"
        busyLabel="Updating…"
        expiredHint="Reset links expire. Request a new one and try again."
        note="This link can only be used once."
      />
    </AuthShell>
  );
}
