'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, TriangleAlert, UserCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  DECISION_LABELS,
  DECISION_MEANING,
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_LABELS,
  SCREENING_DECISIONS,
  decideScreening,
  getScreening,
  intakeOf,
  recordDocument,
  saveAnswers,
} from '@/api/screening.api';
import type {
  ScreeningAnswer,
  ScreeningDecision,
  ScreeningDocumentStatus,
  ScreeningQuestion,
  ScreeningRow,
} from '@/api/screening.api';
import { INTAKE_SOURCE_LABELS } from '@/api/intakes.api';
import { GENDER_LABELS, IMMIGRATION_STATUS_LABELS } from '@/types/enums';
import type { Id } from '@/types/models';
import { formatDate, formatDateTime } from '@/lib/dates';

/*
 * Screening somebody, in the six steps the brief sets out.
 *
 * THE FORM IS RENDERED FROM THE SCREENING, NOT FROM THE TEMPLATE. `screening.form` is a
 * frozen copy taken when the screening started, so what is on this page is what this person
 * was asked on this day — even if an administrator has edited the template since. Answers are
 * keyed by `question.key`; nothing here ever keys them by label.
 *
 * THE STEPS ARE NAVIGATION, NOT A GATE. A screener sits opposite somebody who answers
 * questions in whatever order they come out, so any step can be opened at any time and
 * nothing forces a sequence. The only thing the page refuses is a decision on a closed
 * screening — because that is a fact about the record, not about the workflow.
 *
 * ANSWERS SAVE AS A WHOLE SET, on demand rather than on every keystroke. A per-keystroke save
 * puts a partial record in the database on every pause and leaves the screener unsure what
 * has been kept.
 */

const STEPS = [
  { key: 'applicant', label: 'Applicant' },
  { key: 'support', label: 'Support' },
  { key: 'questions', label: 'Questions' },
  { key: 'documents', label: 'Documents' },
  { key: 'notes', label: 'Notes' },
  { key: 'decision', label: 'Decision' },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

const INPUT =
  'min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400';

/** One question, rendered for its type. The type is the frozen question's, never guessed. */
function QuestionField({
  question,
  value,
  onChange,
  disabled,
}: {
  question: ScreeningQuestion;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled: boolean;
}) {
  const id = `q-${question.key}`;

  const control = (() => {
    switch (question.type) {
      case 'LONG_TEXT':
        return (
          <textarea
            id={id}
            className={cn(INPUT, 'py-2')}
            rows={4}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );
      case 'NUMBER':
        return (
          <input
            id={id}
            type="number"
            className={INPUT}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            disabled={disabled}
          />
        );
      case 'DATE':
        return (
          <input
            id={id}
            type="date"
            className={INPUT}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          />
        );
      case 'YES_NO':
        return (
          <div className="flex gap-2">
            {[
              { v: true, label: 'Yes' },
              { v: false, label: 'No' },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => onChange(value === option.v ? null : option.v)}
                disabled={disabled}
                aria-pressed={value === option.v}
                className={cn(
                  'min-h-10 rounded-full px-5 text-base font-semibold transition-colors',
                  value === option.v
                    ? 'bg-ink-950 text-white'
                    : 'border border-line bg-surface text-muted hover:border-line-strong'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      case 'DROPDOWN':
        return (
          <select
            id={id}
            className={INPUT}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
          >
            <option value="">Choose…</option>
            {question.options?.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );
      case 'MULTIPLE_CHOICE':
        return (
          <div className="flex flex-col gap-2">
            {question.options?.map((option) => (
              <label key={option} className="flex items-center gap-2 text-base text-body">
                <input
                  type="radio"
                  name={id}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  disabled={disabled}
                  className="size-4"
                />
                {option}
              </label>
            ))}
          </div>
        );
      case 'CHECKBOX': {
        const chosen = Array.isArray(value) ? (value as string[]) : [];
        return (
          <div className="flex flex-col gap-2">
            {question.options?.map((option) => (
              <label key={option} className="flex items-center gap-2 text-base text-body">
                <input
                  type="checkbox"
                  checked={chosen.includes(option)}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...chosen, option]
                        : chosen.filter((c) => c !== option)
                    )
                  }
                  disabled={disabled}
                  className="size-4 rounded border-line"
                />
                {option}
              </label>
            ))}
          </div>
        );
      }
      case 'FILE':
        /*
         * A file question on a staff screening is answered on the Documents step, where the
         * checklist lives — uploading it twice, in two places, would give one document two
         * records with different statuses.
         */
        return (
          <p className="text-sm text-subtle">
            Record this on the Documents step.
          </p>
        );
      default:
        return (
          <input
            id={id}
            className={INPUT}
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            maxLength={300}
            disabled={disabled}
          />
        );
    }
  })();

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-muted">
        {question.label}
        {question.required && <span className="ml-1 text-danger-700">*</span>}
      </label>
      {control}
      {question.help && <p className="text-sm text-subtle">{question.help}</p>}
    </div>
  );
}

export function ScreeningWizard({ id }: { id: Id }) {
  const router = useRouter();
  const { can } = useAuth();
  const [step, setStep] = useState<StepKey>('applicant');
  const [answers, setAnswers] = useState<Record<string, unknown> | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [decision, setDecision] = useState<ScreeningDecision | ''>('');
  const [decisionNotes, setDecisionNotes] = useState('');
  const [referredTo, setReferredTo] = useState('');

  const { data, loading, error, reload } = useApi(
    useCallback((signal: AbortSignal) => getScreening(id, signal), [id]),
    [id]
  );

  /*
   * Server state seeds the local draft ONCE, on first load. Re-seeding on every render would
   * throw away what the screener has typed each time anything refetches.
   */
  const seeded = useMemo(() => {
    if (!data) return null;
    const map: Record<string, unknown> = {};
    for (const answer of data.answers) map[answer.questionKey] = answer.value;
    return map;
  }, [data]);

  const draft = answers ?? seeded ?? {};
  const draftNotes = notes ?? data?.notes ?? '';

  const save = useSubmit(
    async (screening: ScreeningRow) => {
      const payload: ScreeningAnswer[] = Object.entries(draft)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([questionKey, value]) => ({ questionKey, value }));
      return saveAnswers(screening._id, { answers: payload, notes: draftNotes });
    },
    { onSuccess: () => reload() }
  );

  const mark = useSubmit(
    async (input: { key: string; status: ScreeningDocumentStatus }) =>
      recordDocument(id, input),
    { onSuccess: () => reload() }
  );

  const decide = useSubmit(
    async () =>
      decideScreening(id, {
        decision: decision as ScreeningDecision,
        ...(decisionNotes.trim() ? { decisionNotes: decisionNotes.trim() } : {}),
        ...(referredTo.trim() ? { referredTo: referredTo.trim() } : {}),
      }),
    {
      onSuccess: (updated) => {
        reload();
        // Straight to the new register record when one was just created — the officer's next
        // question is always "where is their file".
        if (updated.decision === 'ELIGIBLE' && updated.beneficiary) {
          router.push(`/dashboard/beneficiaries/${updated.beneficiary}`);
        }
      },
    }
  );

  if (loading && !data) return <Spinner label="Loading the screening" className="py-24" />;

  if (error) {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorAlert error={error} />
        <Button variant="subtle" onClick={reload}>
          Try again
        </Button>
      </div>
    );
  }

  if (!data) return null;

  const applicant = intakeOf(data);
  const closed = data.status === 'COMPLETED';
  const programme = data.programme && typeof data.programme === 'object' ? data.programme : null;

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <Link
        href={applicant ? `/dashboard/intake/${applicant._id}` : '/dashboard/intake'}
        className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to the application
      </Link>

      <header>
        <p className="text-xs font-semibold tracking-[0.14em] text-subtle uppercase">
          Screening · {data.reference}
        </p>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-[-0.02em] text-body">
          {applicant ? `${applicant.firstName} ${applicant.lastName}` : 'Screening'}
        </h1>
        {programme && <p className="mt-1 text-base text-muted">For {programme.name}</p>}
      </header>

      {data.selfCompleted && (
        /*
         * The distinction is not bookkeeping. A screener who heard an answer and a web form
         * that received typed text are different evidence, and the screener deciding this
         * needs to know which one they are reading.
         */
        <Alert tone="info">
          <strong className="font-semibold">The applicant answered these themselves</strong>{' '}
          when they applied online. Nobody from {`NWHR`} heard the answers — check anything
          that matters before you decide.
        </Alert>
      )}

      {closed && (
        <Alert tone="success">
          <strong className="font-semibold">
            Decided: {data.decision ? DECISION_LABELS[data.decision] : '—'}
          </strong>{' '}
          {data.decidedAt && `on ${formatDateTime(data.decidedAt)}`}
          {data.decisionNotes && ` — ${data.decisionNotes}`}
        </Alert>
      )}

      {/* --- the steps ------------------------------------------------------------- */}
      <nav aria-label="Screening steps" className="flex flex-wrap gap-2">
        {STEPS.map((option, index) => (
          <button
            key={option.key}
            type="button"
            onClick={() => setStep(option.key)}
            aria-current={option.key === step ? 'step' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors',
              option.key === step
                ? 'bg-ink-950 text-white'
                : 'border border-line bg-surface text-muted hover:border-line-strong hover:text-body'
            )}
          >
            <span className={cn('tabular-nums', option.key === step ? 'text-white/70' : 'text-subtle')}>
              {index + 1}
            </span>
            {option.label}
          </button>
        ))}
      </nav>

      {/* --- 1. the applicant ------------------------------------------------------ */}
      {step === 'applicant' && applicant && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">Who you are screening</h2>
          <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              ['Reference', applicant.reference],
              ['Date of birth', applicant.dateOfBirth ? formatDate(applicant.dateOfBirth) : 'Not said'],
              ['Gender', applicant.gender ? GENDER_LABELS[applicant.gender] : 'Not said'],
              ['Nationality', applicant.nationality || 'Not said'],
              ['Immigration status', applicant.immigrationStatus ? IMMIGRATION_STATUS_LABELS[applicant.immigrationStatus] : 'Not said'],
              ['Cellphone', applicant.contact?.cellphone || 'Not said'],
              ['How they reached us', INTAKE_SOURCE_LABELS[applicant.source]],
              ['Asking for', applicant.requestedSupport || 'Not said'],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-sm font-medium text-subtle">{term}</dt>
                <dd className="mt-0.5 text-base text-body">{value}</dd>
              </div>
            ))}
          </dl>
          {applicant.reasonForVisit && (
            <p className="mt-4 border-t border-line pt-4 text-base leading-7 whitespace-pre-line text-muted">
              {applicant.reasonForVisit}
            </p>
          )}
        </section>
      )}

      {/* --- 2. support requested -------------------------------------------------- */}
      {step === 'support' && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">What they are being screened for</h2>
          <p className="mt-2 max-w-prose text-base text-muted">
            {programme
              ? `${programme.name}. The questions on the next step are the ones its administrator attached to it.`
              : 'No programme was named on the application, so this screening has no form — record what you find in the notes and decide.'}
          </p>
          {!programme && (
            <p className="mt-3 max-w-prose text-sm text-subtle">
              To screen against a programme&rsquo;s questions, set the programme on the
              application first, then start a new screening.
            </p>
          )}
        </section>
      )}

      {/* --- 3. the questions ------------------------------------------------------ */}
      {step === 'questions' && (
        <section className="flex flex-col gap-5">
          {data.form.length === 0 && (
            <div className="rounded-xl border border-line bg-surface px-6 py-10 text-center">
              <p className="text-base text-body">This screening has no questions.</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
                Either no programme was named, or the programme has no published screening
                form. Use the notes step instead.
              </p>
            </div>
          )}

          {[...data.form]
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .map((section) => (
              <div key={section.key} className="rounded-xl border border-line bg-surface p-5">
                <h2 className="text-base font-semibold text-body">{section.title}</h2>
                {section.description && (
                  <p className="mt-1 text-sm text-muted">{section.description}</p>
                )}
                <div className="mt-4 flex flex-col gap-4">
                  {[...section.questions]
                    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                    .map((question) => (
                      <QuestionField
                        key={question.key}
                        question={question}
                        value={draft[question.key]}
                        disabled={closed || save.busy}
                        onChange={(next) =>
                          setAnswers({ ...draft, [question.key]: next })
                        }
                      />
                    ))}
                </div>
              </div>
            ))}

          {data.form.length > 0 && !closed && (
            <div className="flex flex-wrap items-center gap-3">
              <Button loading={save.busy} onClick={() => void save.submit(data)} className="px-6 py-2.5">
                Save answers
              </Button>
              <p className="text-sm text-subtle">
                Saved as a set. Anything you clear here is cleared on the record.
              </p>
            </div>
          )}
          {save.error && <ErrorAlert error={save.error} />}
        </section>
      )}

      {/* --- 4. documents ---------------------------------------------------------- */}
      {step === 'documents' && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">Documents</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            None of these is required. &ldquo;Does not have it&rdquo; is a real answer and is
            the ordinary one for people who left home without papers — record it and carry on.
          </p>

          {data.documents.length === 0 ? (
            <p className="mt-4 text-base text-subtle">
              This screening has no document checklist.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {data.documents.map((row) => (
                <li
                  key={row.key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3"
                >
                  <div>
                    <p className="text-base font-medium text-body">{row.label}</p>
                    {row.recordedAt && (
                      <p className="text-sm text-subtle">
                        Recorded {formatDate(row.recordedAt)}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {DOCUMENT_STATUSES.filter((s) => s !== 'UPLOADED').map((status) => (
                      <button
                        key={status}
                        type="button"
                        disabled={closed || mark.busy}
                        onClick={() => void mark.submit({ key: row.key, status })}
                        aria-pressed={row.status === status}
                        className={cn(
                          'min-h-9 rounded-full px-3.5 text-sm font-semibold transition-colors',
                          row.status === status
                            ? 'bg-ink-950 text-white'
                            : 'border border-line bg-surface text-muted hover:border-line-strong'
                        )}
                      >
                        {DOCUMENT_STATUS_LABELS[status]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {/*
            * Uploading the file itself is not here yet: documents go through the existing
            * documents module, which handles storage, signed delivery and download auditing.
            * Marking the checklist is what a screening records.
            */}
          {mark.error && (
            <div className="mt-3">
              <ErrorAlert error={mark.error} />
            </div>
          )}
        </section>
      )}

      {/* --- 5. notes -------------------------------------------------------------- */}
      {step === 'notes' && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">Screening notes</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            What you found, in your words. This is read by whoever picks the file up next.
          </p>
          <textarea
            className={cn(INPUT, 'mt-3 py-2')}
            rows={8}
            value={draftNotes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            disabled={closed || save.busy}
          />
          {!closed && (
            <Button
              loading={save.busy}
              onClick={() => void save.submit(data)}
              className="mt-3 px-6 py-2.5"
            >
              Save notes
            </Button>
          )}
          {save.error && (
            <div className="mt-3">
              <ErrorAlert error={save.error} />
            </div>
          )}
        </section>
      )}

      {/* --- 6. the decision ------------------------------------------------------- */}
      {step === 'decision' && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">Decision</h2>

          {closed ? (
            <p className="mt-2 text-base text-muted">
              This screening was decided on {data.decidedAt && formatDateTime(data.decidedAt)}.
              A decision cannot be changed — start a new screening if the situation has.
            </p>
          ) : !can(PERMISSIONS.SCREENING_DECIDE) ? (
            /*
             * Absent rather than disabled would hide the step entirely; saying it plainly is
             * better, because a screener who has done the work needs to know who finishes it.
             */
            <Alert tone="info">
              You can screen but not decide. Someone with the decision permission — the
              director, an admin officer or a coordinator — finishes this off.
            </Alert>
          ) : (
            <>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {SCREENING_DECISIONS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setDecision(option)}
                    aria-pressed={decision === option}
                    className={cn(
                      'flex flex-col gap-1 rounded-xl border p-4 text-left transition-colors',
                      decision === option
                        ? 'border-brand-500 bg-brand-50/60'
                        : 'border-line bg-surface hover:border-line-strong'
                    )}
                  >
                    <span className="flex items-center gap-2 text-base font-semibold text-body">
                      {decision === option && <Check className="size-4 text-brand-600" aria-hidden="true" />}
                      {DECISION_LABELS[option]}
                    </span>
                    <span className="text-sm text-muted">{DECISION_MEANING[option]}</span>
                  </button>
                ))}
              </div>

              {decision === 'REFERRED' && (
                <label className="mt-4 flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-muted">Referred to</span>
                  <input
                    className={INPUT}
                    value={referredTo}
                    onChange={(e) => setReferredTo(e.target.value)}
                    placeholder="Which organisation or programme"
                    maxLength={300}
                  />
                </label>
              )}

              <label className="mt-4 flex flex-col gap-1.5">
                <span className="text-sm font-medium text-muted">
                  Reason
                  {decision === 'NOT_ELIGIBLE' && <span className="ml-1 text-danger-700">*</span>}
                </span>
                <textarea
                  className={cn(INPUT, 'py-2')}
                  rows={3}
                  value={decisionNotes}
                  onChange={(e) => setDecisionNotes(e.target.value)}
                  maxLength={2000}
                />
              </label>

              {decision === 'ELIGIBLE' && (
                <Alert tone="info" className="mt-4">
                  <strong className="font-semibold">This creates their register record.</strong>{' '}
                  If the application is missing anything the register needs — a date of birth,
                  a language, an immigration status — you will be told which, and can add it to
                  the application first.
                </Alert>
              )}

              {decide.error && (
                <div className="mt-4">
                  <ErrorAlert error={decide.error} />
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button
                  loading={decide.busy}
                  disabled={decision === ''}
                  onClick={() => void decide.submit()}
                  className="px-6 py-2.5"
                >
                  <UserCheck className="size-4" aria-hidden="true" />
                  Record decision
                </Button>
                {decision === 'NOT_ELIGIBLE' && (
                  <span className="inline-flex items-center gap-1.5 text-sm text-accent-800">
                    <TriangleAlert className="size-3.5" aria-hidden="true" />
                    A reason is required
                  </span>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* --- move between steps ----------------------------------------------------- */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="subtle"
          className="px-5 py-2"
          disabled={step === STEPS[0].key}
          onClick={() => {
            const index = STEPS.findIndex((s) => s.key === step);
            if (index > 0) setStep(STEPS[index - 1]!.key);
          }}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Back
        </Button>
        <Button
          variant="subtle"
          className="px-5 py-2"
          disabled={step === STEPS[STEPS.length - 1]!.key}
          onClick={() => {
            const index = STEPS.findIndex((s) => s.key === step);
            if (index < STEPS.length - 1) setStep(STEPS[index + 1]!.key);
          }}
        >
          Next
          <ArrowRight className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export default ScreeningWizard;
