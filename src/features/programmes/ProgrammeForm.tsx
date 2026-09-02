'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, FileQuestion, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { createProgramme, getProgramme, updateProgramme } from '@/api/programmes.api';
import type { ProgrammeInput } from '@/api/programmes.api';
import { listTemplates } from '@/api/screening.api';
import { PILLAR_LABELS, PROGRAMME_PILLARS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';
import type { Id } from '@/types/models';

/*
 * Creating and editing a programme — and, the reason this screen was built now, choosing the
 * screening form that goes with it.
 *
 * THAT ONE SELECT IS THE JOIN THE WHOLE FEATURE TURNS ON. Without it a screening never finds
 * a form: `startScreening` reads `programme.screeningTemplate`, and nothing else in the
 * system can set it. With it, adding "Hairdressing" and giving it the skills screening form
 * is an administrator's afternoon rather than a developer's ticket.
 *
 * ONLY PUBLISHED FORMS ARE OFFERED. A draft is still being written; attaching one would mean
 * an applicant answering questions somebody is halfway through changing, and the server
 * refuses to screen against a draft anyway — so offering it here would only produce a
 * failure later, at the desk, in front of the applicant.
 */

const INPUT =
  'min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400';

interface FormState {
  name: string;
  pillar: ProgrammePillar | '';
  category: string;
  description: string;
  requirements: string;
  location: string;
  startDate: string;
  endDate: string;
  screeningTemplate: string;
}

const EMPTY: FormState = {
  name: '', pillar: '', category: '', description: '', requirements: '',
  location: '', startDate: '', endDate: '', screeningTemplate: '',
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

export function ProgrammeForm({ id }: { id?: Id }) {
  const router = useRouter();
  const editing = Boolean(id);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loaded, setLoaded] = useState(!editing);
  const [live, setLive] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { loading, error, reload } = useApi(
    useCallback(
      async (signal: AbortSignal) => {
        if (!id) return null;
        const p = await getProgramme(id, signal);
        setForm({
          name: p.name,
          pillar: p.pillar,
          category: p.category ?? '',
          description: p.description ?? '',
          requirements: p.requirements ?? '',
          location: p.location ?? '',
          startDate: p.startDate ? p.startDate.slice(0, 10) : '',
          endDate: p.endDate ? p.endDate.slice(0, 10) : '',
          screeningTemplate: p.screeningTemplate ?? '',
        });
        // The pillar locks once a programme leaves PLANNED — see the note on the field.
        setLive(p.status !== 'PLANNED');
        setLoaded(true);
        return p;
      },
      [id]
    ),
    [id]
  );

  /* Only published forms — see the note at the top of the file. */
  const { data: templates } = useApi(
    useCallback(
      (signal: AbortSignal) =>
        listTemplates({ status: 'PUBLISHED', limit: 100 }, signal).then((p) => p.data),
      []
    )
  );

  const save = useSubmit(
    async () => {
      const payload: ProgrammeInput = {
        name: form.name.trim(),
        pillar: form.pillar as ProgrammePillar,
        description: form.description.trim(),
        category: form.category.trim(),
        requirements: form.requirements.trim(),
        location: form.location.trim(),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        screeningTemplate: form.screeningTemplate || null,
      };
      // The pillar is omitted from an edit on a live programme: the server refuses it, and
      // sending an unchanged value would still trip that refusal.
      if (editing && live) delete (payload as Partial<ProgrammeInput>).pillar;
      return id ? updateProgramme(id, payload) : createProgramme(payload);
    },
    {
      onSuccess: (saved) => {
        router.replace(`/dashboard/programmes/${saved._id}`);
        router.refresh();
      },
    }
  );

  if (editing && loading && !loaded) {
    return <Spinner label="Loading the programme" className="py-24" />;
  }

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

  const chosen = templates?.find((t) => t._id === form.screeningTemplate);

  return (
    <form
      className="flex max-w-3xl flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save.submit();
      }}
    >
      <Link
        href={editing ? `/dashboard/programmes/${id}` : '/dashboard/programmes'}
        className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {editing ? 'Back to the programme' : 'All programmes'}
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
          {editing ? 'Edit programme' : 'New programme'}
        </h1>
        <p className="mt-1 max-w-prose text-base text-muted">
          A programme is what NWHR runs. Attaching a screening form here is what makes the
          right questions load when somebody applies for it.
        </p>
      </header>

      {save.error && <ErrorAlert error={save.error} />}

      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">The programme</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name" error={save.fieldErrors.name} className="sm:col-span-2">
            <input
              className={INPUT}
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Computer skills"
              required
              maxLength={120}
              disabled={save.busy}
            />
          </Field>

          <Field
            label="Pillar"
            error={save.fieldErrors.pillar}
            hint={
              live
                ? 'Locked: every report that grouped by this pillar would move.'
                : 'The reporting axis a funder sees.'
            }
          >
            <select
              className={INPUT}
              value={form.pillar}
              onChange={(e) => set('pillar', e.target.value as ProgrammePillar)}
              required
              disabled={save.busy || live}
            >
              <option value="">Choose…</option>
              {PROGRAMME_PILLARS.map((p) => (
                <option key={p} value={p}>
                  {PILLAR_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Category"
            optional
            error={save.fieldErrors.category}
            hint="Your own word for it — Sewing, Welding, Digital skills."
          >
            <input
              className={INPUT}
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              maxLength={80}
              disabled={save.busy}
            />
          </Field>

          <Field label="Starts" optional error={save.fieldErrors.startDate}>
            <input type="date" className={INPUT} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} disabled={save.busy} />
          </Field>
          <Field label="Ends" optional error={save.fieldErrors.endDate}>
            <input type="date" className={INPUT} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} disabled={save.busy} />
          </Field>

          <Field label="Where it runs" optional error={save.fieldErrors.location} className="sm:col-span-2">
            <input className={INPUT} value={form.location} onChange={(e) => set('location', e.target.value)} maxLength={200} disabled={save.busy} />
          </Field>

          <Field label="Description" optional error={save.fieldErrors.description} className="sm:col-span-2">
            <textarea className={cn(INPUT, 'py-2')} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={2000} disabled={save.busy} />
          </Field>

          <Field
            label="What somebody needs to take part"
            optional
            error={save.fieldErrors.requirements}
            hint="Shown to applicants. Keep it to what genuinely stops somebody joining."
            className="sm:col-span-2"
          >
            <textarea className={cn(INPUT, 'py-2')} rows={2} value={form.requirements} onChange={(e) => set('requirements', e.target.value)} placeholder="Must be able to read and write" maxLength={1000} disabled={save.busy} />
          </Field>
        </div>
      </section>

      {/* --- the join ------------------------------------------------------------- */}
      <section className="rounded-xl border border-brand-200 bg-brand-50/40 p-5">
        <h2 className="flex items-center gap-2 text-base font-semibold text-body">
          <FileQuestion className="size-4 text-brand-600" aria-hidden="true" />
          Screening form
        </h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          The questions asked when somebody applies for this programme. Choosing one here is
          what makes them load automatically — on the public form and in the dashboard.
        </p>

        <select
          className={cn(INPUT, 'mt-3')}
          value={form.screeningTemplate}
          onChange={(e) => set('screeningTemplate', e.target.value)}
          disabled={save.busy}
        >
          <option value="">No form — notes and a decision only</option>
          {(templates ?? []).map((t) => (
            <option key={t._id} value={t._id}>
              {t.name} (v{t.version})
            </option>
          ))}
        </select>

        {templates && templates.length === 0 && (
          <Alert tone="info" className="mt-3">
            No published screening forms yet.{' '}
            <Link href="/dashboard/screening-templates/new" className="underline underline-offset-4">
              Build one
            </Link>{' '}
            — a form has to be published before it can be attached, because a draft is still
            being written.
          </Alert>
        )}

        {chosen && (
          <p className="mt-3 text-sm text-muted">
            {chosen.sections.reduce((n, s) => n + s.questions.length, 0)} questions across{' '}
            {chosen.sections.length} {chosen.sections.length === 1 ? 'section' : 'sections'}
            {chosen.documentTypes.length > 0 &&
              `, and ${chosen.documentTypes.length} documents to ask about`}
            .{' '}
            <Link
              href={`/dashboard/screening-templates/${chosen._id}`}
              className="underline underline-offset-4"
            >
              Open the form
            </Link>
          </p>
        )}

        {!form.screeningTemplate && (
          <p className="mt-3 inline-flex items-start gap-1.5 text-sm text-subtle">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Without a form, screenings for this programme carry notes and a decision but no
            questions. That is a legitimate choice — not every programme needs a form.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          loading={save.busy}
          disabled={form.name.trim() === '' || form.pillar === ''}
          className="px-6 py-2.5"
        >
          {editing ? 'Save changes' : 'Create programme'}
        </Button>
      </div>
    </form>
  );
}

export default ProgrammeForm;
