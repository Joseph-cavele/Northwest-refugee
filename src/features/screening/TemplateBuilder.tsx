'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Copy,
  Globe,
  Plus,
  Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useApi } from '@/hooks/useApi';
import { useSubmit } from '@/hooks/useSubmit';
import { Alert, ErrorAlert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  CHOICE_TYPES,
  QUESTION_TYPES,
  QUESTION_TYPE_LABELS,
  TEMPLATE_PURPOSES,
  TEMPLATE_PURPOSE_LABELS,
  createTemplate,
  duplicateTemplate,
  getTemplate,
  setTemplateStatus,
  updateTemplate,
} from '@/api/screening.api';
import type {
  QuestionInput,
  QuestionType,
  SectionInput,
  TemplatePurpose,
} from '@/api/screening.api';
import type { Id } from '@/types/models';

/*
 * Building the questions a screener asks.
 *
 * THE ONE RULE THIS SCREEN MUST NOT BREAK: a question's `key` is round-tripped untouched.
 * Answers are stored against it, so dropping the key when saving an existing question
 * orphans every answer ever given to it — silently, because nothing errors; the answers
 * simply stop matching a question and vanish from the screenings they belong to. Editing a
 * label, a type, or the order is safe. Losing the key is not, and every operation below is
 * written so it cannot happen.
 *
 * REORDERING IS BUTTONS, NOT DRAG AND DROP. Drag needs a pointer, a steady hand and a large
 * screen; two buttons work with a keyboard, a screen reader and a thumb, and this is an
 * office where the tool has to work on whatever is on the desk. `order` is rewritten from
 * the array position on save, so the list a person sees is the list that is stored.
 */

const INPUT =
  'min-h-10 w-full rounded-lg border border-line bg-surface px-3 text-base text-body placeholder:text-subtle hover:border-line-strong focus:border-brand-400';

/** Move an item within an array. Returns a new array; never mutates. */
function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

function QuestionEditor({
  question,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  disabled,
}: {
  question: QuestionInput;
  index: number;
  count: number;
  onChange: (next: QuestionInput) => void;
  onMove: (to: number) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const isChoice = CHOICE_TYPES.includes(question.type);

  return (
    <li className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Question</span>
            <input
              className={INPUT}
              value={question.label}
              onChange={(e) => onChange({ ...question, label: e.target.value })}
              placeholder="Highest education level"
              maxLength={300}
              disabled={disabled}
            />
          </label>
        </div>

        {/* Reorder and remove. See the note above on why these are buttons. */}
        <div className="flex shrink-0 gap-1 pt-6">
          <button
            type="button"
            onClick={() => onMove(index - 1)}
            disabled={disabled || index === 0}
            aria-label={`Move "${question.label || 'question'}" up`}
            className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-line-strong disabled:opacity-40"
          >
            <ArrowUp className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index + 1)}
            disabled={disabled || index === count - 1}
            aria-label={`Move "${question.label || 'question'}" down`}
            className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-line-strong disabled:opacity-40"
          >
            <ArrowDown className="size-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove "${question.label || 'question'}"`}
            className="grid size-9 place-items-center rounded-lg border border-danger-100 text-danger-700 hover:bg-danger-50"
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Type</span>
          <select
            className={INPUT}
            value={question.type}
            onChange={(e) => {
              const type = e.target.value as QuestionType;
              onChange({
                ...question,
                type,
                // Options only mean something on a choice type. Dropped otherwise, so the
                // template never stores a list that nothing will render.
                options: CHOICE_TYPES.includes(type) ? (question.options ?? ['']) : undefined,
              });
            }}
            disabled={disabled}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-muted">Help text (optional)</span>
          <input
            className={INPUT}
            value={question.help ?? ''}
            onChange={(e) => onChange({ ...question, help: e.target.value })}
            maxLength={500}
            disabled={disabled}
          />
        </label>
      </div>

      {isChoice && (
        <div className="mt-3">
          <p className="text-sm font-medium text-muted">Options</p>
          <ul className="mt-2 flex flex-col gap-2">
            {(question.options ?? []).map((option, optionIndex) => (
              <li key={optionIndex} className="flex gap-2">
                <input
                  className={INPUT}
                  value={option}
                  onChange={(e) => {
                    const options = [...(question.options ?? [])];
                    options[optionIndex] = e.target.value;
                    onChange({ ...question, options });
                  }}
                  placeholder={`Option ${optionIndex + 1}`}
                  maxLength={200}
                  disabled={disabled}
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...question,
                      options: (question.options ?? []).filter((_, i) => i !== optionIndex),
                    })
                  }
                  disabled={disabled}
                  aria-label={`Remove option ${optionIndex + 1}`}
                  className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-muted hover:border-line-strong"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          <Button
            variant="subtle"
            className="mt-2 px-4 py-1.5"
            onClick={() => onChange({ ...question, options: [...(question.options ?? []), ''] })}
            disabled={disabled}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add option
          </Button>
        </div>
      )}

      <label className="mt-3 flex items-center gap-2 text-base text-body">
        <input
          type="checkbox"
          checked={question.required ?? false}
          onChange={(e) => onChange({ ...question, required: e.target.checked })}
          className="size-4 rounded border-line"
          disabled={disabled}
        />
        Must be answered
      </label>
      {question.required && (
        /*
         * Said at the point of the decision, because it is the one setting here that can stop
         * a person being screened at all.
         */
        <p className="mt-1 text-sm text-subtle">
          A screener cannot finish the form without this. Only mark it required if a blank
          genuinely stops the decision being made — people arrive without documents, without
          an address, and sometimes without a date of birth they are sure of.
        </p>
      )}
    </li>
  );
}

export function TemplateBuilder({ id }: { id?: Id }) {
  const router = useRouter();
  const editing = Boolean(id);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [purpose, setPurpose] = useState<TemplatePurpose>('PROGRAMME');
  const [sections, setSections] = useState<SectionInput[]>([]);
  const [documentTypes, setDocumentTypes] = useState<{ key?: string; label: string; required?: boolean }[]>([]);
  const [status, setStatus] = useState<'DRAFT' | 'PUBLISHED' | 'ARCHIVED'>('DRAFT');
  const [version, setVersion] = useState(1);
  const [loaded, setLoaded] = useState(!editing);

  const { loading, error, reload } = useApi(
    useCallback(
      async (signal: AbortSignal) => {
        if (!id) return null;
        const template = await getTemplate(id, signal);
        /*
         * Seeded once, and every key comes across untouched — see the note at the top of the
         * file. This is the moment the round trip either works or quietly destroys answers.
         */
        setName(template.name);
        setDescription(template.description);
        setPurpose(template.purpose);
        setStatus(template.status);
        setVersion(template.version);
        setSections(
          template.sections.map((s) => ({
            key: s.key,
            title: s.title,
            description: s.description,
            questions: s.questions.map((q) => ({
              key: q.key,
              label: q.label,
              help: q.help,
              type: q.type,
              required: q.required,
              ...(q.options ? { options: q.options } : {}),
            })),
          }))
        );
        setDocumentTypes(
          template.documentTypes.map((d) => ({ key: d.key, label: d.label, required: d.required }))
        );
        setLoaded(true);
        return template;
      },
      [id]
    ),
    [id]
  );

  const save = useSubmit(
    async () => {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        purpose,
        // `order` is written from the array position, so what is on screen is what is stored.
        sections: sections.map((section, i) => ({
          ...section,
          order: i,
          questions: section.questions.map((question, j) => ({
            ...question,
            order: j,
            options: CHOICE_TYPES.includes(question.type)
              ? (question.options ?? []).filter((o) => o.trim() !== '')
              : undefined,
          })),
        })),
        documentTypes: documentTypes.filter((d) => d.label.trim() !== ''),
      };
      return id ? updateTemplate(id, payload) : createTemplate(payload);
    },
    {
      onSuccess: (saved) => {
        if (!id) router.replace(`/dashboard/screening-templates/${saved._id}`);
        else reload();
        router.refresh();
      },
    }
  );

  const publish = useSubmit(
    async (next: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED') => setTemplateStatus(id!, next),
    { onSuccess: (updated) => setStatus(updated.status) }
  );

  const copy = useSubmit(async () => duplicateTemplate(id!), {
    onSuccess: (made) => router.push(`/dashboard/screening-templates/${made._id}`),
  });

  if (editing && loading && !loaded) {
    return <Spinner label="Loading the template" className="py-24" />;
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

  const questionCount = sections.reduce((n, s) => n + s.questions.length, 0);

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <Link
        href="/dashboard/screening-templates"
        className="inline-flex w-fit items-center gap-1.5 text-base text-muted underline-offset-2 hover:text-brand-600 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        All templates
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-body">
            {editing ? 'Edit screening form' : 'New screening form'}
          </h1>
          <p className="mt-1 max-w-prose text-base text-muted">
            The questions a screener asks. Attach it to a programme, and it loads
            automatically when somebody applies for that programme.
          </p>
        </div>
        {editing && (
          <span className="rounded-full bg-ink-100 px-3 py-1 text-sm font-semibold text-ink-600">
            {status === 'PUBLISHED' ? `In use · v${version}` : status === 'DRAFT' ? 'Draft' : 'Archived'}
          </span>
        )}
      </header>

      {editing && status === 'PUBLISHED' && (
        /*
         * The thing an administrator most needs to know before editing a live form, and the
         * reason it is safe to do so at all.
         */
        <Alert tone="info">
          <strong className="font-semibold">This form is in use.</strong> Screenings already
          taken keep their own copy of the questions, so editing here cannot change what
          anybody was asked. New screenings get the new wording, and the version number goes up.
        </Alert>
      )}

      {save.error && <ErrorAlert error={save.error} />}
      {publish.error && <ErrorAlert error={publish.error} />}

      <section className="rounded-xl border border-line bg-surface p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-muted">Name</span>
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Skills programme screening"
              maxLength={150}
              disabled={save.busy}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">What it is for</span>
            <select
              className={INPUT}
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as TemplatePurpose)}
              disabled={save.busy}
            >
              {TEMPLATE_PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {TEMPLATE_PURPOSE_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-muted">Description (optional)</span>
            <input
              className={INPUT}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              disabled={save.busy}
            />
          </label>
        </div>
      </section>

      {/* --- sections and questions ------------------------------------------------- */}
      {sections.map((section, sectionIndex) => (
        <section key={section.key ?? sectionIndex} className="rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start gap-3">
            <label className="min-w-0 flex-1">
              <span className="text-sm font-medium text-muted">Section</span>
              <input
                className={cn(INPUT, 'mt-1.5')}
                value={section.title}
                onChange={(e) => {
                  const next = [...sections];
                  next[sectionIndex] = { ...section, title: e.target.value };
                  setSections(next);
                }}
                placeholder="Education"
                maxLength={200}
                disabled={save.busy}
              />
            </label>
            <div className="flex shrink-0 gap-1 pt-6">
              <button
                type="button"
                onClick={() => setSections(move(sections, sectionIndex, sectionIndex - 1))}
                disabled={save.busy || sectionIndex === 0}
                aria-label={`Move section "${section.title || 'section'}" up`}
                className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-line-strong disabled:opacity-40"
              >
                <ArrowUp className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setSections(move(sections, sectionIndex, sectionIndex + 1))}
                disabled={save.busy || sectionIndex === sections.length - 1}
                aria-label={`Move section "${section.title || 'section'}" down`}
                className="grid size-9 place-items-center rounded-lg border border-line text-muted hover:border-line-strong disabled:opacity-40"
              >
                <ArrowDown className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setSections(sections.filter((_, i) => i !== sectionIndex))}
                disabled={save.busy}
                aria-label={`Remove section "${section.title || 'section'}"`}
                className="grid size-9 place-items-center rounded-lg border border-danger-100 text-danger-700 hover:bg-danger-50"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <ul className="mt-4 flex flex-col gap-3">
            {section.questions.map((question, questionIndex) => (
              <QuestionEditor
                key={question.key ?? questionIndex}
                question={question}
                index={questionIndex}
                count={section.questions.length}
                disabled={save.busy}
                onChange={(next) => {
                  const copySections = [...sections];
                  const questions = [...section.questions];
                  questions[questionIndex] = next;
                  copySections[sectionIndex] = { ...section, questions };
                  setSections(copySections);
                }}
                onMove={(to) => {
                  const copySections = [...sections];
                  copySections[sectionIndex] = {
                    ...section,
                    questions: move(section.questions, questionIndex, to),
                  };
                  setSections(copySections);
                }}
                onRemove={() => {
                  const copySections = [...sections];
                  copySections[sectionIndex] = {
                    ...section,
                    questions: section.questions.filter((_, i) => i !== questionIndex),
                  };
                  setSections(copySections);
                }}
              />
            ))}
          </ul>

          <Button
            variant="subtle"
            className="mt-3 px-5 py-2"
            disabled={save.busy}
            onClick={() => {
              const copySections = [...sections];
              copySections[sectionIndex] = {
                ...section,
                // No key: this is new, and the server mints one.
                questions: [...section.questions, { label: '', type: 'SHORT_TEXT', required: false }],
              };
              setSections(copySections);
            }}
          >
            <Plus className="size-4" aria-hidden="true" />
            Add question
          </Button>
        </section>
      ))}

      <Button
        variant="subtle"
        className="self-start px-5 py-2"
        disabled={save.busy}
        onClick={() => setSections([...sections, { title: '', description: '', questions: [] }])}
      >
        <Plus className="size-4" aria-hidden="true" />
        Add section
      </Button>

      {/* --- the document checklist -------------------------------------------------- */}
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-body">Documents to ask about</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          A checklist, not a requirement. A screener records what was produced and what was
          not — &ldquo;does not have it&rdquo; is a real answer, and the ordinary one.
        </p>

        <ul className="mt-3 flex flex-col gap-2">
          {documentTypes.map((doc, index) => (
            <li key={doc.key ?? index} className="flex gap-2">
              <input
                className={INPUT}
                value={doc.label}
                onChange={(e) => {
                  const next = [...documentTypes];
                  next[index] = { ...doc, label: e.target.value };
                  setDocumentTypes(next);
                }}
                placeholder="ID / passport / permit"
                maxLength={150}
                disabled={save.busy}
              />
              <button
                type="button"
                onClick={() => setDocumentTypes(documentTypes.filter((_, i) => i !== index))}
                disabled={save.busy}
                aria-label={`Remove "${doc.label || 'document'}"`}
                className="grid size-10 shrink-0 place-items-center rounded-lg border border-line text-muted hover:border-line-strong"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>

        <Button
          variant="subtle"
          className="mt-2 px-4 py-1.5"
          disabled={save.busy}
          onClick={() => setDocumentTypes([...documentTypes, { label: '' }])}
        >
          <Plus className="size-4" aria-hidden="true" />
          Add document
        </Button>
      </section>

      {/* --- saving and publishing ----------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          loading={save.busy}
          disabled={name.trim() === ''}
          onClick={() => void save.submit()}
          className="px-6 py-2.5"
        >
          {editing ? 'Save changes' : 'Create form'}
        </Button>

        {editing && status === 'DRAFT' && (
          <Button
            variant="subtle"
            loading={publish.busy}
            disabled={questionCount === 0}
            onClick={() => void publish.submit('PUBLISHED')}
            className="px-5 py-2"
          >
            <Globe className="size-4" aria-hidden="true" />
            Publish
          </Button>
        )}
        {editing && status === 'PUBLISHED' && (
          <Button
            variant="subtle"
            loading={publish.busy}
            onClick={() => void publish.submit('ARCHIVED')}
            className="px-5 py-2"
          >
            Archive
          </Button>
        )}
        {editing && (
          <Button variant="subtle" loading={copy.busy} onClick={() => void copy.submit()} className="px-5 py-2">
            <Copy className="size-4" aria-hidden="true" />
            Duplicate
          </Button>
        )}

        {questionCount === 0 && editing && status === 'DRAFT' && (
          <p className="text-sm text-subtle">Add a question before publishing.</p>
        )}
      </div>
    </div>
  );
}

export default TemplateBuilder;
