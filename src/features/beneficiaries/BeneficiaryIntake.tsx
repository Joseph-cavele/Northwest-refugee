'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubmit } from '@/hooks/useSubmit';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { createBeneficiary } from '@/api/beneficiaries.api';
import type { CreateBeneficiaryInput } from '@/api/beneficiaries.api';
import {
  CONSENT_METHODS,
  CONSENT_METHOD_LABELS,
  GENDERS,
  GENDER_LABELS,
  IMMIGRATION_STATUSES,
  IMMIGRATION_STATUS_LABELS,
  INTAKE_CHANNELS,
  INTAKE_CHANNEL_LABELS,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
  VULNERABILITY_FLAGS,
  VULNERABILITY_FLAG_LABELS,
} from '@/types/enums';
import type {
  ConsentMethod,
  Gender,
  ImmigrationStatus,
  IntakeChannel,
  SupportedLanguage,
  VulnerabilityFlag,
} from '@/types/enums';
import { ORG } from '@/lib/site';
import { isMinor } from '@/lib/dates';

/*
 * Registering someone.
 *
 * CONSENT IS THE FIRST SCREEN, NOT A CHECKBOX AT THE BOTTOM. POPIA requires consent to be
 * captured BEFORE any personal data is stored, and a form that collects a name, a date of
 * birth and a permit number and then asks permission has already done the thing it was
 * asking permission for — the data is in the browser, in the officer's head, and one
 * autosave from being somewhere else. So nothing personal is asked until the question is
 * answered, and DECLINING CLEARS THE FORM AND STORES NOTHING. That mirrors the WhatsApp
 * bot, which discards the session rather than calling the endpoint at all.
 *
 * The server enforces the same rule from the other side: `given` is a literal `true` and
 * the endpoint refuses any other value. This screen exists so the person in front of the
 * desk is asked properly, not so the rule is enforced here.
 *
 * A MINOR CANNOT BE REGISTERED WITHOUT A GUARDIAN. The guardian section appears the moment
 * the date of birth says under 18, and says why. Refused at the schema, and again at the
 * model, so nothing here is the guarantee — but a form that lets someone fill in a whole
 * intake and then rejects it has wasted the time of the person waiting.
 *
 * A PERMIT NUMBER IS NEVER REQUIRED. Undocumented arrivals and asylum seekers still waiting
 * on a s22 are precisely the people NWHR serves; a required field would lock them out.
 */

const TODAY = new Date().toISOString().slice(0, 10);

type Step = 'consent' | 'details' | 'declined';

interface FormState {
  firstName: string;
  lastName: string;
  otherNames: string;
  gender: Gender | '';
  dateOfBirth: string;
  nationality: string;
  preferredLanguage: SupportedLanguage | '';
  otherLanguages: SupportedLanguage[];
  immigrationStatus: ImmigrationStatus | '';
  permitNumber: string;
  permitType: string;
  permitIssuedAt: string;
  permitExpiresAt: string;
  cellphone: string;
  email: string;
  address: string;
  suburb: string;
  householdSize: string;
  dependants: string;
  headOfHousehold: boolean;
  guardianName: string;
  guardianRelationship: string;
  guardianPhone: string;
  guardianIsLegal: boolean;
  vulnerabilityFlags: VulnerabilityFlag[];
  intakeChannel: IntakeChannel;
  notes: string;
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  otherNames: '',
  gender: '',
  dateOfBirth: '',
  nationality: '',
  preferredLanguage: '',
  otherLanguages: [],
  immigrationStatus: '',
  permitNumber: '',
  permitType: '',
  permitIssuedAt: '',
  permitExpiresAt: '',
  cellphone: '',
  email: '',
  address: '',
  suburb: '',
  householdSize: '1',
  dependants: '0',
  headOfHousehold: false,
  guardianName: '',
  guardianRelationship: '',
  guardianPhone: '',
  guardianIsLegal: true,
  vulnerabilityFlags: [],
  intakeChannel: 'WALK_IN',
  notes: '',
};

const INPUT =
  'min-h-10 rounded-lg border border-line bg-surface px-3 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400';

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

export function BeneficiaryIntake() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('consent');
  const [consentMethod, setConsentMethod] = useState<ConsentMethod | ''>('');
  const [form, setForm] = useState<FormState>(EMPTY);

  const { submit, busy, error, fieldErrors } = useSubmit(createBeneficiary, {
    onSuccess: (record) => router.replace(`/dashboard/beneficiaries/${record._id}`),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const minor = form.dateOfBirth !== '' && isMinor(form.dateOfBirth);

  function handleDecline() {
    /*
     * Nothing is sent, and what was typed is dropped. There is no draft, no "saved for
     * later" — a record must never exist for somebody who said no, and neither must a
     * half-record waiting to be completed by whoever sits down next.
     */
    setForm(EMPTY);
    setConsentMethod('');
    setStep('declined');
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (consentMethod === '') return;

    const languages = [form.preferredLanguage, ...form.otherLanguages].filter(
      (value): value is SupportedLanguage => value !== ''
    );

    const payload: CreateBeneficiaryInput = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      ...(form.otherNames.trim() ? { otherNames: form.otherNames.trim() } : {}),
      gender: form.gender as Gender,
      dateOfBirth: form.dateOfBirth,
      nationality: form.nationality.trim(),
      languages,
      immigration: {
        status: form.immigrationStatus as ImmigrationStatus,
        // Empty strings are omitted rather than sent as "": the schema turns an empty
        // permit number into null itself, but an empty date string is not a date.
        ...(form.permitNumber.trim() ? { permitNumber: form.permitNumber.trim() } : {}),
        ...(form.permitType.trim() ? { permitType: form.permitType.trim() } : {}),
        ...(form.permitIssuedAt ? { permitIssuedAt: form.permitIssuedAt } : {}),
        ...(form.permitExpiresAt ? { permitExpiresAt: form.permitExpiresAt } : {}),
      },
      contact: {
        cellphone: form.cellphone.trim(),
        ...(form.email.trim() ? { email: form.email.trim() } : {}),
        ...(form.address.trim() ? { address: form.address.trim() } : {}),
        ...(form.suburb.trim() ? { suburb: form.suburb.trim() } : {}),
      },
      household: {
        size: Number(form.householdSize) || 1,
        dependants: Number(form.dependants) || 0,
        headOfHousehold: form.headOfHousehold,
      },
      ...(minor
        ? {
            guardian: {
              fullName: form.guardianName.trim(),
              relationship: form.guardianRelationship.trim(),
              ...(form.guardianPhone.trim() ? { phone: form.guardianPhone.trim() } : {}),
              isLegalGuardian: form.guardianIsLegal,
            },
          }
        : {}),
      ...(form.vulnerabilityFlags.length > 0
        ? { vulnerabilityFlags: form.vulnerabilityFlags }
        : {}),
      consent: { given: true, method: consentMethod },
      intakeChannel: form.intakeChannel,
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };

    void submit(payload);
  }

  // --- consent ---------------------------------------------------------------------

  if (step === 'consent') {
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <BackLink />
        <header>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Register someone</h1>
          <p className="mt-1 text-base text-muted">
            Before anything is written down, ask for consent.
          </p>
        </header>

        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-body">
            <ShieldCheck className="size-4 text-subtle" aria-hidden="true" />
            What to tell them
          </h2>
          <ul className="mt-3 flex list-disc flex-col gap-1.5 pl-5 text-base text-muted">
            <li>
              {ORG.shortName} will keep their name, date of birth, nationality, contact
              details and immigration status in order to provide services.
            </li>
            <li>
              Staff can see their record. Their permit number and any vulnerability recorded
              are held separately, and every time somebody opens those it is logged.
            </li>
            <li>They can withdraw consent later, and ask what is held about them.</li>
            <li>Saying no does not stop them being helped today.</li>
          </ul>

          <div className="mt-5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">How was consent obtained?</span>
              <select
                value={consentMethod}
                onChange={(event) => setConsentMethod(event.target.value as ConsentMethod | '')}
                className={INPUT}
              >
                <option value="">Choose…</option>
                {CONSENT_METHODS.map((value) => (
                  <option key={value} value={value}>
                    {CONSENT_METHOD_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="subtle"
                className="px-5 py-2"
                onClick={handleDecline}
              >
                They said no
              </Button>
              <Button
                className="px-5 py-2"
                disabled={consentMethod === ''}
                onClick={() => setStep('details')}
              >
                Consent given — continue
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // --- declined --------------------------------------------------------------------

  if (step === 'declined') {
    return (
      <div className="flex max-w-2xl flex-col gap-5">
        <BackLink />
        <Alert tone="info">
          <strong className="font-semibold">Nothing was saved.</strong> No record exists for
          this person and nothing was sent to the server. They can still be helped today —
          consent is about keeping a record, not about receiving assistance.
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
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">Register someone</h1>
        <p className="mt-1 text-base text-muted">
          Consent recorded as {CONSENT_METHOD_LABELS[consentMethod as ConsentMethod]}. The
          record is saved awaiting verification — somebody else confirms it.
        </p>
      </header>

      {error && (
        <ErrorAlert error={error}>
          {error.code === 'INTERNAL' &&
            // The likeliest cause on this deployment, and unguessable otherwise: the key
            // that encrypts a permit number is not configured, so the save throws.
            'If a permit number was entered, this may be the encryption key missing on the server. Saving without one will work.'}
        </ErrorAlert>
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
          <Field label="Other names" optional error={fieldErrors.otherNames} className="sm:col-span-2">
            <input className={INPUT} value={form.otherNames} onChange={(e) => set('otherNames', e.target.value)} maxLength={120} disabled={busy} />
          </Field>

          <Field label="Date of birth" error={fieldErrors.dateOfBirth} hint={minor ? 'Under 18 — a guardian is required below.' : undefined}>
            <input type="date" className={INPUT} value={form.dateOfBirth} max={TODAY} onChange={(e) => set('dateOfBirth', e.target.value)} required disabled={busy} />
          </Field>
          <Field label="Gender" error={fieldErrors.gender}>
            <select className={INPUT} value={form.gender} onChange={(e) => set('gender', e.target.value as Gender)} required disabled={busy}>
              <option value="">Choose…</option>
              {GENDERS.map((v) => <option key={v} value={v}>{GENDER_LABELS[v]}</option>)}
            </select>
          </Field>

          <Field label="Nationality" error={fieldErrors.nationality}>
            <input className={INPUT} value={form.nationality} onChange={(e) => set('nationality', e.target.value)} required maxLength={60} disabled={busy} />
          </Field>
          <Field
            label="Preferred language"
            error={fieldErrors.languages}
            hint="Decides which WhatsApp prompts they receive, and whether an interpreter is needed."
          >
            <select className={INPUT} value={form.preferredLanguage} onChange={(e) => set('preferredLanguage', e.target.value as SupportedLanguage)} required disabled={busy}>
              <option value="">Choose…</option>
              {SUPPORTED_LANGUAGES.map((v) => <option key={v} value={v}>{LANGUAGE_LABELS[v]}</option>)}
            </select>
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">Immigration</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status" error={fieldErrors['immigration.status']}>
            <select className={INPUT} value={form.immigrationStatus} onChange={(e) => set('immigrationStatus', e.target.value as ImmigrationStatus)} required disabled={busy}>
              <option value="">Choose…</option>
              {IMMIGRATION_STATUSES.map((v) => <option key={v} value={v}>{IMMIGRATION_STATUS_LABELS[v]}</option>)}
            </select>
          </Field>
          <Field label="Permit type" optional error={fieldErrors['immigration.permitType']}>
            <input className={INPUT} value={form.permitType} onChange={(e) => set('permitType', e.target.value)} placeholder="e.g. Section 22" disabled={busy} />
          </Field>
          <Field
            label="Permit number"
            optional
            error={fieldErrors['immigration.permitNumber']}
            // Said out loud, because a blank required-looking field is how somebody
            // undocumented gets turned away at a desk.
            hint="Never required. Leave blank for undocumented arrivals and anyone still waiting on a permit."
            className="sm:col-span-2"
          >
            <input className={INPUT} value={form.permitNumber} onChange={(e) => set('permitNumber', e.target.value)} maxLength={40} disabled={busy} />
          </Field>
          <Field label="Issued" optional error={fieldErrors['immigration.permitIssuedAt']}>
            <input type="date" className={INPUT} value={form.permitIssuedAt} onChange={(e) => set('permitIssuedAt', e.target.value)} disabled={busy} />
          </Field>
          <Field label="Expires" optional error={fieldErrors['immigration.permitExpiresAt']}>
            <input type="date" className={INPUT} value={form.permitExpiresAt} onChange={(e) => set('permitExpiresAt', e.target.value)} disabled={busy} />
          </Field>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">Contact and household</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cellphone" error={fieldErrors['contact.cellphone']} hint="Stored in +27 format.">
            <input type="tel" className={INPUT} value={form.cellphone} onChange={(e) => set('cellphone', e.target.value)} placeholder="072 123 4567" required disabled={busy} />
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
          <Field label="Household size" error={fieldErrors['household.size']}>
            <input type="number" min={1} max={50} className={INPUT} value={form.householdSize} onChange={(e) => set('householdSize', e.target.value)} disabled={busy} />
          </Field>
          <Field label="Dependants" error={fieldErrors['household.dependants']}>
            <input type="number" min={0} max={50} className={INPUT} value={form.dependants} onChange={(e) => set('dependants', e.target.value)} disabled={busy} />
          </Field>
          <label className="flex items-center gap-2 text-base text-body sm:col-span-2">
            <input type="checkbox" checked={form.headOfHousehold} onChange={(e) => set('headOfHousehold', e.target.checked)} className="size-4 rounded border-line" disabled={busy} />
            Head of household
          </label>
        </div>
      </section>

      {minor && (
        <section className="rounded-xl border border-danger-100 bg-danger-50/40 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-body">
            <ShieldAlert className="size-4 text-danger-700" aria-hidden="true" />
            Guardian
          </h2>
          <p className="mt-1 max-w-prose text-base text-muted">
            This person is under 18. A guardian must be recorded — the register refuses a
            minor without one. Record a placement where a child arrived unaccompanied.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Guardian name" error={fieldErrors['guardian.fullName'] ?? fieldErrors.guardian}>
              <input className={INPUT} value={form.guardianName} onChange={(e) => set('guardianName', e.target.value)} required maxLength={80} disabled={busy} />
            </Field>
            <Field label="Relationship" error={fieldErrors['guardian.relationship']}>
              <input className={INPUT} value={form.guardianRelationship} onChange={(e) => set('guardianRelationship', e.target.value)} placeholder="Mother, aunt, placement…" required maxLength={60} disabled={busy} />
            </Field>
            <Field label="Guardian phone" optional error={fieldErrors['guardian.phone']}>
              <input type="tel" className={INPUT} value={form.guardianPhone} onChange={(e) => set('guardianPhone', e.target.value)} disabled={busy} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-base text-body">
              <input type="checkbox" checked={form.guardianIsLegal} onChange={(e) => set('guardianIsLegal', e.target.checked)} className="size-4 rounded border-line" disabled={busy} />
              Legal guardian, not a placement
            </label>
          </div>
        </section>
      )}

      <section className="rounded-xl border border-accent-200 bg-accent-50/40 p-5">
        <h2 className="text-base font-semibold text-body">Vulnerability</h2>
        <p className="mt-1 max-w-prose text-base text-muted">
          Record only what they told you and what affects their care. Once saved, these are
          held separately and reading them again is logged against whoever opens them.
        </p>
        <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {VULNERABILITY_FLAGS.map((flag) => (
            <label key={flag} className="flex items-center gap-2 text-base text-body">
              <input
                type="checkbox"
                checked={form.vulnerabilityFlags.includes(flag)}
                onChange={(event) =>
                  set(
                    'vulnerabilityFlags',
                    event.target.checked
                      ? [...form.vulnerabilityFlags, flag]
                      : form.vulnerabilityFlags.filter((value) => value !== flag)
                  )
                }
                className="size-4 rounded border-line"
                disabled={busy}
              />
              {VULNERABILITY_FLAG_LABELS[flag]}
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">Record</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="How did they reach us?" error={fieldErrors.intakeChannel}>
            <select className={INPUT} value={form.intakeChannel} onChange={(e) => set('intakeChannel', e.target.value as IntakeChannel)} disabled={busy}>
              {INTAKE_CHANNELS.map((v) => <option key={v} value={v}>{INTAKE_CHANNEL_LABELS[v]}</option>)}
            </select>
          </Field>
          <Field label="Notes" optional error={fieldErrors.notes} className="sm:col-span-2">
            <textarea className={cn(INPUT, 'py-2')} rows={3} value={form.notes} onChange={(e) => set('notes', e.target.value)} maxLength={2000} disabled={busy} />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={busy} className="px-6 py-2.5">
          {busy ? 'Saving…' : 'Register'}
        </Button>
        <p className="text-sm text-subtle">
          Saved awaiting verification. Somebody other than you confirms the record.
        </p>
      </div>
    </form>
  );
}

function BackLink() {
  return (
    <Link
      href="/dashboard/beneficiaries"
      className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to the register
    </Link>
  );
}

export default BeneficiaryIntake;
