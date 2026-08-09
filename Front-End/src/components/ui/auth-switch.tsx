import { useEffect, useRef } from 'react';
import { Button } from './button';
import { Logo } from './logo';
import { SignInForm } from './sign-in-form';
import { RequestAccessForm } from './request-access-form';
import type { Session } from '@/api/auth.api';
import type { SocialLink } from '@/lib/site';
import { ORG } from '@/lib/site';
import { cn } from '@/lib/utils';

/*
 * The two-panel auth switch: sign in on one side, request access on the other, with a
 * dark panel sliding between them.
 *
 * This file is the shell only — panel state, focus, and layout. The forms own their own
 * data and submission (sign-in-form.tsx, request-access-form.tsx), so this stays
 * readable and either form can be used on its own page.
 */

export type AuthPanel = 'signin' | 'register';

/*
 * Class recipes for the slide.
 *
 * Hoisted because the variant chains are long and inlining them buries the markup.
 * Each string holds complete class names — Tailwind scans source text, so a name
 * assembled from fragments at runtime would never be generated.
 *
 * The layout is genuinely two designs. Below `lg` the panes stack and only the active
 * one renders: two 50% columns on a phone are two unusable columns. The sliding overlay
 * exists from `lg` up.
 */

const PANE_BASE = cn(
  'w-full',
  'lg:absolute lg:inset-y-0 lg:left-0 lg:w-1/2 lg:overflow-y-auto lg:overscroll-contain',
  'lg:transition-all lg:duration-[620ms] lg:ease-panel'
);

const PANE_SIGNIN = cn(
  'lg:z-20',
  'lg:group-data-[panel=register]/aa:translate-x-full',
  'lg:group-data-[panel=register]/aa:opacity-0',
  'lg:group-data-[panel=register]/aa:invisible'
);

// `invisible` rather than `hidden` so the transition runs — but it also has to leave
// the tab order, or a keyboard user lands in a form scrolled off screen.
const PANE_REGISTER = cn(
  'lg:z-10 lg:invisible lg:opacity-0',
  'lg:group-data-[panel=register]/aa:z-30',
  'lg:group-data-[panel=register]/aa:translate-x-full',
  'lg:group-data-[panel=register]/aa:visible',
  'lg:group-data-[panel=register]/aa:opacity-100'
);

/*
 * The sliding panel is cut to a gable — the roof from the mark. It is the signature of
 * these screens: the form sits under a roof, and switching panes slides the shelter
 * across to cover the other one.
 *
 * clip-path replaces the rounded corners rather than joining them (a clip wins over
 * border-radius), which is why no rounding is set here. Where clip-path is unsupported
 * the panel is simply a rectangle; nothing about the layout depends on the shape.
 */
const OVERLAY_WRAP = cn(
  'hidden lg:block',
  'lg:absolute lg:inset-y-0 lg:left-1/2 lg:z-40 lg:w-1/2 lg:overflow-hidden',
  'lg:transition-transform lg:duration-[620ms] lg:ease-panel',
  'lg:group-data-[panel=register]/aa:-translate-x-full'
);

/** Apex centred, eaves 9% down each side. Matches BrandPanel so the two screens agree. */
const GABLE = 'polygon(0 9%, 50% 0, 100% 9%, 100% 100%, 0 100%)';

const OVERLAY_PANEL = cn(
  'absolute inset-y-0 flex w-1/2 flex-col items-center justify-center gap-6 text-center',
  // Extra top padding clears the eaves, so nothing sits in the clipped corners.
  'px-10 pt-20 pb-12',
  'transition-transform duration-[620ms] ease-panel'
);

interface OverlaySideProps {
  eyebrow: string;
  heading: string;
  body: string;
  action: string;
  onAction: () => void;
  className: string;
}

function OverlaySide({ eyebrow, heading, body, action, onAction, className }: OverlaySideProps) {
  return (
    <div className={cn(OVERLAY_PANEL, className)}>
      <Logo size={96} decorative />
      <div>
        <p className="text-[0.6875rem] font-semibold tracking-[0.2em] text-white/55 uppercase">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-3xl leading-[1.1] font-semibold tracking-[-0.02em]">{heading}</h2>
        <p className="mx-auto mt-3 max-w-[30ch] text-sm leading-relaxed text-white/70">{body}</p>
      </div>
      {/* tabIndex -1: the whole overlay is aria-hidden and duplicates the text links
          inside the forms, which are what a keyboard user actually operates. */}
      <Button variant="ghost" tabIndex={-1} onClick={onAction}>
        {action}
      </Button>
    </div>
  );
}

export interface AuthSwitchProps {
  /**
   * Which pane is showing. Controlled on purpose: the caller drives this from the URL
   * (/sign-in vs /request-access), which makes the address bar the single source of
   * truth. With local state the two drift the moment someone presses Back — the URL
   * changes, `useState` ignores the new initial value, and the screen contradicts it.
   */
  panel: AuthPanel;
  onPanelChange: (panel: AuthPanel) => void;
  onAuthenticated: (session: Session) => void;
  onMfaRequired: (challengeToken: string) => void;
  forgotPasswordHref?: string;
  getHelpHref?: string;
  socialLinks?: SocialLink[];
  className?: string;
}

export function AuthSwitch({
  panel,
  onPanelChange: show,
  onAuthenticated,
  onMfaRequired,
  forgotPasswordHref = '/forgot-password',
  getHelpHref = '/get-help',
  socialLinks = [],
  className,
}: AuthSwitchProps) {
  const emailRef = useRef<HTMLInputElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const hasMounted = useRef(false);

  /*
   * Move focus with the panel, but not on first render — stealing focus on page load
   * skips past anything above the form and is disorienting with a screen reader.
   * Without this the slide is purely visual and a keyboard user stays parked in the
   * form that just scrolled away.
   */
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    const target = panel === 'register' ? firstNameRef.current : emailRef.current;
    target?.focus();
  }, [panel]);

  return (
    <div
      className={cn(
        'grid min-h-screen place-items-center bg-linear-to-br from-ink-100 to-ink-200 px-4 py-6',
        className
      )}
    >
      <div
        data-panel={panel}
        className={cn(
          'group/aa relative w-full max-w-md overflow-hidden rounded-xl bg-surface shadow-2xl',
          // Tall enough that the request form — the longer of the two — fits without an
          // inner scrollbar in the ordinary case.
          'lg:max-w-5xl lg:min-h-[46rem]'
        )}
      >
        <div
          className={cn(
            PANE_BASE,
            PANE_REGISTER,
            panel === 'register' ? 'block' : 'hidden lg:block'
          )}
          aria-hidden={panel !== 'register'}
        >
          <RequestAccessForm
            onSignIn={() => show('signin')}
            getHelpHref={getHelpHref}
            firstNameRef={firstNameRef}
          />
        </div>

        <div
          className={cn(PANE_BASE, PANE_SIGNIN, panel === 'signin' ? 'block' : 'hidden lg:block')}
          aria-hidden={panel !== 'signin'}
        >
          <SignInForm
            onAuthenticated={onAuthenticated}
            onMfaRequired={onMfaRequired}
            onRequestAccess={() => show('register')}
            forgotPasswordHref={forgotPasswordHref}
            socialLinks={socialLinks}
            emailRef={emailRef}
          />
        </div>

        {/* Decorative and pointer-only — see OverlaySide. */}
        <div className={OVERLAY_WRAP} style={{ clipPath: GABLE }} aria-hidden="true">
          <div
            className={cn(
              'relative -left-full h-full w-[200%] bg-ink-950 text-white',
              'transition-transform duration-[620ms] ease-panel',
              'group-data-[panel=register]/aa:translate-x-1/2'
            )}
          >
            <OverlaySide
              eyebrow="Staff dashboard"
              heading="Welcome back"
              body="Already have an account? Sign in to reach your dashboard."
              action="Sign in"
              onAction={() => show('signin')}
              className="left-0 -translate-x-[20%] group-data-[panel=register]/aa:translate-x-0"
            />
            <OverlaySide
              eyebrow="New to the team"
              heading="Hello, friend"
              body={`Request a ${ORG.shortName} staff account and an administrator will review it.`}
              action="Request access"
              onAction={() => show('register')}
              className="right-0 group-data-[panel=register]/aa:translate-x-[20%]"
            />
          </div>

          {/*
            * The four figures from the mark, along the base of the roof.
            *
            * A sibling of the sliding element, not a child of it: inside that 200%-wide
            * track only half the gradient would ever be in view, so the bar would read
            * as two colours and change which two as the panel moved.
            */}
          <div className="brand-rule absolute inset-x-0 bottom-0 h-1.5" />
        </div>
      </div>
    </div>
  );
}

// Default as well as named, so `import AuthSwitch from '@/components/ui/auth-switch'`
// resolves — that is how the pages import it.
export default AuthSwitch;
