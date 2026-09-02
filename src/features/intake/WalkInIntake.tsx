'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldCheck, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubmit } from '@/hooks/useSubmit';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { createWalkInIntake, findDuplicates } from '@/api/intakes.api';
import type { DuplicateMatch, WalkInIntakeInput } from '@/api/intakes.api';
import {
  GENDERS,
  GENDER_LABELS,
  IMMIGRATION_STATUSES,
  IMMIGRATION_STATUS_LABELS,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
} from '@/types/enums';
import type { Gender, ImmigrationStatus, SupportedLanguage } from '@/types/enums';
import { formatDate } from '@/lib/dates';
import { ORG } from '@/lib/site';

/*
 * Capturing somebody who has walked in.
 *
 * WHAT THIS SCREEN IS NOT: the register's intake form. That one creates a Beneficiary and
 * asks for everything the register requires — a date of birth, a language, a guardian for a
 * minor. This creates an APPLICATION, and almost every field is optional, because the person
 * standing at the desk may not know their date of birth, may not want to say their status,
 * and may have arrived with nothing. Refusing to write down that they came is not an option
 * available to a front desk.
 *
 * The missing details become required later, at approval, where the service names exactly
 * what is still needed. That is the right place for the gap: by then somebody has decided to
 * take the person on, and there is a reason to ask again.
 *
 * THREE STEPS, AND THE ORDER IS THE ARGUMENT:
 *
 *   1  consent, before anything is typed. The same rule the register runs under — a record
 *      created without a recorded basis is personal data held without one.
 *   2  who they are, and what they need.
 *   3  a duplicate check before saving, because the cheapest moment to notice that somebody
 *      is already known is before a second record exists.
 */

const INPUT =
  'min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400';

const CONSENT_METHODS = [
  { value: 'VERBAL_WITNESSED', label: 'Told them out loud, with a witness' },
  { value: 'SIGNED_FORM', label: 'They signed the form' },
] as const;

interface FormState {
  firstName: string;
  lastName: string;
  otherNames: string;
  dateOfBirth: string;
  gender: Gender | '';
  nationality: string;
  language: SupportedLanguage | '';
  immigrationStatus: ImmigrationStatus | '';
  cellphone: string;
  email: string;
  address: string;
  suburb: string;
  householdSize: string;
  dependants: string;
  reasonForVisit: string;
  requestedSupport: string;
  source: 'WALK_IN' | 'REFERRAL' | 'OTHER';
  referredBy: string;
  notes: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', otherNames: '', dateOfBirth: '', gender: '',
  nationality: '', language: '', immigrationStatus: '', cellphone: '', email: '',
  address: '', suburb: '', householdSize: '1', dependants: '0',
  reasonForVisit: '', requestedSupport: '', source: 'WALK_IN', referredBy: '', notes: '',
};

function Field({
  label,
  error,
  hint,
  optional,
  children,
  className,
}: {
  label: string;
  error?: string;
  hint?: string;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-muted">
        {label}
        {optional && <span className="ml-1 font-normal text-subtle">(optional)</span>}
      </span>
      {children}
      {error ? (
        <span className="text-sm text-danger-700">{error}</span>
      ) : (
        hint && <span className="text-sm text-subtle">{hint}</span>
      )}
    </label>
  );
}

export function WalkInIntake() {
  const router = useRouter();
  const [step, setStep] = useState<'consent' | 'details' | 'declined'>('consent');
  const [consentMethod, setConsentMethod] = useState<(typeof CONSENT_METHODS)[number]['value'] | ''>('');
  const [form, setForm] = useState<FormState>(EMPTY);
  const [matches, setMatches] = useState<DuplicateMatch[] | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { submit, busy, error, fieldErrors } = useSubmit(
    async (payload: WalkInIntakeInput) => createWalkInIntake(payload),
    {
      onSuccess: (saved) => {
        router.replace(`/dashboard/intake/${saved._id}`);
        router.refresh();
      },
    }
  );

  const check = useSubmit(
    async () =>
      findDuplicates({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
        contact: {
          ...(form.cellphone.trim() ? { cellphone: form.cellphone.trim() } : {}),
          ...(form.email.trim() ? { email: form.email.trim() } : {}),
        },
      }),
    { onSuccess: setMatches }
  );

  function payload(): WalkInIntakeInput {
    return {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      ...(form.otherNames.trim() ? { otherNames: form.otherNames.trim() } : {}),
      ...(form.dateOfBirth ? { dateOfBirth: form.dateOfBirth } : {}),
      ...(form.gender ? { gender: form.gender } : {}),
      ...(form.nationality.trim() ? { nationality: form.nationality.trim() } : {}),
      ...(form.language ? { languages: [form.language] } : {}),
      ...(form.immigrationStatus ? { immigrationStatus: form.immigrationStatus } : {}),
      contact: {
        ...(form.cellphone.trim() ? { cellphone: form.cellphone.trim() } : {}),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        ...(form.suburb.trim() ? { suburb: form.suburb.trim() } : {}),
      },
      household: {
        size: Number(form.householdSize) || 1,
        dependants: Number(form.dependants) || 0,
      },
      ...(form.reasonForVisit.trim() ? { reasonForVisit: form.reasonForVisit.trim() } : {}),
      ...(form.requestedSupport.trim() ? { requestedSupport: form.requestedSupport.trim() } : {}),
      source: form.source,
      ...(form.referredBy.trim() ? { referredBy: form.referredBy.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      consent: { given: true, method: consentMethod as 'VERBAL_WITNESSED' | 'SIGNED_FORM' },
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    /*
     * The duplicate check runs FIRST, once, and its result is shown before anything is
     * written. Pressing save again goes through — the officer has now seen the candidates
     * and decided. Blocking the second press would make a common, legitimate case (two
     * cousins with one surname) impossible to record at all.
     */
    if (matches === null) {
      void check.submit();
      return;
    }
    void submit(payload());
  }

  // --- consent ---------------------------------------------------------------------

  if (step === 'consent') {
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <BackLink />
        <header>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
            New walk-in intake
          </h1>
          <p className="mt-1 text-base text-muted">
            Before anything is written down, ask for their agreement.
          </p>
        </header>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-body">
            <ShieldCheck className="size-4 text-subtle" aria-hidden="true" />
            What to tell them
          </h2>
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-base text-muted">
            <li>
              {ORG.shortName} will write down what they tell us today so somebody can look at
              their request.
            </li>
            <li>
              Being written down is not the same as being accepted. Somebody will look at
              this and decide, and they will be told either way.
            </li>
            <li>They can ask what is held about them, and ask us to stop.</li>
            <li>Saying no does not stop them being helped today.</li>
          </ul>

          <div className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">How did they agree?</span>
              <select
                value={consentMethod}
                onChange={(e) => setConsentMethod(e.target.value as typeof consentMethod)}
                className={INPUT}
              >
                <option value="">Choose…</option>
                {CONSENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button variant="subtle" className="px-5 py-2" onClick={() => setStep('declined')}>
                They said no
              </Button>
              <Button
                className="px-5 py-2"
                disabled={consentMethod === ''}
                onClick={() => setStep('details')}
              >
                They agreed — continue
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (step === 'declined') {
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <BackLink />
        <Alert tone="info">
          <strong className="font-semibold">Nothing was saved.</strong> No record exists for
          this person. They can still be helped today — agreeing is about keeping a record,
          not about receiving help.
        </Alert>
        <Button variant="subtle" className="self-start px-5 py-2" onClick={() => setStep('consent')}>
          Start again
        </Button>
      </div>
    );
  }

  // --- details ---------------------------------------------------------------------

  return (
    <form className="flex max-w-3xl flex-col gap-5" onSubmit={handleSubmit}>
      <BackLink />

      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
          New walk-in intake
        </h1>
        <p className="mt-1 max-w-prose text-base text-muted">
          This creates an application, not a register record. Almost nothing here is required
          — write down what they tell you and leave the rest blank.
        </p>
      </header>

      {error && <ErrorAlert error={error} />}
      {check.error && <ErrorAlert error={check.error} />}

      {/* --- the duplicate warning ------------------------------------------------- */}
      {matches !== null && matches.length > 0 && (
        <section
          role="status"
          className="rounded-xl border border-accent-200 bg-accent-50/50 p-5"
        >
          <h2 className="flex items-center gap-2 text-base font-semibold text-body">
            <TriangleAlert className="size-4 text-accent-800" aria-hidden="true" />
            Possible existing beneficiary found
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Somebody on the register looks like this person. Open the record to check. If it
            is them, cancel this and add the application from their record instead; if it is
            not, press save again.
          </p>

          <ul className="mt-4 flex flex-col gap-2">
            {matches.map((match) => (
              <li
                key={match._id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/dashboard/beneficiaries/${match._id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-body underline-offset-2 hover:text-brand-600 hover:underline"
                  >
                    {match.firstName} {match.lastName}
                  </Link>
                  <span className="block font-mono text-sm text-subtle">
                    {match.referenceCode}
                    {match.dateOfBirth && ` · born ${formatDate(match.dateOfBirth)}`}
                  </span>
                </div>
                <span className="text-sm text-muted">Matched on {match.matchedOn.join(', ')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {matches !== null && matches.length === 0 && (
        <Alert tone="success">
          Nobody on the register matches these details. Press save to record the application.
        </Alert>
      )}

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">The person</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="First name" error={fieldErrors.firstName}>
            <input className={INPUT} value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required maxLength={80} disabled={busy} />
          </Field>
          <Field label="Last name" error={fieldErrors.lastName}>
            <input className={INPUT} value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required maxLength={80} disabled={busy} />
          </Field>

          <Field
            label="Date of birth"
            optional
            error={fieldErrors.dateOfBirth}
            hint="Leave blank if they are not sure. It is asked again before they are registered."
          >
            <input type="date" className={INPUT} value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} disabled={busy} />
          </Field>
          <Field label="Gender" optional error={fieldErrors.gender}>
            <select className={INPUT} value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)} disabled={busy}>
              <option value="">Not said</option>
              {GENDERS.map((v) => <option key={v} value={v}>{GENDER_LABELS[v]}</option>)}
            </select>
          </Field>

          <Field label="Nationality" optional error={fieldErrors.nationality}>
            <input className={INPUT} value={form.nationality} onChange={(e) => set('nationality', e.target.value)} maxLength={60} disabled={busy} />
          </Field>
          <Field label="Preferred language" optional error={fieldErrors.languages}>
            <select className={INPUT} value={form.language} onChange={(e) => set('language', e.target.value as SupportedLanguage)} disabled={busy}>
              <option value="">Not said</option>
              {SUPPORTED_LANGUAGES.map((v) => <option key={v} value={v}>{LANGUAGE_LABELS[v]}</option>)}
            </select>
          </Field>

          <Field
            label="Immigration status"
            optional
            error={fieldErrors.immigrationStatus}
            hint="Do not press. It is often the last thing somebody will say."
            className="sm:col-span-2"
          >
            <select className={INPUT} value={form.immigrationStatus} onChange={(e) => set('immigrationStatus', e.target.value as ImmigrationStatus)} disabled={busy}>
              <option value="">Not said</option>
              {IMMIGRATION_STATUSES.map((v) => <option key={v} value={v}>{IMMIGRATION_STATUS_LABELS[v]}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">How to reach them</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cellphone" optional error={fieldErrors['contact.cellphone']}>
            <input type="tel" className={INPUT} value={form.cellphone} onChange={(e) => set('cellphone', e.target.value)} placeholder="072 123 4567" disabled={busy} />
          </Field>
          <Field label="Email" optional error={fieldErrors['contact.email']}>
            <input type="email" className={INPUT} value={form.email} onChange={(e) => set('email', e.target.value)} disabled={busy} />
          </Field>
          <Field label="Address" optional error={fieldErrors['contact.address']}>
            <input className={INPUT} value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={200} disabled={busy} />
          </Field>
          <Field label="Suburb" optional error={fieldErrors['contact.suburb']}>
            <input className={INPUT} value={form.suburb} onChange={(e) => set('suburb', e.target.value)} maxLength={100} disabled={busy} />
          </Field>
          <Field label="Household size" optional error={fieldErrors['household.size']}>
            <input type="number" min={1} max={50} className={INPUT} value={form.householdSize} onChange={(e) => set('householdSize', e.target.value)} disabled={busy} />
          </Field>
          <Field label="Dependants" optional error={fieldErrors['household.dependants']}>
            <input type="number" min={0} max={50} className={INPUT} value={form.dependants} onChange={(e) => set('dependants', e.target.value)} disabled={busy} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">What they are asking for</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="How did they reach us?" error={fieldErrors.source}>
            <select className={INPUT} value={form.source} onChange={(e) => set('source', e.target.value as FormState['source'])} disabled={busy}>
              <option value="WALK_IN">Walked in</option>
              <option value="REFERRAL">Referred by somebody</option>
              <option value="OTHER">Other</option>
            </select>
          </Field>
          <Field label="Referred by" optional error={fieldErrors.referredBy}>
            <input className={INPUT} value={form.referredBy} onChange={(e) => set('referredBy', e.target.value)} maxLength={200} disabled={busy || form.source !== 'REFERRAL'} />
          </Field>

          <Field
            label="What do they need?"
            optional
            error={fieldErrors.requestedSupport}
            hint="In their words. They may not know the name of it."
            className="sm:col-span-2"
          >
            <input className={INPUT} value={form.requestedSupport} onChange={(e) => set('requestedSupport', e.target.value)} placeholder="Help with a permit" maxLength={500} disabled={busy} />
          </Field>

          <Field label="Why they came in" optional error={fieldErrors.reasonForVisit} className="sm:col-span-2">
            <textarea className={cn(INPUT, 'py-2')} rows={3} value={form.reasonForVisit} onChange={(e) => set('reasonForVisit', e.target.value)} maxLength={2000} disabled={busy} />
          </Field>

          <Field label="Notes for the screener" optional error={fieldErrors.notes} className="sm:col-span-2">
            <textarea className={cn(INPUT, 'py-2')} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} disabled={busy} />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy || check.busy} className="px-6 py-2.5">
          {matches === null ? 'Check and save' : 'Save application'}
        </Button>
        {check.busy && <Spinner label="Checking the register" />}
        <p className="text-sm text-subtle">
          Saved as an application. Screening decides whether they go on the register.
        </p>
      </div>
    </form>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/intake"
      className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to intake
    </Link>
  );
}

export default WalkInIntake;
