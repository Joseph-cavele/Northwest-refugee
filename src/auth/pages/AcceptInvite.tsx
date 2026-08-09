'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SetPasswordForm } from '@/components/ui/set-password-form';
import { Alert } from '@/components/ui/alert';
import { BrandPanel } from '@/components/ui/brand-panel';
import { AuthShell } from '@/components/ui/auth-shell';
import { Button } from '@/components/ui/button';
import { acceptInvite } from '@/api/auth.api';
import type { Session } from '@/api/auth.api';
import { useAuth } from '../useAuth';
import { PATHS, TOKEN_PARAM } from '@/routes/paths';
import { ORG } from '@/lib/site';

/*
 * /accept-invite?token=… — set the first password and activate an invited account.
 *
 * The path is fixed by the server, which builds the invitation email as
 * `${APP_URL}/accept-invite?token=…`. See routes/paths.ts.
 *
 * This file is the route: it reads the token, owns the three states the screen can be
 * in, and decides where to go afterwards. The fields come from the shared
 * components/ui/set-password-form.tsx, which the reset-password screen also uses.
 */

export default function AcceptInvite() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { signIn } = useAuth();
  const token = searchParams.get(TOKEN_PARAM);

  const [session, setSession] = useState<Session | null>(null);

  /*
   * No token in the URL.
   *
   * Almost always a truncated link — mail clients wrap long URLs and the tail is left
   * behind when someone copies it. The copy says that rather than "invalid token",
   * which sends people to IT instead of back to their inbox.
   */
  if (!token) {
    return (
      <AuthShell>
        <BrandPanel eyebrow="Staff invitation" heading="Something is missing">
          Every invitation carries a one-time token in its link.
        </BrandPanel>
        <div className="flex flex-col justify-center gap-4 p-8 lg:p-10">
          <Alert tone="error">This invitation link is incomplete.</Alert>
          <p className="text-sm text-muted">
            Open the link directly from the invitation email rather than copying it — long
            links are often broken across two lines. If it still fails, ask the person who
            invited you to send a new one; invitations expire.
          </p>
          <a
            className="text-sm text-brand-500 underline underline-offset-2"
            href={PATHS.signIn}
          >
            Back to sign in
          </a>
        </div>
      </AuthShell>
    );
  }

  if (session) {
    return (
      <AuthShell>
        <BrandPanel
          eyebrow="Account activated"
          heading={`Welcome, ${session.user.name.split(' ')[0] ?? ''}`}
        >
          Your account is active and you are signed in.
        </BrandPanel>
        <div className="flex flex-col justify-center gap-4 p-8 lg:p-10">
          <Alert tone="success">Password set. Your account is now active.</Alert>
          <p className="text-sm text-muted">
            You are signed in as{' '}
            <span className="font-medium text-body">{session.user.email}</span>.
          </p>
          {/*
            * An explicit button rather than an automatic redirect. Someone who has just
            * set a password should get a beat to see that it worked — and if the
            * dashboard fails to load, they are looking at a confirmation rather than a
            * blank screen with no idea whether the password took.
            */}
          <Button onClick={() => router.replace(session.dashboard)} fullWidth>
            Go to your dashboard
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <BrandPanel eyebrow="Staff invitation" heading="Set your password">
        You have been invited to the {ORG.name} staff system. Choose a password to activate
        your account.
      </BrandPanel>
      <SetPasswordForm
        action={(password) => acceptInvite(token, password)}
        onDone={(result) => {
          // Adopted into the auth context before the confirmation renders, so the
          // dashboard link below lands on a session that already exists.
          signIn(result);
          setSession(result);
        }}
        submitLabel="Activate my account"
        busyLabel="Activating…"
        expiredHint="Ask the person who invited you to send a new invitation."
        note="This link can only be used once. Setting a password signs you in on this device."
      />
    </AuthShell>
  );
}
