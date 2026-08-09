'use client';

import { useState } from 'react';
import type { SubmitEvent } from 'react';
import { Button } from './button';
import { ErrorAlert } from './alert';
import { Field } from './field';
import { Input } from './input';
import { PasswordInput } from './password-input';
import { SocialRow } from './social-row';
import type { SocialLink } from '@/lib/site';
import { ORG } from '@/lib/site';
import { isMfaChallenge, login } from '@/api/auth.api';
import type { Session } from '@/api/auth.api';
import { useSubmit } from '@/hooks/useSubmit';

/*
 * The password stage.
 *
 * Two outcomes, both success as far as HTTP is concerned: a session, or an MFA
 * challenge to exchange on the next screen. Neither is handled here — this component
 * collects credentials and hands the result up, so the same form works inside the
 * sliding auth switch and on a standalone page.
 */

export interface SignInFormProps {
  onAuthenticated: (session: Session) => void;
  onMfaRequired: (challengeToken: string) => void;
  /** Rendered as the "request access" affordance on narrow screens. */
  onRequestAccess: () => void;
  forgotPasswordHref: string;
  socialLinks?: SocialLink[];
  /** Focused when the pane becomes active, so the slide is not purely visual. */
  emailRef?: React.Ref<HTMLInputElement>;
}

export function SignInForm({
  onAuthenticated,
  onMfaRequired,
  onRequestAccess,
  forgotPasswordHref,
  socialLinks = [],
  emailRef,
}: SignInFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const { submit, busy, error } = useSubmit(login, {
    onSuccess: (result) => {
      // Cleared before the hand-off: nothing keeps the password after it has been used.
      setPassword('');
      if (isMfaChallenge(result)) onMfaRequired(result.challengeToken);
      else onAuthenticated(result);
    },
  });

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(email, password);
  }

  return (
    <form
      className="flex min-h-full flex-col justify-center gap-4 px-6 py-10 lg:px-8"
      onSubmit={handleSubmit}
    >
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-subtle uppercase">
          {ORG.shortName} staff
        </p>
        <h1 className="mt-2 text-3xl leading-[1.1] font-semibold tracking-[-0.02em]">Sign in</h1>
        <p className="mt-2 max-w-[34ch] text-sm text-muted">{ORG.name} staff dashboard.</p>
      </div>

      {/*
        * No field errors here on purpose. The server answers a wrong password, an
        * unknown account and a disabled account identically, and splitting that into
        * "no such email" under one input would undo it.
        */}
      {error && <ErrorAlert error={error} />}

      <Field label="Email">
        {(field) => (
          <Input
            {...field}
            ref={emailRef}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            // "username" rather than "email": it is the login identifier, and password
            // managers pair it with current-password below to offer the right entry.
            autoComplete="username"
            required
            disabled={busy}
          />
        )}
      </Field>

      <Field label="Password">
        {(field) => (
          <PasswordInput
            {...field}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
            disabled={busy}
          />
        )}
      </Field>

      <a
        className="self-start text-sm text-muted underline underline-offset-2 hover:text-brand-500"
        href={forgotPasswordHref}
      >
        Forgot your password?
      </a>

      <Button type="submit" loading={busy} className="max-lg:w-full lg:self-start">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>

      {/* The panel switch for narrow screens, where the sliding overlay is hidden. */}
      <button
        type="button"
        className="self-start text-sm text-muted underline underline-offset-2 hover:text-brand-500"
        onClick={onRequestAccess}
      >
        Need an account? Request access
      </button>

      <SocialRow links={socialLinks} />
    </form>
  );
}
