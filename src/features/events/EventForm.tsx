'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Globe, ImageIcon, Trash2, Upload } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSubmit } from '@/hooks/useSubmit';
import { useAuth } from '@/auth/useAuth';
import { PERMISSIONS } from '@/auth/permissions';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  EVENT_MODES,
  EVENT_MODE_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  createEvent,
  deleteEvent,
  setEventPublication,
  updateEvent,
  uploadEventImage,
} from '@/api/events.api';
import type {
  CreateEventInput,
  EventMode,
  EventRow,
  EventType,
  UpdateEventInput,
} from '@/api/events.api';
import { PILLAR_LABELS, PROGRAMME_PILLARS } from '@/types/enums';
import type { ProgrammePillar } from '@/types/enums';

/*
 * Creating and editing an event, and deciding whether the public may see it.
 *
 * THE FORM IS IN TWO HALVES AND THE SPLIT IS THE FEATURE. Above the rule is the operational
 * record — what kind of event, which pillar it reports against, how many people are
 * expected. That half has existed since before there was a public website and is nobody's
 * business outside the organisation. Below the rule is everything the public site may show.
 * An officer filling this in can see exactly where the line falls, which is the only
 * reliable way to stop an internal note ending up on a noticeboard.
 *
 * PUBLISHING IS NOT A FIELD ON THIS FORM. It is a separate action, behind a separate
 * permission, on a saved event — see the panel at the top of the edit view. Two reasons.
 * A draft has to be saveable half-finished, which a form that published on save could never
 * allow. And the officer who plans an event is not automatically the person answerable for
 * what the organisation says in public; `event:publish` is held by the director and comms.
 *
 * DATE AND TIME ARE ONE VALUE. The database stores an instant, so the form collects a date
 * and a start time and combines them. Two fields on screen because that is how a person
 * thinks about it; one value on the wire because a date without a time is not a moment.
 */

const INPUT =
  'min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400';

interface FormState {
  title: string;
  type: EventType | '';
  pillar: ProgrammePillar | '';
  date: string;
  startTime: string;
  endTime: string;
  venue: string;
  address: string;
  expectedAttendance: string;
  description: string;
  // --- the publishable half ---
  summary: string;
  mode: EventMode;
  onlineUrl: string;
  audience: string;
  registrationInfo: string;
  registrationUrl: string;
  contact: string;
}

const EMPTY: FormState = {
  title: '',
  type: '',
  pillar: '',
  date: '',
  startTime: '',
  endTime: '',
  venue: '',
  address: '',
  expectedAttendance: '0',
  description: '',
  summary: '',
  mode: 'IN_PERSON',
  onlineUrl: '',
  audience: '',
  registrationInfo: '',
  registrationUrl: '',
  contact: '',
};

/** An ISO instant from the date and time inputs, or '' when the date is missing. */
function toInstant(date: string, time: string): string {
  if (!date) return '';
  // Midday rather than midnight when no time is given: a date parsed at 00:00 local and
  // rendered in another zone can land on the previous day, and an event on the wrong day is
  // somebody arriving to a locked door.
  return new Date(`${date}T${time || '12:00'}`).toISOString();
}

function fromEvent(event: EventRow): FormState {
  const starts = new Date(event.startsAt);
  const ends = event.endsAt ? new Date(event.endsAt) : null;
  const hhmm = (d: Date) =>
    `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  return {
    title: event.title,
    type: event.type,
    pillar: event.pillar ?? '',
    date: `${starts.getFullYear()}-${String(starts.getMonth() + 1).padStart(2, '0')}-${String(starts.getDate()).padStart(2, '0')}`,
    startTime: hhmm(starts),
    endTime: ends ? hhmm(ends) : '',
    venue: event.venue,
    address: event.address,
    expectedAttendance: String(event.expectedAttendance ?? 0),
    description: event.description,
    summary: event.publication?.summary ?? '',
    mode: event.publication?.mode ?? 'IN_PERSON',
    onlineUrl: event.publication?.onlineUrl ?? '',
    audience: event.publication?.audience ?? '',
    registrationInfo: event.publication?.registrationInfo ?? '',
    registrationUrl: event.publication?.registrationUrl ?? '',
    contact: event.publication?.contact ?? '',
  };
}

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

export interface EventFormProps {
  /** Absent when creating. */
  event?: EventRow;
}

export function EventForm({ event }: EventFormProps) {
  const router = useRouter();
  const { can } = useAuth();
  const editing = Boolean(event);

  const [form, setForm] = useState<FormState>(event ? fromEvent(event) : EMPTY);
  const [imageUrl, setImageUrl] = useState(event?.publication?.imageUrl ?? '');
  const [published, setPublished] = useState(event?.publication?.status === 'PUBLISHED');
  const fileInput = useRef<HTMLInputElement>(null);

  /*
   * A POSTER CHOSEN BEFORE THE EVENT EXISTS.
   *
   * The upload endpoint attaches a file to an event, so it needs an id — which a new event
   * does not have until it is saved. That is a fact about the API and it has no business
   * being a fact about the officer's afternoon: "save it first, then come back for the
   * picture" is the kind of instruction that ends with events having no pictures.
   *
   * So on a new event the file is held here and sent immediately after the create succeeds.
   * The preview is a blob URL, revoked when it is replaced or when the form unmounts —
   * every one that is not revoked pins its file in memory for the life of the tab.
   */
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string>('');
  /* Set when the event saved but its picture did not. The event is NOT lost; say so. */
  const [imageDeferred, setImageDeferred] = useState(false);

  useEffect(
    () => () => {
      if (pendingPreview) URL.revokeObjectURL(pendingPreview);
    },
    [pendingPreview]
  );

  function choosePoster(file: File) {
    setPendingFile(file);
    setPendingPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });
  }

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { submit, busy, error, fieldErrors } = useSubmit(
    async (payload: CreateEventInput | UpdateEventInput) => {
      if (event) return updateEvent(event._id, payload);

      const created = await createEvent(payload as CreateEventInput);

      /*
       * The poster, if one was chosen, in a second request — because only now is there an
       * id to attach it to.
       *
       * A FAILED UPLOAD MUST NOT LOSE THE EVENT. Everything the officer typed is already
       * saved at this point, so throwing here would show a red error over a form whose work
       * had in fact succeeded, and the natural response to that is to fill it in and press
       * save again — creating the event twice. The picture is the recoverable half: it is
       * flagged instead, and can be added from the edit screen.
       */
      if (pendingFile) {
        try {
          return await uploadEventImage(created._id, pendingFile);
        } catch {
          setImageDeferred(true);
        }
      }

      return created;
    },
    {
      onSuccess: (saved) => {
        // Straight to the record either way: after a create there is now somewhere to go,
        // and after an edit the officer wants to see what they saved, not the form again.
        // Held back when the picture failed, so the warning has somewhere to be read.
        if (imageDeferred) return;
        router.replace(`/dashboard/events/${saved._id}`);
        router.refresh();
      },
    }
  );

  const publish = useSubmit(
    async (next: boolean) => setEventPublication(event!._id, next),
    {
      onSuccess: (saved) => {
        setPublished(saved.publication.status === 'PUBLISHED');
        router.refresh();
      },
    }
  );

  const upload = useSubmit(async (file: File) => uploadEventImage(event!._id, file), {
    onSuccess: (saved) => setImageUrl(saved.publication.imageUrl),
  });

  const remove = useSubmit(async () => deleteEvent(event!._id), {
    onSuccess: () => {
      router.replace('/dashboard/events');
      router.refresh();
    },
  });

  function handleSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();

    const payload: CreateEventInput = {
      title: form.title.trim(),
      type: form.type as EventType,
      ...(form.pillar ? { pillar: form.pillar } : {}),
      startsAt: toInstant(form.date, form.startTime),
      ...(form.endTime ? { endsAt: toInstant(form.date, form.endTime) } : {}),
      venue: form.venue.trim(),
      address: form.address.trim(),
      description: form.description.trim(),
      expectedAttendance: Number(form.expectedAttendance) || 0,
      publication: {
        summary: form.summary.trim(),
        mode: form.mode,
        onlineUrl: form.onlineUrl.trim(),
        audience: form.audience.trim(),
        registrationInfo: form.registrationInfo.trim(),
        registrationUrl: form.registrationUrl.trim(),
        contact: form.contact.trim(),
      },
    };

    void submit(payload);
  }

  const needsVenue = form.mode !== 'ONLINE';
  const needsLink = form.mode !== 'IN_PERSON';

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        href={editing ? `/dashboard/events/${event!._id}` : '/dashboard/events'}
        className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {editing ? 'Back to the event' : 'Back to the diary'}
      </Link>

      <header>
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
          {editing ? 'Edit event' : 'New event'}
        </h1>
        <p className="mt-1 text-base text-muted">
          {editing
            ? 'Changes are saved to the record. Publishing is a separate step.'
            : 'Saved as a draft. Nothing reaches the public site until somebody publishes it.'}
        </p>
      </header>

      {/* --- the publication panel, on a saved event only ---------------------------- */}
      {editing && (
        <section
          className={cn(
            'rounded-xl border p-5',
            published ? 'border-success-200 bg-success-50/50' : 'border-line bg-surface'
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-body">
                <Globe className="size-4 text-subtle" aria-hidden="true" />
                {published ? 'Live on the public site' : 'Draft — not visible to the public'}
              </h2>
              <p className="mt-1 max-w-prose text-sm text-muted">
                {published
                  ? 'Anyone can see this at /news. Taking it down removes it from the site but changes nothing you have written.'
                  : 'Only staff can see this. Publishing needs a summary, who it is for, and a venue or a joining link.'}
              </p>
            </div>

            {/*
              * Absent, not disabled, without the permission. A coordinator who plans events
              * holds event:update but not event:publish, and a greyed switch would advertise
              * a control that is not theirs. The server refuses either way.
              */}
            {can(PERMISSIONS.EVENT_PUBLISH) && (
              <Button
                variant={published ? 'subtle' : 'primary'}
                loading={publish.busy}
                onClick={() => void publish.submit(!published)}
                className="px-5 py-2"
              >
                {published ? 'Take it down' : 'Publish'}
              </Button>
            )}
          </div>

          {publish.error && (
            <div className="mt-4">
              {/* The server says exactly what is missing — show that, not a generic failure. */}
              <ErrorAlert error={publish.error} />
            </div>
          )}
        </section>
      )}

      {error && <ErrorAlert error={error} />}

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        {/* --- the internal record ------------------------------------------------- */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold text-body">The event</h2>
          <p className="mt-1 text-sm text-subtle">
            The organisation&rsquo;s own record. None of this appears on the public site.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Title" error={fieldErrors.title} className="sm:col-span-2">
              <input
                className={INPUT}
                value={form.title}
                onChange={(e) => set('title', e.target.value)}
                required
                maxLength={200}
                disabled={busy}
              />
            </Field>

            <Field label="Kind of event" error={fieldErrors.type}>
              <select
                className={INPUT}
                value={form.type}
                onChange={(e) => set('type', e.target.value as EventType)}
                required
                disabled={busy}
              >
                <option value="">Choose…</option>
                {EVENT_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {EVENT_TYPE_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Pillar" optional error={fieldErrors.pillar} hint="Which pillar this reports against.">
              <select
                className={INPUT}
                value={form.pillar}
                onChange={(e) => set('pillar', e.target.value as ProgrammePillar)}
                disabled={busy}
              >
                <option value="">None</option>
                {PROGRAMME_PILLARS.map((value) => (
                  <option key={value} value={value}>
                    {PILLAR_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Date" error={fieldErrors.startsAt}>
              <input
                type="date"
                className={INPUT}
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                required
                disabled={busy}
              />
            </Field>

            <Field label="Expected attendance" optional error={fieldErrors.expectedAttendance}>
              <input
                type="number"
                min={0}
                max={100000}
                className={INPUT}
                value={form.expectedAttendance}
                onChange={(e) => set('expectedAttendance', e.target.value)}
                disabled={busy}
              />
            </Field>

            <Field label="Starts" error={fieldErrors.startsAt}>
              <input
                type="time"
                className={INPUT}
                value={form.startTime}
                onChange={(e) => set('startTime', e.target.value)}
                required
                disabled={busy}
              />
            </Field>

            <Field label="Ends" optional error={fieldErrors.endsAt}>
              <input
                type="time"
                className={INPUT}
                value={form.endTime}
                onChange={(e) => set('endTime', e.target.value)}
                disabled={busy}
              />
            </Field>

            <Field
              label="Venue"
              error={fieldErrors.venue}
              optional={!needsVenue}
              hint={needsVenue ? 'Shown publicly. Needed before this can be published.' : undefined}
            >
              <input
                className={INPUT}
                value={form.venue}
                onChange={(e) => set('venue', e.target.value)}
                maxLength={200}
                disabled={busy}
              />
            </Field>

            <Field label="Address" optional error={fieldErrors.address}>
              <input
                className={INPUT}
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                maxLength={300}
                disabled={busy}
              />
            </Field>

            <Field
              label="Full description"
              optional
              error={fieldErrors.description}
              hint="Shown in full on the public event page when published."
              className="sm:col-span-2"
            >
              <textarea
                className={cn(INPUT, 'py-2')}
                rows={5}
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                maxLength={2000}
                disabled={busy}
              />
            </Field>
          </div>
        </section>

        {/* --- everything below here can be seen by the public --------------------- */}
        <section className="rounded-xl border border-brand-200 bg-brand-50/40 p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold text-body">
            <Globe className="size-4 text-brand-600" aria-hidden="true" />
            For the public listing
          </h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            Everything in this box appears on the website once the event is published. Write
            it for somebody deciding whether to spend a taxi fare getting here.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Short summary"
              error={fieldErrors['publication.summary']}
              hint="One or two sentences. This is the card on the listing page."
              className="sm:col-span-2"
            >
              <textarea
                className={cn(INPUT, 'py-2')}
                rows={2}
                value={form.summary}
                onChange={(e) => set('summary', e.target.value)}
                maxLength={280}
                disabled={busy}
              />
            </Field>

            <Field
              label="Who it is for"
              error={fieldErrors['publication.audience']}
              hint="The field most likely to save somebody a wasted journey."
              className="sm:col-span-2"
            >
              <input
                className={INPUT}
                value={form.audience}
                onChange={(e) => set('audience', e.target.value)}
                placeholder="Anyone in Rustenburg who needs help with permits"
                maxLength={300}
                disabled={busy}
              />
            </Field>

            <Field label="In person or online" error={fieldErrors['publication.mode']}>
              <select
                className={INPUT}
                value={form.mode}
                onChange={(e) => set('mode', e.target.value as EventMode)}
                disabled={busy}
              >
                {EVENT_MODES.map((value) => (
                  <option key={value} value={value}>
                    {EVENT_MODE_LABELS[value]}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Joining link"
              optional={!needsLink}
              error={fieldErrors['publication.onlineUrl']}
              hint={needsLink ? 'Needed before an online event can be published.' : 'Only used for online events.'}
            >
              <input
                type="url"
                className={INPUT}
                value={form.onlineUrl}
                onChange={(e) => set('onlineUrl', e.target.value)}
                placeholder="https://…"
                disabled={busy || !needsLink}
              />
            </Field>

            <Field
              label="How to register"
              optional
              error={fieldErrors['publication.registrationInfo']}
              hint="Plain instructions. &ldquo;Just come, no booking needed&rdquo; is a good answer."
              className="sm:col-span-2"
            >
              <textarea
                className={cn(INPUT, 'py-2')}
                rows={3}
                value={form.registrationInfo}
                onChange={(e) => set('registrationInfo', e.target.value)}
                maxLength={1000}
                disabled={busy}
              />
            </Field>

            <Field
              label="Registration link"
              optional
              error={fieldErrors['publication.registrationUrl']}
              hint="A booking form, if there is one."
            >
              <input
                type="url"
                className={INPUT}
                value={form.registrationUrl}
                onChange={(e) => set('registrationUrl', e.target.value)}
                placeholder="https://…"
                disabled={busy}
              />
            </Field>

            <Field
              label="Who to contact"
              optional
              error={fieldErrors['publication.contact']}
              hint="A name and a way to reach them."
            >
              <input
                className={INPUT}
                value={form.contact}
                onChange={(e) => set('contact', e.target.value)}
                placeholder="Ask for Grace at the front desk"
                maxLength={300}
                disabled={busy}
              />
            </Field>
          </div>

          {/* --- the poster ------------------------------------------------------- */}
          <div className="mt-5 border-t border-brand-200 pt-5">
            <h3 className="text-sm font-medium text-muted">Poster</h3>

            <div className="mt-3 flex flex-wrap items-start gap-4">
              {/*
                * 16:10 here, close enough to the 4:3 the public card crops to that what an
                * officer approves is what a visitor sees. The real guidance — supply 3:2,
                * keep the subject centred, both crops come from the middle — is in
                * design/event-image-prompts.md.
                */}
              <div className="relative aspect-[16/10] w-48 shrink-0 overflow-hidden rounded-lg border border-line bg-ink-50">
                {pendingPreview ? (
                  /*
                   * A plain <img>, not next/image. The source is a blob: URL that exists
                   * only in this tab — the optimiser would have to fetch it from the server,
                   * which cannot see it.
                   */
                  <img
                    src={pendingPreview}
                    alt="The picture you have chosen, not yet uploaded"
                    className="size-full object-cover"
                  />
                ) : imageUrl ? (
                  <Image
                    src={imageUrl}
                    alt="The poster for this event"
                    fill
                    sizes="12rem"
                    className="object-cover"
                  />
                ) : (
                  <div aria-hidden="true" className="grid h-full place-items-center">
                    <ImageIcon className="size-6 text-line-strong" strokeWidth={1.5} />
                  </div>
                )}
              </div>

              <div>
                <input
                  ref={fileInput}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      // On a saved event it goes straight up; on a new one it waits for the
                      // id that does not exist yet and rides along with the save.
                      if (editing) void upload.submit(file);
                      else choosePoster(file);
                    }
                    // Cleared so choosing the same file twice still fires a change event.
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="subtle"
                  loading={upload.busy}
                  onClick={() => fileInput.current?.click()}
                  className="px-5 py-2"
                >
                  <Upload className="size-4" aria-hidden="true" />
                  {imageUrl || pendingPreview ? 'Choose a different picture' : 'Choose a picture'}
                </Button>

                {pendingFile && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
                    <span className="font-medium text-body">{pendingFile.name}</span>
                    <span>— uploads when you save.</span>
                  </p>
                )}

                <p className="mt-2 max-w-xs text-sm text-subtle">
                  JPEG, PNG or WebP, up to 10 MB. This one is published to the open web —
                  never upload anything a person gave us in confidence.
                </p>

                {upload.error && (
                  <div className="mt-2">
                    <ErrorAlert error={upload.error} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {imageDeferred && (
          /*
           * The event saved; only the picture did not. Said in that order, because the fear
           * this message exists to answer is "have I lost what I typed" — and an officer who
           * thinks they have will type it all again and create a duplicate.
           */
          <Alert tone="info">
            <strong className="font-semibold">The event is saved.</strong> The picture did not
            upload — open the event and try the picture again. Nothing you typed was lost.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={busy} className="px-6 py-2.5">
            {editing ? 'Save changes' : 'Save as draft'}
          </Button>
          {!editing && (
            <p className="text-sm text-subtle">
              Saved as a draft. You choose when it goes on the website.
            </p>
          )}
        </div>
      </form>

      {/* --- deleting ------------------------------------------------------------- */}
      {editing && can(PERMISSIONS.EVENT_DELETE) && (
        <section className="rounded-xl border border-danger-100 bg-danger-50/40 p-5">
          <h2 className="text-base font-semibold text-body">Delete this event</h2>
          <p className="mt-1 max-w-prose text-sm text-muted">
            It leaves the diary and the public site. The attendance register is kept — those
            rows are the evidence of what the organisation did, and they are not thrown away.
          </p>

          {remove.error && (
            <div className="mt-3">
              <ErrorAlert error={remove.error} />
            </div>
          )}

          <ConfirmDelete busy={remove.busy} onConfirm={() => void remove.submit()} />
        </section>
      )}
    </div>
  );
}

/**
 * Two presses, not a browser `confirm()`.
 *
 * `confirm()` blocks the thread, cannot be styled or translated, and on a phone appears as a
 * system dialog with the site's hostname in it — which reads as a scam to exactly the
 * audience this organisation serves. Two presses in the page is the same protection.
 */
function ConfirmDelete({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <Button variant="subtle" onClick={() => setArmed(true)} className="mt-4 px-5 py-2">
        <Trash2 className="size-4" aria-hidden="true" />
        Delete event
      </Button>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Alert tone="error">Delete this event? It will leave the public site immediately.</Alert>
      <Button variant="subtle" onClick={() => setArmed(false)} className="px-5 py-2">
        Keep it
      </Button>
      <Button loading={busy} onClick={onConfirm} className="px-5 py-2">
        Yes, delete it
      </Button>
    </div>
  );
}

export default EventForm;
