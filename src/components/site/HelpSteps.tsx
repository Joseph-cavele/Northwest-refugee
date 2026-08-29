'use client';

import { useRef, useState } from 'react';
import { AlertTriangle, Check, FileUp, Phone, X } from 'lucide-react';
import { submitIntake } from '@/api/intake.api';
import { ApiError } from '@/api/errors';
import { Spinner } from '@/components/ui/spinner';
import { Field } from '@/components/ui/field';
import { Input, Textarea } from '@/components/ui/input';
import { buttonClasses } from '@/components/ui/button-classes';
import {
  GENDERS,
  GENDER_LABELS,
  IMMIGRATION_STATUSES,
  IMMIGRATION_STATUS_LABELS,
  LANGUAGE_LABELS,
  SUPPORTED_LANGUAGES,
} from '@/types/enums';
import type { Gender, ImmigrationStatus, SupportedLanguage } from '@/types/enums';
import { isMinor } from '@/lib/dates';
import { formatBytes } from '@/lib/format';
import { ORG } from '@/lib/site';
import { cn } from '@/lib/utils';

/*
 * The online intake — the public half of the beneficiary register.
 *
 * ============================================================================================
 *  THIS FORM MIRRORS createBeneficiarySchema. READ THAT FILE BEFORE ADDING OR MOVING A FIELD.
 * ============================================================================================
 *
 * Every field here exists because the register requires it: firstName, lastName, gender,
 * dateOfBirth, nationality, at least one language, an immigration status, and a cellphone are
 * all required by beneficiary.schema.js, and a beneficiary under 18 cannot be created without
 * a recorded guardian. That last rule is enforced in the schema AND again in the model, so a
 * form that let a minor through would simply fail at the server — it is reproduced here so the
 * person filling it in finds out at the guardian question rather than at the end.
 *
 * TWO FIELDS THE REGISTER ACCEPTS ARE DELIBERATELY NOT ASKED FOR HERE.
 *
 *   permitNumber        The single most sensitive value in the system: encrypted at rest with
 *                       an HMAC blind index, `select: false`, and never logged. It is optional
 *                       at every immigration status precisely because undocumented people are
 *                       a large share of who NWHR serves. Collect it at the office, from the
 *                       document itself, where a mistyped digit can be checked against the
 *                       paper — not from a phone keyboard on a public page.
 *
 *   vulnerabilityFlags  GBV survivor, trafficking survivor, unaccompanied minor. Reading these
 *                       inside the dashboard requires `beneficiary:read_sensitive` AND writes
 *                       an audit entry. A public form that asked somebody to tick "trafficking
 *                       survivor" would be collecting, in the open, the category of information
 *                       the rest of this system spends the most effort protecting.
 *
 * IT WRITES TO THE REGISTER. `POST /api/v1/intake` is public, rate-limited to five an hour per
 * address, and validated against `publicIntakeSchema` — which refuses permit numbers,
 * vulnerability flags, programme assignment and status outright. The server decides the intake
 * channel and the consent method; this form is not believed about either.
 *
 * THE ONE THING STILL NOT WIRED IS THE UPLOAD. Documents live behind Cloudinary with signed,
 * time-limited URLs and a permission on every read, and attaching them to a record that does
 * not exist yet is a different piece of work. The files chosen on step five stay on the device
 * and the step says so.
 *
 * TODO(NWHR): accept documents. Order matters — the record has to exist first, so the natural
 * shape is a second request against the reference code this one returns.
 */

const SAFETY_ID = 'not-safe';

/** How the person is reaching the organisation. The register's own channels, in plain words. */
const SOURCES = [
  { id: 'WALK_IN', label: 'I am coming in to the office', hint: 'No appointment needed' },
  { id: 'REFERRAL', label: 'Somebody referred me', hint: 'A clinic, a school, another organisation' },
  { id: 'WEB', label: 'I found NWHR online', hint: 'This website, or a search' },
  { id: 'WHATSAPP', label: 'Through WhatsApp', hint: 'The NWHR WhatsApp number' },
];

/** What the office needs to see. Named as the documents themselves are named. */
const DOCUMENTS = [
  'Asylum or refugee permit, even if it has expired',
  'Passport or any identity document',
  'Birth certificate for each child',
  'Any letter from Home Affairs, a school or a clinic',
];

const STEPS = ['How you found us', 'About you', 'Contact', 'Your situation', 'Documents', 'Consent'];

interface Draft {
  source: string | null;
  referredBy: string;
  firstName: string;
  lastName: string;
  otherNames: string;
  dateOfBirth: string;
  gender: string;
  nationality: string;
  languages: string[];
  cellphone: string;
  email: string;
  address: string;
  suburb: string;
  city: string;
  immigrationStatus: string;
  householdSize: string;
  guardianName: string;
  guardianRelationship: string;
  guardianPhone: string;
  notes: string;
}

const EMPTY: Draft = {
  source: null,
  referredBy: '',
  firstName: '',
  lastName: '',
  otherNames: '',
  dateOfBirth: '',
  gender: '',
  nationality: '',
  languages: ['en'],
  cellphone: '',
  email: '',
  address: '',
  suburb: '',
  city: 'Rustenburg',
  immigrationStatus: '',
  householdSize: '',
  guardianName: '',
  guardianRelationship: '',
  guardianPhone: '',
  notes: '',
};

const SELECT_CLASSES =
  'w-full rounded-md border border-transparent bg-ink-50 p-3 text-sm text-body transition-colors hover:bg-ink-100 focus:border-brand-500 focus:bg-surface focus:ring-3 focus:ring-brand-100 focus:outline-none';

export function HelpSteps() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [files, setFiles] = useState<File[]>([]);
  const [consented, setConsented] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  /*
   * The guardian rule, computed from the date of birth as it is typed. `isMinor` is the same
   * helper the dashboard uses, so the threshold cannot drift between the two forms.
   */
  const minor = draft.dateOfBirth ? isMinor(draft.dateOfBirth) : false;

  /*
   * Focus moves to the new step's heading. Without it, a keyboard or screen-reader user
   * presses Next and focus lands on a button that has just been replaced — the panel changes
   * silently and they have to read from the top to find out what happened.
   */
  function go(next: number) {
    setStep(next);
    requestAnimationFrame(() => headingRef.current?.focus());
  }

  function next() {
    const found: Record<string, string> = {};

    if (step === 0 && !draft.source) found.source = 'Choose the closest one.';
    if (step === 1) {
      if (!draft.firstName.trim()) found.firstName = 'First name is required.';
      if (!draft.lastName.trim()) found.lastName = 'Last name is required.';
      if (!draft.dateOfBirth) found.dateOfBirth = 'Date of birth is required.';
      if (!draft.gender) found.gender = 'Choose one.';
      if (!draft.nationality.trim()) found.nationality = 'Nationality is required.';
      if (draft.languages.length === 0) found.languages = 'Choose at least one language.';
    }
    if (step === 2 && !draft.cellphone.trim()) {
      found.cellphone = 'A cellphone number is required — a WhatsApp number is fine.';
    }
    if (step === 3) {
      if (!draft.immigrationStatus) found.immigrationStatus = 'Choose the closest one.';
      // The register refuses a minor without a guardian, so the form refuses it here first.
      if (minor && !draft.guardianName.trim()) {
        found.guardianName = 'Anyone under 18 needs a parent or guardian recorded.';
      }
      if (minor && !draft.guardianRelationship.trim()) {
        found.guardianRelationship = 'How is this person related to you?';
      }
    }
    if (step === 5 && !consented) found.consent = 'We cannot send this without your agreement.';

    setErrors(found);
    if (Object.keys(found).length > 0) return;
    go(step + 1);
  }

  /*
   * Send it.
   *
   * FIELD ERRORS FROM THE SERVER ARE MAPPED BACK ONTO THE FORM. route() collects every failed
   * field from body, query and params into one VALIDATION_FAILED with a `fields` map, which
   * exists precisely so a form can render them inline rather than printing a paragraph the
   * person cannot act on. A nested path arrives dotted — `contact.cellphone` — so the last
   * segment is what matches a field name here.
   *
   * THE STEP IS REWOUND TO WHERE THE PROBLEM IS. Showing "cellphone is required" on the consent
   * step, three panels away from the input, is how somebody gives up on a form.
   */
  async function submit() {
    setFailure(null);
    setSending(true);

    try {
      const receipt = await submitIntake({
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        otherNames: draft.otherNames.trim() || null,
        gender: draft.gender as Gender,
        dateOfBirth: draft.dateOfBirth,
        nationality: draft.nationality.trim(),
        languages: draft.languages as SupportedLanguage[],
        immigration: { status: draft.immigrationStatus as ImmigrationStatus },
        contact: {
          cellphone: draft.cellphone.trim(),
          email: draft.email.trim() || null,
          address: draft.address.trim(),
          suburb: draft.suburb.trim(),
          city: draft.city.trim(),
        },
        ...(draft.householdSize ? { household: { size: Number(draft.householdSize) } } : {}),
        ...(minor
          ? {
              guardian: {
                fullName: draft.guardianName.trim(),
                relationship: draft.guardianRelationship.trim(),
                phone: draft.guardianPhone.trim() || null,
              },
            }
          : {}),
        arrivingBy: (draft.source ?? 'WEB') as 'WALK_IN' | 'REFERRAL' | 'WEB' | 'WHATSAPP',
        referredBy: draft.referredBy.trim(),
        notes: draft.notes.trim(),
        consent: { given: true },
      });

      setReference(receipt.referenceCode);
    } catch (error) {
      if (error instanceof ApiError && error.hasFieldErrors) {
        const mapped: Record<string, string> = {};
        for (const [path, message] of Object.entries(error.details)) {
          mapped[path.split('.').pop() ?? path] = message;
        }
        setErrors(mapped);

        // Send them back to the earliest step that now has an error on it.
        const stepOf: Record<string, number> = {
          firstName: 1,
          lastName: 1,
          dateOfBirth: 1,
          gender: 1,
          nationality: 1,
          languages: 1,
          cellphone: 2,
          email: 2,
          status: 3,
          immigration: 3,
          guardian: 3,
        };
        const earliest = Object.keys(mapped)
          .map((key) => stepOf[key])
          .filter((value): value is number => value !== undefined)
          .sort((a, b) => a - b)[0];

        setFailure('Some answers need fixing — we have taken you back to them.');
        if (earliest !== undefined) go(earliest);
      } else {
        setFailure(
          error instanceof ApiError
            ? error.message
            : 'Something went wrong sending this. Please try again, or telephone us.'
        );
      }
    } finally {
      setSending(false);
    }
  }

  /*
   * The fallback, unchanged: somebody whose connection drops mid-send still has a way to get
   * the same information to the office. The files are held in memory and go nowhere — mailto
   * cannot carry an attachment, and the step that collects them says so.
   */
  function handOff() {
    const body = [
      `Request for help — ${SOURCES.find((s) => s.id === draft.source)?.label ?? ''}`,
      draft.source === 'REFERRAL' && draft.referredBy ? `Referred by: ${draft.referredBy}` : null,
      '',
      `Name: ${draft.firstName} ${draft.lastName} ${draft.otherNames}`.trim(),
      `Date of birth: ${draft.dateOfBirth}`,
      `Gender: ${GENDER_LABELS[draft.gender as keyof typeof GENDER_LABELS] ?? draft.gender}`,
      `Nationality: ${draft.nationality}`,
      `Languages: ${draft.languages
        .map((code) => LANGUAGE_LABELS[code as keyof typeof LANGUAGE_LABELS] ?? code)
        .join(', ')}`,
      '',
      `Cellphone: ${draft.cellphone}`,
      draft.email ? `Email: ${draft.email}` : null,
      [draft.address, draft.suburb, draft.city].filter(Boolean).join(', '),
      '',
      `Status: ${
        IMMIGRATION_STATUS_LABELS[draft.immigrationStatus as keyof typeof IMMIGRATION_STATUS_LABELS] ??
        draft.immigrationStatus
      }`,
      draft.householdSize ? `People in the household: ${draft.householdSize}` : null,
      minor
        ? `Guardian: ${draft.guardianName} (${draft.guardianRelationship})${
            draft.guardianPhone ? ` — ${draft.guardianPhone}` : ''
          }`
        : null,
      '',
      draft.notes || '(no further detail given)',
      '',
      files.length > 0
        ? `Documents to bring or attach: ${files.map((file) => file.name).join(', ')}`
        : null,
    ]
      .filter((line) => line !== null && line !== '')
      .join('\n');

    window.location.href = `mailto:${ORG.email}?subject=${encodeURIComponent(
      `Request for help — ${draft.firstName} ${draft.lastName}`.trim()
    )}&body=${encodeURIComponent(body)}`;
  }

  const urgent = draft.source === SAFETY_ID;

  if (reference) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl bg-surface p-8 text-center sm:p-12">
        <span
          aria-hidden="true"
          className="mx-auto grid size-16 place-items-center rounded-full bg-brand-500 text-white"
        >
          <Check className="size-8" strokeWidth={3} />
        </span>

        <h2
          ref={headingRef}
          tabIndex={-1}
          className="mt-6 text-[clamp(1.5rem,3vw,2rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950 outline-none"
        >
          We have your details
        </h2>

        <p className="mt-4 text-base leading-7 text-muted">
          Somebody will contact you during office hours. If you would rather not wait, come in —
          no appointment, and you do not need documents to be seen.
        </p>

        <p className="mt-8 rounded-2xl bg-ink-50 p-6">
          <span className="block text-sm font-semibold text-muted">
            Your reference — write it down
          </span>
          <span className="mt-2 block text-2xl font-extrabold tracking-[0.08em] text-ink-950">
            {reference}
          </span>
        </p>

        {files.length > 0 && (
          <p className="mt-6 rounded-xl border border-gold-400 bg-gold-50 p-4 text-sm leading-6 text-body">
            Your {files.length === 1 ? 'document' : 'documents'} could not be sent — uploading is
            not switched on yet. Bring {files.length === 1 ? 'it' : 'them'} with you, or email
            {' '}
            <a href={`mailto:${ORG.email}`} className="font-semibold underline">
              {ORG.email}
            </a>
            .
          </p>
        )}

        <p className="mt-6 flex items-start justify-center gap-3 text-sm leading-6 text-body">
          <Phone className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden="true" />
          <span>
            Questions? Ring{' '}
            <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
              {ORG.phone}
            </a>
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-16">
      {/* --- the stepper -------------------------------------------------------------- */}
      <ol className="flex gap-4 overflow-x-auto pb-2 lg:flex-col lg:gap-0 lg:overflow-visible lg:pb-0">
        {STEPS.map((label, index) => {
          const done = index < step;
          const current = index === step;

          return (
            <li key={label} className="flex shrink-0 items-center gap-3 lg:items-start lg:gap-4">
              <div className="flex flex-col items-center self-stretch">
                <span
                  aria-hidden="true"
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition-colors',
                    done && 'border-brand-500 bg-brand-500 text-white',
                    current && !done && 'border-brand-500 text-brand-600',
                    !done && !current && 'border-line text-subtle'
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} /> : index + 1}
                </span>

                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn('hidden w-0.5 flex-1 lg:block', done ? 'bg-brand-500' : 'bg-line')}
                  />
                )}
              </div>

              <span
                aria-current={current ? 'step' : undefined}
                className={cn(
                  'text-sm leading-9 font-semibold whitespace-nowrap lg:pb-8',
                  current ? 'text-ink-950' : 'text-muted'
                )}
              >
                {label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* --- the panel ---------------------------------------------------------------- */}
      <div className="rounded-3xl bg-surface p-6 sm:p-10">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="text-[clamp(1.25rem,2.5vw,1.75rem)] leading-tight font-extrabold tracking-[-0.02em] text-ink-950 outline-none"
        >
          {STEPS[step] === 'How you found us' && 'How are you coming to us?'}
          {STEPS[step] === 'About you' && 'About you'}
          {STEPS[step] === 'Contact' && 'How can we reach you?'}
          {STEPS[step] === 'Your situation' && 'Your situation'}
          {STEPS[step] === 'Documents' && 'Your documents'}
          {STEPS[step] === 'Consent' && 'Before you send this'}
        </h2>

        {/* --- 1. source ------------------------------------------------------------ */}
        {step === 0 && (
          <fieldset className="mt-6">
            <legend className="sr-only">How you are coming to us</legend>

            <div role="radiogroup" aria-label="How you are coming to us" className="grid gap-3">
              {SOURCES.map(({ id, label, hint }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={draft.source === id}
                  onClick={() => set('source', id)}
                  className={cn(
                    'min-h-14 rounded-xl border px-5 py-3 text-left transition-colors',
                    draft.source === id
                      ? 'border-brand-500 bg-brand-50'
                      : 'border-line bg-surface hover:border-ink-950'
                  )}
                >
                  <span className="block text-sm font-semibold text-ink-950">{label}</span>
                  <span className="mt-0.5 block text-sm text-muted">{hint}</span>
                </button>
              ))}
            </div>

            {errors.source && <p className="mt-3 text-sm text-danger-700">{errors.source}</p>}

            {draft.source === 'REFERRAL' && (
              <div className="mt-5">
                <Field label="Who referred you?" hint="The clinic, school or organisation.">
                  {(field) => (
                    <Input
                      {...field}
                      value={draft.referredBy}
                      onChange={(event) => set('referredBy', event.target.value)}
                    />
                  )}
                </Field>
              </div>
            )}

            {/* The one branch that leaves the form: somebody in danger needs a number now. */}
            {urgent && (
              <div className="mt-6 rounded-2xl border-2 border-danger-500 bg-danger-50 p-5">
                <p className="flex items-start gap-3 text-sm leading-6 font-semibold text-danger-700">
                  <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                  Do not fill in this form. Call us instead.
                </p>
              </div>
            )}
          </fieldset>
        )}

        {/* --- 2. about you --------------------------------------------------------- */}
        {step === 1 && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="First name" error={errors.firstName}>
                {(field) => (
                  <Input
                    {...field}
                    autoComplete="given-name"
                    value={draft.firstName}
                    onChange={(event) => set('firstName', event.target.value)}
                  />
                )}
              </Field>

              <Field label="Last name" error={errors.lastName}>
                {(field) => (
                  <Input
                    {...field}
                    autoComplete="family-name"
                    value={draft.lastName}
                    onChange={(event) => set('lastName', event.target.value)}
                  />
                )}
              </Field>
            </div>

            <Field label="Other names" optional hint="Any other name your documents use.">
              {(field) => (
                <Input
                  {...field}
                  value={draft.otherNames}
                  onChange={(event) => set('otherNames', event.target.value)}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Date of birth" error={errors.dateOfBirth}>
                {(field) => (
                  <Input
                    {...field}
                    type="date"
                    value={draft.dateOfBirth}
                    onChange={(event) => set('dateOfBirth', event.target.value)}
                  />
                )}
              </Field>

              <Field label="Gender" error={errors.gender}>
                {(field) => (
                  <select
                    {...field}
                    value={draft.gender}
                    onChange={(event) => set('gender', event.target.value)}
                    className={SELECT_CLASSES}
                  >
                    <option value="">Choose…</option>
                    {GENDERS.map((value) => (
                      <option key={value} value={value}>
                        {GENDER_LABELS[value]}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>

            <Field label="Nationality" error={errors.nationality}>
              {(field) => (
                <Input
                  {...field}
                  value={draft.nationality}
                  onChange={(event) => set('nationality', event.target.value)}
                />
              )}
            </Field>

            {/*
             * Languages is a multi-select because the register stores an array and the FIRST
             * entry is the preferred one — it decides which prompts the bot uses and whether an
             * interpreter is needed. Checkboxes keep that honest; a single dropdown would throw
             * away the second language a caseworker needs to know about.
             */}
            <fieldset>
              <legend className="text-sm font-semibold text-ink-950">
                Which languages do you speak?
              </legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {SUPPORTED_LANGUAGES.map((code) => {
                  const chosen = draft.languages.includes(code);
                  return (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={chosen}
                      onClick={() =>
                        set(
                          'languages',
                          chosen
                            ? draft.languages.filter((value) => value !== code)
                            : [...draft.languages, code]
                        )
                      }
                      className={cn(
                        'min-h-11 rounded-full border px-5 text-sm font-semibold transition-colors',
                        chosen
                          ? 'border-brand-500 bg-brand-500 text-white'
                          : 'border-line bg-surface text-body hover:border-ink-950'
                      )}
                    >
                      {LANGUAGE_LABELS[code]}
                    </button>
                  );
                })}
              </div>
              {errors.languages && (
                <p className="mt-3 text-sm text-danger-700">{errors.languages}</p>
              )}
            </fieldset>
          </div>
        )}

        {/* --- 3. contact ----------------------------------------------------------- */}
        {step === 2 && (
          <div className="mt-6 space-y-5">
            <Field
              label="Cellphone number"
              error={errors.cellphone}
              hint="A WhatsApp number is fine — it is often the easiest way to reach somebody."
            >
              {(field) => (
                <Input
                  {...field}
                  type="tel"
                  autoComplete="tel"
                  value={draft.cellphone}
                  onChange={(event) => set('cellphone', event.target.value)}
                />
              )}
            </Field>

            <Field label="Email" optional>
              {(field) => (
                <Input
                  {...field}
                  type="email"
                  autoComplete="email"
                  value={draft.email}
                  onChange={(event) => set('email', event.target.value)}
                />
              )}
            </Field>

            <Field label="Where you are staying" optional hint="Street or area — as much as you know.">
              {(field) => (
                <Input
                  {...field}
                  value={draft.address}
                  onChange={(event) => set('address', event.target.value)}
                />
              )}
            </Field>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Suburb" optional>
                {(field) => (
                  <Input
                    {...field}
                    value={draft.suburb}
                    onChange={(event) => set('suburb', event.target.value)}
                  />
                )}
              </Field>

              <Field label="Town or city" optional>
                {(field) => (
                  <Input
                    {...field}
                    value={draft.city}
                    onChange={(event) => set('city', event.target.value)}
                  />
                )}
              </Field>
            </div>
          </div>
        )}

        {/* --- 4. situation --------------------------------------------------------- */}
        {step === 3 && (
          <div className="mt-6 space-y-5">
            <Field
              label="Your immigration status"
              error={errors.immigrationStatus}
              hint="Choose the closest one. Undocumented is a normal answer here and changes nothing about the help you get."
            >
              {(field) => (
                <select
                  {...field}
                  value={draft.immigrationStatus}
                  onChange={(event) => set('immigrationStatus', event.target.value)}
                  className={SELECT_CLASSES}
                >
                  <option value="">Choose…</option>
                  {IMMIGRATION_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {IMMIGRATION_STATUS_LABELS[value]}
                    </option>
                  ))}
                </select>
              )}
            </Field>

            {/* Permit numbers are not asked for here — see the note at the top of this file. */}
            <p className="rounded-xl bg-ink-50 p-4 text-sm leading-6 text-muted">
              We do not ask for your permit number on this page. Bring the permit itself when you
              come in and a caseworker will take the details from it.
            </p>

            <Field label="How many people live in your household?" optional>
              {(field) => (
                <Input
                  {...field}
                  type="number"
                  min={1}
                  max={50}
                  value={draft.householdSize}
                  onChange={(event) => set('householdSize', event.target.value)}
                />
              )}
            </Field>

            {/*
             * The guardian block appears only for a date of birth under 18, because the
             * register refuses that record without one. It is not a hidden extra: it is the
             * child-protection rule, surfaced at the moment it becomes true.
             */}
            {minor && (
              <fieldset className="rounded-2xl border-2 border-brand-200 bg-brand-50 p-5">
                <legend className="px-2 text-sm font-bold text-brand-700">
                  A parent or guardian is needed
                </legend>
                <p className="text-sm leading-6 text-body">
                  Anyone under 18 must have a parent or guardian recorded with them. They should
                  come in with you if they can.
                </p>

                <div className="mt-4 space-y-4">
                  <Field label="Guardian’s full name" error={errors.guardianName}>
                    {(field) => (
                      <Input
                        {...field}
                        value={draft.guardianName}
                        onChange={(event) => set('guardianName', event.target.value)}
                      />
                    )}
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Relationship to you" error={errors.guardianRelationship}>
                      {(field) => (
                        <Input
                          {...field}
                          placeholder="Mother, uncle, aunt…"
                          value={draft.guardianRelationship}
                          onChange={(event) => set('guardianRelationship', event.target.value)}
                        />
                      )}
                    </Field>

                    <Field label="Their phone number" optional>
                      {(field) => (
                        <Input
                          {...field}
                          type="tel"
                          value={draft.guardianPhone}
                          onChange={(event) => set('guardianPhone', event.target.value)}
                        />
                      )}
                    </Field>
                  </div>
                </div>
              </fieldset>
            )}

            <Field label="Anything else we should know" optional>
              {(field) => (
                <Textarea
                  {...field}
                  rows={4}
                  value={draft.notes}
                  onChange={(event) => set('notes', event.target.value)}
                />
              )}
            </Field>
          </div>
        )}

        {/* --- 5. documents --------------------------------------------------------- */}
        {step === 4 && (
          <div className="mt-6 space-y-6">
            <div>
              <p className="text-sm leading-6 text-body">
                Bring or send whatever you already have. Nothing here is required to be seen —
                arriving with no documents at all is one of the commonest reasons people come to
                us.
              </p>

              <ul className="mt-4 space-y-2">
                {DOCUMENTS.map((item) => (
                  <li key={item} className="flex gap-3 text-sm leading-6 text-muted">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <label
                htmlFor="intake-documents"
                className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong p-6 text-center transition-colors hover:border-brand-500"
              >
                <FileUp className="size-7 text-line-strong" strokeWidth={1.5} aria-hidden="true" />
                <span className="text-sm font-semibold text-body">Choose your documents</span>
                <span className="text-sm text-muted">Photographs of them are fine</span>
              </label>
              <input
                id="intake-documents"
                type="file"
                multiple
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
              />

              {files.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {files.map((file) => (
                    <li
                      key={file.name}
                      className="flex items-center justify-between gap-4 rounded-xl bg-ink-50 px-4 py-3 text-sm"
                    >
                      <span className="min-w-0 truncate text-body">{file.name}</span>
                      <span className="flex shrink-0 items-center gap-3 text-muted">
                        {formatBytes(file.size)}
                        <button
                          type="button"
                          onClick={() => setFiles(files.filter((f) => f !== file))}
                          className="grid size-8 place-items-center rounded-full hover:bg-ink-200"
                          aria-label={`Remove ${file.name}`}
                        >
                          <X className="size-4" aria-hidden="true" />
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {/*
               * SAID PLAINLY, AT THE POINT OF CHOOSING. The files stay on this device: there is
               * no endpoint to receive them, and an email composed by the browser cannot carry
               * an attachment. Letting somebody select four photographs of their permit and
               * believe they had sent them would be the worst failure on this page.
               */}
              <p className="mt-4 rounded-xl border border-gold-400 bg-gold-50 p-4 text-sm leading-6 text-body">
                Uploading is not switched on yet. Your files stay on this phone — attach them to
                the email yourself on the last step, or bring them with you.
              </p>
            </div>
          </div>
        )}

        {/* --- 6. consent ----------------------------------------------------------- */}
        {step === 5 && (
          <div className="mt-6 space-y-5">
            <p className="text-sm leading-6 text-body">
              This website stores nothing. Pressing send opens your own email app with everything
              you have written, and you send it yourself — so it goes to the office and nowhere
              else.
            </p>

            <ul className="space-y-3 text-sm leading-6 text-muted">
              {[
                'We use what you send only to contact you and to help you.',
                'A caseworker will ask your permission again, in person, before anything is written into the register.',
                'You can ask us to delete what we hold at any time.',
                'We never share your details with Home Affairs or the police unless you ask us to.',
              ].map((line) => (
                <li key={line} className="flex gap-3">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden="true" />
                  {line}
                </li>
              ))}
            </ul>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-4 text-sm leading-6 text-body">
              <input
                type="checkbox"
                checked={consented}
                onChange={(event) => setConsented(event.target.checked)}
                className="mt-1 size-5 shrink-0 accent-brand-500"
              />
              I understand, and I would like {ORG.shortName} to contact me about this.
            </label>

            {errors.consent && <p className="text-sm text-danger-700">{errors.consent}</p>}

            {failure && (
              <p
                role="alert"
                className="flex items-start gap-3 rounded-xl border-2 border-danger-500 bg-danger-50 p-4 text-sm leading-6 text-danger-700"
              >
                <AlertTriangle className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                {failure}
              </p>
            )}

            <button
              type="button"
              disabled={sending}
              onClick={() =>
                consented
                  ? submit()
                  : setErrors({ consent: 'We cannot send this without your agreement.' })
              }
              className={buttonClasses('primary', { fullWidth: true })}
            >
              {sending ? (
                <>
                  <Spinner className="size-4" />
                  Sending
                </>
              ) : (
                'Send this to NWHR'
              )}
            </button>

            {/*
             * The fallback, and it is not decoration: this audience is on patchy mobile data,
             * and a request that fails to send is the one thing this page cannot shrug at.
             */}
            <button
              type="button"
              onClick={handOff}
              className="w-full text-sm font-semibold text-brand-600 underline underline-offset-2 hover:text-brand-700"
            >
              Or send it by email instead
            </button>

            <p className="flex items-start gap-3 rounded-2xl bg-ink-50 p-5 text-sm leading-6 text-body">
              <Phone className="mt-0.5 size-5 shrink-0 text-brand-500" aria-hidden="true" />
              <span>
                No email on your phone? Ring{' '}
                <a href={ORG.phoneHref} className="font-semibold text-brand-600 underline">
                  {ORG.phone}
                </a>{' '}
                or walk in — no appointment, and you do not need documents to be seen.
              </span>
            </p>
          </div>
        )}

        {/* --- sent ----------------------------------------------------------------- */}
        {/*
         * SHOWN INSTEAD OF EVERYTHING ELSE once the record exists — the stepper included, via
         * the guard at the top of this component. A form that stays on screen behind a success
         * message invites somebody to press send twice, and the second press would write a
         * second person into the register.
         *
         * THE REFERENCE CODE IS THE ONLY THING RETURNED, and it is what the desk asks for. It
         * is not a password: it identifies a request, not a person, which is why it is safe to
         * print on a screen somebody may be reading in a public place.
         */}

        {/* --- the controls --------------------------------------------------------- */}
        <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {step > 0 && (
            <button
              type="button"
              onClick={() => go(step - 1)}
              className="min-h-12 rounded-full border border-line px-6 text-xs font-semibold tracking-[0.09em] text-body uppercase transition-colors hover:border-ink-950"
            >
              Back
            </button>
          )}

          {step < STEPS.length - 1 && (
            <button
              type="button"
              onClick={next}
              className={buttonClasses('primary', { className: 'min-h-12' })}
            >
              Next
            </button>
          )}

          <p className="ml-auto text-sm text-subtle">
            Step {step + 1} of {STEPS.length}
          </p>
        </div>
      </div>
    </div>
  );
}

export default HelpSteps;
